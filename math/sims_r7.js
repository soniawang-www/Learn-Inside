// 月历 calendar、连线配对 match、竖式 vertical（接口同 sims.js：(box, p, api)）
// 表达式写法同 slider：只来自后台导入的课程内容。R7_CORE 里是不碰页面的部分，生成检查脚本和 drive 也用它。

import { compile, H } from './sims24.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html, cls = '') => `<div class="lp-gbar ${cls}">${html}</div>`;
const btn = (cls, text, a) => `<button class="lp-ghost ${cls}"${a !== undefined ? ` data-a="${esc(a)}"` : ''}>${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim slsvg ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
const tex = (el) => { if (el && /\$/.test(el.textContent) && typeof window !== 'undefined' && window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
const fnc = (expr, keys) => (expr ? compile(expr, keys) : null);
const run = (f, v, d) => { if (!f) return d; try { return f(v, H); } catch (e) { return d; } };
const r1 = (x) => Math.round(x * 10) / 10;
const foundBox = (p, seen) => `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;

// ───────── 月历 ─────────
// { year, month（1～12，真实日历，自动算平年闰年、星期）；或 first（这个月 1 日星期几，0 = 星期日）+ days（这个月几天，几个月写 [31, 30, …]）+ month（只用来写标题）,
//   months（一共几个月，默认 1；跳多少天就要放够几个月）, show（一次显示几个月，默认 1；宽屏并排、手机上下排）, mon: true（星期一排第一列，默认星期日在前）,
//   start: '3-1'（起点日期，高亮；跨年时写 '2024-12-25'）, jumps: [7, -7, 1, -1]（「往后 7 天 / 往前 7 天」按钮）, slider: {max, min, step, label}（「过了 n 天」滑块，从 start 算）,
//   tap: 'pick'（默认，点日期圈上 / 取消）| 'move'（点日期把「当前日期」挪过去）| false, col: true（点表头「星期五」整列高亮）, cols: [5]（一开始就高亮的列）,
//   marks: [{at: '3-8', text: '生日', cls: 'a'|'b'|'c'}]（日期下的小字）, want: '表达式'（哪些日期该圈：变量 d mo y wd；给了它默认 goal 是「正好圈全」）, check: true（圈错的标出来）,
//   wd_show: false（下面的说明不写星期几，免得露答案）, info, goal, tip, found, solution: ['+7', 'tap:3-15', 'col:5', 'n:30', 'next', 'prev'] }
// 表达式里：d / mo / y / wd（当前日期，没有时 d = 0）、cur（当前日期的 key，如 '3-15'）、off（当前日期离 start 几天，往前为负）、picked（圈上的 key 数组）、npicked、pwd（圈上的各是星期几）、
//   has('3-15')、cols（高亮的列）、jumps（跳了几次）、nright / nwrong（圈对 / 圈错几个，要有 want）、all（正好圈全）、view（正在看的月份）、nfound、seen
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const CAL_KEYS = ['d', 'mo', 'y', 'wd', 'cur', 'off', 'picked', 'npicked', 'pwd', 'has', 'cols', 'jumps', 'nright', 'nwrong', 'all', 'view', 'nfound', 'seen'];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const mDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
function calModel(p) {
  const dl = Array.isArray(p.days) ? p.days : null, n = p.months || (dl ? dl.length : 1), months = [], days = [];
  let y = p.year ?? null, m = p.month || 1, wd = y != null ? new Date(Date.UTC(y, m - 1, 1)).getUTCDay() : (p.first ?? 0);
  for (let i = 0; i < n; i++) {
    const nd = y != null ? mDays(y, m) : dl ? (dl[i] ?? dl[dl.length - 1]) : (p.days ?? 31);
    months.push({ y, mo: m, wd0: wd, n: nd, i0: days.length });
    for (let d = 1; d <= nd; d++) days.push({ y, mo: m, d, wd: (wd + d - 1) % 7 });
    wd = (wd + nd) % 7; m++; if (m > 12) { m = 1; if (y != null) y++; }
  }
  const multiY = months.some((q) => q.y !== months[0].y);
  days.forEach((q, i) => { q.i = i; q.mi = months.findIndex((o) => i >= o.i0 && i < o.i0 + o.n); q.key = multiY ? `${q.y}-${q.mo}-${q.d}` : `${q.mo}-${q.d}`; });
  const idx = Object.fromEntries(days.map((q) => [q.key, q.i]));
  let want = null;
  if (p.want) { const f = compile(p.want, ['d', 'mo', 'y', 'wd', 'i']); want = new Set(days.filter((q) => { try { return !!f(q, H); } catch (e) { return false; } }).map((q) => q.i)); }
  return { months, days, idx, want, show: Math.max(1, Math.min(p.show || 1, months.length)) };
}
const calRef = (M, x) => (x === undefined || x === null ? -1 : typeof x === 'number' ? (x >= 1 && x <= M.months[0].n ? x - 1 : -1) : (M.idx[String(x)] ?? -1));
function calInit(p, M) {
  const s = calRef(M, p.start), view = s >= 0 ? Math.min(M.days[s].mi, M.months.length - M.show) : 0;
  return { cur: s >= 0 ? s : null, start: s >= 0 ? s : null, picked: [], cols: (p.cols || []).map(Number), trail: s >= 0 ? [s] : [], view, jumps: 0, n: 0 };
}
function calSee(M, st) { if (st.cur === null) return st; const mi = M.days[st.cur].mi; if (mi < st.view) st.view = mi; if (mi > st.view + M.show - 1) st.view = mi - M.show + 1; return st; }
function calApply(p, M, st, a) {
  const S = { ...st, picked: [...st.picked], cols: [...st.cols], trail: [...st.trail] };
  let m;
  if ((m = /^([+-]\d+)$/.exec(a))) {
    if (S.cur === null) return '还没有起点日期';
    const to = S.cur + Number(m[1]); if (to < 0 || to >= M.days.length) return '超出月历了';
    S.cur = to; S.trail.push(to); S.jumps++; return calSee(M, S);
  }
  if ((m = /^n:(-?\d+)$/.exec(a))) {
    if (S.start === null) return '没有 start，不能用滑块';
    const to = S.start + Number(m[1]); if (to < 0 || to >= M.days.length) return '超出月历了';
    S.cur = to; S.n = Number(m[1]); S.trail = [S.start, to]; return calSee(M, S);
  }
  if ((m = /^tap:(.+)$/.exec(a))) {
    const i = M.idx[m[1]]; if (i === undefined) return `月历里没有 ${m[1]}`;
    const mi = M.days[i].mi; if (mi < S.view || mi >= S.view + M.show) return `${m[1]} 那个月现在没显示（先翻月）`;
    const tap = p.tap === undefined ? 'pick' : p.tap;
    if (tap === 'move') { S.cur = i; S.trail.push(i); return S; }
    if (tap !== 'pick') return '这个月历不能点日期';
    S.picked = S.picked.includes(i) ? S.picked.filter((x) => x !== i) : [...S.picked, i]; return S;
  }
  if ((m = /^col:(\d)$/.exec(a))) { if (!p.col) return '这个月历不能点星期'; const w = +m[1]; S.cols = S.cols.includes(w) ? S.cols.filter((x) => x !== w) : [...S.cols, w]; return S; }
  if (a === 'next') { if (S.view + M.show >= M.months.length) return '已经是最后一个月'; S.view++; return S; }
  if (a === 'prev') { if (S.view <= 0) return '已经是第一个月'; S.view--; return S; }
  return `不认识的操作 ${a}`;
}
function calEnv(p, M, st, seen = []) {
  const c = st.cur !== null ? M.days[st.cur] : null, pk = st.picked.map((i) => M.days[i]);
  const nright = M.want ? st.picked.filter((i) => M.want.has(i)).length : 0, nwrong = M.want ? st.picked.length - nright : 0;
  const keys = pk.map((q) => q.key);
  return { d: c ? c.d : 0, mo: c ? c.mo : 0, y: c ? c.y ?? 0 : 0, wd: c ? c.wd : -1, cur: c ? c.key : '', off: c && st.start !== null ? st.cur - st.start : 0,
    picked: keys, npicked: keys.length, pwd: pk.map((q) => q.wd), has: (k) => keys.includes(String(k)), cols: [...st.cols], jumps: st.jumps,
    nright, nwrong, all: !!M.want && nwrong === 0 && nright === M.want.size, view: M.months[st.view].mo, nfound: seen.length, seen };
}
function calRun(p, sol) { const M = calModel(p); let st = calInit(p, M); for (const a of sol || []) { const r = calApply(p, M, st, a); if (typeof r === 'string') return [M, st, `${a}：${r}`]; st = r; } return [M, st, null]; }
function calGoal(p, M, v, F) { return F ? !!run(F, v, false) : !!(M.want && v.all); }
function calSvg(p, M, st, mi) {
  const mo = M.months[mi], CW = 44, CH = 40, top = 30, hd = 26, sh = p.mon ? 1 : 0, off = (mo.wd0 - sh + 7) % 7, rows = Math.ceil((off + mo.n) / 7);
  const vw = 7 * CW + 4, vh = top + hd + rows * CH + 4, X = (c) => 2 + c * CW;
  const title = (p.titles || [])[mi] ?? `${mo.y != null ? `${mo.y} 年 ` : ''}${mo.mo} 月`;
  let s = `<text x="${vw / 2}" y="20" text-anchor="middle" font-size="16" font-weight="700" class="st lbl">${esc(title)}</text>`;
  for (let c = 0; c < 7; c++) {
    const w = (c + sh) % 7;
    if (st.cols.includes(w)) s += `<rect x="${X(c) + 1}" y="${top}" width="${CW - 2}" height="${hd + rows * CH}" rx="8" class="cl-colhl"/>`;
    s += `<g class="cl-h${p.col ? ' cl-act' : ''}${w === 0 || w === 6 ? ' we' : ''}${st.cols.includes(w) ? ' on' : ''}"${p.col ? ` data-a="col:${w}"` : ''}><rect x="${X(c) + 2}" y="${top + 1}" width="${CW - 4}" height="${hd - 3}" rx="6" class="cl-hb"/><text x="${X(c) + CW / 2}" y="${top + 18}" text-anchor="middle" font-size="14" class="st cl-ht">${WD[w]}</text></g>`;
  }
  const marks = {}; for (const mk of p.marks || []) { const i = calRef(M, mk.at); if (i >= 0) (marks[i] = marks[i] || []).push(mk); }
  const tap = p.tap === undefined ? 'pick' : p.tap;
  for (let d = 1; d <= mo.n; d++) {
    const i = mo.i0 + d - 1, q = M.days[i], pos = off + d - 1, x = X(pos % 7), y = top + hd + Math.floor(pos / 7) * CH;
    const pk = st.picked.includes(i), cls = ['cl-d', tap ? 'cl-act' : '', st.cur === i ? 'cur' : '', st.trail.includes(i) && st.cur !== i ? 'tr' : '', pk ? 'pk' : '', pk && p.check && M.want ? (M.want.has(i) ? 'ok' : 'bad') : '', st.start === i ? 'st0' : ''].filter(Boolean).join(' ');
    const mk = marks[i] || [];
    s += `<g class="${cls}"${tap ? ` data-a="tap:${esc(q.key)}"` : ''}><rect x="${x + 3}" y="${y + 3}" width="${CW - 6}" height="${CH - 6}" rx="9" class="cl-b"/>` +
      `<text x="${x + CW / 2}" y="${y + (mk.length ? 20 : 25)}" text-anchor="middle" font-size="${mk.length ? 14 : 16}" class="st cl-n">${d}</text>` +
      (mk.length ? `<text x="${x + CW / 2}" y="${y + CH - 7}" text-anchor="middle" font-size="9.5" class="st cl-mk c-${esc(mk[0].cls || 'b')}">${esc(mk.map((o) => o.text).join(' '))}</text>` : '') + '</g>';
  }
  return SVG(vw, vh, s, 'clsvg');
}
function calendar(box, p, api) {
  const M = calModel(p);
  const F = { info: fnc(p.info, CAL_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, CAL_KEYS) : null, tip: fnc(p.tip, CAL_KEYS), found: fnc(p.found, CAL_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const seen = [], sl = p.slider ? { min: 0, step: 1, max: 30, ...(p.slider === true ? {} : p.slider) } : null;
  let st = calInit(p, M), lastTip = '';
  const jumps = p.jumps || [];
  box.innerHTML = '<div class="cl-wrap"></div><div class="sl-info cl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found cl-found"></div>' : '') +
    (sl ? bar(`<span>${esc(sl.label || '过了')} <b class="cl-n0"></b> 天</span><input type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${sl.min}" data-k="n" aria-label="${esc(sl.label || '天数')}">`) : '') +
    bar(jumps.map((k) => btn('cl-btn', `${k > 0 ? '往后' : '往前'} ${Math.abs(k)} 天`, `${k > 0 ? '+' : ''}${k}`)).join('') +
      (M.months.length > M.show ? btn('cl-btn', '‹ 上个月', 'prev') + btn('cl-btn', '下个月 ›', 'next') : '') + btn('cl-reset', '重来'), 'cl-ops');
  const draw = () => {
    let v = calEnv(p, M, st, seen);
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = calEnv(p, M, st, seen); } }
    let h = ''; for (let mi = st.view; mi < st.view + M.show; mi++) h += calSvg(p, M, st, mi);
    box.querySelector('.cl-wrap').innerHTML = h;
    const el = box.querySelector('.cl-info');
    if (F.info) el.innerHTML = run(F.info, v, '');
    else if (v.cur) el.innerHTML = `<b>${v.mo} 月 ${v.d} 日</b>${p.wd_show === false ? '' : ` 星期${WD[v.wd]}`}${st.start !== null && v.off ? `（${v.off > 0 ? '往后' : '往前'} ${Math.abs(v.off)} 天）` : ''}`;
    else el.innerHTML = '';
    tex(el);
    const n0 = box.querySelector('.cl-n0'); if (n0) n0.textContent = st.n;
    const r = box.querySelector('input[data-k="n"]'); if (r) r.value = st.n;
    box.querySelectorAll('.cl-ops .cl-btn').forEach((b) => { b.disabled = typeof calApply(p, M, st, b.dataset.a) === 'string'; });
    const fd = box.querySelector('.cl-found'); if (fd) fd.innerHTML = foundBox(p, seen);
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (calGoal(p, M, v, F.goal)) ok();
  };
  const act = (a) => { const r = calApply(p, M, st, a); if (typeof r === 'string') { api.say(r + '。'); return; } st = r; draw(); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cl-reset')) { st = calInit(p, M); draw(); return; }
    const a = e.target.closest('[data-a]'); if (a && box.contains(a)) act(a.dataset.a);
  });
  const rg = box.querySelector('input[data-k="n"]'); if (rg) rg.addEventListener('input', () => act(`n:${rg.value}`));
  draw();
}

// ───────── 连线配对 ─────────
// { left: [项], right: [项]（项是文字，可带 $公式$；或 {text, svg}：svg 是一小张图，如钟面、图形）, pairs: [[左序号, 右序号], …]（正确配对，从 0 数；同一项出现几次就是一对多）,
//   multi: true | 'left' | 'right'（允许一项连几条，不写时按 pairs 自动判断）, layout: 'rows'（上下两行，默认左右两列）, check: 'end'（全部连完才显示对错，默认连一条就显示）,
//   size（图的最大宽，默认 90）, info, goal, tip, found, solution: [[左, 右], …]（不写就按 pairs 连） }
// 点一项再点另一边的一项连线（先点哪边都行）；一对一时重连会替换旧线；再点一次已经连着的两项就取消；「退一步」「重来」。
// 表达式里：links（'左-右' 数组）、n（连了几条）、nright / nwrong、all（全部连对、没有错线）、complete（连的条数够了）、nfound、seen。不写 goal 时 all 算完成。
const MC_KEYS = ['links', 'n', 'nright', 'nwrong', 'all', 'complete', 'nfound', 'seen'];
const mcItems = (arr) => (arr || []).map((x) => (x && typeof x === 'object' ? x : { text: String(x) }));
function mcModel(p) {
  const prs = (p.pairs || []).map(([i, j]) => [+i, +j]), dup = (k) => { const m = {}; return prs.some((q) => (m[q[k]] = (m[q[k]] || 0) + 1) > 1); };
  return { L: mcItems(p.left), R: mcItems(p.right), pairs: new Set(prs.map(([i, j]) => `${i}-${j}`)), mL: p.multi === true || p.multi === 'left' || dup(0), mR: p.multi === true || p.multi === 'right' || dup(1) };
}
function mcApply(M, links, i, j) {
  if (!(i >= 0 && i < M.L.length && j >= 0 && j < M.R.length)) return `没有 ${i}-${j} 这两项`;
  const k = `${i}-${j}`; if (links.includes(k)) return links.filter((x) => x !== k);
  return [...links.filter((x) => { const [a, b] = x.split('-').map(Number); return !((!M.mL && a === i) || (!M.mR && b === j)); }), k];
}
function mcEnv(M, links, seen = []) {
  const nright = links.filter((k) => M.pairs.has(k)).length, nwrong = links.length - nright;
  return { links: [...links], n: links.length, nright, nwrong, all: nwrong === 0 && nright === M.pairs.size, complete: links.length >= M.pairs.size, nfound: seen.length, seen };
}
function mcRun(p, sol) { const M = mcModel(p); let L = []; for (const [i, j] of sol || (p.pairs || [])) { const r = mcApply(M, L, +i, +j); if (typeof r === 'string') return [M, L, r]; L = r; } return [M, L, null]; }
function match(box, p, api) {
  const M = mcModel(p), rows = p.layout === 'rows';
  const F = { info: fnc(p.info, MC_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, MC_KEYS) : null, tip: fnc(p.tip, MC_KEYS), found: fnc(p.found, MC_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const seen = []; let links = [], hist = [], sel = null, lastTip = '';
  const item = (it, s, i) => `<button class="mc-it${it.svg ? ' has-svg' : ''}" data-s="${s}" data-i="${i}">${it.svg ? `<span class="mc-fig" style="max-width:${p.size || 90}px">${it.svg}</span>` : ''}${it.text !== undefined && it.text !== '' ? `<span class="mc-tx">${esc(it.text)}</span>` : ''}</button>`;
  box.innerHTML = `<div class="mc${rows ? ' mc-rows' : ''}"><div class="mc-col mc-l">${M.L.map((it, i) => item(it, 'L', i)).join('')}</div>${rows ? '' : '<div class="mc-gap"></div>'}<div class="mc-col mc-r">${M.R.map((it, j) => item(it, 'R', j)).join('')}</div><svg class="mc-lines" aria-hidden="true"></svg></div>` +
    '<div class="sl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found mc-found"></div>' : '') + bar(btn('mc-undo', '退一步') + btn('mc-reset', '重来'));
  const wrap = box.querySelector('.mc'), svg = box.querySelector('.mc-lines');
  box.querySelectorAll('.mc-tx').forEach(tex);
  const status = (k, v) => (p.check === 'end' && !v.complete ? 'pend' : M.pairs.has(k) ? 'ok' : 'bad');
  const lines = () => {
    const v = mcEnv(M, links), W = wrap.getBoundingClientRect(); if (!W.width) return;
    svg.setAttribute('viewBox', `0 0 ${r1(W.width)} ${r1(W.height)}`);
    let s = '';
    for (const k of links) {
      const [i, j] = k.split('-'), a = box.querySelector(`.mc-it[data-s="L"][data-i="${i}"]`).getBoundingClientRect(), b = box.querySelector(`.mc-it[data-s="R"][data-i="${j}"]`).getBoundingClientRect();
      const [x1, y1, x2, y2] = rows ? [a.left + a.width / 2, a.bottom, b.left + b.width / 2, b.top] : [a.right, a.top + a.height / 2, b.left, b.top + b.height / 2];
      const c = status(k, v);
      s += `<line x1="${r1(x1 - W.left)}" y1="${r1(y1 - W.top)}" x2="${r1(x2 - W.left)}" y2="${r1(y2 - W.top)}" class="mc-ln ${c}"/><circle cx="${r1(x1 - W.left)}" cy="${r1(y1 - W.top)}" r="4" class="mc-dot ${c}"/><circle cx="${r1(x2 - W.left)}" cy="${r1(y2 - W.top)}" r="4" class="mc-dot ${c}"/>`;
    }
    svg.innerHTML = s;
  };
  const draw = () => {
    let v = mcEnv(M, links, seen);
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = mcEnv(M, links, seen); } }
    box.querySelectorAll('.mc-it').forEach((b) => {
      const s = b.dataset.s, i = +b.dataset.i, mine = links.filter((k) => k.split('-')[s === 'L' ? 0 : 1] === String(i));
      const st = mine.length ? (mine.some((k) => status(k, v) === 'bad') ? 'bad' : mine.every((k) => status(k, v) === 'ok') ? 'ok' : 'pend') : '';
      b.className = `mc-it${b.querySelector('.mc-fig') ? ' has-svg' : ''}${st ? ` ln ${st}` : ''}${sel && sel.s === s && sel.i === i ? ' sel' : ''}`;
    });
    lines();
    const el = box.querySelector('.sl-info'); el.innerHTML = F.info ? run(F.info, v, '') : ''; tex(el);
    const fd = box.querySelector('.mc-found'); if (fd) fd.innerHTML = foundBox(p, seen);
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (F.goal ? run(F.goal, v, false) : v.all) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.mc-reset')) { links = []; hist = []; sel = null; draw(); return; }
    if (e.target.closest('.mc-undo')) { if (hist.length) links = hist.pop(); sel = null; draw(); return; }
    const b = e.target.closest('.mc-it'); if (!b) return;
    const s = b.dataset.s, i = +b.dataset.i;
    if (!sel || sel.s === s) { sel = sel && sel.s === s && sel.i === i ? null : { s, i }; draw(); return; }
    const [li, rj] = s === 'R' ? [sel.i, i] : [i, sel.i];
    const r = mcApply(M, links, li, rj); sel = null;
    if (typeof r !== 'string') { hist.push(links); links = r; }
    draw();
  });
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => { if (!box.isConnected) return ro.disconnect(); lines(); }); ro.observe(wrap); }
  box.querySelectorAll('.mc-fig svg, img').forEach((im) => im.addEventListener?.('load', lines));
  draw(); requestAnimationFrame(lines);
}

// ───────── 竖式 ─────────
// { eq: '47×36'（加 + 减 - 乘 × 除 ÷，也认 * /；加法可以连加 '128+256+64'）,
//   计算：fill: 's' | 'all' | ['q', 'p1', 's:2', …]（留空让孩子填的行名或格子；默认 + − 和一位乘数填 s，两位乘数、除法填 all）,
//     steps: true（不填，「下一步」逐位演示：每一位怎么算、进位借位、部分积、长除法的商乘减落，说明写在下面）, carry: true（填空时把进位 / 退位点也显示出来）, partial: false（多位乘数不写部分积）；
//   竖式谜：eq 里有字母 / 汉字 / □（'AB+BA=CDC'、'3□5+2□7=6□2'），同字同数、不同字不同数（distinct: false 关掉），□ 各自独立；乘法可给 parts: ['…', '…']（部分积，从乘数个位起）；
//     孩子点字再按数字键填，填满自动判对错，找到的解列在下面；need（要找几组解，默认 1），solution: ['12+21=33', …]（各组解写成填好的等式）；
//   info, goal, tip, found }
// 行名：a、b、c…（加数 / 被减数 / 因数；除法 a 是被除数、d 是除数）、s（结果）、k（进位 / 退位点）、p1 p2…（部分积 / 除法每次的乘积）、r1 r2…（除法每次减后落下的数）、q（商）。
// 格子是「行名:数位」，数位从右边 0 数起（除法按被除数的个位对齐），如 's:0' 是结果的个位。
// 表达式里：filled / nblank / nright / nwrong / done（填空）、step / nsteps（演示）、vals（竖式谜：字→数字）、full（都填了）、valid（等式成立且不重复）、txt（填好的等式）、nfound、seen
// 默认 goal：演示看完、填空全对、竖式谜找到 need 组解。
const VT_KEYS = ['filled', 'nblank', 'nright', 'nwrong', 'done', 'step', 'nsteps', 'vals', 'full', 'valid', 'txt', 'nfound', 'seen'];
const PL = ['个位', '十位', '百位', '千位', '万位', '十万位', '百万位', '千万位', '亿位', '十亿位', '百亿位'];
const OPN = { '+': '+', '-': '−', '×': '×', '÷': '÷' };
const dig = (x, pos) => Math.floor(x / 10 ** pos) % 10;
function vtParse(eq) {
  const s = String(eq || '').replace(/\s+/g, '').replace(/\*/g, '×').replace(/\//g, '÷').replace(/[−–]/g, '-').replace(/[?？]/g, '□');
  const [lhs, res = null, extra] = s.split('=');
  if (extra !== undefined) return { err: 'eq 里只能有一个 =' };
  const op = ['+', '-', '×', '÷'].find((o) => lhs.includes(o)); if (!op) return { err: 'eq 里没有 + − × ÷' };
  const nums = lhs.split(op); if (nums.some((x) => !x) || (res !== null && !res)) return { err: 'eq 写得不完整' };
  if (op !== '+' && nums.length !== 2) return { err: '只有加法可以连加' };
  if (/[+\-×÷]/.test(res || '')) return { err: '= 后面只能写一个数' };
  const puzzle = [...nums, res || ''].some((t) => /[^0-9]/.test(t));
  if (puzzle && res === null) return { err: '竖式谜要写出 = 后面的结果' };
  if (puzzle && op === '÷') return { err: '除法竖式谜还不支持' };
  return { op, nums, res, puzzle };
}
// 排版：rows = [{name, cells: [{id, col, pos, ch, row, v}], small, sym, line}]，col 从左数，pos = W - 1 - col
function vtLayout(p) {
  const P = vtParse(p.eq); if (P.err) return { err: P.err };
  const { op, nums, res, puzzle } = P, rows = [], steps = [];
  let W = 0, c0 = 0;
  const mk = (name, str, endCol, o = {}) => { const ch = [...str]; return { name, small: !!o.small, sym: o.sym, cells: ch.map((c, k) => { const col = endCol - (ch.length - 1 - k); return { id: `${name}:${W - 1 - col}`, row: name, col, pos: W - 1 - col, ch: c }; }) }; };
  const add = (r, o = {}) => { Object.assign(r, o); rows.push(r); return r; };
  const nm = (k) => 'abcefgh'[k];
  if (puzzle) {
    const parts = op === '×' && p.parts ? p.parts : [];
    W = Math.max(...nums.map((t) => [...t].length), [...res].length, ...parts.map((t, j) => [...t].length + j)) + 1;
    nums.forEach((t, k) => add(mk(nm(k), t, W - 1, { sym: k === nums.length - 1 ? OPN[op] : null }), { line: k === nums.length - 1 }));
    parts.forEach((t, j) => add(mk(`p${j + 1}`, t, W - 1 - j), { line: j === parts.length - 1 }));
    add(mk('s', res, W - 1));
  } else {
    const v = nums.map(Number);
    if (op === '+') {
      const S = v.reduce((a, b) => a + b, 0), lm = Math.max(...nums.map((t) => t.length));
      W = Math.max(lm, String(S).length) + 1;
      nums.forEach((t, k) => add(mk(nm(k), t, W - 1, { sym: k === nums.length - 1 ? '+' : null })));
      const kr = add({ name: 'k', small: true, cells: [], line: true }), sr = add(mk('s', String(S), W - 1));
      let cy = 0;
      for (let pos = 0; pos < lm; pos++) {
        const terms = v.filter((x, k) => nums[k].length > pos).map((x) => dig(x, pos)), t = terms.reduce((a, b) => a + b, 0) + cy, out = Math.floor(t / 10);
        let text = `${PL[pos]}：${terms.join(' + ')}${cy ? ` + 进位 ${cy}` : ''} = ${t}`;
        const ids = [`s:${pos}`];
        if (out && pos < lm - 1) { text += `，写 ${t % 10}，向${PL[pos + 1]}进 ${out}`; kr.cells.push({ id: `k:${pos + 1}`, row: 'k', col: W - 2 - pos, pos: pos + 1, ch: String(out) }); ids.push(`k:${pos + 1}`); }
        else if (out) { text += `，写 ${t % 10}，${PL[pos + 1]}直接写 ${out}`; for (let q = pos + 1; q < String(S).length; q++) ids.push(`s:${q}`); }
        steps.push({ ids, text }); cy = out;
      }
      void sr;
    } else if (op === '-') {
      const [a, b] = v; if (a < b) return { err: '被减数比减数小' };
      const S = a - b, la = nums[0].length; W = Math.max(la, nums[1].length) + 1;
      const kr = add({ name: 'k', small: true, cells: [] });
      add(mk('a', nums[0], W - 1)); add(mk('b', nums[1], W - 1, { sym: '−' }), { line: true }); add(mk('s', String(S), W - 1));
      let bw = 0;
      for (let pos = 0; pos < la; pos++) {
        const da = dig(a, pos), db = pos < nums[1].length ? dig(b, pos) : null, x = da - bw, ids = pos < String(S).length ? [`s:${pos}`] : [];
        let text, nb = 0;
        if (x < 0) { nb = 1; text = `${PL[pos]}：0 不够借，先从${PL[pos + 1]}退 1 当 10，被${PL[pos - 1]}借走 1 剩 9，${db === null ? '直接写 9' : `9 − ${db} = ${9 - db}`}`; }
        else if (db === null) text = `${PL[pos]}：${bw ? `${da} 被借走 1，剩 ${x}` : `${da}`}，直接写下来`;
        else if (x >= db) text = `${PL[pos]}：${bw ? `${da} 被借走 1 剩 ${x}，` : ''}${x} − ${db} = ${x - db}`;
        else { nb = 1; text = `${PL[pos]}：${bw ? `${da} 被借走 1 剩 ${x}，` : ''}${x} − ${db} 不够减，从${PL[pos + 1]}退 1，${x + 10} − ${db} = ${x + 10 - db}`; }
        if (!ids.length) text = `${PL[pos]}：${bw ? `${da} 被借走 1 剩 0` : '0'}，最高位的 0 不写`;
        if (nb) { kr.cells.push({ id: `k:${pos + 1}`, row: 'k', col: W - 2 - pos, pos: pos + 1, ch: '·' }); ids.push(`k:${pos + 1}`); }
        steps.push({ ids, text }); bw = nb;
      }
    } else if (op === '×') {
      const [a, b] = v, S = a * b, la = nums[0].length, lb = nums[1].length;
      if (lb === 1 || p.partial === false) {
        W = Math.max(la, lb, String(S).length) + 1;
        add(mk('a', nums[0], W - 1)); add(mk('b', nums[1], W - 1, { sym: '×' }));
        const kr = add({ name: 'k', small: true, cells: [], line: true }); add(mk('s', String(S), W - 1));
        let cy = 0;
        for (let pos = 0; pos < la; pos++) {
          const da = dig(a, pos), t = da * b + cy, out = Math.floor(t / 10), ids = [`s:${pos}`];
          let text = `${PL[pos]}：${da} × ${b} = ${da * b}${cy ? `，加上进上来的 ${cy} 得 ${t}` : ''}`;
          if (out && pos < la - 1) { text += `，写 ${t % 10}，向${PL[pos + 1]}进 ${out}`; if (out < 10) { kr.cells.push({ id: `k:${pos + 1}`, row: 'k', col: W - 2 - pos, pos: pos + 1, ch: String(out) }); ids.push(`k:${pos + 1}`); } }
          else if (out) { text += `，写 ${t % 10}，前面直接写 ${out}`; for (let q = pos + 1; q < String(S).length; q++) ids.push(`s:${q}`); }
          steps.push({ ids, text }); cy = out;
        }
      } else {
        const js = [...Array(lb).keys()].filter((j) => dig(b, j)), ps = js.map((j) => a * dig(b, j));
        W = Math.max(la, lb, String(S).length, ...js.map((j, n) => String(ps[n]).length + j)) + 1;
        add(mk('a', nums[0], W - 1)); add(mk('b', nums[1], W - 1, { sym: '×' }), { line: true });
        js.forEach((j, n) => {
          const bj = dig(b, j), r = add(mk(`p${n + 1}`, String(ps[n]), W - 1 - j), { line: n === js.length - 1 }); let cy = 0;
          for (let pos = 0; pos < la; pos++) {
            const da = dig(a, pos), t = da * bj + cy, out = Math.floor(t / 10), ids = [`${r.name}:${pos + j}`];
            let text = `${pos === 0 ? `用${PL[j]}上的 ${bj} 去乘 ${a}${j ? `，积的末位和${PL[j]}对齐` : ''}。` : ''}${da} × ${bj} = ${da * bj}${cy ? `，加进位 ${cy} 得 ${t}` : ''}`;
            if (out && pos < la - 1) text += `，写 ${t % 10} 进 ${out}`;
            else if (out) { text += `，写 ${t % 10}，前面直接写 ${out}`; for (let q = pos + 1; q < String(ps[n]).length; q++) ids.push(`${r.name}:${q + j}`); }
            else text += `，写 ${t % 10}`;
            steps.push({ ids, text }); cy = out;
          }
        });
        const sr = add(mk('s', String(S), W - 1));
        if (js.length > 1) steps.push({ ids: sr.cells.map((c) => c.id), text: `把部分积按数位对齐加起来：${js.map((j, n) => `${ps[n]}${j ? '0'.repeat(j) : ''}`).join(' + ')} = ${S}` });
        else steps.push({ ids: sr.cells.map((c) => c.id), text: `只有一个部分积，后面补 ${js[0]} 个 0：${S}` });
      }
    } else {
      const [a, b] = v; if (!(b > 0)) return { err: '除数要大于 0' };
      const D = [...nums[0]].map(Number), n = D.length, ds = nums[1], dl = ds.length; c0 = dl; W = c0 + n;
      const qr = add({ name: 'q', cells: [], line: false });
      const ar = add(mk('a', nums[0], W - 1)); ar.cells.push(...[...ds].map((ch, k) => ({ id: `d:${dl - 1 - k}`, row: 'd', col: k, pos: W - 1 - k, ch })));
      const setRow = (r, str, end) => { const t = mk(r.name, str, end); r.cells = t.cells; };
      const qc = (col, x) => { const c = { id: `q:${W - 1 - col}`, row: 'q', col, pos: W - 1 - col, ch: String(x) }; qr.cells.push(c); return c.id; };
      let i = 0, cur = D[0], k = 0, lastR = null;
      while (cur < b && i < n - 1) { i++; cur = cur * 10 + D[i]; }
      for (let guard = 0; guard < 40; guard++) {
        const qd = Math.floor(cur / b), col = c0 + i, qpl = PL[W - 1 - col];
        if (qd === 0 && lastR) {
          const qid = qc(col, 0);
          if (i === n - 1) { steps.push({ ids: [qid], text: `${cur} 比 ${b} 小，${qpl}上商 0，余数是 ${cur}` }); break; }
          const nd = D[i + 1], was = cur; i++; cur = cur * 10 + nd; setRow(lastR, String(cur), c0 + i);
          steps.push({ ids: [qid, `${lastR.name}:${W - 1 - (c0 + i)}`], text: `${was} 比 ${b} 小，${qpl}上商 0；落下 ${nd}，得 ${cur}` }); continue;
        }
        k++;
        const qid = qc(col, qd), prod = qd * b, pr = add(mk(`p${k}`, String(prod), col), { line: true });
        pr.lc0 = col - Math.max(String(cur).length, String(prod).length) + 1;
        steps.push({ ids: [qid, ...pr.cells.map((c) => c.id)], text: `${cur} ÷ ${b}，${qpl}上商 ${qd}；${qd} × ${b} = ${prod}，写在下面` });
        const rem = cur - prod;
        if (i === n - 1) { const rr = add(mk(`r${k}`, String(rem), col)); steps.push({ ids: rr.cells.map((c) => c.id), text: `${cur} − ${prod} = ${rem}${rem ? `，余数是 ${rem}` : '，正好除尽'}` }); break; }
        if (rem === 0 && D.slice(i + 1).every((x) => x === 0)) {
          const rr = add(mk(`r${k}`, '0', col)), ids = rr.cells.map((c) => c.id); for (let q = i + 1; q < n; q++) ids.push(qc(c0 + q, 0));
          steps.push({ ids, text: `${cur} − ${prod} = 0，后面落下来的都是 0，商的后面补 ${n - 1 - i} 个 0` }); break;
        }
        const nd = D[i + 1], was = cur; i++; cur = rem * 10 + nd; lastR = add(mk(`r${k}`, String(cur), c0 + i));
        steps.push({ ids: lastR.cells.map((c) => c.id), text: `${was} − ${prod} = ${rem}，落下 ${nd}，得 ${cur}` });
      }
    }
  }
  const cells = Object.fromEntries(rows.flatMap((r) => r.cells.map((c) => [c.id, c])));
  for (const s of steps) s.ids = s.ids.filter((id) => cells[id]);
  // 没有新格子出现的一步：说明并进下一步（最后一步并进上一步）
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].ids.length || steps.length < 2) continue;
    if (i + 1 < steps.length) steps[i + 1].text = `${steps[i].text}；${steps[i + 1].text}`; else steps[i - 1].text += `；${steps[i].text}`;
    steps.splice(i--, 1);
  }
  // 哪些格子留空
  const operand = (c) => /^[abcefghd]$/.test(c.row);
  let blanks = [], vars = {};
  if (puzzle) {
    for (const c of Object.values(cells)) if (!/[0-9]/.test(c.ch)) { c.v = c.ch === '□' ? c.id : c.ch; (vars[c.v] = vars[c.v] || []).push(c.id); }
  } else if (!p.steps) {
    const fl = p.fill ?? (op === '÷' || (op === '×' && rows.some((r) => r.name === 'p1')) ? 'all' : 's');
    const want = fl === 'all' ? null : [].concat(fl).map(String);
    blanks = Object.values(cells).filter((c) => c.row !== 'k' && !operand(c) && (!want || want.includes(c.row) || want.includes(c.id))).map((c) => c.id);
  }
  return { op, nums, res, puzzle, rows, cells, W, c0, steps, blanks, vars, letters: Object.keys(vars).filter((x) => !cells[x]) };
}
// 竖式谜：按 vals 代进去，看等式成不成立
function vtCheck(p, L, vals) {
  const full = Object.keys(L.vars).every((k) => vals[k] !== undefined && vals[k] !== null && vals[k] !== '');
  if (!full) return { full, valid: false, txt: '', why: '' };
  const numOf = (r) => r.cells.map((c) => (c.v !== undefined ? String(vals[c.v]) : c.ch)).join('');
  const R = Object.fromEntries(L.rows.filter((r) => r.cells.length && r.name !== 'k').map((r) => [r.name, numOf(r)]));
  const ops = L.nums.map((_, k) => R['abcefgh'[k]]), txt = `${ops.join(L.op)}=${R.s}`;
  if (p.distinct !== false) { const ls = L.letters.map((k) => vals[k]); if (new Set(ls).size !== ls.length) return { full, valid: false, txt, why: 'dup' }; }
  if (Object.values(R).some((t) => t.length > 1 && t[0] === '0')) return { full, valid: false, txt, why: 'zero' };
  const v = ops.map(Number), s = Number(R.s);
  let okk = L.op === '+' ? v.reduce((a, b) => a + b, 0) === s : L.op === '-' ? v[0] - v[1] === s : v[0] * v[1] === s;
  if (okk && L.op === '×') for (const r of L.rows) { const m = /^p(\d+)$/.exec(r.name); if (m && Number(R[r.name]) !== v[0] * dig(v[1], +m[1] - 1)) okk = false; }
  return { full, valid: okk, txt, why: okk ? '' : 'eq' };
}
// 把「填好的等式」字符串（solution 里的一项）拆成 vals
function vtSolVals(p, L, str) {
  const P = vtParse(str); if (P.err || P.puzzle) return `解「${str}」写得不对`;
  if (P.op !== L.op || P.nums.length !== L.nums.length) return `解「${str}」和 eq 对不上`;
  const vals = {}, toks = [...L.nums, L.res], got = [...P.nums, P.res];
  for (let t = 0; t < toks.length; t++) {
    const a = [...toks[t]], b = [...got[t]]; if (a.length !== b.length) return `解「${str}」的位数和 eq 对不上`;
    const name = t < L.nums.length ? 'abcefgh'[t] : 's', r = L.rows.find((q) => q.name === name);
    for (let k = 0; k < a.length; k++) { const c = r.cells[k]; if (c.v === undefined) { if (c.ch !== b[k]) return `解「${str}」改了已知的数字`; continue; } if (vals[c.v] !== undefined && vals[c.v] !== +b[k]) return `解「${str}」里 ${c.v} 前后不一样`; vals[c.v] = +b[k]; }
  }
  const A = Number(P.nums[0]), B = Number(P.nums[1] || 0);
  for (const r of L.rows) { const m = /^p(\d+)$/.exec(r.name); if (!m) continue; const pv = String(A * dig(B, +m[1] - 1)); if (pv.length !== r.cells.length) return `解「${str}」的部分积位数不对`; r.cells.forEach((c, k) => { if (c.v !== undefined) vals[c.v] = +pv[k]; }); }
  return vals;
}
// 竖式谜一共几组解（变量组合太多时返回 null）
function vtSolve(p, L, cap = 3e6) {
  const ks = Object.keys(L.vars), lett = new Set(L.letters), dist = p.distinct !== false;
  let est = 1; for (const k of ks) est *= 10; if (dist) { est = 1; let used = 0; for (const k of ks) est *= lett.has(k) ? 10 - used++ : 10; }
  if (est > cap) return null;
  const out = [], vals = {}, usedD = new Set();
  const go = (i) => {
    if (i === ks.length) { const r = vtCheck(p, L, vals); if (r.valid) out.push(r.txt); return; }
    const k = ks[i];
    for (let d = 0; d <= 9; d++) { if (dist && lett.has(k) && usedD.has(d)) continue; vals[k] = d; if (lett.has(k)) usedD.add(d); go(i + 1); if (lett.has(k)) usedD.delete(d); }
    delete vals[k];
  };
  go(0);
  return [...new Set(out)];
}
const vtMode = (p, L) => (L.puzzle ? 'puzzle' : p.steps ? 'steps' : 'fill');
function vtInit() { return { vals: {}, step: 0 }; }
function vtApply(p, L, st, a) {
  const S = { vals: { ...st.vals }, step: st.step };
  if (a === 'next') { if (S.step >= L.steps.length) return '已经是最后一步'; S.step++; return S; }
  if (a === 'prev') { if (S.step <= 0) return '已经是第一步'; S.step--; return S; }
  if (a === 'clear') { S.vals = {}; return S; }
  const m = /^set:(.+)=(\d?)$/.exec(a); if (!m) return `不认识的操作 ${a}`;
  const [, k, d] = m;
  if (L.puzzle ? !L.vars[k] : !L.blanks.includes(k)) return `${k} 不是要填的格子`;
  if (d === '') delete S.vals[k]; else S.vals[k] = +d;
  return S;
}
function vtEnv(p, L, st, seen = []) {
  const nb = L.blanks.length, filled = L.blanks.filter((id) => st.vals[id] !== undefined).length, nright = L.blanks.filter((id) => String(st.vals[id]) === L.cells[id].ch).length;
  const ck = L.puzzle ? vtCheck(p, L, st.vals) : { full: filled === nb, valid: nb > 0 && nright === nb, txt: '' };
  return { filled, nblank: nb, nright, nwrong: filled - nright, done: nb > 0 && nright === nb, step: st.step, nsteps: L.steps.length, vals: { ...st.vals }, full: ck.full, valid: ck.valid, txt: ck.txt, why: ck.why, nfound: seen.length, seen };
}
function vtGoal(p, L, v, F) { if (F) return !!run(F, v, false); const md = vtMode(p, L); return md === 'steps' ? v.step >= v.nsteps : md === 'fill' ? v.done : v.nfound >= (p.need || 1); }
// 按 solution 走一遍（检查、drive 共用）：返回 [最后状态, seen, 出错]
function vtRun(p, L) {
  const md = vtMode(p, L), seen = [], acts = [];
  if (md === 'steps') for (let i = 0; i < L.steps.length; i++) acts.push(['next']);
  else if (md === 'fill') acts.push(L.blanks.map((id) => `set:${id}=${L.cells[id].ch}`));
  else for (const s of p.solution || []) { const vals = vtSolVals(p, L, s); if (typeof vals === 'string') return [null, seen, vals]; acts.push(['clear', ...Object.entries(vals).map(([k, d]) => `set:${k}=${d}`)]); }
  let st = vtInit();
  for (const grp of acts) { for (const a of grp) { const r = vtApply(p, L, st, a); if (typeof r === 'string') return [st, seen, `${a}：${r}`]; st = r; } if (L.puzzle) { const c = vtCheck(p, L, st.vals); if (c.valid && !seen.includes(c.txt)) seen.push(c.txt); } }
  return [st, seen, null];
}
function vertical(box, p, api) {
  const L = vtLayout(p);
  if (L.err) { box.innerHTML = `<div class="sl-info">${esc(L.err)}</div>`; return; }
  const md = vtMode(p, L);
  const F = { info: fnc(p.info, VT_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, VT_KEYS) : null, tip: fnc(p.tip, VT_KEYS), found: fnc(p.found, VT_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const seen = []; let st = vtInit(), sel = null, lastTip = '';
  const CW = 30, PADL = 8, DX = L.op === '÷' ? 16 : 0, X = (c) => PADL + c * CW + (c >= L.c0 && L.op === '÷' ? DX : 0) + CW / 2;
  // 竖向位置
  let y = 6; const RY = {}, LY = {};
  if (L.op === '÷') y += 4;
  for (const r of L.rows) {
    RY[r.name] = y; y += r.small ? 15 : 36;
    if (r.name === 'q') { LY.q = y + 2; y += 6; }
    if (r.line) { LY[r.name] = y + 3; y += 8; }
  }
  const VW = PADL * 2 + L.W * CW + DX, VH = y + 6;
  box.innerHTML = `<div class="vt" tabindex="-1">${SVG(VW, VH, '<g class="vt-g"></g>', 'vtsvg')}</div><div class="sl-info vt-info"></div>` +
    (md === 'puzzle' && (p.need > 1 || p.found_show) && p.found_show !== false ? '<div class="hk-found sl-found vt-found"></div>' : '') +
    (md === 'steps' ? bar(btn('vt-prev', '上一步') + btn('vt-next', '下一步') + btn('vt-reset', '重来')) : '') +
    (md !== 'steps' ? `<div class="vt-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button class="vt-k" data-k="${d}">${d}</button>`).join('')}<button class="vt-k vt-del" data-k="" aria-label="删除">删</button></div>` + bar(btn(md === 'puzzle' ? 'vt-clear' : 'vt-reset', md === 'puzzle' ? '清空' : '重来')) : '');
  Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw || Math.round(VW * 1.35)}px`, marginInline: 'auto' });
  const shownIds = () => { const s = new Set(); if (md !== 'steps') return null; L.steps.slice(0, st.step).forEach((q) => q.ids.forEach((id) => s.add(id))); return s; };
  const draw = () => {
    let v = vtEnv(p, L, st, seen);
    if (md === 'puzzle' && v.valid && !F.found && !seen.includes(v.txt)) { seen.push(v.txt); v = vtEnv(p, L, st, seen); }
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = vtEnv(p, L, st, seen); } }
    const shown = shownIds(), fresh = new Set(md === 'steps' && st.step ? L.steps[st.step - 1].ids : []);
    let s = '';
    if (L.op === '÷') {
      const x0 = X(L.c0) - CW / 2 - 6, top = LY.q, bot = RY.a + 34;
      s += `<path d="M${r1(x0 - 3)},${r1(bot)} Q${r1(x0 + 7)},${r1((top + bot) / 2)} ${r1(x0)},${r1(top)} L${r1(X(L.W - 1) + CW / 2 + 2)},${r1(top)}" class="vt-ln"/>`;
    }
    for (const r of L.rows) {
      if (r.line && LY[r.name] !== undefined) {
        const c1 = X(L.W - 1) + CW / 2 + 2, cA = r.lc0 !== undefined ? X(r.lc0) - CW / 2 - 2 : PADL;
        const cB = r.lc0 !== undefined ? X(r.cells[r.cells.length - 1].col) + CW / 2 + 2 : c1;
        s += `<line x1="${r1(cA)}" y1="${LY[r.name]}" x2="${r1(cB)}" y2="${LY[r.name]}" class="vt-ln"/>`;
      }
      const yy = RY[r.name];
      if (r.sym) s += `<text x="${X(0)}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-sym">${r.sym}</text>`;
      for (const c of r.cells) {
        const x = X(c.col);
        if (r.small) {
          const on = md === 'steps' ? shown.has(c.id) : p.carry === true;
          if (!on) continue;
          s += c.ch === '·' ? `<circle cx="${x}" cy="${yy + 9}" r="2.6" class="vt-bdot${fresh.has(c.id) ? ' new' : ''}"/>` : `<text x="${x + 7}" y="${yy + 12}" text-anchor="middle" font-size="12" class="st vt-cy${fresh.has(c.id) ? ' new' : ''}">${esc(c.ch)}</text>`;
          continue;
        }
        if (md === 'steps') {
          const opd = /^[abcefghd]$/.test(c.row);
          if (!opd && !shown.has(c.id)) continue;
          s += `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="24" class="st vt-dg${fresh.has(c.id) ? ' new' : ''}">${esc(c.ch)}</text>`;
        } else if (md === 'fill' && L.blanks.includes(c.id)) {
          const val = st.vals[c.id], cls = val === undefined ? '' : String(val) === c.ch ? ' ok' : ' bad';
          s += `<g class="vt-c${cls}${sel === c.id ? ' sel' : ''}" data-id="${c.id}"><rect x="${x - 13}" y="${yy + 2}" width="26" height="32" rx="5" class="vt-box"/>${val !== undefined ? `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-in">${val}</text>` : ''}</g>`;
        } else if (md === 'puzzle' && c.v !== undefined) {
          const val = st.vals[c.v], isBox = c.ch === '□', cls = `vt-c vt-var${sel === c.v ? ' sel' : ''}${val !== undefined ? ' set' : ''}${v.full ? (v.valid ? ' ok' : ' bad') : ''}`;
          s += `<g class="${cls}" data-v="${esc(c.v)}"><rect x="${x - 13}" y="${yy + 2}" width="26" height="32" rx="5" class="vt-box${isBox ? ' sq' : ''}"/>` +
            (val !== undefined ? `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-in">${val}</text>${isBox ? '' : `<text x="${x + 10}" y="${yy + 11}" text-anchor="middle" font-size="9" class="st vt-vl">${esc(c.ch)}</text>`}`
              : isBox ? '' : `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-let">${esc(c.ch)}</text>`) + '</g>';
        } else s += `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="24" class="st vt-dg">${esc(c.ch)}</text>`;
      }
    }
    box.querySelector('.vt-g').innerHTML = s;
    const el = box.querySelector('.vt-info');
    if (F.info) el.innerHTML = run(F.info, v, '');
    else if (md === 'steps') el.innerHTML = st.step ? esc(L.steps[st.step - 1].text) : '';
    else if (md === 'puzzle' && v.full) el.innerHTML = v.valid ? `<b class="jade">${esc(v.txt.replace(/([+\-×=])/g, ' $1 '))}　成立</b>` : `<b class="plum">${v.why === 'dup' ? '不同的字填了同一个数字' : v.why === 'zero' ? '最高位不能是 0' : '等式不成立'}</b>`;
    else el.innerHTML = '';
    tex(el);
    const fd = box.querySelector('.vt-found'); if (fd) fd.innerHTML = foundBox(p, seen.map((t) => t.replace(/([+\-×=])/g, ' $1 ')));
    const nx = box.querySelector('.vt-next'); if (nx) nx.disabled = st.step >= L.steps.length;
    const pv = box.querySelector('.vt-prev'); if (pv) pv.disabled = st.step <= 0;
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (vtGoal(p, L, v, F.goal)) ok();
  };
  const act = (a) => { const r = vtApply(p, L, st, a); if (typeof r === 'string') { api.say(r + '。'); return false; } st = r; return true; };
  // 填完一格自动跳到同一行左边一格（竖式从右往左算）
  const nextBlank = (id) => { const c = L.cells[id], same = L.blanks.map((q) => L.cells[q]).filter((q) => q.row === c.row && q.pos > c.pos).sort((a, b) => a.pos - b.pos); return same.length ? same[0].id : id; };
  const key = (d) => {
    if (!sel) { api.say('先点一个格子。'); return; }
    if (!act(`set:${sel}=${d}`)) return;
    if (md === 'fill' && d !== '') sel = nextBlank(sel);
    draw();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.vt-reset')) { st = vtInit(); sel = null; draw(); return; }
    if (e.target.closest('.vt-clear')) { act('clear'); sel = null; draw(); return; }
    if (e.target.closest('.vt-next')) { act('next'); draw(); return; }
    if (e.target.closest('.vt-prev')) { act('prev'); draw(); return; }
    const k = e.target.closest('.vt-k'); if (k) { key(k.dataset.k); return; }
    const c = e.target.closest('.vt-c'); if (c) { sel = c.dataset.id || c.dataset.v; draw(); box.querySelector('.vt').focus({ preventScroll: true }); }
  });
  box.querySelector('.vt').addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); } else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); key(''); }
  });
  draw();
}

export const SIMS_R7 = { calendar, match, vertical };
export const R7_CORE = { CAL_KEYS, calModel, calInit, calApply, calEnv, calRun, calGoal, MC_KEYS, mcModel, mcApply, mcEnv, mcRun, VT_KEYS, vtParse, vtLayout, vtCheck, vtSolVals, vtSolve, vtMode, vtInit, vtApply, vtEnv, vtGoal, vtRun };
