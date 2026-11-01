// 会员与免费次数测试：需要 FREE_MODE=false 的本地服务
//   wrangler dev --local --port 8788 --var ADMIN_KEY:localtest --var FREE_MODE:false
//   node amc8-src/tests/billing.mjs http://127.0.0.1:8788
const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const KEY = process.env.ADMIN_KEY || 'localtest';
const call = async (path, method = 'GET', body, token, admin) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { 'x-admin-key': KEY } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const ok = (c, m) => { if (!c) { console.error('✗', m); process.exit(1); } console.log('✓', m); };
const phone = '139' + String(Date.now()).slice(-8);

ok((await call('/math/api/auth/register', 'POST', { phone: '123', password: '123456', nickname: 'a' })).status === 400, '手机号格式校验');
const reg = await call('/math/api/auth/register', 'POST', { phone, password: 'secret1', nickname: '小测' });
ok(reg.status === 200 && reg.data.token, '手机号注册');
ok((await call('/math/api/auth/register', 'POST', { phone, password: 'secret1', nickname: 'b' })).status === 409, '重复手机号被拒');
ok((await call('/math/api/auth/login', 'POST', { phone, password: 'wrong00' })).status === 403, '密码错误被拒');
const login = await call('/math/api/auth/login', 'POST', { phone, password: 'secret1' });
ok(login.status === 200 && login.data.token === reg.data.token && login.data.student.nickname === '小测', '手机号登录拿到同一个账号');
const T = reg.data.token, sid = reg.data.student.id;
let acc = await call('/math/api/account', 'GET', null, T);
ok(Object.keys(acc.data.memberships).length === 0 && acc.data.credits === 10 && acc.data.plans.length === 6 && acc.data.plans.every((p) => ['math', 'all'].includes(p.scope)), '新账号：非会员、10 次、数学和全科各三档');
ok((await call('/api/account', 'GET', null, T)).status === 200, '全站接口 /api/account');

// 做一道题才能看互动解析
const pid = 'amc8-2025-p05';
ok((await call(`/math/api/problems/${pid}/advanced`, 'GET', null, T)).status === 403, '没做过不能看解析');
const s = await call('/math/api/sessions', 'POST', { problem_ids: [pid, 'amc8-2026-p05'], student_id: sid }, T);
await call(`/math/api/sessions/${s.data.session.id}/submit`, 'POST', { answers: {}, times: {}, flags: {} }, T);
const lockedAdv = await call(`/math/api/problems/${pid}/advanced`, 'GET', null, T);
ok(lockedAdv.status === 402 && lockedAdv.data.item === `adv:${pid}` && lockedAdv.data.credits === 10, '未解锁：402，带解锁项和剩余次数');
const sample = await call('/math/api/problems/amc8-2026-p05/advanced', 'GET', null, T);
ok(sample.status === 200, '2026 年是免费样板，不扣次数');
const u1 = await call('/math/api/unlock', 'POST', { item: `adv:${pid}` }, T);
ok(u1.data.charged && u1.data.credits === 9, '用 1 次解锁，剩 9 次');
const u2 = await call('/math/api/unlock', 'POST', { item: `adv:${pid}` }, T);
ok(!u2.data.charged && u2.data.credits === 9, '同一项再解锁不扣次数');
ok((await call(`/math/api/problems/${pid}/advanced`, 'GET', null, T)).status === 200, '解锁后可以看');
const pr = await call(`/math/api/problems/${pid}?student=${sid}`, 'GET', null, T);
ok(pr.data.advanced && pr.data.advanced.locked === false, '单题页显示已解锁');

// 突击
const d1 = await call('/math/api/sessions', 'POST', { kp_id: 'cnt.perm', student_id: sid }, T);
ok(d1.status === 402 && d1.data.item === 'drill:cnt.perm', '知识项突击未解锁：402');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'geo.area', student_id: sid }, T)).status === 200, '样板知识项突击免费');
const kp = await call(`/math/api/kp/cnt.perm?student=${sid}`, 'GET', null, T);
ok(kp.data.drill.locked === true, '知识项页显示突击未解锁');

// 次数用完
const list = await call('/math/api/admin/accounts?q=' + phone, 'GET', null, null, true);
const aid = list.data.accounts[0].id;
ok(list.data.accounts.length === 1 && list.data.accounts[0].credits === 9, '后台按手机号搜到账号');
ok((await call('/math/api/admin/accounts?q=x', 'GET')).status === 403, '后台需要管理员密钥');
await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'add_credits', value: -9, reason: '测试' }, null, true);
const u3 = await call('/math/api/unlock', 'POST', { item: 'drill:cnt.perm' }, T);
ok(u3.status === 402 && u3.data.need === 'member', '次数用完：引导开通会员');

// 后台手动加会员（分享活动）
const g = await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'add_days', value: 31, reason: '分享活动' }, null, true);
ok(g.data.account.memberships.math > Date.now() + 30 * 86400000, '后台加 31 天数学会员');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'cnt.perm', student_id: sid }, T)).status === 200, '会员可以直接突击');
ok((await call('/math/api/me', 'GET', null, T)).data.premium === true, '/me 显示会员');

// 激活码：续在原到期日之后
const codes = await call('/math/api/admin/codes', 'POST', { kind: 'days', amount: 92, count: 2, note: '测试' }, null, true);
ok(codes.data.codes.length === 2, '生成 2 个季卡激活码');
const before = (await call('/math/api/account', 'GET', null, T)).data.memberships.math;
const r1 = await call('/math/api/redeem', 'POST', { code: codes.data.codes[0].toLowerCase() }, T);
ok(r1.status === 200, '兑换激活码（不区分大小写）');
const after = (await call('/math/api/account', 'GET', null, T)).data.memberships.math;
ok(Math.round((after - before) / 86400000) === 92, '季卡接在原到期日后 92 天');
ok((await call('/math/api/redeem', 'POST', { code: codes.data.codes[0] }, T)).status === 409, '激活码不能重复用');
const cc = await call('/math/api/admin/codes', 'POST', { kind: 'credits', amount: 5 }, null, true);
await call('/math/api/redeem', 'POST', { code: cc.data.codes[0] }, T);
ok((await call('/math/api/account', 'GET', null, T)).data.credits === 5, '次数激活码 +5');

// 改到期日 / 取消
await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'set_expiry', value: '2030-06-30' }, null, true);
const e2 = (await call('/math/api/account', 'GET', null, T)).data.memberships.math;
ok(new Date(e2 - 1).toISOString().startsWith('2030-06-30'), '改到期日到 2030-06-30');
await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'revoke' }, null, true);
ok(!(await call('/math/api/account', 'GET', null, T)).data.memberships.math, '取消会员');

// 分科目会员：语文会员不能用数学内容，全科会员可以
await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'add_days', value: 31, tier: 'chinese' }, null, true);
ok((await call('/math/api/sessions', 'POST', { kp_id: 'nt.mod', student_id: sid }, T)).status === 402, '语文会员不能突击数学知识项');
const cAll = await call('/math/api/admin/codes', 'POST', { kind: 'days', amount: 92, tier: 'all' }, null, true);
const rAll = await call('/api/redeem', 'POST', { code: cAll.data.codes[0] }, T);
ok(rAll.data.tier === 'all' && rAll.data.tier_name === '全科', '兑换全科会员激活码');
ok((await call('/math/api/sessions', 'POST', { kp_id: 'nt.mod', student_id: sid }, T)).status === 200, '全科会员可以用数学内容');
const ms = (await call('/api/account', 'GET', null, T)).data.memberships;
ok(ms.all && ms.chinese && !ms.math, '账号页分别显示全科、语文会员');
await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'add_days', value: 31, tier: 'math' }, null, true);
const ms2 = (await call('/api/account', 'GET', null, T)).data.memberships;
ok(Math.round((ms2.math - ms2.all) / 86400000) === 31, '数学会员接在全科会员后面续');
ok((await call(`/math/api/admin/accounts/${aid}`, 'POST', { action: 'add_days', value: 31, tier: 'x' }, null, true)).status === 400, '会员种类校验');
ok((await call(`/math/api/problems/${pid}/advanced`, 'GET', null, T)).status === 200, '取消会员后，次数解锁过的仍可看');

// 老账号绑定手机号 + 重置密码
const old = await call('/math/api/auth/join', 'POST', { invite_code: 'AMC2026', nickname: '老用户' });
const phone2 = '138' + String(Date.now()).slice(-8);
ok((await call('/math/api/account/bind', 'POST', { phone: phone2, password: 'pass123' }, old.data.token)).status === 200, '老账号绑定手机号');
ok((await call('/math/api/auth/login', 'POST', { phone: phone2, password: 'pass123' })).data.token === old.data.token, '绑定后用手机号登录回到老账号');
const oid = (await call('/math/api/admin/accounts?q=' + phone2, 'GET', null, null, true)).data.accounts[0].id;
await call(`/math/api/admin/accounts/${oid}`, 'POST', { action: 'reset_password', value: 'newpass9' }, null, true);
ok((await call('/math/api/auth/login', 'POST', { phone: phone2, password: 'newpass9' })).status === 200, '后台重置密码');
const logs = await call('/math/api/admin/log', 'GET', null, null, true);
ok(logs.data.some((l) => l.action === 'add_days' && l.detail.includes('分享活动')) && !logs.data.some((l) => l.detail.includes('newpass9')), '操作记录有原因，不记密码');

// 删除账号
const del = await call(`/math/api/admin/accounts/${oid}`, 'DELETE', null, null, true);
ok(del.status === 200 && del.data.deleted.students === 1, '后台删除账号');
ok((await call('/math/api/auth/login', 'POST', { phone: phone2, password: 'newpass9' })).status === 403, '删除后不能登录');
ok((await call('/math/api/me', 'GET', null, old.data.token)).status === 401, '删除后原登录失效');
ok((await call(`/math/api/admin/accounts/${aid}`, 'DELETE')).status === 403, '删除需要管理员密钥');
const del2 = await call(`/math/api/admin/accounts/${aid}`, 'DELETE', null, null, true);
ok(del2.status === 200, '有做题记录、解锁、会员记录的账号也能删');
ok((await call('/math/api/admin/accounts?q=' + phone, 'GET', null, null, true)).data.accounts.length === 0, '后台搜不到了');
