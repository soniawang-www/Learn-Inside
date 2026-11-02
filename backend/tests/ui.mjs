// 界面全流程（Playwright，用真实浏览器点）：游客 → 看到注册礼 → 锁住的互动解析 → 注册送 10 次 → 用 1 次解锁 → 看解析
// → 后台加会员、生成激活码 → 账号页兑换 → 套餐按钮（开通 / 暂不支持）→ 跳支付宝 → 各页面在手机和电脑上不溢出、无脚本错误
//   node backend/tests/ui.mjs http://127.0.0.1:8788
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const B = process.argv[2] || 'http://127.0.0.1:8788';

let pass = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fails.push(m); console.log('  ✗', m); } };
const api = async (path, method = 'GET', body, token, admin) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { 'x-admin-key': 'localtest' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => ({}));
};
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '界面测试' : undefined));
const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => '')) || '';
const go = async (hash) => { await page.goto(B + '/math/' + hash); await page.waitForTimeout(900); };

console.log('\n── 游客与注册礼');
await page.goto(B + '/math/'); await page.waitForTimeout(800);
ok((await text('.auth-card')).includes('注册就送 10 次互动解析'), '登录页（注册）显示注册礼');
await page.click('[data-tab="login"]');
ok((await text('.auth-card')).includes('免费注册，送 10 次互动解析'), '登录页（登录）也提示注册送 10 次');
await page.click('#guest'); await page.waitForTimeout(1500);
ok((await text('.gift-tip')).includes('注册就送 10 次互动解析'), '游客首页顶部有注册礼');
ok((await text('.side-who')).includes('游客'), '侧栏显示游客');
const token = await page.evaluate(() => JSON.parse(localStorage.getItem('li.token')));
const stu = await page.evaluate(() => JSON.parse(localStorage.getItem('li.student')));
const s = await api('/math/api/sessions', 'POST', { problem_ids: ['amc8-2025-p01', 'amc8-2025-p02'], student_id: stu.id }, token);
await api(`/math/api/sessions/${s.session.id}/submit`, 'POST', { answers: {}, times: {}, flags: {} }, token);
await go(`#/review/${s.session.id}`);
ok((await text('.rev-side')).includes('注册就送 10 次互动解析'), '复盘页（有错题）提示注册礼');
await page.click('[data-adv]'); await page.waitForTimeout(700);
ok((await text('.modal')).includes('注册就送 10 次互动解析'), '游客点锁住的互动解析 → 弹出注册礼');
await page.click('.modal a[href="#/account"]'); await page.waitForTimeout(1000);
ok((await text('.col-side')).includes('注册就送 10 次'), '账号页注册卡片有注册礼');
ok(await page.locator('[data-goreg]').count() > 0 && await page.locator('[data-plan]').count() === 0, '游客的套餐按钮是「注册后开通」');

console.log('\n── 注册、用次数解锁');
const phone = '134' + String(Date.now()).slice(-8);
await page.fill('#bind input[name=phone]', phone);
await page.fill('#bind input[name=password]', 'ui1234');
await page.fill('#bind input[name=nickname]', '界面');
await page.click('#bind button'); await page.waitForTimeout(1500);
ok((await text('.modal')).includes('已送你 10 次互动解析'), '注册成功弹窗：已送你 10 次');
await page.click('.modal [data-close]');
await go('#/account');
ok((await text('.col-main')).includes('剩余免费次数 10 次'), '账号页显示剩余 10 次');
await go(`#/review/${s.session.id}`);
await page.click('[data-adv]'); await page.waitForTimeout(700);
ok((await text('.modal')).includes('用 1 次免费次数解锁') && (await text('.modal')).includes('剩余 10 次'), '点互动解析 → 询问用 1 次（剩 10 次）');
await page.click('#unl'); await page.waitForTimeout(1500);
ok(await page.locator('.lp-overlay').count() > 0, '解锁后互动解析打开');
await page.keyboard.press('Escape'); await page.goto(B + '/math/#/account'); await page.reload(); await page.waitForTimeout(1000);
ok((await text('.col-main')).includes('剩余免费次数 9 次'), '用掉 1 次，剩 9 次');

console.log('\n── 后台：加会员、生成激活码；账号页兑换');
const admin = await browser.newPage({ viewport: { width: 1280, height: 860 } });
admin.on('pageerror', (e) => errors.push('admin: ' + e.message));
admin.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '界面测试' : undefined));
await admin.goto(B + '/admin/members.html'); await admin.fill('#key', 'localtest'); await admin.dispatchEvent('#key', 'change');
await admin.fill('#q', phone); await admin.click('#search button'); await admin.waitForTimeout(1000);
ok((await admin.locator('.acc').count()) === 1, '后台按手机号搜到账号');
await admin.click('.acc details summary');
await admin.selectOption('.acc [data-tier]', 'math');
await admin.fill('.acc [data-v="add_days"]', '31'); await admin.click('.acc [data-op="add_days"]'); await admin.waitForTimeout(1000);
ok((await admin.locator('.acc').first().textContent()).includes('数学会员到'), '后台加 31 天数学会员');
await admin.click('[data-tab="codes"]'); await admin.waitForTimeout(500);
await admin.selectOption('#kind', 'days'); await admin.selectOption('#ctier', 'math'); await admin.fill('#amount', '92'); await admin.fill('#count', '1'); await admin.fill('#cnote', '界面测试');
await admin.click('#gen button'); await admin.waitForTimeout(1000);
const code = ((await admin.textContent('#newcodes')) || '').trim().split('\n').pop();
ok(/^[A-Z0-9]{10}$/.test(code), '后台生成激活码 ' + code);
await go('#/account');
ok((await text('.col-main')).includes('数学会员'), '账号页显示数学会员');
await page.fill('#redeem input', code.toLowerCase()); await page.click('#redeem button'); await page.waitForTimeout(1200);
ok((await text('.modal')).includes('数学会员增加 92 天'), '账号页兑换激活码：数学会员 92 天');
await page.click('.modal [data-close]'); await go('#/account');
ok(!(await text('.col-main')).includes('全科会员') && (await admin.locator('#ctier option').count()) === 1, '全科会员暂不开放：账号页没有全科套餐，后台激活码只能选数学');

console.log('\n── 套餐按钮与支付跳转');
const btns = await page.locator('.plan').allTextContents();
ok(btns.some((t) => t.includes('开通')) && btns.some((t) => t.includes('暂不支持')), '在线可付的显示「开通」，超过上限的显示「暂不支持 · 找客服」');
const [nav] = await Promise.all([page.waitForURL(/8799|alipay/, { timeout: 8000 }).then(() => true).catch(() => false), page.click('[data-plan="math.month"]')]);
ok(nav && page.url().includes('alipay.trade.page.pay'), '点「开通」跳到支付宝收银台（测试里是假网关）');
await go('#/account');
await page.click('.plan [data-support]'); await page.waitForTimeout(800);
ok((await text('.modal')).includes('购买激活码'), '点「暂不支持 · 找客服」弹出客服');

console.log('\n── 各页面：手机和电脑都不溢出、无脚本错误');
const tok = await page.evaluate(() => localStorage.getItem('li.token')), st = await page.evaluate(() => localStorage.getItem('li.student'));
const pages = ['#/', '#/exams', '#/contest/amc8', '#/contest/amc8/stats', '#/contest/amc8/records', '#/graph', '#/graph/geo.area', '#/mistakes', '#/kp/geo.area', '#/kp/geo.area?family=swb100', '#/account', `#/review/${s.session.id}`, '#/problem/amc8-2025-p01'];
for (const [w, h, name, cs] of [[1920, 1080, '大屏', 'light'], [1366, 768, '笔记本', 'light'], [768, 1024, '平板', 'light'], [390, 844, '手机', 'light'], [390, 844, '手机深色', 'dark']]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: cs });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/math/'); await p.evaluate(([t, s2]) => { localStorage.setItem('li.token', t); localStorage.setItem('li.student', s2); }, [tok, st]);
  let over = [];
  for (const hsh of pages) {
    await p.goto(B + '/math/' + hsh); await p.reload(); await p.waitForTimeout(700);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ov > 1) over.push(`${hsh}(${ov}px)`);
  }
  ok(!over.length && !errs.length, `${name}（${w}×${h}）${pages.length} 个页面不溢出、无脚本错误${over.length ? '；溢出：' + over.join(' ') : ''}${errs.length ? '；错误：' + errs[0] : ''}`);
  await p.close();
}
ok(!errors.length, '整个流程无脚本错误' + (errors.length ? '：' + errors[0] : ''));
await browser.close();
console.log(`\n通过 ${pass} 项${fails.length ? `，失败 ${fails.length} 项：\n  - ${fails.join('\n  - ')}` : '，全部通过'}`);
process.exit(fails.length ? 1 : 0);
