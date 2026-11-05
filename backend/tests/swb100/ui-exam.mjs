// 思维 100 界面测试：游客从「思维 100」入口选年级、模考一整套、全部答对交卷；顺带检查多值填空、选择题、手机和深色模式。
// PW=<playwright 模块> DATA=<math-data 目录> OUT=<截图目录> [EXAM=swb100-2026s-g4] node backend/tests/swb100/ui-exam.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW);
const fs = require('fs');
const B = process.env.BASE || 'http://127.0.0.1:8788', O = process.env.OUT, EXAM = process.env.EXAM || 'swb100-2026s-g4';
fs.mkdirSync(O, { recursive: true });
const exam = JSON.parse(fs.readFileSync(`${process.env.DATA}/exams/swb100/${EXAM}.json`, 'utf8'));
const fails = []; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails.push(m); };
const overflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
// 多值答案故意用中文逗号和空格输入，测判分的规范化
const typed = (a) => (a.includes(',') ? a.split(',').join('， ') : a);

const browser = await chromium.launch();
for (const [name, opt] of [['m', { ...devices['Pixel 5'] }], ['d-dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }]]) {
  const ctx = await browser.newContext(opt);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(B + '/math/');
  await pg.locator('#guest').click();
  await pg.waitForTimeout(800);
  await pg.goto(B + '/math/#/contest/swb100');
  await pg.locator('.grade-tabs').waitFor();
  await pg.locator(`.grade-tabs [data-grade="${exam.grade}"]`).click();
  const start = pg.locator(`[data-start="${EXAM}"][data-mode="exam"]`);
  await start.waitFor();
  await pg.screenshot({ path: `${O}/${name}-contest.png`, fullPage: true });
  ok(!(await overflow(pg)), `${name} 思维 100 试卷列表没有横向溢出`);
  const tile = await start.locator('xpath=ancestor::div[contains(@class,"exam-tile")]').innerText();
  ok(tile.includes(`${exam.problems.length} 题`) && tile.includes('60 分钟'), `${name} 试卷卡片显示题数和时长：${tile.replace(/\s+/g, ' ').slice(0, 40)}`);
  await start.click();
  ok((await pg.locator('.instructions').innerText()).includes('逗号隔开'), `${name} 考前须知说明多值填空的写法`);
  await pg.locator('#go').click();
  await pg.locator('.ez-q').waitFor();
  for (let i = 0; i < exam.problems.length; i++) {
    const p = exam.problems[i];
    const head = await pg.locator('.ez-qno').innerText();
    if (!head.includes(`第 ${p.number} 题`)) { ok(false, `${name} 题号不对：${head}`); break; }
    if (Object.keys(p.choices).length) await pg.locator(`[data-choice="${p.answer}"]`).click();
    else await pg.locator('#fill').fill(typed(p.answer));
    if (p.figure && i < 8) { ok(await pg.locator('.ez-q .figure svg').isVisible(), `${name} 第 ${p.number} 题显示插图`); }
    if ([4, 7, 13].includes(p.number)) { await pg.screenshot({ path: `${O}/${name}-q${p.number}.png` }); ok(!(await overflow(pg)), `${name} 第 ${p.number} 题没有横向溢出`); }
    if (i < exam.problems.length - 1) await pg.locator('#next').click();
  }
  await pg.locator('#submit').click();
  await pg.locator('#yes').click();
  await pg.locator('.rev-score').waitFor({ timeout: 15000 });
  const sc = await pg.locator('.rev-score b').innerText();
  ok(sc === String(exam.problems.length), `${name} 全部答对，得分 ${sc} / ${exam.problems.length}`);
  await pg.screenshot({ path: `${O}/${name}-review.png` });
  ok(errs.length === 0, `${name} 页面没有脚本错误 ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `失败 ${fails.length}` : '思维 100 界面测试全部通过');
process.exit(fails.length ? 1 : 0);
