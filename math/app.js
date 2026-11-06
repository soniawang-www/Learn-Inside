// AMC 8 模拟考 · 前端（无构建步骤，原生 JS）
// 路由：#/account（账号与会员）  #/（考试）  #/contest/:id[/stats|/records]  #/graph[/:kp]  #/mistakes  #/kp/:id  #/exam/:sid  #/review/:sid  #/problem/:id
import { mountPlayer } from './player.js';
import { sideNav } from '/assets/sidenav.js?v=20261106g';
import { loadStart } from '/assets/loadcomic.js?v=20261107b';
import { mountGraph } from './graph.js';
import { openPreview, SHEET_CSS } from './print.js';
const printLinkUrl = (token) => `${location.origin}/math/?print=${encodeURIComponent(token)}`;

// 同一份前端两种用法：/math/ 数学板块；/account/ 全站账号页（账号、会员、激活码，数学语文通用）
const SECTION = window.LI_SECTION === 'account' ? 'account' : 'math';
const ACCOUNT_URL = '/account/';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');

// ───────── 存储 ─────────
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
// 登录状态全站共用（li.*）；以前存在 amc8.* 的自动搬过来
if (!store.get('li.token') && store.get('amc8.token')) { store.set('li.token', store.get('amc8.token')); store.set('li.student', store.get('amc8.student')); }
const auth = {
  get token() { return store.get('li.token'); },
  get student() { return store.get('li.student'); },
  save(token, student) { store.set('li.token', token); store.set('li.student', student); },
  setStudent(s) { store.set('li.student', s); },
  clear() { store.del('li.token'); store.del('li.student'); store.del('amc8.token'); store.del('amc8.student'); },
};

// ───────── 等待服务器时的保护 ─────────
// 点了按钮 / 提交了表单，接下来的请求没回来之前：这个按钮转圈、不能再点；顶部显示进度条
let tapEl = null, tapAt = 0, inflight = 0, barTimer = null;
const isBusy = (el) => el?.classList.contains('busy');
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a.btn, [data-plan], [data-adv], [data-drill]');
  if (isBusy(el)) { e.preventDefault(); e.stopImmediatePropagation(); return; } // 还在等，忽略重复点击
  tapEl = el; tapAt = Date.now();
}, true);
document.addEventListener('submit', (e) => {
  const b = e.submitter || e.target.querySelector('button[type=submit], button:not([type])');
  if (isBusy(b)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  tapEl = b; tapAt = Date.now();
}, true);
function setBusy(el, on) {
  if (!el) return;
  el.classList.toggle('busy', on);
  if (on) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
}
function progress(delta) {
  inflight = Math.max(0, inflight + delta);
  clearTimeout(barTimer);
  if (inflight) barTimer = setTimeout(() => document.body.classList.add('net-wait'), 150); // 很快的请求不闪
  else document.body.classList.remove('net-wait');
}

// ───────── API ─────────
async function api(path, { method = 'GET', body } = {}) {
  const el = tapEl && Date.now() - tapAt < 400 ? tapEl : null; // 刚点过的按钮，等这个请求
  tapEl = null;
  setBusy(el, true); progress(1);
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('网络不太好，请稍后再试');
  } finally { setBusy(el, false); progress(-1); }
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
// 语言切换：三个选项并排，当前的高亮（原来是一个按钮显示「当前语言」，孩子以为点它就切到那个语言，看着像标反了）
const langSeg = () => `<span class="lang-seg" id="lang" role="group" aria-label="题目语言">${icon('globe', 15)}${Object.entries(LANGS).map(([k, v]) => `<button data-lang="${k}" aria-pressed="${lang.get() === k}">${v}</button>`).join('')}</span>`;
const onLang = (root, redraw) => root.querySelector('#lang')?.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== lang.get()) { lang.set(b.dataset.lang); redraw(); } });
const lang = { get: () => store.get('amc8.lang', 'en'), set: (v) => store.set('amc8.lang', v), next() { const ks = Object.keys(LANGS); const n = ks[(ks.indexOf(this.get()) + 1) % ks.length]; store.set('amc8.lang', n); return n; } };
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
const figChoices = (p) => { const v = Object.values(p.choices || {}); return v.length > 0 && v.every(isFig); };
/** 填空题：没有选项 */
const isFillP = (p) => !Object.keys(p.choices || {}).length;
/** 有没有英文原题（希望数学是纯中文卷：不显示语言切换、题号写「第 N 题」） */
const hasEn = (list) => list.some((p) => p.stem_zh);
const qLabel = (n, en) => (en ? `Problem ${n}` : `第 ${n} 题`);
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

const BRAND = `<a class="brandbar" href="../" aria-label="回到 learn-inside 首页"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="28.0" height="28.0" aria-hidden="true"><rect width="120" height="120" rx="30" class="lg-tile"/><path d="M40 32V84H86" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 58V68" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="42" r="6.5" class="lg-dot"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -73 570 75" width="96.9" height="12.8" aria-hidden="true"><path d="M23.2 1Q14.9 1 10.7 -3.75Q6.5 -8.5 6.5 -17.7V-65Q6.5 -68.1 8.1 -69.7Q9.7 -71.3 12.7 -71.3Q15.7 -71.3 17.35 -69.7Q19 -68.1 19 -65V-18.3Q19 -13.7 20.95 -11.5Q22.9 -9.3 26.5 -9.3Q27.3 -9.3 28 -9.35Q28.7 -9.4 29.4 -9.5Q30.8 -9.7 31.3 -8.75Q31.8 -7.8 31.8 -4.9Q31.8 -2.4 30.8 -1Q29.8 0.4 27.5 0.7Q26.5 0.8 25.4 0.9Q24.3 1 23.2 1Z M64 1Q55.7 1 49.7 -2.1Q43.7 -5.2 40.45 -10.9Q37.2 -16.6 37.2 -24.4Q37.2 -32 40.35 -37.7Q43.5 -43.4 49.05 -46.65Q54.6 -49.9 61.7 -49.9Q66.9 -49.9 71.05 -48.2Q75.2 -46.5 78.15 -43.3Q81.1 -40.1 82.65 -35.55Q84.2 -31 84.2 -25.3Q84.2 -23.5 82.95 -22.55Q81.7 -21.6 79.4 -21.6H47.3V-28.8H75.4L73.8 -27.3Q73.8 -31.9 72.45 -35Q71.1 -38.1 68.55 -39.75Q66 -41.4 62.2 -41.4Q58 -41.4 55.05 -39.45Q52.1 -37.5 50.55 -33.95Q49 -30.4 49 -25.5V-24.8Q49 -16.6 52.85 -12.55Q56.7 -8.5 64.2 -8.5Q66.8 -8.5 70.05 -9.15Q73.3 -9.8 76.2 -11.4Q78.3 -12.6 79.9 -12.45Q81.5 -12.3 82.45 -11.3Q83.4 -10.3 83.6 -8.85Q83.8 -7.4 83.05 -5.9Q82.3 -4.4 80.5 -3.3Q77 -1.1 72.45 -0.05Q67.9 1 64 1Z M111.7 1Q106.4 1 102.25 -1.05Q98.1 -3.1 95.75 -6.6Q93.4 -10.1 93.4 -14.5Q93.4 -19.9 96.2 -23.05Q99 -26.2 105.3 -27.6Q111.6 -29 122.2 -29H127.2V-21.8H122.3Q116.1 -21.8 112.4 -21.2Q108.7 -20.6 107.15 -19.15Q105.6 -17.7 105.6 -15.1Q105.6 -11.8 107.9 -9.7Q110.2 -7.6 114.3 -7.6Q117.6 -7.6 120.15 -9.15Q122.7 -10.7 124.2 -13.4Q125.7 -16.1 125.7 -19.6V-31.1Q125.7 -36.1 123.5 -38.3Q121.3 -40.5 116.1 -40.5Q113.2 -40.5 109.85 -39.8Q106.5 -39.1 102.8 -37.4Q100.9 -36.5 99.45 -36.9Q98 -37.3 97.2 -38.55Q96.4 -39.8 96.4 -41.3Q96.4 -42.8 97.2 -44.25Q98 -45.7 99.9 -46.4Q104.5 -48.3 108.75 -49.1Q113 -49.9 116.5 -49.9Q123.7 -49.9 128.35 -47.7Q133 -45.5 135.3 -41.05Q137.6 -36.6 137.6 -29.6V-5.6Q137.6 -2.5 136.1 -0.85Q134.6 0.8 131.8 0.8Q129 0.8 127.45 -0.85Q125.9 -2.5 125.9 -5.6V-10.4H126.7Q126 -6.9 123.95 -4.35Q121.9 -1.8 118.8 -0.4Q115.7 1 111.7 1Z M158.2 0.8Q155.1 0.8 153.45 -0.85Q151.8 -2.5 151.8 -5.6V-43.4Q151.8 -46.5 153.4 -48.1Q155 -49.7 157.9 -49.7Q160.8 -49.7 162.4 -48.1Q164 -46.5 164 -43.4V-37.1H163Q164.4 -43.1 168.5 -46.2Q172.6 -49.3 179.4 -49.9Q181.5 -50.1 182.75 -48.85Q184 -47.6 184.2 -45Q184.4 -42.5 183.05 -40.95Q181.7 -39.4 179 -39.1L176.8 -38.9Q170.7 -38.3 167.6 -35.15Q164.5 -32 164.5 -26.3V-5.6Q164.5 -2.5 162.9 -0.85Q161.3 0.8 158.2 0.8Z M198.7 0.8Q195.7 0.8 194.1 -0.85Q192.5 -2.5 192.5 -5.6V-43.4Q192.5 -46.5 194.1 -48.1Q195.7 -49.7 198.6 -49.7Q201.5 -49.7 203.1 -48.1Q204.7 -46.5 204.7 -43.4V-36.6L203.6 -39.1Q205.8 -44.4 210.45 -47.15Q215.1 -49.9 221 -49.9Q226.9 -49.9 230.7 -47.7Q234.5 -45.5 236.4 -41.05Q238.3 -36.6 238.3 -29.8V-5.6Q238.3 -2.5 236.7 -0.85Q235.1 0.8 232.1 0.8Q229.1 0.8 227.45 -0.85Q225.8 -2.5 225.8 -5.6V-29.2Q225.8 -34.9 223.65 -37.5Q221.5 -40.1 217 -40.1Q211.5 -40.1 208.25 -36.65Q205 -33.2 205 -27.5V-5.6Q205 0.8 198.7 0.8Z M303.6 0.7Q300.6 0.7 299 -1.1Q297.4 -2.9 297.4 -6.1V-42.8Q297.4 -46.1 299 -47.85Q300.6 -49.6 303.6 -49.6Q306.6 -49.6 308.25 -47.85Q309.9 -46.1 309.9 -42.8V-6.1Q309.9 -2.9 308.3 -1.1Q306.7 0.7 303.6 0.7Z M330.6 0.8Q327.6 0.8 326 -0.85Q324.4 -2.5 324.4 -5.6V-43.4Q324.4 -46.5 326 -48.1Q327.6 -49.7 330.5 -49.7Q333.4 -49.7 335 -48.1Q336.6 -46.5 336.6 -43.4V-36.6L335.5 -39.1Q337.7 -44.4 342.35 -47.15Q347 -49.9 352.9 -49.9Q358.8 -49.9 362.6 -47.7Q366.4 -45.5 368.3 -41.05Q370.2 -36.6 370.2 -29.8V-5.6Q370.2 -2.5 368.6 -0.85Q367 0.8 364 0.8Q361 0.8 359.35 -0.85Q357.7 -2.5 357.7 -5.6V-29.2Q357.7 -34.9 355.55 -37.5Q353.4 -40.1 348.9 -40.1Q343.4 -40.1 340.15 -36.65Q336.9 -33.2 336.9 -27.5V-5.6Q336.9 0.8 330.6 0.8Z M402.3 1Q398 1 393.2 0.1Q388.4 -0.8 384.6 -3Q383 -4 382.35 -5.35Q381.7 -6.7 381.85 -8.05Q382 -9.4 382.85 -10.4Q383.7 -11.4 385.05 -11.7Q386.4 -12 388 -11.2Q392 -9.3 395.5 -8.55Q399 -7.8 402.4 -7.8Q407.2 -7.8 409.55 -9.45Q411.9 -11.1 411.9 -13.8Q411.9 -16.1 410.35 -17.35Q408.8 -18.6 405.7 -19.2L395.7 -21.1Q389.5 -22.3 386.25 -25.65Q383 -29 383 -34.3Q383 -39.1 385.65 -42.6Q388.3 -46.1 393 -48Q397.7 -49.9 403.8 -49.9Q408.2 -49.9 412.05 -48.95Q415.9 -48 419.5 -46Q421 -45.2 421.55 -43.9Q422.1 -42.6 421.8 -41.25Q421.5 -39.9 420.6 -38.85Q419.7 -37.8 418.35 -37.55Q417 -37.3 415.3 -38.1Q412.2 -39.7 409.35 -40.4Q406.5 -41.1 403.9 -41.1Q399 -41.1 396.65 -39.4Q394.3 -37.7 394.3 -34.9Q394.3 -32.8 395.7 -31.4Q397.1 -30 400 -29.5L410 -27.6Q416.5 -26.4 419.85 -23.2Q423.2 -20 423.2 -14.6Q423.2 -7.3 417.5 -3.15Q411.8 1 402.3 1Z M440.9 0.7Q437.9 0.7 436.3 -1.1Q434.7 -2.9 434.7 -6.1V-42.8Q434.7 -46.1 436.3 -47.85Q437.9 -49.6 440.9 -49.6Q443.9 -49.6 445.55 -47.85Q447.2 -46.1 447.2 -42.8V-6.1Q447.2 -2.9 445.6 -1.1Q444 0.7 440.9 0.7Z M480.5 1Q474.1 1 469.25 -2.1Q464.4 -5.2 461.7 -10.95Q459 -16.7 459 -24.5Q459 -32.4 461.7 -38.05Q464.4 -43.7 469.25 -46.8Q474.1 -49.9 480.5 -49.9Q486.6 -49.9 491.15 -46.9Q495.7 -43.9 497.3 -39H496.2V-65Q496.2 -68.1 497.8 -69.7Q499.4 -71.3 502.4 -71.3Q505.4 -71.3 507.05 -69.7Q508.7 -68.1 508.7 -65V-5.6Q508.7 -2.5 507.1 -0.85Q505.5 0.8 502.5 0.8Q499.5 0.8 497.9 -0.85Q496.3 -2.5 496.3 -5.6V-13.4L497.4 -10.4Q495.9 -5.2 491.3 -2.1Q486.7 1 480.5 1ZM484 -8.5Q487.7 -8.5 490.5 -10.3Q493.3 -12.1 494.85 -15.65Q496.4 -19.2 496.4 -24.5Q496.4 -32.5 493 -36.45Q489.6 -40.4 484 -40.4Q480.3 -40.4 477.5 -38.65Q474.7 -36.9 473.15 -33.35Q471.6 -29.8 471.6 -24.5Q471.6 -16.6 475 -12.55Q478.4 -8.5 484 -8.5Z M547.3 1Q539 1 533 -2.1Q527 -5.2 523.75 -10.9Q520.5 -16.6 520.5 -24.4Q520.5 -32 523.65 -37.7Q526.8 -43.4 532.35 -46.65Q537.9 -49.9 545 -49.9Q550.2 -49.9 554.35 -48.2Q558.5 -46.5 561.45 -43.3Q564.4 -40.1 565.95 -35.55Q567.5 -31 567.5 -25.3Q567.5 -23.5 566.25 -22.55Q565 -21.6 562.7 -21.6H530.6V-28.8H558.7L557.1 -27.3Q557.1 -31.9 555.75 -35Q554.4 -38.1 551.85 -39.75Q549.3 -41.4 545.5 -41.4Q541.3 -41.4 538.35 -39.45Q535.4 -37.5 533.85 -33.95Q532.3 -30.4 532.3 -25.5V-24.8Q532.3 -16.6 536.15 -12.55Q540 -8.5 547.5 -8.5Q550.1 -8.5 553.35 -9.15Q556.6 -9.8 559.5 -11.4Q561.6 -12.6 563.2 -12.45Q564.8 -12.3 565.75 -11.3Q566.7 -10.3 566.9 -8.85Q567.1 -7.4 566.35 -5.9Q565.6 -4.4 563.8 -3.3Q560.3 -1.1 555.75 -0.05Q551.2 1 547.3 1Z M440.9 -58.9Q437.4 -58.9 435.45 -60.65Q433.5 -62.4 433.5 -65.5Q433.5 -68.7 435.45 -70.4Q437.4 -72.1 440.9 -72.1Q444.5 -72.1 446.4 -70.4Q448.3 -68.7 448.3 -65.5Q448.3 -62.4 446.4 -60.65Q444.5 -58.9 440.9 -58.9Z" class="lg-ink"/><path d="M257.1 -21.8Q254.9 -21.8 253.45 -23.25Q252 -24.7 252 -26.8Q252 -29 253.45 -30.4Q254.9 -31.8 257.1 -31.8H278.4Q280.5 -31.8 281.95 -30.4Q283.4 -29 283.4 -26.8Q283.4 -24.7 281.95 -23.25Q280.5 -21.8 278.4 -21.8Z" class="lg-jade"/><path d="M303.6 -58.9Q300.1 -58.9 298.15 -60.65Q296.2 -62.4 296.2 -65.5Q296.2 -68.7 298.15 -70.4Q300.1 -72.1 303.6 -72.1Q307.2 -72.1 309.1 -70.4Q311 -68.7 311 -65.5Q311 -62.4 309.1 -60.65Q307.2 -58.9 303.6 -58.9Z" class="lg-dot"/></svg></a><span class="brandbar"><span class="bdiv"></span><span class="bname">${SECTION === 'account' ? '账号' : '数学'}</span></span>`;
// 导航：电脑上左侧黑板绿侧栏，手机上底部标签栏；未登录只有顶部品牌条
const ICON = {
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
  exam: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
  graph: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="17" r="2.2"/><path d="M8 7.6 16 6.4M7.2 8.9l3.6 6.2M16.8 7.9l-3.6 7.2"/>',
  mistakes: '<path d="M6 4h9l3 3v13H6z"/><path d="m9.5 11 5 5m0-5-5 5"/>',
  account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S12 9 12 9zm0 0c1.5-3.5 5.5-4 5.5-1.5S12 9 12 9z"/>',
  done: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.8 2.7L16.2 9.5"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  flag: '<path d="M6 21V4.5M6 5h10.5l-2 3.5 2 3.5H6"/>',
  bulb: '<path d="M9 17.5h6M10 21h4M12 3.5a5.5 5.5 0 0 0-3.2 10c.7.5 1.2 1.3 1.2 2.2v.3h4v-.3c0-.9.5-1.7 1.2-2.2A5.5 5.5 0 0 0 12 3.5z"/>',
  chat: '<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h0A2 2 0 0 1 5 14z"/><path d="M9 9.5h6M9 12h4"/>',
};
const icon = (k, size = 20) => `<svg class="ic ic-${k}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
let lastMe = null; // 侧栏显示会员 / 剩余次数
// 客服：管理后台上传的微信二维码
let supportCache = null;
// 在微信里打开：客服直接点链接进聊天；图片不能下载只能长按；支付宝付款要换到浏览器
const IN_WX = /MicroMessenger/i.test(navigator.userAgent);
async function showSupport(title = '联系客服') {
  try { supportCache ||= await (await fetch('/api/support')).json(); } catch { supportCache = { qr: null, text: '' }; }
  const s = supportCache;
  const inWx = IN_WX;
  const link = /^https:\/\//.test(s.url || '') ? s.url : '';
  modal(`<div class="support"><h2>${esc(title)}</h2>
    ${link && inWx ? `<a class="btn primary block" href="${esc(link)}">打开微信客服</a>` : ''}
    ${s.qr && !(link && inWx) ? `<img class="support-qr" src="${esc(s.qr)}" alt="微信客服二维码"><p>微信扫一扫，直接和客服聊</p>` : ''}
    ${link && !inWx ? `<p class="small"><a href="${esc(link)}" target="_blank" rel="noopener">在微信里打开客服链接</a></p>` : ''}
    ${s.text ? `<p class="muted">${esc(s.text)}</p>` : s.qr || link ? '' : '<p class="muted">客服联系方式还没有设置。</p>'}
    <div class="actions" style="justify-content:center"><button class="btn" data-close>关闭</button></div></div>`);
}
document.addEventListener('click', (e) => { const a = e.target.closest('[data-support]'); if (a) { e.preventDefault(); showSupport(a.dataset.support || '联系客服'); } });
function topnav() {
  const s = auth.student;
  if (!s) return sideNav({ section: SECTION, sub: [], who: null });
  const h = location.hash || '#/';
  const SUB = SECTION === 'math' ? [
    ['#/graph', '知识图谱', 'graph', /^#\/(graph|kp)/],
    ['#/mistakes', '错题本', 'mistakes', /^#\/(mistakes|problem)/],
  ] : [];
  const memb = lastMe ? (lastMe.guest ? '注册送 10 次互动解析' : lastMe.free_mode ? '试用期全部免费' : lastMe.premium ? '会员' : `免费次数 ${lastMe.credits}`) : '';
  return sideNav({ section: SECTION, sub: SUB.map(([href, n, ic, re]) => [href, n, ic, re.test(h)]), who: { name: s.nickname, note: memb } });
}

// ───────── 路由 ─────────
let cleanup = null;
let lastRoute = '';
async function router() {
  cleanup?.(); cleanup = null;
  if (location.hash !== lastRoute) { lastRoute = location.hash; window.scrollTo(0, 0); } // 换页回到顶部
  closeLesson();
  document.body.classList.remove('exam-mode', 'exam-li');
  $modal.innerHTML = '';
  const [, page, id, sub] = (location.hash.slice(1) || '/').split('?')[0].split('/');
  const dim = setTimeout(() => $app.classList.add('page-wait'), 150); // 换页时旧页面变淡、不能点
  const loaded = loadStart();
  try {
    const printTok = new URLSearchParams(location.search).get('print');
    if (printTok) return await renderPrintLink(printTok);
    if (!auth.token) return renderJoin();
    if (SECTION === 'account') return await (page === 'account' && id === 'paid' ? renderPaid(sub) : renderAccount());
    if (page === 'account' && id !== 'paid') { location.replace(ACCOUNT_URL); return; } // 账号是全站的，在 /account/
    if (page === 'exam') return await renderExam(id);
    if (page === 'review') return await renderReview(id);
    if (page === 'kp') return await renderKp(id);
    if (page === 'problem') return await renderProblem(id);
    if (page === 'profile') { location.replace('#/graph'); return; } // 画像并进了知识图谱
    if (page === 'graph') return await renderGraphPage(id);
    if (page === 'mistakes') return await renderMistakes();
    if (page === 'account' && id === 'paid') return await renderPaid(sub);
    if (page === 'account') return await renderAccount();
    if (page === 'contest') return await renderContest(id, sub);
    if (page === 'exams') { location.replace('#/'); return; } // 考试列表并进了数学首页
    return await renderDashboard();
  } catch (e) {
    $app.innerHTML = `${topnav()}<main class="page"><div class="card"><p class="error-msg">${esc(e.message)}</p><a href="#/">返回首页</a></div></main>`;
  } finally { clearTimeout(dim); $app.classList.remove('page-wait'); loaded(); }
}
window.addEventListener('hashchange', router);
// 从支付宝点「返回」时浏览器会恢复旧页面（按钮停在点过的样子）：重新加载一次，拿最新的订单状态
window.addEventListener('pageshow', (e) => { if (e.persisted) { document.querySelector('.pay-overlay')?.remove(); router(); } });
// 「去错题本订正」带上知识项筛选
document.addEventListener('click', (e) => { const a = e.target.closest('[data-mskp]'); if (a) { msKp = a.dataset.mskp; msFam = ''; msFilter = 'todo'; msMore = false; } });

// 账号页绑定 / 注册表单的「显示密码」
document.addEventListener('click', (e) => {
  const b = e.target.closest('#bind .eye'); if (!b) return;
  const i = b.previousElementSibling; const show = i.type === 'password';
  i.type = show ? 'text' : 'password'; b.textContent = show ? '隐藏' : '显示';
  const i2 = document.querySelector('#bind [name=password2]'); if (i2) i2.type = i.type;
});

// 注册礼：在登录页、游客提示、账号页、复盘页统一用这一块
const GIFT = () => `<div class="gift"><span class="gift-n"><span>10<small>次</small></span></span><span><b>注册就送 10 次互动解析</b></span></div>`;

// 游客只能考试、看对错和答案；错题本、知识图谱、知识项要注册
const isGuest = () => !!lastMe?.guest;
async function ensureMe() { if (!lastMe) try { lastMe = await api('/math/api/me'); } catch {} return lastMe; }
const REG_FEATS = `<ul class="reg-feats"><li><b>错题本</b></li><li><b>知识图谱</b></li><li><b>知识项突击</b></li></ul>`;
function regWall(title) {
  $app.innerHTML = `${topnav()}<main class="page"><header class="ph"><div><h1>${esc(title)}</h1></div></header>
    <div class="cols"><div class="col-main"><div class="card reg-wall"><h2>注册后可以使用</h2>${REG_FEATS}
      <a class="btn primary" href="#/account">免费注册</a></div></div>
    <aside class="col-side"><a class="card gift-link" href="#/account">${GIFT()}</a></aside></div></main>`;
}

// ───────── 登录 / 注册（常见做法：左边介绍、右边表单；手机上只有表单） ─────────
let joinTab = store.get('li.hadAccount') ? 'login' : 'register';
let joinPrefill = null;
// 从别的板块（语文）跳来登录的，登录 / 注册 / 游客进入后回到原来的页面
function goBack() { const b = store.get('li.back'); if (!b) return false; store.del('li.back'); if (!/^\/(chinese|math)\//.test(b)) return false; location.href = b; return true; }
function renderJoin() {
  const reg = joinTab === 'register';
  $app.innerHTML = `${topnav()}<div class="auth-wrap">
    <section class="auth-intro">
      <h1>竞赛真题边练边学</h1>
      <ul>
        <li><b>数学真题</b>AMC 8 · 希望数学 · 思维 100</li>
        <li><b>语文真题</b>汉字小达人</li>
        <li><b>知识图谱 · 错题本</b>数学、语文同一个账号</li>
        <li><b>互动解析</b><em class="hl">注册送 10 次</em></li>
      </ul>
    </section>
    <section class="auth-card card">
      <h2>${reg ? '注册账号' : '登录'}</h2>
      <p class="small muted">${reg ? '已有账号？' : '还没有账号？'}<a href="javascript:" data-tab="${reg ? 'login' : 'register'}">${reg ? '直接登录' : '免费注册，送 10 次互动解析'}</a></p>
      ${reg ? GIFT() : ''}
      <form id="join" novalidate>
        <label class="field"><span>手机号</span>
          <div class="input-group"><span class="prefix">+86</span><input type="tel" name="phone" inputmode="numeric" maxlength="11" placeholder="请输入手机号" autocomplete="username"></div></label>
        <label class="field"><span>${reg ? '设置密码' : '密码'}</span>
          <div class="input-group"><input type="password" name="password" placeholder="${reg ? '至少 6 位' : '请输入密码'}" autocomplete="${reg ? 'new-password' : 'current-password'}"><button type="button" class="eye" aria-label="显示密码">显示</button></div></label>
        ${reg ? '<label class="field"><span>再输一遍密码</span><input type="password" name="password2" placeholder="和上面一样" autocomplete="new-password"></label>' : ''}
        ${reg ? '<label class="field"><span>孩子的昵称</span><input type="text" name="nickname" maxlength="20" placeholder="例如：小桐（以后可以再加孩子）"></label>' : ''}
        <div class="error-msg" id="err" role="alert"></div>
        <button class="btn primary block" type="submit">${reg ? '注册' : '登录'}</button>
      </form>
      <div class="auth-or"><span>或者</span></div>
      <button class="btn block" id="guest">先不注册，直接试试</button>
      ${reg ? '' : '<div class="auth-foot small muted"><a href="javascript:" id="forgot">忘记密码？</a></div>'}
    </section>
  </div>`;
  $app.querySelectorAll('[data-tab]').forEach((t) => (t.onclick = () => { joinTab = t.dataset.tab; renderJoin(); }));
  document.getElementById('guest').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/auth/guest', { method: 'POST', body: {} }); auth.save(r.token, r.student); if (goBack()) return; location.hash = '#/'; router(); }
    catch (x) { document.getElementById('err').textContent = x.message; e.target.disabled = false; }
  };
  $app.querySelector('#join .eye').onclick = (e) => {
    const i = e.target.previousElementSibling; const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; e.target.textContent = show ? '隐藏' : '显示';
    const i2 = document.querySelector('#join [name=password2]'); if (i2) i2.type = i.type;
  };
  if (joinPrefill) { const jp = joinPrefill; joinPrefill = null; document.querySelector('#join [name=phone]').value = jp.phone; document.getElementById('err').textContent = jp.msg; document.querySelector('#join [name=password]').focus(); }
  document.getElementById('forgot')?.addEventListener('click', () => showSupport('忘记密码？加客服帮你重置'));
  const err = document.getElementById('err');
  document.getElementById('join').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.phone = String(f.phone || '').replace(/\D/g, '');
    if (!/^1\d{10}$/.test(f.phone)) return (err.textContent = '请输入正确的 11 位手机号');
    if (!f.password || (reg && f.password.length < 6)) return (err.textContent = reg ? '密码至少 6 位' : '请输入密码');
    if (reg && f.password !== f.password2) return (err.textContent = '两次输入的密码不一样，请再检查一下');
    delete f.password2;
    if (reg && !String(f.nickname || '').trim()) return (err.textContent = '请填写孩子的昵称');
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true; err.textContent = '';
    try {
      const r = await api(`/api/auth/${reg ? 'register' : 'login'}`, { method: 'POST', body: f });
      auth.save(r.token, r.student); store.set('li.hadAccount', true);
      if (goBack()) return;
      location.hash = '#/'; router();
    } catch (x) {
      if (reg && /已经注册过/.test(x.message)) { joinTab = 'login'; joinPrefill = { phone: f.phone, msg: '这个手机号已经注册过，输入密码直接登录' }; return renderJoin(); } // 注册过的手机号：直接换到登录
      err.textContent = x.message; btn.disabled = false;
    }
  };
}

// ───────── 账号与会员 ─────────
const fmtDay = (ms) => new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const promoEnd = (t) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
async function renderAccount() {
  const a = await api('/api/account');
  const untilText = (u) => (u === 'forever' ? '永久' : `到 ${fmtDay(u)}`);
  const ms = a.scopes.filter((x) => a.memberships[x.id]);
  const memberLine = a.free_mode ? '试用期间所有内容免费开放。'
    : ms.length ? ms.map((x) => `<span class="mtag">${esc(x.name)}会员</span> ${untilText(a.memberships[x.id])}`).join('<br>') : '还不是会员';
  const groups = a.scopes.map((sc) => ({ ...sc, plans: a.plans.filter((p) => p.scope === sc.id) })).filter((g) => g.plans.length);
  // 账号卡片：游客放在最上面（手机上一眼看到注册表单），注册用户放在右栏
  const acctCard = `<div class="card"><h2>${a.guest ? '注册账号' : '登录方式'}</h2>
      ${a.phone ? `<p>手机号 <b>${esc(a.phone)}</b></p>
        <details><summary class="small">修改密码</summary><form id="pw" style="margin-top:10px">
          <label class="field"><span>原密码</span><input type="password" name="old_password" autocomplete="current-password"></label>
          <label class="field"><span>新密码（至少 6 位）</span><input type="password" name="password" autocomplete="new-password"></label>
          <label class="field"><span>再输一遍新密码</span><input type="password" name="password2" autocomplete="new-password"></label>
          <button class="btn">保存</button><div class="error-msg" id="perr"></div></form></details>`
      : `${a.guest ? GIFT() : ''}
        <form id="bind"><label class="field"><span>手机号</span>
          <div class="input-group"><span class="prefix">+86</span><input type="tel" name="phone" inputmode="numeric" maxlength="11" placeholder="请输入手机号" autocomplete="username"></div></label>
          <label class="field"><span>设置密码</span>
          <div class="input-group"><input type="password" name="password" placeholder="至少 6 位" autocomplete="new-password"><button type="button" class="eye" aria-label="显示密码">显示</button></div></label>
          <label class="field"><span>再输一遍密码</span><input type="password" name="password2" placeholder="和上面一样" autocomplete="new-password"></label>
          ${a.guest ? `<label class="field"><span>孩子的昵称</span><input type="text" name="nickname" maxlength="20" value="${esc(auth.student?.nickname === '同学' ? '' : auth.student?.nickname || '')}" placeholder="例如：小桐"></label>` : ''}
          <button class="btn primary">${a.guest ? '注册' : '绑定'}</button><div class="error-msg" id="berr"></div></form>
`}
      <p style="margin-top:14px"><button class="btn" id="logout">退出登录</button></p>
    </div>`;
  $app.innerHTML = `${topnav()}<main class="page">
    <header class="ph"><div><h1>账号</h1><p class="muted">${a.guest ? '游客' : esc(a.phone || '还没绑定手机号')}</p></div></header>
    <div class="cols"><div class="col-main">${a.guest ? acctCard : ''}<div class="card"><h2>${ms.length ? '我的会员' : '购买会员'}</h2>
      <p>${memberLine}</p>
      ${a.free_mode || a.guest ? '' : `<p>剩余免费次数 <b>${a.credits}</b> 次</p>${a.credits <= 0 && !ms.length ? shareCard() : ''}`}
      ${a.pending_order ? `<div class="pay-pending"><div><b>有一笔订单还没付完</b><span>${esc(a.pending_order.name)} · ¥${esc(a.pending_order.amount)} · ${Math.max(1, 30 - Math.floor((Date.now() - a.pending_order.created_at) / 60000))} 分钟内有效</span></div>
        <div class="pay-pending-btns"><button class="btn primary" data-repay="${esc(a.pending_order.id)}">继续支付</button><a class="btn" href="#/account/paid/${enc(a.pending_order.id)}">我已付款</a><button class="btn" data-cancel-order="${esc(a.pending_order.id)}">取消订单</button></div></div>` : ''}
      ${a.promo && groups.length ? `<div class="promo-bar"><b>${esc(a.promo.title)}</b><span>活动价到 ${promoEnd(a.promo.until)}</span></div>` : ''}
      ${groups.map((g) => `<div class="section-label">${esc(g.name)}会员${g.id === 'all' ? '<span class="small muted">（所有科目）</span>' : ''}</div>
        <div class="plans">${g.plans.map((p) => `<div class="plan"><div class="pname">${p.period}</div><div class="price ${p.price ? '' : 'tbd'}">${p.orig_price ? `<s class="orig">¥${p.orig_price}</s>` : ''}${p.price ? `¥${p.price}` : '价格待定'}</div><div class="small muted">${p.days} 天</div>
        ${!a.pay_ready || !p.price ? '' : a.guest ? '<a class="btn" href="javascript:" data-goreg><span class="lg">注册后开通</span><span class="sm">去注册</span></a>' : p.online ? `<button class="btn primary" data-plan="${p.id}">开通</button>` : '<button class="btn" data-support="购买激活码" title="暂不支持在线支付"><span class="lg">暂不支持 · 找客服</span><span class="sm">找客服</span></button>'}</div>`).join('')}</div>`).join('')}
      
      ${a.pay_ready ? '' : `<div class="buy-tip"><span>在线支付即将开通。现在可以找客服买激活码，在「激活码」里输入就能开通。</span><button class="btn primary" data-support="购买激活码">联系客服</button></div>`}
    </div>
    </div><aside class="col-side"><div class="card"><h2>激活码</h2>
      <form id="redeem" class="row"><input type="text" name="code" placeholder="${a.guest ? '注册后可兑换' : '输入激活码'}" autocomplete="off" style="flex:1;min-width:160px"${a.guest ? ' disabled' : ''}><button class="btn primary"${a.guest ? ' disabled' : ''}>兑换</button></form>
      <div class="error-msg" id="rerr"></div>
    </div>
    ${a.guest ? '' : acctCard}
  </aside></div></main>`;
  const form = (id, path, errId, done) => document.getElementById(id)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if ('password2' in body) { // 设置 / 修改密码要输两遍
      if (String(body.password || '').length < 6) return (document.getElementById(errId).textContent = '密码至少 6 位');
      if (body.password !== body.password2) return (document.getElementById(errId).textContent = '两次输入的密码不一样，请再检查一下');
      delete body.password2;
    }
    try { const r = await api(path, { method: 'POST', body }); if (r.status === 402) throw new Error(r.error); await done(r); }
    catch (err) {
      if (id === 'bind' && /已经注册过/.test(err.message) && a.guest) { // 游客注册时手机号已注册过：去登录
        return modal(`<h2>这个手机号已经注册过</h2><p>直接用这个手机号登录就行。</p><p class="small muted">游客时做的题不会带过去。</p><div class="actions"><button class="btn" data-close>换个手机号</button><button class="btn primary" id="tologin">去登录</button></div>`,
          (m) => (m.querySelector('#tologin').onclick = () => { auth.clear(); joinTab = 'login'; joinPrefill = { phone: String(body.phone || '').replace(/\D/g, ''), msg: '这个手机号已经注册过，输入密码直接登录' }; location.hash = '#/'; router(); }));
      }
      document.getElementById(errId).textContent = err.message;
    }
  });
  form('redeem', '/api/redeem', 'rerr', (r) => { modal(`<h2>兑换成功</h2><p>${r.kind === 'days' ? `${esc(r.tier_name || '')}会员增加 ${r.amount} 天。` : `免费次数增加 ${r.amount} 次。`}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); renderAccount(); });
  $app.querySelectorAll('[data-goreg]').forEach((b) => (b.onclick = () => { const f = document.getElementById('bind'); f?.scrollIntoView({ behavior: 'smooth', block: 'center' }); f?.querySelector('input')?.focus(); }));
  $app.querySelectorAll('[data-plan]').forEach((b) => (b.onclick = async () => {
    if (IN_WX) return modal(`<h2>请在浏览器里开通</h2><p>微信里不能打开支付宝付款。点右上角「···」，选「在浏览器打开」，登录后再点「开通」。</p>
      <div class="actions"><button class="btn" data-close>知道了</button><button class="btn primary" id="cpurl">复制网址</button></div>`, (m) => (m.querySelector('#cpurl').onclick = async (e) => {
        try { await navigator.clipboard.writeText(location.href); e.target.textContent = '已复制'; } catch { e.target.outerHTML = `<span class="small">${esc(location.href)}</span>`; }
      }));
    const p = a.plans.find((x) => x.id === b.dataset.plan);
    // 先确认订单（套餐、天数、金额、支付方式），再去支付宝
    modal(`<h2>确认开通</h2><div class="pay-sum"><div><span>套餐</span><b>${esc(p.name)}</b></div><div><span>有效期</span><b>${p.days} 天</b></div>
      ${p.orig_price ? `<div><span>原价</span><s>¥${p.orig_price}</s></div>` : ''}<div><span>支付方式</span><b>支付宝</b></div><div class="pay-total"><span>应付</span><b>¥${p.price}</b></div></div>
      ${a.pending_order && a.pending_order.plan !== p.id ? `<p class="small muted">之前没付完的「${esc(a.pending_order.name)}」订单会自动取消。</p>` : ''}
      <div class="actions"><button class="btn" data-close>再想想</button><button class="btn primary" id="gopay">去支付 ¥${p.price}</button></div>`,
    (m, close) => (m.querySelector('#gopay').onclick = () => { close(); goPay(() => api('/api/pay/create', { method: 'POST', body: { plan: p.id, from: 'math' } })); }));
  }));
  // 待付款订单：继续支付 / 我已付款 / 取消
  $app.querySelector('[data-repay]')?.addEventListener('click', (e) => goPay(() => api(`/api/pay/orders/${enc(e.currentTarget.dataset.repay)}/repay`, { method: 'POST', body: {} })));
  $app.querySelector('[data-cancel-order]')?.addEventListener('click', async (e) => {
    try { const r = await api(`/api/pay/orders/${enc(e.currentTarget.dataset.cancelOrder)}/cancel`, { method: 'POST', body: {} }); if (r.status === 'paid') return (location.hash = `#/account/paid/${enc(e.currentTarget.dataset.cancelOrder)}`); renderAccount(); }
    catch (err) { modal(`<h2>没能取消</h2><p>${esc(err.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  });
  form('bind', '/api/account/bind', 'berr', async (r) => {
    const me = await api('/math/api/me'); lastMe = me;
    const s = me.students.find((x) => x.id === auth.student?.id) || me.students[0]; if (s) auth.setStudent(s);
    if (r.credits_added) modal(`<div class="support"><div class="gift-big">${icon('gift', 44)}</div><h2>注册成功，已送你 ${r.credits_added} 次互动解析</h2></div><div class="actions" style="justify-content:center"><button class="btn primary" data-close>好的</button></div>`);
    renderAccount();
  });
  form('pw', '/api/account/password', 'perr', () => modal('<h2>密码已修改</h2><div class="actions"><button class="btn primary" data-close>好</button></div>'));
  document.getElementById('logout').onclick = () => {
    if (!a.phone) return modal(`<h2>${a.guest ? '先注册？' : '先绑定手机号？'}</h2><p>${a.guest ? '游客的做题记录只存在这台设备上，退出后就找不回来了。' : '这个账号还没绑定手机号，退出后就找不回来了。'}</p><div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="lo">仍然退出</button></div>`,
      (m) => (m.querySelector('#lo').onclick = () => { auth.clear(); location.hash = '#/'; router(); }));
    auth.clear(); location.hash = '#/'; router();
  };
}

// 支付宝付完跳回：查订单，没到账就隔几秒再查（服务端会主动问支付宝）
// 去支付宝：全屏遮罩挡住页面，跳转慢时给手动打开的链接；付过了直接看结果
async function goPay(create) {
  const ov = document.createElement('div');
  ov.className = 'pay-overlay';
  ov.innerHTML = '<div class="pay-box"><span class="pay-spin"></span><b>正在打开支付宝…</b><p class="small muted">请稍候，不要关闭页面</p><div class="pay-late"></div></div>';
  document.body.appendChild(ov);
  try {
    const r = await create();
    if (r.status === 'paid') { ov.remove(); location.hash = `#/account/paid/${enc(r.order_id || '')}`; return; }
    location.href = r.url;
    setTimeout(() => { // 5 秒还没跳走：给手动打开和取消
      const late = ov.querySelector('.pay-late');
      if (late) late.innerHTML = `<a class="btn primary" href="${esc(r.url)}">没有跳转？点这里打开支付宝</a><button class="btn" id="pay-x">取消</button>`;
      ov.querySelector('#pay-x')?.addEventListener('click', () => { ov.remove(); router(); });
    }, 5000);
  } catch (err) {
    ov.remove();
    modal(`<h2>没能发起支付</h2><p>${esc(err.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
  }
}
// 从支付宝回来（或点「我已付款」）：查支付结果，区分已开通 / 订单已关闭 / 还没付
async function renderPaid(orderId) {
  const box = (html) => { $app.innerHTML = `${topnav()}<div class="page"><div class="card pay-result">${html}</div></div>`; };
  box('<span class="pay-spin"></span><h2>正在确认支付结果…</h2><p class="small muted">一般几秒钟，请不要关闭页面</p>');
  let o;
  for (let i = 0; i < 6; i++) {
    o = await api(`/api/pay/orders/${enc(orderId)}`);
    if (o.status !== 'pending' || !location.hash.includes(orderId)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!location.hash.includes(orderId)) return; // 已经离开这个页面
  if (o.status === 'paid') return box(`<div class="gift-big">${icon('done', 44)}</div><h2>${esc(o.plan_name)}已开通</h2><p>${o.member_until === 'forever' ? '永久有效' : `有效期到 <b>${fmtDay(o.member_until)}</b>`}</p><div class="actions"><a class="btn" href="#/account">账号</a><a class="btn primary" href="#/">开始练习</a></div>`);
  if (o.status === 'refunded' || o.status === 'refunding') return box(`<h2>这笔订单已退款</h2><div class="actions"><a class="btn primary" href="#/account">返回账号</a></div>`);
  if (o.status === 'closed') return box(`<h2>没有完成付款</h2><p>这笔订单（${esc(o.plan_name)} ¥${esc(o.amount)}）已关闭，没有扣款。</p><div class="actions"><a class="btn" href="#/">先不开了</a><a class="btn primary" href="#/account">重新开通</a></div>`);
  box(`<h2>还没收到付款</h2><p>${esc(o.plan_name)} · ¥${esc(o.amount)}</p><p class="small muted">如果已经付款，可能是支付宝还没通知到，点「我已付款，再查一次」；还没付可以继续支付或取消。</p>
    <div class="actions pay-actions"><button class="btn" id="pq">我已付款，再查一次</button><button class="btn primary" data-repay="${esc(o.id)}">继续支付</button></div>
    <p class="small"><a href="javascript:" id="pc">取消订单</a> · <a href="javascript:" data-support>联系客服</a> · 订单号 <code>${esc(o.id)}</code></p>`);
  $app.querySelector('#pq').onclick = () => renderPaid(orderId);
  $app.querySelector('[data-repay]').onclick = () => goPay(() => api(`/api/pay/orders/${enc(o.id)}/repay`, { method: 'POST', body: {} }));
  $app.querySelector('#pc').onclick = async () => { const r = await api(`/api/pay/orders/${enc(o.id)}/cancel`, { method: 'POST', body: {} }); r.status === 'paid' ? renderPaid(orderId) : (location.hash = '#/account'); };
}

/** 内容没解锁：有免费次数就问要不要用 1 次，没有就引导开通会员。解锁成功后执行 then() */
// 次数用完：转发宣传图到 100 人以上的微信群，截图给客服，再送 10 次（客服在后台「加次数」）
const SHARE_IMG = '/math/share-poster.png';
const shareCard = () => `<div class="share"><img src="${SHARE_IMG}" alt="learn-inside 宣传图（带二维码）">
  <div class="share-t"><b>分享再得 10 次</b>
    <ol><li>${IN_WX ? '长按上面的图片，保存到手机' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? '长按图片保存，或点「保存宣传图」' : '点「保存宣传图」下载'}</li><li>转发到 <b>100 人以上</b>的微信群</li><li>截图发给客服，客服给你加 <b>10 次</b></li></ol>
    <div class="share-btns">${IN_WX ? '' : `<a class="btn" href="${SHARE_IMG}" download="learn-inside-宣传图.png">保存宣传图</a>`}<button class="btn primary" data-support="把转发截图发给客服，领 10 次">发截图给客服</button></div></div></div>`;
async function askUnlock(item, what, credits, then) {
  if (!lastMe) try { lastMe = await api('/math/api/me'); } catch {}
  if (credits > 0) return modal(`<h2>解锁${esc(what)}</h2>
    <p>用 1 次免费次数解锁，${item.startsWith('adv:') ? '之后这道题的互动解析可以随时反复看' : '之后这个知识项的突击可以随时再做'}。</p>
    <p class="small muted">剩余 ${credits} 次。开通会员后不限次数。</p>
    <div class="actions"><a class="btn" href="#/account" data-close>看看会员</a><button class="btn primary" id="unl">用 1 次解锁</button></div>`, (m, close) => {
    m.querySelector('#unl').onclick = async (e) => {
      e.target.disabled = true;
      const r = await api('/api/unlock', { method: 'POST', body: { item } });
      close();
      if (r.status === 402) return askUnlock(item, what, 0, then);
      then();
    };
  });
  if (lastMe?.guest) return modal(`<div class="locked-panel"><div class="icon">${icon('gift', 36)}</div><p><b>注册就送 10 次互动解析</b></p>
    <p class="small">互动解析是会员内容。注册账号就送 10 次，这道题马上能看；现在的做题记录也会保留。（2026 年真题的互动解析不用注册也能看。）</p>
    <div class="actions" style="justify-content:center"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/account" data-close>去注册</a></div></div>`);
  modal(`<h2>免费次数用完了</h2>${shareCard()}
    <p class="small muted share-or">或者开通会员，所有互动解析和知识项突击不限次数。</p>
    <div class="actions"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/account" data-close>开通会员</a></div>`);
}

// ───────── 首页：掌握地图 + 今天做什么 + 最近成绩 ─────────
const LV = { strong: '掌握较好', ok: '基本掌握', weak: '薄弱', insufficient: '数据不足', none: '还没做过' };
let dashFam = store.get('math.fam'); // 数学首页选中的考试（记住上次的）
async function renderDashboard() {
  const me = await api('/math/api/me');
  lastMe = me;
  if (!auth.student || !me.students.find((s) => s.id === auth.student.id)) auth.setStudent(me.students[0]);
  const st = auth.student;
  const guest = !!me.guest; // 游客没有知识图谱和错题本
  const fams = (await apiList(`/math/api/families?student=${st.id}`)).sort((a, b) => (b.exams > 0) - (a.exams > 0));
  const [g, prof] = await Promise.all([
    guest ? { nodes: [], edges: [], modules: [] } : api(`/math/api/students/${st.id}/graph`),
    api(`/math/api/students/${st.id}/profile`).catch(() => ({ sessions: [], mistakes: [] })),
  ]);
  const lv = (n) => n.mastery?.level || 'none';
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const pre = {};
  g.edges.forEach(([a, b]) => (pre[b] ||= []).push(a));
  const count = (k) => g.nodes.filter((n) => lv(n) === k).length;
  // 先补什么：薄弱的知识项；如果它的前置也薄弱，先补前置
  const sugg = [];
  const weak = g.nodes.filter((n) => lv(n) === 'weak').sort((a, b) => (b.wrong?.todo || 0) - (a.wrong?.todo || 0) || (a.mastery.score - b.mastery.score));
  for (const n of weak) {
    const wp = (pre[n.id] || []).map((id) => byId[id]).find((x) => x && lv(x) === 'weak');
    const pick = wp || n;
    if (!sugg.some((x) => x.n.id === pick.id)) sugg.push({ n: pick, why: wp ? `${n.name}的前置` : `错题 ${n.wrong?.todo || 0} 道没订正` });
    if (sugg.length >= 3) break;
  }
  const ms = prof.mistakes || [];
  const pending = ms.filter((m) => m.status === 'pending').length, due = ms.filter((m) => m.status === 'due').length;
  const sessions = (prof.sessions || []).slice(0, 5);
  const tasks = [ // 错题在页面最上面的「继续」条里，这里只列要补的知识项
    ...sugg.map((x) => `<a class="task weak" href="#/kp/${enc(x.n.id)}"><i class="kg-sw lv-weak"></i><span>先补「${esc(x.n.name)}」<small>${esc(x.why)}</small></span></a>`),
  ].filter(Boolean);
  const startFam = fams.find((x) => x.id === dashFam && x.exams) || fams.find((x) => x.exams);
  if (!tasks.length && startFam) tasks.push(`<a class="task" href="#/contest/${enc(startFam.id)}"><i class="ico">›</i><span>做一套真题<small>${esc(startFam.name)}</small></span></a>`);
  // 没做完的模考：浏览器里存着答题进度的会话，向服务器确认还没交卷、没过期
  let live = null;
  for (const k of Object.keys(localStorage).filter((k) => k.startsWith('amc8.s.')).slice(0, 5)) {
    const d = await api(`/math/api/sessions/${enc(k.slice(7))}`).catch(() => null);
    if (d && !d.session.submitted && d.session.deadline_at > d.session.server_now) { live = { sid: d.session.id, title: d.exam.title }; break; }
  }
  const strip = [
    live && `<a class="cont-go" href="#/exam/${enc(live.sid)}"><b>继续答题</b><span>${esc(live.title)}</span><i>›</i></a>`,
    pending + due ? `<a class="cont-go alt" href="#/mistakes"><b>${pending + due} 道错题</b><span>${pending ? `${pending} 道待订正` : ''}${pending && due ? '，' : ''}${due ? `${due} 道该复习` : ''}</span><i>›</i></a>` : '',
  ].filter(Boolean);
  const tried = g.nodes.filter((n) => lv(n) !== 'none').length;
  $app.innerHTML = `${topnav()}<main class="page dash">
    <header class="ph"><div><h1>数学竞赛真题</h1></div>
      ${me.students.length > 1 ? `<select id="stu">${me.students.map((s) => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${esc(s.nickname)}</option>`).join('')}</select>` : ''}</header>
    ${strip.length ? `<div class="cont-strip">${strip.join('')}</div>` : ''}
    <section class="dash-exams" aria-label="考试">
      <div class="fam-cards">${fams.map((x) => `<a class="fam-card ${x.id === dashFam ? 'last' : ''}" href="#/contest/${enc(x.id)}">
        <b>${esc(x.name)}</b><span>${x.exams ? `${x.exams} 套真题` : '录入中'}</span>
        <small>${x.last ? `最近 ${x.last.score} 分` : ''}</small><i>›</i></a>`).join('')}</div>
    </section>
    <div class="dash-grid">
      <section class="card todo">
        <div class="card-h"><h2>今天做什么</h2></div>
        ${tasks.length ? `<div class="tasks">${tasks.join('')}</div>`
          : '<p class="muted">暂无</p>'}
        ${guest ? '' : `<a class="mm-line" href="#/graph"><span>知识图谱</span><span class="mm-sum">${['strong', 'ok', 'weak'].map((k) => `<span><i class="kg-sw lv-${k}"></i>${LV[k]} <b>${count(k)}</b></span>`).join('')}</span><span class="muted small">›</span></a>`}
      </section>
      <section class="card recent">
        <div class="card-h"><h2>最近成绩</h2>${sessions.length ? `<a href="#/contest/${enc(dashFam)}/records">全部 ›</a>` : ''}</div>
        ${sessions.length ? `<div class="scores">${sessions.map((x) => `<a class="score-row" href="#/review/${x.id}">
          <span class="sr-t">${esc(x.title)}<small>${x.mode === 'exam' ? '模考' : '练习'} · ${fmtDate(x.submitted_at)}</small></span>
          <span class="sr-bar"><i style="width:${(x.score / x.total) * 100}%"></i></span><b>${x.score}<small>/${x.total}</small></b></a>`).join('')}</div>`
        : '<p class="muted">还没有成绩</p>'}
      </section>
    </div>
    ${me.has_phone || me.guest ? '' : `<a class="card bind-tip" href="${ACCOUNT_URL}"><span>还没绑定手机号</span><b>去绑定 ›</b></a>`}
  </main>`;
  document.getElementById('stu')?.addEventListener('change', (e) => { auth.setStudent(me.students.find((s) => s.id === e.target.value)); router(); });
}

// ───────── 考试列表 ─────────
// ───────── 一种考试：试卷 / 考情 / 成绩记录 ─────────
const GRADE = { 1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级', 7: '初一', 8: '初二' };
const contestGrade = store.get('math.grade', {}) || {}; // 分年级的考试：每种考试记住选的年级（存在浏览器里，下次打开还在）
const saveGrade = () => store.set('math.grade', contestGrade);
// 一种考试的试卷格子（分年级的先选年级）：考试页和数学首页共用。limit 只在首页用，多的给「全部」链接
function examGrid(f, allExams, fid, limit = 0) {
  const grades = f.grades ? [...new Set(allExams.map((e) => e.grade).filter(Boolean))].sort((a, b) => a - b) : [];
  if (grades.length && !grades.includes(contestGrade[fid])) contestGrade[fid] = grades[0];
  const exams = grades.length ? allExams.filter((e) => e.grade === contestGrade[fid]) : allExams;
  const shown = limit ? exams.slice(0, limit) : exams;
  // 分年级的考试：卷名去掉考试名和年级，大字只放「年份 场次」，其余（个人战 / 决赛 / 回忆版）放到下一行
  const label = (e) => {
    if (!f.grades) return { t: e.year || '', sub: '' };
    const s = e.title.replace(f.name, '').replace(GRADE[e.grade] || '', '').replace(/（(.+?)）/g, ' $1').replace(/\s+/g, ' ').trim();
    const m = s.match(/^(\d{4}\s*\S+)\s*(.*)$/);
    return m ? { t: m[1], sub: m[2].split(' ').filter(Boolean).join(' · ') } : { t: s, sub: '' };
  };
  const html = exams.length ? `${grades.length ? `<div class="ms-tabs grade-tabs">${grades.map((g) => `<button class="${g === contestGrade[fid] ? 'on' : ''}" data-grade="${g}">${GRADE[g] || g + ' 年级'}</button>`).join('')}</div>` : ''}<div class="exam-grid${f.grades ? ' long' : ''}">
      ${shown.map((e) => { const lb = label(e); return `<div class="exam-tile ${e.last_score !== null ? 'done' : ''}">
        <div class="et-top"><span class="et-year${f.grades ? ' cn' : ''}">${esc(lb.t)}</span>
          ${e.last_score !== null ? `<a class="et-score" href="#/review/${e.last_session}">${e.last_score}<small>/${e.problem_count}</small></a>` : '<span class="et-new">未做</span>'}</div>
        <div class="small muted">${lb.sub ? `${esc(lb.sub)} · ` : ''}${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟</div>
        <div class="et-btns">
          <button class="btn" data-start="${e.id}" data-mode="practice">练习</button>
          <button class="btn primary" data-start="${e.id}" data-mode="exam">模考</button>
        </div></div>`; }).join('')}
    </div>${limit && exams.length > limit ? `<a class="more-link" href="#/contest/${enc(fid)}">全部 ${exams.length} 套 ›</a>` : ''}` : '<div class="card"><p class="muted">这种考试的真题还在录入，很快上线。</p></div>';
  return { html, exams };
}
async function renderContest(fid, tab = 'exams') {
  dashFam = fid; store.set('math.fam', fid);
  const st = auth.student;
  const d = await api(`/math/api/families/${enc(fid)}?student=${st.id}`);
  const f = d.family;
  const TABS = [['exams', '试卷'], ['stats', '考情'], ['records', '成绩记录']];
  tab = TABS.some((t) => t[0] === tab) ? tab : 'exams';
  let body = '';
  const allExams = await apiList(`/math/api/exams?student=${st.id}&family=${enc(fid)}`);
  const { html: gridHtml, exams } = examGrid(f, allExams, fid);
  if (tab === 'exams') {
    body = gridHtml;
  } else if (tab === 'stats') {
    const S = d.stats;
    if (!S.exams) body = '<div class="card"><p class="muted">这种考试的真题还没有录入，暂时没有考情。</p></div>';
    else {
      const maxM = Math.max(...S.modules.map((m) => m.share), 1);
      const units = S.units.filter((u) => u.rate).sort((a, b) => b.share - a.share);
 body = `<div class="stats-grid"><div class="card"><h2>各大类占比</h2>
        
        <div class="mods">${S.modules.map((m) => `<div class="mrow"><span>${esc(m.name)}</span><span class="mbar"><i style="width:${(m.share / maxM) * 100}%"></i></span><span class="num">${m.share.toFixed(1)}%</span></div>`).join('')}</div></div>
      <div class="card"><h2>各知识项考情</h2>
        
        <table class="utable"><tr><th>知识项</th><th>占比</th><th>考过的年份</th><th>每届</th><th>常见题号</th></tr>
        ${units.map((u) => `<tr><td><a href="#/kp/${enc(u.id)}?family=${enc(fid)}">${esc(u.name)}</a></td><td class="num">${u.share}%</td><td class="num">${u.rate}%</td><td class="num">${u.per_exam} 题</td><td class="num">${u.from === u.to ? u.from : `${u.from}–${u.to}`}</td></tr>`).join('')}</table>
        ${S.units.some((u) => !u.rate) ? `<p class="small muted">没考过：${S.units.filter((u) => !u.rate).map((u) => esc(u.name)).join('、')}</p>` : ''}</div></div>`;
    }
  } else {
    body = `<div class="card">${d.sessions.length ? `<div class="scores">${d.sessions.map((x) => `<a class="score-row" href="#/review/${x.id}">
          <span class="sr-t">${esc(x.title)}<small>${x.mode === 'exam' ? '模考' : '练习'} · ${fmtDate(x.submitted_at)}</small></span>
          <span class="sr-bar"><i style="width:${(x.score / x.total) * 100}%"></i></span><b>${x.score}<small>/${x.total}</small></b></a>`).join('')}</div>` : '<p class="muted">还没有做过这种考试的卷子。</p>'}</div>`;
  }
  const done = exams.filter((e) => e.last_score !== null);
  const best = done.length ? Math.max(...done.map((e) => e.last_score)) : null;
  const avg = d.sessions.length ? (d.sessions.reduce((a, x) => a + x.score, 0) / d.sessions.length).toFixed(1) : null;
  $app.innerHTML = `${topnav()}<main class="page">
    <a href="#/" class="small">← 数学首页</a>
    <header class="ph"><div><h1>${esc(f.name)}</h1><p class="muted">${esc(f.desc)}</p></div>
      <dl class="ph-stats"><div><dt>真题</dt><dd>${exams.length}<small> 套</small></dd></div><div><dt>做过</dt><dd>${done.length}<small> 套</small></dd></div>
        <div><dt>最好成绩</dt><dd>${best ?? '—'}</dd></div><div><dt>平均分</dt><dd>${avg ?? '—'}</dd></div></dl></header>
    <div class="ctabs">${TABS.map(([k, n]) => `<a class="${k === tab ? 'on' : ''}" href="#/contest/${enc(fid)}${k === 'exams' ? '' : '/' + k}">${n}</a>`).join('')}</div>
    ${body}
  </main>`;
  $app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => showInstructions(exams.find((e) => e.id === b.dataset.start), b.dataset.mode)));
  $app.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => { contestGrade[fid] = +b.dataset.grade; saveGrade(); renderContest(fid, tab); }));
}

function showInstructions(exam, mode) {
  const mins = Math.round(exam.duration_sec / 60);
  modal(`<div class="instructions"><h2>${esc(exam.title)} · ${mode === 'exam' ? '模考' : '练习'}</h2>
    <ol>
      ${/^(hope|swb100)-/.test(exam.id) ? `<li>本卷共 ${exam.problem_count} 题。选择题点选一个选项；填空题填答案，分数写成 3/4；一空要填几个数时按顺序用逗号隔开。</li>
      <li>答对 1 题得 1 分，答错不扣分。</li>
      <li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>
      ${mode === 'practice' ? '<li>练习模式可以逐级查看提示（最多 3 级）。</li>' : ''}` : `<li>本卷共 ${exam.problem_count} 道选择题，每题有 A、B、C、D、E 五个选项，只有一个正确。</li>
      <li>答对 1 题得 1 分，答错不扣分，所以每题都值得作答。</li>
      <li>只允许使用草稿纸、笔、直尺和橡皮；不能用计算器、量角器、圆规或任何电子设备。</li>
      <li>图形不一定按比例绘制。</li>
      <li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>
      ${mode === 'practice' ? '<li>练习模式可以逐级查看提示（最多 3 级）。</li>' : ''}`}
    </ol></div>
    <div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="go">开始答题</button></div>`,
  (el, close) => {
    el.querySelector('#go').onclick = async () => {
      const r = await api('/math/api/sessions', { method: 'POST', body: { exam_id: exam.id, student_id: auth.student.id, mode } });
      close(); location.hash = `#/exam/${r.session.id}`;
    };
  });
}

// ───────── 考试界面（按 AMC 8 中国区线上考试操作手册“第八步”截图还原） ─────────
// 布局：顶栏（刷新 / 大字号 / 剩余时间 / 交卷）+ 左侧答题卡（进度、题号格、图例）+ 右侧一题一屏
async function renderExam(sid) {
  const data = await api(`/math/api/sessions/${sid}`);
  if (data.session.submitted) { location.hash = `#/review/${sid}`; return; }
  document.body.classList.add('exam-mode');
  // 希望数学：布局同 AMC 8，用 learn-inside 自己的风格
  const li = /^(hope|swb100)-/.test(data.exam.id || '') || (data.session.drill && !hasEn(data.problems));
  document.body.classList.toggle('exam-li', !!li);
  const key = `amc8.s.${sid}`;
  const S = Object.assign({ answers: {}, flags: {}, times: {}, hints: {}, cur: 0, big: false }, store.get(key, {}));
  const problems = data.problems;
  const clockOffset = data.session.server_now - Date.now();
  const practice = data.session.mode === 'practice';
  const en = hasEn(problems);
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
      const r = await api(`/math/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: h.problem_id, level: h.level } });
      list[h.level - 1] = r.content;
    }
  }

  function draw() {
    const p = problems[S.cur];
    const answered = problems.filter((x) => S.answers[x.id]).length;
    const hints = S.hints[p.id] || [];
    $app.innerHTML = `<div class="ez ${S.big ? 'big' : ''}">
      <header class="ez-top">
        <button class="ez-cardbtn" id="cardbtn">${icon('menu', 15)}答题卡</button>
        <span class="ez-user">${icon('account', 15)}${esc(auth.student?.nickname || '')}</span>
        <span class="ez-title">${esc(data.exam.title)}${practice ? '<span class="ez-mode">练习</span>' : ''}</span>
        <span class="ez-sp"></span>
        ${en ? langSeg() : ''}
        <button class="ez-tool" id="refresh" title="图片没显示完整时点一下">⟳ 刷新</button>
        <button class="ez-tool ${S.big ? 'on' : ''}" id="font">A<small>A</small> 大字号</button>
        <span class="ez-timer" id="timer">剩余时间 <b>--:--</b></span>
        <button class="ez-submit" id="submit">交卷</button>
      </header>
      <div class="ez-body">
        <aside class="ez-card ${cardOpen ? 'open' : ''}">
          <div class="ez-card-head"><b>答题卡</b><span class="muted">${icon('menu', 16)}</span></div>
          <div class="ez-progress"><div class="ez-prow"><span>进度</span><span>${answered}/${problems.length}</span></div>
            <div class="ez-pbar"><div style="width:${(answered / problems.length) * 100}%"></div></div></div>
          <div class="ez-grid">${problems.map((x, i) => `<button class="ez-cell ${S.answers[x.id] ? 'done' : ''} ${S.flags[x.id] ? 'flag' : ''} ${i === S.cur ? 'cur' : ''}" data-go="${i}">${x.number}</button>`).join('')}</div>
          <div class="ez-legend"><span><i class="lg done"></i>已答</span><span><i class="lg"></i>未答</span><span><i class="lg flag"></i>标记</span></div>
        </aside>
        <main class="ez-main">
          <div class="ez-q">
            <div class="ez-qhead"><span class="ez-qno">${li ? `第 ${p.number} 题<small>1 分</small>` : `${p.number}.(1分)`}${data.session.drill ? ` <span class="ez-src">${esc(p.label)}</span>` : ''}</span>
              <button class="ez-pin ${S.flags[p.id] ? 'on' : ''}" id="flag" title="标记这道题，稍后回来检查">${icon('flag', 14)}${S.flags[p.id] ? '已标记' : '标记'}</button></div>
            <div class="ez-stem">${stemHtml(p)}</div>
            ${p.figure ? `<div class="figure">${p.figure}</div>` : ''}
            ${isFillP(p) ? `<label class="ez-fill"><span>答</span><input id="fill" type="text" autocomplete="off" enterkeyhint="next" maxlength="40" value="${esc(S.answers[p.id] || '')}"></label>`
              : `<ul class="ez-opts ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="ez-opt ${S.answers[p.id] === k ? 'sel' : ''}" data-choice="${k}" role="radio" aria-checked="${S.answers[p.id] === k}"><span class="ez-letter">${k}</span><span class="ez-otext">${choiceHtml(p, k)}</span></li>`).join('')}</ul>`}
            <div class="ez-nav">
              <button class="ez-btn" id="prev" ${S.cur === 0 ? 'disabled' : ''}>上一题</button>
              <button class="ez-btn next" id="next" ${S.cur === problems.length - 1 ? 'disabled' : ''}>下一题</button>
              ${practice && p.hint_count ? `<button class="ez-btn hint" id="hint" ${hints.length >= p.hint_count ? 'disabled' : ''}>${icon('bulb', 15)}提示 ${hints.length}/${p.hint_count}</button>` : ''}
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
    const fill = $app.querySelector('#fill');
    if (fill) {
      // 只更新答题卡，不重画（重画会打断输入）
      const mark = () => { const v = fill.value.trim(); if (v) S.answers[p.id] = v; else delete S.answers[p.id]; save();
        const n = problems.filter((x) => S.answers[x.id]).length;
        $app.querySelector(`[data-go="${S.cur}"]`)?.classList.toggle('done', !!v);
        $app.querySelector('.ez-prow span:last-child').textContent = `${n}/${problems.length}`;
        $app.querySelector('.ez-pbar div').style.width = `${(n / problems.length) * 100}%`; };
      fill.addEventListener('input', mark);
      fill.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(S.cur + 1); } });
      if (matchMedia('(pointer:fine)').matches) fill.focus();
    }
    $app.querySelector('#prev').onclick = () => go(S.cur - 1);
    $app.querySelector('#next').onclick = () => go(S.cur + 1);
    $app.querySelector('#flag').onclick = () => { S.flags[p.id] ? delete S.flags[p.id] : (S.flags[p.id] = true); save(); draw(); };
    $app.querySelector('#refresh').onclick = () => { flushTime(); save(); location.reload(); };
    $app.querySelector('#font').onclick = () => { S.big = !S.big; save(); draw(); };
    onLang($app, draw);
    $app.querySelector('#cardbtn').onclick = () => { cardOpen = !cardOpen; draw(); };
    $app.querySelector('#mask')?.addEventListener('click', () => { cardOpen = false; draw(); });
    $app.querySelector('#submit').onclick = confirmSubmit;
    const hb = $app.querySelector('#hint');
    if (hb) hb.onclick = async () => {
      const level = hints.length + 1;
      const r = await api(`/math/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: p.id, level } });
      (S.hints[p.id] || (S.hints[p.id] = []))[level - 1] = r.content; save(); draw();
    };
  }

  function confirmSubmit() {
    const un = problems.filter((x) => !S.answers[x.id]);
    const fl = problems.filter((x) => S.flags[x.id]);
    modal(`<h2>确认交卷？</h2>
      <p>已答 <b>${problems.length - un.length}</b> 题，未答 <b style="color:var(--bad)">${un.length}</b> 题，标记 <b style="color:var(--flag)">${fl.length}</b> 题。</p>
      ${un.length ? `<p class="small muted">未答：${un.map((x) => x.number).join('、')}。答错不扣分，空着的题建议也作答。</p>` : ''}
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
    const cp = problems[S.cur];
    if (k.length === 1 && !isFillP(cp) && Object.prototype.hasOwnProperty.call(cp.choices, k)) { S.answers[cp.id] = k; save(); draw(); }
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
      await api(`/math/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times, flags: S.flags } });
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
  const r = await api(`/math/api/sessions/${sid}/review`);
  if (!lastMe) try { lastMe = await api('/math/api/me'); } catch {}
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const wrong = r.items.filter((i) => !i.correct);
  const en = hasEn(r.items);
  $app.innerHTML = `${topnav()}<main class="page">
    <header class="ph"><div><h1>${esc(r.exam.title)}</h1><p class="muted">${r.session.mode === 'exam' ? '模考' : '练习'} · ${fmtDate(r.session.submitted_at)}</p></div>
      ${en ? `<div class="row">${langSeg()}</div>` : ''}</header>
    <div class="cols rev"><aside class="col-side rev-side"><div class="card">
      <div class="rev-score"><b>${r.session.score}</b><span>/ ${r.total}</span></div>
      <dl class="rev-meta"><div><dt>用时</dt><dd>${fmtTime(used)} <small>/ ${fmtTime(r.exam.duration_sec)}</small></dd></div><div><dt>错 / 空</dt><dd>${wrong.filter((i) => i.choice !== null).length} / ${wrong.filter((i) => i.choice === null).length}</dd></div></dl>
      <div class="qgrid">${r.items.map((it) => `<a href="javascript:" data-jump="${it.number}" class="${it.correct ? 'right' : it.choice === null ? 'blank' : 'wrong'}">${it.number}</a>`).join('')}</div>
      ${wrong.length && lastMe?.guest ? `<a class="gift-link" href="#/account">${GIFT()}</a>` : ''}
      <div class="rev-btns">${isGuest() ? '<a class="btn primary" href="#/account">免费注册</a><a class="btn" href="#/">再做一套</a>' : '<a class="btn primary" href="#/mistakes">去错题本订正</a><a class="btn" href="#/graph">看知识图谱</a>'}</div>
    </div></aside>
    <div class="col-main">${r.items.map(itemView).join('')}</div></div>
  </main>`;
  $app.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = () => { const d = document.getElementById('q' + a.dataset.jump); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  typeset($app);

  function itemView(it) {
    const cls = it.choice === null ? 'blank' : it.correct ? 'right' : 'wrong';
    return `<details class="ritem ${cls}" id="q${it.number}" ${it.correct ? '' : 'open'}>
      <summary><span class="mark">${it.correct ? '✓' : it.choice === null ? '–' : '✗'}</span>
        <b>${qLabel(it.number, en)}</b>${r.session.mode !== 'exam' && r.exam.id === 'drill' ? `<span class="muted small">${esc(it.label)}</span>` : ''}
        <span class="muted small">${it.choice === null ? '未作答' : `你的答案 ${esc(it.choice)}`}${it.correct ? '' : ` · 正确答案 ${esc(it.answer)}`}</span>
        <span class="meta">${fmtTime(it.time_sec)}${it.hints_used ? ` · 提示 ${it.hints_used} 级` : ''}${it.flagged ? ' · 已标记' : ''}</span></summary>
      <div class="body">
        <div class="stem">${stemHtml(it)}${it.figure ? `<div class="figure">${it.figure}</div>` : ''}</div>
        ${isFillP(it) ? fillResult(it.choice, it.answer, it.correct) : `<ul class="choices ${figChoices(it) ? 'figs' : ''}">${Object.keys(it.choices).map((k) => `<li class="choice ${k === it.answer ? 'correct' : k === it.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(it, k)}</span></li>`).join('')}</ul>`}
        ${it.correct || isGuest() ? '' : `<div class="section-label">错因</div><div class="reason-chips row" data-attempt="${it.attempt_id}">
          ${REASONS.map(([k, label]) => `<button data-reason="${k}" class="${it.error_reason === k ? 'on' : ''}">${label}</button>`).join('')}</div>`}
        ${it.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(it.basic)}</div>` : ''}
        ${it.advanced ? `<div style="margin-top:14px"><button class="btn primary" data-adv="${it.problem_id}">${icon('play', 14)}互动解析${it.advanced.locked ? `${icon('lock', 15)}` : ''}</button></div>` : ''}
        <div class="section-label">考点</div>
        ${typeChips(it.types)}
        ${kpCards(it.kps)}
      </div></details>`;
  }

  $app.querySelectorAll('.reason-chips button').forEach((b) => (b.onclick = async () => {
    const box = b.parentElement;
    const on = b.classList.contains('on');
    await api(`/math/api/attempts/${box.dataset.attempt}`, { method: 'PATCH', body: { error_reason: on ? null : b.dataset.reason } });
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', !on && x === b));
  }));
  bindKpCards($app);
  $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv)));
  onLang($app, router);
}
/** 填空题的作答结果 */
const fillResult = (mine, ans, ok) => `<div class="fill-res"><div class="${ok ? 'ok' : mine === null ? '' : 'bad'}"><span>你的答案</span><b>${mine === null ? '未作答' : esc(mine)}</b></div>${ok ? '' : `<div class="ok"><span>正确答案</span><b>${esc(ans)}</b></div>`}</div>`;

// 题型：一道题属于哪几个题型（主题型加粗）
const typeChips = (types) => (types?.length ? `<div class="type-chips"><span class="small muted">题型：</span>${types.map((t) => `<span class="tag ${t.w >= 1 ? 'main' : ''}">${esc(t.name)}</span>`).join('')}</div>` : '');

// ───────── 考点卡：识别信号（免费）+ 知识项 / 真题突击（会员） ─────────
const enc = encodeURIComponent;
function kpCards(kps) {
  if (!kps?.length) return '';
  const main = kps.filter((k) => k.primary);
  const rest = kps.filter((k) => !k.primary);
  const shown = main.length ? main : kps.slice(0, 1);
  const g = isGuest(); // 游客：知识项照常显示，但不进知识项页、不能突击
  return `<div class="kpcards">${shown.map((k) => `<div class="kpcard">
      <div class="kphead">${g ? `<b>${esc(k.name)}</b>` : `<a href="#/kp/${enc(k.id)}"><b>${esc(k.name)}</b></a>`}${k.amc_ext ? '<span class="tag ext">AMC 扩展</span>' : ''}</div>
      ${k.signals?.length ? `<div class="sig-title">怎么认出这个考点</div><ul class="signals">${k.signals.map((s) => `<li><span class="see">看到：${rich(s.see)}</span><span class="think">想到：${rich(s.think)}</span></li>`).join('')}</ul>` : (k.summary ? `<p class="small">${rich(k.summary)}</p>` : '')}
      ${g ? '<p class="small muted">注册后可以看这个知识项的相关真题、做真题突击。</p>' : `<div class="kpbtns"><a class="btn" href="#/kp/${enc(k.id)}">看相关真题</a><button class="btn" data-drill="${esc(k.id)}">真题突击${k.locked ? `${icon('lock', 15)}` : ''}</button></div>`}
    </div>`).join('')}
    ${rest.length ? `<div class="small muted kpalso">也用到：${rest.map((k) => (g ? esc(k.name) : `<a href="#/kp/${enc(k.id)}">${esc(k.name)}</a>`)).join('、')}</div>` : ''}</div>`;
}
function bindKpCards(root) {
  root.querySelectorAll('[data-drill]').forEach((b) => (b.onclick = () => startDrill(b.dataset.drill)));
}
async function startDrill(kpId) {
  const r = await api('/math/api/sessions', { method: 'POST', body: { kp_id: kpId, student_id: auth.student.id } });
  if (r.status === 402) return askUnlock(r.item, '知识项突击', r.credits, () => startDrill(kpId));
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
  const r = await api(`/math/api/problems/${problemId}/advanced`);
  if (r.locked) return askUnlock(r.item, '互动解析', r.credits, () => openAdvanced(problemId));
  if (r.url) { window.open(r.url, '_blank'); return; }
  openLesson({ title: '互动解析', ...r.lesson });
}

const lockedPanel = (title) => `<div class="locked-panel"><div class="icon">${icon('lock', 36)}</div><p><b>${esc(title)}</b></p>
  <p class="small">开通会员后可以查看。</p><div class="actions" style="justify-content:center"><button class="btn" data-close>知道了</button></div></div>`;


// ───────── 考情：历年真题里的出现率、题量、题号 ─────────
const bandName = (st) => { const b = st.bands; const m = Math.max(b.easy, b.mid, b.hard); return m === b.easy ? '前段基础题' : m === b.mid ? '中段' : '后段难题'; };
function statCard(st, years, famName = 'AMC 8') {
  if (!st) return '';
  const max = Math.max(...st.per_num, 1);
  const nq = st.per_num.length, c1 = Math.round(nq * 0.4), c2 = Math.round(nq * 0.8); // 和后端的分段一致（AMC 8：10 / 20 / 25）
  const cell = (n, i) => `<i style="--a:${n ? 0.18 + 0.82 * n / max : 0}" title="第 ${i + 1} 题：${n} 次"></i>`;
  return `<div class="card"><h2>考情分析</h2>
    
    <div class="st-tiles">
      <div><span class="big">${st.rate}%</span><span class="small muted">出现率<br>${st.years_hit}/${years.length} 届考过 · 近 ${st.recent_n} 届 ${st.recent_hit} 届</span></div>
      <div><span class="big">${st.per_exam}</span><span class="small muted">平均每届几题<br>累计 ${st.total} 题</span></div>
      <div><span class="big">${st.from === st.to ? st.from : `${st.from}–${st.to}`}</span><span class="small muted">一般是第几题<br>一半落在这里 · 中位第 ${st.median} 题</span></div>
    </div>
    <div class="section-label">题号分布（颜色越深考得越多）</div>
    <div class="st-strip" style="grid-template-columns:repeat(${nq},1fr)">${st.per_num.map(cell).join('')}</div>
    <div class="st-axis" style="grid-template-columns:repeat(${nq},1fr)">${[1, ...[5, 10, 15, 20, 25, 30, 35, 40, 45, 50].filter((n) => n <= nq)].map((n) => `<span style="grid-column:${n}">${n}</span>`).join('')}</div>
    <div class="st-bands small"><span>第 1–${c1} 题（基础）<b>${st.bands.easy}%</b></span><span>${c1 + 1}–${c2}（中档）<b>${st.bands.mid}%</b></span><span>${c2 + 1}–${nq}（难题）<b>${st.bands.hard}%</b></span></div>
    <div class="section-label">每年考了几题${years.includes(2020) && years.includes(2022) && !years.includes(2021) ? '<span class="small muted">（2021 年停办）</span>' : ''}</div>
    <div class="st-years">${years.map((y) => `<span class="${st.per_year[y] ? 'on' : ''}" title="${y}：${st.per_year[y] || 0} 题"><b>${st.per_year[y] || ''}</b><small>${String(y).slice(2)}</small></span>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">${st.rate >= 80 ? '几乎每年必考，' : st.rate >= 50 ? '经常考，' : '不是每年都考，'}多出现在${bandName(st)}。</p>
  </div>`;
}

// ───────── 个人知识图谱 ─────────
let graphView = 'map';
const LVN = { strong: '掌握较好', ok: '基本掌握', weak: '薄弱', insufficient: '数据不足', none: '还没做过' };
const LVO = { weak: 0, insufficient: 1, ok: 2, strong: 3, none: 4 };
function graphList(d, MODN) {
  const lv = (n) => n.mastery?.level || 'none';
  const by = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
  const pre = {};
  d.edges.forEach(([a, b]) => (pre[b] ||= []).push(a));
  const nodes = [...d.nodes].sort((a, b) => LVO[lv(a)] - LVO[lv(b)] || (a.mastery?.score ?? 999) - (b.mastery?.score ?? 999) || (b.wrong?.todo || 0) - (a.wrong?.todo || 0));
  document.getElementById('kg').innerHTML = `<div class="card"><div class="plist">${nodes.map((n) => {
    const wp = (pre[n.id] || []).map((id) => by[id]).filter((x) => x && lv(x) === 'weak');
    return `<a class="prow kl-row" href="#/graph/${enc(n.id)}" data-gomap>
      <span class="kg-sw lv-${lv(n)}"></span>
      <span class="ms-main"><span>${esc(n.name)} <span class="small muted">${esc(MODN[n.module] || '')}</span></span>
        <span class="small muted">${LVN[lv(n)]}${n.mastery && lv(n) !== 'insufficient' ? ` · ${n.mastery.score} 分` : ''}${n.mastery ? ` · 证据 ${n.mastery.evidence}` : ''}${wp.length ? ` · <span class="kl-warn">前置 ${wp.map((x) => esc(x.name)).join('、')} 也薄弱</span>` : ''}</span></span>
      ${n.wrong?.todo ? `<span class="tag ms-st">错题 ${n.wrong.todo}</span>` : n.wrong?.total ? `<span class="tag">错过 ${n.wrong.total}</span>` : ''}
      <span class="go">›</span></a>`; }).join('')}</div></div>`;
  document.querySelectorAll('[data-gomap]').forEach((a) => a.addEventListener('click', () => { graphView = 'map'; }));
}
// 掌握地图：按模块列出所有知识项，颜色是掌握程度，角标是待订正的错题数（知识图谱页最上面）
function masteryMap(g) {
  const lv = (n) => n.mastery?.level || 'none';
  const count = (k) => g.nodes.filter((n) => lv(n) === k).length;
  return `<section class="card mm">
    <div class="card-h"><h2>掌握地图</h2></div>
    <div class="mm-sum">${['strong', 'ok', 'weak', 'insufficient', 'none'].map((k) => `<span><i class="kg-sw lv-${k}"></i>${LV[k]} <b>${count(k)}</b></span>`).join('')}</div>
    <div class="mm-rows">${g.modules.map((m) => `<div class="mm-row"><span class="mm-mod">${esc(m.name)}</span><div class="mm-tiles">
      ${g.nodes.filter((n) => n.module === m.id).map((n) => `<a class="mm-tile lv-${lv(n)}" href="#/graph/${enc(n.id)}" title="${esc(n.name)}：${LV[lv(n)]}">${esc(n.name)}${n.wrong?.todo ? `<i>${n.wrong.todo}</i>` : ''}</a>`).join('')}
    </div></div>`).join('')}</div>
  </section>`;
}
async function renderGraphPage(focusId) {
  if ((await ensureMe())?.guest) return regWall('知识图谱');
  const d = await api(`/math/api/students/${auth.student.id}/graph`);
  const MODN = Object.fromEntries(d.modules.map((m) => [m.id, m.name]));
  $app.innerHTML = `${topnav()}<div class="page wide">
    <header class="ph"><div><h1>${esc(d.student.nickname)}的知识图谱</h1></div></header>
    ${masteryMap(d)}
    <div class="ctabs"><a class="${graphView === 'map' ? 'on' : ''}" data-view="map">图</a><a class="${graphView === 'list' ? 'on' : ''}" data-view="list">列表（薄弱在前）</a></div>
    <div id="kg"></div></div>`;
  $app.querySelectorAll('[data-view]').forEach((a) => (a.onclick = () => { graphView = a.dataset.view; renderGraphPage(focusId); }));
  if (graphView === 'list') return graphList(d, MODN);
  const chip = (n, LEVEL, lv) => `<button class="kg-chip lv-${lv(n)}" data-focus="${n.id}">${esc(n.name)}<small>${LEVEL[lv(n)]}</small></button>`;
  const g = mountGraph(document.getElementById('kg'), d, {
    focus: focusId ? decodeURIComponent(focusId) : null,
    onFocus: (id) => history.replaceState(null, '', `#/graph/${encodeURIComponent(id)}`),
    empty: '<h2>点一个知识项</h2>',
    panel: (n, c) => {
      const m = n.mastery;
      const weakPre = c.pre.map((id) => c.byId[id]).filter((x) => x.mastery?.level === 'weak');
      const ST = { pending: '待订正', due: '该复习', fixed: '已订正', mastered: '已掌握' };
      const fam = {};
      (n.wrong?.list || []).forEach((x) => (fam[x.family] ||= []).push(x));
      const wrongHtml = Object.keys(fam).length ? Object.entries(fam).map(([f, list]) => `<div class="kg-fam"><div class="label">${esc(f)} · 错过 ${list.length} 题</div>
          <div class="plist">${list.map((x) => `<a class="prow ms-${x.status}" href="#/problem/${encodeURIComponent(x.problem_id)}"><span class="ms-dot"></span>
            <span class="ms-main"><span>${esc(x.label)}</span>${x.types?.length ? `<span class="small muted">${x.types.map(esc).join('、')}</span>` : ''}</span>
            <span class="tag ms-st">${ST[x.status]}</span></a>`).join('')}</div></div>`).join('')
        : '<p class="small muted">这个知识项还没有错题。</p>';
      return `<div class="small muted">${esc(MODN[n.module] || '')}${n.ext ? ' · 超出小奥' : ''}</div>
        <h2>${esc(n.name)}</h2>
        <div class="kg-stat"><span class="kg-sw lv-${c.lv(n)}"></span><b>${c.LEVEL[c.lv(n)]}</b>${m ? ` <span class="muted small">${m.score} 分 · 证据 ${m.evidence}</span>` : ''}</div>
        ${weakPre.length ? `<p class="kg-warn">它的前置里 ${weakPre.map((x) => `<b>${esc(x.name)}</b>`).join('、')} 也薄弱，建议先补前置。</p>` : ''}
        <div class="label">上游（前置）</div><div class="kg-chips">${c.pre.map((id) => chip(c.byId[id], c.LEVEL, c.lv)).join('') || '<span class="small muted">无，是入门知识项</span>'}</div>
        <div class="label">下游（后续）</div><div class="kg-chips">${c.next.map((id) => chip(c.byId[id], c.LEVEL, c.lv)).join('') || '<span class="small muted">无</span>'}</div>
        <div class="label">错过的题</div>${wrongHtml}
        <div class="kg-actions"><a class="btn primary" href="#/kp/${encodeURIComponent(n.id)}">看知识项详情</a>${n.wrong?.todo ? `<a class="btn" href="#/mistakes" data-mskp="${esc(n.id)}">去错题本订正（${n.wrong.todo}）</a>` : ''}</div>`;
    },
  });
  cleanup = () => g.destroy();
}

// ───────── 知识项 ─────────
async function renderKp(id) {
  if ((await ensureMe())?.guest) return regWall('知识项');
  const fq = (location.hash.split('?')[1] || '').match(/family=([\w-]+)/);
  const k = await api(`/math/api/kp/${enc(id)}?student=${auth.student.id}${fq ? `&family=${fq[1]}` : ''}`);
  const fam = k.families.find((f) => f.id === k.family) || { name: k.family };
  const MSN = { pending: '待订正', due: '该复习', fixed: '已订正', mastered: '已掌握' };
  const mine = {};
  (k.my_mistakes || []).forEach((x) => (mine[x.family] ||= []).push(x));
  const ST = { right: ['✓', '做对了'], wrong: ['✗', '做错了'], todo: ['○', '还没做'] };
  $app.innerHTML = `${topnav()}<main class="page">
    <a href="javascript:history.back()" class="small">← 返回</a>
    <header class="ph"><div><h1>${esc(k.name)} ${k.amc_ext ? '<span class="tag ext">AMC 扩展</span>' : ''}</h1></div></header>
    <div class="cols"><div class="col-main">
    <div class="card">
      <p>${rich(k.summary || '')}</p>
      ${k.mastery ? `<p class="small muted">当前掌握度：<b>${k.mastery.label}</b>（${k.mastery.score}）</p>` : ''}
      <p><a class="btn" href="#/graph/${enc(k.id)}">在知识图谱里看它的上下游 ›</a></p>
    </div>
    ${Object.keys(mine).length ? `<div class="card"><h2>我在这里错过的题</h2>${Object.entries(mine).map(([f, list]) => `<div class="label">${esc(f)} · ${list.length} 题</div>
      <div class="plist">${list.map((x) => `<a class="prow ms-${x.status}" href="#/problem/${enc(x.problem_id)}"><span class="ms-dot"></span><span class="ms-main"><span>${esc(x.label)}</span>${x.types?.length ? `<span class="small muted">${x.types.map(esc).join('、')}</span>` : ''}</span><span class="tag ms-st">${MSN[x.status]}</span></a>`).join('')}</div>`).join('')}
      ${(k.my_mistakes || []).some(isTodo) ? `<p style="margin-top:10px"><a class="btn" href="#/mistakes" data-mskp="${esc(k.id)}">去错题本订正</a></p>` : ''}</div>` : ''}
    ${k.signals.length ? `<div class="card"><h2>怎么认出这个知识项</h2><ul class="signals">${k.signals.map((s) => `<li><span class="see">看到：${rich(s.see)}</span><span class="think">想到：${rich(s.think)}</span></li>`).join('')}</ul></div>` : ''}
    ${k.problems.length ? `<div class="card"><h2>相关真题 <span class="small muted">${k.problems.length} 题</span></h2><div class="plist kp-plist">${k.problems.map((p, i) => `<a class="prow st-${p.status}" href="#/problem/${enc(p.id)}">
        <span class="pst" title="${ST[p.status][1]}">${ST[p.status][0]}</span><span>${esc(p.label)}</span>${p.weight >= 1 ? '<span class="tag">主考点</span>' : ''}<span class="go">›</span></a>`).join('')}</div>${k.problems.length > 12 ? `<button class="btn" style="margin-top:8px" id="kp-more">显示全部 ${k.problems.length} 题</button>` : ''}</div>` : ''}
    </div><aside class="col-side">
    <div class="card feature"><div><h2>真题突击 <span class="tag">会员</span></h2>
      <p class="small muted">${k.drill.count ? `${k.drill.count} 道真题` : '还没有考这个知识项的真题。'}</p></div>
      ${k.drill.count ? `<button class="btn primary" data-drill="${esc(k.id)}">${k.drill.locked ? `${icon('lock', 15)}` : ''}开始突击</button>${k.drill.sample ? '<span class="small muted">免费体验</span>' : ''}` : ''}</div>
    <div class="ctabs">${k.families.map((f) => `<a class="${f.id === k.family ? 'on' : ''}" href="#/kp/${enc(k.id)}?family=${f.id}">${esc(f.name)} 考情</a>`).join('')}</div>
    ${k.stats ? statCard(k.stats, k.exam_years || [], fam.name) : `<div class="card"><p class="muted small">${(k.exam_years || []).length ? `已收录的 ${k.exam_years.length} 届 ${esc(fam.name)} 真题里没有考过这个知识项。` : `${esc(fam.name)} 的真题还没有录入，暂时没有考情。`}</p></div>`}
    ${k.types?.length ? `<div class="card"><h2>题型</h2><div class="plist">${k.types.map((t) => { const s = k.type_stats?.[t.id];
        return `<div class="prow"><span>${esc(t.name)}</span><span class="tmeta num">${s ? `${s.total} 次 · ${s.rate}% 年份` : '未考'}</span></div>`; }).join('')}</div></div>` : ''}
    </aside></div>
  </main>`;
  typeset($app);
  bindKpCards($app);
  const more = $app.querySelector('#kp-more');
  if (more) { const list = $app.querySelector('.kp-plist'); list.classList.add('clip'); more.onclick = () => { list.classList.remove('clip'); more.remove(); }; }
}

// ───────── 单题页（从知识项页「相关真题」进入） ─────────
async function renderProblem(id) {
  await ensureMe();
  const p = await api(`/math/api/problems/${enc(id)}?student=${auth.student.id}`);
  const done = p.attempted;
  $app.innerHTML = `${topnav()}<main class="page">
    <a href="javascript:history.back()" class="small">← 返回</a>
    <header class="ph"><div><h1>${esc(p.label)}</h1></div>${p.stem_zh ? langSeg() : ''}</header>
    <div class="cols half"><div class="card">
      <div class="stem">${stemHtml(p)}${p.figure ? `<div class="figure">${p.figure}</div>` : ''}</div>
      ${isFillP(p) ? (done ? fillResult(p.last.choice, p.answer, p.last.correct) : '') : `<ul class="choices ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="choice ${done && k === p.answer ? 'correct' : done && k === p.last.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(p, k)}</span></li>`).join('')}</ul>`}
    </div>
    ${done ? `<div class="card">
        <p>${p.last.correct ? '✓ 上次做对了' : `✗ 上次${p.last.choice ? `${isFillP(p) ? '填了' : '选了'} ${esc(p.last.choice)}` : '没作答'}，正确答案 <b>${esc(p.answer)}</b>`}</p>
        ${p.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(p.basic)}</div>` : ''}
        ${p.advanced ? `<div style="margin-top:14px"><button class="btn primary" data-adv="${esc(p.problem_id)}">${icon('play', 14)}互动解析${p.advanced.locked ? `${icon('lock', 15)}` : ''}</button></div>` : ''}
        <div class="section-label">考点</div>${typeChips(p.types)}${kpCards(p.kps)}
        <div class="row" style="margin-top:14px"><button class="btn" id="try">再做一次</button></div>
      </div>` : `<div class="card feature"><div><h2>还没做过这道题</h2></div><button class="btn primary" id="try">做这道题</button></div>`}
  </div></main>`;
  typeset($app);
  bindKpCards($app);
  $app.querySelector('[data-adv]')?.addEventListener('click', (e) => openAdvanced(e.currentTarget.dataset.adv));
  onLang($app, router);
  $app.querySelector('#try').onclick = async () => {
    if (isGuest()) return modal(`<h2>注册后可以单题练习</h2>${REG_FEATS}<div class="actions"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/account">免费注册</a></div>`);
    const r = await api('/math/api/sessions', { method: 'POST', body: { problem_ids: [p.problem_id], student_id: auth.student.id } });
    location.hash = `#/exam/${r.session.id}`;
  };
}

// ───────── 错题本：收集做错的题，订正 → 隔一周再做一次 → 掌握 ─────────
const MS = {
  pending: ['待订正', '最近一次还是错的，先看解析再重做'],
  due: ['该复习', '订正过一次，已经过了一周，再做一遍巩固'],
  fixed: ['已订正', '订正对了，一周后提醒复习'],
  mastered: ['已掌握', '错过之后又连续做对两次'],
};
const BATCH = 10;
const days = (t) => Math.max(1, Math.ceil((t - Date.now()) / 86400000));
const prim = (m) => (m.kps.some((k) => k.primary) ? m.kps.filter((k) => k.primary) : m.kps.slice(0, 1));
const isTodo = (m) => m.status === 'pending' || m.status === 'due';
function msRow(m, reasonName) {
  return `<a class="prow ms-row ms-${m.status}" href="#/problem/${encodeURIComponent(m.problem_id)}">
        <span class="ms-dot" title="${MS[m.status][1]}"></span>
        <span class="ms-main"><span>${esc(m.label)}</span>
          <span class="small muted">${(m.types?.length ? m.types : prim(m).map((k) => k.name)).map(esc).join('、')} · 错 ${m.wrong_n} 次 · ${fmtDate(m.last_wrong_at)}</span></span>
        <span class="ms-tags">${m.reason ? `<span class="tag">${reasonName[m.reason]}</span>` : m.last_choice === null ? '<span class="tag">未作答</span>' : ''}
          <span class="tag ms-st">${MS[m.status][0]}${m.status === 'fixed' ? ` · ${days(m.review_at)} 天后复习` : ''}</span></span>
        <span class="go">›</span></a>`;
}
/** 开一场错题练习：从最早错的开始，每次最多 BATCH 题 */
async function startMistakes(items, purpose, btn) {
  const ids = [...items].sort((a, c) => a.last_wrong_at - c.last_wrong_at).slice(0, BATCH).map((m) => m.problem_id);
  btn.disabled = true;
  try {
    const r = await api('/math/api/sessions', { method: 'POST', body: { problem_ids: ids, student_id: auth.student.id, purpose } });
    location.hash = `#/exam/${r.session.id}`;
  } catch (e) { btn.disabled = false; modal(`<h2>没能开始</h2><p>${esc(e.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
}

let msFilter = 'todo', msMore = false, msFam = '', msKp = '', msCtx = null;
async function renderMistakes() {
  if ((await ensureMe())?.guest) return regWall('错题本');
  const d = await api(`/math/api/students/${auth.student.id}/profile`);
  const RN = Object.fromEntries(REASONS);
  const all = d.mistakes;
  const fams = await apiList(`/math/api/families?student=${auth.student.id}`);
  msCtx = { all, nickname: d.student.nickname, fam: () => fams.find((f) => f.id === msFam)?.name || '', kp: () => '' };
  const famOf = (pid) => fams.find((f) => pid.startsWith(f.id + '-'));
  const kps = {};
  all.forEach((m) => prim(m).forEach((k) => { (kps[k.id] ||= { id: k.id, name: k.name, n: 0 }).n++; }));
  msCtx.kp = () => kps[msKp]?.name || '';
  const draw = () => {
    const list = all.filter((m) => (!msFam || famOf(m.problem_id)?.id === msFam) && (!msKp || prim(m).some((k) => k.id === msKp)));
    const rs = (d.error_reasons || []).filter((r) => r.n);
    const rsum = rs.reduce((a, r) => a + r.n, 0);
    $app.innerHTML = `${topnav()}<main class="page">
      <header class="ph"><div><h1>${esc(d.student.nickname)}的错题本</h1>
        <p class="muted">共 ${all.length} 道 · 待订正 ${all.filter((m) => m.status === 'pending').length} · 该复习 ${all.filter((m) => m.status === 'due').length} · 已掌握 ${all.filter((m) => m.status === 'mastered').length}</p></div></header>
      <div class="cols"><div class="col-main">${mistakeCard(list, RN)}</div><aside class="col-side">
      ${all.length ? `<div class="card ms-filters"><h2>筛选</h2>
        <label>考试 <select id="f-fam"><option value="">全部</option>${fams.filter((f) => all.some((m) => famOf(m.problem_id) === f)).map((f) => `<option value="${f.id}" ${msFam === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        <label>知识项 <select id="f-kp"><option value="">全部</option>${Object.values(kps).sort((a, b) => b.n - a.n).map((k) => `<option value="${k.id}" ${msKp === k.id ? 'selected' : ''}>${esc(k.name)}（${k.n}）</option>`).join('')}</select></label>
        ${msKp ? `<a class="small" href="#/graph/${enc(msKp)}">在图谱里看这个知识项 ›</a>` : ''}
      </div>` : ''}
      ${rsum ? `<div class="card"><h2>错因</h2>
        <div class="mods">${rs.sort((a, b) => b.n - a.n).map((r) => `<div class="mrow"><span>${r.error_reason ? RN[r.error_reason] : '没标'}</span><span class="mbar"><i style="width:${(r.n / rsum) * 100}%"></i></span><span class="num">${r.n} 题</span></div>`).join('')}</div></div>` : ''}
    </aside></div></main>`;
    bindMistakes(list);
    $app.querySelector('#f-fam')?.addEventListener('change', (e) => { msFam = e.target.value; msMore = false; draw(); });
    $app.querySelector('#f-kp')?.addEventListener('change', (e) => { msKp = e.target.value; msMore = false; draw(); });
  };
  draw();
}
const SHOW = 15;
function mistakeCard(list, reasonName) {
  if (!list.length) return `<div class="card" id="mistakes"><p class="muted small">${msFam || msKp ? '这个筛选下没有错题。' : '还没有错题。'}</p></div>`;
  const n = (st) => list.filter((m) => m.status === st).length;
  const todo = list.filter(isTodo);
  const tabs = [['todo', `要做的 ${todo.length}`], ['pending', `待订正 ${n('pending')}`], ['due', `该复习 ${n('due')}`], ['fixed', `已订正 ${n('fixed')}`], ['mastered', `已掌握 ${n('mastered')}`], ['all', `全部 ${list.length}`]];
  const shown = msFilter === 'all' ? list : msFilter === 'todo' ? todo : list.filter((m) => m.status === msFilter);
  return `<div class="card" id="mistakes">
    
    <div class="ms-actions">
      ${n('pending') ? `<button class="btn primary" data-ms-go="pending">订正错题（${Math.min(n('pending'), BATCH)} 题）</button>` : ''}
      ${n('due') ? `<button class="btn primary" data-ms-go="due">复习到期的错题（${Math.min(n('due'), BATCH)} 题）</button>` : ''}
      ${!todo.length ? '<span class="small muted">现在没有要做的错题</span>' : ''}
      <button class="btn" data-ms-print aria-expanded="${prOpen}" style="margin-left:auto">${icon('print', 15)}打印错题</button>
    </div>
    ${prOpen ? printPanel(shown) : ''}
    <div class="ms-tabs">${tabs.map(([k, label]) => `<button class="${msFilter === k ? 'on' : ''}" data-ms-tab="${k}">${label}</button>`).join('')}</div>
    <div class="plist">${(msMore ? shown : shown.slice(0, SHOW)).map((m) => msRow(m, reasonName)).join('') || '<p class="muted small">这一类没有题。</p>'}</div>
    ${!msMore && shown.length > SHOW ? `<button class="btn" style="margin-top:8px" data-ms-more>再显示 ${shown.length - SHOW} 题</button>` : ''}
  </div>`;
}
function bindMistakes(list) {
  const box = $app.querySelector('#mistakes');
  if (!box) return;
  const redraw = () => { box.outerHTML = mistakeCard(list, Object.fromEntries(REASONS)); bindMistakes(list); };
  box.querySelectorAll('[data-ms-tab]').forEach((b) => (b.onclick = () => { msFilter = b.dataset.msTab; msMore = false; redraw(); }));
  box.querySelector('[data-ms-more]')?.addEventListener('click', () => { msMore = true; redraw(); });
  box.querySelector('[data-ms-print]')?.addEventListener('click', () => { prOpen = !prOpen; redraw(); });
  bindPrintPanel(box, list, redraw);
  box.querySelectorAll('[data-ms-go]').forEach((b) => (b.onclick = () => startMistakes(list.filter((m) => m.status === b.dataset.msGo), b.dataset.msGo, b)));
}

// ───────── 错题本打印：范围跟着当前标签页和筛选走，可选附答案、留演算空白；语言跟做题页一致 ─────────
const PR_MAX = 60;
const MS_TAB = { todo: '要做的', pending: '待订正', due: '该复习', fixed: '已订正', mastered: '已掌握', all: '全部' };
let prOpen = false, prScope = 'cur', prAns = true, prSpace = true;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: SHEET_CSS }));
const prDesc = () => [MS_TAB[msFilter], msCtx?.fam(), msCtx?.kp()].filter(Boolean).join(' · ');
const prList = (shown) => (prScope === 'all' ? msCtx?.all || [] : shown);
function printPanel(shown) {
  const n = prList(shown).length, tog = (on) => `aria-pressed="${on}"`;
  return `<div class="ms-print" id="ms-print">
    <div class="pr-row"><span class="pr-label">范围</span>
      <button class="pr-opt" data-pr-scope="cur" ${tog(prScope === 'cur')}>当前列表（${esc(prDesc())}）${shown.length} 题</button>
      <button class="pr-opt" data-pr-scope="all" ${tog(prScope === 'all')}>全部错题 ${msCtx?.all.length || 0} 题</button></div>
    <div class="pr-row"><span class="pr-label">语言</span>${Object.entries(LANGS).map(([k, v]) => `<button class="pr-opt" data-pr-lang="${k}" ${tog(lang.get() === k)}>${v}</button>`).join('')}</div>
    <div class="pr-row"><label class="pr-chk"><input type="checkbox" id="pr-ans" ${prAns ? 'checked' : ''}>附答案和解题思路</label>
      <label class="pr-chk"><input type="checkbox" id="pr-space" ${prSpace ? 'checked' : ''}>每题下面留演算空白</label></div>
    <div class="pr-row"><button class="btn primary" id="pr-go" ${n ? '' : 'disabled'}>打印预览</button>
      <span class="pr-note">${!n ? '这个范围里没有题。' : n > PR_MAX ? `一次最多打印 ${PR_MAX} 题，只打印前 ${PR_MAX} 题。` : ''}</span></div>
  </div>`;
}
function bindPrintPanel(box, list, redraw) {
  const p = box.querySelector('#ms-print');
  if (!p) return;
  const shown = msFilter === 'all' ? list : msFilter === 'todo' ? list.filter(isTodo) : list.filter((m) => m.status === msFilter);
  p.querySelectorAll('[data-pr-scope]').forEach((b) => (b.onclick = () => { prScope = b.dataset.prScope; redraw(); }));
  p.querySelectorAll('[data-pr-lang]').forEach((b) => (b.onclick = () => { lang.set(b.dataset.prLang); redraw(); }));
  p.querySelector('#pr-ans').onchange = (e) => { prAns = e.target.checked; };
  p.querySelector('#pr-space').onchange = (e) => { prSpace = e.target.checked; };
  p.querySelector('#pr-go').onclick = async (e) => {
    const items = prList(shown).slice(0, PR_MAX);
    const btn = e.currentTarget;
    try {
      const r = await api(`/math/api/students/${auth.student.id}/mistakes/print`, { method: 'POST', body: { problem_ids: items.map((m) => m.problem_id) } });
      if (!r.items?.length) throw new Error('没有取到题目');
      const desc = prScope === 'all' ? '全部错题' : prDesc();
      const title = `${msCtx.nickname}的错题本`, sub = `${desc} · 共 ${r.items.length} 题`;
      const withAns = prAns, space = prSpace, L = lang.get();
      let link = null; // 安卓微信里用：同一次预览只生成一个链接
      openPreview({
        title, sub, items: r.items, withAns, space, file: 'mistakes',
        link: async () => link ||= printLinkUrl((await api(`/math/api/students/${auth.student.id}/mistakes/print-link`, { method: 'POST',
          body: { problem_ids: r.items.map((x) => x.problem_id), title, sub, with_ans: withAns, space, lang: L } })).token),
      }, { esc, rich, stemHtml, isFig, lang: () => L, typeset });
    } catch (err) { btn.disabled = false; modal(`<h2>没能打开打印预览</h2><p>${esc(err.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  };
}

// 打印链接（微信里换到浏览器打开）：不用登录，凭链接取题，直接打开打印预览
async function renderPrintLink(token) {
  const page = (body) => { $app.innerHTML = `<main class="page"><div class="card" style="max-width:560px;margin:40px auto">${body}</div></main>`; };
  let d;
  try {
    const r = await fetch(`/math/api/print/${encodeURIComponent(token)}`);
    d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `请求失败 (${r.status})`);
  } catch (e) { return page(`<h2>打不开这张练习单</h2><p>${esc(e.message)}</p><a class="btn primary" href="/math/#/mistakes">去错题本</a>`); }
  const L = d.lang || 'en';
  const open = () => openPreview({
    title: d.title, sub: d.sub, items: d.items, withAns: d.with_ans, space: d.space, file: 'mistakes',
    link: async () => printLinkUrl(token), onClose: closed,
  }, { esc, rich, stemHtml: (p) => withLang(L, () => stemHtml(p)), isFig, lang: () => L, typeset });
  const closed = () => { page(`<h2>${esc(d.title)}</h2><p class="muted">${esc(d.sub)}</p><div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" id="reopen">打开打印预览</button><a class="btn" href="/math/#/mistakes">去错题本</a></div>`); $app.querySelector('#reopen').onclick = open; };
  if (!d.items?.length) return page('<h2>这张练习单没有题</h2><a class="btn primary" href="/math/#/mistakes">去错题本</a>');
  closed(); open();
}
/** 临时按指定语言出题干（打印链接用链接里的语言，不改本机设置） */
function withLang(L, fn) { const g = lang.get; lang.get = () => L; try { return fn(); } finally { lang.get = g; } }

router();
