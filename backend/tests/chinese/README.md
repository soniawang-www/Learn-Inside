# 语文（汉字小达人）测试

先按 `backend/tests/suite/README.md` 起本地测试环境（会导入 math-data 里 `exams/hanzi/` 的试卷），然后：

```bash
# 接口：游客开考、按标准答案作答应得 150 分、注册用户错题本、错题重做逐题判分、数学和语文的成绩错题互不混入
python3 backend/tests/chinese/api.py ../math-data

# 界面（Playwright，手机 Pixel 5 + 电脑 1280 浅色 / 深色）：一页一题、未作答不能下一页、没有上一页、
# 不显示剩余题数、古文字图、诗句输入提示、整套 150 题点完得满分、刷新后接着做、错题本、练习模式
EXAM=hanzi-2021-city PW=<playwright 模块路径> DATA=../math-data OUT=/tmp/shots node backend/tests/chinese/ui-exam.mjs   # EXAM 换成别的试卷 id 可测其他卷
PW=<playwright 模块路径> OUT=/tmp/shots node backend/tests/chinese/ui-mistakes.mjs
```

判分的单元测试（成语、诗句忽略标点）在 `backend/tests/unit/answers.test.mjs`。
