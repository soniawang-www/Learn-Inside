# AMC 8 模拟考（learn-inside.com/amc8/）

挂在 Learn-Inside 站点下：前端是静态文件，API 是同一个 Worker，数据在 Cloudflare D1。

## 目录

```
amc8/                    前端（公开，访问路径 /amc8/）
worker/index.js          API，只处理 /amc8/api/*（见 wrangler.jsonc 的 run_worker_first）
worker/mastery.js        画像算法（简化 Elo，可整体替换）
worker/seed.js           题库 → 数据库行（Worker 和脚本共用）
worker/content.generated.js  内置题库，由脚本生成，不要手改
amc8-src/schema.sql      建表
amc8-src/data/           知识图谱 + 试卷 JSON
amc8-src/scripts/build-seed.mjs  生成 content.generated.js 和 seed.sql
amc8-src/tests/e2e.mjs   端到端测试
```

`worker/`、`amc8-src/`、`wrangler.jsonc` 已写进 `.assetsignore`，不会作为静态文件公开。

## 首次上线

1. 推送到 main，Cloudflare 自动部署。
2. 浏览器打开一次 `https://learn-inside.com/amc8/api/admin/seed`，看到 `{"ok":true,...}` 即建表和导入题库完成。
3. 打开 `https://learn-inside.com/amc8/`，邀请码 `AMC2026`。

## 导入真题（推荐方式）

真题放在私有仓库 `soniawang-www/amc8-data`，**不要放进这个公开仓库**。

1. 打开 `https://learn-inside.com/amc8/admin.html`
2. 填管理员密钥（Cloudflare 里设置的 Secret `ADMIN_KEY`）
3. 选择 `amc8-data/exams/` 下的试卷 JSON（可多选），页面会先显示题数和答案串，确认后点「导入」

同一套试卷可以反复导入：题目内容会更新，孩子的作答记录不受影响。

## 更新内置示例卷

1. 修改 `amc8-src/data/` 下的 JSON（试卷一套一个文件，格式见 `sample-2026.json`）。
2. 在仓库根目录运行 `node amc8-src/scripts/build-seed.mjs > amc8-src/seed.sql`（会校验答案和知识点）。
3. 提交并推送，等部署完成。
4. 题库已初始化后，再次导入需要管理员密钥：在 Cloudflare 控制台 → learn-inside → Settings → Variables and Secrets 添加 **Secret** `ADMIN_KEY`（不要写进仓库），然后打开 `https://learn-inside.com/amc8/api/admin/seed?key=你的密钥`。

导入用 UPSERT（不会删除已有行），可重复执行，不影响作答记录。

## 试卷 JSON 字段

| 字段 | 说明 |
|---|---|
| `stem` / `choices` | 英文原题，Markdown + `$LaTeX$`；选项值以 `<svg` 或 `<img` 开头时按图形显示 |
| `stem_zh` / `choices_zh` | 中文题干 / 选项（可选），考试页可切换 English / 中文 / 双语 |
| `figure` | 内联 SVG（用 `currentColor` 适配深色模式），或图片 URL |
| `answer` | A–E |
| `kps` | `{知识点id: 权重}`，主考点 1.0，辅助 0.3~0.5 |
| `hints` | 最多 3 级，由浅到深 |
| `basic` | 解题思路（免费） |
| `advanced` | 互动解析（付费）：`{title, steps}`，步骤类型见下；或用 `advanced_url` 指向独立互动页 |
| `difficulty` | 可选；不填按题号推算 |

真题设 `"duration_sec": 2400`（40 分钟）。

⚠️ 这个仓库是公开的，`amc8-src/data/` 里的内容任何人都能在 GitHub 上看到。真题数据建议放在私有仓库，或者只在本地生成 `content.generated.js`。

## 互动课步骤类型（互动解析和知识点课共用）

播放器 `amc8/player.js`，组件 `amc8/sims.js`。每步都有 `say`（小助手的话），可选 `html`（屏幕内容）、`fig`（静态图，大屏放左边）。

| type | 说明 |
|---|---|
| `info` | 讲一句 |
| `here` | 全景图：`items: [{t, d, on}]` |
| `tabs` | 几个按钮换着看：`tabs: [{label, html, say, fig?, grid?}]` |
| `quiz` / `pick2` | 选择：`q, opts, a, why[], ok`，答对才算完成 |
| `fill` | 填数字：`q, a: [可接受答案], hint, show, pre, post` |
| `recall` | 合上书想一想：`q, ans`（点开看答案） |
| `grid` | 方格路线：看路线 / `mode: 'draw'` 自己画 |
| `sim` | 动手组件：`sim: 名字` + 参数，`goal: true` 时等孩子完成；组件列表见 `sims.js` 末尾的 `SIMS` |

## 知识点内容

知识点课（`lesson`）和识别信号（`signals`）放在私有仓库 `amc8-data/knowledge/points.json`，在 admin.html 和试卷一起导入（先导入知识点）。公开仓库的 `knowledge.json` 只放名称、一句话说明和识别信号。

## 设计要点

- **画像由原始事件重算**：`attempt_event` 是唯一数据源，换算法只改 `worker/mastery.js`。
- **付费只靠数据切换**：内容带 `tier`；`hasTier()` 是唯一判断入口。试用期 `FREE_MODE="true"`；收费时改为 `"false"`，支付成功后往 `entitlement` 写 `tier='premium'` 的记录。
- **付费内容在服务端拦截**；解析还要求做过这道题。
- **计时以服务端为准**，时间到自动交卷（与中国区线上考试一致）。
- 考试界面按 AMC 8 中国区线上考试操作手册截图还原：顶栏（刷新 / 大字号 / 剩余时间 / 交卷）、左侧答题卡（进度、题号已答变蓝、标记）、一屏一题、上一题 / 下一题。

## 本地运行

```bash
npm i -g wrangler        # 或 npx wrangler
wrangler dev             # 仓库根目录；本地 D1 存在 .wrangler/
# 打开 http://127.0.0.1:8787/amc8/api/admin/seed 初始化，再访问 /amc8/
node amc8-src/tests/e2e.mjs http://127.0.0.1:8787
```
