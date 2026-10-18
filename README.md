# HT 战斗与故事

个人 Hattrick 站点，两大块：

- **HT 的战斗**：资料库（原文查阅）、上传入口、HT 贤者（检索 + 模型答疑）
- **HT 的故事**：编年史（球员成长、交手、回忆），每条可展开看原文

零依赖：只用 Node 内置模块，不需要 `npm install`。

## 本地运行

```bash
node build.mjs      # 从 content/ 生成 public/data/*.json
node server.mjs     # http://127.0.0.1:8787
```

`build.mjs` 会优先从 `../hattrick-wiki/` 同步内容（开发时改 wiki 即可），没有该目录时直接使用已提交的 `content/`。

配置贤者（可选）：

```bash
# Windows PowerShell
$env:DEEPSEEK_API_KEY = "sk-..."
node server.mjs
```

没有 key 时，「贤者」退化为纯检索：返回资料库原文片段和出处。

## 数据从哪来

| 目录 | 作用 |
| --- | --- |
| `content/` | 站点内容（从 `hattrick-wiki` 同步的 markdown） |
| `content/uploads/` | 上传入口存文件的地方 |
| `data-src/stories.json` | 编年史条目 |
| `public/data/` | 构建产物（docs / search / stories），会被 `build.mjs` 覆盖 |

改完内容后重新跑 `node build.mjs`，再重启服务。

## 部署到 Render

1. 把 `ht-site/` 推到一个 GitHub 仓库。
2. Render → New → Web Service → 选该仓库，Runtime 选 **Docker**。
3. Environment 里加 `DEEPSEEK_API_KEY`（值填 DeepSeek 的 key）。
4. Deploy，拿到 `https://<name>.onrender.com`。

也可以用 Blueprint：仓库里有 `render.yaml`，Render 会直接读取。

> 免费实例会休眠，首次访问要等十几秒唤醒。

## 已知限制

- **上传的文件不会持久化**：Render 免费实例的磁盘是临时的，重启 / 重新部署即丢失。要长期保存，把文件提交进仓库的 `content/`。
- 资料库目前只含 2020 手册 23 章和主题条目；500 页 2016 版还在 `hattrick-wiki/_extracted/` 里，待拆分后并入。
- 资料库中的译稿（500 页全集、2020 手册）版权归原作者，公网可访问请自行评估。
