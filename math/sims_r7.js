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
//   start: '3-1'（起点日期，高亮；跨年时写 '2024-12-25'）, jumps: [7, -7, 1, -1]（「往后 7 天 / 往前 7 天」按钮）, max_jumps（跳日按钮最多按几次）, 有跳日按钮就有「退一步」（撤销上一次跳）,
//   slider: {max, min（可以为负：往前）, step, label, unit（默认「天」）, neg_label（负数时的说法，默认「往前」）}（「过了 n 天」滑块，从 start 算）,
//   tap: 'pick'（默认，点日期圈上 / 取消）| 'move'（点日期把「当前日期」挪过去）| false, col: true（点表头「星期五」整列高亮）, cols: [5]（一开始就高亮的列）,
//   marks: [{at: '3-8', text: '生日', cls: 'a'|'b'|'c'}]（日期下的小字）, want: '表达式'（哪些日期该圈：变量 d mo y wd；给了它默认 goal 是「正好圈全」）, check: true（圈错的标出来）,
//   wd_show: false（下面的说明不写星期几，免得露答案）, hide_wd: true（连表头的星期几也不显示）, hide_days: ['5-27']（这几天的数字打码成「?」）, upto: '1-26'（只显示到这天，后面的格子空着）,
//   vary: {first: true | [0, 3], days: true | [28, 31]（两个数是范围）| [28, 30, 31]}（不给 year 时：出现「1 日是星期几」「这个月几天」小按钮，月历跟着变）,
//   titles: ['…']（每个月的标题）, day_label: '{title} {d} 日'（下面说明行的日期写法，可用 {y} {mo} {d} {title}）,
//   info, goal, tip, found, solution: ['+7', 'undo', 'tap:3-15', 'col:5', 'n:30', 'first:3', 'days:30', 'next', 'prev'] }
// 表达式里：d / mo / y / wd（当前日期，没有时 d = 0）、cur（当前日期的 key，如 '3-15'）、off（当前日期离 start 几天，往前为负）、picked（圈上的 key 数组）、npicked、pwd（圈上的各是星期几）、
//   has('3-15')、cols（高亮的列）、jumps（跳了几次）、nright / nwrong（圈对 / 圈错几个，要有 want）、all（正好圈全）、view（正在看的月份）、first / days（第一个月 1 日星期几、几天）、nfound、seen
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const CAL_KEYS = ['d', 'mo', 'y', 'wd', 'cur', 'off', 'picked', 'npicked', 'pwd', 'has', 'cols', 'jumps', 'nright', 'nwrong', 'all', 'view', 'nfound', 'seen', 'first', 'days'];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const mDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const rng = (a, b) => { const o = []; for (let x = a; x <= b; x++) o.push(x); return o; };
// vary：可变的「1 日星期几」「这个月几天」（只在不给 year 时）
function calVary(p) {
  if (!p.vary || p.year != null) return null;
  const v = p.vary === true ? { first: true, days: true } : p.vary;
  const F = v.first ? (v.first === true ? rng(0, 6) : [].concat(v.first).map(Number)) : null;
  const D = v.days ? (v.days === true ? rng(28, 31) : Array.isArray(v.days) && v.days.length === 2 ? rng(Math.min(...v.days), Math.max(...v.days)) : [].concat(v.days).map(Number)) : null;
  return F || D ? { F, D } : null;
}
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
  return { months, days, idx, want, multiY, show: Math.max(1, Math.min(p.show || 1, months.length)), vary: calVary(p), cache: {} };
}
// 有 vary 时按当前的 first / days 换一个月历（缓存）
function calVM(p, M, st) {
  if (!M.vary || !st || (st.vf === undefined && st.vd === undefined)) return M;
  const k = `${st.vf}|${st.vd}`;
  if (!M.cache[k]) M.cache[k] = calModel({ ...p, vary: null, first: st.vf ?? p.first, days: st.vd === undefined ? p.days : Array.isArray(p.days) ? [st.vd, ...p.days.slice(1)] : st.vd });
  return M.cache[k];
}
const calRef = (M, x) => (x === undefined || x === null ? -1 : typeof x === 'number' ? (x >= 1 && x <= M.months[0].n ? x - 1 : -1) : (M.idx[String(x)] ?? -1));
// 打码（显示「?」）和只显示到哪天
function calHid(p, M) { const mask = new Set((p.hide_days || []).map((k) => calRef(M, k)).filter((i) => i >= 0)); const u = p.upto != null ? calRef(M, p.upto) : -1; return { mask, up: u >= 0 ? u : Infinity }; }
function calInit(p, M) {
  const V = M.vary, vf = V && V.F ? (p.first ?? V.F[0]) : undefined, vd = V && V.D ? ((Array.isArray(p.days) ? p.days[0] : p.days) ?? V.D[V.D.length - 1]) : undefined;
  const st0 = vf !== undefined || vd !== undefined ? { vf, vd } : {};
  const MM = calVM(p, M, st0), s = calRef(MM, p.start), view = s >= 0 ? Math.min(MM.days[s].mi, MM.months.length - MM.show) : 0;
  return { ...st0, cur: s >= 0 ? s : null, start: s >= 0 ? s : null, picked: [], cols: (p.cols || []).map(Number), trail: s >= 0 ? [s] : [], view, jumps: 0, n: 0, jl: [] };
}
function calSee(M, st) { if (st.cur === null) return st; const mi = M.days[st.cur].mi; if (mi < st.view) st.view = mi; if (mi > st.view + M.show - 1) st.view = mi - M.show + 1; return st; }
function calApply(p, M0, st, a) {
  const S = { ...st, picked: [...st.picked], cols: [...st.cols], trail: [...st.trail], jl: [...(st.jl || [])] };
  const M = calVM(p, M0, st);
  let m;
  if ((m = /^(first|days):(\d+)$/.exec(a))) {
    const V = M0.vary, list = V && (m[1] === 'first' ? V.F : V.D), x = +m[2];
    if (!list) return `这个月历不能改${m[1] === 'first' ? '星期' : '天数'}`;
    if (!list.includes(x)) return `${m[1]} 只能取 ${list.join('、')}`;
    if (m[1] === 'first') S.vf = x; else S.vd = x;
    const N = { ...calInit(p, M0), vf: S.vf, vd: S.vd }, MM = calVM(p, M0, N), s = calRef(MM, p.start);
    return { ...N, cur: s >= 0 ? s : null, start: s >= 0 ? s : null, trail: s >= 0 ? [s] : [], cols: S.cols, view: Math.min(S.view, MM.months.length - MM.show) };
  }
  if ((m = /^([+-]\d+)$/.exec(a))) {
    if (S.cur === null) return '还没有起点日期';
    if (p.max_jumps && S.jumps >= p.max_jumps) return `最多跳 ${p.max_jumps} 次`;
    const to = S.cur + Number(m[1]); if (to < 0 || to >= M.days.length) return '超出月历了';
    S.jl.push(S.cur); S.cur = to; S.trail.push(to); S.jumps++; return calSee(M, S);
  }
  if (a === 'undo') {
    if (!S.jl.length) return '还没有跳过';
    S.cur = S.jl.pop(); S.trail.pop(); S.jumps--; return calSee(M, S);
  }
  if ((m = /^n:(-?\d+)$/.exec(a))) {
    if (S.start === null) return '没有 start，不能用滑块';
    const to = S.start + Number(m[1]); if (to < 0 || to >= M.days.length) return '超出月历了';
    S.cur = to; S.n = Number(m[1]); S.trail = [S.start, to]; return calSee(M, S);
  }
  if ((m = /^tap:(.+)$/.exec(a))) {
    const i = M.idx[m[1]]; if (i === undefined) return `月历里没有 ${m[1]}`;
    const mi = M.days[i].mi; if (mi < S.view || mi >= S.view + M.show) return `${m[1]} 那个月现在没显示（先翻月）`;
    if (i > calHid(p, M).up) return `${m[1]} 没有显示出来`;
    const tap = p.tap === undefined ? 'pick' : p.tap;
    if (tap === 'move') { S.cur = i; S.trail.push(i); return S; }
    if (tap !== 'pick') return '这个月历不能点日期';
    S.picked = S.picked.includes(i) ? S.picked.filter((x) => x !== i) : [...S.picked, i]; return S;
  }
  if ((m = /^col:(\d)$/.exec(a))) { if (!p.col || p.hide_wd) return '这个月历不能点星期'; const w = +m[1]; S.cols = S.cols.includes(w) ? S.cols.filter((x) => x !== w) : [...S.cols, w]; return S; }
  if (a === 'next') { if (S.view + M.show >= M.months.length) return '已经是最后一个月'; S.view++; return S; }
  if (a === 'prev') { if (S.view <= 0) return '已经是第一个月'; S.view--; return S; }
  return `不认识的操作 ${a}`;
}
function calEnv(p, M0, st, seen = []) {
  const M = calVM(p, M0, st);
  const c = st.cur !== null ? M.days[st.cur] : null, pk = st.picked.map((i) => M.days[i]);
  const nright = M.want ? st.picked.filter((i) => M.want.has(i)).length : 0, nwrong = M.want ? st.picked.length - nright : 0;
  const keys = pk.map((q) => q.key);
  return { d: c ? c.d : 0, mo: c ? c.mo : 0, y: c ? c.y ?? 0 : 0, wd: c ? c.wd : -1, cur: c ? c.key : '', off: c && st.start !== null ? st.cur - st.start : 0,
    picked: keys, npicked: keys.length, pwd: pk.map((q) => q.wd), has: (k) => keys.includes(String(k)), cols: [...st.cols], jumps: st.jumps,
    nright, nwrong, all: !!M.want && nwrong === 0 && nright === M.want.size, view: M.months[st.view].mo, nfound: seen.length, seen, first: M.months[0].wd0, days: M.months[0].n };
}
function calRun(p, sol) { const M = calModel(p); let st = calInit(p, M); for (const a of sol || []) { const r = calApply(p, M, st, a); if (typeof r === 'string') return [M, st, `${a}：${r}`]; st = r; } return [M, st, null]; }
function calGoal(p, M, v, F) { return F ? !!run(F, v, false) : !!(M.want && v.all); }
// 下面说明行里的日期：跨年带年份；不给年份但有 titles 时用标题的叫法；day_label 模板
function calDayTxt(p, M, q) {
  const title = (p.titles || [])[q.mi];
  if (p.day_label) return String(p.day_label).replace(/\{(y|mo|d|title)\}/g, (_, k) => (k === 'title' ? title ?? `${q.mo} 月` : k === 'y' ? q.y ?? '' : q[k]));
  if (q.y == null && title != null) return `${title} ${q.d} 日`;
  return `${M.multiY ? `${q.y} 年 ` : ''}${q.mo} 月 ${q.d} 日`;
}
function calSvg(p, M, st, mi) {
  const mo = M.months[mi], CW = 44, CH = 40, top = 30, hd = p.hide_wd ? 0 : 26, sh = p.mon ? 1 : 0, off = (mo.wd0 - sh + 7) % 7, rows = Math.ceil((off + mo.n) / 7);
  const vw = 7 * CW + 4, vh = top + hd + rows * CH + 4, X = (c) => 2 + c * CW;
  const title = (p.titles || [])[mi] ?? `${mo.y != null ? `${mo.y} 年 ` : ''}${mo.mo} 月`;
  let s = `<text x="${vw / 2}" y="20" text-anchor="middle" font-size="16" font-weight="700" class="st lbl">${esc(title)}</text>`;
  for (let c = 0; c < 7; c++) {
    const w = (c + sh) % 7;
    if (st.cols.includes(w)) s += `<rect x="${X(c) + 1}" y="${top}" width="${CW - 2}" height="${hd + rows * CH}" rx="8" class="cl-colhl"/>`;
    if (p.hide_wd) continue;
    s += `<g class="cl-h${p.col ? ' cl-act' : ''}${w === 0 || w === 6 ? ' we' : ''}${st.cols.includes(w) ? ' on' : ''}"${p.col ? ` data-a="col:${w}"` : ''}><rect x="${X(c) + 2}" y="${top + 1}" width="${CW - 4}" height="${hd - 3}" rx="6" class="cl-hb"/><text x="${X(c) + CW / 2}" y="${top + 18}" text-anchor="middle" font-size="14" class="st cl-ht">${WD[w]}</text></g>`;
  }
  const marks = {}; for (const mk of p.marks || []) { const i = calRef(M, mk.at); if (i >= 0) (marks[i] = marks[i] || []).push(mk); }
  const tap = p.tap === undefined ? 'pick' : p.tap, hid = calHid(p, M);
  for (let d = 1; d <= mo.n; d++) {
    const i = mo.i0 + d - 1, q = M.days[i], pos = off + d - 1, x = X(pos % 7), y = top + hd + Math.floor(pos / 7) * CH;
    const gone = i > hid.up, act = tap && !gone;
    const pk = st.picked.includes(i), cls = ['cl-d', act ? 'cl-act' : '', gone ? 'cl-x' : '', st.cur === i ? 'cur' : '', st.trail.includes(i) && st.cur !== i ? 'tr' : '', pk ? 'pk' : '', pk && p.check && M.want ? (M.want.has(i) ? 'ok' : 'bad') : '', st.start === i ? 'st0' : ''].filter(Boolean).join(' ');
    const mk = gone ? [] : marks[i] || [], num = gone ? '' : hid.mask.has(i) ? '?' : d;
    s += `<g class="${cls}"${act ? ` data-a="tap:${esc(q.key)}"` : ''}>${pk && st.cur === i ? `<rect x="${x + 0.5}" y="${y + 0.5}" width="${CW - 1}" height="${CH - 1}" rx="11" class="cl-ring"/>` : ''}<rect x="${x + 3}" y="${y + 3}" width="${CW - 6}" height="${CH - 6}" rx="9" class="cl-b"/>` +
      `<text x="${x + CW / 2}" y="${y + (mk.length ? 20 : 25)}" text-anchor="middle" font-size="${mk.length ? 14 : 16}" class="st cl-n">${num}</text>` +
      (mk.length ? `<text x="${x + CW / 2}" y="${y + CH - 7}" text-anchor="middle" font-size="9.5" class="st cl-mk c-${esc(mk[0].cls || 'b')}">${esc(mk.map((o) => o.text).join(' '))}</text>` : '') + '</g>';
  }
  return SVG(vw, vh, s, 'clsvg');
}
function calendar(box, p, api) {
  const M0 = calModel(p);
  const F = { info: fnc(p.info, CAL_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, CAL_KEYS) : null, tip: fnc(p.tip, CAL_KEYS), found: fnc(p.found, CAL_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const seen = [], sl = p.slider ? { min: 0, step: 1, max: 30, ...(p.slider === true ? {} : p.slider) } : null;
  let st = calInit(p, M0), lastTip = '';
  const jumps = p.jumps || [], V = M0.vary;
  const seg = (k, list, lab) => list.map((x) => `<button class="lp-ghost cl-btn cl-seg" data-a="${k}:${x}">${lab(x)}</button>`).join('');
  box.innerHTML = '<div class="cl-wrap' + (M0.show > 1 ? ' multi' : '') + '"></div><div class="sl-info cl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found cl-found"></div>' : '') +
    (V && V.F ? bar(`<span>1 日是星期</span>${seg('first', V.F, (x) => WD[x])}`, 'cl-ops cl-vary') : '') +
    (V && V.D ? bar(`<span>这个月有</span>${seg('days', V.D, (x) => x)}<span>天</span>`, 'cl-ops cl-vary') : '') +
    (sl ? bar(`<span class="cl-sl"></span><input type="range" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${sl.min}" data-k="n" aria-label="${esc(sl.label || '天数')}">`) : '') +
    bar(jumps.map((k) => btn('cl-btn', `${k > 0 ? '往后' : '往前'} ${Math.abs(k)} 天`, `${k > 0 ? '+' : ''}${k}`)).join('') + (jumps.length ? btn('cl-btn cl-undo', '退一步', 'undo') : '') +
      (M0.months.length > M0.show ? btn('cl-btn', '‹ 上个月', 'prev') + btn('cl-btn', '下个月 ›', 'next') : '') + btn('cl-reset', '重来'), 'cl-ops');
  const draw = () => {
    const M = calVM(p, M0, st);
    let v = calEnv(p, M0, st, seen);
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = calEnv(p, M0, st, seen); } }
    let h = ''; for (let mi = st.view; mi < st.view + M.show; mi++) h += calSvg(p, M, st, mi);
    box.querySelector('.cl-wrap').innerHTML = h;
    const el = box.querySelector('.cl-info');
    if (F.info) el.innerHTML = run(F.info, v, '');
    else if (v.cur) el.innerHTML = `<b>${esc(calDayTxt(p, M, M.days[st.cur]))}</b>${p.wd_show === false || p.hide_wd ? '' : ` 星期${WD[v.wd]}`}${st.start !== null && v.off ? `（${v.off > 0 ? '往后' : '往前'} ${Math.abs(v.off)} 天）` : ''}`;
    else el.innerHTML = '';
    tex(el);
    const sv = box.querySelector('.cl-sl'); if (sv) sv.innerHTML = st.n < 0 ? `${esc(sl.neg_label || '往前')} <b class="cl-n0">${-st.n}</b> ${esc(sl.unit ?? '天')}` : `${esc(sl.label || '过了')} <b class="cl-n0">${st.n}</b> ${esc(sl.unit ?? '天')}`;
    const r = box.querySelector('input[data-k="n"]'); if (r) r.value = st.n;
    box.querySelectorAll('.cl-ops .cl-btn:not(.cl-seg)').forEach((b) => { b.disabled = typeof calApply(p, M0, st, b.dataset.a) === 'string'; });
    box.querySelectorAll('.cl-seg').forEach((b) => { const [k, x] = b.dataset.a.split(':'); b.classList.toggle('on', (k === 'first' ? v.first : v.days) === +x); });
    const fd = box.querySelector('.cl-found'); if (fd) fd.innerHTML = foundBox(p, seen);
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (calGoal(p, M, v, F.goal)) ok();
  };
  const act = (a) => { const r = calApply(p, M0, st, a); if (typeof r === 'string') { api.say(r + '。'); return; } st = r; draw(); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cl-reset')) { st = calInit(p, M0); draw(); return; }
    const a = e.target.closest('[data-a]'); if (a && box.contains(a)) act(a.dataset.a);
  });
  const rg = box.querySelector('input[data-k="n"]'); if (rg) rg.addEventListener('input', () => act(`n:${rg.value}`));
  draw();
}

// ───────── 连线配对 ─────────
// { left: [项], right: [项]（项是文字，可带 $公式$；或 {text, svg, name}：svg 是一小张图，如钟面、图形；name 是列表里写的名字）, pairs: [[左序号, 右序号], …]（正确配对，从 0 数；同一项出现几次就是一对多）,
//   multi: true | 'left' | 'right'（允许一项连几条，不写时按 pairs 自动判断）, layout: 'rows'（上下两行，默认左右两列）, check: 'end'（全部连完才显示对错，默认连一条就显示）,
//   invert: true（「全部连错」题：不在 pairs 里的线算对、显示绿色；要给 solution）, size（图的宽，默认最大 90）, info, goal, tip, found（'links'：连对一种就把连法记下来）, solution: [[左, 右], …]（不写就按 pairs 连） }
// 点一项再点另一边的一项连线（先点哪边都行）；一对一时重连会替换旧线；再点一次已经连着的两项就取消；「退一步」「重来」。
// 表达式里：links（'左-右' 数组）、names（'左→右' 名字数组）、n（连了几条）、nright / nwrong、all（全部连对、没有错线）、complete（连的条数够了）、nfound、seen。不写 goal 时 all 算完成。
// say_ok 和 info 的结果里写 {links} 会换成孩子连好的配对（「左→右、…」）。
const MC_KEYS = ['links', 'names', 'n', 'nright', 'nwrong', 'all', 'complete', 'nfound', 'seen'];
const mcItems = (arr) => (arr || []).map((x) => (x && typeof x === 'object' ? x : { text: String(x) }));
function mcModel(p) {
  const prs = (p.pairs || []).map(([i, j]) => [+i, +j]), dup = (k) => { const m = {}; return prs.some((q) => (m[q[k]] = (m[q[k]] || 0) + 1) > 1); };
  return { L: mcItems(p.left), R: mcItems(p.right), pairs: new Set(prs.map(([i, j]) => `${i}-${j}`)), mL: p.multi === true || p.multi === 'left' || dup(0), mR: p.multi === true || p.multi === 'right' || dup(1), inv: !!p.invert };
}
function mcApply(M, links, i, j) {
  if (!(i >= 0 && i < M.L.length && j >= 0 && j < M.R.length)) return `没有 ${i}-${j} 这两项`;
  const k = `${i}-${j}`; if (links.includes(k)) return links.filter((x) => x !== k);
  return [...links.filter((x) => { const [a, b] = x.split('-').map(Number); return !((!M.mL && a === i) || (!M.mR && b === j)); }), k];
}
const mcGood = (M, k) => M.pairs.has(k) !== M.inv;
const mcName = (it, i, s) => (it.name != null ? String(it.name) : it.text !== undefined && it.text !== '' ? String(it.text) : `${s === 'L' ? '左' : '右'} ${i + 1}`);
function mcNames(M, links) {
  return [...links].sort((a, b) => { const [x, y] = a.split('-').map(Number), [u, w] = b.split('-').map(Number); return x - u || y - w; })
    .map((k) => { const [i, j] = k.split('-').map(Number); return `${mcName(M.L[i], i, 'L')}→${mcName(M.R[j], j, 'R')}`; });
}
function mcEnv(M, links, seen = []) {
  const nright = links.filter((k) => mcGood(M, k)).length, nwrong = links.length - nright;
  return { links: [...links], names: mcNames(M, links), n: links.length, nright, nwrong, all: nwrong === 0 && (M.inv ? nright >= M.pairs.size : nright === M.pairs.size), complete: links.length >= M.pairs.size, nfound: seen.length, seen };
}
// found='links'：连对（all）时把连法记下来
const mcFound = (v) => (v.all && v.n ? v.names.join('、') : '');
const mcLinksTxt = (s, v) => String(s ?? '').replace(/\{links\}/g, v.names.join('、') || '（还没有连）');
function mcRun(p, sol) { const M = mcModel(p); let L = []; for (const [i, j] of sol || (p.pairs || [])) { const r = mcApply(M, L, +i, +j); if (typeof r === 'string') return [M, L, r]; L = r; } return [M, L, null]; }
function match(box, p, api) {
  const M = mcModel(p), rows = p.layout === 'rows', fl = p.found === 'links';
  const F = { info: fnc(p.info, MC_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, MC_KEYS) : null, tip: fnc(p.tip, MC_KEYS), found: fl ? null : fnc(p.found, MC_KEYS) };
  let v = null;
  const ok = once(() => api.solved(p.say_ok && v ? mcLinksTxt(p.say_ok, v) : p.say_ok));
  const seen = []; let links = [], hist = [], sel = null, lastTip = '';
  const fig = p.size ? `width:${p.size}px;max-width:100%` : 'max-width:90px';
  const item = (it, s, i) => `<button class="mc-it${it.svg ? ' has-svg' : ''}" data-s="${s}" data-i="${i}">${it.svg ? `<span class="mc-fig" style="${fig}">${it.svg}</span>` : ''}${it.text !== undefined && it.text !== '' ? `<span class="mc-tx">${esc(it.text)}</span>` : ''}</button>`;
  box.innerHTML = `<div class="mc${rows ? ' mc-rows' : ''}"><div class="mc-col mc-l">${M.L.map((it, i) => item(it, 'L', i)).join('')}</div>${rows ? '' : '<div class="mc-gap"></div>'}<div class="mc-col mc-r">${M.R.map((it, j) => item(it, 'R', j)).join('')}</div><svg class="mc-lines" aria-hidden="true"></svg></div>` +
    '<div class="sl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found mc-found"></div>' : '') + bar(btn('mc-undo', '退一步') + btn('mc-reset', '重来'));
  const wrap = box.querySelector('.mc'), svg = box.querySelector('.mc-lines');
  box.querySelectorAll('.mc-tx').forEach(tex);
  const status = (k, v) => (p.check === 'end' && !v.complete ? 'pend' : mcGood(M, k) ? 'ok' : 'bad');
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
    v = mcEnv(M, links, seen);
    const nm = fl ? mcFound(v) : F.found ? run(F.found, v, '') : '';
    if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = mcEnv(M, links, seen); }
    box.querySelectorAll('.mc-it').forEach((b) => {
      const s = b.dataset.s, i = +b.dataset.i, mine = links.filter((k) => k.split('-')[s === 'L' ? 0 : 1] === String(i));
      const st = mine.length ? (mine.some((k) => status(k, v) === 'bad') ? 'bad' : mine.every((k) => status(k, v) === 'ok') ? 'ok' : 'pend') : '';
      b.className = `mc-it${b.querySelector('.mc-fig') ? ' has-svg' : ''}${st ? ` ln ${st}` : ''}${sel && sel.s === s && sel.i === i ? ' sel' : ''}`;
    });
    lines();
    const el = box.querySelector('.sl-info'); el.innerHTML = F.info ? mcLinksTxt(run(F.info, v, ''), v) : ''; tex(el);
    const fd = box.querySelector('.mc-found'); if (fd) { fd.innerHTML = foundBox(p, seen); tex(fd); }
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
//     steps: true（不填，「下一位」逐位演示：每一位怎么算、进位借位、部分积、长除法的商乘减落，说明写在下面；step_label 改按钮名）,
//     carry: true（填空时把进位 / 退位点也显示出来；多位乘多位时每个部分积的进位小字也画出来，演示里逐位出现）, partial: false（多位乘数不写部分积）；
//   竖式谜：eq 里有字母 / 汉字 / □（'AB+BA=CDC'、'3□5+2□7=6□2'、'□□□÷□□=□8'），同字同数、不同字不同数，□ 各自独立；
//     distinct: false（字母也可以相同）| 'all'（所有空含各个 □ 互不相同）| 'box'（□ 之间互不相同）, distinct_given: true（字母不能和题里写出的数字相同）,
//     same_box: true（所有 □ 是同一个数，当成一个字母）, given: {'C': 6}（先填好并锁住）, digits: [1, 3, 5]（只能填这些数字）,
//     check: 'col'（加减乘：从个位往上逐列实时标出哪一列对不上）, tags: false（不写字母小标）,
//     乘法可给 parts: ['…', '…']（部分积，从乘数个位起）；除法给 parts: [乘积1, 减完落下的数1, 乘积2, …, 余数]（每个不是 0 的商位两行，最后一行是余数；商里写出的 0 那一位没有乘积）；
//     孩子点字再按数字键填，填满自动判对错，找到的解列在下面；need（要找几组解，默认 1），solution: ['12+21=33', …]（各组解写成填好的等式，除法写 '1024÷32=32'）；
//   info, goal, tip, found }
// 行名：a、b、c…（加数 / 被减数 / 因数；除法 a 是被除数、d 是除数）、s（结果）、k（进位 / 退位点；部分积的进位是 k1 k2…）、p1 p2…（部分积 / 除法每次的乘积）、r1 r2…（除法每次减后落下的数）、q（商）。
// 格子是「行名:数位」，数位从右边 0 数起（除法按被除数的个位对齐），如 's:0' 是结果的个位。
// 表达式里：filled / nblank / nright / nwrong / done（填空）、step / nsteps（演示）、vals（竖式谜：字→数字）、boxes（竖式谜里各个 □ 的值，按出现顺序，没填是 null）、
//   full（都填了）、valid（等式成立且不重复）、txt（填好的等式）、badcol（check='col' 时第一列对不上的数位，没有是 -1）、nfound、seen
// 默认 goal：演示看完、填空全对、竖式谜找到 need 组解。
const VT_KEYS = ['filled', 'nblank', 'nright', 'nwrong', 'done', 'step', 'nsteps', 'vals', 'boxes', 'full', 'valid', 'txt', 'badcol', 'nfound', 'seen'];
const PL = ['个位', '十位', '百位', '千位', '万位', '十万位', '百万位', '千万位', '亿位', '十亿位', '百亿位'];
const OPN = { '+': '+', '-': '−', '×': '×', '÷': '÷' };
const dig = (x, pos) => Math.floor(x / 10 ** pos) % 10;
const OPR = (L) => (L.op === '÷' ? ['a', 'd'] : L.nums.map((_, k) => 'abcefgh'[k]));
const RES = (L) => (L.op === '÷' ? 'q' : 's');
function vtParse(eq) {
  const s = String(eq || '').replace(/\s+/g, '').replace(/\*/g, '×').replace(/\//g, '÷').replace(/[−–]/g, '-').replace(/[?？]/g, '□');
  const [lhs, res0 = null, extra] = s.split('=');
  if (extra !== undefined) return { err: 'eq 里只能有一个 =' };
  const op = ['+', '-', '×', '÷'].find((o) => lhs.includes(o)); if (!op) return { err: 'eq 里没有 + − × ÷' };
  const nums = lhs.split(op); if (nums.some((x) => !x) || (res0 !== null && !res0)) return { err: 'eq 写得不完整' };
  if (op !== '+' && nums.length !== 2) return { err: '只有加法可以连加' };
  let res = res0, rem = null;
  if (op === '÷' && res && /…|\.\.\.|余/.test(res)) { [res, rem] = res.split(/…+|\.{3,}|余/); if (!res || !rem) return { err: '除法写成 a÷b=商…余数' }; }
  if (/[+\-×÷]/.test(res || '')) return { err: '= 后面只能写一个数' };
  const puzzle = [...nums, res || ''].some((t) => /[^0-9]/.test(t));
  if (puzzle && res === null) return { err: '竖式谜要写出 = 后面的结果' };
  if (puzzle && rem !== null) return { err: '除法竖式谜的余数写在 parts 的最后一行' };
  return { op, nums, res, rem, puzzle };
}
// 排版：rows = [{name, cells: [{id, col, pos, ch, row, v}], small, sym, line}]，col 从左数，pos = W - 1 - col
function vtLayout(p) {
  const P = vtParse(p.eq); if (P.err) return { err: P.err };
  const { op, nums, res, puzzle } = P, rows = [], steps = [];
  let W = 0, c0 = 0;
  const mk = (name, str, endCol, o = {}) => { const ch = [...str]; return { name, small: !!o.small, sym: o.sym, cells: ch.map((c, k) => { const col = endCol - (ch.length - 1 - k); return { id: `${name}:${W - 1 - col}`, row: name, col, pos: W - 1 - col, ch: c }; }) }; };
  const add = (r, o = {}) => { Object.assign(r, o); rows.push(r); return r; };
  const nm = (k) => 'abcefgh'[k];
  const kcell = (r, pos) => ({ id: `${r}:${pos}`, row: r, col: W - 1 - pos, pos, ch: '' });
  let pcols = [];
  if (puzzle && op === '÷') {
    const [A, B] = nums, n = [...A].length, dl = [...B].length, m = [...res].length; c0 = dl; W = c0 + n;
    if (m > n) return { err: '商的位数比被除数还多' };
    const qr = add(mk('q', res, W - 1));
    const ar = add(mk('a', A, W - 1)); ar.cells.push(...[...B].map((ch, k) => ({ id: `d:${dl - 1 - k}`, row: 'd', col: k, pos: W - 1 - k, ch })));
    pcols = qr.cells.filter((c) => c.ch !== '0').map((c) => c.col);
    const parts = p.parts || [];
    if (parts.length && parts.length !== 2 * pcols.length) return { err: `除法竖式谜的 parts 要写 ${2 * pcols.length} 行：商的每个不是 0 的数位一行乘积、一行减完落下的数（最后一行是余数）` };
    if (parts.length) pcols.forEach((col, k) => {
      const pl = [...parts[2 * k]].length, prev = k ? [...parts[2 * k - 1]].length : pl;
      const pr = add(mk(`p${k + 1}`, parts[2 * k], col), { line: true }); pr.lc0 = Math.max(c0, col - Math.max(pl, prev) + 1);
      add(mk(`r${k + 1}`, parts[2 * k + 1], k + 1 < pcols.length ? pcols[k + 1] : W - 1));
    });
  } else if (puzzle) {
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
      const kr = add({ name: 'k', small: true, cells: [], line: true }); add(mk('s', String(S), W - 1));
      let cy = 0;
      for (let pos = 0; pos < lm; pos++) {
        const terms = v.filter((x, k) => nums[k].length > pos).map((x) => dig(x, pos)), t = terms.reduce((a, b) => a + b, 0) + cy, out = Math.floor(t / 10);
        let text = `${PL[pos]}：${terms.join(' + ')}${cy ? ` + 进位 ${cy}` : ''} = ${t}`;
        const ids = [`s:${pos}`];
        if (out && pos < lm - 1) { text += `，写 ${t % 10}，向${PL[pos + 1]}进 ${out}`; kr.cells.push({ ...kcell('k', pos + 1), ch: String(out) }); ids.push(`k:${pos + 1}`); }
        else if (out) { text += `，写 ${t % 10}，${PL[pos + 1]}直接写 ${out}`; for (let q = pos + 1; q < String(S).length; q++) ids.push(`s:${q}`); }
        steps.push({ ids, text }); cy = out;
      }
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
        if (nb) { kr.cells.push({ ...kcell('k', pos + 1), ch: '·' }); ids.push(`k:${pos + 1}`); }
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
          if (out && pos < la - 1) { text += `，写 ${t % 10}，向${PL[pos + 1]}进 ${out}`; if (out < 10) { kr.cells.push({ ...kcell('k', pos + 1), ch: String(out) }); ids.push(`k:${pos + 1}`); } }
          else if (out) { text += `，写 ${t % 10}，前面直接写 ${out}`; for (let q = pos + 1; q < String(S).length; q++) ids.push(`s:${q}`); }
          steps.push({ ids, text }); cy = out;
        }
      } else {
        const js = [...Array(lb).keys()].filter((j) => dig(b, j)), ps = js.map((j) => a * dig(b, j));
        W = Math.max(la, lb, String(S).length, ...js.map((j, n) => String(ps[n]).length + j)) + 1;
        add(mk('a', nums[0], W - 1)); add(mk('b', nums[1], W - 1, { sym: '×' }), { line: true });
        js.forEach((j, n) => {
          // carry: true 时每个部分积上面加一行进位小字（k1 k2…）
          const kr = p.carry === true ? add({ name: `k${n + 1}`, small: true, cells: [] }) : null;
          const bj = dig(b, j), r = add(mk(`p${n + 1}`, String(ps[n]), W - 1 - j), { line: n === js.length - 1 }); let cy = 0;
          for (let pos = 0; pos < la; pos++) {
            const da = dig(a, pos), t = da * bj + cy, out = Math.floor(t / 10), ids = [`${r.name}:${pos + j}`];
            let text = `${pos === 0 ? `用${PL[j]}上的 ${bj} 去乘 ${a}${j ? `，积的末位和${PL[j]}对齐` : ''}。` : ''}${da} × ${bj} = ${da * bj}${cy ? `，加进位 ${cy} 得 ${t}` : ''}`;
            if (out && pos < la - 1) { text += `，写 ${t % 10} 进 ${out}`; if (kr) { kr.cells.push({ ...kcell(kr.name, pos + 1 + j), ch: String(out) }); ids.push(`${kr.name}:${pos + 1 + j}`); } }
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
  let blanks = [], vars = {}, boxOrder = [];
  const given = {}, badGiven = [];
  if (puzzle) {
    for (const r of rows) for (const c of r.cells) if (!/[0-9]/.test(c.ch)) {
      c.v = c.ch === '□' ? (p.same_box ? '□' : c.id) : c.ch; (vars[c.v] = vars[c.v] || []).push(c.id);
      if (c.ch === '□') boxOrder.push(c.v);
    }
    for (const [k, d] of Object.entries(p.given || {})) { if (vars[k] && /^\d$/.test(String(d))) given[k] = +d; else badGiven.push(k); }
  } else if (!p.steps) {
    const fl = p.fill ?? (op === '÷' || (op === '×' && rows.some((r) => r.name === 'p1')) ? 'all' : 's');
    const want = fl === 'all' ? null : [].concat(fl).map(String);
    blanks = Object.values(cells).filter((c) => c.row[0] !== 'k' && !operand(c) && (!want || want.includes(c.row) || want.includes(c.id))).map((c) => c.id);
  }
  const lits = new Set(Object.values(cells).filter((c) => /^[0-9]$/.test(c.ch) && c.row[0] !== 'k').map((c) => +c.ch));
  // 多位的行，最高位不能是 0
  const lead = new Set(rows.filter((r) => r.cells.length > 1 && r.name[0] !== 'k').map((r) => r.cells[0].v).filter((v) => v !== undefined));
  if (puzzle && op === '÷') { const dc = rows[1].cells.filter((c) => c.row === 'd'); if (dc.length > 1 && dc[0].v !== undefined) lead.add(dc[0].v); }
  return { op, nums, res, rem: P.rem, puzzle, rows, cells, W, c0, steps, blanks, vars, letters: Object.keys(vars).filter((x) => !cells[x]), boxOrder, given, badGiven, lits, lead, pcols };
}
// 竖式谜的约束：可填的数字、哪些空要互不相同
function vtRules(p, L) {
  const DG = Array.isArray(p.digits) && p.digits.length ? p.digits.map(Number) : null;
  const ds = p.distinct === undefined ? true : p.distinct;
  const grp = (k) => (L.cells[k] ? (ds === 'all' ? 'A' : ds === 'box' ? 'B' : null) : ds === false ? null : ds === 'all' ? 'A' : 'L');
  return { DG, grp, dg: !!p.distinct_given };
}
// 一个空能不能填 d（不看等式）：返回 '' 或原因
function vtOk(L, R, vals, k, d) {
  if (R.DG && !R.DG.includes(d)) return 'digit';
  if (d === 0 && L.lead.has(k)) return 'zero';
  const g = R.grp(k);
  if (g) { if (R.dg && L.lits.has(d)) return 'dupg'; for (const k2 in vals) if (k2 !== k && vals[k2] === d && R.grp(k2) === g) return 'dup'; }
  return '';
}
const vtGiveOk = (p, L, vals, k, d) => ({ digit: '不在 digits 里', zero: '最高位不能是 0', dup: '和别的字重复', dupg: '和题里写出的数字相同' }[vtOk(L, vtRules(p, L), vals, k, d)] || '');
// 按 vals 拼出每一行的数
function vtRowsTxt(L, vals) { return Object.fromEntries(L.rows.filter((r) => r.cells.length && r.name[0] !== 'k').map((r) => [r.name, r.cells.filter((c) => c.row === r.name).map((c) => (c.v !== undefined ? String(vals[c.v]) : c.ch)).join('')]).concat([['d', L.op === '÷' ? L.rows.find((r) => r.name === 'a').cells.filter((c) => c.row === 'd').map((c) => (c.v !== undefined ? String(vals[c.v]) : c.ch)).join('') : '']])); }
// 除法：按真的长除法，算出商的哪些位不是 0、每一步的乘积和减完落下的数（排版规则同 vtLayout 的竖式谜）
function vtDivRows(L, A, B) {
  if (!(B > 0)) return null;
  const Q = String(Math.floor(A / B)), m = L.rows[0].cells.length; if (Q.length !== m) return null;
  const off = L.W - m, pc = [...Q].map((x, t) => (x !== '0' ? off + t : -1)).filter((c) => c >= 0);
  if (pc.join() !== L.pcols.join()) return null;
  if (!pc.length) return { Q, rows: [], R: A % B };
  const As = String(A), out = [];
  let cur = Number(As.slice(0, pc[0] - L.c0 + 1));
  pc.forEach((col, k) => {
    const prod = Number(Q[col - off]) * B, rem = cur - prod, nx = k + 1 < pc.length ? pc[k + 1] : L.W - 1;
    cur = Number(String(rem) + As.slice(col - L.c0 + 1, nx - L.c0 + 1));
    out.push(String(prod), String(cur));
  });
  return { Q, rows: out, R: A % B };
}
// 竖式谜：按 vals 代进去，看等式成不成立
function vtCheck(p, L, vals) {
  const full = Object.keys(L.vars).every((k) => vals[k] !== undefined && vals[k] !== null && vals[k] !== '');
  if (!full) return { full, valid: false, txt: '', why: '' };
  const R = vtRowsTxt(L, vals), ops = OPR(L).map((k) => R[k]);
  const hasParts = L.rows.some((r) => /^p\d/.test(r.name));
  const lastR = L.op === '÷' && hasParts ? R[`r${L.pcols.length}`] : '';
  const txt = L.op === '÷' ? `${ops[0]}÷${ops[1]}=${R.q}${lastR && lastR !== '0' ? `…${lastR}` : ''}` : `${ops.join(L.op)}=${R.s}`;
  const Rl = vtRules(p, L);
  for (const k of Object.keys(L.vars)) { const why = vtOk(L, Rl, vals, k, +vals[k]); if (why && why !== 'zero') return { full, valid: false, txt, why }; }
  if (Object.entries(R).some(([k, t]) => k !== 'd' && t.length > 1 && t[0] === '0') || (R.d.length > 1 && R.d[0] === '0')) return { full, valid: false, txt, why: 'zero' };
  const v = ops.map(Number);
  let okk;
  if (L.op === '÷') {
    const D = vtDivRows(L, v[0], v[1]);
    okk = !!D && D.Q === R.q && (hasParts ? D.rows.every((t, i) => t === R[`${i % 2 ? 'r' : 'p'}${(i >> 1) + 1}`]) : D.R === 0);
  } else {
    const s = Number(R.s);
    okk = L.op === '+' ? v.reduce((a, b) => a + b, 0) === s : L.op === '-' ? v[0] - v[1] === s : v[0] * v[1] === s;
    if (okk && L.op === '×') for (const r of L.rows) { const m = /^p(\d+)$/.exec(r.name); if (m && Number(R[r.name]) !== v[0] * dig(v[1], +m[1] - 1)) okk = false; }
  }
  return { full, valid: okk, txt, why: okk ? '' : 'eq' };
}
// 加减乘：数位 0～k 的格子都填了时，低 k+1 位对不对（同余）；k 是最高位时要完全相等。返回 null = 还有空没填
function vtCG(L) {
  const rw = {}; for (const r of L.rows) if (r.name[0] !== 'k') rw[r.name] = r.cells.filter((c) => c.row === r.name).map((c) => [c.pos, c.v, c.v === undefined ? +c.ch : 0]);
  const parts = L.rows.filter((r) => /^p\d+$/.test(r.name)).map((r) => [+r.name.slice(1) - 1, rw[r.name]]);
  const top = Math.max(...Object.values(rw).flat().map((c) => c[0]));
  return { ops: OPR(L).map((n) => rw[n]), s: rw.s, parts, b: rw.b, top };
}
// 一条条等式（同余检查用）：e.cells = 用到的格子，e.f(pv, bd, P10, N) = 应该 ≡ 0 的式子
function vtEqs(L) {
  const G = L._cg || (L._cg = vtCG(L)), E = [];
  if (L.op === '+') E.push({ cells: [...G.ops.flat(), ...G.s], f: (pv) => G.ops.map(pv).reduce((a, b) => a + b) - pv(G.s) });
  else if (L.op === '-') E.push({ cells: [...G.ops.flat(), ...G.s], f: (pv) => pv(G.ops[0]) - pv(G.ops[1]) - pv(G.s) });
  else {
    E.push({ cells: [...G.ops.flat(), ...G.s], f: (pv) => pv(G.ops[0]) * pv(G.ops[1]) - pv(G.s) });
    if (G.parts.length) {
      for (const [j, cs] of G.parts) { const bc = G.b.find((c) => c[0] === j); E.push({ cells: [...G.ops[0], ...cs, ...(bc ? [bc] : [])], j, f: (pv, bd, P10, N) => pv(G.ops[0]) * N(bd(bc, j)) * P10(j) - pv(cs) }); }
      E.push({ cells: [...G.parts.flatMap((q) => q[1]), ...G.s], f: (pv) => G.parts.map((q) => pv(q[1])).reduce((a, b) => a + b) - pv(G.s) });
    }
  }
  return E;
}
function vtEqOk(L, vals, e, k, top) {
  const G = L._cg, big = top ? 2 * (G.top + 1) > 15 : 2 * (k + 1) > 15;
  const P10 = big ? (x) => 10n ** BigInt(x) : (x) => 10 ** x, N = big ? BigInt : Number, Z = big ? 0n : 0;
  let miss = false;
  const pv = (cs) => { let x = Z; for (const [pos, v, d0] of cs) { if (pos > k) continue; const d = v === undefined ? d0 : vals[v]; if (d === undefined || d === null || d === '') { miss = true; return Z; } x += N(+d) * P10(pos); } return x; };
  const bd = (bc, j) => { if (!bc || j > k) return 0; if (bc[1] === undefined) return bc[2]; const d = vals[bc[1]]; if (d === undefined || d === null || d === '') { miss = true; return 0; } return +d; };
  const x = e.f(pv, bd, P10, N); if (miss) return null;
  return top ? x == Z : ((x % P10(k + 1)) + P10(k + 1)) % P10(k + 1) == Z;
}
// 低 k+1 位对不对（同余）；k 是最高位时要完全相等。返回 null = 还有空没填
function vtCongr(L, vals, k, top) {
  const E = L._eq || (L._eq = vtEqs(L));
  for (const e of E) { const r = vtEqOk(L, vals, e, k, top); if (r === null) return null; if (!r) return false; }
  return true;
}
// check='col'：从个位往上逐列看，返回 {ok: [数位…], bad: 第一列对不上的数位或 -1}
function vtColStat(p, L, vals) {
  const out = { ok: [], bad: -1 };
  if (!L.puzzle || L.op === '÷' || p.check !== 'col') return out;
  const top = Math.max(...L.rows.filter((r) => r.name[0] !== 'k').flatMap((r) => r.cells.map((c) => c.pos)));
  for (let k = 0; k <= top; k++) { const r = vtCongr(L, vals, k, k === top); if (r === null) break; if (!r) { out.bad = k; break; } out.ok.push(k); }
  return out;
}
// 把「填好的等式」字符串（solution 里的一项）拆成 vals
function vtSolVals(p, L, str) {
  const P = vtParse(str); if (P.err || P.puzzle) return `解「${str}」写得不对`;
  if (P.op !== L.op || P.nums.length !== L.nums.length) return `解「${str}」和 eq 对不上`;
  const vals = {}, toks = [...L.nums, L.res], got = [...P.nums, P.res], names = [...OPR(L), RES(L)];
  const put = (cs, str2) => { const b = [...str2]; if (cs.length !== b.length) return `解「${str}」的位数和 eq 对不上`; for (let k = 0; k < cs.length; k++) { const c = cs[k]; if (c.v === undefined) { if (c.ch !== b[k]) return `解「${str}」改了已知的数字`; continue; } if (vals[c.v] !== undefined && vals[c.v] !== +b[k]) return `解「${str}」里 ${c.v} 前后不一样`; vals[c.v] = +b[k]; } return ''; };
  const rowCells = (name) => (name === 'd' ? L.rows.find((r) => r.name === 'a').cells.filter((c) => c.row === 'd') : L.rows.find((q) => q.name === name).cells.filter((c) => c.row === name));
  for (let t = 0; t < toks.length; t++) { const e = put(rowCells(names[t]), got[t]); if (e) return e; }
  const A = Number(P.nums[0]), B = Number(P.nums[1] || 0);
  if (L.op === '÷') {
    if (L.rows.some((r) => /^p\d/.test(r.name))) {
      const D = vtDivRows(L, A, B); if (!D) return `解「${str}」的商和竖式的样子对不上`;
      for (let i = 0; i < D.rows.length; i++) { const e = put(rowCells(`${i % 2 ? 'r' : 'p'}${(i >> 1) + 1}`), D.rows[i]); if (e) return e.replace('位数和 eq', '乘积 / 余数的位数和 parts'); }
    }
  } else for (const r of L.rows) { const m = /^p(\d+)$/.exec(r.name); if (!m) continue; const e = put(r.cells, String(A * dig(B, +m[1] - 1))); if (e) return e.replace('位数和 eq', '部分积位数'); }
  for (const [k, d] of Object.entries(L.given)) if (vals[k] !== d) return `解「${str}」里 ${k} 不是给好的 ${d}`;
  return vals;
}
// 竖式谜一共几组解（按位剪枝；试的次数超过 cap 或超过 ms 毫秒时返回 null）
function vtSolve(p, L, cap = 2e6, ms = 4000) {
  const Rl = vtRules(p, L), out = [], vals = { ...L.given }, t0 = Date.now();
  let nodes = 0, over = false;
  const tick = () => { if (++nodes > cap || ((nodes & 4095) === 0 && Date.now() - t0 > ms)) over = true; return over; };
  const tryV = (k, d) => { if (vals[k] !== undefined) return vals[k] === d ? 0 : -1; if (vtOk(L, Rl, vals, k, d)) return -1; vals[k] = d; return 1; };
  const dom = (k) => (Rl.DG || [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const done = () => { const r = vtCheck(p, L, vals); if (r.valid) out.push(r.txt); };
  if (L.op !== '÷') {
    // 加减乘：变量按出现的最低数位排；每条等式在数位 0～k 用到的空都定了，就检查它的低 k+1 位
    const mp = {}; for (const [k, ids] of Object.entries(L.vars)) mp[k] = Math.min(...ids.map((id) => L.cells[id].pos));
    const ks = Object.keys(L.vars).filter((k) => vals[k] === undefined).sort((a, b) => mp[a] - mp[b]);
    const E = L._eq || (L._eq = vtEqs(L)), top = L._cg.top, by = {}, free = [];
    for (const e of E) for (let k = 0; k <= top; k++) {
      const need = [...new Set(e.cells.filter((c) => c[0] <= k && c[1] !== undefined && (e.j === undefined || c !== e.cells[e.cells.length - 1] || e.j <= k)).map((c) => c[1]))].filter((v) => vals[v] === undefined);
      const t = { e, k, need };
      if (!need.length) free.push(t); else { const last = need.reduce((a, b) => (ks.indexOf(a) > ks.indexOf(b) ? a : b)); (by[last] = by[last] || []).push(t); }
    }
    const okAll = (ts) => ts.every((t) => vtEqOk(L, vals, t.e, t.k, t.k === top) !== false);
    const go = (i) => {
      if (over || tick()) return;
      if (i === ks.length) { done(); return; }
      const k = ks[i];
      for (const d of dom(k)) { if (tryV(k, d) !== 1) continue; if (okAll(by[k] || [])) go(i + 1); delete vals[k]; if (over) return; }
    };
    if (okAll(free)) go(0);
  } else {
    // 除法：先定除数，再从被除数的最高位往下一位一位做长除法，乘积和落下的数随时对照
    const ar = L.rows.find((r) => r.name === 'a'), Ac = ar.cells.filter((c) => c.row === 'a'), Dc = ar.cells.filter((c) => c.row === 'd'), qc = L.rows[0].cells;
    const hasParts = L.rows.some((r) => /^p\d/.test(r.name)), m = qc.length, off = L.W - m, K = L.pcols.length;
    const cellsOf = (name) => L.rows.find((r) => r.name === name).cells;
    const bindCells = (cs, str, undo) => { if (cs.length !== str.length) return false; for (let i = 0; i < cs.length; i++) { const c = cs[i], d = +str[i]; if (c.v === undefined) { if (+c.ch !== d) return false; continue; } const r = tryV(c.v, d); if (r < 0) return false; if (r) undo.push(c.v); } return true; };
    const unb = (u) => { for (const k of u) delete vals[k]; };
    const walk = (j, cur, k, B) => {
      if (over || tick()) return;
      if (j === Ac.length) { if (!hasParts && cur !== 0) return; const u = []; if (!hasParts || bindCells(cellsOf(`r${K}`), String(cur), u)) done(); unb(u); return; }
      const c = Ac[j], col = c.col, opts = c.v === undefined ? [+c.ch] : vals[c.v] !== undefined ? [vals[c.v]] : dom(c.v);
      for (const d of opts) {
        const u = []; if (c.v !== undefined) { const r = tryV(c.v, d); if (r < 0) continue; if (r) u.push(c.v); }
        let cu = cur * 10 + d, kk = k, okk = true;
        if (col < off) okk = cu < B;
        else {
          if (hasParts && kk > 0 && L.pcols[kk] === col) okk = bindCells(cellsOf(`r${kk}`), String(cu), u);
          const qd = Math.floor(cu / B);
          if (okk) okk = qd < 10 && (col !== off || qd > 0) && (qd > 0) === L.pcols.includes(col) && bindCells([qc[col - off]], String(qd), u);
          if (okk && qd > 0) { if (hasParts) okk = bindCells(cellsOf(`p${kk + 1}`), String(qd * B), u); cu -= qd * B; kk++; }
        }
        if (okk) walk(j + 1, cu, kk, B);
        unb(u); if (over) return;
      }
    };
    const pickB = (i, B) => {
      if (over) return;
      if (i === Dc.length) { if (B > 0) walk(0, 0, 0, B); return; }
      const c = Dc[i], opts = c.v === undefined ? [+c.ch] : vals[c.v] !== undefined ? [vals[c.v]] : dom(c.v);
      for (const d of opts) { const u = []; if (c.v !== undefined) { const r = tryV(c.v, d); if (r < 0) continue; if (r) u.push(c.v); } pickB(i + 1, B * 10 + d); unb(u); if (over) return; }
    };
    if (K === 0 || L.pcols[0] === off) pickB(0, 0);
  }
  return over ? null : [...new Set(out)];
}
const vtMode = (p, L) => (L.puzzle ? 'puzzle' : p.steps ? 'steps' : 'fill');
function vtInit(p, L) { return { vals: { ...(L && L.given) }, step: 0 }; }
function vtApply(p, L, st, a) {
  const S = { vals: { ...st.vals }, step: st.step };
  if (a === 'next') { if (S.step >= L.steps.length) return '已经是最后一步'; S.step++; return S; }
  if (a === 'prev') { if (S.step <= 0) return '已经是第一步'; S.step--; return S; }
  if (a === 'clear') { S.vals = { ...L.given }; return S; }
  const m = /^set:(.+)=(\d?)$/.exec(a); if (!m) return `不认识的操作 ${a}`;
  const [, k, d] = m;
  if (L.puzzle ? !L.vars[k] : !L.blanks.includes(k)) return `${k} 不是要填的格子`;
  if (L.puzzle && L.given[k] !== undefined) return `${k} 是题里给好的`;
  if (L.puzzle && d !== '' && Array.isArray(p.digits) && p.digits.length && !p.digits.map(Number).includes(+d)) return `只能填 ${p.digits.join('、')}`;
  if (d === '') delete S.vals[k]; else S.vals[k] = +d;
  return S;
}
function vtEnv(p, L, st, seen = []) {
  const nb = L.blanks.length, filled = L.blanks.filter((id) => st.vals[id] !== undefined).length, nright = L.blanks.filter((id) => String(st.vals[id]) === L.cells[id].ch).length;
  const ck = L.puzzle ? vtCheck(p, L, st.vals) : { full: filled === nb, valid: nb > 0 && nright === nb, txt: '' };
  return { filled, nblank: nb, nright, nwrong: filled - nright, done: nb > 0 && nright === nb, step: st.step, nsteps: L.steps.length, vals: { ...st.vals },
    boxes: L.boxOrder.map((k) => (st.vals[k] === undefined ? null : st.vals[k])), full: ck.full, valid: ck.valid, txt: ck.txt, why: ck.why, badcol: vtColStat(p, L, st.vals).bad, nfound: seen.length, seen };
}
function vtGoal(p, L, v, F) { if (F) return !!run(F, v, false); const md = vtMode(p, L); return md === 'steps' ? v.step >= v.nsteps : md === 'fill' ? v.done : v.nfound >= (p.need || 1); }
// 按 solution 走一遍（检查、drive 共用）：返回 [最后状态, seen, 出错]
function vtRun(p, L) {
  const md = vtMode(p, L), seen = [], acts = [];
  if (md === 'steps') for (let i = 0; i < L.steps.length; i++) acts.push(['next']);
  else if (md === 'fill') acts.push(L.blanks.map((id) => `set:${id}=${L.cells[id].ch}`));
  else for (const s of p.solution || []) { const vals = vtSolVals(p, L, s); if (typeof vals === 'string') return [null, seen, vals]; acts.push(['clear', ...Object.entries(vals).filter(([k]) => L.given[k] === undefined).map(([k, d]) => `set:${k}=${d}`)]); }
  let st = vtInit(p, L);
  for (const grp of acts) { for (const a of grp) { const r = vtApply(p, L, st, a); if (typeof r === 'string') return [st, seen, `${a}：${r}`]; st = r; } if (L.puzzle) { const c = vtCheck(p, L, st.vals); if (c.valid && !seen.includes(c.txt)) seen.push(c.txt); } }
  return [st, seen, null];
}
// 符号字母画成图形（○ △ ▢ ☆ 等大小统一）
const VT_SHP = { '○': 'c', '●': 'cf', '△': 't', '▲': 'tf', '▽': 'v', '▼': 'vf', '▢': 's', '■': 'sf', '◇': 'd', '◆': 'df', '☆': 'x', '★': 'xf' };
function vtShape(ch, x, cy, cls) {
  const k = VT_SHP[ch]; if (!k) return '';
  const f = k.endsWith('f') ? ' f' : '', t = k[0], R = 10;
  const star = () => { let d = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.45 : R + 1, a = -Math.PI / 2 + i * Math.PI / 5; d += `${i ? 'L' : 'M'}${r1(x + r * Math.cos(a))},${r1(cy + 1 + r * Math.sin(a))}`; } return d + 'Z'; };
  const body = t === 'c' ? `<circle cx="${x}" cy="${cy}" r="${R - 0.5}"/>` : t === 's' ? `<rect x="${x - R + 1}" y="${cy - R + 1}" width="${2 * R - 2}" height="${2 * R - 2}" rx="2.5"/>`
    : t === 'd' ? `<path d="M${x},${cy - R - 1}L${x + R},${cy}L${x},${cy + R + 1}L${x - R},${cy}Z"/>` : t === 'x' ? `<path d="${star()}"/>`
    : t === 't' ? `<path d="M${x},${cy - R}L${x + R + 1},${cy + R - 2}L${x - R - 1},${cy + R - 2}Z"/>` : `<path d="M${x},${cy + R}L${x + R + 1},${cy - R + 2}L${x - R - 1},${cy - R + 2}Z"/>`;
  return `<g class="vt-shp${f} ${cls || ''}">${body}</g>`;
}
const DEL_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8.5 5.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-10L3 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M11.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
function vertical(box, p, api) {
  const L = vtLayout(p);
  if (L.err) { box.innerHTML = `<div class="sl-info">${esc(L.err)}</div>`; return; }
  const md = vtMode(p, L);
  const F = { info: fnc(p.info, VT_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, VT_KEYS) : null, tip: fnc(p.tip, VT_KEYS), found: fnc(p.found, VT_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const seen = []; let st = vtInit(p, L), sel = null, lastTip = '';
  const tags = md === 'puzzle' && p.tags !== false && L.letters.some((k) => k !== '□'), colck = md === 'puzzle' && p.check === 'col' && L.op !== '÷';
  const DG = Array.isArray(p.digits) && p.digits.length ? p.digits.map(Number) : null;
  const CW = tags ? 34 : 30, PADL = 8, DX = L.op === '÷' ? 16 : 0, X = (c) => PADL + c * CW + (c >= L.c0 && L.op === '÷' ? DX : 0) + CW / 2;
  // 竖向位置
  let y = 6; const RY = {}, LY = {};
  if (L.op === '÷') y += 4;
  for (const r of L.rows) {
    RY[r.name] = y; y += r.small ? 15 : 36;
    if (r.name === 'q') { LY.q = y + 2; y += 6; }
    if (r.line) { LY[r.name] = y + 3; y += 8; }
  }
  const markY = y + 4; if (colck) y += 18;
  const VW = PADL * 2 + L.W * CW + DX, VH = y + 6;
  const nextLbl = p.step_label || (L.op === '÷' ? '往下算' : '下一位');
  box.innerHTML = `<div class="vt" tabindex="-1">${SVG(VW, VH, '<g class="vt-g"></g>', 'vtsvg')}</div><div class="sl-info vt-info"></div>` +
    (md === 'puzzle' && (p.need > 1 || p.found_show) && p.found_show !== false ? '<div class="hk-found sl-found vt-found"></div>' : '') +
    (md === 'steps' ? bar(btn('vt-prev', '退一步') + btn('vt-next', esc(nextLbl)) + btn('vt-reset', '重来')) : '') +
    (md !== 'steps' ? `<div class="vt-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<button class="vt-k" data-k="${d}"${DG && !DG.includes(d) ? ' disabled' : ''}>${d}</button>`).join('')}<button class="vt-k vt-del" data-k="" aria-label="删除" title="删除">${DEL_ICON}</button></div>` + bar(btn(md === 'puzzle' ? 'vt-clear' : 'vt-reset', md === 'puzzle' ? '清空' : '重来')) : '');
  Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw || Math.round(VW * 1.35)}px`, marginInline: 'auto' });
  const shownIds = () => { const s = new Set(); if (md !== 'steps') return null; L.steps.slice(0, st.step).forEach((q) => q.ids.forEach((id) => s.add(id))); return s; };
  const fmt = (t) => t.replace(/([+\-×÷=])/g, ' $1 ').replace(/…/g, ' …… ');
  const WHY = { dup: L.letters.length && p.distinct !== 'all' && p.distinct !== 'box' ? '不同的字填了同一个数字' : '有两个空填了同一个数字', dupg: '字母填了题里已经写出的数字', zero: '最高位不能是 0', digit: `只能填 ${(DG || []).join('、')}`, eq: '等式不成立' };
  const draw = () => {
    let v = vtEnv(p, L, st, seen);
    if (md === 'puzzle' && v.valid && !F.found && !seen.includes(v.txt)) { seen.push(v.txt); v = vtEnv(p, L, st, seen); }
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = vtEnv(p, L, st, seen); } }
    const shown = shownIds(), fresh = new Set(md === 'steps' && st.step ? L.steps[st.step - 1].ids : []);
    const cs = colck ? vtColStat(p, L, st.vals) : null;
    let s = '';
    if (cs) {
      const top0 = RY[L.rows[0].name], bot = markY - 4;
      if (cs.bad >= 0) { const x = X(L.W - 1 - cs.bad); s += `<rect x="${x - CW / 2 + 1}" y="${top0}" width="${CW - 2}" height="${bot - top0}" rx="6" class="vt-colbad"/><text x="${x}" y="${markY + 12}" text-anchor="middle" font-size="14" class="st vt-mkbad">✗</text>`; }
      for (const k of cs.ok) s += `<text x="${X(L.W - 1 - k)}" y="${markY + 12}" text-anchor="middle" font-size="14" class="st vt-mkok">✓</text>`;
    }
    if (L.op === '÷') {
      const x0 = X(L.c0) - CW / 2 - 6, top = LY.q, bot = RY.a + 34;
      s += `<path d="M${r1(x0 - 3)},${r1(bot)} Q${r1(x0 + 7)},${r1((top + bot) / 2)} ${r1(x0)},${r1(top)} L${r1(X(L.W - 1) + CW / 2 + 2)},${r1(top)}" class="vt-ln"/>`;
    }
    const tagTxt = [];
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
          const val = st.vals[c.v], isBox = c.ch === '□', gv = L.given[c.v] !== undefined;
          const cls = `vt-c vt-var${gv ? ' vt-given' : ''}${sel === c.v ? ' sel' : ''}${val !== undefined && !gv ? ' set' : ''}${v.full && !gv ? (v.valid ? ' ok' : ' bad') : ''}`;
          s += `<g class="${cls}"${gv ? '' : ` data-v="${esc(c.v)}"`}><rect x="${x - 13}" y="${yy + 2}" width="26" height="32" rx="5" class="vt-box${isBox ? ' sq' : ''}"/>` +
            (val !== undefined ? `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-in">${val}</text>`
              : isBox ? '' : VT_SHP[c.ch] ? vtShape(c.ch, x, yy + 18, 'vt-let') : `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="22" class="st vt-let">${esc(c.ch)}</text>`) + '</g>';
          if (val !== undefined && !isBox && tags) tagTxt.push(`<text x="${x + 12}" y="${yy + 6}" font-size="11.5" class="st vt-vl">${esc(c.ch)}</text>`);
        } else s += `<text x="${x}" y="${yy + 26}" text-anchor="middle" font-size="24" class="st vt-dg">${esc(c.ch)}</text>`;
      }
    }
    box.querySelector('.vt-g').innerHTML = s + tagTxt.join('');
    const el = box.querySelector('.vt-info');
    if (F.info) el.innerHTML = run(F.info, v, '');
    else if (md === 'steps') el.innerHTML = st.step ? esc(L.steps[st.step - 1].text) : '';
    else if (md === 'puzzle' && v.full) el.innerHTML = v.valid ? `<b class="jade">${esc(fmt(v.txt))}　成立</b>` : `<b class="plum">${WHY[v.why] || WHY.eq}</b>`;
    else if (cs && cs.bad >= 0) el.innerHTML = `<b class="plum">${PL[cs.bad] || '这一位'}对不上</b>`;
    else el.innerHTML = '';
    tex(el);
    const fd = box.querySelector('.vt-found'); if (fd) fd.innerHTML = foundBox(p, seen.map(fmt));
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
    if (e.target.closest('.vt-reset')) { st = vtInit(p, L); sel = null; draw(); return; }
    if (e.target.closest('.vt-clear')) { act('clear'); sel = null; draw(); return; }
    if (e.target.closest('.vt-next')) { act('next'); draw(); return; }
    if (e.target.closest('.vt-prev')) { act('prev'); draw(); return; }
    const k = e.target.closest('.vt-k'); if (k) { key(k.dataset.k); return; }
    const c = e.target.closest('.vt-c[data-id], .vt-c[data-v]'); if (c) { sel = c.dataset.id || c.dataset.v; draw(); box.querySelector('.vt').focus({ preventScroll: true }); }
  });
  box.querySelector('.vt').addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); key(e.key); } else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); key(''); }
  });
  draw();
}

export const SIMS_R7 = { calendar, match, vertical };
export const R7_CORE = { CAL_KEYS, calModel, calVM, calInit, calApply, calEnv, calRun, calGoal, calHid, MC_KEYS, mcModel, mcApply, mcEnv, mcRun, mcNames, mcFound, VT_KEYS, vtParse, vtLayout, vtRules, vtGiveOk, vtCheck, vtColStat, vtSolVals, vtSolve, vtMode, vtInit, vtApply, vtEnv, vtGoal, vtRun };
