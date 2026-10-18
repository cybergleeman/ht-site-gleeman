import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WIKI = path.resolve(ROOT, "..", "hattrick-wiki");
const CONTENT = path.join(ROOT, "content");
const DATA = path.join(ROOT, "public", "data");

const COPY_DIRS = ["rules", "basics", "training", "match", "economy", "youth", "competition", "meta"];
const COPY_FILES = ["INDEX.md", "INVENTORY.md"];

const GROUP_NAMES = {
  rules: "规则原文",
  basics: "基础设定",
  training: "训练",
  match: "比赛",
  economy: "经济",
  youth: "青训",
  competition: "赛事",
  meta: "速查与待办",
  root: "总览",
};

/* ---------------- content sync ---------------- */

function syncContent() {
  if (!fs.existsSync(WIKI)) {
    console.log("[build] no ../hattrick-wiki found, using committed content/");
    return;
  }
  fs.mkdirSync(CONTENT, { recursive: true });
  for (const d of COPY_DIRS) {
    const src = path.join(WIKI, d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(CONTENT, d), { recursive: true });
  }
  for (const f of COPY_FILES) {
    const src = path.join(WIKI, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(CONTENT, f));
  }
  console.log("[build] content synced from hattrick-wiki");
}

/* ---------------- markdown ---------------- */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let CTX = "";

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    if (/\.md$/i.test(href) && !/^[a-z]+:/i.test(href)) {
      const target = path.posix
        .normalize(path.posix.join(path.posix.dirname(CTX), href))
        .replace(/\.md$/i, "");
      return `<a href="#/battle/library/${encodeURIComponent(target)}">${label}</a>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return t;
}

const isTableSep = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes("-");
const isHeading = (l) => /^(#{1,6})\s+/.test(l);

function mdToHtml(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // table: consecutive lines containing "|" (extracted tables have no --- separator)
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") && !isHeading(lines[i + 1])) {
      const splitRow = (l) => {
        const cells = l.split("|").map((c) => c.trim());
        while (cells.length && cells[0] === "") cells.shift();
        while (cells.length && cells[cells.length - 1] === "") cells.pop();
        return cells;
      };
      const rows = [splitRow(line)];
      i++;
      if (isTableSep(lines[i])) i++;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() && !isHeading(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      let html = "<div class=\"table-wrap\"><table>";
      html += "<thead><tr>" + rows[0].map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
      for (const r of rows.slice(1)) {
        html += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
      }
      html += "</tbody></table></div>";
      out.push(html);
      continue;
    }

    // heading
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      out.push(`<h${lvl} id="${slug(hm[2])}">${inline(hm[2])}</h${lvl}>`);
      i++;
      continue;
    }

    // hr
    if (/^\s*---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${mdToHtml(buf.join("\n"))}</blockquote>`);
      continue;
    }

    // list
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join("") + `</${tag}>`);
      continue;
    }

    // paragraph: these extracted documents have no blank lines, one line = one paragraph
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join("\n");
}

function slug(s) {
  return s.trim().replace(/[\s]+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
}

function mdToText(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_`>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- build ---------------- */

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function build() {
  syncContent();
  const files = walk(CONTENT).filter((f) => !f.includes(`${path.sep}uploads${path.sep}`));
  const docs = [];
  const chunks = [];

  for (const file of files) {
    const rel = path.relative(CONTENT, file).split(path.sep).join("/");
    const id = rel.replace(/\.md$/, "");
    const raw = fs.readFileSync(file, "utf8");
    const titleMatch = raw.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(file, ".md");
    const top = id.includes("/") ? id.split("/")[0] : "root";
    const group = GROUP_NAMES[top] || top;
    const body = titleMatch ? raw.replace(/^#\s+.+\n?/, "") : raw;
    CTX = id;
    const html = mdToHtml(body);
    docs.push({ id, title, group, path: rel, html, words: mdToText(body).length });

    // split into chunks by headings
    const sections = body.split(/\n(?=#{1,3}\s)/);
    for (const sec of sections) {
      const text = mdToText(sec);
      if (text.length < 30) continue;
      const hm = sec.match(/^(#{1,3})\s+(.+)$/m);
      const heading = hm ? hm[2].trim() : title;
      for (let start = 0; start < text.length; start += 380) {
        const piece = text.slice(start, start + 560);
        if (piece.length < 30) continue;
        chunks.push({ doc: id, title, heading, text: piece });
      }
    }
  }

  docs.sort((a, b) => (a.group + a.id).localeCompare(b.group + b.id, "zh"));
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, "docs.json"), JSON.stringify(docs), "utf8");
  fs.writeFileSync(path.join(DATA, "search.json"), JSON.stringify(chunks), "utf8");

  // stories
  const seed = path.join(ROOT, "data-src", "stories.json");
  let stories = { entries: [] };
  if (fs.existsSync(seed)) stories = JSON.parse(fs.readFileSync(seed, "utf8"));
  stories.entries.sort((a, b) => (a.date < b.date ? 1 : -1));
  fs.writeFileSync(path.join(DATA, "stories.json"), JSON.stringify(stories), "utf8");

  console.log(`[build] ${docs.length} docs, ${chunks.length} chunks, ${stories.entries.length} story entries`);
}
build();
