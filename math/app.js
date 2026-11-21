import { FLAME, WEEK, pencil, STAR, MILES, MEDAL, nextMile, weekRow, todayCard, bindToday, pointsSheet, examUrl, SUBJ_NAME } from '/assets/pal.js?v=20261121c';
// AMC 8 模拟考 · 前端（无构建步骤，原生 JS）
// 路由：#/account（账号与会员）  #/（考试）  #/contest/:id[/stats|/records]  #/graph[/:kp]  #/mistakes  #/kp/:id  #/exam/:sid  #/review/:sid  #/problem/:id
import { mountPlayer } from './player.js';
import { SIMS } from './sims.js';
import { sideNav } from '/assets/sidenav.js?v=20261121a';
import { loadStart } from '/assets/loadcomic.js?v=20261109';
import { mountGraph } from './graph.js';
import { PRINT_ICON, openPrint } from '/assets/print/kit.js?v=20261117a';
import { draftSync } from '/assets/draft.js?v=20261114a';
import { PRINT_CSS, sheetBlocks, embeddedKatexCss } from './print.js?v=20261116s';
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
// 返回：统一成带左箭头的小按钮（.back）
const BACK_IC = '<svg class="bk-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const isFillP = (p) => !Object.keys(p.choices || {}).length;
const MODE_NAME = { exam: '限时模考', practice: '逐题练', paper: '纸笔' };
const modeName = (m) => MODE_NAME[m] || '逐题练';
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
    if (!auth.token) { // 没登录：直接建一个游客用起来；登录过的设备、账号页、#/join 才给登录表单
      const scan = page === 'fill' || page === 'sol' || page === 'team'; // 邀请链接也不挡 // 扫卷子二维码进来的：不挡，直接以游客回填 / 看解析（回填页上有「登录」）
      if (!scan && (SECTION === 'account' || page === 'join' || store.get('li.hadAccount'))) return renderJoin();
      // 新访客进引导：年级页先画出来，游客账号在后台建
      if (page === 'start') return await renderStart(id, autoGuest);
      await autoGuest();
    }
    if (page === 'join') { location.replace('#/'); return; }
    if (SECTION === 'account') return await (page === 'account' && id === 'paid' ? renderPaid(sub) : renderAccount());
    if (page === 'account' && id !== 'paid') { location.replace(ACCOUNT_URL); return; } // 账号是全站的，在 /account/
    if (page === 'exam') return await renderExam(id);
    if (page === 'review') return await renderReview(id);
    if (page === 'fill') { ev('scan_fill'); store.set('li.scanned', true); await ensureMe(); ev(isGuest() ? 'scan_fill_guest' : 'scan_fill_user'); }
    if (page === 'fill') return await startFill({ id: decodeURIComponent(id || '') }); // 试卷页脚二维码：扫码回填答案（也可以跳过直接看解析）
    if (page === 'sol') return await renderSolutions(decodeURIComponent(id || ''));
    if (page === 'kp') return await renderKp(id);
    if (page === 'problem') return await renderProblem(id);
    if (page === 'profile') { location.replace('#/graph'); return; } // 画像并进了知识图谱
    if (page === 'graph') return await renderGraphPage(id);
    if (page === 'plan') return await renderPlan();
    if (page === 'start') return await renderStart(id);
    if (page === 'done') { const r = await api(`/math/api/sessions/${enc(id)}/review`); return r.session?.prep?.done ? celebrate(r, id) : location.replace(examUrl(r.session?.prep?.subject || 'math', id, true, r.session?.prep?.family)); } // 语文打卡做完跳到这里放完成动画
    if (page === 'team') return await renderTeam(id);
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
// 匿名计数：每台设备每天每种事件只报一次，只记次数，不记是谁
function ev(e) {
  try { if (localStorage.getItem('li.noev') === 'true') return; } catch {} // 自己的设备（后台统计页里设的）不计数
  const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), k = 'li.ev.' + e;
  if (store.get(k) === d) return; store.set(k, d);
  fetch('/api/ev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e }), keepalive: true }).catch(() => {});
}
if (SECTION === 'math') ev('view_math');
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

// 游客能考试、看答案、用错题本；知识图谱、知识项要注册
const isGuest = () => !!lastMe?.guest;
async function ensureMe() { if (!lastMe) try { lastMe = await api('/math/api/me'); } catch {} return lastMe; }
// 游客占位：模糊的示例 + 一句话 + 注册按钮（语文错题本也用同一份样式）
const RW_LINE = { 错题本: '做错的题自动收进来，按知识项订正、隔几天再复习', 知识图谱: '每做一套，就能看到哪些知识项强、哪些弱、先补什么', 知识项: '每个知识项的掌握情况，和考过它的真题' };
function rwSample(title) {
  const lv = ['ok', 'weak', 'strong', 'weak', 'ok', 'strong', 'ok', 'strong', 'weak', 'ok', 'strong', 'ok', 'strong', 'weak', 'ok', 'strong', 'ok', 'weak'];
  const kp = ['分数运算', '比和比例', '行程问题', '面积计算', '数字谜', '计数', '概率', '整除', '勾股定理', '平均数', '方程', '周期问题', '质数', '相似', '圆', '工程问题', '排列', '数列'];
  if (title === '知识图谱') return `<div class="rw-grid">${kp.map((n, i) => `<span class="rw-chip lv-${lv[i]}"><i class="kg-sw lv-${lv[i]}"></i>${n}</span>`).join('')}</div>`;
  if (title === '知识项') return `<div class="rw-kp"><b>比和比例</b><div class="rw-bar"><i style="width:58%"></i></div>${['2024 第 12 题', '2023 第 7 题', '2022 第 15 题'].map((t, i) => `<div class="rw-row"><span class="rw-m ${i ? 'r' : 'w'}">${i ? '✓' : '✗'}</span>${t}<em>${i ? '已掌握' : '待订正'}</em></div>`).join('')}</div>`;
  return `<div class="rw-list">${[['第 12 题', '比和比例', '待订正'], ['第 18 题', '行程问题', '该复习了'], ['第 7 题', '面积计算', '待订正'], ['第 21 题', '计数', '已订正']].map(([a, b, c]) => `<div class="rw-row"><span class="rw-m w">✗</span>${a}<small>${b}</small><em>${c}</em></div>`).join('')}</div>`;
}
const regPreview = (title, href = '#/account') => `<div class="card reg-wall"><div class="rw-blur" aria-hidden="true">${rwSample(title)}</div>
  <div class="rw-over"><p>${esc(RW_LINE[title] || '')}</p><a class="btn primary" href="${href}" data-regp>免费注册</a></div></div>`;
function regWall(title) {
  $app.innerHTML = `${topnav()}<main class="page"><header class="ph"><div><h1>${esc(title)}</h1></div></header>${regPreview(title)}</main>`;
}
// 点注册提示：计数，注册完回到原来的页面
document.addEventListener('click', (e) => { if (e.target.closest('[data-regp]')) { ev('reg_prompt'); store.set('li.back', location.pathname + location.hash); } });

// ───────── 登录 / 注册（常见做法：左边介绍、右边表单；手机上只有表单） ─────────
let joinTab = store.get('li.hadAccount') ? 'login' : 'register';
let joinPrefill = null;
// 从别的板块（语文）跳来登录的，登录 / 注册 / 游客进入后回到原来的页面
function goBack() { const b = store.get('li.back'); if (!b) return false; store.del('li.back'); if (!/^\/(chinese|math|english)\//.test(b)) return false; location.href = b; return true; }
// 静默建游客：同时打开几个页面也只建一个
let guestP = null;
function autoGuest() {
  return (guestP ||= api('/api/auth/guest', { method: 'POST', body: {} }).then((r) => { auth.save(r.token, r.student); }).finally(() => { guestP = null; }));
}
function renderJoin() {
  ev('view_join');
  const reg = joinTab === 'register';
  $app.innerHTML = `${topnav()}<div class="auth-wrap">
    <section class="auth-intro">
      <h1>竞赛真题边练边学</h1>
      <ul>
        <li><b>数学真题</b>AMC 8 · AMC 10 · AMC 12 · 袋鼠数学 · 希望数学 · 思维 100</li>
        <li><b>语文真题</b>汉字小达人 · 古诗文大会 · 飞花令</li>
        <li><b>英语备考</b>KET · PET · 小托福</li>
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
        ${reg ? '<label class="field"><span>孩子的昵称（可不填）</span><input type="text" name="nickname" maxlength="20" placeholder="例如：小桐"></label>' : ''}
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
          ${a.guest ? `<label class="field"><span>孩子的昵称（可不填）</span><input type="text" name="nickname" maxlength="20" value="${esc(auth.student?.nickname === '同学' ? '' : auth.student?.nickname || '')}" placeholder="例如：小桐"></label>` : ''}
          <button class="btn primary">${a.guest ? '注册' : '绑定'}</button><div class="error-msg" id="berr"></div></form>
`}
      <p style="margin-top:14px"><button class="btn" id="logout">退出登录</button></p>
    </div>`;
  $app.innerHTML = `${topnav()}<main class="page">
    <header class="ph"><div><h1>账号</h1><p class="muted">${a.guest ? '游客' : esc(a.phone || '还没绑定手机号')}</p></div></header>
    <div class="cols"><div class="col-main">${a.guest ? acctCard : ''}<div class="card"><h2>${ms.length ? '我的会员' : '购买会员'}</h2>
      <p>${memberLine}</p>
      ${a.free_mode || a.guest ? '' : `<p class="cred-row">剩余免费次数 <b>${a.credits}</b> 次<button class="pts-chip" data-pts>${STAR}积分换次数</button></p>${a.credits <= 0 && !ms.length ? shareCard() : ''}`}
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
  $app.querySelector('[data-pts]')?.addEventListener('click', () => pointsSheet({ sid: auth.student?.id, token: auth.token, onDone: () => router() }));
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
    store.set('li.hadAccount', true);
    const me = await api('/math/api/me'); lastMe = me;
    const s = me.students.find((x) => x.id === auth.student?.id) || me.students[0]; if (s) auth.setStudent(s);
    if (r.credits_added) modal(`<div class="support"><div class="gift-big">${icon('gift', 44)}</div><h2>注册成功，已送你 ${r.credits_added} 次互动解析</h2></div><div class="actions" style="justify-content:center"><button class="btn primary" data-close>${store.get('li.back') ? '回去接着做' : '好的'}</button></div>`, (m) => m.querySelector('[data-close]').addEventListener('click', () => goBack()));
    else if (goBack()) return;
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
  // 次数用完：积分够就可以直接拿积分换 1 次解锁
  const pt = auth.student ? await api(`/math/api/students/${enc(auth.student.id)}/points`).catch(() => null) : null;
  const exch = pt && pt.total >= pt.per_credit ? `<div class="ex-pts">${STAR}<span>积分 <b>${pt.total}</b></span><button class="btn primary" id="exch">用 ${pt.per_credit} 积分解锁</button></div>`
    : pt?.total ? `<p class="small muted ex-pts-few">${STAR}积分 ${pt.total}，满 ${pt.per_credit} 可换 1 次</p>` : '';
  const bindEx = (m, close) => m.querySelector('#exch')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await api(`/math/api/students/${enc(auth.student.id)}/points/redeem`, { method: 'POST', body: { n: 1 } }); }
    catch (x) { e.target.disabled = false; return alert(x.message); }
    const u = await api('/api/unlock', { method: 'POST', body: { item } });
    close();
    if (u.status === 402) return askUnlock(item, what, 0, then);
    then();
  });
  if (lastMe?.guest) return modal(`<div class="locked-panel"><div class="icon">${icon('gift', 36)}</div><p><b>注册就送 10 次互动解析</b></p>
    <p class="small">互动解析是会员内容。注册账号就送 10 次，这道题马上能看；现在的做题记录也会保留。（2026 年真题的互动解析不用注册也能看。）</p>
    ${exch}<div class="actions" style="justify-content:center"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/account" data-close>去注册</a></div></div>`, bindEx);
  modal(`<h2>免费次数用完了</h2>${exch}${shareCard()}
    <p class="small muted share-or">或者开通会员，所有互动解析和知识项突击不限次数。</p>
    <div class="actions"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/account" data-close>开通会员</a></div>`, bindEx);
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
  const sessions = (prof.sessions || []).slice(0, 3);
  const tasks = [ // 错题在页面最上面的「继续」条里，这里只列要补的知识项
    ...sugg.map((x) => `<a class="task weak" href="#/kp/${enc(x.n.id)}"><i class="kg-sw lv-weak"></i><span>先补「${esc(x.n.name)}」<small>${esc(x.why)}</small></span></a>`),
  ].filter(Boolean);
  const startFam = fams.find((x) => x.id === dashFam && x.exams) || fams.find((x) => x.exams);
  // 打卡卡片已经是「今天做什么」：这里只在有薄弱知识项要补时列出来
  // 没做完的模考：跟着账号走（换台设备也能看到）
  const op = (await api(`/math/api/students/${enc(st.id)}/open?subject=math`).catch(() => null))?.sessions?.[0];
  const [pr, tm] = await Promise.all([ // 每日打卡 / 备战计划；队伍排行
    api(`/math/api/students/${enc(st.id)}/prep`).catch(() => null),
    api(`/math/api/students/${enc(st.id)}/team`).catch(() => null)]);
  // 新来的人（游客，或注册了还没做过题）先走新手引导：考什么、什么时候考、每天几题
  if (pr && !pr.items?.length && !pr.total && !store.get('li.obSkip') && (guest || !(prof.sessions || []).length)) { location.replace('#/start/math'); return; }
  const live = op ? { sid: op.id, title: op.title } : null;
  const prepCard = pr ? todayCard(pr, { team: tm, only: 'math' }) : '';
  const strip = [
    live && `<a class="cont-go" href="#/exam/${enc(live.sid)}"><b>继续答题</b><span>${esc(live.title)}</span><i>›</i></a>`,
    pending + due ? `<a class="cont-go alt" href="#/mistakes"><b>${pending + due} 道错题</b><span>${pending ? `${pending} 道待订正` : ''}${pending && due ? '，' : ''}${due ? `${due} 道该复习` : ''}</span><i>›</i></a>` : '',
  ].filter(Boolean);
  const tried = g.nodes.filter((n) => lv(n) !== 'none').length;
  $app.innerHTML = `${topnav()}<main class="page dash">
    <header class="ph"><div><h1>数学竞赛真题</h1></div>
      ${me.students.length > 1 ? `<select id="stu">${me.students.map((s) => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${esc(s.nickname)}</option>`).join('')}</select>` : ''}</header>
    ${prepCard}
    ${strip.length ? `<div class="cont-strip">${strip.join('')}</div>` : ''}
    <section class="dash-exams" aria-label="考试">
      <div class="fam-cards">${fams.map((x) => `<a class="fam-card ${x.id === dashFam ? 'last' : ''}" href="#/contest/${enc(x.id)}">
        <b>${esc(x.name)}</b><span>${x.exams ? `${x.exams} 套真题` : '录入中'}</span>
        <small>${x.last ? `最近 ${x.last.score} 分` : ''}</small><i>›</i></a>`).join('')}</div>
    </section>
    <div class="dash-grid">
      ${tasks.length || !guest ? `<section class="card todo">
        <div class="card-h"><h2>${tasks.length ? '先补这几块' : '知识图谱'}</h2></div>
        ${tasks.length ? `<div class="tasks">${tasks.join('')}</div>` : ''}
        ${guest ? '' : `<a class="mm-line" href="#/graph"><span>知识图谱</span><span class="mm-sum">${['strong', 'ok', 'weak'].map((k) => `<span><i class="kg-sw lv-${k}"></i>${LV[k]} <b>${count(k)}</b></span>`).join('')}</span><span class="muted small">›</span></a>`}
      </section>` : ''}
      ${sessions.length ? `<section class="card recent">
        <div class="card-h"><h2>最近成绩</h2><a href="#/contest/${enc(sessions.find((x) => x.exam_id && x.exam_id !== 'drill')?.exam_id.split('-')[0] || startFam?.id || 'amc8')}/records">全部 ›</a></div>
        <div class="scores">${sessions.map((x) => `<a class="score-row" href="#/review/${x.id}">
          <span class="sr-t">${esc(x.title)}<small>${modeName(x.mode)} · ${fmtDate(x.submitted_at)}</small></span>
          <span class="sr-bar"><i style="width:${(x.score / x.total) * 100}%"></i></span><b>${x.score}<small>/${x.total}</small></b></a>`).join('')}</div>
      </section>` : ''}
    </div>
    ${me.has_phone || me.guest ? '' : `<a class="card bind-tip" href="${ACCOUNT_URL}"><span>还没绑定手机号</span><b>去绑定 ›</b></a>`}
  </main>`;
  document.getElementById('stu')?.addEventListener('change', (e) => { auth.setStudent(me.students.find((s) => s.id === e.target.value)); router(); });
  bindToday($app, { sid: st.id, token: auth.token });

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
    const s = e.title.replace(f.name, '').replace(GRADE[e.grade] || '', '').replace(/Level [A-F]\b/, '').replace(/（(.+?)）/g, ' $1').replace(/\s+/g, ' ').trim();
    const m = s.match(/^(\d{4}\s*\S+)\s*(.*)$/);
    return m ? { t: m[1], sub: m[2].split(' ').filter(Boolean).join(' · ') } : { t: s, sub: '' };
  };
  const html = exams.length ? `${grades.length ? `<div class="ms-tabs grade-tabs">${grades.map((g) => `<button class="${g === contestGrade[fid] ? 'on' : ''}" data-grade="${g}">${esc(f.grade_labels?.[g] || GRADE[g] || g + ' 年级')}</button>`).join('')}</div>` : ''}<div class="exam-grid${f.grades ? ' long' : ''}">
      ${shown.map((e) => { const lb = label(e); return `<div class="exam-tile ${e.last_score !== null ? 'done' : ''}">
        <div class="et-top"><span class="et-year${f.grades ? ' cn' : ''}">${esc(lb.t)}</span>
          ${e.last_score !== null ? `<a class="et-score" href="#/review/${e.last_session}">${e.last_score}<small>/${e.problem_count}</small></a>` : '<span class="et-new">未做</span>'}</div>
        <div class="et-meta"><span class="small muted">${lb.sub ? `${esc(lb.sub)} · ` : ''}${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟</span>
          <button class="et-pp" data-paper="${e.id}" title="打印试卷">${PRINT_ICON}<span>打印</span></button></div>
        <div class="et-btns">
          <button class="btn" data-start="${e.id}" data-mode="practice">逐题练</button>
          <button class="btn primary" data-start="${e.id}" data-mode="exam">限时模考</button>
          ${e.open_session && e.open_mode !== 'paper' ? `<a class="btn et-fill" href="#/exam/${enc(e.open_session)}">继续答题</a>` : ''}
          ${store.get(paperKey(e.id)) || store.get(printedKey(e.id)) || e.open_mode === 'paper' ? `<button class="btn et-fill" data-fill="${e.id}">${store.get(paperKey(e.id)) || e.open_mode === 'paper' ? '继续回填' : '回填答案'}</button>` : ''}
        </div></div>`; }).join('')}
    </div>${limit && exams.length > limit ? `<a class="more-link" href="#/contest/${enc(fid)}">全部 ${exams.length} 套 ›</a>` : ''}` : '<div class="card"><p class="muted">这种考试的真题还在录入，很快上线。</p></div>';
  return { html, exams };
}
// ───────── 打卡（参考多邻国）：火苗 + 连续天数 + 本周格子 ─────────
// 打卡完成：暖色光芒转动、火苗长大跳动、火星往上飘、天数翻页 +1、今天的格子点亮带波纹、两侧礼花炮 + 中间彩纸、统计卡依次升起
const CELE_LINE = (k) => k >= 100 ? '百日达成！' : k >= 30 ? '一个月不间断！' : k >= 14 ? '两周不间断！' : k >= 7 ? '整整一周！' : k >= 3 ? '越来越稳了！' : k === 1 ? '好的开始！' : '继续保持！';
// 回来的路：每日提醒（手机日历）和放到桌面。网页没有推送，这是让孩子第二天回来的主要办法
const INAPP = /MicroMessenger|XiaoHongShu|xhsdiscover|Weibo|QQ\//i.test(navigator.userAgent); // 微信、小红书等 App 里打开的网页
const IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let bip = null; addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); bip = e; }); // 安卓 Chrome：能直接弹「添加到桌面」
const RM_TIMES = ['0730', '1700', '1930', '2030'];
const hhmm = (t) => `${t.slice(0, 2)}:${t.slice(2)}`;
async function addReminder(t) {
  let key = null;
  if (isGuest()) try { key = (await api('/math/api/account/resume-key', { method: 'POST' })).key; } catch {}
  store.set('li.remind', t);
  location.href = `/api/remind.ics?t=${t}${key ? `&r=${key}` : ''}`;
}
function remindBlock(t0) {
  return `<div class="cele-hook" id="rm"><b>明天几点提醒？</b>
    <div class="rm-times">${RM_TIMES.map((t) => `<button type="button" data-rt="${t}" aria-pressed="${t === t0}">${hhmm(t)}</button>`).join('')}</div>
    <button class="btn primary block" id="rm-add">加到手机日历</button>${INAPP ? '<small>加不上的话：点右上角 ···，选「在浏览器打开」</small>' : ''}
    <button class="cele-skip" id="rm-no">不用了</button></div>`;
}
function a2hsBlock() {
  const how = bip ? '<button class="btn primary block" id="a2hs-go">放到桌面</button>'
    : IOS ? '<small>点 Safari 底部的「分享」，选「添加到主屏幕」</small>' : '<small>点浏览器菜单，选「添加到主屏幕」</small>';
  return `<div class="cele-hook" id="a2hs"><b>放到手机桌面，每天一点就进来</b>${how}<button class="cele-skip" id="a2hs-no">知道了</button></div>`;
}
function bindHooks(root) {
  let t = RM_TIMES[2];
  root.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => { t = b.dataset.rt; root.querySelectorAll('[data-rt]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  root.querySelector('#rm-add')?.addEventListener('click', async () => { await addReminder(t); root.querySelector('#rm').innerHTML = `<b>每天 ${hhmm(t)} 提醒 ✓</b><small>日历里没出现的话，再点一次「加到手机日历」</small>`; });
  root.querySelector('#rm-no')?.addEventListener('click', () => { store.set('li.remind', 'no'); root.querySelector('#rm').remove(); });
  root.querySelector('#a2hs-go')?.addEventListener('click', async () => { try { await bip.prompt(); } catch {} bip = null; store.set('li.a2hsOff', Date.now()); root.querySelector('#a2hs').remove(); });
  root.querySelector('#a2hs-no')?.addEventListener('click', () => { store.set('li.a2hsOff', Date.now()); root.querySelector('#a2hs').remove(); });
}
// 完成页只出一个：还没设提醒先问提醒；第 2 次打卡起（不是从桌面打开、不在 App 里）请他放到桌面
function hookFor(p) {
  if (!store.get('li.remind')) { ev('remind_prompt'); return remindBlock(RM_TIMES[2]); }
  if (!STANDALONE && !INAPP && (p.total || 0) >= 2 && !store.get('li.a2hsOff')) { ev('a2hs_prompt'); return a2hsBlock(); }
  return '';
}

function celebrate(r, sid) {
  const p = r.session.prep || {}, wk = (p.per_week || 7) < 7;
  const regAsk = isGuest() && (p.total === 1 || p.streak === 3); // 游客：第一次打卡、连续第 3 次时请他注册（可以不理）
  const k = wk ? p.week_count || 1 : p.streak || 1; // 一周几次的：数字是本周第几次
  const used = Math.max(0, (r.session.submitted_at - r.session.started_at) / 1000);
  const pct = r.total ? Math.round((r.session.score / r.total) * 100) : 0;
  $app.innerHTML = `<main class="cele">
    <div class="cele-rays" aria-hidden="true"></div>
    <div class="cele-hero">
      <div class="cele-embers" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--d:${(i * 0.37) % 2.2}s;--x:${((i * 37) % 90) - 45}px;--s:${4 + (i % 4) * 2}px"></i>`).join('')}</div>
      <div class="cele-flame">${FLAME}</div>
    </div>
    <div class="cele-n"><span class="cele-roll"><b class="old">${k - 1}</b><b class="new">${k}</b></span><span class="cele-plus">+1</span></div>
    <div class="cele-t">${wk ? `<b>本周 ${k}/${p.per_week} 次</b><span>${k >= p.per_week ? `本周目标达成！${p.streak > 1 ? `连续 ${p.streak} 周` : ''}` : `再练 ${p.per_week - k} 次达成本周目标`}</span>`
      : `<b>连续打卡 ${k} 天</b><span>${CELE_LINE(k)}</span>${MILES.includes(k) ? `<span class="cele-badge">${MEDAL(k)}拿到 ${k} 天徽章</span>` : nextMile(k) ? `<span class="cele-nm">再 ${nextMile(k) - k} 天拿 ${nextMile(k)} 天徽章</span>` : ''}`}</div>
    ${weekRow(p.week)}
    <div class="cele-stats">
      <span style="--i:0"><svg viewBox="0 0 36 36" class="ring"><circle cx="18" cy="18" r="15.5"/><circle cx="18" cy="18" r="15.5" class="fg" style="--p:${pct}"/></svg><b>${r.session.score}/${r.total}</b><small>答对</small></span>
      <span style="--i:1"><b class="big pts">+${p.points_got || 0}</b><small>积分</small></span>
      <span style="--i:2"><b class="big">${fmtTime(used)}</b><small>用时</small></span>
    </div>
    ${hookFor(p)}
    ${regAsk ? `<a class="cele-reg" href="#/account" id="cele-reg"><b>注册保存打卡记录</b><span>换手机也不断签 · 送 10 次互动解析</span></a>` : ''}
    <div class="cele-acts">${p.next ? `<button class="btn primary block" id="cele-next">接着做${esc(p.next.name)} · ${p.next.n} 题</button><a class="btn block" href="${examUrl(p.subject, sid, true, p.family)}">看解析</a>`
      : `<a class="btn primary block" href="${examUrl(p.subject, sid, true, p.family)}">看解析</a>${p.subject !== 'english' ? '<button class="btn block" id="cele-more">再练一组</button>' : ''}`}<a class="btn block" href="/">回首页</a></div>
    <canvas class="cele-fx" aria-hidden="true"></canvas>
  </main>`;
  const root = $app.querySelector('.cele');
  bindHooks(root);
  root.querySelector('#cele-reg')?.addEventListener('click', () => { ev('reg_prompt'); store.set('li.back', `${location.pathname}#/`); });
  root.querySelector('#cele-more')?.addEventListener('click', () => startExtra(p.family));
  root.querySelector('#cele-next')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const st = auth.student;
    const t = await api(`/math/api/students/${enc(st.id)}/prep/today?family=${enc(p.next.family)}`, { method: 'POST' });
    location.href = examUrl(t.subject, t.session_id, false, p.next.family);
  });
  const td = root.querySelector('.sc-week .today');
  if (td) { td.classList.remove('done'); td.querySelector('em').textContent = ''; }
  setTimeout(() => {
    root.classList.add('go'); // 天数翻页、+1 飘起
    if (td) { td.classList.add('done', 'pop'); td.querySelector('em').textContent = '✓'; }
    burst(root.querySelector('.cele-fx'));
    try { navigator.vibrate?.([30, 40, 70]); } catch {}
  }, 900);
}
// 礼花：左右两门炮斜着往上打，中间从火苗处再炸一圈；有重力、空气阻力、翻转和左右飘
function burst(cv) {
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#F08A24', '#FFD25E', '#FFB547', '#1D5C4D', '#6CC2A6', '#B04A6F', '#F29BBB', '#FFE38A'];
  const P = [];
  const add = (x, y, ang, spread, sp, n) => { for (let i = 0; i < n; i++) {
    const a = ang + (Math.random() - 0.5) * spread, v = sp * (0.55 + Math.random() * 0.6);
    P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 9 + Math.random() * 9,
      c: cols[(Math.random() * cols.length) | 0], k: Math.random() < 0.18 ? 2 : Math.random() < 0.3 ? 1 : 0, ph: Math.random() * 6.28, life: 0 });
  } };
  const D = Math.PI / 180;
  add(-10, H * 0.72, -62 * D, 34 * D, 19, 70);
  add(W + 10, H * 0.72, -118 * D, 34 * D, 19, 70);
  setTimeout(() => add(W / 2, H * 0.2, -90 * D, 300 * D, 10, 60), 140);
  const star = (s) => { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? s * 0.45 : s, a = (i * 36 - 90) * D; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); };
  let t0 = performance.now();
  (function frame(t) {
    const dt = Math.min(2, (t - t0) / 16.7); t0 = t;
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const q of P) {
      q.life += dt; q.vy += 0.32 * dt; q.vx *= 0.985 ** dt; q.vy *= 0.985 ** dt;
      q.x += (q.vx + Math.sin(q.ph + q.life * 0.12) * 0.8) * dt; q.y += q.vy * dt; q.r += q.vr * dt;
      if (q.y > H + 30) continue;
      alive++;
      const fade = Math.max(0, Math.min(1, (260 - q.life) / 60));
      g.save(); g.globalAlpha = fade; g.translate(q.x, q.y); g.rotate(q.r); g.fillStyle = q.c;
      if (q.k === 2) star(q.w * 0.8);
      else if (q.k === 1) { g.beginPath(); g.arc(0, 0, q.w / 2.2, 0, 6.28); g.fill(); }
      else { g.scale(1, Math.abs(Math.cos(q.life * 0.15 + q.ph)) + 0.15); g.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); }
      g.restore();
    }
    if (alive) requestAnimationFrame(frame); else g.clearRect(0, 0, W, H);
  })(t0);
}

// ───────── 新手引导（全站）：几年级 → 考哪些 → 考试时间（官方公布了的自动填）→ 一周几次、每次多少 → 要不要组队 → 开始第一天 ─────────
const GRADE9 = [[1, '一年级'], [2, '二年级'], [3, '三年级'], [4, '四年级'], [5, '五年级'], [6, '六年级 / 预初'], [7, '初一'], [8, '初二'], [9, '初三']];
const LEVEL = [['easy', '轻松'], ['normal', '认真'], ['hard', '冲刺']];
const WKS = [[3, '每周 3 次'], [5, '每周 5 次'], [7, '每天']];
const bjToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addMonths = (m) => { const d = new Date(Date.now() + 8 * 3600e3); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const daysTo = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${bjToday()}T00:00:00Z`)) / 864e5);
const tomorrow = () => new Date(Date.now() + 8 * 3600e3 + 864e5).toISOString().slice(0, 10);
const perLabel = (fams, ids, lv) => { const i = LEVEL.findIndex(([k]) => k === lv); const seen = new Set();
  return ids.map((id) => fams.find((f) => f.id === id)).filter((f) => f && !seen.has(f.subject) && seen.add(f.subject)).map((f) => `${f.subject_name} ${f.per[i]} ${f.unit || '题'}`).join(' · '); };
// 一行考试日期：官方日期写在旁边；没公布的给几个快捷选项
const dateRow = (f, val) => `<div class="ob-date-row" data-df="${esc(f.id)}"><div class="odr-h"><b>${esc(f.name)}</b>${f.next ? `<span>${esc(f.next.label)}</span>` : ''}</div>
  <label class="ob-dwrap ${val ? '' : 'empty'}"><input type="date" class="ob-date" min="${tomorrow()}" value="${esc(val || '')}"><span>选日期</span></label>
  ${f.next ? '' : `<div class="odr-quick">${[['1 个月后', 1], ['2 个月后', 2], ['3 个月后', 3], ['半年后', 6]].map(([t, m]) => `<button type="button" data-qm="${m}">${t}</button>`).join('')}</div>`}</div>`;
const bindDates = (root, dates, onChange) => root.querySelectorAll('[data-df]').forEach((row) => {
  const f = row.dataset.df, inp = row.querySelector('input');
  const wrap = row.querySelector('.ob-dwrap');
  inp.onchange = () => { dates[f] = inp.value && inp.value >= tomorrow() ? inp.value : null; wrap.classList.toggle('empty', !inp.value); onChange(); };
  row.querySelectorAll('[data-qm]').forEach((b) => (b.onclick = () => { inp.value = dates[f] = addMonths(+b.dataset.qm); wrap.classList.remove('empty'); onChange(); }));
});

// subject：从某一科进来（#/start/math …）就不用再选科目；已经有备考项的是「加一项」：不再问年级、怎么练、组队
const SUBJ_CARDS = [['math', '数', '数学'], ['chinese', '语', '语文'], ['english', '英', '英语']];
// newGuest：这台设备没登录过。先画欢迎页；点「开始」才建游客账号（点「我已有账号」就不建），账号和比赛列表在后台准备
async function renderStart(subject, newGuest) {
  let st = null, pr = null, fams = [], have = [], adding = false, loadP = null;
  const load = () => (loadP ||= (async () => {
    if (newGuest) await newGuest();
    st = auth.student || (await ensureMe())?.students?.[0]; // 刚建的游客已经有孩子信息，不用再查一次账号
    pr = await api(`/math/api/students/${enc(st.id)}/prep`);
    fams = pr.families || [];
    have = (pr.items || []).filter((x) => x.plan);
    adding = have.length > 0;
  })());
  if (!newGuest) await load();
  // 先选科目（可多选，从某一科进来的先勾上），再一科一科选比赛
  const A = { grade: pr?.grade || null, subjs: SUBJ_NAME[subject] ? [subject] : [], sel: [], dates: {}, wk: null, lv: null, team: null };
  const needGrade = !A.grade;
  const isNew = !!newGuest; // 这台设备第一次来：先欢迎、小铅笔打招呼
  if (isNew) ev('ob_welcome');
  // 选完比赛就开始第一天：考试日期（官方公布了的自动填）、一周几次、每次多少、组队都放到以后（打卡卡片上的「计划」「组队」）
  const flowOf = () => [isNew && 'hello', isNew && 'intro', needGrade && 'grade', 'subjects', ...SUBJ_CARDS.map(([id]) => id).filter((id) => A.subjs.includes(id)).map((id) => `fams:${id}`)].filter(Boolean);
  let step = 0;
  const inSubj = (sj) => fams.filter((f) => f.subject === sj && !have.some((h) => h.family === f.id))
    .sort((x, y) => (y.grades.includes(A.grade) ? 1 : 0) - (x.grades.includes(A.grade) ? 1 : 0));
  const sel = () => A.sel.map((id) => fams.find((f) => f.id === id)).filter(Boolean);
  const opt = (on, key, val, main, sub = '', tag = '') => `<button class="ob-opt ${on ? 'on' : ''}" data-${key}="${esc(String(val))}">${tag}<b>${main}</b>${sub ? `<span>${sub}</span>` : ''}</button>`;
  const go = async () => {
    const body = adding ? { grade: A.grade, per_week: pr.per_week || 7, level: pr.level || 'easy', merge: true } : { grade: A.grade, per_week: 7, level: 'easy' };
    const dateOf = (id) => A.dates[id] || fams.find((f) => f.id === id)?.next?.date || '';
    await api(`/math/api/students/${enc(st.id)}/prep`, { method: 'PUT', body: { ...body, items: A.sel.map((id) => ({ family: id, exam_date: dateOf(id) })) } });
    store.set('li.obSkip', true);
    if (A.team) { location.hash = '#/team'; return; }
    const r = await api(`/math/api/students/${enc(st.id)}/prep/today?family=${enc(A.sel[0])}`, { method: 'POST' });
    location.href = examUrl(r.subject, r.session_id, false, A.sel[0]);
  };
  // 小铅笔用气泡问问题（参考多邻国）
  const ask = (q, sub = '') => `<div class="ob-ask">${pencil('happy')}<div class="ob-bubble"><b>${q}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  const VIEW = {
    hello: () => `<div class="ob-hello">${pencil('cheer')}<div class="ob-brand">learn-inside</div><p>每天几道真题，养成备考好习惯</p></div>`,
    intro: () => `<div class="ob-intro"><div class="ob-bubble big"><b>你好！我是小铅笔</b><small>回答几个小问题，马上开始第一天</small></div>${pencil('happy')}</div>`,
    grade: () => `${ask('孩子几年级？')}<div class="ob-grid">${GRADE9.map(([g, t]) => opt(A.grade === g, 'grade', g, t)).join('')}</div>`,
    subjects: () => `${ask(adding ? '加哪些科目？' : '准备哪些科目？', '可以多选')}<div class="ob-subjs">${SUBJ_CARDS.map(([id, ic, name]) => {
      const fs = inSubj(id);
      if (!fs.length) return '';
      return `<button class="ob-subj s-${id} ${A.subjs.includes(id) ? 'on' : ''}" data-subj="${id}"><i>${ic}</i><b>${name}</b><span>${fs.map((f) => esc(f.name)).join(' · ')}</span></button>`; }).join('')}</div>`,
    fams: (sj) => `${ask(`准备哪些${SUBJ_NAME[sj]}比赛？`, '可以多选')}<div class="ob-list">${inSubj(sj).map((f) => opt(A.sel.includes(f.id), 'fam', f.id, esc(f.name), esc(f.sets))).join('')}</div>`,
    dates: () => `${ask('什么时候考？')}<div class="ob-list">${sel().map((f) => dateRow(f, A.dates[f.id])).join('')}</div>`,
    how: () => `${ask('怎么练？')}<div class="ob-list">${WKS.map(([n, t]) => opt(A.wk === n, 'wk', n, t)).join('')}</div>
        <div class="ob-list ob-gap">${LEVEL.map(([k, t]) => opt(A.lv === k, 'lv', k, t, perLabel(fams, A.sel, k))).join('')}</div>`,
    team: () => `<div class="ob-sum"><span class="sc-flame on big">${FLAME}</span><h1>准备好了</h1>
        <div class="ob-items">${sel().map((f) => `<div><i class="tc-tag s-${f.subject}">${esc(f.subject_name)}</i><b>${esc(f.name)}</b><span>还有 ${daysTo(A.dates[f.id])} 天</span></div>`).join('')}</div></div>
        <h2 class="ob-q">和同学一起备考？</h2><div class="ob-list">${opt(A.team === true, 'team', 1, '组队', '建一个队，或用邀请码加入')}${opt(A.team === false, 'team', 0, '先自己练')}</div>`,
  };
  const READY = { hello: () => true, intro: () => true, grade: () => !!A.grade, subjects: () => A.subjs.length > 0, fams: (sj) => A.sel.some((id) => fams.find((f) => f.id === id)?.subject === sj), dates: () => A.sel.every((id) => A.dates[id]), how: () => !!A.wk && !!A.lv, team: () => A.team !== null };
  function draw() {
    const flow = flowOf(), [cur, arg] = flow[step].split(':'), LAST = flow.length - 1;
    const p0 = isNew ? 1 : 0; // 欢迎页不算进度
    const skip = cur === 'intro' || (!isNew && !step);
    $app.innerHTML = cur === 'hello' ? `<main class="ob ob-welcome">
      <div class="ob-body">${VIEW.hello()}</div>
      <footer class="ob-foot"><button class="btn primary block" id="obn">开始</button><a class="btn block ob-login" href="/account/">我已有账号</a>
        <a class="ob-browse" href="/" id="ob-browse">先看看真题</a></footer>
    </main>` : `<main class="ob">
      <header class="ob-top">${step ? '<button class="ob-back" id="obb" aria-label="上一步">‹</button>' : '<span></span>'}
        <div class="ob-bar"><i style="width:${((step + 1 - p0) / (flow.length - p0)) * 100}%"></i></div>
        ${skip ? `<a class="ob-skip" href="${adding ? 'javascript:history.back()' : '/'}" id="obs">${adding ? '取消' : '跳过'}</a>` : '<span></span>'}</header>
      <div class="ob-body">${VIEW[cur](arg)}</div>
      <footer class="ob-foot"><button class="btn primary block" id="obn" ${READY[cur](arg) ? '' : 'disabled'}>${step === LAST ? (A.team ? '去组队' : adding ? '开始' : '开始第一天') : '继续'}</button></footer>
    </main>`;
    const redraw = () => { const y = scrollY; draw(); scrollTo(0, y); };
    $app.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => { A.grade = +b.dataset.grade; const s0 = step; redraw(); setTimeout(() => { if (step === s0) $app.querySelector('#obn')?.click(); }, 180); })); // 单选：点了就进下一步
    $app.querySelectorAll('[data-subj]').forEach((b) => (b.onclick = () => {
      const sj = b.dataset.subj;
      if (A.subjs.includes(sj)) { A.subjs = A.subjs.filter((x) => x !== sj); A.sel = A.sel.filter((id) => fams.find((f) => f.id === id)?.subject !== sj); }
      else A.subjs = [...A.subjs, sj];
      redraw();
    }));
    $app.querySelectorAll('[data-fam]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.fam;
      A.sel = A.sel.includes(id) ? A.sel.filter((x) => x !== id) : [...A.sel, id];
      const f = fams.find((x) => x.id === id); if (f?.next && !A.dates[id]) A.dates[id] = f.next.date;
      redraw();
    }));
    $app.querySelectorAll('[data-wk]').forEach((b) => (b.onclick = () => { A.wk = +b.dataset.wk; redraw(); }));
    $app.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => { A.lv = b.dataset.lv; redraw(); }));
    $app.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => { A.team = b.dataset.team === '1'; redraw(); }));
    bindDates($app, A.dates, () => { $app.querySelector('#obn').disabled = !READY.dates(); });
    $app.querySelector('#obb')?.addEventListener('click', () => { step--; draw(); });
    $app.querySelector('.ob-login')?.addEventListener('click', () => store.set('li.hadAccount', true)); // 登录页默认显示「登录」
    $app.querySelector('#ob-browse')?.addEventListener('click', () => { store.set('li.obSkip', true); ev('ob_browse'); }); // 带着目的来的（找某套真题、某节课）：先逛
    $app.querySelector('#obs')?.addEventListener('click', () => { if (!adding) store.set('li.obSkip', true); });
    $app.querySelector('#obn').onclick = async (e) => {
      const btn = e.currentTarget;
      if (cur === 'grade') { // 年级只问一次
        btn.disabled = true;
        try { await load(); } catch (x) { btn.disabled = false; modal(`<h2>网络不太好</h2><p>${esc(x.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); return; }
        api(`/math/api/students/${enc(st.id)}/grade`, { method: 'PUT', body: { grade: A.grade } }).catch(() => {});
      }
      if (cur === 'hello') { ev('ob_start'); load().catch(() => { loadP = null; }); } // 点了开始：后台建游客账号
      if (step < LAST) { step++; draw(); scrollTo(0, 0); return; }
      btn.disabled = true;
      try { await go(); } catch (x) { btn.disabled = false; modal(`<h2>没开始成</h2><p>${esc(x.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
    };
  }
  draw();
}

// ───────── 组队：一起备赛的同学看彼此本周进度；#/team/<邀请码> 是邀请链接 ─────────
async function renderTeam(code) {
  await ensureMe();
  const st = auth.student || lastMe?.students?.[0];
  const t = await api(`/math/api/students/${enc(st.id)}/team`);
  const guest = isGuest();
  const myName = t.team ? '' : (t.nickname && t.nickname !== '同学' ? t.nickname : '');
  const err = (m) => { const e = $app.querySelector('.tf-err'); e.hidden = false; e.textContent = m; };
  const run = async (fn) => { try { await fn(); } catch (x) { err(x.message); } };
  if (code && !t.team) { // 打开邀请链接
    const info = await api(`/math/api/teams/code/${enc(code)}`).catch((x) => ({ error: x.message }));
    $app.innerHTML = `${topnav()}<main class="page narrow"><section class="card team-join">
      ${info.error ? `<p>${esc(info.error)}</p><a class="btn block" href="#/team">返回</a>` : `
      <h1>加入「${esc(info.name)}」</h1><p class="muted">${info.size} 人在一起备赛</p>
      <label class="tf-row"><span>你的昵称</span><input id="tn" maxlength="12" value="${esc(myName)}" placeholder="队友看到的名字"></label>
      ${guest ? `<label class="tf-row"><span>手机号</span><input id="tp" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel"></label>
      <label class="tf-row"><span>设个密码</span><input id="tw" type="password" minlength="6" autocomplete="new-password" placeholder="至少 6 位"></label>` : ''}
      <p class="tf-err" hidden></p><button class="btn primary block" id="tj">${guest ? '注册并加入' : '加入'}</button>
      ${guest ? '<a class="tf-login" href="#/join" id="tl">已有账号？登录后加入</a>' : ''}`}</section></main>`;
    $app.querySelector('#tl')?.addEventListener('click', () => { store.set('li.back', location.pathname + location.hash); auth.clear(); lastMe = null; joinTab = 'login'; });
    $app.querySelector('#tj')?.addEventListener('click', () => run(async () => {
      const nn = $app.querySelector('#tn').value.trim();
      if (!nn) return err('写一个昵称');
      if (guest) { // 游客：先注册（记录保留），再入队
        const ph = $app.querySelector('#tp').value.replace(/\D/g, ''), pw = $app.querySelector('#tw').value;
        if (!/^1\d{10}$/.test(ph)) return err('请输入正确的 11 位手机号');
        if (pw.length < 6) return err('密码至少 6 位');
        await api('/api/account/bind', { method: 'POST', body: { phone: ph, password: pw, nickname: nn } });
        store.set('li.hadAccount', true); lastMe = null; await ensureMe();
      }
      await api('/math/api/teams/join', { method: 'POST', body: { student_id: st.id, code, nickname: nn } });
      auth.setStudent({ ...st, nickname: nn });
      location.hash = '#/';
    }));
    return;
  }
  if (!t.team && guest) { // 游客：建队 / 用邀请码加入都要先注册
    $app.innerHTML = `${topnav()}<main class="page narrow"><header class="ph"><div><h1>组队</h1></div></header>
      <section class="card team-form"><h2>组队要先注册</h2><p class="muted">换手机也在队里，打卡记录都保留</p>
        <a class="btn primary block" href="#/account" data-regp>免费注册</a></section>
      <section class="card team-form"><h2>有邀请码？</h2>
        <label class="tf-row"><span>邀请码</span><input id="tcode" maxlength="6" autocapitalize="characters" placeholder="6 位"></label>
        <button class="btn block" id="tjc">下一步</button></section></main>`;
    $app.querySelector('#tjc').onclick = () => { const c = $app.querySelector('#tcode').value.trim().toUpperCase(); if (c) location.hash = `#/team/${c}`; };
    return;
  }
  if (!t.team) {
    $app.innerHTML = `${topnav()}<main class="page narrow"><header class="ph"><div><h1>组队</h1></div></header>
      <section class="card team-form"><h2>建一个队</h2>
        <label class="tf-row"><span>队名</span><input id="tname" maxlength="16" placeholder="比如：AMC 8 冲刺小组"></label>
        <label class="tf-row"><span>你的昵称</span><input id="tn" maxlength="12" value="${esc(myName)}" placeholder="队友看到的名字"></label>
        <button class="btn primary block" id="tc">建队</button></section>
      <section class="card team-form"><h2>加入队伍</h2>
        <label class="tf-row"><span>邀请码</span><input id="tcode" maxlength="6" autocapitalize="characters" placeholder="6 位"></label>
        <button class="btn block" id="tjc">加入</button></section>
      <p class="tf-err" hidden></p></main>`;
    $app.querySelector('#tc').onclick = () => run(async () => {
      const name = $app.querySelector('#tname').value.trim(), nn = $app.querySelector('#tn').value.trim();
      if (!name) return err('给队伍起个名字');
      if (!nn) return err('写一个昵称');
      await api('/math/api/teams', { method: 'POST', body: { student_id: st.id, name, nickname: nn } });
      router();
    });
    $app.querySelector('#tjc').onclick = () => { const c = $app.querySelector('#tcode').value.trim().toUpperCase(); if (c) location.hash = `#/team/${c}`; };
    return;
  }
  const { team, board } = t;
  const link = `${location.origin}/math/#/team/${team.code}`;
  $app.innerHTML = `${topnav()}<main class="page narrow">
    <header class="ph"><div><h1>${esc(team.name)}</h1><p class="muted">${team.size} 人 · 本周积分排行</p></div></header>
    <section class="card team-board">${board.map((x, i) => `<div class="tb-row ${x.me ? 'me' : ''}">
      <i class="tb-rank r${i + 1}">${i + 1}</i>
      <div class="tb-main"><b>${esc(x.nickname)}${x.me ? '（我）' : ''}</b>
        <div class="tb-bar"><i style="width:${Math.min(100, (x.week_count / x.per_week) * 100)}%"></i></div>
        <small>本周 ${x.week_count}/${x.per_week} 次 · 做了 ${x.week_n} 题${x.streak ? ` · 连续 ${x.streak} ${x.unit}` : ''}</small></div>
      <span class="tb-pts">${STAR}${x.week_points}</span></div>`).join('')}</section>
    <section class="card team-invite"><div><span class="muted small">邀请码</span><b>${esc(team.code)}</b></div><button class="btn primary" id="tcopy">复制邀请链接</button></section>
    <button class="btn block team-leave" id="tleave">退出队伍</button></main>`;
  $app.querySelector('#tcopy').onclick = async (e) => {
    try { await navigator.clipboard.writeText(`来和我一起备赛：${team.name}\n${link}`); e.target.textContent = '已复制'; }
    catch { modal(`<h2>邀请链接</h2><p class="small" style="word-break:break-all">${esc(link)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  };
  $app.querySelector('#tleave').onclick = () => modal(`<h2>退出「${esc(team.name)}」？</h2><div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="yes">退出</button></div>`,
    (el, close) => { el.querySelector('#yes').onclick = async () => { close(); await api('/math/api/teams/leave', { method: 'POST', body: { student_id: st.id } }); router(); }; });
}

// ───────── 备考计划：年级、备考项（每项一个考试日期）、一周几次、每次多少；全部一起存 ─────────
async function renderPlan() {
  await ensureMe();
  const st = auth.student || lastMe?.students?.[0];
  const pr = await api(`/math/api/students/${enc(st.id)}/prep`);
  const fams = pr.families || [];
  const mine = (pr.items || []).filter((x) => x.plan);
  const A = { grade: pr.grade || null, sel: mine.map((x) => x.family), dates: Object.fromEntries(mine.map((x) => [x.family, x.exam_date])), wk: mine.length ? pr.per_week : 7, lv: pr.level || 'easy' };
  function draw() {
    const elig = fams.filter((f) => !A.grade || f.grades.includes(A.grade) || A.sel.includes(f.id));
    $app.innerHTML = `${topnav()}<main class="page narrow">
      <header class="ph"><div><h1>备考计划</h1></div></header>
      <form class="card plan-form" id="pf">
        <label class="pf-row"><span>年级</span><select id="pf-g"><option value="">选择</option>${GRADE9.map(([g, t]) => `<option value="${g}" ${A.grade === g ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="pf-items">${elig.map((f) => { const on = A.sel.includes(f.id);
          return `<div class="pf-item ${on ? 'on' : ''}"><label class="pf-chk"><input type="checkbox" data-pf="${esc(f.id)}" ${on ? 'checked' : ''}><i class="tc-tag s-${f.subject}">${esc(f.subject_name)}</i><b>${esc(f.name)}</b></label>
            ${on ? dateRow(f, A.dates[f.id]) : ''}</div>`; }).join('')}</div>
        <div class="pf-row"><span>一周</span><span class="lang-seg" id="pf-w">${[[3, '3 次'], [5, '5 次'], [7, '每天']].map(([n, t]) => `<button type="button" data-w="${n}" aria-pressed="${n === A.wk}">${t}</button>`).join('')}</span></div>
        <div class="pf-row"><span>每次</span><span class="lang-seg" id="pf-n">${LEVEL.map(([k, t]) => `<button type="button" data-n="${k}" aria-pressed="${k === A.lv}">${t}</button>`).join('')}</span></div>
        ${A.sel.length ? `<p class="pf-per muted small">${perLabel(fams, A.sel, A.lv)}</p>` : ''}
        <p class="pf-err" id="pf-err" hidden></p>
        <button class="btn primary block" type="submit">保存</button>
      </form>
      <section class="card pf-remind"><div class="pf-row"><span>每日提醒</span><span class="pf-rm">
        <select id="pf-rt">${RM_TIMES.map((t) => `<option value="${t}" ${t === (/^\d{4}$/.test(store.get('li.remind') || '') ? store.get('li.remind') : RM_TIMES[2]) ? 'selected' : ''}>${hhmm(t)}</option>`).join('')}</select>
        <button class="btn" type="button" id="pf-rm">加到手机日历</button></span></div></section></main>`;
    $app.querySelector('#pf-g').onchange = (e) => { A.grade = +e.target.value || null; draw(); };
    $app.querySelector('#pf-rm').onclick = () => addReminder($app.querySelector('#pf-rt').value);
    $app.querySelectorAll('[data-pf]').forEach((c) => (c.onchange = () => {
      const id = c.dataset.pf, f = fams.find((x) => x.id === id);
      A.sel = c.checked ? [...A.sel, id] : A.sel.filter((x) => x !== id);
      if (c.checked && f?.next && !A.dates[id]) A.dates[id] = f.next.date;
      draw();
    }));
    bindDates($app, A.dates, () => {});
    $app.querySelector('#pf-w').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) { A.wk = +b.dataset.w; draw(); } };
    $app.querySelector('#pf-n').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) { A.lv = b.dataset.n; draw(); } };
    $app.querySelector('#pf').onsubmit = async (e) => {
      e.preventDefault();
      const err = $app.querySelector('#pf-err');
      try {
        if (!A.grade) throw new Error('请选择年级');
        await api(`/math/api/students/${enc(st.id)}/prep`, { method: 'PUT', body: { grade: A.grade, per_week: A.wk, level: A.lv, items: A.sel.map((id) => ({ family: id, exam_date: A.dates[id] })) } });
        if (history.length > 1) history.back(); else location.href = '/';
      } catch (x) { err.hidden = false; err.textContent = x.message; }
    };
  }
  draw();
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
    // 最上面直接给「下一套」：没做过的里排第一的那套（有没交的就先继续）
    const op = exams.find((e) => e.open_session && e.open_mode !== 'paper'), nx = exams.find((e) => e.last_score === null && !e.open_session);
    const bar = op ? `<div class="next-set"><span><small>没做完</small><b>${esc(op.title)}</b></span><a class="btn primary" href="#/exam/${enc(op.open_session)}">继续答题</a></div>`
      : nx ? `<div class="next-set"><span><small>下一套</small><b>${esc(nx.title)}</b></span><span class="ns-btns"><button class="btn" data-start="${nx.id}" data-mode="practice">逐题练</button><button class="btn primary" data-start="${nx.id}" data-mode="exam">限时模考</button></span></div>` : '';
    body = bar + gridHtml;
  } else if (tab === 'stats') {
    const S = d.stats;
    if (!S.exams) body = '<div class="card"><p class="muted">这种考试的真题还没有录入，暂时没有考情。</p></div>';
    else {
      const maxM = Math.max(...S.modules.map((m) => m.share), 1);
      const units = S.units.filter((u) => u.rate).sort((a, b) => b.share - a.share);
 body = `<div class="stats-grid"><div class="card"><h2>各大类占比</h2>
        
        <div class="mods">${S.modules.filter((m) => m.share > 0).map((m) => `<div class="mrow"><span>${esc(m.name)}</span><span class="mbar"><i style="width:${(m.share / maxM) * 100}%"></i></span><span class="num">${m.share.toFixed(1)}%</span></div>`).join('')}</div></div>
      <div class="card"><h2>各知识项考情</h2>
        
        <table class="utable"><tr><th>知识项</th><th>占比</th><th>考过的年份</th><th>每届</th><th>常见题号</th></tr>
        ${units.map((u) => `<tr><td><a href="#/kp/${enc(u.id)}?family=${enc(fid)}">${esc(u.name)}</a></td><td class="num">${u.share}%</td><td class="num">${u.rate}%</td><td class="num">${u.per_exam} 题</td><td class="num">${u.from === u.to ? u.from : `${u.from}–${u.to}`}</td></tr>`).join('')}</table>
        ${S.units.some((u) => !u.rate) ? `<p class="small muted">没考过：${S.units.filter((u) => !u.rate).map((u) => esc(u.name)).join('、')}</p>` : ''}</div></div>`;
    }
  } else {
    body = `<div class="card">${d.sessions.length ? `<div class="scores">${d.sessions.map((x) => `<a class="score-row" href="#/review/${x.id}">
          <span class="sr-t">${esc(x.title)}<small>${modeName(x.mode)} · ${fmtDate(x.submitted_at)}</small></span>
          <span class="sr-bar"><i style="width:${(x.score / x.total) * 100}%"></i></span><b>${x.score}<small>/${x.total}</small></b></a>`).join('')}</div>` : '<p class="muted">还没有做过这种考试的卷子。</p>'}</div>`;
  }
  const done = exams.filter((e) => e.last_score !== null);
  const best = done.length ? Math.max(...done.map((e) => e.last_score)) : null;
  const avg = d.sessions.length ? (d.sessions.reduce((a, x) => a + x.score, 0) / d.sessions.length).toFixed(1) : null;
  $app.innerHTML = `${topnav()}<main class="page">
    <a href="#/" class="back">${BACK_IC}数学首页</a>
    <header class="ph"><div><h1>${esc(f.name)}</h1><p class="muted">${esc(f.desc)}</p></div>
      <dl class="ph-stats"><div><dt>真题</dt><dd>${exams.length}<small> 套</small></dd></div><div><dt>做过</dt><dd>${done.length}<small> 套</small></dd></div>
        <div><dt>最好成绩</dt><dd>${best ?? '—'}</dd></div><div><dt>平均分</dt><dd>${avg ?? '—'}</dd></div></dl></header>
    <div class="ctabs">${TABS.map(([k, n]) => `<a class="${k === tab ? 'on' : ''}" href="#/contest/${enc(fid)}${k === 'exams' ? '' : '/' + k}">${n}</a>`).join('')}</div>
    ${body}
  </main>`;
  $app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => showInstructions(exams.find((e) => e.id === b.dataset.start), b.dataset.mode)));
  $app.querySelectorAll('[data-paper]').forEach((b) => (b.onclick = () => openExamPrint(exams.find((e) => e.id === b.dataset.paper), b)));
  $app.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => startFill(exams.find((e) => e.id === b.dataset.fill), b)));
  $app.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => { contestGrade[fid] = +b.dataset.grade; saveGrade(); renderContest(fid, tab); }));
}

function showInstructions(exam, mode) {
  const mins = Math.round(exam.duration_sec / 60);
  modal(`<div class="instructions"><h2>${esc(exam.title)} · ${mode === 'exam' ? '限时模考' : '逐题练'}</h2>
    <ol>
      ${/^(hope|swb100)-/.test(exam.id) ? `<li>本卷共 ${exam.problem_count} 题。选择题点选一个选项；填空题填答案，分数写成 3/4；一空要填几个数时按顺序用逗号隔开。</li>
      <li>答对 1 题得 1 分，答错不扣分。</li>
      ${mode === 'practice' ? '' : `<li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>`}
      ${mode === 'practice' ? '<li>练习模式每题提交后马上看对错和解析，也可以逐级看提示（最多 3 级）。</li>' : ''}` : `<li>本卷共 ${exam.problem_count} 道选择题，每题有 A、B、C、D、E 五个选项，只有一个正确。</li>
      ${/^kangaroo-/.test(exam.id) ? `<li>本站按答对题数计分。正式比赛前三分之一每题 3 分、中间 4 分、最后 5 分，答错扣 1 分，不答不扣分。</li>
      <li>不能用计算器或任何电子设备。</li>` : /^amc1[02]-/.test(exam.id) ? `<li>本站按答对题数计分。正式比赛答对 6 分、不答 1.5 分、答错 0 分。</li>
      <li>只允许使用草稿纸、坐标纸、直尺、圆规、量角器和橡皮；不能用计算器或任何电子设备。</li>` : `<li>答对 1 题得 1 分，答错不扣分，所以每题都值得作答。</li>
      <li>只允许使用草稿纸、笔、直尺和橡皮；不能用计算器、量角器、圆规或任何电子设备。</li>`}
      <li>图形不一定按比例绘制。</li>
      ${mode === 'practice' ? '' : `<li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>`}
      ${mode === 'practice' ? '<li>练习模式每题提交后马上看对错和解析，也可以逐级看提示（最多 3 级）。</li>' : ''}`}
    </ol></div>
    <div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="go">开始答题</button></div>`,
  (el, close) => {
    el.querySelector('#go').onclick = async () => {
      const r = await api('/math/api/sessions', { method: 'POST', body: { exam_id: exam.id, student_id: auth.student.id, mode } });
      close(); location.hash = `#/exam/${r.session.id}`;
    };
  });
}

// ───────── 纸笔做：打印整套试卷，做完回来填答案判分（和模考一样进成绩、错题本、知识图谱） ─────────
const paperKey = (examId) => `amc8.paper.${auth.student?.id}.${examId}`;
let ppSpace = true;
const printedKey = (examId) => `amc8.printed.${auth.student?.id}.${examId}`;
// 统一打印预览里的数学纸面：题干按选的语言出，公式用 KaTeX 排版
const katexHref = () => document.querySelector('link[href*="katex"]')?.href;
const typesetReady = async (el) => { for (let i = 0; i < 100 && !window.renderMathInElement; i++) await new Promise((r) => setTimeout(r, 60)); typeset(el); };
function openMathPrint({ name, title, info, items, presets, pick, fetch, en, ans, keys, opts, link, file, standalone, home, onClose, qr, qrText }) {
  const cache = new Map();
  const first = presets[0];
  return openPrint({
    name, title, info, label: en ? '数学 · AMC 8' : '数学', unit: '题', file, standalone, home, onClose, qr, qrText,
    remember: 'math.print', force: opts || null,
    opts: { lang: en ? lang.get() : 'zh', space: true, ans: true, keys: false, ids: first.ids(), rangeLabel: first.label },
    controls: [
      ...(pick ? [{ type: 'range', label: '范围', presets, items: pick, max: PR_MAX }] : []),
      ...(en ? [{ type: 'seg', key: 'lang', label: '语言', options: Object.entries(LANGS) }] : []),
      { type: 'toggle', key: 'space', label: '每题下面留演算空白' },
      ...(ans ? [{ type: 'toggle', key: 'ans', label: '附答案和解题思路' }] : []),
      ...(keys ? [{ type: 'toggle', key: 'keys', label: '附答案' }] : []),
    ],
    async build(o) {
      const need = (o.ids || []).filter((id) => !cache.has(id));
      if (need.length) (await fetch(need)).forEach((x) => cache.set(x.problem_id, x));
      const its = (o.ids || []).map((id) => cache.get(id)).filter(Boolean);
      const L = en ? o.lang : 'zh';
      const h = { esc, rich, stemHtml: (p) => withLang(L, () => stemHtml(p)), isFig, lang: () => L };
      return { blocks: withLang(L, () => sheetBlocks({ items: its, withAns: ans && o.ans, withKeys: keys && o.keys, space: o.space }, h)), count: its.length };
    },
    css: PRINT_CSS, links: [katexHref()].filter(Boolean), typeset: typesetReady, pdfCss: embeddedKatexCss,
    link,
  });
}

// ───────── 纸笔做：打印整套试卷（可附答案表），做完扫码回填判分（和模考一样进成绩、错题本、知识图谱），也可以跳过回填直接看解析 ─────────
const FILL_QR_TEXT = '扫码回填答案、看解析';
async function openExamPrint(exam, btn) {
  if (btn) btn.disabled = true;
  let r;
  try { r = await api(`/math/api/exams/${enc(exam.id)}/print`); }
  catch (err) { if (btn) btn.disabled = false; return modal(`<h2>没能打开打印</h2><p>${esc(err.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  if (btn) btn.disabled = false;
  const en = /^(amc(8|10|12)|kangaroo)-/.test(exam.id); // AMC、袋鼠数学有英文原题
  const sub = `共 ${r.items.length} 题 · ${Math.round(r.exam.duration_sec / 60)} 分钟`;
  store.set(printedKey(exam.id), 1);
  openMathPrint({
    name: r.exam.title, title: r.exam.title, info: ['姓名', '日期', '用时', '得分'], en, ans: false, keys: true, file: 'exam',
    qr: `/math/#/fill/${enc(exam.id)}`, qrText: FILL_QR_TEXT,
    presets: [{ label: `整套 ${r.items.length} 题`, ids: () => r.items.map((x) => x.problem_id) }],
    fetch: async () => r.items,
    link: async (o) => printLinkUrl((await api(`/math/api/exams/${enc(exam.id)}/print-link`, { method: 'POST',
      body: { student_id: auth.student.id, sub, space: o.space, lang: en ? o.lang : 'zh', with_ans: !!o.keys } })).token),
    onClose: () => { if (/^#\/(contest|$)/.test(location.hash) || !location.hash) router(); }, // 卡片上出现「回填答案」
  });
}
async function startFill(exam, btn) {
  if (btn) btn.disabled = true;
  try {
    let sid = store.get(paperKey(exam.id)) || (exam.open_mode === 'paper' ? exam.open_session : null);
    if (sid) {
      const d = await api(`/math/api/sessions/${enc(sid)}`).catch(() => null);
      if (!d || d.session.submitted || d.session.deadline_at < d.session.server_now) { store.del(paperKey(exam.id)); sid = null; }
    }
    if (!sid) {
      const r = await api('/math/api/sessions', { method: 'POST', body: { exam_id: exam.id, student_id: auth.student.id, mode: 'paper' } });
      sid = r.session.id; store.set(paperKey(exam.id), sid);
    }
    location.hash = `#/exam/${sid}`;
  } catch (err) { if (btn) btn.disabled = false; modal(`<p>${esc(err.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
}

/** 回填答案：一屏列出所有题号，选择题点字母，填空题填答案；可填用时 */
function renderPaper(sid, data) {
  const key = `amc8.s.${sid}`;
  const D = draftSync({ api, store, key, sid, server: data.session.draft, init: { answers: {}, used: '' } });
  const { S, save } = D;
  cleanup = () => D.stop();
  const ps = data.problems, total = ps.length;
  const fam = dashFam; // 从哪种考试的试卷列表进来的
  const row = (p) => `<div class="pp-row"><span class="pp-no">${p.number}</span>${isFillP(p)
    ? `<input class="pp-in" data-fill="${esc(p.id)}" type="text" autocomplete="off" autocapitalize="off" enterkeyhint="next" maxlength="40" value="${esc(S.answers[p.id] || '')}" aria-label="第 ${p.number} 题">`
    : `<span class="pp-opts" data-pid="${esc(p.id)}">${Object.keys(p.choices).map((k) => `<button class="pp-opt" data-pick="${k}" aria-pressed="${S.answers[p.id] === k}">${k}</button>`).join('')}</span>`}</div>`;
  $app.innerHTML = `${topnav()}<main class="page">
    <a href="${fam ? `#/contest/${enc(fam)}` : '#/'}" class="back">${BACK_IC}返回试卷</a>
    <header class="ph"><div><h1>${esc(data.exam.title)}</h1><p class="muted">回填答案${isGuest() ? ' · <a href="javascript:" id="pp-login">已有账号？登录</a>' : ''}</p></div><button class="btn pp-skip">直接看解析</button></header>
    <div class="card pp-card">
      <label class="pp-time">用时 <input id="pp-used" type="number" inputmode="numeric" min="0" max="600" value="${esc(S.used)}"> 分钟</label>
      ${ps.some(isFillP) ? '<p class="small muted pp-fmt">分数写成 3/4；一空要填几个数时按顺序用逗号隔开。</p>' : ''}
      <div class="pp-list">${ps.map(row).join('')}</div>
      <div class="pp-foot"><span class="muted" id="pp-count"></span><span class="pp-acts"><button class="btn pp-skip">直接看解析</button><button class="btn primary" id="pp-submit">交卷判分</button></span></div>
    </div></main>`;
  $app.querySelector('#pp-login')?.addEventListener('click', () => { // 游客回填页上登录：登录后回到这一页，记到账号上
    store.set('li.back', `${location.pathname}#/fill/${enc(data.exam.id)}`); auth.clear(); lastMe = null; joinTab = 'login'; location.hash = '#/join';
  });
  const skip = () => modal(`<h2>跳过回填？</h2>
      <p>不回填就不会判分，错题不会收进错题本，知识图谱（孩子的薄弱点画像）也不会更新。</p>
      <div class="actions"><button class="btn" data-close>回去填答案</button><a class="btn primary" href="#/sol/${enc(data.exam.id)}" id="skip-yes">直接看解析</a></div>`,
    (el) => { el.querySelector('#skip-yes').addEventListener('click', () => ev('skip_fill')); });
  $app.querySelectorAll('.pp-skip').forEach((b) => (b.onclick = skip));
  const count = () => { $app.querySelector('#pp-count').textContent = `已填 ${ps.filter((p) => S.answers[p.id]).length} / ${total}`; };
  count();
  $app.querySelectorAll('.pp-opts').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const pid = box.dataset.pid, k = b.dataset.pick;
    if (S.answers[pid] === k) delete S.answers[pid]; else S.answers[pid] = k; // 再点一次取消
    box.querySelectorAll('[data-pick]').forEach((x) => x.setAttribute('aria-pressed', String(S.answers[pid] === x.dataset.pick)));
    save(); count();
  }));
  const ins = [...$app.querySelectorAll('[data-fill]')];
  ins.forEach((inp, i) => {
    inp.addEventListener('input', () => { const v = inp.value.trim(); if (v) S.answers[inp.dataset.fill] = v; else delete S.answers[inp.dataset.fill]; save(); count(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (ins[i + 1] || inp).focus(); if (!ins[i + 1]) inp.blur(); } });
  });
  $app.querySelector('#pp-used').addEventListener('input', (e) => { S.used = e.target.value; save(); });
  $app.querySelector('#pp-submit').onclick = () => {
    const un = ps.filter((p) => !S.answers[p.id]);
    modal(`<h2>确认交卷？</h2>
      <p>已填 <b>${total - un.length}</b> 题，没填 <b style="color:var(--bad)">${un.length}</b> 题。</p>
      ${un.length ? `<p class="small muted">没填：${un.map((x) => x.number).join('、')}。</p>` : ''}
      <p class="small muted">交卷后不能再修改答案。</p>
      <div class="actions"><button class="btn" data-close>继续填</button><button class="btn primary" id="yes">确认交卷</button></div>`,
    (el, close) => { el.querySelector('#yes').onclick = async () => {
      try {
        await api(`/math/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, used_min: S.used === '' ? null : Number(S.used) } });
      } catch (e) { close(); return modal(`<h2>交卷失败</h2><p>${esc(e.message)}</p><p class="small muted">填的答案已保存在本机。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
      D.stop(true); store.del(key); store.del(paperKey(data.exam.id));
      close(); location.hash = `#/review/${sid}`;
    }; });
  };
}

// ───────── 考试界面（按 AMC 8 中国区线上考试操作手册“第八步”截图还原） ─────────
// 布局：顶栏（刷新 / 大字号 / 剩余时间 / 交卷）+ 左侧答题卡（进度、题号格、图例）+ 右侧一题一屏
async function renderExam(sid) {
  const [data] = await Promise.all([api(`/math/api/sessions/${sid}`), ensureMe()]); // 账号信息：完成页要知道是不是游客（要不要请他注册）
  if (data.session.submitted) { location.replace(data.session.prep ? examUrl(data.session.prep.subject, sid, true, data.session.prep.family) : `#/review/${sid}`); return; }
  if (data.session.drill && (data.session.prep || data.session.extra)) return renderDaily(sid, data); // 每日打卡、加练：一屏一题的简洁页
  if (data.session.mode === 'paper') return renderPaper(sid, data);
  document.body.classList.add('exam-mode');
  // 希望数学：布局同 AMC 8，用 learn-inside 自己的风格
  const li = /^(hope|swb100)-/.test(data.exam.id || '') || (data.session.drill && !hasEn(data.problems));
  document.body.classList.toggle('exam-li', !!li);
  const key = `amc8.s.${sid}`;
  const D = draftSync({ api, store, key, sid, server: data.session.draft, init: { answers: {}, flags: {}, times: {}, hints: {}, checked: {}, cur: 0, big: false } });
  const { S } = D;
  S.checked ||= {}; // 练习：每题提交后的结果（对错、答案、解题思路、互动解析）
  const problems = data.problems;
  const clockOffset = data.session.server_now - Date.now();
  const practice = data.session.mode === 'practice';
  const prepS = !!data.session.prep; // 每日打卡题：全部提交完就能打卡
  const en = hasEn(problems);
  let enteredAt = Date.now();
  let submitting = false;
  let cardOpen = false; // 窄屏时答题卡默认收起

  const save = D.save;
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
    const ck = practice ? S.checked[p.id] : null; // 练习：这题已经提交过
    const optCls = (k) => !ck ? (S.answers[p.id] === k ? 'sel' : '') : k === ck.answer ? 'right' : S.answers[p.id] === k ? 'wrong' : '';
    $app.innerHTML = `<div class="ez ${S.big ? 'big' : ''}">
      <header class="ez-top">
        <button class="ez-cardbtn" id="cardbtn">${icon('menu', 15)}答题卡</button>
        <span class="ez-user">${icon('account', 15)}${esc(auth.student?.nickname || '')}</span>
        <span class="ez-title">${esc(data.exam.title)}${practice ? '<span class="ez-mode">逐题练</span>' : ''}</span>
        <span class="ez-sp"></span>
        <span class="ez-tools" id="tools">${en ? langSeg() : ''}<button class="ez-tool" id="refresh" title="图片没显示完整时点一下">⟳ 刷新</button>
        <button class="ez-tool ${S.big ? 'on' : ''}" id="font">A<small>A</small> 大字号</button></span>
        <button class="ez-tool ez-more" id="more" aria-label="更多" aria-expanded="false">⋯</button>
        <span class="ez-timer" id="timer"><i class="ez-tl">${practice ? '已用' : '剩余时间'}</i> <b>--:--</b></span>
        <button class="ez-submit" id="submit">${prepS ? '完成打卡' : '交卷'}</button>
      </header>
      <div class="ez-body">
        <aside class="ez-card ${cardOpen ? 'open' : ''}">
          <div class="ez-card-head"><b>答题卡</b><span class="muted">${icon('menu', 16)}</span></div>
          <div class="ez-progress"><div class="ez-prow"><span>进度</span><span>${answered}/${problems.length}</span></div>
            <div class="ez-pbar"><div style="width:${(answered / problems.length) * 100}%"></div></div></div>
          <div class="ez-grid">${problems.map((x, i) => `<button class="ez-cell ${S.answers[x.id] ? 'done' : ''} ${practice && S.checked[x.id] ? (S.checked[x.id].correct ? 'ok' : 'bad') : ''} ${S.flags[x.id] ? 'flag' : ''} ${i === S.cur ? 'cur' : ''}" data-go="${i}">${x.number}</button>`).join('')}</div>
          <div class="ez-legend"><span><i class="lg done"></i>已答</span><span><i class="lg"></i>未答</span><span><i class="lg flag"></i>标记</span></div>
        </aside>
        <main class="ez-main">
          <div class="ez-q">
            <div class="ez-qhead"><span class="ez-qno">${li ? `第 ${p.number} 题<small>1 分</small>` : `${p.number}.(1分)`}${data.session.drill ? ` <span class="ez-src">${esc(p.label)}</span>` : ''}</span>
              <button class="ez-pin ${S.flags[p.id] ? 'on' : ''}" id="flag" title="标记这道题，稍后回来检查">${icon('flag', 14)}${S.flags[p.id] ? '已标记' : '标记'}</button></div>
            <div class="ez-stem">${stemHtml(p)}</div>
            ${p.figure ? `<div class="figure">${p.figure}</div>` : ''}
            ${isFillP(p) ? `<label class="ez-fill"><span>答</span><input id="fill" type="text" autocomplete="off" enterkeyhint="next" maxlength="40" value="${esc(S.answers[p.id] || '')}" ${ck ? 'disabled' : ''}></label>`
              : `<ul class="ez-opts ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="ez-opt ${optCls(k)} ${ck ? 'locked' : ''}" data-choice="${k}" role="radio" aria-checked="${S.answers[p.id] === k}"><span class="ez-letter">${k}</span><span class="ez-otext">${choiceHtml(p, k)}</span></li>`).join('')}</ul>`}
            <div class="ez-nav">
              <button class="ez-btn" id="prev" ${S.cur === 0 ? 'disabled' : ''}>上一题</button>
              ${practice && !ck ? `<button class="ez-btn check" id="check" ${S.answers[p.id] ? '' : 'disabled'}>提交</button>` : ''}
              <button class="ez-btn next" id="next" ${S.cur === problems.length - 1 ? 'disabled' : ''}>下一题</button>
              ${practice && !ck && p.hint_count ? `<button class="ez-btn hint" id="hint" ${hints.length >= p.hint_count ? 'disabled' : ''}>${icon('bulb', 15)}提示 ${hints.length}/${p.hint_count}</button>` : ''}
            </div>
            ${hints.length && !ck ? `<div class="hint-box">${hints.map((h, i) => `<div class="hint"><b>提示 ${i + 1}</b>${rich(h)}</div>`).join('')}</div>` : ''}
            ${ck ? `<div class="ck-box ${ck.correct ? 'ok' : 'bad'}">
              <div class="ck-top">${ck.self ? '' : pencil(ck.correct ? 'happy' : 'think')}<div class="ck-head">${ck.self ? `参考答案 <b>${esc(ck.answer)}</b>` : ck.correct ? '答对了' : `再看看这一步，正确答案 <b>${esc(ck.answer)}</b>`}</div>
                ${ck.points ? `<span class="ck-pts">+${ck.points}${STAR}</span>` : ''}</div>
              ${ck.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(ck.basic)}</div>` : ''}
              ${ck.advanced ? advCard(p.id, ck.advanced) : ''}</div>` : ''}
            ${ck && prepS && problems.every((x) => S.checked[x.id]) ? '<button class="btn primary block" id="prep-done">完成打卡</button>' : ''}
          </div>
        </main>
      </div>
      ${cardOpen ? '<div class="ez-mask" id="mask"></div>' : ''}
    </div>`;
    typeset($app);
    tick();

    $app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    $app.querySelectorAll('[data-choice]').forEach((c) => (c.onclick = () => { if (ck) return; S.answers[p.id] = c.dataset.choice; save(); draw(); }));
    const cb = $app.querySelector('#check');
    if (cb) cb.onclick = async () => {
      cb.disabled = true;
      try {
        const r = await api(`/math/api/sessions/${sid}/check`, { method: 'POST', body: { problem_id: p.id, answer: S.answers[p.id] } });
        S.checked[p.id] = r; save(); draw();
      } catch (e) { cb.disabled = false; modal(`<h2>没提交上</h2><p>${esc(e.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
    };
    if (ck?.advanced) { $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv))); paintThumbs($app, { [p.id]: ck.advanced }); }
    const fill = $app.querySelector('#fill');
    if (fill) {
      // 只更新答题卡，不重画（重画会打断输入）
      const mark = () => { const v = fill.value.trim(); if (v) S.answers[p.id] = v; else delete S.answers[p.id]; save();
        const c = $app.querySelector('#check'); if (c) c.disabled = !v;
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
    $app.querySelector('#more').onclick = (e) => { // 手机：刷新、大字号收进「⋯」
      e.stopPropagation();
      const t = $app.querySelector('#tools'), open = t.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', open);
      if (open) document.addEventListener('click', () => t.classList.remove('open'), { once: true });
    };
    onLang($app, draw);
    $app.querySelector('#cardbtn').onclick = () => { cardOpen = !cardOpen; draw(); };
    $app.querySelector('#mask')?.addEventListener('click', () => { cardOpen = false; draw(); });
    $app.querySelector('#submit').onclick = prepS && problems.every((x) => S.checked[x.id]) ? () => submit(false) : confirmSubmit;
    $app.querySelector('#prep-done')?.addEventListener('click', () => submit(false));
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
    const el = document.getElementById('timer');
    if (practice) { if (el) el.querySelector('b').textContent = fmtTime((Date.now() + clockOffset - data.session.started_at) / 1000); return; } // 练习不计时、不自动交卷，只显示已用时间
    const left = (data.session.deadline_at - (Date.now() + clockOffset)) / 1000;
    if (el) { el.querySelector('b').textContent = fmtTime(left); el.classList.toggle('warn', left <= 300); }
    if (left <= 0 && !submitting) submit(true);
  }
  const timer = setInterval(tick, 500);

  // 键盘：A–E 选答案，←/→ 翻题
  const onKey = (e) => {
    if ($modal.innerHTML || e.target.tagName === 'INPUT') return;
    const k = e.key.toUpperCase();
    const cp = problems[S.cur];
    if (k.length === 1 && !isFillP(cp) && !(practice && S.checked[cp.id]) && Object.prototype.hasOwnProperty.call(cp.choices, k)) { S.answers[cp.id] = k; save(); draw(); }
    else if (e.key === 'ArrowRight') go(S.cur + 1);
    else if (e.key === 'ArrowLeft') go(S.cur - 1);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { clearInterval(timer); document.removeEventListener('keydown', onKey); D.stop(); };

  async function submit(auto) {
    if (submitting) return;
    submitting = true; flushTime(); save();
    if (auto) modal('<h2>考试时间到</h2><p>系统正在自动交卷…</p>');
    try {
      const r = await api(`/math/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times, flags: S.flags } });
      D.stop(true); store.del(key);
      $modal.innerHTML = '';
      if (prepS && r.session?.prep?.done) { cleanup?.(); cleanup = null; document.body.classList.remove('exam-mode', 'exam-li'); return celebrate(r, sid); }
      location.hash = `#/review/${sid}`;
    } catch (e) {
      submitting = false;
      modal(`<h2>交卷失败</h2><p>${esc(e.message)}</p><p class="small muted">答案已保存在本机，网络恢复后再点“交卷”即可。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
    }
  }

  draw();
}

// ───────── 每日打卡答题页（参考多邻国）：顶部进度条，一屏一题，底部大按钮「检查」，答完从底部弹出对错和解析；
// 不计时；本次答错的题最后再出一遍（不再加分）；数学、语文打卡都用这一页 ─────────
async function renderDaily(sid, data) {
  document.body.classList.add('exam-mode', 'daily-mode');
  const key = `amc8.s.${sid}`;
  const D = draftSync({ api, store, key, sid, server: data.session.draft, init: { answers: {}, times: {}, hints: {}, checked: {}, cur: 0, redo: [], redone: {} } });
  const { S } = D;
  S.checked ||= {}; S.redo ||= []; S.redone ||= {}; S.hints ||= {};
  const problems = data.problems, byId = Object.fromEntries(problems.map((p) => [p.id, p]));
  const en = hasEn(problems);
  let enteredAt = Date.now(), submitting = false, open = false, pick = null, redoPick = null;
  // 第几步：先把每道题做一遍，再重做这次错的
  const queue = () => [...problems.map((p) => ({ p, redo: false })), ...S.redo.map((id) => ({ p: byId[id], redo: true }))];
  for (const h of data.hints_seen || []) { const l = S.hints[h.problem_id] ||= []; if (!l[h.level - 1]) try { l[h.level - 1] = (await api(`/math/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: h.problem_id, level: h.level } })).content; } catch {} }
  const flush = (p) => { S.times[p.id] = (S.times[p.id] || 0) + (Date.now() - enteredAt) / 1000; enteredAt = Date.now(); };
  const allDone = () => queue().every((q) => (q.redo ? S.redone[q.p.id] : S.checked[q.p.id]));

  function draw() {
    const Q = queue(), i = Math.min(S.cur, Q.length - 1), { p, redo } = Q[i];
    const ck = redo ? S.redone[p.id] : S.checked[p.id];
    const ans = redo ? redoPick : S.answers[p.id];
    const right = S.checked[p.id]?.answer;
    const hints = S.hints[p.id] || [];
    const fill = isFillP(p);
    const optCls = (k) => !ck ? (ans === k ? 'sel' : '') : k === right ? 'right' : ans === k ? 'wrong' : '';
    const done = Q.filter((q, j) => j < i || (j === i && ck)).length;
    const last = i === Q.length - 1;
    const c0 = S.checked[p.id];
    $app.innerHTML = `<div class="dl">
      <header class="dl-top"><a class="dl-x" href="/" aria-label="先不做了，回首页">✕</a>
        <div class="dl-bar"><i style="width:${(done / Q.length) * 100}%"></i></div>
        ${en ? `<span class="dl-lang">${langSeg()}</span>` : `<span class="dl-n">${i + 1}/${Q.length}</span>`}</header>
      <main class="dl-main">
        ${redo ? '<div class="dl-redo">再做一次刚才错的</div>' : `<div class="dl-src">${esc(p.label || '')}</div>`}
        <div class="dl-stem">${stemHtml(p)}</div>
        ${p.figure ? `<div class="figure">${p.figure}</div>` : ''}
        ${fill ? `<input class="dl-fill" id="fill" type="text" inputmode="text" autocomplete="off" enterkeyhint="done" maxlength="40" placeholder="填答案" value="${esc(ans || '')}" ${ck ? 'disabled' : ''}>`
          : `<div class="dl-opts ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<button class="dl-opt ${optCls(k)}" data-choice="${k}" ${ck ? 'disabled' : ''}><span class="dl-k">${k}</span><span class="dl-c">${choiceHtml(p, k)}</span></button>`).join('')}</div>`}
        ${!ck && !redo && p.hint_count ? `<button class="dl-hint" id="hint" ${hints.length >= p.hint_count ? 'disabled' : ''}>${icon('bulb', 16)}提示 ${hints.length}/${p.hint_count}</button>` : ''}
        ${hints.length && !ck && !redo ? `<div class="hint-box">${hints.map((h, j) => `<div class="hint"><b>提示 ${j + 1}</b>${rich(h)}</div>`).join('')}</div>` : ''}
      </main>
      <footer class="dl-foot ${ck ? (ck.correct ? 'ok' : 'bad') : ''} ${open ? 'open' : ''}">
        ${ck ? `<div class="dl-res">${pencil(ck.correct ? 'happy' : 'think')}<div><b>${ck.correct ? (redo ? '改对了！' : '答对了！') : `正确答案 ${esc(right ?? '')}`}</b>${!ck.correct ? '<small>看看解析，最后会再出一次</small>' : ''}</div>
            ${ck.points ? `<span class="ck-pts">+${ck.points}${STAR}</span>` : ''}</div>
          ${c0?.basic || c0?.advanced ? `<button class="dl-why" id="why">${open ? '收起解析' : '看解析'}</button>` : ''}
          ${open ? `<div class="dl-sol">${c0?.basic ? `<div class="solution">${rich(c0.basic)}</div>` : ''}${c0?.advanced ? advCard(p.id, c0.advanced) : ''}</div>` : ''}
          <button class="dl-go" id="go">${last && allDone() ? '完成打卡' : '继续'}</button>`
        : `<button class="dl-go" id="go" ${ans ? '' : 'disabled'}>检查</button>`}
      </footer>
    </div>`;
    typeset($app);
    if (open && c0?.advanced) { $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv))); paintThumbs($app, { [p.id]: c0.advanced }); }
    onLang($app, draw);
    $app.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => { if (redo) redoPick = b.dataset.choice; else { S.answers[p.id] = b.dataset.choice; save(); } draw(); }));
    const f = $app.querySelector('#fill');
    if (f) {
      f.addEventListener('input', () => { const v = f.value.trim(); if (redo) redoPick = v || null; else { if (v) S.answers[p.id] = v; else delete S.answers[p.id]; save(); } $app.querySelector('#go').disabled = !v; });
      f.addEventListener('keydown', (e) => { if (e.key === 'Enter' && f.value.trim()) { e.preventDefault(); $app.querySelector('#go').click(); } });
    }
    $app.querySelector('#why')?.addEventListener('click', () => { open = !open; draw(); });
    $app.querySelector('#hint')?.addEventListener('click', async () => {
      const level = hints.length + 1;
      const r = await api(`/math/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: p.id, level } });
      (S.hints[p.id] ||= [])[level - 1] = r.content; save(); draw();
    });
    $app.querySelector('#go').onclick = async (e) => {
      const btn = e.currentTarget;
      if (!ck) { // 检查
        if (redo) { // 重做：本地对答案，不再加分
          const norm = (x) => String(x ?? '').replace(/\s+/g, '').toUpperCase();
          S.redone[p.id] = { correct: norm(redoPick) === norm(right) }; save(); draw(); return;
        }
        btn.disabled = true;
        try {
          flush(p);
          const r = await api(`/math/api/sessions/${sid}/check`, { method: 'POST', body: { problem_id: p.id, answer: S.answers[p.id] } });
          S.checked[p.id] = r;
          if (!r.correct && !r.self && !S.redo.includes(p.id)) S.redo.push(p.id);
          open = false; save(); draw();
          try { navigator.vibrate?.(r.correct ? 20 : [20, 60, 20]); } catch {}
        } catch (x) { btn.disabled = false; modal(`<h2>没提交上</h2><p>${esc(x.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
        return;
      }
      if (last && allDone()) return submit();
      S.cur = i + 1; open = false; redoPick = null; enteredAt = Date.now(); save(); draw(); scrollTo(0, 0);
    };
  }
  const save = D.save;
  const onKey = (e) => {
    if ($modal.innerHTML || e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') { const g = $app.querySelector('#go'); if (g && !g.disabled) g.click(); return; }
    const k = e.key.toUpperCase(), b = $app.querySelector(`.dl-opt[data-choice="${k}"]:not([disabled])`);
    if (b) b.click();
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('daily-mode'); D.stop(); };

  async function submit() {
    if (submitting) return;
    submitting = true; save();
    try {
      const r = await api(`/math/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times, flags: {} } });
      D.stop(true); store.del(key);
      cleanup?.(); cleanup = null; document.body.classList.remove('exam-mode', 'exam-li', 'daily-mode');
      if (r.session?.prep?.done) return celebrate(r, sid);
      if (data.session.extra) return extraDone(r, sid, data.session.extra, Object.values(S.checked).reduce((a, c) => a + (c.points || 0), 0));
      location.replace(examUrl(r.session?.prep?.subject || 'math', sid, true, r.session?.prep?.family));
    } catch (x) {
      submitting = false;
      modal(`<h2>没交上</h2><p>${esc(x.message)}</p><p class="small muted">答案已保存在本机，网络好了再点一次。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
    }
  }
  draw();
}

// 加练：打完卡还想做，再出一组（不算打卡）
async function startExtra(family) {
  const st = auth.student;
  const r = await api(`/math/api/students/${enc(st.id)}/prep/extra?family=${enc(family)}`, { method: 'POST' });
  location.href = `/math/#/exam/${enc(r.session_id)}`;
}
function extraDone(r, sid, family, pts) {
  const sub = family === 'hanzi' || family === 'gushiwen' ? 'chinese' : 'math';
  $app.innerHTML = `<main class="ob"><div class="ob-body"><div class="ob-hello">${pencil('cheer')}<div class="ob-brand">加练完成</div>
      <p>答对 ${r.session.score}/${r.total}${pts ? ` · +${pts} 积分` : ''}</p></div></div>
    <footer class="ob-foot ob-welcome-foot"><button class="btn primary block" id="x-more">再练一组</button>
      <a class="btn block" href="${examUrl(sub, sid, true, family)}">看解析</a><a class="btn block" href="/">回首页</a></footer></main>`;
  $app.querySelector('#x-more').onclick = () => startExtra(family);
}

// ───────── 复盘 ─────────
const REASONS = [['unknown', '不会'], ['careless', '粗心'], ['no_time', '没时间'], ['reading', '没读懂题']];

// ───────── 整套解析（扫码后跳过回填）：每题的答案、解题思路、互动解析和考点；不记成绩 ─────────
async function renderSolutions(examId) {
  const r = await api(`/math/api/exams/${enc(examId)}/solutions`);
  await ensureMe();
  const en = hasEn(r.items);
  $app.innerHTML = `${topnav()}<main class="page">
    <header class="ph"><div><h1>${esc(r.exam.title)}</h1><p class="muted">答案和解析</p></div>${en ? `<div class="row">${langSeg()}</div>` : ''}</header>
    <div class="cols rev"><aside class="col-side rev-side"><div class="card">
      <div class="qgrid">${r.items.map((it) => `<a href="javascript:" data-jump="${it.number}" class="sol-q">${it.number}</a>`).join('')}</div>
      <div class="rev-btns"><button class="btn primary" id="sol-fill">回填答案、判分</button></div>
    </div></aside>
    <div class="col-main">${r.items.map((it) => `<details class="ritem sol" id="q${it.number}">
      <summary><b>${qLabel(it.number, en)}</b><span class="muted small">答案 <b class="sol-key">${esc(it.answer)}</b></span></summary>
      <div class="body">
        <div class="stem">${stemHtml(it)}${it.figure ? `<div class="figure">${it.figure}</div>` : ''}</div>
        ${isFillP(it) ? '' : `<ul class="choices ${figChoices(it) ? 'figs' : ''}">${Object.keys(it.choices).map((k) => `<li class="choice ${k === it.answer ? 'correct' : ''}"><span class="letter">${k}</span><span>${choiceHtml(it, k)}</span></li>`).join('')}</ul>`}
        ${it.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(it.basic)}</div>` : ''}
        ${it.advanced ? advCard(it.problem_id, it.advanced) : ''}
        <div class="section-label">考点</div>${typeChips(it.types)}${kpCards(it.kps)}
      </div></details>`).join('')}</div></div>
  </main>`;
  $app.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = () => { const d = document.getElementById('q' + a.dataset.jump); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  $app.querySelector('#sol-fill').onclick = (e) => startFill({ id: r.exam.id }, e.currentTarget);
  typeset($app);
  bindKpCards($app);
  $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv)));
  paintThumbs($app, Object.fromEntries(r.items.filter((x) => x.advanced).map((x) => [x.problem_id, x.advanced])));
  onLang($app, router);
}

async function renderReview(sid) {
  const r = await api(`/math/api/sessions/${sid}/review`);
  if (!lastMe) try { lastMe = await api('/math/api/me'); } catch {}
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const paper = r.session.mode === 'paper';
  // 限时模考 / 纸笔卷：空着算错；逐题练 / 打卡：空着记「未作」，不算错
  const wrong = r.items.filter((i) => !i.correct && !i.skipped), skipped = r.items.filter((i) => i.skipped);
  const blankN = wrong.filter((i) => i.choice === null).length;
  const en = hasEn(r.items);
  // 游客：顶部一条注册提示（可以关，关了一周内不再出现）；记下交过的卷子数，到第 3 套提醒一次
  const subs = store.get('li.subs', []) || [];
  if (!subs.includes(sid)) { subs.push(sid); store.set('li.subs', subs.slice(-20)); }
  const scanned = paper && store.get('li.scanned');
  const nudge = isGuest() && !(Date.now() - (store.get('li.nudgeOff') || 0) < 7 * 864e5) ? `<div class="reg-nudge">
    <div><b>${scanned ? '注册后，手机和电脑的记录合在一起' : '做题记录现在只存在这台设备上'}</b><span>${scanned ? '在电脑上用同一个手机号登录，扫码回填的成绩和错题都能看到' : '注册后换设备也能接着看，还送 10 次互动解析'}</span></div>
    <a class="btn primary" href="#/account" data-regp>免费注册</a><button class="x" aria-label="关闭">×</button></div>` : '';
  $app.innerHTML = `${topnav()}<main class="page">
    <header class="ph"><div><h1>${esc(r.exam.title)}</h1><p class="muted">${r.session.prep?.done ? `<b class="prep-ok">打卡 · ${fmtDate(r.session.submitted_at)}</b>` : `${modeName(r.session.mode)} · ${fmtDate(r.session.submitted_at)}`}</p></div>
      ${en ? `<div class="row">${langSeg()}</div>` : ''}</header>
    <div class="cols rev"><aside class="col-side rev-side"><div class="card">
      <div class="rev-score"><b>${r.session.score}</b><span>/ ${r.total}</span></div>
      <dl class="rev-meta"><div><dt>用时</dt><dd>${paper && !used ? '—' : fmtTime(used)}${r.session.mode === 'practice' ? '' : ` <small>/ ${fmtTime(r.exam.duration_sec)}</small>`}</dd></div>${skipped.length ? `<div><dt>错 / 未作</dt><dd>${wrong.length} / ${skipped.length}</dd></div>` : `<div><dt>错</dt><dd>${wrong.length}${blankN ? ` <small>含空 ${blankN}</small>` : ''}</dd></div>`}</dl>
      <div class="qgrid">${r.items.map((it) => `<a href="javascript:" data-jump="${it.number}" class="${it.correct ? 'right' : it.skipped ? 'blank' : 'wrong'}">${it.number}</a>`).join('')}</div>
      <div class="rev-btns">${r.session.prep ? '<a class="btn primary" href="/">回首页</a>' : isGuest() ? `${nudge ? '' : '<a class="btn primary" href="#/account" data-regp>免费注册</a>'}<a class="btn" href="#/">再做一套</a>` : '<a class="btn primary" href="#/mistakes">去错题本订正</a><a class="btn" href="#/graph">看知识图谱</a>'}</div>
    </div></aside>
    <div class="col-main">${nudge}${r.items.map(itemView).join('')}</div></div>
  </main>`;
  $app.querySelector('.reg-nudge .x')?.addEventListener('click', (e) => { store.set('li.nudgeOff', Date.now()); e.currentTarget.parentElement.remove(); });
  if (isGuest() && subs.length >= 3 && !store.get('li.reg3')) { // 做到第 3 套：提醒一次
    store.set('li.reg3', true);
    modal(`<h2>已经做了 ${subs.length} 套了</h2><p>这些成绩和错题现在只存在这台设备上。注册后换设备也不会丢，还送 10 次互动解析。</p>
      <div class="actions"><button class="btn" data-close>以后再说</button><a class="btn primary" href="#/account" data-regp>免费注册</a></div>`);
  }
  $app.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = () => { const d = document.getElementById('q' + a.dataset.jump); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  typeset($app);

  function itemView(it) {
    const cls = it.skipped ? 'blank' : it.correct ? 'right' : 'wrong';
    return `<details class="ritem ${cls}" id="q${it.number}" ${it.correct || it.skipped ? '' : 'open'}>
      <summary><span class="mark">${it.correct ? '✓' : it.skipped ? '–' : '✗'}</span>
        <b>${qLabel(it.number, en)}</b>${r.session.mode !== 'exam' && r.exam.id === 'drill' ? `<span class="muted small">${esc(it.label)}</span>` : ''}
        <span class="muted small">${it.skipped ? '未作' : it.choice === null ? '未作答' : `你的答案 ${esc(it.choice)}`}${it.correct || it.skipped ? '' : ` · 正确答案 ${esc(it.answer)}`}</span>
        <span class="meta">${paper ? '' : fmtTime(it.time_sec)}${it.hints_used ? ` · 提示 ${it.hints_used} 级` : ''}${it.flagged ? ' · 已标记' : ''}</span></summary>
      <div class="body">
        <div class="stem">${stemHtml(it)}${it.figure ? `<div class="figure">${it.figure}</div>` : ''}</div>
        ${isFillP(it) ? fillResult(it.choice, it.answer, it.correct) : `<ul class="choices ${figChoices(it) ? 'figs' : ''}">${Object.keys(it.choices).map((k) => `<li class="choice ${k === it.answer ? 'correct' : k === it.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(it, k)}</span></li>`).join('')}</ul>`}
        ${it.correct || it.skipped ? '' : `<div class="section-label">错因</div><div class="reason-chips row" data-attempt="${it.attempt_id}">
          ${REASONS.map(([k, label]) => `<button data-reason="${k}" class="${it.error_reason === k ? 'on' : ''}">${label}</button>`).join('')}</div>`}
        ${it.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(it.basic)}</div>` : ''}
        ${it.advanced ? advCard(it.problem_id, it.advanced) : ''}
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
  paintThumbs($app, Object.fromEntries(r.items.filter((x) => x.advanced).map((x) => [x.problem_id, x.advanced])));
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

// ───────── 互动解析缩略图：课件里第一张图（互动演示优先）缩小放在卡片上，点开就是全屏播放 ─────────
const advCard = (pid, a) => `<button class="adv-card" data-adv="${esc(pid)}">
  <span class="adv-thumb lp"><span class="adv-pic" data-thumb="${esc(pid)}"></span><span class="adv-play">${icon('play', 18)}</span></span>
  <span class="adv-txt"><b>互动解析</b><span>${a.steps ? `${a.steps} 步` : ''}${a.locked ? icon('lock', 15) : ''}</span></span></button>`;
/** 把缩略图画进 [data-thumb]：分步图取第一帧；互动演示在屏幕外跑一次，取它画出来的图 */
function paintThumbs(root, map) {
  const off = document.createElement('div');
  off.className = 'lp';
  off.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;visibility:hidden';
  document.body.appendChild(off);
  try {
    root.querySelectorAll('[data-thumb]').forEach((el) => {
      const t = map[el.dataset.thumb]?.thumb;
      let html = '';
      if (t?.svg) html = `<svg viewBox="0 0 ${t.vw} ${t.vh}" class="lp-sim slsvg" xmlns="http://www.w3.org/2000/svg">${t.svg}</svg>`;
      if (!html && t?.sim && SIMS[t.sim.sim]) {
        const s = JSON.parse(JSON.stringify(t.sim));
        // 会自己播放的演示：取中间偏后的一帧，比开头那帧更能看出在演示什么
        const pv = !s.still && s.play && s.vars?.find((v) => v.k === s.play); // still：已经按挑好的取值定格
        if (pv) pv.init = pv.min + (pv.max - pv.min) * 0.6;
        const box = document.createElement('div');
        box.className = `lp-simbox sim-${s.sim}`;
        off.appendChild(box);
        try {
          SIMS[s.sim](box, s, { say: () => {}, solved: () => {} });
          const area = (x) => (x.viewBox?.baseVal?.width || 0) * (x.viewBox?.baseVal?.height || 0);
          const big = [...box.querySelectorAll('svg')].filter((x) => !x.closest('button') && area(x) > 4000).sort((a, b) => area(b) - area(a))[0];
          if (big) html = big.outerHTML;
        } catch {}
        box.remove();
      }
      if (!html && t?.fig) html = t.fig;
      if (!html && t?.title) html = `<span class="adv-tt">${rich(t.title)}</span>`;
      if (html) el.innerHTML = html; else el.closest('.adv-card')?.classList.add('no-pic');
    });
  } finally { off.remove(); }
  typeset(root);
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
let graphView = null; // 没选过：手机默认列表（图在小屏上看不清），电脑默认图；从知识项点「上下游」进来看图
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
    return `<a class="prow kl-row" href="${innerWidth >= 700 ? `#/graph/${enc(n.id)}" data-gomap` : `#/kp/${enc(n.id)}"`}>
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
  const view = graphView || (focusId || innerWidth >= 700 ? 'map' : 'list');
  $app.innerHTML = `${topnav()}<div class="page wide">
    <header class="ph"><div><h1>${esc(d.student.nickname)}的知识图谱</h1></div></header>
    ${masteryMap(d)}
    <div class="ctabs"><a class="${view === 'map' ? 'on' : ''}" data-view="map">图</a><a class="${view === 'list' ? 'on' : ''}" data-view="list">列表（薄弱在前）</a></div>
    <div id="kg"></div></div>`;
  $app.querySelectorAll('[data-view]').forEach((a) => (a.onclick = () => { graphView = a.dataset.view; renderGraphPage(focusId); }));
  if (view === 'list') return graphList(d, MODN);
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
    <a href="javascript:history.back()" class="back">${BACK_IC}返回</a>
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
    <a href="javascript:history.back()" class="back">${BACK_IC}返回</a>
    <header class="ph"><div><h1>${esc(p.label)}</h1></div>${p.stem_zh ? langSeg() : ''}</header>
    <div class="cols half"><div class="card">
      <div class="stem">${stemHtml(p)}${p.figure ? `<div class="figure">${p.figure}</div>` : ''}</div>
      ${isFillP(p) ? (done ? fillResult(p.last.choice, p.answer, p.last.correct) : '') : `<ul class="choices ${figChoices(p) ? 'figs' : ''}">${Object.keys(p.choices).map((k) => `<li class="choice ${done && k === p.answer ? 'correct' : done && k === p.last.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${choiceHtml(p, k)}</span></li>`).join('')}</ul>`}
    </div>
    ${done ? `<div class="card">
        <p>${p.last.correct ? '✓ 上次做对了' : `✗ 上次${p.last.choice ? `${isFillP(p) ? '填了' : '选了'} ${esc(p.last.choice)}` : '没作答'}，正确答案 <b>${esc(p.answer)}</b>`}</p>
        ${p.basic ? `<div class="section-label">解题思路</div><div class="solution">${rich(p.basic)}</div>` : ''}
        ${p.advanced ? advCard(p.problem_id, p.advanced) : ''}
        <div class="section-label">考点</div>${typeChips(p.types)}${kpCards(p.kps)}
        <div class="row" style="margin-top:14px"><button class="btn" id="try">再做一次</button></div>
      </div>` : `<div class="card feature"><div><h2>还没做过这道题</h2></div><button class="btn primary" id="try">做这道题</button></div>`}
  </div></main>`;
  typeset($app);
  bindKpCards($app);
  $app.querySelector('[data-adv]')?.addEventListener('click', (e) => openAdvanced(e.currentTarget.dataset.adv));
  if (p.advanced) paintThumbs($app, { [p.problem_id]: p.advanced });
  onLang($app, router);
  $app.querySelector('#try').onclick = async () => {
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
  await ensureMe();
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
        <p class="muted">共 ${all.length} 道 · 待订正 ${all.filter((m) => m.status === 'pending').length} · 该复习 ${all.filter((m) => m.status === 'due').length} · 已掌握 ${all.filter((m) => m.status === 'mastered').length}${isGuest() ? ' · <a href="#/account" data-regp>注册保存</a>' : ''}</p></div></header>
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
      <button class="btn lp-entry" data-ms-print style="margin-left:auto">${PRINT_ICON}打印</button>
    </div>
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
  box.querySelector('[data-ms-print]')?.addEventListener('click', () => openMistakesPrint(list));
  box.querySelectorAll('[data-ms-go]').forEach((b) => (b.onclick = () => startMistakes(list.filter((m) => m.status === b.dataset.msGo), b.dataset.msGo, b)));
}

// ───────── 错题本打印：默认是当前标签页的错题，范围、语言、答案在预览的「调整」里改 ─────────
const PR_MAX = 60;
const MS_TAB = { todo: '要做的', pending: '待订正', due: '该复习', fixed: '已订正', mastered: '已掌握', all: '全部' };
const prDesc = () => [MS_TAB[msFilter], msCtx?.fam(), msCtx?.kp()].filter(Boolean).join(' · ');
function openMistakesPrint(list) {
  const shown = msFilter === 'all' ? list : msFilter === 'todo' ? list.filter(isTodo) : list.filter((m) => m.status === msFilter);
  const all = msCtx?.all || list;
  const ids = (xs) => xs.slice(0, PR_MAX).map((m) => m.problem_id);
  const presets = [
    shown.length && { label: `当前列表（${prDesc()}）`, ids: () => ids(shown) },
    { label: '全部错题', ids: () => ids(all) },
  ].filter(Boolean);
  const title = `${msCtx?.nickname || auth.student.nickname}的错题本`;
  openMathPrint({
    name: '错题本', title, info: ['姓名', '日期', '得分'], en: all.some((m) => /^(amc(8|10|12)|kangaroo)-/.test(m.problem_id)), ans: true, file: 'mistakes',
    qr: '/math/#/mistakes', qrText: '扫码看错题本和解析',
    presets, pick: all.map((m) => ({ id: m.problem_id, label: m.label, sub: MS[m.status][0] })),
    fetch: async (want) => (await api(`/math/api/students/${auth.student.id}/mistakes/print`, { method: 'POST', body: { problem_ids: want } })).items,
    link: async (o) => printLinkUrl((await api(`/math/api/students/${auth.student.id}/mistakes/print-link`, { method: 'POST',
      body: { problem_ids: o.ids, title, sub: '', with_ans: o.ans, space: o.space, lang: o.lang } })).token),
  });
}

// 打印链接（微信里换到浏览器打开、发到手机）：不用登录，凭链接取题，直接打开打印预览
async function renderPrintLink(token) {
  const page = (body) => { $app.innerHTML = `<main class="page"><div class="card" style="max-width:560px;margin:40px auto">${body}</div></main>`; };
  let d;
  try {
    const r = await fetch(`/math/api/print/${encodeURIComponent(token)}`);
    d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `请求失败 (${r.status})`);
  } catch (e) { return page(`<h2>打不开这张练习单</h2><p>${esc(e.message)}</p><a class="btn primary" href="/math/">回到数学</a>`); }
  if (!d.items?.length) return page('<h2>这张练习单没有题</h2><a class="btn primary" href="/math/">回到数学</a>');
  page(`<h2>${esc(d.title)}</h2><p class="muted">${esc(d.sub || '')}</p>`);
  const en = d.items.some((x) => /^(amc(8|10|12)|kangaroo)-/.test(x.problem_id));
  openMathPrint({
    name: d.title, title: d.title, info: d.exam_id ? ['姓名', '日期', '用时', '得分'] : ['姓名', '日期', '得分'], en, ans: !d.exam_id, keys: !!d.exam_id, file: d.exam_id ? 'exam' : 'mistakes',
    qr: d.exam_id ? `/math/#/fill/${enc(d.exam_id)}` : '/math/#/mistakes', qrText: d.exam_id ? FILL_QR_TEXT : '扫码看错题本和解析',
    presets: [{ label: `这次的 ${d.items.length} 题`, ids: () => d.items.map((x) => x.problem_id) }],
    fetch: async () => d.items, opts: { lang: d.lang || 'en', space: !!d.space, ans: !!d.with_ans, keys: !!d.with_ans },
    link: async () => printLinkUrl(token), standalone: true, home: d.exam_id ? '/math/' : '/math/#/mistakes',
  });
}
/** 临时按指定语言出题干（打印链接用链接里的语言，不改本机设置） */
function withLang(L, fn) { const g = lang.get; lang.get = () => L; try { return fn(); } finally { lang.get = g; } }

router();
