# 奥数（learn-inside.com/math/）

旧地址 `/amc8/` 会 301 跳到 `/math/`，`/amc8/api/*` 仍可用。

页面结构：
- **考试**（首页 `#/`）：每种考试一张卡（AMC 8、思维 100…），进去是「试卷 / 考情 / 成绩记录」三个标签。考情按考试分开统计。
- **知识图谱**（`#/graph`）：每个账号一张，按知识项算掌握度，不分考试；可切到「列表」按薄弱排序。点知识项看上下游和在各考试错过的题。
- **错题本**（`#/mistakes`）：所有考试的错题放在一起，可按考试、知识项筛选。
- 知识项页（`#/kp/:id`）：识别信号、我的错题、按考试切换的考情、题型、真题突击。
考试种类由 `worker/index.js` 的 `FAMILIES` 定义，按试卷 id 前缀区分（`amc8-`、`swb100-`）。

挂在 Learn-Inside 站点下：前端是静态文件，API 是同一个 Worker，数据在 Cloudflare D1。

## 目录

```
index.html               网站首页（静态）
assets/                  logo 等共用资源
chinese/  english/       学习页（静态）
math/                    奥数前端（/math/）：app.js 页面、graph.js 知识图谱、player.js 互动课播放器、sims*.js 互动组件、style.css
admin/                   管理后台（/admin/）：index.html 入口、members.html 会员管理、import.html 题库导入（都要 ADMIN_KEY）
worker/                  Cloudflare Worker（不公开）
  index.js               路由；数学接口 /math/api/*（兼容 /amc8/api/*），全站接口 /api/*
  billing.js             账号、会员、免费次数、激活码、会员管理接口
  alipay.js              支付宝加签验签、下单、查询
  mastery.js             掌握度算法
  seed.js                题库 → 数据库行
  content.generated.js   内置题库，由脚本生成，不要手改
backend/                 开发用（不公开）
  schema.sql             建表
  data/                  知识图谱 + 示例试卷
  scripts/build-seed.mjs 生成 content.generated.js
  tests/                 e2e.mjs 功能、billing.mjs 会员、pay.mjs 支付
```

`worker/`、`backend/`、`wrangler.jsonc` 写在 `.assetsignore` 里，不会作为静态文件公开。
旧地址 `/math/admin.html`、`/math/members.html` 会跳到 `/admin/` 下。

## 首次上线

1. 推送到 main，Cloudflare 自动部署。
2. 浏览器打开一次 `https://learn-inside.com/math/api/admin/seed`，看到 `{"ok":true,...}` 即建表和导入题库完成。
3. 打开 `https://learn-inside.com/math/`，用手机号注册。

## 导入真题（推荐方式）

真题放在私有仓库 `soniawang-www/amc8-data`，**不要放进这个公开仓库**。

1. 打开 `https://learn-inside.com/admin/import.html`
2. 填管理员密钥（Cloudflare 里设置的 Secret `ADMIN_KEY`）
3. 选择 `amc8-data/exams/` 下的试卷 JSON（可多选），页面会先显示题数和答案串，确认后点「导入」

同一套试卷可以反复导入：题目内容会更新，孩子的作答记录不受影响。

## 更新内置示例卷

1. 修改 `backend/data/` 下的 JSON（试卷一套一个文件，格式见 `sample-2026.json`）。
2. 在仓库根目录运行 `node backend/scripts/build-seed.mjs > backend/seed.sql`（会校验答案和知识点）。
3. 提交并推送，等部署完成。
4. 题库已初始化后，再次导入需要管理员密钥：在 Cloudflare 控制台 → learn-inside → Settings → Variables and Secrets 添加 **Secret** `ADMIN_KEY`（不要写进仓库），然后打开 `https://learn-inside.com/math/api/admin/seed?key=你的密钥`。

导入用 UPSERT（不会删除已有行），可重复执行，不影响作答记录。

## 试卷 JSON 字段

| 字段 | 说明 |
|---|---|
| `stem` / `choices` | 英文原题，Markdown + `$LaTeX$`；选项值以 `<svg` 或 `<img` 开头时按图形显示 |
| `stem_zh` / `choices_zh` | 中文题干 / 选项（可选），考试页可切换 English / 中文 / 双语 |
| `figure` | 内联 SVG（用 `currentColor` 适配深色模式），或图片 URL |
| `answer` | A–E |
| `kps` | `{知识项id: 权重}`，主考点 1.0，辅助 0.5；画像、考情、错题都按知识项统计 |
| `types` | 题型 `[{id, name, w}]`（可选），复盘页和错题本显示 |
| `hints` | 最多 3 级，由浅到深 |
| `basic` | 解题思路（免费） |
| `advanced` | 互动解析（付费）：`{title, steps}`，步骤类型见下；或用 `advanced_url` 指向独立互动页 |
| `difficulty` | 可选；不填按题号推算 |

真题设 `"duration_sec": 2400`（40 分钟）。

⚠️ 这个仓库是公开的，`backend/data/` 里的内容任何人都能在 GitHub 上看到。真题数据建议放在私有仓库，或者只在本地生成 `content.generated.js`。

## 互动课步骤类型（互动解析和知识点课共用）

播放器 `math/player.js`，组件 `math/sims.js`。每步都有 `say`（小助手的话），可选 `html`（屏幕内容）、`fig`（静态图，大屏放左边）。

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

## 知识体系

模块（8 个）→ 知识项（30 个，备考和统计的单位）→ 题型。知识项之间的前置关系在 `kp_edge`，画像里知识项薄弱且它的前置也薄弱时，提示先补前置。

私有仓库 `amc8-data/knowledge/units.json` 是完整的知识项体系（由 `build_units.py` 生成），在 admin.html 导入时会整体替换前置关系、删除不在里面的旧知识点，并重算所有学生的画像。试卷的 `kps`/`types` 由 `amc8-data/tools/retag.py` 按 `knowledge/tags_amc8.txt` 生成。

### 知识项内容

识别信号（`signals`）和以后的知识项课（`lesson`）放在 `units.json` 里。公开仓库的 `knowledge.json` 是同一套体系的副本，供本地建库和示例卷用。

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
# 打开 http://127.0.0.1:8787/math/api/admin/seed 初始化，再访问 /math/
node backend/tests/e2e.mjs http://127.0.0.1:8787
```


## 账号与会员

- 家长用**手机号 + 密码**注册登录（不发短信验证码；忘记密码在会员管理后台重置）。试用期用邀请码建的老账号，可以在「账号」页绑定手机号。
- **免费次数**：每个账号送 10 次（`worker/billing.js` 的 `FREE_CREDITS`）。1 次解锁一道题的互动解析（之后随时看）或一个知识项的真题突击。
- **免费样板**：`SAMPLES`，目前是 2026 年整套互动解析，和「直线形面积」「分百与比例应用题」两个知识项的突击，不扣次数。
- **账号全站通用**，接口在 `/api/`（账号、会员、免费次数、激活码、支付、会员管理），数学自己的接口在 `/math/api/`。登录状态存在浏览器的 `li.token`，以后语文等页面直接读它。
- **会员分科目**：数学会员、语文会员（还没上线，`billing.js` 的 `SCOPES` 里 `live: false`），以及包含所有科目的**全科会员**。科目会员续费会接在全科会员到期之后。
- 每种会员有月卡 31 天、季卡 92 天、年卡 366 天，价格在 `wrangler.jsonc` 填（元）：`PRICE_MATH_MONTH`、`PRICE_ALL_YEAR` 这样的 `PRICE_<科目>_<周期>`，留空显示“价格待定”、不能在线买。会员期间本科目互动解析和突击不限次数。
- **免费次数全站共用** 10 次。
- 答案、基础解题思路、知识图谱、错题本始终免费。
- **会员管理后台**：`/admin/members.html`（需要 ADMIN_KEY）：按手机号或昵称搜账号，加会员天数、改到期日、取消会员、加减次数、重置密码、备注；生成激活码（会员天数或次数）；所有操作有记录。分享活动的奖励在这里手动发。
- **开始收费**：把 `FREE_MODE` 改成 `"false"`。之前的账号都有 10 次免费次数。
- 在线支付见下一节。没配好之前，账号页显示 `PAY_CONTACT`（购买激活码的联系方式）。
- 测试：`wrangler dev --local --port 8788 --var ADMIN_KEY:localtest --var FREE_MODE:false`，然后 `node backend/tests/billing.mjs http://127.0.0.1:8788`。

## 在线支付（支付宝）

代码：`worker/alipay.js`（RSA2 加签、验签、下单地址、查询），`worker/billing.js` 的「在线支付」部分。
AI 网页应用收款只签约 `alipay.trade.page.pay`，电脑和手机浏览器都用它；付款结果以**异步通知**为准（验签 + 核对 app_id、订单号、金额），
没收到通知时，结果页查订单会主动调 `alipay.trade.query` 兜底。同一订单只开通一次；退款、关单类通知（带 `out_biz_no` / `gmt_refund` / `refund_fee`）不当作付款。
后台「支付订单」可以整单退款（`alipay.trade.refund`，同一订单重试复用同一 `out_request_no`，未确认时用 `alipay.trade.fastpay.refund.query` 查结果，退成功后收回这笔订单的会员天数）和关闭待付款订单（`alipay.trade.close`）。
本地 http 调试时不传 `notify_url`（支付宝回调不到），上线是 https 自动带上 `https://learn-inside.com/api/pay/notify`。

配置（Cloudflare 控制台 → learn-inside → Settings → Variables and Secrets）：

| 名称 | 类型 | 内容 |
|---|---|---|
| `AIPAY_APP_ID` | 变量 | 线上 APPID |
| `AIPAY_PRIVATE_KEY` | **Secret** | 线上 **JAVA 语言私钥**（PKCS8）；也可以用 `AIPAY_PRIVATE_PKCS_KEY` 放非 Java 私钥（PKCS1） |
| `AIPAY_ALIPAY_PUBLIC_KEY` | **Secret** | 线上**支付宝公钥**。注意 `AIPAY_PUBLIC_KEY` 是应用公钥，这里用不到 |
| `ALIPAY_SELLER_ID` | 变量，可选 | 收款支付宝账号的 2088 开头 PID，用来多核对一项 |
| `ALIPAY_GATEWAY` | 变量，可选 | 默认正式环境 `https://openapi.alipay.com/gateway.do`；沙箱填 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |
| `PRICE_<MATH/ALL/CHINESE>_<MONTH/QUARTER/YEAR>` | 变量 | 价格（元），没设的显示“价格待定” |
| `PAY_MAX_AMOUNT` | 变量，可选 | 在线支付单笔上限（元），默认 50；超过的套餐显示「暂不支持 · 找客服」，只能用激活码 |

（旧写法 `ALIPAY_APP_ID` / `ALIPAY_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY`（支付宝公钥）也认。）
`wrangler.jsonc` 里有 `keep_vars: true`，推送部署不会冲掉控制台里加的变量。

开放平台里：接口加签方式选**公钥**（不是证书），通知地址是 `https://learn-inside.com/api/pay/notify`（全站共用，下单时自动带上）；申请收款产品时网站链接填 `https://learn-inside.com/`。

测试（模拟支付宝，不连真网关）：`node backend/tests/pay/keys.mjs` 生成两对测试密钥，`node backend/tests/pay/mockgw.mjs` 起假网关，
再按 `backend/tests/pay.mjs` 开头的说明启动 wrangler，运行 `node backend/tests/pay.mjs http://127.0.0.1:8788 <keys 所在目录>`。
后台 `/admin/members.html` 的「支付订单」标签能看到所有订单和已收款合计。
