import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(PUBLIC, "data");
const UPLOADS = path.join(ROOT, "content", "uploads");
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const API_BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

fs.mkdirSync(UPLOADS, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/* ---------------- index ---------------- */

const docs = JSON.parse(fs.readFileSync(path.join(DATA, "docs.json"), "utf8"));
const chunks = JSON.parse(fs.readFileSync(path.join(DATA, "search.json"), "utf8"));

const STOP = new Set(["的", "了", "是", "在", "和", "有", "我", "你", "他", "这", "那", "什么", "怎么", "如何", "一个", "可以", "是否", "请问", "一下"]);

function tokens(text) {
  const t = text.toLowerCase();
  const out = [];
  for (const w of t.match(/[a-z0-9_]{2,}/g) || []) out.push(w);
  const cjk = (t.match(/[\u4e00-\u9fff]+/g) || []).join("");
  for (let i = 0; i < cjk.length - 1; i++) out.push(cjk.slice(i, i + 2));
  return out.filter((x) => !STOP.has(x));
}

const df = new Map();
for (const c of chunks) {
  for (const t of new Set(tokens(c.title + " " + c.heading + " " + c.text))) {
    df.set(t, (df.get(t) || 0) + 1);
  }
}
const N = chunks.length;

function retrieve(question, k = 8) {
  const qTokens = tokens(question);
  if (!qTokens.length) return [];
  const qSet = new Set(qTokens);
  const scored = [];
  for (const c of chunks) {
    const body = c.title + " " + c.heading + " " + c.text;
    const toks = tokens(body);
    if (!toks.length) continue;
    const tf = new Map();
    for (const t of toks) if (qSet.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const [t, n] of tf) {
      const idf = Math.log(1 + N / (1 + (df.get(t) || 0)));
      score += (1 + Math.log(n)) * idf;
    }
    if (!score) continue;
    // 标题命中给额外权重（章节标题往往就是问题的答案所在）
    let titleHit = 0;
    for (const t of qSet) if (c.title.toLowerCase().includes(t) || c.heading.toLowerCase().includes(t)) titleHit++;
    score *= 1 + 0.35 * titleHit;
    // exact-substring bonus for longer queries
    if (question.length >= 4 && body.includes(question)) score *= 1.6;
    score /= Math.sqrt(toks.length / 80 + 1);
    scored.push({ ...c, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // keep diversity: max 2 chunks per doc
  const out = [];
  const perDoc = new Map();
  for (const s of scored) {
    const n = perDoc.get(s.doc) || 0;
    if (n >= 2) continue;
    perDoc.set(s.doc, n + 1);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

/* ---------------- ask ---------------- */

const SYSTEM = `你是「HT 贤者」，一个 Hattrick（hattrick.org 在线足球经理）规则顾问。
规则：只依据【资料片段】回答，不得引入片段之外的“常识”或不存在的数字。
- 片段不足以回答时，直说「资料库里没有这条」，并说明还缺什么。
- 每个关键结论后用 [编号] 标注来源。
- 注意片段里的状态标记：✅ 已确认、🟡 待确认、⚪ 待核实。回答时要如实转述可信度，不要把待确认说成定论。
- 数值结论必须带前提（年龄段、训练类型、教练、联赛级别等）。
- 用中文回答，简洁、分点，不要复述资料原文的整段。`;

async function askLLM(question, hits) {
  const context = hits
    .map((h, i) => `[${i + 1}] 《${h.title}》｜${h.heading}\n${h.text}`)
    .join("\n\n");
  const body = {
    model: MODEL,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `【资料片段】\n${context}\n\n【问题】\n${question}` },
    ],
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`模型接口 ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function retrievalAnswer(question, hits) {
  if (!hits.length) {
    return "资料库里没有检索到相关内容。可以换个说法，或先把相关资料上传到「上传入口」。";
  }
  const lines = hits.map((h, i) => `${i + 1}. 《${h.title}》· ${h.heading}\n${h.text.slice(0, 240)}…`);
  return `（当前未配置模型密钥，先给出资料库里的原文线索）\n\n${lines.join("\n\n")}`;
}

/* ---------------- http ---------------- */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on("data", (d) => {
      size += d.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      parts.push(d);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

const rate = new Map();
function limited(ip) {
  const now = Date.now();
  const rec = rate.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) {
    rec.t = now;
    rec.n = 0;
  }
  rec.n++;
  rate.set(ip, rec);
  return rec.n > 40;
}

async function handleAsk(req, res) {
  const ip = req.socket.remoteAddress || "?";
  if (limited(ip)) return json(res, 429, { error: "请求太频繁，稍等一下" });
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8"));
  } catch {
    return json(res, 400, { error: "请求格式错误" });
  }
  const question = String(payload.question || "").trim().slice(0, 500);
  if (!question) return json(res, 400, { error: "问题为空" });

  const hits = retrieve(question, 6);
  const sources = hits.map((h) => ({
    title: h.title,
    heading: h.heading,
    doc: h.doc,
    excerpt: h.text.slice(0, 300),
  }));

  if (!API_KEY) {
    return json(res, 200, { mode: "retrieval", answer: retrievalAnswer(question, hits), sources });
  }
  try {
    const answer = await askLLM(question, hits);
    json(res, 200, { mode: "llm", answer, sources });
  } catch (e) {
    json(res, 200, {
      mode: "retrieval",
      answer: `模型调用失败（${e.message}），先给你资料原文：\n\n${retrievalAnswer(question, hits)}`,
      sources,
    });
  }
}

async function handleUpload(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    return json(res, 400, { error: "请求格式错误或文件过大（上限 12MB）" });
  }
  const original = String(payload.filename || "upload.bin");
  const base64 = String(payload.data || "");
  if (!base64) return json(res, 400, { error: "没有文件内容" });

  const safe = original.replace(/[^\w.\-\u4e00-\u9fff]/g, "_").slice(-120);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const name = `${stamp}-${safe}`;
  const buf = Buffer.from(base64, "base64");
  if (buf.length > 12 * 1024 * 1024) return json(res, 413, { error: "文件超过 12MB" });
  fs.writeFileSync(path.join(UPLOADS, name), buf);

  const manifestPath = path.join(UPLOADS, "index.json");
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = [];
    }
  }
  manifest.unshift({ name, original, size: buf.length, at: new Date().toISOString() });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  json(res, 200, { ok: true, name, size: buf.length });
}

function listUploads(res) {
  const manifestPath = path.join(UPLOADS, "index.json");
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      manifest = [];
    }
  }
  json(res, 200, { uploads: manifest });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    fs.createReadStream(file).pipe(res);
    return;
  }
  // SPA fallback
  res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
  fs.createReadStream(path.join(PUBLIC, "index.html")).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  try {
    if (p === "/api/health") return json(res, 200, { ok: true, docs: docs.length, chunks: chunks.length, llm: Boolean(API_KEY) });
    if (p === "/api/ask" && req.method === "POST") return await handleAsk(req, res);
    if (p === "/api/upload" && req.method === "POST") return await handleUpload(req, res);
    if (p === "/api/uploads" && req.method === "GET") return listUploads(res);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, p);
    return json(res, 405, { error: "method not allowed" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HT 档案馆 running at http://127.0.0.1:${PORT}  (docs=${docs.length}, chunks=${chunks.length}, llm=${API_KEY ? "on" : "off"})`);
});
