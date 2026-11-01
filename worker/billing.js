// 账号（手机号 + 密码）、会员、免费次数、激活码、会员管理后台
//
// 权限规则（canUse）：
//   FREE_MODE=true（试用期）→ 全部放开
//   免费样板（SAMPLES）→ 不扣次数
//   会员有效期内 → 全部放开
//   用过 1 次解锁的内容（unlock 表）→ 永久可看
//   其余：用 1 次免费次数解锁（新账号送 FREE_CREDITS 次），次数用完提示开通会员
// 解锁项：adv:<题目 id> 一道题的互动解析；drill:<知识项 id> 一个知识项的真题突击（都属于数学）
//
// 全站一套账号；会员分科目（entitlement.tier = math / chinese）和全科（all），全科包含所有科目。
// 免费次数全站共用。接口在 /api/ 下（/math/api/ 也能访问，兼容旧页面）。

import { payUrl, verifyNotify, queryTrade, refundTrade, refundQuery, closeTrade, keyStatus } from './alipay.js';

export const FREE_CREDITS = 10;
export const SAMPLES = { exams: ['amc8-2026'], drills: ['geo.area', 'app.ratio'] };
// 会员种类：live = 已经上线、账号页显示套餐
export const SCOPES = [
  { id: 'math', name: '数学', live: true },
  { id: 'chinese', name: '语文', live: false },
  { id: 'all', name: '全科', live: true },
];
export const PERIODS = [
  { id: 'month', name: '月卡', days: 31 },
  { id: 'quarter', name: '季卡', days: 92 },
  { id: 'year', name: '年卡', days: 366 },
];
// 解锁项属于哪个科目
const KIND_SUBJECT = { adv: 'math', drill: 'math' };
const SUBJECTS = SCOPES.filter((x) => x.id !== 'all').map((x) => x.id);
const DAY = 86400000;

export const BILLING_MIGRATIONS = [
  'ALTER TABLE account ADD COLUMN phone TEXT',
  'ALTER TABLE account ADD COLUMN pw_hash TEXT',
  `ALTER TABLE account ADD COLUMN credits INTEGER NOT NULL DEFAULT ${FREE_CREDITS}`,
  'ALTER TABLE account ADD COLUMN note TEXT',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_account_phone ON account(phone)',
  `CREATE TABLE IF NOT EXISTS unlock (account_id TEXT NOT NULL REFERENCES account(id), item TEXT NOT NULL,
     created_at INTEGER NOT NULL, PRIMARY KEY (account_id, item))`,
  `CREATE TABLE IF NOT EXISTS redeem_code (code TEXT PRIMARY KEY, kind TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT,
     created_at INTEGER NOT NULL, used_by TEXT, used_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS pay_order (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES account(id), plan TEXT NOT NULL,
     days INTEGER NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', trade_no TEXT, buyer TEXT,
     created_at INTEGER NOT NULL, paid_at INTEGER)`,
  'ALTER TABLE pay_order ADD COLUMN refund_no TEXT',
  'ALTER TABLE pay_order ADD COLUMN refunded_at INTEGER',
  `CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, action TEXT NOT NULL,
     detail TEXT, created_at INTEGER NOT NULL)`,
  'ALTER TABLE pay_order ADD COLUMN tier TEXT',
  'ALTER TABLE redeem_code ADD COLUMN tier TEXT',
  "UPDATE entitlement SET tier = 'math' WHERE tier = 'premium'", // 只有数学时开的会员算数学会员
  'CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)',
  'ALTER TABLE account ADD COLUMN guest INTEGER NOT NULL DEFAULT 0',
];

export function registerBilling({ route, json, HttpError, body, requireAccount, uid, now }) {
  // ───────── 密码 ─────────
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  async function pbkdf2(password, salt, iter) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, key, 256));
  }
  async function hashPw(password) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    return `pbkdf2$100000$${salt}$${await pbkdf2(password, salt, 100000)}`;
  }
  async function checkPw(password, stored) {
    const [, iter, salt, h] = String(stored || '').split('$');
    if (!h) return false;
    return (await pbkdf2(password, salt, +iter)) === h;
  }
  const normPhone = (p) => String(p || '').replace(/[\s-]/g, '');
  function checkInput(phone, password) {
    if (!/^1\d{10}$/.test(phone)) throw new HttpError(400, '请填写 11 位手机号');
    if (String(password || '').length < 6) throw new HttpError(400, '密码至少 6 位');
  }

  // ───────── 会员与次数 ─────────
  const validTier = (t) => SCOPES.some((x) => x.id === t);
  /** 这些会员种类连续有效到什么时候：null = 没有，Infinity = 永久（续费的几段首尾相接合起来算） */
  async function chainUntil(env, accountId, tiers) {
    const t = now();
    const { results } = await env.DB
      .prepare(`SELECT starts_at, expires_at FROM entitlement WHERE account_id = ? AND tier IN (${tiers.map(() => '?').join(',')})
                 AND (expires_at IS NULL OR expires_at > ?) ORDER BY starts_at`)
      .bind(accountId, ...tiers, t).all();
    let until = null;
    for (const r of results) {
      if (r.starts_at > (until ?? t)) break;
      if (r.expires_at === null) return Infinity;
      until = Math.max(until ?? t, r.expires_at);
    }
    return until;
  }
  /** 某科能不能用会员内容：本科会员或全科会员 */
  const memberUntil = (env, accountId, subject = 'math') => chainUntil(env, accountId, [subject, 'all']);
  /** 每种会员各自到期时间（账号页、后台显示） */
  async function memberships(env, accountId) {
    const out = {};
    const { results } = await env.DB.prepare('SELECT DISTINCT tier FROM entitlement WHERE account_id = ? AND (expires_at IS NULL OR expires_at > ?)')
      .bind(accountId, now()).all();
    for (const { tier } of results) {
      if (!validTier(tier)) continue;
      // 科目会员可能接在全科后面才开始，到期日按“本科或全科”连起来算
      const u = tier === 'all' ? await chainUntil(env, accountId, ['all']) : await memberUntil(env, accountId, tier);
      if (u !== null) out[tier] = u === Infinity ? 'forever' : u;
    }
    return out;
  }
  const isSample = (item) => {
    const [kind, id] = item.split(':');
    if (kind === 'adv') return SAMPLES.exams.some((e) => id.startsWith(e + '-p'));
    if (kind === 'drill') return SAMPLES.drills.includes(id);
    return false;
  };
  /** 一次查好：本科会员、已解锁、剩余次数，之后 can(item) 同步判断 */
  async function accessCtx(env, acc, subject = 'math') {
    const free = env.FREE_MODE === 'true';
    const until = free ? null : await memberUntil(env, acc.id, subject);
    const member = free || until !== null;
    const { results } = member ? { results: [] } : await env.DB.prepare('SELECT item FROM unlock WHERE account_id = ?').bind(acc.id).all();
    const unlocked = new Set(results.map((r) => r.item));
    const credits = acc.credits ?? FREE_CREDITS;
    return { free, member, until, credits, can: (item) => member || isSample(item) || unlocked.has(item) };
  }
  /** 加会员天数：接在同种会员（科目会员也接在全科后面）的到期日之后 */
  async function addDays(env, accountId, days, tier, source) {
    if (!validTier(tier)) throw new HttpError(400, '会员种类不对');
    const until = tier === 'all' ? await chainUntil(env, accountId, ['all']) : await memberUntil(env, accountId, tier);
    if (until === Infinity) return;
    const start = until ?? now();
    await env.DB.prepare('INSERT INTO entitlement (id, account_id, tier, starts_at, expires_at, source) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid(), accountId, tier, start, start + days * DAY, source).run();
  }
  async function revoke(env, accountId, tier) {
    const t = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM entitlement WHERE account_id = ? AND tier = ? AND starts_at > ?').bind(accountId, tier, t),
      env.DB.prepare('UPDATE entitlement SET expires_at = ? WHERE account_id = ? AND tier = ? AND (expires_at IS NULL OR expires_at > ?)').bind(t, accountId, tier, t),
    ]);
  }
  const log = (env, accountId, action, detail) =>
    env.DB.prepare('INSERT INTO admin_log (account_id, action, detail, created_at) VALUES (?, ?, ?, ?)')
      .bind(accountId, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null), now()).run();
  // 在线支付单笔上限（元），超过的套餐先不开放在线支付；PAY_MAX_AMOUNT 可改，默认 50
  const payMax = (env) => (env.PAY_MAX_AMOUNT && Number(env.PAY_MAX_AMOUNT) > 0 ? Number(env.PAY_MAX_AMOUNT) : 50);
  // 价格：PRICE_<科目>_<周期>，比如 PRICE_MATH_MONTH、PRICE_ALL_YEAR（元）
  const plansOf = (env) => SCOPES.filter((sc) => sc.live).flatMap((sc) => PERIODS.map((p) => {
    const v = env[`PRICE_${sc.id.toUpperCase()}_${p.id.toUpperCase()}`];
    const price = v ? Number(v) : null;
    return { id: `${sc.id}.${p.id}`, scope: sc.id, scope_name: sc.name, name: `${sc.name}${p.name}`, period: p.name, days: p.days, price,
      online: price !== null && price <= payMax(env) }; // 超过上限的套餐暂不支持在线支付（可用激活码）
  }));

  // ───────── 登录 ─────────
  // 注册：手机号 + 密码 + 孩子昵称（不发短信验证码；忘记密码由管理员在后台重置）
  route('POST', '/api/auth/register', async (req, env) => {
    const { phone: p, password, nickname = '' } = await body(req);
    const phone = normPhone(p);
    checkInput(phone, password);
    const name = String(nickname).trim().slice(0, 20);
    if (!name) throw new HttpError(400, '请填写孩子的昵称');
    if (await env.DB.prepare('SELECT 1 FROM account WHERE phone = ?').bind(phone).first()) throw new HttpError(409, '这个手机号已经注册过，请直接登录');
    const acc = { id: uid(), token: uid() + uid().slice(0, 8) };
    const student = { id: uid(), nickname: name };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO account (id, token, invite_code, created_at, phone, pw_hash, credits) VALUES (?, ?, NULL, ?, ?, ?, ?)')
        .bind(acc.id, acc.token, now(), phone, await hashPw(password), FREE_CREDITS),
      env.DB.prepare('INSERT INTO student (id, account_id, nickname, created_at) VALUES (?, ?, ?, ?)').bind(student.id, acc.id, name, now()),
    ]);
    return json({ token: acc.token, student });
  });

  route('POST', '/api/auth/login', async (req, env) => {
    const { phone: p, password } = await body(req);
    const phone = normPhone(p);
    const acc = await env.DB.prepare('SELECT * FROM account WHERE phone = ?').bind(phone).first();
    if (!acc || !(await checkPw(password, acc.pw_hash))) throw new HttpError(403, '手机号或密码错误');
    const student = await env.DB.prepare('SELECT id, nickname FROM student WHERE account_id = ? ORDER BY created_at LIMIT 1').bind(acc.id).first();
    return json({ token: acc.token, student });
  });

  // 游客：不注册直接用，只存在当前浏览器；没有免费次数（注册时再送），免费样板照常能看
  route('POST', '/api/auth/guest', async (req, env) => {
    const { nickname = '' } = await body(req).catch(() => ({}));
    const name = String(nickname).trim().slice(0, 20) || '同学';
    const acc = { id: uid(), token: uid() + uid().slice(0, 8) };
    const student = { id: uid(), nickname: name };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO account (id, token, invite_code, created_at, credits, guest) VALUES (?, ?, NULL, ?, 0, 1)').bind(acc.id, acc.token, now()),
      env.DB.prepare('INSERT INTO student (id, account_id, nickname, created_at) VALUES (?, ?, ?, ?)').bind(student.id, acc.id, name, now()),
    ]);
    return json({ token: acc.token, student, guest: true });
  });

  // 游客或试用期的老账号（只存在浏览器里）绑定手机号 = 注册，记录都保留；游客这时送免费次数
  route('POST', '/api/account/bind', async (req, env) => {
    const acc = await requireAccount(req, env);
    if (acc.phone) throw new HttpError(409, '这个账号已经绑定过手机号');
    const { phone: p, password, nickname } = await body(req);
    const phone = normPhone(p);
    checkInput(phone, password);
    if (await env.DB.prepare('SELECT 1 FROM account WHERE phone = ?').bind(phone).first()) throw new HttpError(409, '这个手机号已经被别的账号用了');
    await env.DB.prepare(`UPDATE account SET phone = ?, pw_hash = ?, guest = 0${acc.guest ? `, credits = credits + ${FREE_CREDITS}` : ''} WHERE id = ?`)
      .bind(phone, await hashPw(password), acc.id).run();
    const nn = String(nickname || '').trim().slice(0, 20);
    if (nn) await env.DB.prepare('UPDATE student SET nickname = ? WHERE id = (SELECT id FROM student WHERE account_id = ? ORDER BY created_at LIMIT 1)').bind(nn, acc.id).run();
    return json({ ok: true, phone, credits_added: acc.guest ? FREE_CREDITS : 0 });
  });

  route('POST', '/api/account/password', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { old_password, password } = await body(req);
    if (!(await checkPw(old_password, acc.pw_hash))) throw new HttpError(403, '原密码不对');
    if (String(password || '').length < 6) throw new HttpError(400, '新密码至少 6 位');
    await env.DB.prepare('UPDATE account SET pw_hash = ? WHERE id = ?').bind(await hashPw(password), acc.id).run();
    return json({ ok: true });
  });

  // 账号页：会员、次数、套餐
  route('GET', '/api/account', async (req, env) => {
    const acc = await requireAccount(req, env);
    const ctx = await accessCtx(env, acc);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM unlock WHERE account_id = ?').bind(acc.id).first();
    const ms = await memberships(env, acc.id);
    return json({
      phone: acc.phone, guest: !!acc.guest, free_mode: ctx.free,
      memberships: ms, scopes: SCOPES.filter((x) => x.live || ms[x.id]).map(({ id, name }) => ({ id, name })),
      credits: ctx.credits, free_credits: FREE_CREDITS, unlocked: n.n,
      plans: plansOf(env), pay_ready: payReady(env), contact: env.PAY_CONTACT || '',
    });
  });

  // 用 1 次免费次数解锁一项（已经能看的不扣）
  route('POST', '/api/unlock', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { item = '' } = await body(req);
    const [kind, id] = String(item).split(':');
    if (kind === 'adv') {
      if (!(await env.DB.prepare("SELECT 1 FROM solution WHERE problem_id = ? AND kind = 'advanced'").bind(id).first())) throw new HttpError(404, '这道题没有互动解析');
    } else if (kind === 'drill') {
      if (!(await env.DB.prepare('SELECT 1 FROM knowledge_point WHERE id = ?').bind(id).first())) throw new HttpError(404, '知识项不存在');
    } else throw new HttpError(400, '解锁项不合法');
    const ctx = await accessCtx(env, acc, KIND_SUBJECT[kind]);
    if (ctx.can(item)) return json({ ok: true, charged: false, credits: ctx.credits });
    const r = await env.DB.prepare('UPDATE account SET credits = credits - 1 WHERE id = ? AND credits > 0').bind(acc.id).run();
    if (!r.meta.changes) return json({ error: '免费次数用完了', need: 'member', credits: 0 }, 402);
    await env.DB.prepare('INSERT OR IGNORE INTO unlock (account_id, item, created_at) VALUES (?, ?, ?)').bind(acc.id, item, now()).run();
    return json({ ok: true, charged: true, credits: ctx.credits - 1 });
  });

  // 激活码：days = 会员天数；credits = 免费次数
  route('POST', '/api/redeem', async (req, env) => {
    const acc = await requireAccount(req, env);
    if (!acc.phone) throw new HttpError(403, '请先注册账号再兑换激活码（游客的会员换设备就找不回来了）');
    const code = String((await body(req)).code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const row = await env.DB.prepare('SELECT * FROM redeem_code WHERE code = ?').bind(code).first();
    if (!row) throw new HttpError(404, '激活码不存在');
    if (row.used_by) throw new HttpError(409, row.used_by === acc.id ? '这个激活码你已经用过了' : '这个激活码已经被使用');
    const r = await env.DB.prepare('UPDATE redeem_code SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL').bind(acc.id, now(), code).run();
    if (!r.meta.changes) throw new HttpError(409, '这个激活码已经被使用');
    if (row.kind === 'days') await addDays(env, acc.id, row.amount, row.tier || 'math', `code:${code}`);
    else await env.DB.prepare('UPDATE account SET credits = credits + ? WHERE id = ?').bind(row.amount, acc.id).run();
    await log(env, acc.id, 'redeem', { code, kind: row.kind, amount: row.amount, tier: row.tier });
    return json({ ok: true, kind: row.kind, amount: row.amount, tier: row.tier || 'math', tier_name: SCOPES.find((x) => x.id === (row.tier || 'math'))?.name });
  });

  // ───────── 在线支付（支付宝） ─────────
  // 流程：开通 → 建内部订单 → 跳支付宝收银台 → 支付宝异步通知（验签、核对金额）→ 加会员天数
  // 前端跳回只用来展示结果，开通以异步通知或服务端主动查询为准。
  const payReady = (env) => !!(env.ALIPAY_APP_ID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY);
  const money = (v) => Number(v).toFixed(2);
  /** 订单付款成功 → 开通会员（幂等：同一订单只加一次） */
  async function grantOrder(env, order, tradeNo, buyer) {
    const r = await env.DB.prepare("UPDATE pay_order SET status = 'paid', trade_no = ?, buyer = ?, paid_at = ? WHERE id = ? AND status = 'pending'")
      .bind(tradeNo || null, buyer || null, now(), order.id).run();
    if (!r.meta.changes) return false;
    await addDays(env, order.account_id, order.days, order.tier || 'math', `alipay:${tradeNo || order.id}`);
    await log(env, order.account_id, 'pay', { order: order.id, plan: order.plan, amount: order.amount, trade_no: tradeNo });
    return true;
  }
  const paidOk = (st) => st === 'TRADE_SUCCESS' || st === 'TRADE_FINISHED';

  route('POST', '/api/pay/create', async (req, env, _p, url) => {
    const acc = await requireAccount(req, env);
    if (!payReady(env)) throw new HttpError(503, '在线支付还没开通');
    if (!acc.phone) throw new HttpError(403, '请先注册账号再开通会员（游客的会员换设备就找不回来了）');
    const { plan, from = 'math' } = await body(req);
    const pl = plansOf(env).find((x) => x.id === plan);
    if (!pl || !(pl.price > 0)) throw new HttpError(400, '这个套餐还没有定价');
    if (!pl.online) throw new HttpError(400, '这个套餐暂不支持在线支付，请联系客服购买激活码');
    const back = SUBJECTS.includes(from) ? from : 'math'; // 付完回到哪个科目的页面
    const id = 'M' + new Date(now() + 8 * 3600000).toISOString().slice(0, 10).replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const order = { id, plan: pl.id, tier: pl.scope, days: pl.days, amount: money(pl.price) };
    await env.DB.prepare('INSERT INTO pay_order (id, account_id, plan, tier, days, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, acc.id, order.plan, order.tier, order.days, order.amount, 'pending', now()).run();
    const base = url.origin;
    const payurl = await payUrl(env, {
      orderId: id, amount: order.amount, subject: `learn-inside 会员 · ${pl.name}（${pl.days} 天）`,
      // 本地调试（http://127.0.0.1）支付宝回调不到，不传 notify_url，靠查询兜底
      notifyUrl: base.startsWith('https://') ? `${base}/api/pay/notify` : undefined, returnUrl: `${base}/api/pay/return?o=${id}&f=${back}`,
    });
    return json({ order_id: id, url: payurl });
  });

  // 支付宝异步通知（application/x-www-form-urlencoded）。返回纯文本 success，否则支付宝会重试
  route('POST', '/api/pay/notify', async (req, env) => {
    const text = (s) => new Response(s, { headers: { 'content-type': 'text/plain' } });
    const params = Object.fromEntries(new URLSearchParams(await req.text()));
    if (!payReady(env) || !(await verifyNotify(params, env.ALIPAY_PUBLIC_KEY))) return text('fail');
    if (params.app_id !== env.ALIPAY_APP_ID) return text('fail');
    if (env.ALIPAY_SELLER_ID && params.seller_id !== env.ALIPAY_SELLER_ID) return text('fail');
    const order = await env.DB.prepare('SELECT * FROM pay_order WHERE id = ?').bind(params.out_trade_no || '').first();
    if (!order) return text('fail');
    if (money(params.total_amount) !== order.amount) {
      await log(env, order.account_id, 'pay_mismatch', { order: order.id, expect: order.amount, got: params.total_amount });
      return text('fail');
    }
    // 退款、关单等通知也可能是 TRADE_SUCCESS / TRADE_CLOSED，带 out_biz_no / gmt_refund / refund_fee 的不算付款成功
    const refundEvent = !!(params.out_biz_no || params.gmt_refund || params.refund_fee);
    if (paidOk(params.trade_status) && !refundEvent) await grantOrder(env, order, params.trade_no, params.buyer_logon_id || params.buyer_id);
    else if (params.trade_status === 'TRADE_CLOSED' && !refundEvent && order.status === 'pending')
      await env.DB.prepare("UPDATE pay_order SET status = 'closed' WHERE id = ? AND status = 'pending'").bind(order.id).run();
    return text('success');
  });

  // 付完款支付宝跳回这里 → 转到网页的结果页（参数在 hash 前面会丢，所以经服务端转一下）
  route('GET', '/api/pay/return', async (_req, _env, _p, url) =>
    Response.redirect(`${url.origin}/${SUBJECTS.includes(url.searchParams.get('f')) ? url.searchParams.get('f') : 'math'}/#/account/paid/${encodeURIComponent(url.searchParams.get('o') || '')}`, 302));

  // 查订单状态；还没收到通知就主动问一次支付宝
  route('GET', '/api/pay/orders/:id', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    let order = await env.DB.prepare('SELECT * FROM pay_order WHERE id = ? AND account_id = ?').bind(p.id, acc.id).first();
    if (!order) throw new HttpError(404, '订单不存在');
    if (order.status === 'pending' && payReady(env)) {
      try {
        const q = await queryTrade(env, order.id);
        if (q.code === '10000' && paidOk(q.trade_status) && money(q.total_amount) === order.amount) {
          await grantOrder(env, order, q.trade_no, q.buyer_logon_id);
          order = await env.DB.prepare('SELECT * FROM pay_order WHERE id = ?').bind(order.id).first();
        }
      } catch (e) { console.error('alipay query failed', e); }
    }
    const tier = order.tier || 'math';
    const until = tier === 'all' ? await chainUntil(env, acc.id, ['all']) : await memberUntil(env, acc.id, tier);
    const pl = plansOf(env).find((x) => x.id === order.plan);
    return json({ id: order.id, status: order.status, plan: order.plan, plan_name: pl?.name || order.plan, tier, days: order.days, amount: order.amount, member_until: until === Infinity ? 'forever' : until });
  });

  // ───────── 会员管理后台（x-admin-key） ─────────
  function requireAdmin(req, env) {
    const key = req.headers.get('x-admin-key');
    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) throw new HttpError(403, '管理员密钥不正确');
  }
  async function accountRow(env, a) {
    const ms = await memberships(env, a.id);
    const { results: sts } = await env.DB.prepare('SELECT nickname FROM student WHERE account_id = ? ORDER BY created_at').bind(a.id).all();
    const last = await env.DB.prepare('SELECT MAX(ae.created_at) AS t FROM attempt_event ae JOIN student s ON s.id = ae.student_id WHERE s.account_id = ?').bind(a.id).first();
    const un = await env.DB.prepare('SELECT COUNT(*) AS n FROM unlock WHERE account_id = ?').bind(a.id).first();
    return {
      id: a.id, phone: a.phone, created_at: a.created_at, note: a.note, credits: a.credits,
      memberships: ms, students: sts.map((s) => s.nickname),
      last_active: last?.t || null, unlocked: un.n,
    };
  }
  route('GET', '/api/admin/accounts', async (req, env, _p, url) => {
    requireAdmin(req, env);
    const q = (url.searchParams.get('q') || '').trim();
    const like = `%${q}%`;
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT a.* FROM account a LEFT JOIN student s ON s.account_id = a.id
        WHERE ? = '' OR a.phone LIKE ? OR s.nickname LIKE ? OR a.id = ? OR a.note LIKE ?
        ORDER BY a.created_at DESC LIMIT 100`).bind(q, like, like, q, like).all();
    const out = [];
    for (const a of results) out.push(await accountRow(env, a));
    const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM account').first();
    return json({ total: total.n, accounts: out });
  });

  // { action, value }：add_days 加会员天数（接在原到期日后）/ set_expiry 改到期日（YYYY-MM-DD，北京时间当天结束）/
  //   revoke 取消会员 / add_credits（会员相关的操作带 tier：math / chinese / all） 加减次数 / reset_password 重置密码 / note 备注
  route('POST', '/api/admin/accounts/:id', async (req, env, p) => {
    requireAdmin(req, env);
    const a = await env.DB.prepare('SELECT * FROM account WHERE id = ?').bind(p.id).first();
    if (!a) throw new HttpError(404, '账号不存在');
    const { action, value, reason = '', tier = 'math' } = await body(req);
    const n = Math.trunc(Number(value));
    if (['add_days', 'set_expiry', 'revoke'].includes(action) && !validTier(tier)) throw new HttpError(400, '会员种类不对');
    if (action === 'add_days') {
      if (!(n > 0 && n <= 3660)) throw new HttpError(400, '天数不合法');
      await addDays(env, a.id, n, tier, `manual:${reason}`);
    } else if (action === 'set_expiry') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
      if (!m) throw new HttpError(400, '日期格式是 YYYY-MM-DD');
      const end = Date.UTC(+m[1], +m[2] - 1, +m[3] + 1) - 8 * 3600000; // 北京时间当天 24:00
      await revoke(env, a.id, tier);
      if (end > now()) await env.DB.prepare('INSERT INTO entitlement (id, account_id, tier, starts_at, expires_at, source) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(uid(), a.id, tier, now(), end, `manual:${reason}`).run();
    } else if (action === 'revoke') {
      await revoke(env, a.id, tier);
    } else if (action === 'add_credits') {
      if (!n || Math.abs(n) > 1000) throw new HttpError(400, '次数不合法');
      await env.DB.prepare('UPDATE account SET credits = MAX(0, credits + ?) WHERE id = ?').bind(n, a.id).run();
    } else if (action === 'reset_password') {
      if (!a.phone) throw new HttpError(400, '这个账号还没绑定手机号');
      if (String(value || '').length < 6) throw new HttpError(400, '密码至少 6 位');
      await env.DB.prepare('UPDATE account SET pw_hash = ? WHERE id = ?').bind(await hashPw(String(value)), a.id).run();
    } else if (action === 'note') {
      await env.DB.prepare('UPDATE account SET note = ? WHERE id = ?').bind(String(value || '').slice(0, 200) || null, a.id).run();
    } else throw new HttpError(400, '不认识的操作');
    await log(env, a.id, action, { value: action === 'reset_password' ? '***' : value, reason, ...(['add_days', 'set_expiry', 'revoke'].includes(action) ? { tier } : {}) });
    return json({ ok: true, account: await accountRow(env, await env.DB.prepare('SELECT * FROM account WHERE id = ?').bind(a.id).first()) });
  });

  // 删除账号：连同孩子、做题记录、掌握度、会员、解锁一起删；已付款订单的金额和交易号留在操作记录里备查
  route('DELETE', '/api/admin/accounts/:id', async (req, env, p) => {
    requireAdmin(req, env);
    const a = await env.DB.prepare('SELECT * FROM account WHERE id = ?').bind(p.id).first();
    if (!a) throw new HttpError(404, '账号不存在');
    const { results: sts } = await env.DB.prepare('SELECT id, nickname FROM student WHERE account_id = ?').bind(a.id).all();
    const { results: paid } = await env.DB.prepare("SELECT id, plan, amount, trade_no, paid_at FROM pay_order WHERE account_id = ? AND status = 'paid'").bind(a.id).all();
    const sess = 'SELECT s.id FROM exam_session s JOIN student st ON st.id = s.student_id WHERE st.account_id = ?';
    const stu = 'SELECT id FROM student WHERE account_id = ?';
    const q = (sql) => env.DB.prepare(sql).bind(a.id);
    await env.DB.batch([
      q(`DELETE FROM session_hint WHERE session_id IN (${sess})`),
      q(`DELETE FROM session_problem WHERE session_id IN (${sess})`),
      q(`DELETE FROM attempt_event WHERE student_id IN (${stu})`),
      q(`DELETE FROM mastery WHERE student_id IN (${stu})`),
      q(`DELETE FROM exam_session WHERE student_id IN (${stu})`),
      q('DELETE FROM student WHERE account_id = ?'),
      q('DELETE FROM entitlement WHERE account_id = ?'),
      q('DELETE FROM unlock WHERE account_id = ?'),
      q('DELETE FROM pay_order WHERE account_id = ?'),
      q('DELETE FROM account WHERE id = ?'),
    ]);
    await log(env, null, 'delete', { account: a.id, phone: a.phone, students: sts.map((x) => x.nickname), paid_orders: paid });
    return json({ ok: true, deleted: { phone: a.phone, students: sts.length, paid_orders: paid.length } });
  });

  route('GET', '/api/admin/log', async (req, env, _p, url) => {
    requireAdmin(req, env);
    const acc = url.searchParams.get('account');
    const { results } = await env.DB.prepare(
      `SELECT l.*, a.phone FROM admin_log l LEFT JOIN account a ON a.id = l.account_id ${acc ? 'WHERE l.account_id = ?' : ''} ORDER BY l.id DESC LIMIT 200`)
      .bind(...(acc ? [acc] : [])).all();
    return json(results);
  });

  // 生成激活码 { kind: days|credits, amount, count, note, tier }（tier 只对会员天数有用）
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易看错的 0 O 1 I
  route('POST', '/api/admin/codes', async (req, env) => {
    requireAdmin(req, env);
    const { kind, amount, count = 1, note = '', tier = 'math' } = await body(req);
    if (kind === 'days' && !validTier(tier)) throw new HttpError(400, '会员种类不对');
    const n = Math.trunc(Number(amount)), c = Math.trunc(Number(count));
    if (!['days', 'credits'].includes(kind)) throw new HttpError(400, '类型是 days 或 credits');
    if (!(n > 0 && n <= 3660)) throw new HttpError(400, '数量不合法');
    if (!(c > 0 && c <= 200)) throw new HttpError(400, '一次最多 200 个');
    const codes = [];
    for (let i = 0; i < c; i++) {
      const r = crypto.getRandomValues(new Uint8Array(10));
      codes.push(Array.from(r, (x) => ALPHA[x % ALPHA.length]).join(''));
    }
    await env.DB.batch(codes.map((code) => env.DB.prepare('INSERT INTO redeem_code (code, kind, amount, note, created_at, tier) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(code, kind, n, String(note).slice(0, 100) || null, now(), kind === 'days' ? tier : null)));
    await log(env, null, 'codes', { kind, amount: n, count: c, note, tier: kind === 'days' ? tier : undefined });
    return json({ codes });
  });

  // 退款（整单）：退成功后收回这笔订单开的会员天数。同一订单重试复用同一个 out_request_no
  route('POST', '/api/admin/orders/:id/refund', async (req, env, p) => {
    requireAdmin(req, env);
    if (!payReady(env)) throw new HttpError(503, '在线支付还没配置');
    const o = await env.DB.prepare('SELECT * FROM pay_order WHERE id = ?').bind(p.id).first();
    if (!o) throw new HttpError(404, '订单不存在');
    if (o.status === 'refunded') return json({ ok: true, status: 'refunded' });
    if (o.status !== 'paid' && o.status !== 'refunding') throw new HttpError(409, '只有已付款的订单能退款');
    const { reason = '' } = await body(req);
    const no = o.refund_no || `R${o.id}`;
    if (!o.refund_no) await env.DB.prepare("UPDATE pay_order SET refund_no = ?, status = 'refunding' WHERE id = ?").bind(no, o.id).run();
    const r = await refundTrade(env, o.id, o.amount, no, String(reason).slice(0, 100));
    let done = r.code === '10000' && r.fund_change === 'Y';
    if (!done && r.code === '10000') {
      const q = await refundQuery(env, o.id, no);
      done = q.code === '10000' && q.refund_status === 'REFUND_SUCCESS';
    }
    if (!done) {
      await log(env, o.account_id, 'refund_pending', { order: o.id, code: r.code, sub_code: r.sub_code });
      return json({ ok: false, status: 'refunding', message: r.code === '10000' ? '支付宝已受理，稍后再点一次确认结果' : (r.sub_msg || r.msg || '退款失败') });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE pay_order SET status = 'refunded', refunded_at = ? WHERE id = ?").bind(now(), o.id),
      env.DB.prepare('DELETE FROM entitlement WHERE account_id = ? AND source = ?').bind(o.account_id, `alipay:${o.trade_no || o.id}`),
    ]);
    await log(env, o.account_id, 'refund', { order: o.id, amount: o.amount, reason });
    return json({ ok: true, status: 'refunded' });
  });
  // 关闭未付款订单（先查一次，已经付了就按付款处理）
  route('POST', '/api/admin/orders/:id/close', async (req, env, p) => {
    requireAdmin(req, env);
    const o = await env.DB.prepare('SELECT * FROM pay_order WHERE id = ?').bind(p.id).first();
    if (!o) throw new HttpError(404, '订单不存在');
    if (o.status !== 'pending') throw new HttpError(409, '只有待付款的订单能关闭');
    if (payReady(env)) {
      const q = await queryTrade(env, o.id);
      if (q.code === '10000' && paidOk(q.trade_status) && money(q.total_amount) === o.amount) {
        await grantOrder(env, o, q.trade_no, q.buyer_logon_id);
        return json({ ok: true, status: 'paid' });
      }
      if (q.code === '10000') await closeTrade(env, o.id); // 交易不存在（用户没扫码）时不用关
    }
    await env.DB.prepare("UPDATE pay_order SET status = 'closed' WHERE id = ? AND status = 'pending'").bind(o.id).run();
    return json({ ok: true, status: 'closed' });
  });

  // 支付配置自检：哪些变量设了、密钥能不能解析、哪些套餐有价格（不返回密钥内容）
  route('GET', '/api/admin/pay-status', async (req, env) => {
    requireAdmin(req, env);
    const ks = await keyStatus(env);
    return json({
      app_id: env.ALIPAY_APP_ID ? `…${String(env.ALIPAY_APP_ID).slice(-4)}` : null,
      private_key: ks.private_key, public_key: ks.public_key,
      gateway: env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
      free_mode: env.FREE_MODE === 'true', pay_ready: payReady(env),
      plans: plansOf(env).map((p) => ({ id: p.id, name: p.name, price: p.price })),
      wrong_names: ['AIPAY_PUBLIC_KEY', 'ALIPAY_ALIPAY_PUBLIC_KEY', 'PRICE_MONTH', 'PRICE_QUARTER', 'PRICE_YEAR'].filter((k) => env[k] !== undefined && env[k] !== ''),
    });
  });

  route('GET', '/api/admin/orders', async (req, env) => {
    requireAdmin(req, env);
    const { results } = await env.DB.prepare(
      'SELECT o.*, a.phone FROM pay_order o LEFT JOIN account a ON a.id = o.account_id ORDER BY o.created_at DESC LIMIT 300').all();
    return json(results);
  });

  route('GET', '/api/admin/codes', async (req, env) => {
    requireAdmin(req, env);
    const { results } = await env.DB.prepare(
      'SELECT c.*, a.phone AS used_phone FROM redeem_code c LEFT JOIN account a ON a.id = c.used_by ORDER BY c.created_at DESC LIMIT 300').all();
    return json(results);
  });

  // ───────── 客服（微信二维码 + 一句说明），所有人都能看 ─────────
  route('GET', '/api/support', async (_req, env) => {
    const { results } = await env.DB.prepare("SELECT key, value FROM setting WHERE key IN ('support_qr', 'support_text')").all();
    const m = Object.fromEntries(results.map((r) => [r.key, r.value]));
    return json({ qr: m.support_qr || null, text: m.support_text || env.PAY_CONTACT || '' });
  });
  route('POST', '/api/admin/support', async (req, env) => {
    requireAdmin(req, env);
    const { qr, text } = await body(req);
    const ops = [];
    if (qr !== undefined) {
      if (qr && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(qr)) throw new HttpError(400, '二维码要是 PNG / JPG 图片');
      if (qr && qr.length > 400000) throw new HttpError(400, '图片太大，换一张小一点的');
      ops.push(env.DB.prepare('INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('support_qr', qr || null, now()));
    }
    if (text !== undefined) ops.push(env.DB.prepare('INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('support_text', String(text).slice(0, 200), now()));
    if (ops.length) await env.DB.batch(ops);
    await log(env, null, 'support', { qr: qr === undefined ? undefined : !!qr, text });
    return json({ ok: true });
  });

  // 后台用：会员种类
  route('GET', '/api/admin/scopes', async (req, env) => { requireAdmin(req, env); return json(SCOPES); });

  return { accessCtx, memberUntil };
}
