// 语文 · 汉字小达人真题模考（learn-inside.com/chinese/）· 前端（原生 JS，无构建步骤）
// 路由：#/（首页：试卷、成绩）  #/intro/:examId（考前须知）  #/exam/:sid（答题）  #/review/:sid（成绩和解析）
//       #/mistakes（错题本）  #/join（登录 / 注册）
// 账号全站通用：和数学板块共用 li.token / li.student。接口在 /api/（全站）。

import { sideNav } from '/assets/sidenav.js?v=20261106c';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const FAMILY = 'hanzi';

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
  const who = me ? { name: me.guest ? '游客 · 注册' : auth.student?.nickname || '账号', note: me.guest ? '注册后错题本可用' : '' } : null;
  return sideNav({ section: 'chinese', sub: [['#/mistakes', '错题本', 'mistakes', active === 'mistakes']], who });
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
const page = (html, active) => { document.body.className = ''; $app.innerHTML = `${topnav(active)}<main class="page">${html}</main>`; window.scrollTo(0, 0); };
const errorPage = (msg) => page(`<div class="card"><p class="err">${esc(msg)}</p><a class="btn" href="#/">回首页</a></div>`);

// ───────── 路由 ─────────
async function router() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  try {
    if (parts[0] === 'join') return renderJoin();
    if (!auth.token) return renderJoin();
    if (!me) me = await api('/api/me');
    if (!parts.length) return renderHome();
    if (parts[0] === 'intro') return renderIntro(parts[1]);
    if (parts[0] === 'exam') return renderExam(parts[1]);
    if (parts[0] === 'review') return renderReview(parts[1]);
    if (parts[0] === 'mistakes') return renderMistakes();
    location.hash = '#/';
  } catch (e) { errorPage(e.message); }
}
window.addEventListener('hashchange', router);

// ───────── 登录 / 注册 / 游客 ─────────
let joinTab = 'register';
function renderJoin() {
  const reg = joinTab === 'register';
  document.body.className = '';
  $app.innerHTML = `${topnav()}<main class="page narrow">
    <div class="hero"><h1>汉字小达人 · 真题模考</h1><p class="muted">150 题，40 分钟，一页一题，和比赛的答题界面一样。交卷马上出分，每题都有解析。</p></div>
    <div class="card">
      <div class="tabs"><button data-tab="register" class="${reg ? 'on' : ''}">注册</button><button data-tab="login" class="${reg ? '' : 'on'}">登录</button></div>
      <form id="join" autocomplete="on">
        <label class="field"><span>手机号</span><input name="phone" type="tel" inputmode="numeric" maxlength="13" autocomplete="tel" required></label>
        <label class="field"><span>密码</span><input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
        ${reg ? `<label class="field"><span>再输一次密码</span><input name="password2" type="password" autocomplete="new-password" required></label>
        <label class="field"><span>孩子的昵称</span><input name="nickname" maxlength="20" placeholder="例如：小桐" required></label>` : ''}
        <button class="btn primary block" type="submit">${reg ? '注册' : '登录'}</button>
        <p class="err" id="err"></p>
      </form>
      <p class="small muted">数学、语文用同一个账号。</p>
    </div>
    <div class="card center"><button class="btn block" id="guest">先不注册，直接试试</button>
      <p class="small muted">游客可以模考、看成绩和解析；错题本要注册后才能用，做过的题会自动算进去。</p></div>
  </main>`;
  $app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { joinTab = b.dataset.tab; renderJoin(); }));
  const err = $app.querySelector('#err');
  $app.querySelector('#join').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.phone = String(f.phone || '').replace(/\D/g, '');
    if (!/^1\d{10}$/.test(f.phone)) return (err.textContent = '请输入正确的 11 位手机号');
    if (!f.password || (reg && f.password.length < 6)) return (err.textContent = reg ? '密码至少 6 位' : '请输入密码');
    if (reg && f.password !== f.password2) return (err.textContent = '两次输入的密码不一样');
    delete f.password2;
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; err.textContent = '';
    try {
      const r = await api(`/api/auth/${reg ? 'register' : 'login'}`, { method: 'POST', body: f });
      auth.save(r.token, r.student); me = null; location.hash = '#/'; router();
    } catch (x) {
      if (reg && /已经注册过/.test(x.message)) { joinTab = 'login'; renderJoin(); $app.querySelector('[name=phone]').value = f.phone; $app.querySelector('#err').textContent = '这个手机号已经注册过，输入密码直接登录'; return; }
      err.textContent = x.message; btn.disabled = false;
    }
  };
  $app.querySelector('#guest').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/auth/guest', { method: 'POST', body: {} }); auth.save(r.token, r.student); me = null; location.hash = '#/'; router(); }
    catch (x) { err.textContent = x.message; e.target.disabled = false; }
  };
}

// ───────── 首页：试卷和成绩 ─────────
async function renderHome() {
  const st = auth.student;
  const [exams, prof, mk] = await Promise.all([
    api(`/api/exams?student=${enc(st.id)}&family=${FAMILY}`),
    api(`/api/students/${enc(st.id)}/profile?subject=chinese`).catch(() => ({ sessions: [] })),
    isGuest() ? { mistakes: [] } : api(`/api/students/${enc(st.id)}/mistakes?subject=chinese`).catch(() => ({ mistakes: [] })),
  ]);
  // 今天做什么：没做完的模考、待订正 / 该复习的错题
  const unfinished = exams.filter((e) => store.get(`hz.cur.${e.id}`));
  const todo = (mk.mistakes || []).filter((m) => m.status === 'pending' || m.status === 'due').length;
  const tasks = [
    ...unfinished.map((e) => `<a class="task" href="#/exam/${store.get(`hz.cur.${e.id}`)}"><b>继续</b><span>${esc(e.title)}<small>上次没做完，接着答题</small></span></a>`),
    todo && `<a class="task" href="#/mistakes"><b>${todo}</b><span>道错题待订正<small>重做时每题马上告诉你对错</small></span></a>`,
  ].filter(Boolean);
  const sessions = (prof.sessions || []).filter((s) => s.mode === 'exam' || s.mode === 'practice');
  const row = (e) => `<div class="exam-row">
      <div><b>${esc(e.title)}</b><div class="small muted">${e.year ?? ''} 年 · ${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟</div></div>
      <div class="exam-act">${e.last_session ? `<a class="small" href="#/review/${e.last_session}">上次 ${e.last_score} 分</a>` : ''}
        <a class="btn primary" href="#/intro/${enc(e.id)}">开始模考</a></div></div>`;
  const real = exams.filter((e) => !e.id.endsWith('-mock')), mock = exams.filter((e) => e.id.endsWith('-mock'));
  const cards = real.length ? real.map(row).join('') : '<p class="muted">试卷整理中，很快上线。</p>';
  page(`<div class="hero"><h1>汉字小达人 · 真题模考</h1><p class="muted small">选一套开始，答题界面和比赛一样。</p></div>
    <div class="card"><h2>真题</h2>${cards}</div>
    ${tasks.length ? `<div class="card"><h2>今天做什么</h2><div class="tasks">${tasks.join('')}</div></div>` : ''}
    ${mock.length ? `<div class="card"><h2>模拟题</h2><p class="small muted">《中文自修》每年七八月合刊的官方模拟题，题量比正式比赛大，适合分几次练。</p>${mock.map(row).join('')}</div>` : ''}
    ${sessions.length ? `<div class="card"><h2>我的成绩</h2><table class="tbl"><tr><th>试卷</th><th>得分</th><th>日期</th><th></th></tr>
      ${sessions.map((s) => `<tr><td>${esc(s.title)}</td><td class="num">${s.score ?? '–'} / ${s.total}</td><td>${day(s.submitted_at)}</td><td><a href="#/review/${s.id}">查看</a></td></tr>`).join('')}</table></div>` : ''}
    <div class="card small muted"><p style="margin-top:0">比赛规则：上海市小学生「美丽汉字小达人」市级活动 150 题、每题 1 分、40 分钟。这里的答题界面和比赛一样：一页一题，做完才能进下一页，不能返回，也不显示还剩几题。</p>题目来源：《中文自修》「美丽汉字小达人」历届市级活动，仅供练习。比赛通知以《中文自修》官网和公众号「魔都语文课代表」为准。</div>`, 'home');
}

// ───────── 考前须知 ─────────
async function renderIntro(examId) {
  const exams = await api(`/api/exams?student=${enc(auth.student.id)}&family=${FAMILY}`);
  const e = exams.find((x) => x.id === examId);
  if (!e) return errorPage('试卷不存在');
  const saved = store.get(`hz.cur.${examId}`);
  page(`<div class="card intro"><h1>${esc(e.title)}</h1>
    <ol class="rules">
      <li>共 ${e.problem_count} 题，每题 1 分。时间 ${Math.round(e.duration_sec / 60)} 分钟，左上角倒计时；时间到会自动交卷。</li>
      <li>做完一题点「下一页」；<b>没做完不能进入下一页，也不能返回上一页</b>。</li>
      <li><b>不会提示还剩多少题</b>，时间要自己把控，不要在一道题上停太久。</li>
      <li>填空题用输入法打字：不要输入标点；两句诗之间用一个空格分开。</li>
      <li>比赛排名同时看分数和用时，做完可以提前交卷。</li>
    </ol>
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
  const practice = d.session.mode === 'practice';
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

  document.body.className = 'exam-mode';
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
    if (el) el.textContent = mmss(l);
    if (l <= 0 && !practice) submit(true);
  }
  function stamp() { const p = P[S.cur]; if (p) S.times[p.id] = (S.times[p.id] || 0) + (Date.now() - shownAt) / 1000; shownAt = Date.now(); }

  function draw() {
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
            <input id="fill" class="ex-fill" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40" value="${esc(ans)}" ${checked ? 'disabled' : ''}>`
          : `<div class="ex-opts ${glyphs ? 'grid' : ''}">${choices.map(([k, v]) => `<label class="ex-opt ${checked ? (k === checked.answer ? 'right' : k === ans ? 'wrong' : '') : ''}">
              <input type="radio" name="o" value="${k}" ${ans === k ? 'checked' : ''} ${checked ? 'disabled' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`}
        ${checked ? `<div class="ex-fb ${checked.correct ? 'ok' : 'bad'}"><b>${checked.correct ? '答对了' : '答错了'}</b>${checked.correct ? '' : `　正确答案：<b>${esc(isFill(p) ? checked.answer : `${p.choices[checked.answer]}`)}</b>`}
            ${checked.basic ? `<p>${txt(checked.basic)}</p>` : ''}</div>` : ''}
        <div class="ex-foot"><button class="ex-next" ${ans ? '' : 'disabled'}>${practice && !checked ? '确定' : last ? '提交' : '下一页'}</button></div>
      </section></div>`;
    const next = $app.querySelector('.ex-next');
    const setAns = (v) => { v = String(v || '').trim(); if (v) S.answers[p.id] = v; else delete S.answers[p.id]; save(); next.disabled = !v; };
    $app.querySelectorAll('input[name=o]').forEach((r) => (r.onchange = () => setAns(r.value)));
    const fill = $app.querySelector('#fill');
    if (fill) {
      fill.oninput = () => setAns(fill.value);
      fill.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!next.disabled) next.click(); } };
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
  window.addEventListener('hashchange', () => { clearInterval(timerId); stamp(); save(); }, { once: true });
}

// ───────── 成绩和解析 ─────────
async function renderReview(sid) {
  const r = await api(`/api/sessions/${enc(sid)}/review`);
  const items = r.items;
  const score = items.filter((x) => x.correct).length;
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const secs = r.exam.sections || [];
  const bySec = secs.map((s) => { const xs = items.filter((x) => x.section === s.no); return { ...s, n: xs.length, ok: xs.filter((x) => x.correct).length }; }).filter((s) => s.n);
  const wrong = items.filter((x) => !x.correct);
  let only = wrong.length > 0;
  const itemHtml = (x) => {
    const fill = isFill(x);
    const mine = x.choice == null ? '未作答' : fill ? x.choice : `${x.choice in x.choices ? x.choices[x.choice] : x.choice}`;
    const right = fill ? x.answer : x.choices[x.answer];
    return `<div class="rv-item ${x.correct ? 'ok' : 'bad'}" data-ok="${x.correct ? 1 : 0}">
      <div class="rv-q"><span class="rv-n">${x.number}</span>${txt(x.stem)}</div>
      ${x.figure ? `<div class="ex-fig small">${x.figure}</div>` : ''}
      ${fill ? '' : `<ul class="rv-opts">${Object.entries(x.choices).map(([k, v]) => `<li class="${k === x.answer ? 'right' : k === x.choice ? 'wrong' : ''}">${esc(v)}</li>`).join('')}</ul>`}
      <div class="rv-ans">${x.correct ? `<span class="tag ok">✓ 对</span> ${fill ? esc(mine) : ''}` : `<span class="tag bad">✗ ${x.choice == null ? '未作答' : '错'}</span>${x.choice != null ? ` 你的答案：<s>${esc(mine)}</s>　` : ' '}正确答案：<b>${esc(right)}</b>`}</div>
      ${x.basic ? `<div class="rv-sol">${txt(x.basic)}</div>` : ''}</div>`;
  };
  page(`<div class="card score">
      <div class="score-big"><b>${score}</b><span> / ${items.length} 分</span></div>
      <p class="muted">${esc(r.exam.title)} · 用时 ${dur(Math.min(used, r.exam.duration_sec + 30))}${r.session.mode === 'practice' ? '' : `（限时 ${Math.round(r.exam.duration_sec / 60)} 分钟）`}</p>
      ${bySec.length ? `<table class="tbl"><tr><th>大题</th><th>得分</th><th>正确率</th></tr>${bySec.map((s) => `<tr><td>${'一二三四五六七八九十'[s.no - 1] || s.no}、${esc(s.name)}</td><td class="num">${s.ok} / ${s.n}</td><td><span class="bar"><i style="width:${Math.round((100 * s.ok) / s.n)}%"></i></span> ${Math.round((100 * s.ok) / s.n)}%</td></tr>`).join('')}</table>` : ''}
      <div class="actions">${isGuest() ? '<a class="btn" href="/account/">注册后收进错题本</a>' : '<a class="btn" href="#/mistakes">去错题本</a>'}<a class="btn" href="#/">回首页</a></div></div>
    <div class="card"><div class="rv-head"><h2>逐题解析</h2>${wrong.length ? `<label class="small"><input type="checkbox" id="only" checked> 只看错题（${wrong.length}）</label>` : ''}</div>
      <div id="rv">${items.map(itemHtml).join('')}</div></div>`, 'home');
  const apply = () => $app.querySelectorAll('.rv-item').forEach((el) => el.classList.toggle('hidden', only && el.dataset.ok === '1'));
  apply();
  const cb = $app.querySelector('#only');
  if (cb) cb.onchange = () => { only = cb.checked; apply(); };
}

// ───────── 错题本 ─────────
const STATUS = { pending: '待订正', due: '该复习了', fixed: '已订正', mastered: '已掌握' };
async function renderMistakes() {
  if (isGuest()) return page(`<div class="card center"><h2>错题本要注册后才能用</h2><p class="muted">注册后，做过的题会自动收进错题本，按大题分类，可以随时重做。</p>
    <a class="btn primary" href="/account/">去注册（数学、语文通用）</a></div>`, 'mistakes');
  const r = await api(`/api/students/${enc(auth.student.id)}/mistakes?subject=chinese`);
  const list = r.mistakes;
  if (!list.length) return page('<div class="card center"><h2>还没有错题</h2><p class="muted">做完一套模考，做错的题会自动收进来。</p><a class="btn primary" href="#/">去模考</a></div>', 'mistakes');
  const todo = list.filter((m) => m.status === 'pending' || m.status === 'due');
  const groups = {};
  for (const m of list) (groups[m.section_name || '其他'] ||= []).push(m);
  page(`<div class="card"><h1>错题本</h1><p class="muted">共 ${list.length} 题，待订正和该复习的 ${todo.length} 题。重做时每题马上告诉你对错；连续做对两次算掌握。</p>
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
