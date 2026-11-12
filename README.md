# 英文点读 · English Reader

把英文文章变成"可点读"的页面：输入英文 → 命中本地词库的单词自动带上虚线下划线 → 点击弹出讲解卡片（Markdown 渲染），Esc / ✕ 随时关闭。

**在线体验：** https://vocab.proxy.ideaaedi.com/

## 启动

```bash
cd english-word-reader
./start.sh          # 或: node server.js
```

打开 **http://127.0.0.1:7610**（端口被占用时自动顺延，以终端打印的地址为准）。

## 功能

- **输入页** `/`：支持多段英文，实时统计词数/段落，草稿自动保存（localStorage），⌘/Ctrl+Enter 快速提交，可一键填入示例。
- **分析页** `/analyze`：句子按段落呈现；命中本地词库的单词变为可点击（大小写不敏感、自动还原复数/所有格，如 `conversations → conversation.md`、`stories → story.md`）。
- **讲解卡片**：右侧抽屉渲染对应的 Markdown 文件（标题、表格、嵌套列表、代码块等），点击卡片内的英文单词可继续跳转查询（带返回栈），✕ / Esc / 点击遮罩关闭。
- **剑桥词典**：卡片顶部有「📘 Cambridge」链接，把当前词条（词库标准形，如点了 `conversations` 会传 `conversation`）传给剑桥英汉词典，新标签页打开。
- **分享**：分析页右上角「分享 ⤴」—— 点击时才把内容交给服务端，**id = 内容 MD5 前 16 位**，得到短链接 `<origin>/s/<hash>`（整条 URL 仅 40 字符左右）。同一段内容永远得到同一个链接（天然去重）；分享后地址栏自动变成短链，直接复制地址栏也能分享。内容持久化于 `data/shares.json`（重启不丢，上限 1000 条 / 单篇 20 万字符）。
- **音标点读**：卡片内 `/kæn/`、`/həˈloʊ/` 这类斜线包围的音标与单词同款虚线样式，点击**新标签页**打开发音查询站（如 `…/english_voice?s=/wi%CB%90/`，音标原样、非 ASCII 字符转 UTF-8 百分号编码）。`a/b/c`、`and/or`、`24/7`、`BrE/AmE` 等非音标斜线文本不会误伤（全词库 27,218 个音标验证，0 误伤）。
- 顶部显示"命中 x / y 词"统计；深色 / 浅色主题切换；移动端适配。

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `7610` | 监听端口（占用时自动 +1） |
| `HOST` | `127.0.0.1` | 监听地址 |
| `DICT_DIR` | `/Users/james/Desktop/workday/002_english` | 词库目录（每个单词一个 `.md`） |

词库索引 15 秒自动刷新，往目录里新增 `.md` 无需重启。

## 结构

```
english-word-reader/
├── server.js          # 零依赖 HTTP 服务：词库索引 + 单词解析(大小写/复数) + API
├── start.sh
├── public/
│   ├── index.html     # 输入页
│   ├── analyze.html   # 分析页
│   ├── style.css      # 设计系统（浅色/深色）
│   ├── theme.js       # 主题切换
│   ├── index.js       # 输入页逻辑
│   ├── analyze.js     # 分析页逻辑（单词包裹、抽屉卡片、历史返回）
│   └── md.js          # 轻量 Markdown 渲染器（无依赖）
└── test/render-test.js  # 渲染器单测：node test/render-test.js
```

## API

- `POST /api/lookup` `{words:[...]}` → `{matches:{word:slug}}`（也有 `GET /api/lookup?word=hello`）
- `GET /api/md?slug=hello` → `{slug,file,md}`
- `GET /api/health` → `{ok,entries,dictDir}`
- `POST /api/share` `{text}` → `{id}`（id = 内容 MD5 前 16 位，同内容同 id；`GET /api/share/<id>` → `{text}`；`GET /s/<id>` → 分析页）
- `GET /dict-asset/<file>` → 词库目录中的图片（白名单扩展名）
