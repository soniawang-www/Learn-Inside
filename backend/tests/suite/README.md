# 标准测试集合

把网站的功能逐项列出来，每个功能写成若干用例，再分别用 **游客、注册用户、会员** 三种身份各跑一遍，对照每种身份应有的结果：

- 该能用的能用（例如会员能直接看互动解析）
- 不该能用的被拦住（例如游客不能用次数解锁、不能买会员；注册用户没解锁的仍然锁着）

| 文件 | 内容 |
|---|---|
| `cases.mjs` | 接口层用例：账号、考试、互动解析、知识项、知识图谱、错题本、免费次数、会员、支付、权限 |
| `ui-cases.mjs` | 界面用例：在真实浏览器里看各页面上显示的东西和可点的按钮是否符合身份，以及各种屏幕、深色模式 |
| `run.mjs` | 运行器：建三种身份，逐个执行用例，输出矩阵报告 |
| `TESTPLAN.md` | 功能清单和三种身份的预期（由 `run.mjs --plan` 生成，改了用例要重新生成） |
| `REPORT.md` | 最近一次的运行结果 |
| `start-test-server.sh` | 起本地测试环境（正式收费模式、假支付宝、导入真题） |

## 运行

```bash
# 1. 起测试环境（需要私有题库仓库 math-data）
backend/tests/suite/start-test-server.sh ../math-data /tmp/suite

# 2. 跑接口 + 界面用例，生成报告；--shots 另外把每个页面在手机 / 电脑上各截一张图，生成总览
DATA=../math-data node backend/tests/suite/run.mjs http://127.0.0.1:8788 /tmp/suite --ui --report backend/tests/suite/REPORT.md --shots /tmp/suite/shots

# 只跑接口：去掉 --ui；只跑界面：--ui-only
# 更新功能清单：node backend/tests/suite/run.mjs --plan > backend/tests/suite/TESTPLAN.md
```

填空题判分另有单元测试：`node backend/tests/unit/answers.test.mjs`。

界面用例需要 Playwright（`PLAYWRIGHT=<playwright 模块路径>` 可指定）；语文答题用例要按标准答案作答，需要 `DATA=<math-data 目录>`。

界面用例能自动查出：横向溢出、文字被截断、按钮 / 卷名折行、脚本错误、有左侧导航的页面版面不一致（内容区宽度、标题大小和位置），覆盖数学、语文、账号、网站首页的所有页面和电脑 / 平板 / 手机 / 深色模式。
「好不好看」（留白、颜色、多余的说明文字）程序判断不了：每次上线前用 `--shots` 生成截图总览（`<目录>/index.html`），逐页看一遍再推。

## 加用例

在 `cases.mjs` / `ui-cases.mjs` 对应功能下加一条：

```js
{ id: 'C3-10', name: '测什么', run: async (c) => 观察值, expect: { guest: …, user: …, member: … } }
```

`run` 返回一个简单的观察值（HTTP 状态码、`'open'`/`'locked'`、数字、true/false），`expect` 写三种身份各自应得的值，不适用写 `'skip'`。同一身份按顺序执行，后面的用例可以依赖前面的状态。

新增功能时：先在清单里加功能和用例，再写代码，最后跑一遍。三种身份都通过才算完成。
