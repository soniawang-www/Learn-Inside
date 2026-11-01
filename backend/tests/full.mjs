// 全盘测试：游客、注册送 10 次、额度用完、会员时间（叠加 / 改到期 / 取消 / 分科目 / 全科）、多孩子、
// 免费样板、知识项突击、错题本周期、在线支付（下单 / 通知 / 退款 / 上限）、后台管理、客服。
//
// 需要一个正式收费模式（FREE_MODE=false）的本地服务，带假支付宝（见 pay.mjs 开头）和 PAY_MAX_AMOUNT=100：
//   node backend/tests/full.mjs http://127.0.0.1:8788 /tmp/paytest [sqlite 文件]
// 第三个参数给出本地 D1 的 sqlite 文件时，会把订正记录改早 8 天，测试“该复习 → 已掌握”。
// 另可再给一个试用模式（FREE_MODE=true）服务：FREE_BASE=http://127.0.0.1:8787
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const DIR = process.argv[3] || '/tmp/paytest';
const DB_FILE = process.argv[4] || '';
const FREE_BASE = process.env.FREE_BASE || '';
const K = JSON.parse(readFileSync(`${DIR}/keys.json`, 'utf8'));
const DAY = 86400000;

let pass = 0;
const fails = [];
const section = (t) => console.log(`\n── ${t}`);
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fails.push(m); console.log('  ✗', m); } };
const req = async (base, path, method = 'GET', body, token, admin) => {
  const r = await fetch(base + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { 'x-admin-key': 'localtest' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
};
const call = (...a) => req(BASE, ...a);
const adminDo = (aid, action, value, tier, reason = '全盘测试') => call(`/api/admin/accounts/${aid}`, 'POST', { action, value, tier, reason }, null, true);
const acct = (T) => call('/api/account', 'GET', null, T).then((r) => r.data);
const phoneNo = (p) => p + String(Date.now()).slice(-8);
async function doProblems(T, sid, ids, answers = {}) {
  const s = await call('/math/api/sessions', 'POST', { problem_ids: ids, student_id: sid }, T);
  const sub = await call(`/math/api/sessions/${s.data.session.id}/submit`, 'POST', { answers, times: {}, flags: {} }, T);
  return sub.data;
}
const adv = (id, T) => call(`/math/api/problems/${id}/advanced`, 'GET', null, T);
const p25 = (n) => `amc8-2025-p${String(n).padStart(2, '0')}`;
const p24 = (n) => `amc8-2024-p${String(n).padStart(2, '0')}`;

// ═════════════════════════════════════════════
section('1. 游客');
const g = await call('/api/auth/guest', 'POST', {});
const GT = g.data.token, gsid = g.data.student.id;
let me = (await call('/math/api/me', 'GET', null, GT)).data;
ok(g.status === 200 && me.guest && me.credits === 0 && !me.has_phone, '游客进入：没有手机号，免费次数 0');
await doProblems(GT, gsid, [p25(1), 'amc8-2026-p01']);
ok((await adv('amc8-2026-p01', GT)).status === 200, '游客能看免费样板（2026 年互动解析）');
const gl = await adv(p25(1), GT);
ok(gl.status === 402 && gl.data.credits === 0, '游客看其他互动解析：402，次数 0');
ok((await call('/api/unlock', 'POST', { item: `adv:${p25(1)}` }, GT)).status === 402, '游客不能用次数解锁');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'geo.area', student_id: gsid }, GT)).status === 200, '游客能开免费样板知识项突击');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'cnt.perm', student_id: gsid }, GT)).status === 402, '游客不能开其他知识项突击');
ok((await call('/api/pay/create', 'POST', { plan: 'math.month' }, GT)).status === 403, '游客不能在线开通会员');
const gcode = (await call('/api/admin/codes', 'POST', { kind: 'days', amount: 31 }, null, true)).data.codes[0];
ok((await call('/api/redeem', 'POST', { code: gcode }, GT)).status === 403, '游客不能兑换激活码');

// ═════════════════════════════════════════════
section('2. 注册送 10 次');
const PH = phoneNo('135');
const b = await call('/api/account/bind', 'POST', { phone: PH, password: 'full123', nickname: '全测' }, GT);
ok(b.status === 200 && b.data.credits_added === 10, '游客注册：送 10 次');
let a = await acct(GT);
ok(a.credits === 10 && !a.guest && a.phone === PH, '账号页：10 次，已是正式账号');
ok((await call('/api/account/bind', 'POST', { phone: phoneNo('136'), password: 'x12345' }, GT)).status === 409, '不能重复绑定');
const prof0 = (await call(`/math/api/students/${gsid}/profile`, 'GET', null, GT)).data;
ok(prof0.mistakes.length >= 1, '游客时的错题保留到正式账号');
const direct = await call('/api/auth/register', 'POST', { phone: phoneNo('137'), password: 'full123', nickname: '直接注册' });
ok(direct.status === 200 && (await acct(direct.data.token)).credits === 10, '直接注册也是 10 次');
ok((await call('/api/auth/register', 'POST', { phone: PH, password: 'full123', nickname: 'x' })).status === 409, '同一手机号不能注册两次');
ok((await call('/api/auth/login', 'POST', { phone: PH, password: 'full123' })).data.token === GT, '手机号登录回到同一账号');
ok((await call('/api/auth/login', 'POST', { phone: PH, password: 'wrong99' })).status === 403, '密码错误不能登录');

// ═════════════════════════════════════════════
section('3. 10 次额度：逐次扣、不重复扣、用完拦住');
const T = GT, sid = gsid;
const aid = (await call('/api/admin/accounts?q=' + PH, 'GET', null, null, true)).data.accounts[0].id;
await doProblems(T, sid, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(p25));
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `adv:${p25(n)}`).concat(['drill:cnt.perm']); // 9 道互动解析 + 1 个突击 = 10 次
let left = 10, allCharged = true;
for (const it of items) {
  const r = await call('/api/unlock', 'POST', { item: it }, T);
  left--;
  if (!(r.status === 200 && r.data.charged && r.data.credits === left)) allCharged = false;
}
ok(allCharged && left === 0, '解锁 10 项，每次扣 1 次，剩 0');
const re = await call('/api/unlock', 'POST', { item: `adv:${p25(3)}` }, T);
ok(re.status === 200 && !re.data.charged && re.data.credits === 0, '已解锁的再点不扣次数');
ok((await adv(p25(3), T)).status === 200 && (await adv(p25(9), T)).status === 200, '解锁过的互动解析能看');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'cnt.perm', student_id: sid }, T)).status === 200, '解锁过的知识项突击能反复开');
const out = await call('/api/unlock', 'POST', { item: `adv:${p25(10)}` }, T);
ok(out.status === 402 && out.data.need === 'member', '第 11 次：次数用完，提示开通会员');
ok((await adv(p25(10), T)).status === 402, '没解锁的仍然锁着');
ok((await adv('amc8-2026-p01', T)).status === 200, '次数用完，免费样板照样能看');
const rv = (await call(`/math/api/problems/${p25(3)}?student=${sid}`, 'GET', null, T)).data;
const rv10 = (await call(`/math/api/problems/${p25(10)}?student=${sid}`, 'GET', null, T)).data;
ok(rv.advanced?.locked === false && rv10.advanced?.locked === true, '题目页的锁标记正确（解锁的开、没解锁的锁）');
ok((await call(`/math/api/problems/${p25(20)}/advanced`, 'GET', null, T)).status === 403, '没做过的题不能看解析（防止考前偷看）');
ok((await call('/api/unlock', 'POST', { item: 'adv:nope' }, T)).status === 404 && (await call('/api/unlock', 'POST', { item: 'x:y' }, T)).status === 400, '解锁项校验');
await adminDo(aid, 'add_credits', 3);
ok((await acct(T)).credits === 3, '后台加 3 次');
await adminDo(aid, 'add_credits', -10);
ok((await acct(T)).credits === 0, '后台减次数不会变成负数');

// ═════════════════════════════════════════════
section('4. 会员时间管理');
const start = Date.now();
await adminDo(aid, 'add_days', 31, 'math');
a = await acct(T);
ok(Math.abs(a.memberships.math - (start + 31 * DAY)) < 60000, '加 31 天数学会员，到期日 = 现在 + 31 天');
ok((await adv(p25(10), T)).status === 200, '会员期间没解锁的也能看');
const ur = await call('/api/unlock', 'POST', { item: `adv:${p25(11)}` }, T);
ok(ur.status === 200 && !ur.data.charged && (await acct(T)).credits === 0, '会员不扣次数');
ok((await call('/math/api/me', 'GET', null, T)).data.premium === true, '/me 显示会员');
const code92 = (await call('/api/admin/codes', 'POST', { kind: 'days', amount: 92, tier: 'math' }, null, true)).data.codes[0];
const r92 = await call('/api/redeem', 'POST', { code: code92 }, T);
a = await acct(T);
ok(r92.status === 200 && Math.round((a.memberships.math - start) / DAY) === 123, '兑换季卡激活码：接在后面，共 123 天');
ok((await call('/api/redeem', 'POST', { code: code92 }, T)).status === 409, '激活码只能用一次');
ok((await call('/api/redeem', 'POST', { code: 'NOTEXIST00' }, T)).status === 404, '不存在的激活码');
await adminDo(aid, 'add_days', 31, 'all');
a = await acct(T);
ok(a.memberships.all && Math.round((a.memberships.all - start) / DAY) === 31, '再开全科 31 天：全科单独计时');
ok(Math.round((a.memberships.math - start) / DAY) === 123, '数学会员到期日不变（已经比全科长）');
// 改到期日：昨天 → 不是数学会员（全科还在，仍能看）
const ymd = (t) => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
await adminDo(aid, 'set_expiry', ymd(Date.now() - DAY), 'math');
a = await acct(T);
ok(!('math' in a.memberships) || a.memberships.math <= Date.now() + 31 * DAY + 60000, '数学会员改到昨天：数学会员记录失效（只剩全科）');
ok((await adv(p25(12), T)).status === 200, '全科会员覆盖数学内容');
await adminDo(aid, 'revoke', null, 'all');
await adminDo(aid, 'revoke', null, 'math');
a = await acct(T);
ok(Object.keys(a.memberships).length === 0, '取消全科和数学会员：不是会员了');
ok((await adv(p25(12), T)).status === 402, '会员没了，没解锁的又锁上');
ok((await adv(p25(3), T)).status === 200, '会员没了，用次数解锁过的还能看');
await adminDo(aid, 'set_expiry', ymd(Date.now()), 'math');
a = await acct(T);
const endToday = Date.UTC(...ymd(Date.now()).split('-').map((x, i) => (i === 1 ? +x - 1 : +x))) + DAY - 8 * 3600000;
ok(a.memberships.math === endToday, '到期日改成今天：到北京时间今天 24:00');
ok((await adv(p25(12), T)).status === 200, '今天还是会员');
await adminDo(aid, 'revoke', null, 'math');
await adminDo(aid, 'add_days', 31, 'chinese');
ok((await adv(p25(12), T)).status === 402, '语文会员不能看数学内容');
await adminDo(aid, 'revoke', null, 'chinese');
ok((await adminDo(aid, 'add_days', 31, 'xx')).status === 400 && (await adminDo(aid, 'add_days', 0, 'math')).status === 400, '后台参数校验（会员种类、天数）');
ok((await adminDo(aid, 'set_expiry', '2026/1/1', 'math')).status === 400, '日期格式校验');

// ═════════════════════════════════════════════
section('5. 多个孩子共用会员和次数');
const kid2 = await call('/math/api/students', 'POST', { nickname: '老二' }, T);
await doProblems(T, kid2.data.id, [p25(3), p25(13)]);
ok((await adv(p25(3), T)).status === 200, '老二也能看账号已解锁的题');
ok((await adv(p25(13), T)).status === 402, '没解锁的对老二也锁着');
const me2 = (await call('/math/api/me', 'GET', null, T)).data;
ok(me2.students.length === 2, '账号下两个孩子');
const other = await call('/api/auth/register', 'POST', { phone: phoneNo('138'), password: 'full123', nickname: '别人' });
ok((await call(`/math/api/students/${sid}/profile`, 'GET', null, other.data.token)).status === 404, '别的账号看不到这个孩子');

// ═════════════════════════════════════════════
section('6. 错题本周期：待订正 → 已订正 → 该复习 → 已掌握');
const fresh = await call('/api/auth/register', 'POST', { phone: phoneNo('139'), password: 'full123', nickname: '错题' });
const FT = fresh.data.token, fsid = fresh.data.student.id;
const pid = p24(5);
const ans = (await doProblems(FT, fsid, [pid], { [pid]: 'A' })).items[0];
const right = ans.answer, wrongPick = ans.correct ? null : ans.choice;
if (ans.correct) await doProblems(FT, fsid, [pid], { [pid]: ['A', 'B', 'C', 'D', 'E'].find((x) => x !== right) });
let ms = (await call(`/math/api/students/${fsid}/profile`, 'GET', null, FT)).data.mistakes.find((m) => m.problem_id === pid);
ok(ms?.status === 'pending', '做错 → 待订正');
const fix = await call('/math/api/sessions', 'POST', { problem_ids: [pid], student_id: fsid, purpose: 'pending' }, FT);
ok(fix.data.exam?.title === '错题订正', '错题订正会话');
await call(`/math/api/sessions/${fix.data.session.id}/submit`, 'POST', { answers: { [pid]: right }, times: {}, flags: {} }, FT);
ms = (await call(`/math/api/students/${fsid}/profile`, 'GET', null, FT)).data.mistakes.find((m) => m.problem_id === pid);
ok(ms.status === 'fixed' && Math.round((ms.review_at - Date.now()) / DAY) === 7, '订正做对 → 已订正，7 天后复习');
if (DB_FILE) {
  try {
    execFileSync('python3', ['-c', `import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE attempt_event SET created_at=created_at-8*86400000 WHERE student_id=?",(sys.argv[2],));c.commit()`, DB_FILE, fsid]);
    ms = (await call(`/math/api/students/${fsid}/profile`, 'GET', null, FT)).data.mistakes.find((m) => m.problem_id === pid);
    ok(ms.status === 'due', '过了 7 天 → 该复习');
    const rev = await call('/math/api/sessions', 'POST', { problem_ids: [pid], student_id: fsid, purpose: 'due' }, FT);
    await call(`/math/api/sessions/${rev.data.session.id}/submit`, 'POST', { answers: { [pid]: right }, times: {}, flags: {} }, FT);
    ms = (await call(`/math/api/students/${fsid}/profile`, 'GET', null, FT)).data.mistakes.find((m) => m.problem_id === pid);
    ok(ms.status === 'mastered', '复习又做对 → 已掌握');
    await doProblems(FT, fsid, [pid], { [pid]: ['A', 'B', 'C', 'D', 'E'].find((x) => x !== right) });
    ms = (await call(`/math/api/students/${fsid}/profile`, 'GET', null, FT)).data.mistakes.find((m) => m.problem_id === pid);
    ok(ms.status === 'pending' && ms.wrong_n === 2, '再做错 → 回到待订正，错 2 次');
  } catch (e) { fails.push('改 sqlite 时间失败：' + e.message); }
} else console.log('  （没给 sqlite 文件，跳过“该复习 / 已掌握”）');
const kpg = (await call(`/math/api/students/${fsid}/graph`, 'GET', null, FT)).data;
ok(kpg.nodes.some((n) => n.wrong?.total >= 1), '错题挂到知识图谱的知识项上');

// ═════════════════════════════════════════════
section('7. 在线支付');
const content = (p, omit) => Object.keys(p).filter((k) => !omit.includes(k) && p[k] !== '').sort().map((k) => `${k}=${p[k]}`).join('&');
const notify = async (params) => {
  const s = createSign('RSA-SHA256'); s.update(content(params, ['sign', 'sign_type']));
  const r = await fetch(BASE + '/api/pay/notify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...params, sign_type: 'RSA2', sign: s.sign(K.aliPriv, 'base64') }) });
  return r.text();
};
a = await acct(T);
const big = a.plans.find((p) => p.price && !p.online), small = a.plans.find((p) => p.id === 'math.month');
ok(small?.online && big, `价格上限：${small.name} 可在线付，${big.name} ¥${big.price} 暂不支持`);
ok((await call('/api/pay/create', 'POST', { plan: big.id }, T)).status === 400, '超过上限的套餐不能下单');
const order = await call('/api/pay/create', 'POST', { plan: 'math.month' }, T);
const q = Object.fromEntries(new URL(order.data.url).searchParams);
ok(q.method === 'alipay.trade.page.pay' && JSON.parse(q.biz_content).total_amount === small.price.toFixed(2), '下单：page.pay，金额由服务端按套餐算');
const nbase = { notify_type: 'trade_status_sync', notify_id: 'nf1', app_id: '2021000000000001', out_trade_no: order.data.order_id, trade_no: 'TFULL1', trade_status: 'TRADE_SUCCESS', total_amount: small.price.toFixed(2) };
ok(await notify({ ...nbase, total_amount: '0.01' }) === 'fail', '金额不对的通知不认');
ok(await notify({ ...nbase, refund_fee: '1', gmt_refund: 'x', out_biz_no: 'r' }) === 'success' && !(await acct(T)).memberships.math, '退款类通知不开通');
ok(await notify(nbase) === 'success', '付款通知 → success');
a = await acct(T);
ok(Math.round((a.memberships.math - Date.now()) / DAY) === 31, '付款后数学会员 31 天');
await notify(nbase);
ok((await acct(T)).memberships.math === a.memberships.math, '重复通知不重复加');
const rf = await call(`/api/admin/orders/${order.data.order_id}/refund`, 'POST', { reason: '全盘测试' }, null, true);
ok(rf.data.status === 'refunded' && !(await acct(T)).memberships.math, '退款后收回这笔订单的会员');
const ret = await call(`/api/pay/return?o=${order.data.order_id}&f=math`);
ok(ret.status === 302 && ret.headers.get('location').includes('#/account/paid/'), '付完跳回结果页');

// ═════════════════════════════════════════════
section('8. 后台与客服');
ok((await call('/api/admin/accounts', 'GET')).status === 403 && (await call('/api/admin/accounts', 'GET', null, null, false)).status === 403, '后台没有密钥一律拒绝');
const list = (await call('/api/admin/accounts?q=全测', 'GET', null, null, true)).data;
ok(list.accounts.some((x) => x.phone === PH && x.students.includes('全测')), '后台按孩子昵称搜到账号');
const logs = (await call(`/api/admin/log?account=${aid}`, 'GET', null, null, true)).data;
ok(logs.some((l) => l.action === 'add_days') && logs.some((l) => l.action === 'redeem') && logs.some((l) => l.action === 'pay') && logs.some((l) => l.action === 'refund'), '操作记录有加会员、兑换、支付、退款');
const ps = (await call('/api/admin/pay-status', 'GET', null, null, true)).data;
ok(ps.pay_ready && ps.private_key === 'ok' && ps.public_key === 'ok', '支付配置自检：已就绪');
ok((await call('/api/support')).status === 200, '客服信息不登录也能取');
const del = await call(`/api/admin/accounts/${(await call('/api/admin/accounts?q=别人', 'GET', null, null, true)).data.accounts[0].id}`, 'DELETE', null, null, true);
ok(del.status === 200 && (await call('/math/api/me', 'GET', null, other.data.token)).status === 401, '删除账号后登录失效');

// ═════════════════════════════════════════════
if (FREE_BASE) {
  section('9. 试用模式（FREE_MODE=true）');
  const fr = await req(FREE_BASE, '/api/auth/register', 'POST', { phone: phoneNo('133'), password: 'full123', nickname: '试用' });
  const FT2 = fr.data.token;
  await (async () => { const s = await req(FREE_BASE, '/math/api/sessions', 'POST', { problem_ids: [p25(14)], student_id: fr.data.student.id }, FT2); await req(FREE_BASE, `/math/api/sessions/${s.data.session.id}/submit`, 'POST', { answers: {}, times: {}, flags: {} }, FT2); })();
  ok((await req(FREE_BASE, `/math/api/problems/${p25(14)}/advanced`, 'GET', null, FT2)).status === 200, '试用模式：互动解析直接能看');
  const u = await req(FREE_BASE, '/api/unlock', 'POST', { item: `adv:${p25(14)}` }, FT2);
  ok(!u.data.charged && (await req(FREE_BASE, '/api/account', 'GET', null, FT2)).data.credits === 10, '试用模式：不扣次数，注册的 10 次留着');
}

console.log(`\n通过 ${pass} 项${fails.length ? `，失败 ${fails.length} 项：\n  - ${fails.join('\n  - ')}` : '，全部通过'}`);
process.exit(fails.length ? 1 : 0);
