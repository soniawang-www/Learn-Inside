import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW);
const fs = require('fs');
const B = 'http://127.0.0.1:8788', O = process.env.OUT;
const exam = JSON.parse(fs.readFileSync(process.env.DATA + '/exams/hanzi/hanzi-2021-city.json', 'utf8'));
const key = Object.fromEntries(exam.problems.map((p) => [p.number, p]));
const fails = []; const ok = (c, m) => { console.log(c ? '✓' : '✗', m); if (!c) fails.push(m); };
const browser = await chromium.launch();
async function overflow(pg) { return pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); }

// ── 手机：游客从头到尾做一套 ──
const ctx = await browser.newContext({ ...devices['Pixel 5'] });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(B + '/chinese/');
await pg.getByText('先不注册，直接试试').click();
await pg.getByText('开始模考').waitFor();
await pg.screenshot({ path: `${O}/m-home.png`, fullPage: true });
ok(!(await overflow(pg)), '手机首页没有横向溢出');
await pg.getByText('开始模考').click();
await pg.getByText('开始答题').click();
await pg.locator('.ex-q').waitFor();
await pg.screenshot({ path: `${O}/m-q1.png` });
ok(await pg.locator('.ex-next').isDisabled(), '没作答时「下一页」不能点');
ok((await pg.locator('text=上一页').count()) === 0, '没有「上一页」');
ok(!(await pg.locator('body').innerText()).match(/第\s*\d+\s*\/\s*150|还剩\s*\d+\s*题/), '不显示还剩多少题');
const shotAt = { 31: 'm-q31', 86: 'm-q86', 106: 'm-q106', 121: 'm-q121', 141: 'm-q141' };
for (let n = 1; n <= 150; n++) {
  const k = key[n];
  const num = await pg.locator('.ex-q').innerText();
  if (!num.includes(`${n}.`)) { ok(false, `第 ${n} 题题号不对：${num.slice(0, 20)}`); break; }
  if (shotAt[n]) await pg.screenshot({ path: `${O}/${shotAt[n]}.png` });
  if (k.kind === 'fill') {
    const v = n === 141 ? '不须迎向东郊去，春在千门万户中' : k.answer;
    await pg.locator('#fill').fill(v);
  } else {
    await pg.locator('.ex-opt').nth(Object.keys(k.choices).indexOf(k.answer)).click();
  }
  if (n === 106) ok(await pg.locator('.ex-fig img').isVisible(), '古文字题显示字形图');
  if (n === 141) ok((await pg.locator('.ex-hint').innerText()).includes('空格'), '诗句题有输入提示');
  if (n === 30 || n === 75) ok(!(await overflow(pg)), `第 ${n} 题没有横向溢出`);
  await pg.locator('.ex-next').click();
}
await pg.locator('.score-big').waitFor({ timeout: 15000 });
const sc = await pg.locator('.score-big b').innerText();
ok(sc === '150', `交卷得分 ${sc}`);
await pg.screenshot({ path: `${O}/m-review.png`, fullPage: false });
ok(!(await overflow(pg)), '成绩页没有横向溢出');
ok(errs.length === 0, `页面没有脚本错误 ${errs.join(' | ')}`);

// ── 手机：刷新后接着做 ──
await pg.goto(B + '/chinese/#/');
await pg.getByText('开始模考').click();
await pg.getByText('开始答题').click();
for (let n = 1; n <= 3; n++) { const k = key[n]; await pg.locator('.ex-opt').nth(Object.keys(k.choices).indexOf(k.answer)).click(); await pg.locator('.ex-next').click(); }
await pg.reload(); await pg.locator('.ex-q').waitFor();
ok((await pg.locator('.ex-q').innerText()).includes('4.'), '刷新后从第 4 题接着做');

// ── 电脑 + 深色 ──
for (const [name, scheme] of [['d-light', 'light'], ['d-dark', 'dark']]) {
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  await c2.addInitScript(([t, s]) => { localStorage.setItem('li.token', t); localStorage.setItem('li.student', s); }, [await pg.evaluate(() => localStorage.getItem('li.token')), await pg.evaluate(() => localStorage.getItem('li.student'))].map((x) => JSON.parse(JSON.stringify(x))).map((x) => x));
  const p2 = await c2.newPage();
  await p2.goto(B + '/chinese/#/'); await p2.getByText('开始模考').waitFor();
  await p2.screenshot({ path: `${O}/${name}-home.png` });
  const sid = await pg.evaluate(() => location.hash.split('/')[2]);
  await p2.goto(B + `/chinese/#/exam/${sid}`); await p2.locator('.ex-q').waitFor();
  await p2.screenshot({ path: `${O}/${name}-exam.png` });
  ok(!(await overflow(p2)), `电脑 ${scheme} 考试页没有横向溢出`);
  await c2.close();
}
await browser.close();
console.log(fails.length ? `失败 ${fails.length}` : '界面测试全部通过');
