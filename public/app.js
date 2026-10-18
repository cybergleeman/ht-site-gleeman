const view = document.getElementById("view");
const statusEl = document.getElementById("status");

const state = {
  docs: [],
  byId: new Map(),
  stories: [],
  chat: [],
  uploading: false,
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------- boot ---------------- */

async function boot() {
  try {
    const [docs, stories] = await Promise.all([
      fetch("/data/docs.json").then((r) => r.json()),
      fetch("/data/stories.json").then((r) => r.json()),
    ]);
    state.docs = docs;
    docs.forEach((d) => state.byId.set(d.id, d));
    state.stories = (stories.entries || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    statusEl.textContent = `${docs.length} 篇资料 · ${state.stories.length} 条编年`;
  } catch (e) {
    statusEl.textContent = "数据加载失败：" + e.message;
  }
  window.addEventListener("hashchange", () => {
    window.scrollTo({ top: 0 });
    render();
  });
  render();
}

/* ---------------- routing ---------------- */

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (!raw) return { name: "home" };
  if (raw === "battle/library") return { name: "library" };
  if (raw.startsWith("battle/library/")) {
    let doc = raw.slice("battle/library/".length);
    try {
      doc = decodeURIComponent(doc);
    } catch {
      /* keep raw */
    }
    return { name: "library", doc };
  }
  if (raw === "battle/sage") return { name: "sage" };
  if (raw === "battle/upload") return { name: "upload" };
  if (raw === "story") return { name: "story" };
  if (raw.startsWith("story/")) {
    let id = raw.slice("story/".length);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    return { name: "storyDetail", id };
  }
  return { name: "home" };
}

function setNav(name) {
  document.querySelectorAll(".nav a").forEach((a) => {
    const href = a.getAttribute("href");
    const map = {
      home: "",
      library: "#/battle/library",
      sage: "#/battle/sage",
      upload: "#/battle/upload",
      story: "#/story",
      storyDetail: "#/story",
    };
    a.classList.toggle("active", href === map[name]);
  });
}

function render() {
  const r = route();
  setNav(r.name);
  if (r.name === "home") return renderHome();
  if (r.name === "library") return renderLibrary(r.doc);
  if (r.name === "sage") return renderSage();
  if (r.name === "upload") return renderUpload();
  if (r.name === "story") return renderStory();
  if (r.name === "storyDetail") return renderStoryDetail(r.id);
  renderHome();
}

/* ---------------- home ---------------- */

function renderHome() {
  const docs = state.docs.length;
  const entries = state.stories.length;
  view.innerHTML = `
  <section class="hero">
    <h1>把 Hattrick 的<em>规则</em>和<em>经历</em><br>收进同一个地方</h1>
    <p>左边是查得到的机制：${docs} 篇玩家解析稿，从 500 页全集到 2020 手册。右边是留得住的经历：球员的成长、与人交手、以及还没写下来的回忆。</p>
  </section>

  <section class="blocks">
    <article class="block">
      <div class="badge">${docs} 篇</div>
      <div class="kicker">BLOCK 01</div>
      <h2>HT 的战斗</h2>
      <p class="desc">规则不写在说明书里，是玩家一条条试出来的。这里把它们存下来，能查、能问。</p>
      <div class="links">
        <a href="#/battle/library"><span class="num">01</span>资料库<span class="sub">查阅原文</span></a>
        <a href="#/battle/upload"><span class="num">02</span>上传入口<span class="sub">新资料入库</span></a>
        <a href="#/battle/sage"><span class="num">03</span>HT 贤者<span class="sub">基于资料答疑</span></a>
      </div>
    </article>

    <article class="block">
      <div class="badge">${entries} 条</div>
      <div class="kicker">BLOCK 02</div>
      <h2>HT 的故事</h2>
      <p class="desc">球员练成什么样、和谁踢过、谁讲过什么。按时间排成编年体，点开能看原文。</p>
      <div class="links">
        <a href="#/story"><span class="num">01</span>编年史<span class="sub">按时间线</span></a>
        <a href="#/story"><span class="num">02</span>球员列传<span class="sub">谁练成了什么</span></a>
        <a href="#/story"><span class="num">03</span>回忆与交手<span class="sub">待补充</span></a>
      </div>
    </article>
  </section>`;
}

/* ---------------- library ---------------- */

function renderLibrary(docId) {
  const groups = [];
  const index = new Map();
  for (const d of state.docs) {
    if (!index.has(d.group)) {
      index.set(d.group, []);
      groups.push(d.group);
    }
    index.get(d.group).push(d);
  }

  const active = state.byId.get(docId) || state.docs.find((d) => d.id === "INDEX") || state.docs[0];

  view.innerHTML = `
  <div class="lib">
    <aside class="sidebar">
      <input class="search" id="docSearch" placeholder="筛选标题…" autocomplete="off">
      <div class="doclist" id="doclist"></div>
    </aside>
    <article class="article" id="article">
      <div class="doc-head">
        <span class="crumb">${esc(active ? active.group : "")}</span>
        <span class="wordcount">${active ? active.words.toLocaleString() + " 字" : ""}</span>
      </div>
      ${active ? active.html : '<p class="empty">资料库还是空的。</p>'}
    </article>
  </div>`;

  const list = document.getElementById("doclist");
  const draw = (filter = "") => {
    const q = filter.trim().toLowerCase();
    list.innerHTML = groups
      .map((g) => {
        const items = index
          .get(g)
          .filter((d) => !q || d.title.toLowerCase().includes(q))
          .map(
            (d) =>
              `<a href="#/battle/library/${encodeURIComponent(d.id)}" class="${d.id === (active && active.id) ? "active" : ""}" title="${esc(d.title)}">${esc(d.title)}</a>`
          )
          .join("");
        return items ? `<div class="group-title">${esc(g)}</div>${items}` : "";
      })
      .join("");
  };
  draw();
  const search = document.getElementById("docSearch");
  if (search) search.addEventListener("input", (e) => draw(e.target.value));

  // keep the sidebar scrolled to the active doc
  const current = list.querySelector("a.active");
  if (current && current.scrollIntoView) current.scrollIntoView({ block: "center" });
}

/* ---------------- sage ---------------- */

function renderSage() {
  view.innerHTML = `
  <div class="sage-wrap">
    <div class="page-head">
      <h1>HT 贤者</h1>
      <p class="sage-intro">先检索资料库，再让模型<strong>只依据这些原文</strong>作答。答不上来会直说，不编。关键结论带编号，点开能回到原文。</p>
    </div>
    <div class="chat" id="chat"></div>
    <div class="composer">
      <textarea id="q" placeholder="例如：21 岁球员从防守 10 练到 11，大概要几周？（Enter 发送，Shift+Enter 换行）"></textarea>
      <button class="btn" id="send">提问</button>
    </div>
  </div>`;

  const chat = document.getElementById("chat");
  const input = document.getElementById("q");
  const send = document.getElementById("send");

  const drawChat = () => {
    chat.innerHTML =
      state.chat
        .map((m) => {
          if (m.role === "user") {
            return `<div class="msg user"><div class="avatar">你</div><div class="bubble"><p>${esc(m.text)}</p></div></div>`;
          }
          const sources = (m.sources || [])
            .map(
              (s, i) =>
                `<a href="#/battle/library/${encodeURIComponent(s.doc)}">[${i + 1}] 《${esc(s.title)}》· ${esc(s.heading)}</a>`
            )
            .join("");
          return `<div class="msg sage"><div class="avatar">贤</div><div class="bubble">
            <p>${esc(m.text).replace(/\n/g, "<br>")}</p>
            ${sources ? `<div class="sources"><div class="sources-title">资料来源</div>${sources}</div>` : ""}
          </div></div>`;
        })
        .join("") || `<p class="empty">还没有提问。资料库里的规则、数值、战术，都可以问。</p>`;
  };
  drawChat();

  let busy = false;
  const submit = async () => {
    const q = input.value.trim();
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    input.value = "";
    state.chat.push({ role: "user", text: q });
    state.chat.push({ role: "sage", text: "检索中…" });
    drawChat();
    chat.lastElementChild.scrollIntoView({ block: "end" });
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      state.chat[state.chat.length - 1] = {
        role: "sage",
        text: data.answer || data.error || "没有返回内容",
        sources: data.sources || [],
      };
    } catch (e) {
      state.chat[state.chat.length - 1] = { role: "sage", text: "请求失败：" + e.message, sources: [] };
    }
    busy = false;
    send.disabled = false;
    drawChat();
    chat.lastElementChild.scrollIntoView({ block: "end" });
  };

  send.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.focus();
}

/* ---------------- upload ---------------- */

function renderUpload() {
  view.innerHTML = `
  <div class="page-head">
    <h1>上传入口</h1>
    <p>把新找到的资料、自己的笔记、截图丢进来。文件先进 <code>content/uploads/</code>，再由我整理成条目。</p>
  </div>
  <div class="upload-card">
    <div class="dropzone" id="drop">
      <strong>把文件拖到这里，或点击选择</strong>
      支持 txt / md / docx / xlsx / pdf / 图片，单个不超过 12MB
    </div>
    <input type="file" id="file" multiple hidden>
    <p class="note">公网部署时，服务器磁盘是临时的：重启或重新部署后上传的文件会丢。长期保存请让我把它并入资料库（提交进仓库）。</p>
    <div class="uplist" id="uplist"><p class="empty">载入中…</p></div>
  </div>`;

  const drop = document.getElementById("drop");
  const fileInput = document.getElementById("file");
  const uplist = document.getElementById("uplist");

  const loadList = async () => {
    try {
      const data = await fetch("/api/uploads").then((r) => r.json());
      const rows = (data.uploads || [])
        .map(
          (u) =>
            `<div class="uprow"><span class="name">${esc(u.original)}</span><span class="meta">${(u.size / 1024).toFixed(1)} KB</span><span class="meta">${esc(u.at.slice(0, 10))}</span></div>`
        )
        .join("");
      uplist.innerHTML = rows || `<p class="empty">还没有上传记录。</p>`;
    } catch {
      uplist.innerHTML = `<p class="empty">无法读取上传记录。</p>`;
    }
  };
  loadList();

  const sendFile = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] || "";
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, data: base64 }),
          });
          resolve(await res.json());
        } catch (e) {
          resolve({ error: e.message });
        }
      };
      reader.readAsDataURL(file);
    });

  const handle = async (files) => {
    if (!files || !files.length) return;
    drop.innerHTML = `<strong>上传中…</strong>`;
    const results = [];
    for (const f of files) results.push(await sendFile(f));
    const failed = results.filter((r) => r.error);
    drop.innerHTML = `<strong>完成</strong>${failed.length ? `${failed.length} 个失败` : "全部上传成功"}`;
    loadList();
  };

  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handle(e.target.files));
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("over");
    })
  );
  drop.addEventListener("drop", (e) => handle(e.dataTransfer.files));
}

/* ---------------- story ---------------- */

function renderStory() {
  const items = state.stories
    .map(
      (s) => `
    <div class="titem">
      <a href="#/story/${encodeURIComponent(s.id)}">
        <div class="tmeta"><span>${esc(s.date)}</span><span class="ttag">${esc(s.tag || "记录")}</span></div>
        <div class="ttitle">${esc(s.title)}</div>
        <p class="tsummary">${esc(s.summary || "")}</p>
      </a>
    </div>`
    )
    .join("");
  view.innerHTML = `
  <div class="page-head">
    <h1>编年史</h1>
    <p>球员的成长、与人的交手、还记得的往事。按时间倒序排列，每条都能点开看正文和原始记录。</p>
  </div>
  <div class="timeline">${items || '<p class="empty">还没有记录。</p>'}</div>`;
}

function renderStoryDetail(id) {
  const s = state.stories.find((x) => x.id === id);
  if (!s) {
    view.innerHTML = `<div class="page-head"><h1>找不到这条记录</h1><p><a href="#/story">返回编年史</a></p></div>`;
    return;
  }
  const body = (s.body || "").split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
  view.innerHTML = `
  <div class="detail">
    <div class="tmeta"><span>${esc(s.date)}</span><span class="ttag">${esc(s.tag || "记录")}</span></div>
    <h1>${esc(s.title)}</h1>
    <p class="tsummary">${esc(s.summary || "")}</p>
    <div class="body">${body}</div>
    <details class="raw">
      <summary>查看原始记录（${esc(s.source || "来源未标注")}）</summary>
      <pre>${esc(s.raw || "无")}</pre>
    </details>
    <p style="margin-top:26px"><a href="#/story">← 返回编年史</a></p>
  </div>`;
}

boot();
