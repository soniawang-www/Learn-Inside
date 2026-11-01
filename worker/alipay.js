// 支付宝开放平台（RSA2 公钥模式）：请求加签、通知验签、拼收银台地址、查询订单
// 密钥放在 Cloudflare Secret：ALIPAY_PRIVATE_KEY（应用私钥，PKCS8 或 PKCS1，带不带 PEM 头都行）、
// ALIPAY_PUBLIC_KEY（支付宝公钥，不是应用公钥）。

const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const stripPem = (k) => String(k || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');

// PKCS1 RSA 私钥包成 PKCS8（WebCrypto 只认 PKCS8）
function derLen(n) { return n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]; }
function pkcs1to8(pkcs1) {
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const oct = [0x04, ...derLen(pkcs1.length)];
  const inner = [0x02, 0x01, 0x00, ...algo, ...oct];
  const total = inner.length + pkcs1.length;
  const out = new Uint8Array([0x30, ...derLen(total), ...inner, ...pkcs1]);
  return out;
}
const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const keyCache = new Map();
async function privateKey(pem) {
  if (keyCache.has(pem)) return keyCache.get(pem);
  const der = b64d(stripPem(pem));
  let k;
  try { k = await crypto.subtle.importKey('pkcs8', der, ALG, false, ['sign']); }
  catch { k = await crypto.subtle.importKey('pkcs8', pkcs1to8(der), ALG, false, ['sign']); }
  keyCache.set(pem, k);
  return k;
}
async function publicKey(pem) {
  if (keyCache.has(pem)) return keyCache.get(pem);
  const k = await crypto.subtle.importKey('spki', b64d(stripPem(pem)), ALG, false, ['verify']);
  keyCache.set(pem, k);
  return k;
}

/** 待签名字符串：去掉空值和指定字段，按 key 字典序 k=v 用 & 连接（值不编码） */
export function signContent(params, omit = ['sign']) {
  return Object.keys(params).filter((k) => !omit.includes(k) && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort().map((k) => `${k}=${params[k]}`).join('&');
}
export async function rsaSign(content, privPem) {
  return b64e(await crypto.subtle.sign(ALG, await privateKey(privPem), new TextEncoder().encode(content)));
}
export async function rsaVerify(content, sign, pubPem) {
  try { return await crypto.subtle.verify(ALG, await publicKey(pubPem), b64d(sign), new TextEncoder().encode(content)); }
  catch { return false; }
}
/** 异步通知验签：sign、sign_type 不参与 */
export const verifyNotify = (params, pubPem) => rsaVerify(signContent(params, ['sign', 'sign_type']), params.sign || '', pubPem);

const beijing = (t = Date.now()) => new Date(t + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
export const GATEWAY = 'https://openapi.alipay.com/gateway.do';

/** 后台自检：密钥能不能被解析（不输出密钥内容） */
export async function keyStatus(env) {
  const out = {};
  try { await privateKey(env.ALIPAY_PRIVATE_KEY); out.private_key = 'ok'; } catch { out.private_key = env.ALIPAY_PRIVATE_KEY ? 'invalid' : 'missing'; }
  try { await publicKey(env.ALIPAY_PUBLIC_KEY); out.public_key = 'ok'; } catch { out.public_key = env.ALIPAY_PUBLIC_KEY ? 'invalid' : 'missing'; }
  return out;
}

async function signedParams(env, method, biz, extra = {}) {
  const p = {
    app_id: env.ALIPAY_APP_ID, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2',
    timestamp: beijing(), version: '1.0', biz_content: JSON.stringify(biz), ...extra,
  };
  p.sign = await rsaSign(signContent(p), env.ALIPAY_PRIVATE_KEY);
  return p;
}

/** 收银台地址（GET 跳转）。AI 网页应用收款签约的是 alipay.trade.page.pay，电脑和手机浏览器都用它 */
export async function payUrl(env, { orderId, amount, subject, notifyUrl, returnUrl }) {
  const biz = { out_trade_no: orderId, total_amount: amount, subject, product_code: 'FAST_INSTANT_TRADE_PAY', timeout_express: '30m' };
  const extra = { return_url: returnUrl };
  if (notifyUrl) extra.notify_url = notifyUrl;
  const p = await signedParams(env, 'alipay.trade.page.pay', biz, extra);
  return `${env.ALIPAY_GATEWAY || GATEWAY}?${new URLSearchParams(p)}`;
}

/** 调用一个接口，返回 <method>_response（HTTPS 直连支付宝网关） */
async function call(env, method, biz) {
  const p = await signedParams(env, method, biz);
  const r = await fetch(env.ALIPAY_GATEWAY || GATEWAY, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: new URLSearchParams(p),
  });
  const d = await r.json();
  return d[method.replace(/\./g, '_') + '_response'] || {};
}
/** 主动查询订单（通知没收到时兜底） */
export const queryTrade = (env, orderId) => call(env, 'alipay.trade.query', { out_trade_no: orderId });
/** 退款：同一次退款重试必须复用同一个 out_request_no */
export const refundTrade = (env, orderId, amount, requestNo, reason) =>
  call(env, 'alipay.trade.refund', { out_trade_no: orderId, refund_amount: amount, out_request_no: requestNo, refund_reason: reason || undefined });
/** 退款查询：只有 refund_status=REFUND_SUCCESS 才算退成功 */
export const refundQuery = (env, orderId, requestNo) =>
  call(env, 'alipay.trade.fastpay.refund.query', { out_trade_no: orderId, out_request_no: requestNo, query_options: ['gmt_refund_pay'] });
/** 关闭未付款交易 */
export const closeTrade = (env, orderId) => call(env, 'alipay.trade.close', { out_trade_no: orderId });
