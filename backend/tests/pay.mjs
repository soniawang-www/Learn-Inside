// 在线支付测试：用自己生成的两对密钥模拟“应用”和“支付宝”，外加一个假的支付宝网关（只回答订单查询）
// 准备：node keys.mjs 生成 keys.json；node mockgw.mjs 起假网关（8799）；wrangler dev 带上
//   ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY（应用私钥）/ ALIPAY_PUBLIC_KEY（“支付宝”公钥）/ ALIPAY_GATEWAY / PRICE_*
//   node backend/tests/pay.mjs http://127.0.0.1:8788 /tmp/paytest
import { createSign, createVerify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8788';
const DIR = process.argv[3] || '/tmp/paytest';
const K = JSON.parse(readFileSync(`${DIR}/keys.json`, 'utf8'));
const call = async (path, method = 'GET', body, token, admin) => {
  const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { 'x-admin-key': 'localtest' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, data: await r.json().catch(() => ({})) };
};
const ok = (c, m) => { if (!c) { console.error('✗', m); process.exit(1); } console.log('✓', m); };
const content = (p, omit) => Object.keys(p).filter((k) => !omit.includes(k) && p[k] !== '').sort().map((k) => `${k}=${p[k]}`).join('&');
const notify = async (params) => {
  const s = createSign('RSA-SHA256'); s.update(content(params, ['sign', 'sign_type']));
  const body = new URLSearchParams({ ...params, sign_type: 'RSA2', sign: s.sign(K.aliPriv, 'base64') });
  const r = await fetch(BASE + '/math/api/pay/notify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  return r.text();
};

const reg = await call('/math/api/auth/register', 'POST', { phone: '135' + String(Date.now()).slice(-8), password: 'pay123', nickname: '付款' });
const T = reg.data.token;
const acc = await call('/math/api/account', 'GET', null, T);
ok(acc.data.pay_ready && acc.data.plans.filter((p) => p.scope === 'math').map((p) => p.price).join() === '39,99,299', '支付已配置，数学三档 39/99/299');

const c1 = await call('/math/api/pay/create', 'POST', { plan: 'math.month' }, T);
const u = new URL(c1.data.url);
const q = Object.fromEntries(u.searchParams);
const v = createVerify('RSA-SHA256'); v.update(content(q, ['sign']));
ok(v.verify(K.appPub, q.sign, 'base64'), '收银台地址用应用私钥 RSA2 签名，验签通过');
const biz = JSON.parse(q.biz_content);
ok(q.method === 'alipay.trade.page.pay' && biz.total_amount === '39.00' && biz.product_code === 'FAST_INSTANT_TRADE_PAY' && biz.out_trade_no === c1.data.order_id, '电脑：page.pay，金额 39.00');
ok(!('notify_url' in q) && q.return_url.includes('/api/pay/return?o=') && q.return_url.endsWith('&f=math'), '本地 http 不传 notify_url（上线是 https 才传），跳回地址是全站的');
const m = await call('/math/api/pay/create', 'POST', { plan: 'math.year', mobile: true }, T);
const mq = Object.fromEntries(new URL(m.data.url).searchParams);
ok(mq.method === 'alipay.trade.page.pay' && JSON.parse(mq.biz_content).product_code === 'FAST_INSTANT_TRADE_PAY', '手机浏览器也用 page.pay（AI 网页应用收款只签了这个接口）');
ok((await call('/math/api/pay/create', 'POST', { plan: 'nope' }, T)).status === 400, '不存在的套餐被拒');

const base = { notify_time: '2026-11-01 22:00:00', notify_type: 'trade_status_sync', notify_id: 'n1', app_id: '2021000000000001', out_trade_no: c1.data.order_id, trade_no: 'T001', trade_status: 'TRADE_SUCCESS', total_amount: '39.00', buyer_logon_id: 'abc***@x.com' };
ok(await notify({ ...base, total_amount: '0.01' }) === 'fail', '金额不符的通知被拒');
ok(await notify({ ...base, app_id: '999' }) === 'fail', 'app_id 不符被拒');
{
  const body = new URLSearchParams({ ...base, sign_type: 'RSA2', sign: 'AAAA' });
  ok(await (await fetch(BASE + '/math/api/pay/notify', { method: 'POST', body })).text() === 'fail', '签名不对被拒');
}
ok(!(await call('/math/api/account', 'GET', null, T)).data.memberships.math, '以上都没有开通会员');
ok(await notify({ ...base, refund_fee: '39.00', gmt_refund: '2026-11-02 00:00:00', out_biz_no: 'R1' }) === 'success', '退款通知回 success');
ok(!(await call('/math/api/account', 'GET', null, T)).data.memberships.math, '退款通知不会开通会员');
ok(await notify(base) === 'success', '正确的付款通知 → success');
const a1 = await call('/math/api/account', 'GET', null, T);
a1.data.member_until = a1.data.memberships.math;
ok(Math.round((a1.data.member_until - Date.now()) / 86400000) === 31, '开通数学月卡 31 天');
ok(await notify(base) === 'success', '重复通知也回 success');
ok((await call('/math/api/account', 'GET', null, T)).data.memberships.math === a1.data.member_until, '重复通知不重复加天数');
const o1 = await call(`/math/api/pay/orders/${c1.data.order_id}`, 'GET', null, T);
ok(o1.data.status === 'paid', '订单状态：已付款');

// 没收到通知：查订单时主动问支付宝（假网关返回已付款）
const c2 = await call('/math/api/pay/create', 'POST', { plan: 'math.quarter' }, T);
writeFileSync(`${DIR}/amount`, '99.00');
const o2 = await call(`/math/api/pay/orders/${c2.data.order_id}`, 'GET', null, T);
ok(o2.data.status === 'paid' && Math.round((o2.data.member_until - a1.data.member_until) / 86400000) === 92, '主动查询到已付款 → 季卡接在后面 92 天');
const c3 = await call('/math/api/pay/create', 'POST', { plan: 'math.month' }, T);
writeFileSync(`${DIR}/amount`, '1.00');
ok((await call(`/math/api/pay/orders/${c3.data.order_id}`, 'GET', null, T)).data.status === 'pending', '查询金额不符：不开通');

const ret = await call(`/math/api/pay/return?o=${c1.data.order_id}&trade_no=T001`);
ok(ret.status === 302 && ret.headers.get('location').endsWith(`/math/#/account/paid/${c1.data.order_id}`), '付完跳回网页结果页');
const ca = await call('/api/pay/create', 'POST', { plan: 'all.year' }, T);
ok(ca.status === 200 && JSON.parse(new URL(ca.data.url).searchParams.get('biz_content')).total_amount === '599.00', '全科年卡 599');
const other = await call('/math/api/auth/register', 'POST', { phone: '136' + String(Date.now()).slice(-8), password: 'pay123', nickname: '别人' });
ok((await call(`/math/api/pay/orders/${c1.data.order_id}`, 'GET', null, other.data.token)).status === 404, '看不到别人的订单');
const orders = await call('/math/api/admin/orders', 'GET', null, null, true);
ok(orders.data.filter((o) => o.status === 'paid').length >= 2, '后台能看到订单');

// 退款：整单退，收回这笔订单开的会员天数
const before = (await call('/api/account', 'GET', null, T)).data.memberships;
const rf = await call(`/api/admin/orders/${c1.data.order_id}/refund`, 'POST', { reason: '测试退款' }, null, true);
ok(rf.data.ok && rf.data.status === 'refunded', '后台退款成功');
const after = (await call('/api/account', 'GET', null, T)).data.memberships;
ok(!after.math || after.math < before.math, '退款后收回这笔订单的会员天数');
ok((await call(`/api/admin/orders/${c1.data.order_id}/refund`, 'POST', {}, null, true)).data.status === 'refunded', '重复退款不会再退');
const c4 = await call('/api/pay/create', 'POST', { plan: 'math.month' }, T);
writeFileSync(`${DIR}/amount`, '0.00');
const cl = await call(`/api/admin/orders/${c4.data.order_id}/close`, 'POST', {}, null, true);
ok(cl.data.status === 'closed', '关闭未付款订单');
