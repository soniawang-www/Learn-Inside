// 标准测试集合的运行器：用 游客 / 注册用户 / 会员 三种身份把 cases.mjs 里的每个用例跑一遍，对照预期，输出矩阵报告。
//
//   node backend/tests/suite/run.mjs http://127.0.0.1:8788 <keys 目录> [--report 报告.md]
//   node backend/tests/suite/run.mjs --plan > backend/tests/suite/TESTPLAN.md     # 只输出功能清单和预期，不跑
//
// 被测服务要求：FREE_MODE=false（正式收费）、ADMIN_KEY=localtest、已导入 AMC 8 真题和知识项、
// 假支付宝网关 + 测试密钥（见 backend/tests/pay.mjs 开头）、PRICE_MATH_MONTH=39、PRICE_MATH_YEAR=299、PAY_MAX_AMOUNT=100。
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { FEATURES as API_FEATURES, ROLES } from './cases.mjs';
import { UI_FEATURES } from './ui-cases.mjs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
// --ui 同时跑界面用例（需要 playwright；PLAYWRIGHT=playwright 模块路径）；--ui-only 只跑界面
const WITH_UI = args.includes('--ui') || args.includes('--ui-only') || args.includes('--plan');
const FEATURES = [...(args.includes('--ui-only') ? [] : API_FEATURES), ...(WITH_UI ? UI_FEATURES : [])];
const caseCount = () => FEATURES.reduce((n, f) => n + f.cases.length, 0);
const show = (v) => (v === 'skip' ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

if (args.includes('--plan')) {
  const lines = ['# 标准测试集合：功能清单与三种身份的预期', '',
    `共 ${FEATURES.length} 个功能、${caseCount()} 个用例。每个用例分别用游客、注册用户、会员三种身份执行；“—”表示该身份不适用。`,
    '预期多为接口返回的 HTTP 状态：200 正常，401 未登录，402 需要会员或次数，403 无权限（游客不能做 / 没做过题 / 不是管理员），404 不存在或不是自己的，409 冲突（重复）。', ''];
  let area = '';
  for (const f of FEATURES) {
    if (f.area !== area) { area = f.area; lines.push(`## ${area}`, ''); }
    lines.push(`### ${f.id} ${f.name}`, '', '| 用例 | 测什么 | 游客 | 注册用户 | 会员 |', '|---|---|---|---|---|');
    for (const c of f.cases) lines.push(`| ${c.id} | ${c.name} | ${show(c.expect.guest)} | ${show(c.expect.user)} | ${show(c.expect.member)} |`);
    lines.push('');
  }
  console.log(lines.join('\n'));
  process.exit(0);
}

const BASE = args[0] || 'http://127.0.0.1:8788';
const DIR = args[1] || '/tmp/paytest';
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
const K = JSON.parse(readFileSync(`${DIR}/keys.json`, 'utf8'));

async function req(path, method = 'GET', body, token, admin) {
  const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { 'x-admin-key': 'localtest' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
let seq = 0;
const newPhone = () => '13' + String(Date.now() + seq++).slice(-9);
const P25 = (n) => `amc8-2025-p${String(n).padStart(2, '0')}`;
const content = (p, omit) => Object.keys(p).filter((k) => !omit.includes(k) && p[k] !== '').sort().map((k) => `${k}=${p[k]}`).join('&');

async function makeContext(role, outsider) {
  const c = { role, outsider, password: 'suite123', newPhone };
  if (role === 'guest') {
    const g = await req('/api/auth/guest', 'POST', {});
    Object.assign(c, { T: g.data.token, sid: g.data.student.id });
  } else {
    c.phone = newPhone();
    const r = await req('/api/auth/register', 'POST', { phone: c.phone, password: c.password, nickname: ROLES[role] });
    Object.assign(c, { T: r.data.token, sid: r.data.student.id });
  }
  c.req = req;
  c.anon = (p, m, b) => req(p, m, b);
  c.get = (p) => req(p, 'GET', null, c.T);
  c.post = (p, b) => req(p, 'POST', b, c.T);
  c.admin = (p, m = 'GET', b) => req(p, m, b, null, true);
  c.mockPaid = (amount) => writeFileSync(`${DIR}/amount`, amount); // 假支付宝「查询订单」返回的已付金额（和订单金额不同 = 没付）
  c.makeCode = async (kind, amount, tier) => (await c.admin('/api/admin/codes', 'POST', { kind, amount, tier, note: '标准测试' })).data.codes[0];
  // 游客不能开单题 / 专项练习，只能整套考：把这些题所在的整套卷各考一遍（空着交）
  c.doProblems = async (sid, ids) => { if (role === 'guest') { let first; for (const e of [...new Set(ids.map((x) => x.replace(/-p\d+$/, '')))]) { const s = await c.post('/math/api/sessions', { exam_id: e, student_id: sid }); await c.post(`/math/api/sessions/${s.data.session.id}/submit`, { answers: {}, times: {}, flags: {} }); first ||= s.data.session.id; } return first; }
    const s = await c.post('/math/api/sessions', { problem_ids: ids, student_id: sid }); await c.post(`/math/api/sessions/${s.data.session.id}/submit`, { answers: {}, times: {}, flags: {} }); return s.data.session.id; };
  c.notify = async (orderId, amount) => {
    const p = { notify_type: 'trade_status_sync', notify_id: 'n' + orderId, app_id: '2021000000000001', out_trade_no: orderId, trade_no: 'T' + orderId, trade_status: 'TRADE_SUCCESS', total_amount: amount };
    const s = createSign('RSA-SHA256'); s.update(content(p, ['sign', 'sign_type']));
    const r = await fetch(BASE + '/api/pay/notify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...p, sign_type: 'RSA2', sign: s.sign(K.aliPriv, 'base64') }) });
    return r.text();
  };
  // 后台账号 id（游客没有手机号，按 id 找不到就用昵称搜）
  const acc = (await c.admin(`/api/admin/accounts?q=${encodeURIComponent(c.phone || '')}`)).data.accounts;
  c.aid = c.phone ? acc[0].id : null;
  if (role === 'member') await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_days', value: 31, tier: 'math', reason: '标准测试：会员身份' });
  // 共同前提：做过 2025 第 1–12 题和 2026 第 1 题（都空着交，全是错题）
  c.session = await c.doProblems(c.sid, [...Array.from({ length: 12 }, (_, i) => P25(i + 1)), 'amc8-2026-p01']);
  return c;
}

const eq = (a, b) => (typeof b === 'object' ? JSON.stringify(a) === JSON.stringify(b) : a === b);
const outsiderReg = await req('/api/auth/register', 'POST', { phone: newPhone(), password: 'suite123', nickname: '别人家' });
const outsider = { T: outsiderReg.data.token, sid: outsiderReg.data.student.id };
const results = {}; // caseId -> role -> { actual, expect, ok }
const record = async (t, role, fn) => {
  const expect = t.expect[role];
  if (expect === 'skip') { (results[t.id] ||= {})[role] = { skip: true }; return; }
  let actual;
  try { actual = await fn(); } catch (e) { actual = `异常：${String(e.message).split('\n')[0]}`; }
  (results[t.id] ||= {})[role] = { actual, expect, ok: eq(actual, expect) };
};
const apiFeatures = FEATURES.filter((f) => !f.id.startsWith('U'));
for (const role of Object.keys(ROLES)) {
  if (!apiFeatures.length) break;
  const c = await makeContext(role, outsider);
  for (const f of apiFeatures) for (const t of f.cases) await record(t, role, () => t.run(c));
}

// ───────── 界面用例：每种身份一个新账号、一个浏览器页面 ─────────
if (WITH_UI) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
  const browser = await chromium.launch();
  // 全站页面：数学、语文、账号、网站首页（地址以 / 开头的是完整路径，以 # 开头的是数学页）
  const PAGES = ['#/', '#/contest/amc8', '#/contest/amc8/stats', '#/contest/amc8/records', '#/contest/hope', '#/contest/swb100', '#/graph', '#/graph/geo.area', '#/mistakes', '#/kp/geo.area', '#/kp/cnt.perm?family=swb100', '#/problem/amc8-2025-p01', '/account/', '/chinese/', '/chinese/#/hanzi', '/chinese/#/intro/hanzi-2021-city', '/chinese/#/mistakes', '/'];
  for (const role of Object.keys(ROLES)) {
    const c = await makeContext(role, outsider);
    const login = async (pg) => { await pg.goto(BASE + '/math/'); await pg.evaluate(([t, s]) => { localStorage.setItem('li.token', JSON.stringify(t)); localStorage.setItem('li.student', JSON.stringify(s)); }, [c.T, { id: c.sid, nickname: ROLES[role] }]); };
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    const errs = []; page.on('pageerror', (e) => errs.push(e.message)); c.errs = errs;
    await login(page);
    c.base = BASE;
    const url = (t) => BASE + (t === '#/account' ? '/account/' : t.startsWith('/') ? t : '/math/' + t);
    // 等页面稳定：加载漫画、换页变淡都结束
    const settle = async (pg) => { await pg.waitForTimeout(400); await pg.waitForFunction(() => !document.querySelector('body > .li-load, #app > .li-load') && !document.getElementById('app')?.classList.contains('page-wait'), null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(300); };
    const open = async (pg, t) => { await pg.goto(url(t)); await pg.reload().catch(() => {}); await settle(pg); };
    c.role = role; c.settle = () => settle(page);
    c.go = (t) => open(page, t);
    c.text = async (sel) => (await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => '')) || '';
    c.sweep = async (w, h, scheme) => {
      const pg = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
      const e2 = []; pg.on('pageerror', (e) => e2.push(e.message));
      await login(pg);
      const bad = []; const shape = {};
      for (const hsh of [...PAGES, `#/review/${c.session}`]) {
        await open(pg, hsh);
        // 版面一致：有左侧导航的页面，内容区宽度、标题大小和左边位置都要一样
        if (w >= 1024) { const s = await pg.evaluate(() => { const m = document.querySelector('#app > main'), h = document.querySelector('#app > main h1'); if (!document.querySelector('#app > .side') || !m || !h) return null; const r = m.getBoundingClientRect(); return `内容区 ${Math.round(r.x)}+${Math.round(r.width)}，标题 ${getComputedStyle(h).fontSize} 在 ${Math.round(h.getBoundingClientRect().x)}`; }); if (s) (shape[s] ||= []).push(hsh); }
        const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (ov > 1) bad.push(`${hsh} 溢出 ${ov}px`);
        // 版面检查：文字被截断（容器裁掉内容）、按钮文字折成多行、卡片里的标签被挤到折行
        const issues = await pg.evaluate(() => {
          const out = [];
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
          const name = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase());
          for (const el of document.querySelectorAll('main *, .auth-wrap *, .modal *')) {
            if (!vis(el) || !el.textContent.trim()) continue;
            const cs = getComputedStyle(el);
            if (cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && !el.matches('.katex, .katex *, .katex-display, .katex-display *, svg, svg *, .kg-wrap, .kg-wrap *, #kg, #kg *, .ctabs, .utable, table')) out.push(`截断 ${name(el)}「${el.textContent.trim().slice(0, 10)}」`);
          }
          // 同一段文字被折成两行（按钮、标签、价格这类本该一行的东西）
          for (const el of document.querySelectorAll('.btn, .tag, .kg-chip, .mm-tile, .sn-nav a span, .plan .price, .plan .pname, .et-year, .ph-stats dd')) {
            if (!vis(el) || el.matches('.block')) continue;
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              if (!n.textContent.trim() || getComputedStyle(n.parentElement).display === 'none') continue;
              const r = document.createRange(); r.selectNodeContents(n);
              const lines = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top)));
              if (lines.size > 1) { out.push(`折行 ${name(el)}「${n.textContent.trim().slice(0, 10)}」`); break; }
            }
          }
          return [...new Set(out)].slice(0, 3);
        });
        if (issues.length) bad.push(`${hsh} ${issues.join('、')}`);
      }
      await pg.close();
      const shapes = Object.entries(shape).sort((a, b) => b[1].length - a[1].length);
      for (const [s, hs] of shapes.slice(1)) bad.push(`版面和其他页不一样（${s}）：${hs.join(' ')}`);
      return bad.length || e2.length ? [...bad, ...e2.slice(0, 2)].join('；') : 'ok';
    };
    for (const f of FEATURES.filter((x) => x.id.startsWith('U'))) for (const t of f.cases) await record(t, role, async () => { const r = await t.run(page, c); await page.keyboard.press('Escape').catch(() => {}); return r; });
    await page.close();
  }
  await browser.close();
}

// ───────── 报告 ─────────
let pass = 0, fail = 0, skip = 0;
const cell = (r) => (!r ? '' : r.skip ? '—' : r.ok ? `✓ ${show(r.actual)}` : `✗ 实际 ${show(r.actual)}，应为 ${show(r.expect)}`);
const lines = [`# 标准测试报告`, '', `被测：${BASE}　时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, ''];
const body = [];
for (const f of FEATURES) {
  body.push(`### ${f.id} ${f.area} · ${f.name}`, '', '| 用例 | 测什么 | 游客 | 注册用户 | 会员 |', '|---|---|---|---|---|');
  for (const t of f.cases) {
    const r = results[t.id];
    for (const role of Object.keys(ROLES)) { const x = r[role]; if (x.skip) skip++; else if (x.ok) pass++; else fail++; }
    body.push(`| ${t.id} | ${t.name} | ${cell(r.guest)} | ${cell(r.user)} | ${cell(r.member)} |`);
  }
  body.push('');
}
const roleSum = Object.entries(ROLES).map(([k, n]) => {
  let p = 0, q = 0; for (const id in results) { const x = results[id][k]; if (!x.skip) (x.ok ? p++ : q++); }
  return `${n} ${p}/${p + q}`;
}).join('　');
lines.push(`**${fail ? `失败 ${fail} 项` : '全部通过'}**：${FEATURES.length} 个功能、${caseCount()} 个用例，三种身份共执行 ${pass + fail} 次，通过 ${pass}，失败 ${fail}，不适用 ${skip}。`, '', `按身份：${roleSum}`, '', ...body);
const md = lines.join('\n');
if (reportPath) writeFileSync(reportPath, md);

console.log(`\n${FEATURES.length} 个功能、${caseCount()} 个用例 × 3 种身份`);
for (const f of FEATURES) for (const t of f.cases) {
  const r = results[t.id];
  const mark = Object.keys(ROLES).map((k) => (r[k].skip ? '·' : r[k].ok ? '✓' : '✗')).join('');
  if (mark.includes('✗')) console.log(`  ✗ ${t.id} ${t.name}\n      ${Object.entries(ROLES).map(([k, n]) => `${n}：${cell(r[k])}`).join('\n      ')}`);
}
console.log(`\n${fail ? `失败 ${fail}` : '全部通过'}：执行 ${pass + fail} 次，通过 ${pass}，失败 ${fail}，不适用 ${skip}　（${roleSum}）`);
process.exit(fail ? 1 : 0);
