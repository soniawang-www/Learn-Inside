// AMC 8 模拟考 · 前端（无构建步骤，原生 JS）
// 路由：#/  #/exam/:sid  #/review/:sid  #/kp/:id  #/profile
import { mountPlayer } from './player.js';

const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');

// ───────── 存储 ─────────
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const auth = {
  get token() { return store.get('amc8.token'); },
  get student() { return store.get('amc8.student'); },
  save(token, student) { store.set('amc8.token', token); store.set('amc8.student', student); },
  setStudent(s) { store.set('amc8.student', s); },
  clear() { store.del('amc8.token'); store.del('amc8.student'); },
};

// ───────── API ─────────
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { auth.clear(); location.hash = '#/'; }
  if (!res.ok && res.status !== 402) throw new Error(data.error || `请求失败 (${res.status})`);
  return { status: res.status, ...data, _array: Array.isArray(data) ? data : undefined };
}
const apiList = async (path) => (await api(path))._array;

// ───────── 渲染工具 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** 题目文本：转义 HTML，保留 $…$ 给 KaTeX；**粗体** 和换行 */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
const isFig = (v) => /^\s*<(svg|img)\b/i.test(String(v || ''));

// ── 题目语言：en 英文 / zh 中文 / both 双语（中区考试可选语言） ──
const LANGS = { en: 'English', zh: '中文', both: '双语' };
const lang = { get: () => store.get('amc8.lang', 'en'), next() { const ks = Object.keys(LANGS); const n = ks[(ks.indexOf(this.get()) + 1) % ks.length]; store.set('amc8.lang', n); return n; } };
function stemHtml(p) {
  const L = lang.get();
  if (!p.stem_zh || L === 'en') return rich(p.stem);
  if (L === 'zh') return rich(p.stem_zh);
  return `${rich(p.stem)}<div class="zh">${rich(p.stem_zh)}</div>`;
}
function choiceHtml(p, k) {
  const en = p.choices[k];
  if (isFig(en)) return `<span class="fig-choice">${en}</span>`;
  const zh = p.choices_zh?.[k];
  const L = lang.get();
  if (!zh || zh === en || L === 'en') return rich(en);
  if (L === 'zh') return rich(zh);
  return `${rich(en)}<span class="zh-inline">${rich(zh)}</span>`;
}
const figChoices = (p) => Object.values(p.choices).every(isFig);
function typeset(el = document.body) {
  if (!window.renderMathInElement) { setTimeout(() => typeset(el), 60); return; }
  window.renderMathInElement(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
}
/** 极简 Markdown：## 标题、表格、段落、$$ 公式块 */
function markdown(src) {
  const lines = String(src || '').split('\n');
  let html = '', para = [], table = [];
  const flushPara = () => { if (para.length) { html += `<p>${rich(para.join(' '))}</p>`; para = []; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => rich(c.trim())));
    html += `<table><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|')) { flushPara(); table.push(line); continue; }
    flushTable();
    if (!line) { flushPara(); continue; }
    if (line.startsWith('## ')) { flushPara(); html += `<h2>${rich(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('$$')) { flushPara(); html += `<p>${esc(line)}</p>`; continue; }
    para.push(line);
  }
  flushPara(); flushTable();
  return html;
}
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const fmtDate = (ms) => new Date(ms).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function modal(html, onMount) {
  $modal.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  const root = $modal.firstElementChild;
  const close = () => { $modal.innerHTML = ''; };
  root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); });
  typeset(root);
  onMount?.(root.querySelector('.modal'), close);
  return close;
}

const BRAND = `<a class="brandbar" href="../" aria-label="回到 learn-inside 首页"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="28.0" height="28.0" aria-hidden="true"><rect width="120" height="120" rx="30" class="lg-tile"/><path d="M40 32V84H86" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 58V68" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="42" r="6.5" class="lg-dot"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -73 570 75" width="96.9" height="12.8" aria-hidden="true"><path d="M23.2 1Q14.9 1 10.7 -3.75Q6.5 -8.5 6.5 -17.7V-65Q6.5 -68.1 8.1 -69.7Q9.7 -71.3 12.7 -71.3Q15.7 -71.3 17.35 -69.7Q19 -68.1 19 -65V-18.3Q19 -13.7 20.95 -11.5Q22.9 -9.3 26.5 -9.3Q27.3 -9.3 28 -9.35Q28.7 -9.4 29.4 -9.5Q30.8 -9.7 31.3 -8.75Q31.8 -7.8 31.8 -4.9Q31.8 -2.4 30.8 -1Q29.8 0.4 27.5 0.7Q26.5 0.8 25.4 0.9Q24.3 1 23.2 1Z M64 1Q55.7 1 49.7 -2.1Q43.7 -5.2 40.45 -10.9Q37.2 -16.6 37.2 -24.4Q37.2 -32 40.35 -37.7Q43.5 -43.4 49.05 -46.65Q54.6 -49.9 61.7 -49.9Q66.9 -49.9 71.05 -48.2Q75.2 -46.5 78.15 -43.3Q81.1 -40.1 82.65 -35.55Q84.2 -31 84.2 -25.3Q84.2 -23.5 82.95 -22.55Q81.7 -21.6 79.4 -21.6H47.3V-28.8H75.4L73.8 -27.3Q73.8 -31.9 72.45 -35Q71.1 -38.1 68.55 -39.75Q66 -41.4 62.2 -41.4Q58 -41.4 55.05 -39.45Q52.1 -37.5 50.55 -33.95Q49 -30.4 49 -25.5V-24.8Q49 -16.6 52.85 -12.55Q56.7 -8.5 64.2 -8.5Q66.8 -8.5 70.05 -9.15Q73.3 -9.8 76.2 -11.4Q78.3 -12.6 79.9 -12.45Q81.5 -12.3 82.45 -11.3Q83.4 -10.3 83.6 -8.85Q83.8 -7.4 83.05 -5.9Q82.3 -4.4 80.5 -3.3Q77 -1.1 72.45 -0.05Q67.9 1 64 1Z M111.7 1Q106.4 1 102.25 -1.05Q98.1 -3.1 95.75 -6.6Q93.4 -10.1 93.4 -14.5Q93.4 -19.9 96.2 -23.05Q99 -26.2 105.3 -27.6Q111.6 -29 122.2 -29H127.2V-21.8H122.3Q116.1 -21.8 112.4 -21.2Q108.7 -20.6 107.15 -19.15Q105.6 -17.7 105.6 -15.1Q105.6 -11.8 107.9 -9.7Q110.2 -7.6 114.3 -7.6Q117.6 -7.6 120.15 -9.15Q122.7 -10.7 124.2 -13.4Q125.7 -16.1 125.7 -19.6V-31.1Q125.7 -36.1 123.5 -38.3Q121.3 -40.5 116.1 -40.5Q113.2 -40.5 109.85 -39.8Q106.5 -39.1 102.8 -37.4Q100.9 -36.5 99.45 -36.9Q98 -37.3 97.2 -38.55Q96.4 -39.8 96.4 -41.3Q96.4 -42.8 97.2 -44.25Q98 -45.7 99.9 -46.4Q104.5 -48.3 108.75 -49.1Q113 -49.9 116.5 -49.9Q123.7 -49.9 128.35 -47.7Q133 -45.5 135.3 -41.05Q137.6 -36.6 137.6 -29.6V-5.6Q137.6 -2.5 136.1 -0.85Q134.6 0.8 131.8 0.8Q129 0.8 127.45 -0.85Q125.9 -2.5 125.9 -5.6V-10.4H126.7Q126 -6.9 123.95 -4.35Q121.9 -1.8 118.8 -0.4Q115.7 1 111.7 1Z M158.2 0.8Q155.1 0.8 153.45 -0.85Q151.8 -2.5 151.8 -5.6V-43.4Q151.8 -46.5 153.4 -48.1Q155 -49.7 157.9 -49.7Q160.8 -49.7 162.4 -48.1Q164 -46.5 164 -43.4V-37.1H163Q164.4 -43.1 168.5 -46.2Q172.6 -49.3 179.4 -49.9Q181.5 -50.1 182.75 -48.85Q184 -47.6 184.2 -45Q184.4 -42.5 183.05 -40.95Q181.7 -39.4 179 -39.1L176.8 -38.9Q170.7 -38.3 167.6 -35.15Q164.5 -32 164.5 -26.3V-5.6Q164.5 -2.5 162.9 -0.85Q161.3 0.8 158.2 0.8Z M198.7 0.8Q195.7 0.8 194.1 -0.85Q192.5 -2.5 192.5 -5.6V-43.4Q192.5 -46.5 194.1 -48.1Q195.7 -49.7 198.6 -49.7Q201.5 -49.7 203.1 -48.1Q204.7 -46.5 204.7 -43.4V-36.6L203.6 -39.1Q205.8 -44.4 210.45 -47.15Q215.1 -49.9 221 -49.9Q226.9 -49.9 230.7 -47.7Q234.5 -45.5 236.4 -41.05Q238.3 -36.6 238.3 -29.8V-5.6Q238.3 -2.5 236.7 -0.85Q235.1 0.8 232.1 0.8Q229.1 0.8 227.45 -0.85Q225.8 -2.5 225.8 -5.6V-29.2Q225.8 -34.9 223.65 -37.5Q221.5 -40.1 217 -40.1Q211.5 -40.1 208.25 -36.65Q205 -33.2 205 -27.5V-5.6Q205 0.8 198.7 0.8Z M303.6 0.7Q300.6 0.7 299 -1.1Q297.4 -2.9 297.4 -6.1V-42.8Q297.4 -46.1 299 -47.85Q300.6 -49.6 303.6 -49.6Q306.6 -49.6 308.25 -47.85Q309.9 -46.1 309.9 -42.8V-6.1Q309.9 -2.9 308.3 -1.1Q306.7 0.7 303.6 0.7Z M330.6 0.8Q327.6 0.8 326 -0.85Q324.4 -2.5 324.4 -5.6V-43.4Q324.4 -46.5 326 -48.1Q327.6 -49.7 330.5 -49.7Q333.4 -49.7 335 -48.1Q336.6 -46.5 336.6 -43.4V-36.6L335.5 -39.1Q337.7 -44.4 342.35 -47.15Q347 -49.9 352.9 -49.9Q358.8 -49.9 362.6 -47.7Q366.4 -45.5 368.3 -41.05Q370.2 -36.6 370.2 -29.8V-5.6Q370.2 -2.5 368.6 -0.85Q367 0.8 364 0.8Q361 0.8 359.35 -0.85Q357.7 -2.5 357.7 -5.6V-29.2Q357.7 -34.9 355.55 -37.5Q353.4 -40.1 348.9 -40.1Q343.4 -40.1 340.15 -36.65Q336.9 -33.2 336.9 -27.5V-5.6Q336.9 0.8 330.6 0.8Z M402.3 1Q398 1 393.2 0.1Q388.4 -0.8 384.6 -3Q383 -4 382.35 -5.35Q381.7 -6.7 381.85 -8.05Q382 -9.4 382.85 -10.4Q383.7 -11.4 385.05 -11.7Q386.4 -12 388 -11.2Q392 -9.3 395.5 -8.55Q399 -7.8 402.4 -7.8Q407.2 -7.8 409.55 -9.45Q411.9 -11.1 411.9 -13.8Q411.9 -16.1 410.35 -17.35Q408.8 -18.6 405.7 -19.2L395.7 -21.1Q389.5 -22.3 386.25 -25.65Q383 -29 383 -34.3Q383 -39.1 385.65 -42.6Q388.3 -46.1 393 -48Q397.7 -49.9 403.8 -49.9Q408.2 -49.9 412.05 -48.95Q415.9 -48 419.5 -46Q421 -45.2 421.55 -43.9Q422.1 -42.6 421.8 -41.25Q421.5 -39.9 420.6 -38.85Q419.7 -37.8 418.35 -37.55Q417 -37.3 415.3 -38.1Q412.2 -39.7 409.35 -40.4Q406.5 -41.1 403.9 -41.1Q399 -41.1 396.65 -39.4Q394.3 -37.7 394.3 -34.9Q394.3 -32.8 395.7 -31.4Q397.1 -30 400 -29.5L410 -27.6Q416.5 -26.4 419.85 -23.2Q423.2 -20 423.2 -14.6Q423.2 -7.3 417.5 -3.15Q411.8 1 402.3 1Z M440.9 0.7Q437.9 0.7 436.3 -1.1Q434.7 -2.9 434.7 -6.1V-42.8Q434.7 -46.1 436.3 -47.85Q437.9 -49.6 440.9 -49.6Q443.9 -49.6 445.55 -47.85Q447.2 -46.1 447.2 -42.8V-6.1Q447.2 -2.9 445.6 -1.1Q444 0.7 440.9 0.7Z M480.5 1Q474.1 1 469.25 -2.1Q464.4 -5.2 461.7 -10.95Q459 -16.7 459 -24.5Q459 -32.4 461.7 -38.05Q464.4 -43.7 469.25 -46.8Q474.1 -49.9 480.5 -49.9Q486.6 -49.9 491.15 -46.9Q495.7 -43.9 497.3 -39H496.2V-65Q496.2 -68.1 497.8 -69.7Q499.4 -71.3 502.4 -71.3Q505.4 -71.3 507.05 -69.7Q508.7 -68.1 508.7 -65V-5.6Q508.7 -2.5 507.1 -0.85Q505.5 0.8 502.5 0.8Q499.5 0.8 497.9 -0.85Q496.3 -2.5 496.3 -5.6V-13.4L497.4 -10.4Q495.9 -5.2 491.3 -2.1Q486.7 1 480.5 1ZM484 -8.5Q487.7 -8.5 490.5 -10.3Q493.3 -12.1 494.85 -15.65Q496.4 -19.2 496.4 -24.5Q496.4 -32.5 493 -36.45Q489.6 -40.4 484 -40.4Q480.3 -40.4 477.5 -38.65Q474.7 -36.9 473.15 -33.35Q471.6 -29.8 471.6 -24.5Q471.6 -16.6 475 -12.55Q478.4 -8.5 484 -8.5Z M547.3 1Q539 1 533 -2.1Q527 -5.2 523.75 -10.9Q520.5 -16.6 520.5 -24.4Q520.5 -32 523.65 -37.7Q526.8 -43.4 532.35 -46.65Q537.9 -49.9 545 -49.9Q550.2 -49.9 554.35 -48.2Q558.5 -46.5 561.45 -43.3Q564.4 -40.1 565.95 -35.55Q567.5 -31 567.5 -25.3Q567.5 -23.5 566.25 -22.55Q565 -21.6 562.7 -21.6H530.6V-28.8H558.7L557.1 -27.3Q557.1 -31.9 555.75 -35Q554.4 -38.1 551.85 -39.75Q549.3 -41.4 545.5 -41.4Q541.3 -41.4 538.35 -39.45Q535.4 -37.5 533.85 -33.95Q532.3 -30.4 532.3 -25.5V-24.8Q532.3 -16.6 536.15 -12.55Q540 -8.5 547.5 -8.5Q550.1 -8.5 553.35 -9.15Q556.6 -9.8 559.5 -11.4Q561.6 -12.6 563.2 -12.45Q564.8 -12.3 565.75 -11.3Q566.7 -10.3 566.9 -8.85Q567.1 -7.4 566.35 -5.9Q565.6 -4.4 563.8 -3.3Q560.3 -1.1 555.75 -0.05Q551.2 1 547.3 1Z M440.9 -58.9Q437.4 -58.9 435.45 -60.65Q433.5 -62.4 433.5 -65.5Q433.5 -68.7 435.45 -70.4Q437.4 -72.1 440.9 -72.1Q444.5 -72.1 446.4 -70.4Q448.3 -68.7 448.3 -65.5Q448.3 -62.4 446.4 -60.65Q444.5 -58.9 440.9 -58.9Z" class="lg-ink"/><path d="M257.1 -21.8Q254.9 -21.8 253.45 -23.25Q252 -24.7 252 -26.8Q252 -29 253.45 -30.4Q254.9 -31.8 257.1 -31.8H278.4Q280.5 -31.8 281.95 -30.4Q283.4 -29 283.4 -26.8Q283.4 -24.7 281.95 -23.25Q280.5 -21.8 278.4 -21.8Z" class="lg-jade"/><path d="M303.6 -58.9Q300.1 -58.9 298.15 -60.65Q296.2 -62.4 296.2 -65.5Q296.2 -68.7 298.15 -70.4Q300.1 -72.1 303.6 -72.1Q307.2 -72.1 309.1 -70.4Q311 -68.7 311 -65.5Q311 -62.4 309.1 -60.65Q307.2 -58.9 303.6 -58.9Z" class="lg-dot"/></svg></a><span class="brandbar"><span class="bdiv"></span><span class="bname">AMC 8 模拟考</span></span>`;
function topnav() {
  const s = auth.student;
  return `<nav class="topnav">${BRAND}<span class="spacer"></span>
    ${s ? `<a class="navlink" href="#/">试卷</a><a class="navlink" href="#/profile">${esc(s.nickname)} 的画像</a>` : ''}</nav>`;
}

// ───────── 路由 ─────────
let cleanup = null;
async function router() {
  cleanup?.(); cleanup = null;
  closeLesson();
  document.body.classList.remove('exam-mode');
  $modal.innerHTML = '';
  const [, page, id] = (location.hash.slice(1) || '/').split('/');
  try {
    if (!auth.token) return renderJoin();
    if (page === 'exam') return await renderExam(id);
    if (page === 'review') return await renderReview(id);
    if (page === 'kp') return await renderKp(id);
    if (page === 'problem') return await renderProblem(id);
    if (page === 'profile') return await renderProfile();
    return await renderHome();
  } catch (e) {
    $app.innerHTML = `${topnav()}<div class="page"><div class="card"><p class="error-msg">${esc(e.message)}</p><a href="#/">返回首页</a></div></div>`;
  }
}
window.addEventListener('hashchange', router);

// ───────── 加入试用 ─────────
function renderJoin() {
  $app.innerHTML = `${topnav()}<div class="page"><div class="card" style="max-width:420px;margin:40px auto">
    <h1>加入试用</h1>
    <form id="join">
      <label class="field"><span>邀请码</span><input type="text" name="invite_code" autocomplete="off"></label>
      <label class="field"><span>孩子的昵称</span><input type="text" name="nickname" maxlength="20" placeholder="比如：小桐"></label>
      <button class="btn primary" type="submit">开始</button>
      <div class="error-msg" id="err"></div>
    </form>
    <p class="small muted">试用期间所有内容免费。孩子的作答记录只用于生成学习画像。</p>
  </div></div>`;
  document.getElementById('join').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/amc8/api/auth/join', { method: 'POST', body: Object.fromEntries(f) });
      auth.save(r.token, r.student);
      location.hash = '#/'; router();
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

// ───────── 首页：试卷列表 ─────────
async function renderHome() {
  const me = await api('/amc8/api/me');
  if (!auth.student || !me.students.find((s) => s.id === auth.student.id)) auth.setStudent(me.students[0]);
  const st = auth.student;
  const exams = await apiList(`/amc8/api/exams?student=${st.id}`);
  $app.innerHTML = `${topnav()}<div class="page">
    <h1>选择试卷</h1>
    ${me.students.length > 1 ? `<div class="card row"><span class="muted">当前学生</span>
      <select id="stu">${me.students.map((s) => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${esc(s.nickname)}</option>`).join('')}</select></div>` : ''}
    <div class="card exam-list">
      ${exams.map((e) => `<div class="exam">
        <div><div class="title">${esc(e.title)}</div>
          <div class="small muted">${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟${e.source === 'original' ? ' · 原创' : ''}
          ${e.last_score !== null ? ` · 上次 <a href="#/review/${e.last_session}">${e.last_score}/${e.problem_count}</a>` : ''}</div></div>
        <div class="row">
          <button class="btn" data-start="${e.id}" data-mode="practice">练习模式</button>
          <button class="btn primary" data-start="${e.id}" data-mode="exam">模考</button>
        </div></div>`).join('') || '<p class="muted">还没有试卷</p>'}
    </div>
    <p class="small muted">模考：完全按正式考试计时，不提供提示。练习：同样计时，可以逐级查看提示，用了提示的题在画像里会打折计算。</p>
  </div>`;
  document.getElementById('stu')?.addEventListener('change', (e) => { auth.setStudent(me.students.find((s) => s.id === e.target.value)); router(); });
  $app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => showInstructions(exams.find((e) => e.id === b.dataset.start), b.dataset.mode)));
}

function showInstructions(exam, mode) {
  const mins = Math.round(exam.duration_sec / 60);
  modal(`<div class="instructions"><h2>${esc(exam.title)} · ${mode === 'exam' ? '模考' : '练习'}</h2>
    <ol>
      <li>本卷共 ${exam.problem_count} 道选择题，每题有 A、B、C、D、E 五个选项，只有一个正确。</li>
      <li>答对 1 题得 1 分，答错不扣分，所以每题都值得作答。</li>
      <li>只允许使用草稿纸、笔、直尺和橡皮；不能用计算器、量角器、圆规或任何电子设备。</li>
      <li>图形不一定按比例绘制。</li>
      <li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>
      ${mode === 'practice' ? '<li>练习模式可以逐级查看提示（最多 3 级）。</li>' : ''}
    </ol></div>
    <div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="go">开始答题</button></div>`,
  (el, close) => {
    el.querySelector('#go').onclick = async () => {
      const r = await api('/amc8/api/sessions', { method: 'POST', body: { exam_id: exam.id, student_id: auth.student.id, mode } });
      close(); location.hash = `#/exam/${r.session.id}`;
    };
  });
}

// ───────── 考试界面（按 AMC 8 中国区线上考试操作手册“第八步”截图还原） ─────────
// 布局：顶栏（刷新 / 大字号 / 剩余时间 / 交卷）+ 左侧答题卡（进度、题号格、图例）+ 右侧一题一屏
async function renderExam(sid) {
  const data = await api(`/amc8/api/sessions/${sid}`);
  if (data.session.submitted) { location.hash = `#/review/${sid}`; return; }
  document.body.classList.add('exam-mode');
  const key = `amc8.s.${sid}`;
  const S = Object.assign({ answers: {}, flags: {}, times: {}, hints: {}, cur: 0, big: false }, store.get(key, {}));
  const problems = data.problems;
  const clockOffset = data.session.server_now - Date.now();
  const practice = data.session.mode === 'practice';
  let enteredAt = Date.now();
  let submitting = false;
  let cardOpen = false; // 窄屏时答题卡默认收起

  const save = () => store.set(key, S);
  const flushTime = () => {
    const p = problems[S.cur];
    S.times[p.id] = (S.times[p.id] || 0) + (Date.now() - enteredAt) / 1000;
    enteredAt = Date.now();
  };
  const go = (i) => { flushTime(); S.cur = Math.max(0, Math.min(problems.length - 1, i)); cardOpen = false; save(); draw(); };

  // 刷新 / 断线重连时找回已看过的提示
  for (const h of data.hints_seen) {
    const list = S.hints[h.problem_id] || (S.hints[h.problem_id] = []);
    if (!list[h.level - 1]) {
      const r = await api(`/amc8/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: h.problem_id, level: h.level } });
      list[h.level - 1] = r.content;
    }
  }

  function draw() {
    const p = problems[S.cur];
    const answered = problems.filter((x) => S.answers[x.id]).length;
    const hints = S.hints[p.id] || [];
    $app.innerHTML = `<div class="ez ${S.big ? 'big' : ''}">
      <header class="ez-top">
        <button class="ez-cardbtn" id="cardbtn">☰ 答题卡</button>
        <span class="ez-user">👤 ${esc(auth.student?.nickname || '')}</span>
        <span class="ez-title">${esc(data.exam.title)}${practice ? '<span class="ez-mode">练习</span>' : ''}</span>
        <span class="ez-sp"></span>
        <button class="ez-tool" id="lang" title="切换题目语言">🌐 ${LANGS[lang.get()]}</button>
        <button class="ez-tool" id="refresh" title="图片没显示完整时点一下">⟳ 刷新</button>
        <button class="ez-tool ${S.big ? 'on' : ''}" id="font">A<small>A</small> 大字号</button>
        <span class="ez-timer" id="timer">剩余时间 <b>--:--</b></span>
        <button class="ez-submit" id="submit">交卷</button>
      </header>
      <div class="ez-body">
        <aside class="ez-card ${cardOpen ? 'open' : ''}">
          <div class="ez-card-head"><b>答题卡</b><span class="muted">☰</span></div>
          <div class="ez-progress"><div class="ez-prow"><span>进度</span><span>${answered}/${problems.length}</span></div>
            <div class="ez-pbar"><div style="width:${(answered / problems.length) * 100}%"></div></div></div>
          <div class="ez-grid">${problems.map((x, i) => `<button class="ez-cell ${S.answers[x.id] ? 'done' : ''} ${S.flags[x.id] ? 'flag' : ''} ${i === S.cur ? 'cur' : ''}" data-go="${i}">${x.number}</button>`).join('')}</div>
          <div class="ez-legend"><span><i class="lg done"></i>已答</span><span><i class="lg"></i>未答</span><span><i class="lg flag"></i>标记</span></div>
        </aside>
        <main class="ez-main">
          <div class="ez-q">
            <div class="ez-qhead"><span class="ez-qno">${p.number}.(1分)${data.session.drill ? ` <span class="ez-src">${esc(p.label)}</span>` : ''}</span>
              <button class="ez-pin ${S.flags[p.id] ? 'on' : ''}" id="flag" title="标记这道题，稍后回来检查">📌 ${S.flags[p.id] ? '已标记' : '标记'}</button></div>
            <div class="ez-stem">${stemHtml(p)}</div>
            ${p.figure ? `<div class="figure">${p.figure}</div>` : ''}
            <ul class="ez-opts ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="ez-opt ${S.answers[p.id] === k ? 'sel' : ''}" data-choice="${k}" role="radio" aria-checked="${S.answers[p.id] === k}"><span class="ez-letter">${k}</span><span class="ez-otext">${choiceHtml(p, k)}</span></li>`).join('')}</ul>
            <div class="ez-nav">
              <button class="ez-btn" id="prev" ${S.cur === 0 ? 'disabled' : ''}>上一题</button>
              <button class="ez-btn next" id="next" ${S.cur === problems.length - 1 ? 'disabled' : ''}>下一题</button>
              ${practice && p.hint_count ? `<button class="ez-btn hint" id="hint" ${hints.length >= p.hint_count ? 'disabled' : ''}>💡 提示 ${hints.length}/${p.hint_count}</button>` : ''}
            </div>
            ${hints.length ? `<div class="hint-box">${hints.map((h, i) => `<div class="hint"><b>提示 ${i + 1}</b>${rich(h)}</div>`).join('')}</div>` : ''}
          </div>
        </main>
      </div>
      ${cardOpen ? '<div class="ez-mask" id="mask"></div>' : ''}
    </div>`;
    typeset($app);
    tick();

    $app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    $app.querySelectorAll('[data-choice]').forEach((c) => (c.onclick = () => { S.answers[p.id] = c.dataset.choice; save(); draw(); }));
    $app.querySelector('#prev').onclick = () => go(S.cur - 1);
    $app.querySelector('#next').onclick = () => go(S.cur + 1);
    $app.querySelector('#flag').onclick = () => { S.flags[p.id] ? delete S.flags[p.id] : (S.flags[p.id] = true); save(); draw(); };
    $app.querySelector('#refresh').onclick = () => { flushTime(); save(); location.reload(); };
    $app.querySelector('#font').onclick = () => { S.big = !S.big; save(); draw(); };
    $app.querySelector('#lang').onclick = () => { lang.next(); draw(); };
    $app.querySelector('#cardbtn').onclick = () => { cardOpen = !cardOpen; draw(); };
    $app.querySelector('#mask')?.addEventListener('click', () => { cardOpen = false; draw(); });
    $app.querySelector('#submit').onclick = confirmSubmit;
    const hb = $app.querySelector('#hint');
    if (hb) hb.onclick = async () => {
      const level = hints.length + 1;
      const r = await api(`/amc8/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: p.id, level } });
      (S.hints[p.id] || (S.hints[p.id] = []))[level - 1] = r.content; save(); draw();
    };
  }

  function confirmSubmit() {
    const un = problems.filter((x) => !S.answers[x.id]);
    const fl = problems.filter((x) => S.flags[x.id]);
    modal(`<h2>确认交卷？</h2>
      <p>已答 <b>${problems.length - un.length}</b> 题，未答 <b style="color:var(--bad)">${un.length}</b> 题，标记 <b style="color:var(--flag)">${fl.length}</b> 题。</p>
      ${un.length ? `<p class="small muted">未答：${un.map((x) => x.number).join('、')}。答错不扣分，空着的题建议也选一个。</p>` : ''}
      <p class="small muted">交卷后不能再修改答案。</p>
      <div class="actions"><button class="btn" data-close>继续作答</button><button class="btn primary" id="yes">确认交卷</button></div>`,
    (el, close) => { el.querySelector('#yes').onclick = () => { close(); submit(false); }; });
  }

  function tick() {
    const left = (data.session.deadline_at - (Date.now() + clockOffset)) / 1000;
    const el = document.getElementById('timer');
    if (el) { el.querySelector('b').textContent = fmtTime(left); el.classList.toggle('warn', left <= 300); }
    if (left <= 0 && !submitting) submit(true);
  }
  const timer = setInterval(tick, 500);

  // 键盘：A–E 选答案，←/→ 翻题
  const onKey = (e) => {
    if ($modal.innerHTML || e.target.tagName === 'INPUT') return;
    const k = e.key.toUpperCase();
    if (k.length === 1 && 'ABCDE'.includes(k)) { S.answers[problems[S.cur].id] = k; save(); draw(); }
    else if (e.key === 'ArrowRight') go(S.cur + 1);
    else if (e.key === 'ArrowLeft') go(S.cur - 1);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };

  async function submit(auto) {
    if (submitting) return;
    submitting = true; flushTime(); save();
    if (auto) modal('<h2>考试时间到</h2><p>系统正在自动交卷…</p>');
    try {
      await api(`/amc8/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times, flags: S.flags } });
      store.del(key);
      $modal.innerHTML = '';
      location.hash = `#/review/${sid}`;
    } catch (e) {
      submitting = false;
      modal(`<h2>交卷失败</h2><p>${esc(e.message)}</p><p class="small muted">答案已保存在本机，网络恢复后再点“交卷”即可。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
    }
  }

  draw();
}

// ───────── 复盘 ─────────
const REASONS = [['unknown', '不会'], ['careless', '粗心'], ['no_time', '没时间'], ['reading', '没读懂题']];

async function renderReview(sid) {
  const r = await api(`/amc8/api/sessions/${sid}/review`);
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const wrong = r.items.filter((i) => !i.correct);
  $app.innerHTML = `${topnav()}<div class="page">
    <div class="card"><div class="scorebox">
      <div><div class="muted small">得分</div><span class="big">${r.session.score}</span><span class="muted"> / ${r.total}</span></div>
      <div><div class="muted small">用时</div><b>${fmtTime(used)}</b><span class="muted"> / ${fmtTime(r.exam.duration_sec)}</span></div>
      <div><div class="muted small">模式</div><b>${r.session.mode === 'exam' ? '模考' : '练习'}</b></div>
      <div style="margin-left:auto" class="row"><button class="btn" id="lang">🌐 ${LANGS[lang.get()]}</button><a class="btn" href="#/profile">查看画像</a></div>
    </div>
    ${wrong.length ? `<p class="small muted" style="margin:12px 0 0">做错 / 没做的 ${wrong.length} 题，请让孩子在每道题下面点一下“错因”。这能让画像区分“不会”和“粗心”，准确很多。</p>` : ''}
    </div>
    <h2>${esc(r.exam.title)}</h2>
    ${r.items.map(itemView).join('')}
  </div>`;
  typeset($app);

  function itemView(it) {
    const cls = it.choice === null ? 'blank' : it.correct ? 'right' : 'wrong';
    return `<details class="ritem ${cls}" ${it.correct ? '' : 'open'}>
      <summary><span class="mark">${it.correct ? '✓' : it.choice === null ? '–' : '✗'}</span>
        <b>Problem ${it.number}</b>${r.session.mode !== 'exam' && r.exam.id === 'drill' ? `<span class="muted small">${esc(it.label)}</span>` : ''}
        <span class="muted small">${it.choice === null ? '未作答' : `你的答案 ${it.choice}`}${it.correct ? '' : ` · 正确答案 ${it.answer}`}</span>
        <span class="meta">${fmtTime(it.time_sec)}${it.hints_used ? ` · 提示 ${it.hints_used} 级` : ''}${it.flagged ? ' · ⚑' : ''}</span></summary>
      <div class="body">
        <div class="stem">${stemHtml(it)}${it.figure ? `<div class="figure">${it.figure}</div>` : ''}</div>
        <ul class="choices ${figChoices(it) ? 'figs' : ''}">${Object.keys(it.choices).map((k) => `<li class="choice ${k === it.answer ? 'correct' : k === it.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(it, k)}</span></li>`).join('')}</ul>
        ${it.correct ? '' : `<div class="section-label">错因</div><div class="reason-chips row" data-attempt="${it.attempt_id}">
          ${REASONS.map(([k, label]) => `<button data-reason="${k}" class="${it.error_reason === k ? 'on' : ''}">${label}</button>`).join('')}</div>`}
        ${it.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(it.basic)}</div>` : ''}
        ${it.advanced ? `<div style="margin-top:14px"><button class="btn primary" data-adv="${it.problem_id}">▶ 互动解析${it.advanced.locked ? ' 🔒' : ''}</button> <span class="small muted">会员 · 一步步跟着做</span></div>` : ''}
        <div class="section-label">考点</div>
        ${kpCards(it.kps)}
      </div></details>`;
  }

  $app.querySelectorAll('.reason-chips button').forEach((b) => (b.onclick = async () => {
    const box = b.parentElement;
    const on = b.classList.contains('on');
    await api(`/amc8/api/attempts/${box.dataset.attempt}`, { method: 'PATCH', body: { error_reason: on ? null : b.dataset.reason } });
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', !on && x === b));
  }));
  bindKpCards($app);
  $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv)));
  $app.querySelector('#lang').onclick = () => { lang.next(); router(); };
}

// ───────── 考点卡：识别信号（免费）+ 学知识点 / 真题突击（会员） ─────────
const enc = encodeURIComponent;
function kpCards(kps) {
  if (!kps?.length) return '';
  const main = kps.filter((k) => k.primary);
  const rest = kps.filter((k) => !k.primary);
  const shown = main.length ? main : kps.slice(0, 1);
  return `<div class="kpcards">${shown.map((k) => `<div class="kpcard">
      <div class="kphead"><a href="#/kp/${enc(k.id)}"><b>${esc(k.name)}</b></a>${k.amc_ext ? '<span class="tag ext">AMC 扩展</span>' : ''}</div>
      ${k.signals?.length ? `<div class="sig-title">怎么认出这个考点</div><ul class="signals">${k.signals.map((s) => `<li><span class="see">看到：${rich(s.see)}</span><span class="think">想到：${rich(s.think)}</span></li>`).join('')}</ul>` : (k.summary ? `<p class="small">${rich(k.summary)}</p>` : '')}
      <div class="kpbtns"><a class="btn" href="#/kp/${enc(k.id)}">看相关真题</a><button class="btn" data-drill="${esc(k.id)}">真题突击${k.locked ? ' 🔒' : ''}</button></div>
    </div>`).join('')}
    ${rest.length ? `<div class="small muted kpalso">也用到：${rest.map((k) => `<a href="#/kp/${enc(k.id)}">${esc(k.name)}</a>`).join('、')}</div>` : ''}</div>`;
}
function bindKpCards(root) {
  root.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(b.dataset.drill)));
}
async function startDrill(kpId) {
  const r = await api('/amc8/api/sessions', { method: 'POST', body: { kp_id: kpId, student_id: auth.student.id } });
  if (r.status === 402) return modal(lockedPanel('知识点突击是会员功能'));
  location.hash = `#/exam/${r.session.id}`;
}

// ───────── 互动课（全屏播放器） ─────────
let lessonClose = null;
function closeLesson() { lessonClose?.(); lessonClose = null; }
function openLesson(lesson, { onDone, doneLabel } = {}) {
  closeLesson();
  const ov = document.createElement('div');
  ov.className = 'lp-overlay';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  let ctl;
  const close = () => { ctl?.stop(); ov.remove(); document.body.style.overflow = ''; lessonClose = null; };
  ctl = mountPlayer(ov, lesson, { onClose: close, onDone: () => { close(); onDone?.(); }, doneLabel: doneLabel || '学完了' });
  lessonClose = close;
}

async function openAdvanced(problemId) {
  const r = await api(`/amc8/api/problems/${problemId}/advanced`);
  if (r.locked) return modal(lockedPanel('互动解析是会员内容'));
  if (r.url) { window.open(r.url, '_blank'); return; }
  openLesson({ title: '互动解析', ...r.lesson });
}

const lockedPanel = (title) => `<div class="locked-panel"><div class="icon">🔒</div><p><b>${esc(title)}</b></p>
  <p class="small">开通会员后可以查看。</p><div class="actions" style="justify-content:center"><button class="btn" data-close>知道了</button></div></div>`;

// ───────── 知识点 ─────────
async function renderKp(id) {
  const k = await api(`/amc8/api/kp/${enc(id)}?student=${auth.student.id}`);
  const ST = { right: ['✓', '做对了'], wrong: ['✗', '做错了'], todo: ['○', '还没做'] };
  $app.innerHTML = `${topnav()}<div class="page">
    <a href="javascript:history.back()" class="small">← 返回</a>
    <h1>${esc(k.name)} ${k.amc_ext ? '<span class="tag ext">AMC 扩展</span>' : ''}</h1>
    <div class="card">
      <p>${rich(k.summary || '')}</p>
      ${k.mastery ? `<p class="small muted">当前掌握度：<b>${k.mastery.label}</b>（${k.mastery.score}）</p>` : ''}
      ${k.prerequisites.length ? `<p class="small muted">前置知识：${k.prerequisites.map((p) => `<a href="#/kp/${enc(p.id)}">${esc(p.name)}</a>`).join('、')}</p>` : ''}
    </div>
    ${k.signals.length ? `<div class="card"><h2>怎么认出这个考点</h2><ul class="signals">${k.signals.map((s) => `<li><span class="see">看到：${rich(s.see)}</span><span class="think">想到：${rich(s.think)}</span></li>`).join('')}</ul></div>` : ''}
    <div class="card feature"><div><h2>真题突击 <span class="tag">会员</span></h2>
      <p class="small muted">${k.drill.count ? `把考这个知识点的 ${k.drill.count} 道真题集中做一遍，可以看提示，做完看解析。` : '还没有考这个知识点的真题。'}</p></div>
      ${k.drill.count ? `<button class="btn primary" data-drill="${esc(k.id)}">${k.drill.locked ? '🔒 ' : ''}开始突击</button>` : ''}</div>
    ${k.problems.length ? `<div class="card"><h2>相关真题</h2><div class="plist">${k.problems.map((p) => `<a class="prow st-${p.status}" href="#/problem/${enc(p.id)}">
        <span class="pst" title="${ST[p.status][1]}">${ST[p.status][0]}</span><span>${esc(p.label)}</span>${p.weight >= 1 ? '<span class="tag">主考点</span>' : ''}<span class="go">›</span></a>`).join('')}</div></div>` : ''}
  </div>`;
  typeset($app);
  bindKpCards($app);
}

// ───────── 单题页（从知识点页「相关真题」进入） ─────────
async function renderProblem(id) {
  const p = await api(`/amc8/api/problems/${enc(id)}?student=${auth.student.id}`);
  const done = p.attempted;
  $app.innerHTML = `${topnav()}<div class="page">
    <a href="javascript:history.back()" class="small">← 返回</a>
    <div class="row" style="justify-content:space-between"><h1>${esc(p.label)}</h1><button class="btn" id="lang">🌐 ${LANGS[lang.get()]}</button></div>
    <div class="card">
      <div class="stem">${stemHtml(p)}${p.figure ? `<div class="figure">${p.figure}</div>` : ''}</div>
      <ul class="choices ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="choice ${done && k === p.answer ? 'correct' : done && k === p.last.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(p, k)}</span></li>`).join('')}</ul>
    </div>
    ${done ? `<div class="card">
        <p>${p.last.correct ? '✓ 上次做对了' : `✗ 上次${p.last.choice ? `选了 ${p.last.choice}` : '没作答'}，正确答案 <b>${p.answer}</b>`}</p>
        ${p.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(p.basic)}</div>` : ''}
        ${p.advanced ? `<div style="margin-top:14px"><button class="btn primary" data-adv="${esc(p.problem_id)}">▶ 互动解析${p.advanced.locked ? ' 🔒' : ''}</button></div>` : ''}
        <div class="section-label">考点</div>${kpCards(p.kps)}
        <div class="row" style="margin-top:14px"><button class="btn" id="try">再做一次</button></div>
      </div>` : `<div class="card feature"><div><h2>还没做过这道题</h2><p class="small muted">先自己做，做完再看答案、解题思路和互动解析。</p></div><button class="btn primary" id="try">做这道题</button></div>`}
  </div>`;
  typeset($app);
  bindKpCards($app);
  $app.querySelector('[data-adv]')?.addEventListener('click', (e) => openAdvanced(e.currentTarget.dataset.adv));
  $app.querySelector('#lang').onclick = () => { lang.next(); router(); };
  $app.querySelector('#try').onclick = async () => {
    const r = await api('/amc8/api/sessions', { method: 'POST', body: { problem_ids: [p.problem_id], student_id: auth.student.id } });
    location.hash = `#/exam/${r.session.id}`;
  };
}

// ───────── 画像 ─────────
async function renderProfile() {
  const r = await api(`/amc8/api/students/${auth.student.id}/profile`);
  const reasonName = Object.fromEntries(REASONS);
  const totalWrong = r.error_reasons.reduce((a, x) => a + x.n, 0);
  $app.innerHTML = `${topnav()}<div class="page">
    <h1>${esc(r.student.nickname)} 的学习画像</h1>
    <div class="card"><h2>知识点掌握度</h2>
      ${r.points.length ? `<p class="small muted">从薄弱到擅长排序。证据量 = 做过的相关题目（按考点权重累加），少于 1.5 时显示“数据不足”。</p>
        ${r.points.map((p) => `<div class="kprow lv-${p.level}">
          <div><a href="#/kp/${encodeURIComponent(p.id)}">${esc(p.name)}</a> <span class="small muted">${esc(p.group || '')} · 证据 ${p.evidence}</span></div>
          <div class="bar"><div style="width:${p.score}%"></div></div>
          <div class="lv-label">${p.label}</div></div>`).join('')}`
      : '<p class="muted">还没有数据，先做一套卷子吧。</p>'}
    </div>
    ${totalWrong ? `<div class="card"><h2>错因分布</h2><div class="chips">${r.error_reasons.map((x) => `<span class="chip">${x.error_reason ? reasonName[x.error_reason] : '未标注'} ${x.n}</span>`).join('')}</div></div>` : ''}
    <div class="card"><h2>考试记录</h2>
      ${r.sessions.map((s) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)">
        <span>${esc(s.title)} <span class="tag">${s.mode === 'exam' ? '模考' : '练习'}</span></span>
        <span><a href="#/review/${s.id}">${s.score}/${s.total}</a> <span class="small muted">${fmtDate(s.submitted_at)}</span></span></div>`).join('') || '<p class="muted">暂无</p>'}
    </div>
  </div>`;
}

router();
