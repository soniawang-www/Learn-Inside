// 语文 · 汉字小达人真题模考（learn-inside.com/chinese/）· 前端（原生 JS，无构建步骤）
// 路由：#/（首页：比赛入口、成绩）  #/hanzi（汉字小达人试卷）  #/gsw（古诗文大会试卷，按年级）  #/intro/:examId（考前须知）  #/exam/:sid（答题）  #/review/:sid（成绩和解析）
//       #/mistakes（错题本）  #/join（登录 / 注册）  #/beishi（每日背诗）  #/poem/:idx（背一篇：四步）
// 账号全站通用：和数学板块共用 li.token / li.student。接口在 /api/（全站）。

import { sideNav } from '/assets/sidenav.js?v=20261107e';
import { loadStart } from '/assets/loadcomic.js?v=20261109';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const FAMILY = 'hanzi';
const GSW = 'gushiwen';
const isGsw = (id) => String(id || '').startsWith('gsw-');
const famOf = (id) => (isGsw(id) ? GSW : FAMILY);
const GRADES = { 3: '三年级', 4: '四年级', 5: '五年级' };
const stageOf = (id) => (/-jx(-|$)/.test(id) ? '决选' : /-fx(-|$)/.test(id) ? '复选' : /-cx(-|$)/.test(id) ? '初选' : '');
const isPaper = (id) => isGsw(id) && /-jx(-|$)/.test(id); // 决选笔试卷：整卷一页、分值不同、简答自评
const CN = '一二三四五六七八九十';
const pts = (n) => (Number.isInteger(n) ? n : Number(n).toFixed(1));

// ───────── 存储 / 账号 ─────────
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const auth = {
  get token() { return store.get('li.token'); },
  get student() { return store.get('li.student'); },
  save(token, student) { store.set('li.token', token); store.set('li.student', student); },
  clear() { store.del('li.token'); store.del('li.student'); },
};
let me = null; // /api/me
const isGuest = () => !!me?.guest;

// ───────── API ─────────
let busy = 0;
async function api(path, { method = 'GET', body } = {}) {
  busy++; document.body.classList.add('net-wait');
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('网络不太好，请稍后再试');
  } finally { if (!--busy) document.body.classList.remove('net-wait'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { auth.clear(); me = null; location.hash = '#/join'; }
  if (!res.ok) { const e = new Error(data.error || `请求失败 (${res.status})`); e.status = res.status; throw e; }
  return data;
}

// ───────── 小工具 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const txt = (s) => esc(s).replace(/\n/g, '<br>');
const isFill = (p) => !Object.keys(p.choices || {}).length;
const enc = encodeURIComponent;
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
const dur = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m} 分 ${s} 秒` : `${s} 秒`; };
const day = (t) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
function modal(html, bind) {
  $modal.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { $modal.innerHTML = ''; };
  $modal.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  $modal.querySelector('.modal-back').onclick = (e) => { if (e.target.classList.contains('modal-back')) close(); };
  bind?.($modal, close);
  return close;
}

const BRAND = `<a class="brandbar" href="../" aria-label="回到 learn-inside 首页"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="28.0" height="28.0" aria-hidden="true"><rect width="120" height="120" rx="30" class="lg-tile"/><path d="M40 32V84H86" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 58V68" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="42" r="6.5" class="lg-dot"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -73 570 75" width="96.9" height="12.8" aria-hidden="true"><path d="M23.2 1Q14.9 1 10.7 -3.75Q6.5 -8.5 6.5 -17.7V-65Q6.5 -68.1 8.1 -69.7Q9.7 -71.3 12.7 -71.3Q15.7 -71.3 17.35 -69.7Q19 -68.1 19 -65V-18.3Q19 -13.7 20.95 -11.5Q22.9 -9.3 26.5 -9.3Q27.3 -9.3 28 -9.35Q28.7 -9.4 29.4 -9.5Q30.8 -9.7 31.3 -8.75Q31.8 -7.8 31.8 -4.9Q31.8 -2.4 30.8 -1Q29.8 0.4 27.5 0.7Q26.5 0.8 25.4 0.9Q24.3 1 23.2 1Z M64 1Q55.7 1 49.7 -2.1Q43.7 -5.2 40.45 -10.9Q37.2 -16.6 37.2 -24.4Q37.2 -32 40.35 -37.7Q43.5 -43.4 49.05 -46.65Q54.6 -49.9 61.7 -49.9Q66.9 -49.9 71.05 -48.2Q75.2 -46.5 78.15 -43.3Q81.1 -40.1 82.65 -35.55Q84.2 -31 84.2 -25.3Q84.2 -23.5 82.95 -22.55Q81.7 -21.6 79.4 -21.6H47.3V-28.8H75.4L73.8 -27.3Q73.8 -31.9 72.45 -35Q71.1 -38.1 68.55 -39.75Q66 -41.4 62.2 -41.4Q58 -41.4 55.05 -39.45Q52.1 -37.5 50.55 -33.95Q49 -30.4 49 -25.5V-24.8Q49 -16.6 52.85 -12.55Q56.7 -8.5 64.2 -8.5Q66.8 -8.5 70.05 -9.15Q73.3 -9.8 76.2 -11.4Q78.3 -12.6 79.9 -12.45Q81.5 -12.3 82.45 -11.3Q83.4 -10.3 83.6 -8.85Q83.8 -7.4 83.05 -5.9Q82.3 -4.4 80.5 -3.3Q77 -1.1 72.45 -0.05Q67.9 1 64 1Z M111.7 1Q106.4 1 102.25 -1.05Q98.1 -3.1 95.75 -6.6Q93.4 -10.1 93.4 -14.5Q93.4 -19.9 96.2 -23.05Q99 -26.2 105.3 -27.6Q111.6 -29 122.2 -29H127.2V-21.8H122.3Q116.1 -21.8 112.4 -21.2Q108.7 -20.6 107.15 -19.15Q105.6 -17.7 105.6 -15.1Q105.6 -11.8 107.9 -9.7Q110.2 -7.6 114.3 -7.6Q117.6 -7.6 120.15 -9.15Q122.7 -10.7 124.2 -13.4Q125.7 -16.1 125.7 -19.6V-31.1Q125.7 -36.1 123.5 -38.3Q121.3 -40.5 116.1 -40.5Q113.2 -40.5 109.85 -39.8Q106.5 -39.1 102.8 -37.4Q100.9 -36.5 99.45 -36.9Q98 -37.3 97.2 -38.55Q96.4 -39.8 96.4 -41.3Q96.4 -42.8 97.2 -44.25Q98 -45.7 99.9 -46.4Q104.5 -48.3 108.75 -49.1Q113 -49.9 116.5 -49.9Q123.7 -49.9 128.35 -47.7Q133 -45.5 135.3 -41.05Q137.6 -36.6 137.6 -29.6V-5.6Q137.6 -2.5 136.1 -0.85Q134.6 0.8 131.8 0.8Q129 0.8 127.45 -0.85Q125.9 -2.5 125.9 -5.6V-10.4H126.7Q126 -6.9 123.95 -4.35Q121.9 -1.8 118.8 -0.4Q115.7 1 111.7 1Z M158.2 0.8Q155.1 0.8 153.45 -0.85Q151.8 -2.5 151.8 -5.6V-43.4Q151.8 -46.5 153.4 -48.1Q155 -49.7 157.9 -49.7Q160.8 -49.7 162.4 -48.1Q164 -46.5 164 -43.4V-37.1H163Q164.4 -43.1 168.5 -46.2Q172.6 -49.3 179.4 -49.9Q181.5 -50.1 182.75 -48.85Q184 -47.6 184.2 -45Q184.4 -42.5 183.05 -40.95Q181.7 -39.4 179 -39.1L176.8 -38.9Q170.7 -38.3 167.6 -35.15Q164.5 -32 164.5 -26.3V-5.6Q164.5 -2.5 162.9 -0.85Q161.3 0.8 158.2 0.8Z M198.7 0.8Q195.7 0.8 194.1 -0.85Q192.5 -2.5 192.5 -5.6V-43.4Q192.5 -46.5 194.1 -48.1Q195.7 -49.7 198.6 -49.7Q201.5 -49.7 203.1 -48.1Q204.7 -46.5 204.7 -43.4V-36.6L203.6 -39.1Q205.8 -44.4 210.45 -47.15Q215.1 -49.9 221 -49.9Q226.9 -49.9 230.7 -47.7Q234.5 -45.5 236.4 -41.05Q238.3 -36.6 238.3 -29.8V-5.6Q238.3 -2.5 236.7 -0.85Q235.1 0.8 232.1 0.8Q229.1 0.8 227.45 -0.85Q225.8 -2.5 225.8 -5.6V-29.2Q225.8 -34.9 223.65 -37.5Q221.5 -40.1 217 -40.1Q211.5 -40.1 208.25 -36.65Q205 -33.2 205 -27.5V-5.6Q205 0.8 198.7 0.8Z M303.6 0.7Q300.6 0.7 299 -1.1Q297.4 -2.9 297.4 -6.1V-42.8Q297.4 -46.1 299 -47.85Q300.6 -49.6 303.6 -49.6Q306.6 -49.6 308.25 -47.85Q309.9 -46.1 309.9 -42.8V-6.1Q309.9 -2.9 308.3 -1.1Q306.7 0.7 303.6 0.7Z M330.6 0.8Q327.6 0.8 326 -0.85Q324.4 -2.5 324.4 -5.6V-43.4Q324.4 -46.5 326 -48.1Q327.6 -49.7 330.5 -49.7Q333.4 -49.7 335 -48.1Q336.6 -46.5 336.6 -43.4V-36.6L335.5 -39.1Q337.7 -44.4 342.35 -47.15Q347 -49.9 352.9 -49.9Q358.8 -49.9 362.6 -47.7Q366.4 -45.5 368.3 -41.05Q370.2 -36.6 370.2 -29.8V-5.6Q370.2 -2.5 368.6 -0.85Q367 0.8 364 0.8Q361 0.8 359.35 -0.85Q357.7 -2.5 357.7 -5.6V-29.2Q357.7 -34.9 355.55 -37.5Q353.4 -40.1 348.9 -40.1Q343.4 -40.1 340.15 -36.65Q336.9 -33.2 336.9 -27.5V-5.6Q336.9 0.8 330.6 0.8Z M402.3 1Q398 1 393.2 0.1Q388.4 -0.8 384.6 -3Q383 -4 382.35 -5.35Q381.7 -6.7 381.85 -8.05Q382 -9.4 382.85 -10.4Q383.7 -11.4 385.05 -11.7Q386.4 -12 388 -11.2Q392 -9.3 395.5 -8.55Q399 -7.8 402.4 -7.8Q407.2 -7.8 409.55 -9.45Q411.9 -11.1 411.9 -13.8Q411.9 -16.1 410.35 -17.35Q408.8 -18.6 405.7 -19.2L395.7 -21.1Q389.5 -22.3 386.25 -25.65Q383 -29 383 -34.3Q383 -39.1 385.65 -42.6Q388.3 -46.1 393 -48Q397.7 -49.9 403.8 -49.9Q408.2 -49.9 412.05 -48.95Q415.9 -48 419.5 -46Q421 -45.2 421.55 -43.9Q422.1 -42.6 421.8 -41.25Q421.5 -39.9 420.6 -38.85Q419.7 -37.8 418.35 -37.55Q417 -37.3 415.3 -38.1Q412.2 -39.7 409.35 -40.4Q406.5 -41.1 403.9 -41.1Q399 -41.1 396.65 -39.4Q394.3 -37.7 394.3 -34.9Q394.3 -32.8 395.7 -31.4Q397.1 -30 400 -29.5L410 -27.6Q416.5 -26.4 419.85 -23.2Q423.2 -20 423.2 -14.6Q423.2 -7.3 417.5 -3.15Q411.8 1 402.3 1Z M440.9 0.7Q437.9 0.7 436.3 -1.1Q434.7 -2.9 434.7 -6.1V-42.8Q434.7 -46.1 436.3 -47.85Q437.9 -49.6 440.9 -49.6Q443.9 -49.6 445.55 -47.85Q447.2 -46.1 447.2 -42.8V-6.1Q447.2 -2.9 445.6 -1.1Q444 0.7 440.9 0.7Z M480.5 1Q474.1 1 469.25 -2.1Q464.4 -5.2 461.7 -10.95Q459 -16.7 459 -24.5Q459 -32.4 461.7 -38.05Q464.4 -43.7 469.25 -46.8Q474.1 -49.9 480.5 -49.9Q486.6 -49.9 491.15 -46.9Q495.7 -43.9 497.3 -39H496.2V-65Q496.2 -68.1 497.8 -69.7Q499.4 -71.3 502.4 -71.3Q505.4 -71.3 507.05 -69.7Q508.7 -68.1 508.7 -65V-5.6Q508.7 -2.5 507.1 -0.85Q505.5 0.8 502.5 0.8Q499.5 0.8 497.9 -0.85Q496.3 -2.5 496.3 -5.6V-13.4L497.4 -10.4Q495.9 -5.2 491.3 -2.1Q486.7 1 480.5 1ZM484 -8.5Q487.7 -8.5 490.5 -10.3Q493.3 -12.1 494.85 -15.65Q496.4 -19.2 496.4 -24.5Q496.4 -32.5 493 -36.45Q489.6 -40.4 484 -40.4Q480.3 -40.4 477.5 -38.65Q474.7 -36.9 473.15 -33.35Q471.6 -29.8 471.6 -24.5Q471.6 -16.6 475 -12.55Q478.4 -8.5 484 -8.5Z M547.3 1Q539 1 533 -2.1Q527 -5.2 523.75 -10.9Q520.5 -16.6 520.5 -24.4Q520.5 -32 523.65 -37.7Q526.8 -43.4 532.35 -46.65Q537.9 -49.9 545 -49.9Q550.2 -49.9 554.35 -48.2Q558.5 -46.5 561.45 -43.3Q564.4 -40.1 565.95 -35.55Q567.5 -31 567.5 -25.3Q567.5 -23.5 566.25 -22.55Q565 -21.6 562.7 -21.6H530.6V-28.8H558.7L557.1 -27.3Q557.1 -31.9 555.75 -35Q554.4 -38.1 551.85 -39.75Q549.3 -41.4 545.5 -41.4Q541.3 -41.4 538.35 -39.45Q535.4 -37.5 533.85 -33.95Q532.3 -30.4 532.3 -25.5V-24.8Q532.3 -16.6 536.15 -12.55Q540 -8.5 547.5 -8.5Q550.1 -8.5 553.35 -9.15Q556.6 -9.8 559.5 -11.4Q561.6 -12.6 563.2 -12.45Q564.8 -12.3 565.75 -11.3Q566.7 -10.3 566.9 -8.85Q567.1 -7.4 566.35 -5.9Q565.6 -4.4 563.8 -3.3Q560.3 -1.1 555.75 -0.05Q551.2 1 547.3 1Z M440.9 -58.9Q437.4 -58.9 435.45 -60.65Q433.5 -62.4 433.5 -65.5Q433.5 -68.7 435.45 -70.4Q437.4 -72.1 440.9 -72.1Q444.5 -72.1 446.4 -70.4Q448.3 -68.7 448.3 -65.5Q448.3 -62.4 446.4 -60.65Q444.5 -58.9 440.9 -58.9Z" class="lg-ink"/><path d="M257.1 -21.8Q254.9 -21.8 253.45 -23.25Q252 -24.7 252 -26.8Q252 -29 253.45 -30.4Q254.9 -31.8 257.1 -31.8H278.4Q280.5 -31.8 281.95 -30.4Q283.4 -29 283.4 -26.8Q283.4 -24.7 281.95 -23.25Q280.5 -21.8 278.4 -21.8Z" class="lg-jade"/><path d="M303.6 -58.9Q300.1 -58.9 298.15 -60.65Q296.2 -62.4 296.2 -65.5Q296.2 -68.7 298.15 -70.4Q300.1 -72.1 303.6 -72.1Q307.2 -72.1 309.1 -70.4Q311 -68.7 311 -65.5Q311 -62.4 309.1 -60.65Q307.2 -58.9 303.6 -58.9Z" class="lg-dot"/></svg></a><span class="brandbar"><span class="bdiv"></span><span class="bname">语文</span></span>`;
function topnav(active = '') {
  const who = me ? { name: me.guest ? '游客 · 注册' : auth.student?.nickname || '账号', note: me.guest ? '注册送 10 次互动解析' : '' } : null;
  return sideNav({ section: 'chinese', sub: [['#/beishi', '每日背诗', 'beishi', active === 'beishi'], ['#/cards', '诗人卡和常识卡', 'cards', active === 'cards'], ['#/mistakes', '错题本', 'mistakes', active === 'mistakes']], who });
}
// 联系客服（和数学、首页同一个设置）
let supportCache = null;
async function showSupport() {
  try { supportCache ||= await (await fetch('/api/support')).json(); } catch { supportCache = {}; }
  const s = supportCache, inWx = /MicroMessenger/i.test(navigator.userAgent);
  const link = /^https:\/\//.test(s.url || '') ? s.url : '';
  modal(`<h2>联系客服</h2>${link && inWx ? `<p><a class="btn primary block" href="${esc(link)}">打开微信客服</a></p>` : ''}
    ${s.qr && !(link && inWx) ? `<p class="center"><img src="${esc(s.qr)}" alt="微信客服二维码" style="width:220px;max-width:100%;border-radius:12px;background:#fff;padding:8px"></p><p class="center small muted">微信扫一扫，直接和客服聊</p>` : ''}
    ${s.text ? `<p class="muted">${esc(s.text)}</p>` : s.qr || link ? '' : '<p class="muted">客服联系方式还没有设置。</p>'}
    <div class="actions" style="justify-content:center"><button class="btn" data-close>关闭</button></div>`);
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-support]')) { e.preventDefault(); showSupport(); } });
const page = (html, active) => { document.body.className = ''; $app.innerHTML = `${topnav(active)}<main class="page wide">${html}</main>`; window.scrollTo(0, 0); };
const errorPage = (msg) => page(`<div class="card"><p class="err">${esc(msg)}</p><a class="btn" href="#/">回首页</a></div>`);

// ───────── 路由 ─────────
async function router() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const loaded = loadStart();
  try {
    if (parts[0] === 'join' || !auth.token) { // 登录 / 注册统一在全站账号页，登录后回到这里
      store.set('li.back', location.pathname + (parts[0] === 'join' ? '#/' : location.hash));
      location.replace('/account/'); return;
    }
    if (!me) me = await api('/api/me');
    if (!parts.length) return await renderHome();
    if (parts[0] === 'hanzi') return await renderHanzi();
    if (parts[0] === 'gsw') return await renderGsw();
    if (parts[0] === 'beishi') return await renderBeishi();
    if (parts[0] === 'cards') return await renderCards(new URLSearchParams(h.split('?')[1] || ''));
    if (parts[0] === 'card') return await renderCard(decodeURIComponent(parts[1] || ''));
    if (parts[0] === 'poem') return await renderPoem(+parts[1], new URLSearchParams(h.split('?')[1] || ''));
    if (parts[0] === 'intro') return await renderIntro(parts[1]);
    if (parts[0] === 'exam') return await renderExam(parts[1]);
    if (parts[0] === 'review') return await renderReview(parts[1]);
    if (parts[0] === 'mistakes') return await renderMistakes();
    location.hash = '#/';
  } catch (e) { errorPage(e.message); } finally { loaded(); }
}
window.addEventListener('hashchange', router);

// ───────── 首页：试卷和成绩 ─────────
async function renderHome() {
  const st = auth.student;
  const [exams, gexams, prof, mk] = await Promise.all([
    api(`/api/exams?student=${enc(st.id)}&family=${FAMILY}`),
    api(`/api/exams?student=${enc(st.id)}&family=${GSW}`).catch(() => []),
    api(`/api/students/${enc(st.id)}/profile?subject=chinese`).catch(() => ({ sessions: [] })),
    isGuest() ? { mistakes: [] } : api(`/api/students/${enc(st.id)}/mistakes?subject=chinese`).catch(() => ({ mistakes: [] })),
  ]);
  // 最上面的「继续」条只放没做完的模考；今天做什么：下一套没做过的卷子 + 错题
  const unfinished = [...exams, ...gexams].filter((e) => store.get(`hz.cur.${e.id}`));
  const todo = (mk.mistakes || []).filter((m) => m.status === 'pending' || m.status === 'due').length;
  const strip = unfinished.slice(0, 1).map((e) => `<a class="cont-go" href="#/exam/${store.get(`hz.cur.${e.id}`)}"><b>继续答题</b><span>${esc(e.title)}</span><i>›</i></a>`);
  const next = exams.find((e) => !e.id.endsWith('-mock') && !e.last_session && !store.get(`hz.cur.${e.id}`)) || exams.find((e) => !e.last_session && !store.get(`hz.cur.${e.id}`));
  const tasks = [
    todo && `<a class="task" href="#/mistakes"><b>${todo}</b><span>订正错题<small>错题本</small></span></a>`,
    next && `<a class="task" href="#/intro/${enc(next.id)}"><i class="ico">›</i><span>做一套${next.id.endsWith('-mock') ? '模拟题' : '真题'}<small>${esc(next.title)}</small></span></a>`,
  ].filter(Boolean);
  const sessions = (prof.sessions || []).filter((s) => s.mode === 'exam' || s.mode === 'practice');
  const lastScore = sessions[0] ? `最近 ${sessions[0].score ?? '–'} 分` : '';
  const allMk = (mk.mistakes || []).length;
  page(`<div class="hero"><h1>语文竞赛真题</h1></div>
    ${strip.length ? `<div class="cont-strip">${strip.join('')}</div>` : ''}
    <div class="fam-cards">
      <a class="fam-card" href="#/hanzi"><b>汉字小达人</b><span>${exams.length ? `${exams.length} 套真题和模拟题` : '录入中'}</span><small>${lastScore}</small><i>›</i></a>
      ${gexams.length ? `<a class="fam-card" href="#/gsw"><b>古诗文大会</b><span>${gexams.filter((e) => stageOf(e.id)).length} 套卷子 · 三至五年级</span><small></small><i>›</i></a>`
        : '<div class="fam-card soon" aria-disabled="true"><b>古诗文大会</b><span>即将上线</span><small></small></div>'}
      <a class="fam-card" href="#/cards"><b>诗人卡和常识卡</b><span>字号称号、并称流派、节日节气……</span><small></small><i>›</i></a>
      <a class="fam-card" href="#/beishi"><b>每日背诗</b><span>古诗文大会必背篇目</span><small></small><i>›</i></a>
      <a class="fam-card" href="/chinese/feihua.html"><b>飞花令</b><span>82 个常用字 · 5872 句诗词</span><small class="vip">语文会员</small><i>›</i></a>
    </div>
    <div class="dash-grid">
      <section class="card">
        <div class="card-h"><h2>今天做什么</h2></div>
        ${tasks.length ? `<div class="tasks">${tasks.join('')}</div>` : '<p class="muted">暂无</p>'}
        <a class="mm-line" href="#/mistakes"><span>错题本</span><span class="muted small">${isGuest() ? '注册后可用' : `共 ${allMk} 题${todo ? ` · 待订正 ${todo}` : ''}`} ›</span></a>
      </section>
      <section class="card">
        <div class="card-h"><h2>最近成绩</h2></div>
        ${sessions.length ? `<div class="scores">${sessions.slice(0, 6).map((x) => `<a class="score-row" href="#/review/${x.id}">
          <span class="sr-t">${esc(x.title)}<small>${day(x.submitted_at)}</small></span>
          <span class="sr-bar"><i style="width:${x.total ? ((x.score || 0) / x.total) * 100 : 0}%"></i></span><b>${x.score ?? '–'}<small>/${x.total}</small></b></a>`).join('')}</div>`
        : '<p class="muted">还没有成绩</p>'}
      </section>
    </div>`, 'home');
}

async function renderHanzi() {
  const st = auth.student;
  const exams = await api(`/api/exams?student=${enc(st.id)}&family=${FAMILY}`);
  const row = (e) => `<div class="exam-row">
      <div><b>${esc(e.title)}</b><div class="small muted">${e.year ?? ''} 年 · ${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟</div></div>
      <div class="exam-act">${e.last_session ? `<a class="small" href="#/review/${e.last_session}">上次 ${e.last_score} 分</a>` : ''}
        <a class="btn primary" href="#/intro/${enc(e.id)}">开始模考</a></div></div>`;
  const real = exams.filter((e) => !e.id.endsWith('-mock')), mock = exams.filter((e) => e.id.endsWith('-mock'));
  const cards = real.length ? real.map(row).join('') : '<p class="muted">录入中</p>';
  page(`<a class="small back" href="#/">← 语文首页</a>
    <div class="hero"><h1>汉字小达人</h1></div>
    <div class="card"><h2>真题</h2>${cards}</div>
    ${mock.length ? `<div class="card"><h2>模拟题</h2>${mock.map(row).join('')}</div>` : ''}
    <p class="small muted center">题目来源：《中文自修》「美丽汉字小达人」历届活动</p>`, 'home');
}

async function renderGsw() {
  const exams = await api(`/api/exams?student=${enc(auth.student.id)}&family=${GSW}`);
  const grades = [3, 4, 5].filter((g) => exams.some((e) => e.grade === g));
  let g = store.get('gsw.grade');
  if (!grades.includes(g)) g = grades[0] || 3;
  const row = (e) => `<div class="exam-row">
      <div><b>${esc(e.title)}</b><div class="small muted">${isPaper(e.id) ? '笔试 · 满分 100' : `${e.problem_count} 题`} · ${Math.round(e.duration_sec / 60)} 分钟</div></div>
      <div class="exam-act">${e.last_session ? `<a class="small" href="#/review/${e.last_session}">上次 ${e.last_score} 分</a>` : ''}
        <a class="btn primary" href="#/intro/${enc(e.id)}">开始模考</a></div></div>`;
  const draw = async () => {
    const tp = await api(`/api/chinese/gsw/topics?grade=${g}`).catch(() => ({ topics: [] }));
    const list = exams.filter((e) => e.grade === g || e.grade == null); // 年级不明的真卷每个年级都列出
    const groups = ['决选', '复选', '初选'].map((n) => [n, list.filter((e) => stageOf(e.id) === n)]).filter(([, xs]) => xs.length);
    page(`<a class="small back" href="#/">← 语文首页</a>
      <div class="hero"><h1>古诗文大会</h1></div>
      ${grades.length > 1 ? `<div class="seg" role="tablist">${grades.map((x) => `<button role="tab" class="${x === g ? 'on' : ''}" data-g="${x}">${GRADES[x]}</button>`).join('')}</div>` : ''}
      <div class="card gp"><h2>练习<span class="small muted"> · 题库 ${tp.total || 0} 道</span></h2>
        <div class="gp-speed"><div><b>速答训练</b><span class="small muted">随机 20 题，每题 6 秒，练线上初选、复选的反应</span></div><button class="btn primary" id="speed">开始</button></div>
        <div class="gp-topics">${(tp.topics || []).map((t) => `<button class="gp-t" data-t="${t.id}"><b>${esc(t.name)}</b><small>${t.n} 道</small></button>`).join('')}</div></div>
      ${groups.length ? groups.map(([n, xs]) => `<div class="card"><h2>${n}<span class="small muted"> · ${xs.length} 套</span></h2>${xs.map(row).join('')}</div>`).join('') : '<div class="card"><p class="muted">录入中</p></div>'}`, 'home');
    $app.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { g = +b.dataset.g; store.set('gsw.grade', g); draw(); }));
    const go = async (btn, body) => {
      btn.disabled = true;
      try { const r = await api('/api/chinese/gsw/drill', { method: 'POST', body: { student_id: auth.student.id, grade: g, ...body } }); location.hash = `#/exam/${r.session.id}`; }
      catch (x) { btn.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
    };
    $app.querySelector('#speed').onclick = (e) => go(e.currentTarget, { kind: 'speed' });
    $app.querySelectorAll('.gp-t').forEach((b) => (b.onclick = () => go(b, { kind: 'topic', topic: b.dataset.t })));
  };
  await draw();
}

// ───────── 诗人卡 / 常识卡 ─────────
let cardsCache = null;
const cardList = async () => (cardsCache ||= (await api('/api/chinese/cards')).items);
async function renderCards(q) {
  const items = await cardList();
  const tab = q.get('t') === 'topic' ? 'topic' : 'poet';
  const poets = items.filter((c) => c.kind === 'poet'), topics = items.filter((c) => c.kind === 'topic');
  const dyns = [...new Set(poets.map((c) => c.dynasty))];
  page(`<a class="small back" href="#/">← 语文首页</a>
    <div class="hero"><h1>诗人卡和常识卡</h1></div>
    <div class="seg" role="tablist"><a role="tab" class="${tab === 'poet' ? 'on' : ''}" href="#/cards">诗人 ${poets.length}</a><a role="tab" class="${tab === 'topic' ? 'on' : ''}" href="#/cards?t=topic">常识 ${topics.length}</a></div>
    ${tab === 'poet' ? dyns.map((d) => `<section class="card"><h2>${esc(d)}</h2><div class="kc-grid">${poets.filter((c) => c.dynasty === d).map((c) => `<a class="kc-chip" href="#/card/${enc(c.id)}"><b>${esc(c.name)}</b><small>${esc([c.titles?.[0], c.zi && `字${c.zi}`].filter(Boolean).join(' · '))}</small></a>`).join('')}</div></section>`).join('')
      : `<div class="card"><div class="kc-grid wide">${topics.map((c) => `<a class="kc-chip" href="#/card/${enc(c.id)}"><b>${esc(c.name)}</b><small>${c.qn ? `${c.qn} 道相关题` : ''}</small></a>`).join('')}</div></div>`}`, 'cards');
}
async function renderCard(id) {
  const items = await cardList();
  const c = items.find((x) => x.id === id);
  if (!c) return errorPage('没有这张卡');
  const li = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join('');
  const body = c.kind === 'poet'
    ? `<dl class="kc-dl">
        ${c.zi ? `<dt>字</dt><dd>${esc(c.zi)}</dd>` : ''}${c.hao ? `<dt>号</dt><dd>${esc(c.hao)}</dd>` : ''}
        ${c.titles?.length ? `<dt>称号</dt><dd>${esc(c.titles.join('、'))}</dd>` : ''}
        ${c.groups?.length ? `<dt>并称</dt><dd>${esc(c.groups.join('；'))}</dd>` : ''}
        ${c.school ? `<dt>流派</dt><dd>${esc(c.school)}</dd>` : ''}
      </dl>
      ${c.life ? `<p class="kc-life">${esc(c.life)}</p>` : ''}
      ${c.works?.length ? `<h3>代表作</h3><div class="kc-works">${c.works.map((w) => `<span>《${esc(w)}》</span>`).join('')}</div>` : ''}
      ${c.lines?.length ? `<h3>名句</h3><ul class="kc-lines">${li(c.lines)}</ul>` : ''}`
    : `${c.intro ? `<p class="kc-life">${esc(c.intro)}</p>` : ''}
      <table class="tbl kc-tbl">${(c.rows || []).map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('')}</table>`;
  page(`<a class="small back" href="#/cards${c.kind === 'topic' ? '?t=topic' : ''}">← 诗人卡和常识卡</a>
    <div class="hero"><h1>${esc(c.name)}</h1>${c.dynasty ? `<p class="muted">〔${esc(c.dynasty)}〕</p>` : ''}</div>
    <div class="card kc-card">${body}
      ${c.mix?.length ? `<div class="kc-mix"><h3>容易混</h3><ul>${li(c.mix)}</ul></div>` : ''}</div>
    ${c.qn ? `<div class="actions center"><button class="btn primary" id="drill">练相关的题</button></div>` : ''}`, 'cards');
  $app.querySelector('#drill')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/chinese/gsw/drill', { method: 'POST', body: { student_id: auth.student.id, kind: 'card', card: c.id, grade: store.get('gsw.grade', null) } }); location.hash = `#/exam/${r.session.id}`; }
    catch (x) { e.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  });
}

// ───────── 每日背诗 ─────────
// 每天新学几篇（默认 2 篇）+ 到期的复习；一篇分四步背：全文 → 挖空 → 首字 → 提示字（总决选「凭提示字背整首诗」）
let poemsCache = null;
const poemList = async () => (poemsCache ||= (await api('/api/chinese/poems')).items);
const DAYMS = 86400000;
const dayStart = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };
const poemTag = (p) => `${p.dynasty ? `〔${esc(p.dynasty)}〕` : ''}${esc(p.author)}`;
async function poemState() {
  const [items, pr] = await Promise.all([poemList(), api(`/api/chinese/poems/progress?student=${enc(auth.student.id)}`)]);
  const skew = pr.server_now - Date.now();
  const P = new Map(pr.progress.map((x) => [x.poem, x]));
  const now = Date.now() + skew;
  const due = items.filter((p) => P.get(p.idx)?.due_at && P.get(p.idx).due_at <= now + 3600000);
  const newToday = pr.progress.filter((x) => x.first_at >= dayStart() + skew).length;
  return { items, P, due, newToday, now };
}
async function renderBeishi() {
  const { items, P, due, newToday } = await poemState();
  const per = store.get('bs.new', 2);
  const fresh = items.filter((p) => !P.has(p.idx)).slice(0, Math.max(0, per - newToday));
  const learned = items.filter((p) => P.has(p.idx)).length, mastered = items.filter((p) => P.has(p.idx) && P.get(p.idx).due_at === null).length;
  const row = (p, mode) => `<a class="bs-row" href="#/poem/${p.idx}${mode ? `?m=${mode}` : ''}"><b>${esc(p.title)}</b><span class="muted small">${poemTag(p)}</span><i>›</i></a>`;
  const status = (p) => { const x = P.get(p.idx); return !x ? '' : x.due_at === null ? 'ok' : x.stage >= 3 ? 'mid' : 'on'; };
  const secs = [...new Set(items.map((p) => p.section))];
  page(`<a class="small back" href="#/">← 语文首页</a>
    <div class="hero"><h1>每日背诗</h1></div>
    <div class="dash-grid">
      <section class="card"><div class="card-h"><h2>今天</h2>
        <label class="small muted">每天新学 <select id="per">${[1, 2, 3, 5].map((n) => `<option ${n === per ? 'selected' : ''}>${n}</option>`).join('')}</select> 篇</label></div>
        ${due.length ? `<h3 class="bs-h">复习 ${due.length} 篇</h3>${due.map((p) => row(p, 'review')).join('')}` : ''}
        ${fresh.length ? `<h3 class="bs-h">新学</h3>${fresh.map((p) => row(p)).join('')}` : newToday ? '<p class="muted">今天的新篇目背完了</p>' : ''}
        ${!due.length && !fresh.length && !newToday ? '<p class="muted">全部篇目都学过了</p>' : ''}
      </section>
      <section class="card"><div class="card-h"><h2>进度</h2></div>
        <div class="bs-stat"><div><b>${learned}</b><span>学过</span></div><div><b>${mastered}</b><span>已掌握</span></div><div><b>${items.length}</b><span>必背篇目</span></div></div>
        <div class="bar"><i style="width:${Math.round((100 * learned) / Math.max(1, items.length))}%"></i></div>
      </section>
    </div>
    ${secs.map((sc) => `<details class="card bs-sec"><summary><h2>${esc(sc)}</h2><span class="muted small">${items.filter((p) => p.section === sc && P.has(p.idx)).length} / ${items.filter((p) => p.section === sc).length}</span></summary>
      <div class="bs-grid">${items.filter((p) => p.section === sc).map((p) => `<a class="bs-chip ${status(p)}" href="#/poem/${p.idx}">${esc(p.title)}<small>${esc(p.author)}</small></a>`).join('')}</div></details>`).join('')}`, 'beishi');
  $app.querySelector('#per').onchange = (e) => { store.set('bs.new', +e.target.value); renderBeishi(); };
}

// 一篇：四步。挖空和首字按句（逗号、句号分开）处理，点一下显示原文
const HANZI = /[㐀-鿿]/;
const clauses = (line) => line.match(/[^，。、；：？！—…“”]+[，。、；：？！…”]*/g) || [line];
function maskLine(line, seed, rate) { // 挖空：固定随机，同一篇每次挖同样的字
  let x = seed;
  return [...line].map((ch) => { x = (x * 9301 + 49297) % 233280; return HANZI.test(ch) && x / 233280 < rate ? `<span class="mk">${ch}</span>` : esc(ch); }).join('');
}
const firstOnly = (line) => clauses(line).map((c) => { const cs = [...c]; let first = true; return cs.map((ch) => { if (!HANZI.test(ch)) return esc(ch); if (first) { first = false; return esc(ch); } return `<span class="mk">${ch}</span>`; }).join(''); }).join('');
function hintChars(p) { // 提示字：首行、中间一行、末行的第一个字
  const L = p.text.filter((l) => l !== '—');
  const pick = [...new Set([0, Math.floor(L.length / 2), L.length - 1])].map((i) => [...L[i]].find((c) => HANZI.test(c)));
  return pick.length >= 3 ? pick : [...pick, ...[...L.join('')].filter((c) => HANZI.test(c) && !pick.includes(c)).slice(1, 4 - pick.length)];
}
async function renderPoem(idx, q) {
  const { items, P } = await poemState();
  const p = items.find((x) => x.idx === idx);
  if (!p) return errorPage('没有这一篇');
  const review = q.get('m') === 'review';
  let step = review ? 4 : +(q.get('s') || 1);
  const poetCard = (await cardList().catch(() => [])).find((c) => c.kind === 'poet' && c.name === p.author);
  const L = p.text;
  const draw = () => {
    const body = step === 1
      ? `<div class="ps-text">${L.map((l, i) => (l === '—' ? '<div class="ps-gap"></div>' : `<div class="ps-line">${esc(l)}<div class="ps-plain">${esc(p.plain[i] || '')}</div></div>`)).join('')}</div>
         ${p.notes?.length ? `<dl class="ps-notes">${p.notes.map((n) => `<dt>${esc(n.w)}</dt><dd>${esc(n.m)}</dd>`).join('')}</dl>` : ''}
         ${p.about ? `<p class="ps-about">${esc(p.about)}</p>` : ''}`
      : step === 4
        ? `<div class="ps-hint">${hintChars(p).map((c) => `<span>${esc(c)}</span>`).join('')}</div>
           <div class="ps-text masked" id="full">${L.map((l) => (l === '—' ? '<div class="ps-gap"></div>' : `<div class="ps-line"><span class="mk-line">${esc(l)}</span></div>`)).join('')}</div>`
        : `<div class="ps-text">${L.map((l, i) => (l === '—' ? '<div class="ps-gap"></div>' : `<div class="ps-line tap">${step === 2 ? maskLine(l, idx * 131 + i * 17 + 7, 0.4) : firstOnly(l)}</div>`)).join('')}</div>`;
    const steps = ['全文', '挖空', '首字', '提示字'];
    const x = P.get(idx);
    page(`<a class="small back" href="#/beishi">← 每日背诗</a>
      <div class="hero ps-head"><h1>${esc(p.title)}</h1><p class="muted">${poetCard ? `〔${esc(p.dynasty)}〕<a href="#/card/${enc(poetCard.id)}">${esc(p.author)}</a>` : poemTag(p)}</p></div>
      <div class="ps-steps" role="tablist">${steps.map((t, i) => `<button role="tab" class="${step === i + 1 ? 'on' : ''}" data-s="${i + 1}"><b>${i + 1}</b>${t}</button>`).join('')}</div>
      <div class="card ps-card">${body}</div>
      ${step === 1 && p.qs?.length ? `<details class="card ps-qs" id="qs"><summary><h2>真题里怎么考过</h2><span class="muted small">${p.qs.length} 道</span></summary><div id="qlist"><p class="muted">加载中…</p></div></details>` : ''}
      <div class="actions center ps-act">
        ${step === 4 ? '<button class="btn" id="peek">看原文</button>' : step > 1 ? '<button class="btn" id="peek">全部显示</button>' : ''}
        ${review ? '<button class="btn" id="again">没背出来</button><button class="btn primary" id="good">背出来了</button>'
          : step < 4 ? `<button class="btn primary" id="next">下一步：${steps[step]}</button>`
          : `<button class="btn primary" id="learned">${x ? '又背了一遍' : '背会了'}</button>`}
      </div>`, 'beishi');
    $app.querySelectorAll('.ps-steps button').forEach((b) => (b.onclick = () => { step = +b.dataset.s; draw(); }));
    $app.querySelector('#qs')?.addEventListener('toggle', async (e) => {
      if (!e.target.open || e.target.dataset.done) return;
      e.target.dataset.done = 1;
      const box = $app.querySelector('#qlist');
      try {
        const r = await api(`/api/chinese/poems/${idx}/questions`);
        const ans = (q) => (Object.keys(q.choices).length ? (q.kind === 'judge' ? q.choices[q.answer] : `${q.answer}. ${q.choices[q.answer] ?? ''}`) : q.answer);
        box.innerHTML = r.items.map((q) => `<div class="pq">
          <div class="pq-src small muted">${esc(q.exam)}${q.n > 1 ? ` 等 ${q.n} 套卷子` : ''}${q.real ? '' : ' · 模拟题'}</div>
          ${q.group ? `<div class="pq-group">${mtxt(q.group)}</div>` : ''}
          <div class="pq-stem">${mtxt(q.stem.replace(/\[\[\s*\]\]/g, '＿＿＿'))}</div>
          ${Object.keys(q.choices).length && q.kind !== 'judge' ? `<ul class="rv-opts">${Object.entries(q.choices).map(([k, v]) => `<li>${k}. ${esc(v)}</li>`).join('')}</ul>` : ''}
          <details class="pq-a"><summary>看答案</summary><p><b>${esc(ans(q))}</b></p>${q.basic ? `<p class="muted">${txt(q.basic)}</p>` : ''}</details></div>`).join('') || '<p class="muted">暂无</p>';
      } catch (x) { box.innerHTML = `<p class="err">${esc(x.message)}</p>`; delete e.target.dataset.done; }
    });
    $app.querySelectorAll('.ps-line.tap').forEach((el) => (el.onclick = () => el.classList.toggle('show')));
    $app.querySelector('#peek')?.addEventListener('click', () => $app.querySelector('.ps-card').classList.toggle('show'));
    $app.querySelector('#next')?.addEventListener('click', () => { step++; draw(); window.scrollTo(0, 0); });
    const send = async (result, ev) => {
      ev.target.disabled = true;
      try { await api('/api/chinese/poems/progress', { method: 'POST', body: { student_id: auth.student.id, poem: idx, result } }); location.hash = '#/beishi'; }
      catch (e) { ev.target.disabled = false; modal(`<p>${esc(e.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
    };
    $app.querySelector('#learned')?.addEventListener('click', (e) => send('learned', e));
    $app.querySelector('#good')?.addEventListener('click', (e) => send('good', e));
    $app.querySelector('#again')?.addEventListener('click', (e) => send('again', e));
  };
  draw();
}

// ───────── 考前须知 ─────────
async function renderIntro(examId) {
  const gsw = isGsw(examId);
  const exams = await api(`/api/exams?student=${enc(auth.student.id)}&family=${famOf(examId)}`);
  const e = exams.find((x) => x.id === examId);
  if (!e) return errorPage('试卷不存在');
  const saved = store.get(`hz.cur.${examId}`);
  const per = Math.round(e.duration_sec / Math.max(1, e.problem_count));
  page(`<a class="small back" href="${gsw ? '#/gsw' : '#/hanzi'}">← ${gsw ? '古诗文大会' : '汉字小达人'}</a>
    <div class="hero"><h1>${esc(e.title)}</h1></div>
    <div class="card intro">
    ${isPaper(examId) ? `<ol class="rules">
      <li>线下笔试的样子：整张卷子在一页上，限时 ${Math.round(e.duration_sec / 60)} 分钟，满分 100 分；时间到自动交卷。</li>
      <li>选择、判断点一下就行；填空直接打字，不用打标点。</li>
      <li>简答题写在框里；交卷后对照参考答案和得分点，自己给分。</li>
      <li>可以先做会的，最上面一直显示还剩多少时间、做了几题。</li>
    </ol>` : gsw ? `<ol class="rules">
      <li>共 ${e.problem_count} 题，都是单选，每题 1 分。限时 ${Math.round(e.duration_sec / 60)} 分钟，时间到自动交卷。</li>
      <li>一屏一题：点选项，再点「下一题」；可以点「上一题」回去改。</li>
      <li>平均每题只有 <b>${per} 秒</b>，拿不准的先跳过，做到最后再回头看。</li>
      <li>电脑上可以按键盘 A B C D 选答案，← → 换题。</li>
      <li>交卷后能看到每题用了几秒，以及各类考点的正确率。</li>
    </ol>` : `<ol class="rules">
      <li>共 ${e.problem_count} 题，每题 1 分。时间 ${Math.round(e.duration_sec / 60)} 分钟，左上角倒计时；时间到会自动交卷。</li>
      <li>做完一题点「下一页」；<b>没做完不能进入下一页，也不能返回上一页</b>。</li>
      <li><b>不会提示还剩多少题</b>，时间要自己把控，不要在一道题上停太久。</li>
      <li>填空题用输入法打字：不要输入标点；两句诗之间用一个空格分开。</li>
      <li>比赛排名同时看分数和用时，做完可以提前交卷。</li>
    </ol>`}
    <div class="actions">${saved ? `<a class="btn primary" href="#/exam/${saved}">继续上次的答题</a>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" id="go">${saved ? '重新开始' : '开始答题'}</button><a class="btn" href="#/">返回</a></div></div>`, 'home');
  $app.querySelector('#go').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await api('/api/sessions', { method: 'POST', body: { exam_id: examId, student_id: auth.student.id, mode: 'exam' } });
      store.set(`hz.cur.${examId}`, r.session.id);
      location.hash = `#/exam/${r.session.id}`;
    } catch (x) { ev.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  };
}

// ───────── 答题 ─────────
// 模考（mode = exam）：还原比赛，一页一题、必须作答、不能返回、不显示进度，交卷后看成绩。
// 练习（错题重做，mode = practice）：每题确认后马上显示对错和解析。
let timerId = null;
async function renderExam(sid) {
  clearInterval(timerId);
  const d = await api(`/api/sessions/${enc(sid)}`);
  if (d.session.submitted) { location.replace(`#/review/${sid}`); return; }
  if (isPaper(d.exam.id) && d.session.mode !== 'practice') return renderPaper(d, sid);
  const practice = d.session.mode === 'practice';
  const gswDrill = d.session.drill && String(d.problems[0]?.id).startsWith('gsw-');
  const gsw = (isGsw(d.exam.id) || gswDrill) && !practice; // 古诗文大会：还原线上初选 / 复选的答题页
  const speed = gsw && d.exam.title === '速答训练'; // 每题 6 秒，选了马上下一题，超时算没做
  let qTimer = null;
  const P = d.problems;
  const key = `hz.s.${sid}`;
  const S = Object.assign({ cur: 0, answers: {}, times: {}, checked: {} }, store.get(key, {}));
  const save = () => store.set(key, S);
  const skew = d.session.server_now - Date.now();
  const left = () => (d.session.deadline_at - (Date.now() + skew)) / 1000;
  const sections = d.exam.sections || [];
  const secOf = (p) => sections.find((s) => s.no === p.section);
  let shownAt = Date.now();
  let submitting = false;

  document.body.className = gsw ? 'exam-mode gsw' : 'exam-mode';
  async function submit(auto) {
    if (submitting) return; submitting = true;
    clearInterval(timerId);
    $app.querySelector('.ex-next')?.setAttribute('disabled', '');
    try {
      await api(`/api/sessions/${enc(sid)}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times } });
      store.del(key);
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('hz.cur.') && store.get(k) === sid) store.del(k); });
      if (auto) modal('<h2>时间到，已自动交卷</h2><div class="actions"><button class="btn primary" data-close>看成绩</button></div>');
      location.replace(`#/review/${sid}`);
    } catch (x) {
      submitting = false;
      modal(`<h2>交卷没成功</h2><p>${esc(x.message)}</p><p class="small muted">答案已保存在这台设备上，网络好了再点一次。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
      draw();
    }
  }
  function tick() {
    const el = $app.querySelector('#clock');
    const l = left();
    if (el) el.textContent = gsw ? mmss(l).slice(3) : mmss(l);
    const bar = $app.querySelector('#gbar');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, (100 * l) / d.exam.duration_sec))}%`;
    if (l <= 0 && !practice) submit(true);
  }
  function stamp() { const p = P[S.cur]; if (p) S.times[p.id] = (S.times[p.id] || 0) + (Date.now() - shownAt) / 1000; shownAt = Date.now(); }

  function go(i) { clearTimeout(qTimer); stamp(); S.cur = i; save(); draw(); }
  function finish() {
    const blank = P.filter((q) => !S.answers[q.id]).length;
    if (!blank) return submit(false);
    modal(`<h2>还有 ${blank} 题没做</h2><p class="muted">剩余 ${mmss(left()).slice(3)}，确定交卷吗？</p>
      <div class="actions"><button class="btn" data-close>回去检查</button><button class="btn primary" id="sure">交卷</button></div>`,
    (m, close) => { m.querySelector('#sure').onclick = () => { close(); submit(false); }; });
  }
  function drawGsw() {
    const p = P[S.cur];
    const ans = S.answers[p.id] ?? '';
    const last = S.cur === P.length - 1;
    const l = left();
    $app.innerHTML = `<div class="gx ${speed ? 'speed' : ''}">
      ${speed ? `<div class="gx-q6"><i style="animation-duration:6s"></i></div>` : ''}
      <div class="gx-top"><div class="gx-time">答题时间：<b id="clock">${mmss(l).slice(3)}</b></div>
        <div class="gx-bar"><i id="gbar" style="width:${Math.max(0, Math.min(100, (100 * l) / d.exam.duration_sec))}%"></i></div></div>
      <div class="gx-type">单选题（${S.cur + 1}/${P.length}）</div>
      <div class="gx-q">${txt(p.stem)}</div>
      <div class="gx-opts">${Object.entries(p.choices || {}).map(([k, v]) => `<button type="button" class="gx-opt ${ans === k ? 'on' : ''}" data-k="${k}"><span class="gx-k">${k}</span><span class="gx-v">${esc(v)}</span></button>`).join('')}</div>
      ${speed ? '' : `<div class="gx-nav"><button type="button" class="gx-btn" id="prev" ${S.cur ? '' : 'disabled'}>上一题</button>
        <button type="button" class="gx-btn" id="next">${last ? '交卷' : '下一题'}</button></div>`}
    </div>`;
    const advance = () => { if (last) { clearTimeout(qTimer); stamp(); save(); submit(false); } else go(S.cur + 1); };
    $app.querySelectorAll('.gx-opt').forEach((b) => (b.onclick = () => {
      S.answers[p.id] = b.dataset.k; save();
      $app.querySelectorAll('.gx-opt').forEach((x) => x.classList.toggle('on', x === b));
      if (speed) { clearTimeout(qTimer); qTimer = setTimeout(advance, 250); }
    }));
    if (speed) { clearTimeout(qTimer); qTimer = setTimeout(advance, 6000); return; }
    $app.querySelector('#prev').onclick = () => { if (S.cur) go(S.cur - 1); };
    $app.querySelector('#next').onclick = () => (last ? (stamp(), save(), finish()) : go(S.cur + 1));
  }
  function onKey(e) {
    if (!gsw || $modal.innerHTML || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toUpperCase();
    const btn = $app.querySelector(`.gx-opt[data-k="${k === '1' ? 'A' : k === '2' ? 'B' : k === '3' ? 'C' : k === '4' ? 'D' : k}"]`);
    if (btn) { e.preventDefault(); btn.click(); }
    else if (!speed && (e.key === 'ArrowRight' || e.key === 'Enter')) { e.preventDefault(); $app.querySelector('#next')?.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $app.querySelector('#prev')?.click(); }
  }

  function draw() {
    if (gsw) return drawGsw();
    const p = P[S.cur];
    const sec = secOf(p), prevSec = S.cur > 0 ? secOf(P[S.cur - 1]) : null;
    const showSec = sec && (S.cur === 0 || sec !== prevSec);
    const ans = S.answers[p.id] ?? '';
    const checked = practice && S.checked[p.id];
    const last = S.cur === P.length - 1;
    const choices = Object.entries(p.choices || {});
    const glyphs = p.figure && choices.length;
    $app.innerHTML = `<div class="ex">
      <aside class="ex-clock"><div>${practice ? '练习' : '剩余作答时间'}</div><b id="clock">${practice ? `${S.cur + 1} / ${P.length}` : mmss(left())}</b></aside>
      <section class="ex-paper">
        <header class="ex-title">${esc(d.exam.title)}</header>
        ${S.cur === 0 && !practice ? '<p class="ex-lead">请认真阅读以下题目，写出正确答案。（每小题 1 分）</p>' : ''}
        ${showSec && !practice ? `<p class="ex-sec">${'一二三四五六七八九十'[sec.no - 1] || sec.no}、${esc(sec.title)}（每小题 1 分，共 ${sec.to - sec.from + 1} 题）</p>` : ''}
        <div class="ex-q"><span class="req">*</span>${p.number}. ${txt(p.stem)}</div>
        ${p.figure ? `<div class="ex-fig">${p.figure}</div>` : ''}
        ${isFill(p) ? `${p.input_hint ? `<p class="ex-hint">${esc(p.input_hint)}</p>` : ''}
            ${p.kind === 'self' ? `<textarea id="fill" class="ex-fill" rows="4" maxlength="400" ${checked ? 'disabled' : ''}>${esc(ans)}</textarea>`
              : `<input id="fill" class="ex-fill" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" value="${esc(ans)}" ${checked ? 'disabled' : ''}>`}`
          : `<div class="ex-opts ${glyphs ? 'grid' : ''}">${choices.map(([k, v]) => `<label class="ex-opt ${checked ? (k === checked.answer ? 'right' : k === ans ? 'wrong' : '') : ''}">
              <input type="radio" name="o" value="${k}" ${ans === k ? 'checked' : ''} ${checked ? 'disabled' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`}
        ${checked?.self ? `<div class="ex-fb"><b>参考答案</b><p>${txt(checked.answer)}</p>${checked.basic ? `<p>${txt(checked.basic)}</p>` : ''}</div>`
        : checked ? `<div class="ex-fb ${checked.correct ? 'ok' : 'bad'}"><b>${checked.correct ? '答对了' : '答错了'}</b>${checked.correct ? '' : `　正确答案：<b>${esc(isFill(p) ? checked.answer : `${p.choices[checked.answer]}`)}</b>`}
            ${checked.basic ? `<p>${txt(checked.basic)}</p>` : ''}</div>` : ''}
        <div class="ex-foot"><button class="ex-next" ${ans ? '' : 'disabled'}>${practice && !checked ? '确定' : last ? '提交' : '下一页'}</button></div>
      </section></div>`;
    const next = $app.querySelector('.ex-next');
    const setAns = (v) => { v = String(v || '').trim(); if (v) S.answers[p.id] = v; else delete S.answers[p.id]; save(); next.disabled = !v; };
    $app.querySelectorAll('input[name=o]').forEach((r) => (r.onchange = () => setAns(r.value)));
    const fill = $app.querySelector('#fill');
    if (fill) {
      fill.oninput = () => setAns(fill.value);
      fill.onkeydown = (e) => { if (fill.tagName === 'INPUT' && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!next.disabled) next.click(); } };
      if (!checked && matchMedia('(pointer:fine)').matches) fill.focus();
    }
    next.onclick = async () => {
      if (!S.answers[p.id]) return;
      if (practice && !checked) { // 练习：先判对错
        try { S.checked[p.id] = await api(`/api/sessions/${enc(sid)}/check`, { method: 'POST', body: { problem_id: p.id, answer: S.answers[p.id] } }); }
        catch (x) { return modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
        save(); return draw();
      }
      stamp();
      if (last) return submit(false);
      S.cur++; save(); draw();
    };
  }
  draw();
  if (!practice) timerId = setInterval(tick, 1000);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { clearInterval(timerId); clearTimeout(qTimer); stamp(); save(); document.removeEventListener('keydown', onKey); }, { once: true });
}

// ───────── 决选笔试卷：整卷一页 ─────────
// 填空题题干里的 [[ ]] 换成输入框；没有就把输入框放在题干后面。同一材料（诗、文言文）只在第一题前显示一次。
const BLANK = /\[\[\s*\]\]/;
// 文言文材料：【字】= 加点字，〔句〕= 划线句
const mtxt = (s) => txt(s).replace(/【([^】]+)】/g, '<span class="dot">$1</span>').replace(/〔([^〕]+)〕/g, '<u>$1</u>');
function paperQ(p, ans, { review } = {}) {
  const disp = esc(p.extra?.disp || p.number);
  const kind = p.kind || (Object.keys(p.choices || {}).length ? 'choice' : 'fill');
  const ptsTag = `<span class="pp-pts">${pts(p.points ?? 1)} 分</span>`;
  if (kind === 'fill') {
    const box = `<input class="pp-fill" data-pid="${p.id}" type="text" autocomplete="off" spellcheck="false" maxlength="40" value="${esc(ans)}" ${review ? 'disabled' : ''}>`;
    const stem = mtxt(p.stem);
    return `<div class="pp-q" data-pid="${p.id}"><span class="pp-n">${disp}.</span><div class="pp-body">${BLANK.test(p.stem) ? stem.replace(/\[\[\s*\]\]/, box) : `${stem}<div>${box}</div>`}</div>${ptsTag}</div>`;
  }
  if (kind === 'self') {
    return `<div class="pp-q" data-pid="${p.id}"><span class="pp-n">${disp}.</span><div class="pp-body">${mtxt(p.stem)}
      <textarea class="pp-text" data-pid="${p.id}" rows="3" maxlength="400" ${review ? 'disabled' : ''}>${esc(ans)}</textarea></div>${ptsTag}</div>`;
  }
  const opts = Object.entries(p.choices || {});
  return `<div class="pp-q" data-pid="${p.id}"><span class="pp-n">${disp}.</span><div class="pp-body">${mtxt(p.stem)}
    <div class="pp-opts ${kind === 'judge' ? 'judge' : opts.every(([, v]) => String(v).length <= 6) ? 'short' : ''}">${opts.map(([k, v]) => `<label class="pp-opt"><input type="radio" name="o-${p.id}" value="${k}" ${ans === k ? 'checked' : ''} ${review ? 'disabled' : ''}><span>${kind === 'judge' ? esc(v) : `${k}. ${esc(v)}`}</span></label>`).join('')}</div></div>${ptsTag}</div>`;
}
function renderPaper(d, sid) {
  clearInterval(timerId);
  const P = d.problems;
  const key = `hz.s.${sid}`;
  const S = Object.assign({ answers: {} }, store.get(key, {}));
  const save = () => store.set(key, S);
  const skew = d.session.server_now - Date.now();
  const left = () => (d.session.deadline_at - (Date.now() + skew)) / 1000;
  const secs = d.exam.sections || [];
  const total = P.reduce((a, p) => a + (p.points ?? 1), 0);
  let submitting = false;
  document.body.className = 'exam-mode paper';
  let html = '', lastSec = null, lastGroup = null;
  for (const p of P) {
    const sec = secs.find((x) => x.no === p.section);
    if (sec && sec !== lastSec) { html += `<h2 class="pp-sec">${CN[sec.no - 1] || sec.no}、${esc(sec.title || sec.name)}</h2>`; lastSec = sec; lastGroup = null; }
    const g = p.extra?.group;
    if (g && g.id !== lastGroup) { html += `<div class="pp-group">${mtxt(g.text)}</div>`; lastGroup = g.id; }
    if (!g) lastGroup = null;
    html += paperQ(p, S.answers[p.id] ?? '');
  }
  $app.innerHTML = `<div class="pp">
    <div class="pp-bar"><b class="pp-title">${esc(d.exam.title)}</b><span class="pp-clock" id="clock">${mmss(left()).slice(3)}</span>
      <span class="pp-done" id="done"></span><button class="btn primary" id="hand">交卷</button></div>
    <div class="pp-paper"><p class="pp-lead">满分 ${pts(total)} 分 · 限时 ${Math.round(d.exam.duration_sec / 60)} 分钟</p>${html}
      <div class="actions center"><button class="btn primary" id="hand2">交卷</button></div></div></div>`;
  const count = () => { $app.querySelector('#done').textContent = `已答 ${P.filter((p) => String(S.answers[p.id] ?? '').trim()).length} / ${P.length}`; };
  count();
  const set = (pid, v) => { v = String(v ?? ''); if (v.trim()) S.answers[pid] = v; else delete S.answers[pid]; save(); count(); };
  $app.querySelectorAll('input[type=radio]').forEach((r) => (r.onchange = () => set(r.name.slice(2), r.value)));
  $app.querySelectorAll('.pp-fill, .pp-text').forEach((el) => (el.oninput = () => set(el.dataset.pid, el.value)));
  async function submit(auto) {
    if (submitting) return; submitting = true;
    clearInterval(timerId);
    try {
      await api(`/api/sessions/${enc(sid)}/submit`, { method: 'POST', body: { answers: S.answers, times: {} } });
      store.del(key);
      Object.keys(localStorage).forEach((k) => { if (k.startsWith('hz.cur.') && store.get(k) === sid) store.del(k); });
      if (auto) modal('<h2>时间到，已自动交卷</h2><div class="actions"><button class="btn primary" data-close>看成绩</button></div>');
      location.replace(`#/review/${sid}`);
    } catch (x) {
      submitting = false;
      modal(`<h2>交卷没成功</h2><p>${esc(x.message)}</p><p class="small muted">答案已保存在这台设备上，网络好了再点一次。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
    }
  }
  const hand = () => {
    const blank = P.filter((p) => !String(S.answers[p.id] ?? '').trim()).length;
    modal(`<h2>${blank ? `还有 ${blank} 题没做` : '确定交卷吗？'}</h2><p class="muted">剩余 ${mmss(left()).slice(3)}</p>
      <div class="actions"><button class="btn" data-close>回去检查</button><button class="btn primary" id="sure">交卷</button></div>`,
    (m, close) => { m.querySelector('#sure').onclick = () => { close(); submit(false); }; });
  };
  $app.querySelector('#hand').onclick = hand;
  $app.querySelector('#hand2').onclick = hand;
  timerId = setInterval(() => { const l = left(); const el = $app.querySelector('#clock'); if (el) { el.textContent = mmss(l).slice(3); el.classList.toggle('low', l < 300); } if (l <= 0) submit(true); }, 1000);
  window.addEventListener('hashchange', () => clearInterval(timerId), { once: true });
}

// 决选成绩：总分、各大题得分、简答自评、逐题对照
async function renderPaperReview(r, sid) {
  const items = r.items;
  const secs = r.exam.sections || [];
  const total = items.reduce((a, x) => a + (x.points ?? 1), 0);
  const selfs = items.filter((x) => x.kind === 'self');
  const score = () => items.reduce((a, x) => a + (x.got ?? 0), 0);
  const bySec = secs.map((sc) => { const xs = items.filter((x) => x.section === sc.no); return { ...sc, full: xs.reduce((a, x) => a + (x.points ?? 1), 0), got: xs.reduce((a, x) => a + (x.got ?? 0), 0) }; }).filter((x) => x.full);
  const ansText = (x, v) => (v == null ? '' : x.kind === 'self' || !Object.keys(x.choices || {}).length ? v : x.kind === 'judge' ? x.choices[v] ?? v : `${v}. ${x.choices[v] ?? ''}`);
  const item = (x, lastGroup) => {
    const g = x.extra?.group;
    const head = g && g.id !== lastGroup ? `<div class="pp-group">${mtxt(g.text)}</div>` : '';
    const full = x.points ?? 1, got = x.got ?? 0;
    const state = x.kind === 'self' ? 'self' : got >= full ? 'ok' : 'bad';
    return `${head}<div class="rv-item ${state === 'self' ? '' : state}" data-ok="${state === 'ok' ? 1 : 0}">
      <div class="rv-q"><span class="rv-n">${esc(x.extra?.disp || x.number)}</span>${txt(x.stem.replace(/\[\[\s*\]\]/g, '＿＿＿'))}<span class="rv-t">${pts(got)} / ${pts(full)} 分</span></div>
      ${x.kind === 'self' ? `<div class="rv-ans">你的回答：${x.choice ? txt(x.choice) : '<span class="muted">没写</span>'}</div><div class="rv-sol"><b>参考答案</b>　${txt(x.answer)}</div>`
        : `<div class="rv-ans">${state === 'ok' ? `<span class="tag ok">✓ 对</span> ${esc(ansText(x, x.choice))}` : `<span class="tag bad">✗ ${x.choice == null ? '没做' : '错'}</span>${x.choice != null ? ` 你的答案：<s>${esc(ansText(x, x.choice))}</s>　` : ' '}正确答案：<b>${esc(ansText(x, x.answer))}</b>`}</div>`}
      ${x.basic ? `<div class="rv-sol">${txt(x.basic)}</div>` : ''}</div>`;
  };
  let list = '', lastSec = null, lastGroup = null;
  for (const x of items) {
    const sc = secs.find((y) => y.no === x.section);
    if (sc && sc !== lastSec) { list += `<h3 class="pp-sec">${CN[sc.no - 1] || sc.no}、${esc(sc.name)}</h3>`; lastSec = sc; lastGroup = null; }
    list += item(x, lastGroup); lastGroup = x.extra?.group?.id ?? null;
  }
  const selfCard = selfs.length ? `<div class="card" id="selfcard"><h2>简答题自评</h2>
    ${selfs.map((x) => { const rb = x.extra?.rubric || []; return `<div class="sf" data-pid="${x.problem_id}" data-full="${x.points ?? 1}">
      <div class="rv-q"><span class="rv-n">${esc(x.extra?.disp || x.number)}</span>${txt(x.stem)}</div>
      <div class="rv-ans">你的回答：${x.choice ? txt(x.choice) : '<span class="muted">没写</span>'}</div>
      <div class="rv-sol"><b>参考答案</b>　${txt(x.answer)}</div>
      ${rb.length ? `<div class="sf-rb">${rb.map((it, i) => `<label class="sf-it"><input type="checkbox" data-i="${i}" data-pts="${it.pts}"><span>${esc(it.text)}</span><b>${pts(it.pts)} 分</b></label>`).join('')}</div>`
        : `<div class="sf-rb"><label class="sf-it">得分 <input type="number" class="sf-num" min="0" max="${x.points ?? 1}" step="0.5" value="${x.got ?? 0}"> / ${pts(x.points ?? 1)} 分</label></div>`}
      <div class="sf-foot"><span class="muted small">这题得 <b class="sf-got">${pts(x.got ?? 0)}</b> 分</span><button class="btn" data-save>保存</button></div></div>`; }).join('')}</div>` : '';
  page(`<a class="small back" href="#/gsw">← 古诗文大会</a>
    <div class="hero"><h1>${esc(r.exam.title)}</h1></div>
    <div class="card score">
      <div class="score-big"><b id="tot">${pts(score())}</b><span> / ${pts(total)} 分</span></div>
      <table class="tbl"><tr><th>大题</th><th>得分</th><th>得分率</th></tr>${bySec.map((x) => `<tr><td>${CN[x.no - 1] || x.no}、${esc(x.name)}</td><td class="num" data-sec="${x.no}">${pts(x.got)} / ${pts(x.full)}</td><td><span class="bar"><i style="width:${Math.round((100 * x.got) / x.full)}%"></i></span> ${Math.round((100 * x.got) / x.full)}%</td></tr>`).join('')}</table>
      <div class="actions">${isGuest() ? '<a class="btn" href="/account/">注册后收进错题本</a>' : '<a class="btn" href="#/mistakes">去错题本</a>'}<a class="btn" href="#/">回首页</a></div></div>
    ${selfCard}
    <div class="card"><div class="rv-head"><h2>逐题对照</h2></div><div id="rv">${list}</div></div>`, 'home');
  $app.querySelectorAll('.sf').forEach((el) => {
    const full = +el.dataset.full;
    const calc = () => { const num = el.querySelector('.sf-num'); const v = num ? +num.value || 0 : [...el.querySelectorAll('input[type=checkbox]:checked')].reduce((a, c) => a + +c.dataset.pts, 0); return Math.min(full, v); };
    el.querySelectorAll('input').forEach((i) => (i.oninput = i.onchange = () => { el.querySelector('.sf-got').textContent = pts(calc()); }));
    el.querySelector('[data-save]').onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        const res = await api(`/api/sessions/${enc(sid)}/selfscore`, { method: 'POST', body: { problem_id: el.dataset.pid, got: calc() } });
        const it = items.find((x) => x.problem_id === el.dataset.pid); it.got = res.got;
        $app.querySelector('#tot').textContent = pts(score());
        ev.target.textContent = '已保存';
      } catch (x) { ev.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
    };
  });
}

// ───────── 成绩和解析 ─────────
async function renderReview(sid) {
  const r = await api(`/api/sessions/${enc(sid)}/review`);
  if (isPaper(r.exam.id) && r.session.mode !== 'practice') return renderPaperReview(r, sid);
  const items = r.items;
  const score = items.filter((x) => x.correct).length;
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const secs = r.exam.sections || [];
  const bySec = secs.map((s) => { const xs = items.filter((x) => x.section === s.no); return { ...s, n: xs.length, ok: xs.filter((x) => x.correct).length }; }).filter((s) => s.n);
  const wrong = items.filter((x) => !x.correct);
  let only = wrong.length > 0;
  const gsw = isGsw(r.exam.id) || String(items[0]?.problem_id).startsWith('gsw-');
  // 古诗文：按考点统计正确率；每题用时（线上赛平均每题不到 10 秒，慢题单独数出来）
  const topics = {};
  if (gsw) for (const x of items) { const t = x.types?.[0]?.name || '其他'; (topics[t] ||= { n: 0, ok: 0 }).n++; if (x.correct) topics[t].ok++; }
  const timed = items.filter((x) => x.choice != null && x.time_sec != null);
  const avg = timed.length ? timed.reduce((a, x) => a + x.time_sec, 0) / timed.length : 0;
  const per = r.exam.duration_sec / Math.max(1, items.length);
  const slow = gsw ? timed.filter((x) => x.time_sec > per * 1.5).length : 0;
  const itemHtml = (x) => {
    const fill = isFill(x);
    const mine = x.choice == null ? '未作答' : fill ? x.choice : `${x.choice in x.choices ? x.choices[x.choice] : x.choice}`;
    const right = fill ? x.answer : x.choices[x.answer];
    return `<div class="rv-item ${x.correct ? 'ok' : 'bad'}" data-ok="${x.correct ? 1 : 0}">
      <div class="rv-q"><span class="rv-n">${x.number}</span>${txt(x.stem)}${gsw && x.choice != null && x.time_sec != null ? `<span class="rv-t ${x.time_sec > per * 1.5 ? 'slow' : ''}">${x.time_sec} 秒</span>` : ''}</div>
      ${x.figure ? `<div class="ex-fig small">${x.figure}</div>` : ''}
      ${fill ? '' : `<ul class="rv-opts">${Object.entries(x.choices).map(([k, v]) => `<li class="${k === x.answer ? 'right' : k === x.choice ? 'wrong' : ''}">${esc(v)}</li>`).join('')}</ul>`}
      <div class="rv-ans">${x.correct ? `<span class="tag ok">✓ 对</span> ${fill ? esc(mine) : ''}` : `<span class="tag bad">✗ ${x.choice == null ? '未作答' : '错'}</span>${x.choice != null ? ` 你的答案：<s>${esc(mine)}</s>　` : ' '}正确答案：<b>${esc(right)}</b>`}</div>
      ${x.basic ? `<div class="rv-sol">${txt(x.basic)}</div>` : ''}</div>`;
  };
  page(`<a class="small back" href="${gsw ? '#/gsw' : '#/hanzi'}">← ${gsw ? '古诗文大会' : '汉字小达人'}</a>
    <div class="hero"><h1>${esc(r.exam.title)}</h1></div>
    ${gsw && r.exam.id === 'drill' ? `<div class="actions"><button class="btn primary" id="again">${r.exam.title === '速答训练' ? '再来 20 题' : '再练 15 题'}</button></div>` : ''}
    <div class="card score">
      <div class="score-big"><b>${score}</b><span> / ${items.length} 分</span></div>
      <p class="muted">用时 ${dur(Math.min(used, r.exam.duration_sec + 30))}${r.session.mode === 'practice' ? '' : `（限时 ${Math.round(r.exam.duration_sec / 60)} 分钟）`}</p>
      ${gsw && timed.length ? `<p class="muted">平均每题 ${avg.toFixed(1)} 秒${slow ? ` · 超过 ${Math.round(per * 1.5)} 秒的题 ${slow} 道` : ''}${items.length - timed.length ? ` · 没做 ${items.length - timed.length} 题` : ''}</p>` : ''}
      ${gsw ? `<table class="tbl"><tr><th>考点</th><th>得分</th><th>正确率</th></tr>${Object.entries(topics).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => `<tr><td>${esc(t)}</td><td class="num">${v.ok} / ${v.n}</td><td><span class="bar"><i style="width:${Math.round((100 * v.ok) / v.n)}%"></i></span> ${Math.round((100 * v.ok) / v.n)}%</td></tr>`).join('')}</table>`
      : bySec.length ? `<table class="tbl"><tr><th>大题</th><th>得分</th><th>正确率</th></tr>${bySec.map((s) => `<tr><td>${'一二三四五六七八九十'[s.no - 1] || s.no}、${esc(s.name)}</td><td class="num">${s.ok} / ${s.n}</td><td><span class="bar"><i style="width:${Math.round((100 * s.ok) / s.n)}%"></i></span> ${Math.round((100 * s.ok) / s.n)}%</td></tr>`).join('')}</table>` : ''}
      <div class="actions">${isGuest() ? '<a class="btn" href="/account/">注册后收进错题本</a>' : '<a class="btn" href="#/mistakes">去错题本</a>'}<a class="btn" href="#/">回首页</a></div></div>
    <div class="card"><div class="rv-head"><h2>逐题解析</h2>${wrong.length ? `<label class="small"><input type="checkbox" id="only" checked> 只看错题（${wrong.length}）</label>` : ''}</div>
      <div id="rv">${items.map(itemHtml).join('')}</div></div>`, 'home');
  $app.querySelector('#again')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const tp = Object.entries({ mingju: '名句补全', chuchu: '作者与出处', shiren: '诗人常识', shiyi: '诗意理解', xiuci: '修辞与体裁', wenhua: '文化常识', zixing: '字音字形', paixu: '诗句排序', ciyi: '字词释义', wenyan: '文言文阅读' }).find(([, n]) => r.exam.title.endsWith(n))?.[0];
    const cd = /^(诗人卡|常识卡) · /.test(r.exam.title) ? (await cardList()).find((c) => r.exam.title.endsWith(c.name)) : null;
    try { const s2 = await api('/api/chinese/gsw/drill', { method: 'POST', body: { student_id: auth.student.id, grade: store.get('gsw.grade', 3), ...(cd ? { kind: 'card', card: cd.id } : tp ? { kind: 'topic', topic: tp } : { kind: 'speed' }) } }); location.hash = `#/exam/${s2.session.id}`; }
    catch (x) { e.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  });
  const apply = () => $app.querySelectorAll('.rv-item').forEach((el) => el.classList.toggle('hidden', only && el.dataset.ok === '1'));
  apply();
  const cb = $app.querySelector('#only');
  if (cb) cb.onchange = () => { only = cb.checked; apply(); };
}

// ───────── 错题本 ─────────
const STATUS = { pending: '待订正', due: '该复习了', fixed: '已订正', mastered: '已掌握' };
async function renderMistakes() {
  if (isGuest()) return page(`<div class="hero"><h1>错题本</h1></div><div class="card"><h2>注册后可以使用</h2>
    <a class="btn primary" href="/account/">免费注册</a></div>`, 'mistakes');
  const r = await api(`/api/students/${enc(auth.student.id)}/mistakes?subject=chinese`);
  const list = r.mistakes;
  if (!list.length) return page('<div class="hero"><h1>错题本</h1></div><div class="card"><h2>还没有错题</h2><a class="btn primary" href="#/hanzi">去模考</a></div>', 'mistakes');
  const todo = list.filter((m) => m.status === 'pending' || m.status === 'due');
  const groups = {};
  for (const m of list) (groups[m.section_name || '其他'] ||= []).push(m);
  page(`<div class="hero"><h1>错题本</h1></div><div class="card"><p class="muted">共 ${list.length} 题，待订正 ${todo.length} 题</p>
      <div class="actions">${todo.length ? `<button class="btn primary" id="redo">重做 ${Math.min(todo.length, 30)} 道错题</button>` : '<span class="tag ok">全部订正过了</span>'}</div></div>
    ${Object.entries(groups).map(([g, ms]) => `<div class="card"><h2>${esc(g)} <span class="small muted">${ms.length} 题</span></h2>
      ${ms.map((m) => `<details class="mk"><summary><span class="tag ${m.status === 'mastered' || m.status === 'fixed' ? 'ok' : 'bad'}">${STATUS[m.status]}</span> ${esc(m.label)}<span class="small muted"> · 错 ${m.wrong_n} 次</span></summary>
        <div class="rv-q">${txt(m.stem)}</div>${m.figure ? `<div class="ex-fig small">${m.figure}</div>` : ''}
        ${isFill(m) ? '' : `<ul class="rv-opts">${Object.entries(m.choices).map(([k, v]) => `<li class="${k === m.answer ? 'right' : k === m.last_choice ? 'wrong' : ''}">${esc(v)}</li>`).join('')}</ul>`}
        <div class="rv-ans">上次${m.last_choice ? `答 <s>${esc(isFill(m) ? m.last_choice : m.choices[m.last_choice] ?? m.last_choice)}</s>，` : '没作答，'}正确答案 <b>${esc(isFill(m) ? m.answer : m.choices[m.answer])}</b></div>
        ${m.basic ? `<div class="rv-sol">${txt(m.basic)}</div>` : ''}</details>`).join('')}</div>`).join('')}`, 'mistakes');
  $app.querySelector('#redo')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const s = await api('/api/sessions', { method: 'POST', body: { student_id: auth.student.id, problem_ids: todo.slice(0, 30).map((m) => m.problem_id), purpose: 'pending' } });
      location.hash = `#/exam/${s.session.id}`;
    } catch (x) { e.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  });
}

router();
