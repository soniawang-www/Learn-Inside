// 坐标平面 plane、随机模拟 trials、立体图 solid（接口同 sims.js：(box, p, api)）
// 表达式写法同 slider：只来自后台导入的课程内容。HS_CORE 里是不碰页面的部分，生成检查脚本也用它。

import { compile, H } from './sims24.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text, extra = '') => `<button class="lp-ghost ${cls}" ${extra}>${text}</button>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
const tex = (el) => { if (el && /\$/.test(el.textContent) && typeof window !== 'undefined' && window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
const fnc = (expr, keys) => (expr ? compile(expr, keys) : null);
const run = (f, v, d) => { if (!f) return d; try { return f(v, H); } catch (e) { return d; } };
const r2 = (x) => Math.round(x * 100) / 100;
const r6 = (x) => +(+x).toFixed(6);
const snapTo = (x, s) => (s ? r6(Math.round(x / s) * s) : x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let uid = 0;

// 滑块变量（plane / solid 共用）：[{k, min, max, step, init, label, unit}]
const varsHtml = (vars, v) => (vars || []).map((x) => bar(`<span>${esc(x.label || x.k)} = <b class="sl-v" data-k="${x.k}"></b>${x.unit ? ` ${esc(x.unit)}` : ''}</span><input type="range" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${v[x.k]}" data-k="${x.k}" aria-label="${esc(x.label || x.k)}">`)).join('');
const varsInit = (vars) => Object.fromEntries((vars || []).map((x) => [x.k, x.init ?? x.min]));

// ───────── 坐标平面 ─────────
// { xr: [-5, 5], yr: [-5, 5], vw: 360, vh: 300, equal: true（横纵同比例）, step: 1（网格）, tick（刻度数字间隔，默认自动）, grid: true, axes: true,
//   pts: [{k: 'A', x, y, label（默认 k，'' 不写）, snap（默认 p.snap ?? 1）, fixed, color: 'plum'|'jade'|'ink',
//          on: 'x'（只能横着拖）| 'y'（只能竖着拖）, f: 'y 关于 x 的表达式（可用滑块变量）'（点在曲线上）, c: [cx, cy, r]（点在圆上，deg: 角度吸附）, xr / yr: 拖动范围}],
//   vars: 滑块变量（同 slider）, bg: '画在网格上、点下面（SVG 表达式）', fg: '画在点上面', info, goal, tip, solution: {A: [x, y], a: 值} }
// 表达式里：点名（{x, y}）、滑块变量，以及 sx(x) sy(y)（换成画布坐标）、seg(A, B, 类) line(A, B, 类)（整条直线）、ray(A, B, 类)、poly([A, B, C], 类)、
//   circ(C, r, 类)、plot(x => …, 类, a, b)（函数图像，自动断开、裁到画布里）、dot(A, 类)、lab(A, 文字, dx, dy, 类)、
//   dist(A, B)、slope(A, B)、mid(A, B)、area([A, B, C])、ang(A, O, B)（度）。点可以写 {x, y} 也可以写 [x, y]。
//   类：ln（实线）、dash（虚线）、sh / sh2（填色）、c1 / c2（紫 / 绿粗线）、dot1 / dot2。
const PL_HELP = ['sx', 'sy', 'seg', 'line', 'ray', 'poly', 'circ', 'plot', 'dot', 'lab', 'dist', 'slope', 'mid', 'area', 'ang'];
function planeFrame(p) {
  const vw = p.vw || 360, vh = p.vh || 300, pad = p.pad ?? 16;
  const [x0, x1] = p.xr || [-5, 5], [y0, y1] = p.yr || [-5, 5];
  const kx = (vw - 2 * pad) / (x1 - x0), ky = (vh - 2 * pad) / (y1 - y0);
  const ux = p.equal === false ? kx : Math.min(kx, ky), uy = p.equal === false ? ky : Math.min(kx, ky);
  const ox = vw / 2 - ((x0 + x1) / 2) * ux, oy = vh / 2 + ((y0 + y1) / 2) * uy;
  const fr = { vw, vh, ux, uy, ox, oy, sx: (x) => r2(ox + x * ux), sy: (y) => r2(oy - y * uy), mx: (px) => (px - ox) / ux, my: (py) => (oy - py) / uy };
  fr.X0 = fr.mx(0); fr.X1 = fr.mx(vw); fr.Y0 = fr.my(vh); fr.Y1 = fr.my(0);
  return fr;
}
const Q = (a) => (Array.isArray(a) ? { x: +a[0], y: +a[1] } : a);
function planeHelpers(fr) {
  const { sx, sy } = fr;
  const C = (c, d) => `pl-${(c || d).split(' ').join(' pl-')}`;
  const seg = (A, B, c) => { A = Q(A); B = Q(B); return `<line x1="${sx(A.x)}" y1="${sy(A.y)}" x2="${sx(B.x)}" y2="${sy(B.y)}" class="${C(c, 'ln')}"/>`; };
  // 直线 / 射线裁到画布：参数 t 的范围和四条边求交
  const clip = (A, B, t0) => {
    A = Q(A); B = Q(B);
    const dx = B.x - A.x, dy = B.y - A.y;
    let lo = t0, hi = Infinity;
    const lim = [[dx, fr.X0 - A.x, fr.X1 - A.x], [dy, fr.Y0 - A.y, fr.Y1 - A.y]];
    for (const [d, a, b] of lim) {
      if (Math.abs(d) < 1e-12) { if (a > 0 || b < 0) return null; continue; }
      const ta = a / d, tb = b / d;
      lo = Math.max(lo, Math.min(ta, tb)); hi = Math.min(hi, Math.max(ta, tb));
    }
    if (!(lo < hi) || !isFinite(lo) || !isFinite(hi)) return null;
    return [{ x: A.x + lo * dx, y: A.y + lo * dy }, { x: A.x + hi * dx, y: A.y + hi * dy }];
  };
  const line = (A, B, c) => { const s = clip(A, B, -Infinity); return s ? seg(s[0], s[1], c) : ''; };
  const ray = (A, B, c) => { const s = clip(A, B, 0); return s ? seg(s[0], s[1], c) : ''; };
  const poly = (L, c) => `<polygon points="${L.map(Q).map((q) => `${sx(q.x)},${sy(q.y)}`).join(' ')}" class="${C(c, 'sh')}"/>`;
  const circ = (O, r, c) => { O = Q(O); return `<ellipse cx="${sx(O.x)}" cy="${sy(O.y)}" rx="${r2(Math.abs(r) * fr.ux)}" ry="${r2(Math.abs(r) * fr.uy)}" class="${C(c, 'ln')}"/>`; };
  const plot = (f, c, a, b, n) => {
    a = a ?? fr.X0; b = b ?? fr.X1; n = n || 300;
    const span = fr.Y1 - fr.Y0, parts = []; let cur = [], prev = null;
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n; let y; try { y = f(x); } catch (e) { y = NaN; }
      const okv = Number.isFinite(y) && Math.abs(y - (fr.Y0 + fr.Y1) / 2) < span * 4;
      if (!okv || (prev !== null && Math.abs(y - prev) > span * 1.5)) { if (cur.length > 1) parts.push(cur); cur = []; }
      if (okv) cur.push(`${sx(x)},${sy(y)}`);
      prev = okv ? y : null;
    }
    if (cur.length > 1) parts.push(cur);
    return parts.map((L) => `<polyline points="${L.join(' ')}" class="${C(c, 'c1')}"/>`).join('');
  };
  const dot = (A, c) => { A = Q(A); return `<circle cx="${sx(A.x)}" cy="${sy(A.y)}" r="4" class="${C(c, 'dot1')}"/>`; };
  const lab = (A, s, dx = 8, dy = -8, c) => { A = Q(A); return `<text x="${r2(sx(A.x) + dx)}" y="${r2(sy(A.y) + dy)}" font-size="14" text-anchor="middle" class="st lbl${c ? ' ' + c : ''}">${esc(s)}</text>`; };
  const dist = (A, B) => { A = Q(A); B = Q(B); return Math.hypot(B.x - A.x, B.y - A.y); };
  const slope = (A, B) => { A = Q(A); B = Q(B); return (B.y - A.y) / (B.x - A.x); };
  const mid = (A, B) => { A = Q(A); B = Q(B); return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; };
  const area = (L) => { L = L.map(Q); let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
  const ang = (A, O, B) => { A = Q(A); O = Q(O); B = Q(B); const u = Math.atan2(A.y - O.y, A.x - O.x), w = Math.atan2(B.y - O.y, B.x - O.x); let d = Math.abs(u - w) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
  return { sx, sy, seg, line, ray, poly, circ, plot, dot, lab, dist, slope, mid, area, ang };
}
// 按约束把 (x, y) 放到点上
function planePlace(pt, x, y, v, fr, p, fcache) {
  const s = pt.snap ?? p.snap ?? 1;
  const xr = pt.xr || [fr.X0, fr.X1], yr = pt.yr || [fr.Y0, fr.Y1];
  if (pt.c) {
    const [cx, cy, r] = pt.c; let a = Math.atan2(y - cy, x - cx);
    if (pt.deg) a = (Math.round((a * 180) / Math.PI / pt.deg) * pt.deg * Math.PI) / 180;
    return { x: r6(cx + r * Math.cos(a)), y: r6(cy + r * Math.sin(a)) };
  }
  if (pt.f) { const nx = clamp(snapTo(x, s), xr[0], xr[1]); return { x: nx, y: planeFy(pt, nx, v, fcache) }; }
  if (pt.on === 'x') return { x: clamp(snapTo(x, s), xr[0], xr[1]), y: pt.y };
  if (pt.on === 'y') return { x: pt.x, y: clamp(snapTo(y, s), yr[0], yr[1]) };
  return { x: clamp(snapTo(x, s), xr[0], xr[1]), y: clamp(snapTo(y, s), yr[0], yr[1]) };
}
function planeFy(pt, x, v, fcache) {
  const f = fcache[pt.k] || (fcache[pt.k] = compile(pt.f, ['x', ...Object.keys(v)]));
  return r6(f({ x, ...v }, H));
}
function planeEnv(p, P, v, fr) { return { ...v, ...P, ...planeHelpers(fr) }; }
function planeKeys(p) { return [...(p.vars || []).map((x) => x.k), ...(p.pts || []).map((x) => x.k), ...PL_HELP]; }
// 初始状态 / 按 solution 摆好的状态（检查脚本用）
function planeState(p, sol) {
  const fr = planeFrame(p), v = varsInit(p.vars), fc = {};
  if (sol) for (const x of p.vars || []) if (sol[x.k] !== undefined) v[x.k] = sol[x.k];
  const P = {};
  for (const pt of p.pts || []) {
    const s = sol && sol[pt.k];
    P[pt.k] = s ? planePlace(pt, s[0], s[1], v, fr, p, fc) : pt.f ? { x: pt.x, y: planeFy(pt, pt.x, v, fc) } : { x: pt.x, y: pt.y };
  }
  return { fr, env: planeEnv(p, P, v, fr), P, v };
}
function plane(box, p, api) {
  const fr = planeFrame(p), { vw, vh, sx, sy } = fr, keys = planeKeys(p);
  const F = { bg: fnc(p.bg, keys), fg: fnc(p.fg, keys), info: fnc(p.info, keys), goal: fnc(p.goal, keys), tip: fnc(p.tip, keys) };
  const st = planeState(p, null), P = st.P, v = st.v, fc = {};
  const pts = p.pts || [], cid = `plc${++uid}`;
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  box.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" class="lp-sim slsvg plsvg" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${cid}"><rect x="0" y="0" width="${vw}" height="${vh}"/></clipPath></defs><g class="pl-g"></g></svg><div class="sl-info"></div>${varsHtml(p.vars, v)}`;
  const svg = box.querySelector('svg');
  // 网格和坐标轴（不变，只画一次）
  const step = p.step || 1, tick = p.tick || step * Math.max(1, Math.ceil(24 / (step * fr.ux)));
  let base = '';
  if (p.grid !== false) {
    for (let x = Math.ceil(fr.X0 / step) * step; x <= fr.X1; x = r6(x + step)) base += `<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${vh}" class="pl-gr"/>`;
    for (let y = Math.ceil(fr.Y0 / step) * step; y <= fr.Y1; y = r6(y + step)) base += `<line x1="0" y1="${sy(y)}" x2="${vw}" y2="${sy(y)}" class="pl-gr"/>`;
  }
  if (p.axes !== false) {
    const ax = clamp(sx(0), 0, vw), ay = clamp(sy(0), 0, vh);
    base += `<line x1="0" y1="${ay}" x2="${vw}" y2="${ay}" class="pl-ax"/><line x1="${ax}" y1="0" x2="${ax}" y2="${vh}" class="pl-ax"/>`;
    base += `<path d="M${vw - 8} ${ay - 4}L${vw} ${ay}L${vw - 8} ${ay + 4}M${ax - 4} 8L${ax} 0L${ax + 4} 8" class="pl-ax"/>`;
    base += `<text x="${vw - 6}" y="${ay - 8}" font-size="13" text-anchor="end" class="st lbl" font-style="italic">x</text><text x="${ax + 8}" y="13" font-size="13" class="st lbl" font-style="italic">y</text>`;
    if (p.ticks !== false) {
      for (let x = Math.ceil(fr.X0 / tick) * tick; x <= fr.X1 - tick * 0.5; x = r6(x + tick)) if (Math.abs(x) > 1e-9 && sx(x) > 8) base += `<text x="${sx(x)}" y="${clamp(ay + 14, 12, vh - 3)}" font-size="11" text-anchor="middle" class="st lbl pl-tk">${H.fmt(x)}</text>`;
      for (let y = Math.ceil(fr.Y0 / tick) * tick; y <= fr.Y1 - tick * 0.5; y = r6(y + tick)) if (Math.abs(y) > 1e-9 && sy(y) < vh - 6) base += `<text x="${clamp(ax - 5, 14, vw)}" y="${sy(y) + 4}" font-size="11" text-anchor="end" class="st lbl pl-tk">${H.fmt(y)}</text>`;
      base += `<text x="${clamp(ax - 5, 14, vw)}" y="${clamp(ay + 14, 12, vh - 3)}" font-size="11" text-anchor="end" class="st lbl pl-tk">0</text>`;
    }
  }
  const draw = () => {
    for (const pt of pts) if (pt.f) P[pt.k] = { x: P[pt.k].x, y: planeFy(pt, P[pt.k].x, v, fc) };
    const env = planeEnv(p, P, v, fr);
    let g = `<g clip-path="url(#${cid})">${base}${run(F.bg, env, '') || ''}</g>`;
    g += `<g clip-path="url(#${cid})" style="pointer-events:none">${run(F.fg, env, '') || ''}</g>`;
    for (const pt of pts) {
      const q = P[pt.k], x = sx(q.x), y = sy(q.y), c = pt.color || (pt.fixed ? 'ink' : 'plum');
      const label = pt.label ?? pt.k;
      g += `<g class="pl-h${pt.fixed ? ' fixed' : ''}" data-k="${esc(pt.k)}"${pt.fixed ? '' : ` tabindex="0" role="slider" aria-label="${esc(label || pt.k)}"`}>${pt.fixed ? '' : `<circle cx="${x}" cy="${y}" r="18" class="pl-hit"/><circle cx="${x}" cy="${y}" r="10" class="pl-ring pl-${c}"/>`}<circle cx="${x}" cy="${y}" r="5" class="pl-pt pl-${c}"/>${label ? `<text x="${r2(x + (pt.dx ?? 10))}" y="${r2(y + (pt.dy ?? -10))}" font-size="15" text-anchor="middle" class="st lbl pl-nm">${esc(label)}</text>` : ''}</g>`;
    }
    box.querySelector('.pl-g').innerHTML = g;
    box.querySelectorAll('.sl-v').forEach((e) => { e.textContent = H.fmt(v[e.dataset.k]); });
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, env, ''); tex(el); }
    if (F.tip) { const t = run(F.tip, env, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, env, false)) ok();
  };
  let drag = null;
  const at = (e) => { const m = svg.getScreenCTM(); if (!m) return null; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [fr.mx(q.x), fr.my(q.y)]; };
  const move = (e) => { const xy = at(e); if (!xy) return; const n = planePlace(drag, xy[0], xy[1], v, fr, p, fc); const o = P[drag.k]; if (n.x !== o.x || n.y !== o.y) { P[drag.k] = n; draw(); } };
  svg.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.pl-h'); if (!h) return;
    const pt = pts.find((x) => x.k === h.dataset.k); if (!pt || pt.fixed) return;
    drag = pt; svg.setPointerCapture?.(e.pointerId); e.preventDefault(); move(e);
  });
  svg.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    const h = e.target.closest('.pl-h'); if (!h) return;
    const pt = pts.find((x) => x.k === h.dataset.k); if (!pt || pt.fixed) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!d) return;
    e.preventDefault();
    const s = pt.snap ?? p.snap ?? 1, o = P[pt.k];
    if (pt.c) { const [cx, cy, r] = pt.c, a = Math.atan2(o.y - cy, o.x - cx) + ((d[0] || d[1]) * (pt.deg || 5) * Math.PI) / 180; P[pt.k] = planePlace(pt, cx + r * Math.cos(a), cy + r * Math.sin(a), v, fr, p, fc); }
    else P[pt.k] = planePlace(pt, o.x + d[0] * (s || 0.1), o.y + d[1] * (s || 0.1), v, fr, p, fc);
    draw(); svg.querySelector(`.pl-h[data-k="${CSS.escape(pt.k)}"]`)?.focus();
  });
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { v[r.dataset.k] = +r.value; draw(); }));
  draw();
}

// ───────── 随机模拟 ─────────
// { trial: '一次试验，返回结果（表达式；要写多句就写函数体并 return）', hit: '由结果 r 判断事件是否发生'（给了就统计频率，不给就统计 r 的平均值）,
//   exact: 理论值（画虚线对照；会露出答案时别给，或用 reveal: 做满多少次才画）, exact_label: '理论值的说法，可以有 $公式$',
//   last: '最近一次结果的说明（HTML 表达式，变量 r）', show: '最近一次结果的图（SVG 表达式，变量 r）', vw, vh,
//   hist: true（按结果分组画柱状图）, yr: [下, 上]（平均值模式的纵轴）, runs: [1, 100, 1000, 10000], need: 做满几次算完成（默认 1000）,
//   info / goal / tip: 表达式（变量 n 次数、h 命中次数、f 频率、mean 平均、r 最近一次、counts 各结果次数）, seed }
// trial 里可用：rnd()（0～1）、rint(a, b)（含两端的整数）、pick(数组)、shuffle(数组)、coin()（0 / 1）、die(面数=6)、range(n)，以及 slider 里的函数。
const RNG_KEYS = ['rnd', 'rint', 'pick', 'shuffle', 'coin', 'die', 'range'];
function rng(seed) {
  let a = (seed >>> 0) || 1;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rint = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const shuffle = (L) => { L = L.slice(); for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } return L; };
  return { rnd, rint, pick: (L) => L[Math.floor(rnd() * L.length)], shuffle, coin: () => (rnd() < 0.5 ? 1 : 0), die: (n = 6) => rint(1, n), range: (n) => Array.from({ length: n }, (_, i) => i) };
}
function trialFn(src) {
  const body = /\breturn\b/.test(src) ? src : `return (${src});`;
  // eslint-disable-next-line no-new-func
  return new Function('__h', '__r', `const {${Object.keys(H).join(',')}} = __h; const {${RNG_KEYS.join(',')}} = __r; ${body}`);
}
// 不碰页面的统计核心：返回 step(k) 做 k 次
function trialsCore(p, seed) {
  const R = rng(seed ?? p.seed ?? (Date.now() & 0x7fffffff)), tf = trialFn(p.trial), hf = p.hit ? compile(p.hit, ['r']) : null;
  const S = { n: 0, h: 0, sum: 0, r: null, counts: {}, series: [], next: 1 };
  S.step = (k) => {
    for (let i = 0; i < k; i++) {
      const r = tf(H, R); S.n++; S.r = r;
      if (hf) { if (hf({ r }, H)) S.h++; } else S.sum += +r;
      const key = typeof r === 'object' ? JSON.stringify(r) : String(r); if (key in S.counts || Object.keys(S.counts).length < 500) S.counts[key] = (S.counts[key] || 0) + 1;
      if (S.n >= S.next) { S.series.push([S.n, hf ? S.h / S.n : S.sum / S.n]); S.next = Math.max(S.n + 1, Math.ceil(S.n * 1.06)); }
    }
  };
  S.env = () => ({ n: S.n, h: S.h, f: S.n ? S.h / S.n : 0, mean: S.n ? S.sum / S.n : 0, r: S.r, counts: S.counts });
  return S;
}
function trials(box, p, api) {
  const S = trialsCore(p), mode = p.hit ? 'f' : 'mean', need = p.need || 1000, runs = p.runs || [1, 100, 1000, 10000];
  const keys = ['n', 'h', 'f', 'mean', 'r', 'counts'];
  const F = { info: fnc(p.info, keys), goal: fnc(p.goal, keys), tip: fnc(p.tip, keys), last: fnc(p.last, ['r']), show: fnc(p.show, ['r']) };
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  const CW = 360, CH = 150, L = 42, Rr = 22, T0 = 12, B = 26;
  box.innerHTML = `${p.show ? `<svg viewBox="0 0 ${p.vw || 360} ${p.vh || 120}" class="lp-sim slsvg tr-show" xmlns="http://www.w3.org/2000/svg"><g class="tr-sg"></g></svg>` : ''}<div class="tr-last"></div>
    <svg viewBox="0 0 ${CW} ${CH}" class="lp-sim slsvg tr-chart" xmlns="http://www.w3.org/2000/svg"><g class="tr-cg"></g></svg><div class="tr-hist"></div><div class="sl-info"></div>
    ${bar(runs.map((k) => btn('tr-run', `做 ${H.num(k)} 次`, `data-k="${k}"`)).join('') + btn('tr-reset', '重来'))}`;
  const chart = () => {
    const nmax = Math.max(10, need, S.n), lx = (n) => L + ((CW - L - Rr) * Math.log10(n)) / Math.log10(nmax);
    let [ya, yb] = mode === 'f' ? p.yr || [0, 1] : p.yr || [0, 1];
    if (mode === 'mean' && !p.yr) { const vals = S.series.map((q) => q[1]).concat(p.exact ?? []); if (vals.length) { ya = Math.min(...vals); yb = Math.max(...vals); const m = (yb - ya) * 0.15 || 1; ya -= m; yb += m; } }
    const ly = (y) => T0 + ((CH - T0 - B) * (yb - y)) / (yb - ya);
    let g = `<line x1="${L}" y1="${CH - B}" x2="${CW - Rr}" y2="${CH - B}" class="pl-ax"/><line x1="${L}" y1="${T0}" x2="${L}" y2="${CH - B}" class="pl-ax"/>`;
    for (let e = 0; 10 ** e <= nmax; e++) g += `<line x1="${r2(lx(10 ** e))}" y1="${CH - B}" x2="${r2(lx(10 ** e))}" y2="${CH - B + 4}" class="pl-ax"/><text x="${r2(lx(10 ** e))}" y="${CH - 8}" font-size="11" text-anchor="${lx(10 ** e) > CW - 40 ? 'end' : 'middle'}" class="st lbl pl-tk">${H.num(10 ** e)}</text>`;
    for (const y of [ya, (ya + yb) / 2, yb]) g += `<text x="${L - 5}" y="${r2(ly(y) + 4)}" font-size="11" text-anchor="end" class="st lbl pl-tk">${H.fmt(y, 2)}</text>`;
    g += `<text x="${CW - Rr}" y="${CH - B - 6}" font-size="11" text-anchor="end" class="st lbl pl-tk">次数</text>`;
    if (p.exact != null && S.n >= (p.reveal || 0)) g += `<line x1="${L}" y1="${r2(ly(p.exact))}" x2="${CW - Rr}" y2="${r2(ly(p.exact))}" class="pl-dash pl-c2"/>`;
    if (S.series.length) g += `<polyline points="${S.series.map(([n, y]) => `${r2(lx(n))},${r2(ly(clamp(y, ya, yb)))}`).join(' ')}" class="pl-c1"/>`;
    box.querySelector('.tr-cg').innerHTML = g;
  };
  const hist = () => {
    const el = box.querySelector('.tr-hist'); if (!p.hist || !S.n) { el.innerHTML = ''; return; }
    const ks = Object.keys(S.counts).sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : a - b)).slice(0, 40), mx = Math.max(...ks.map((k) => S.counts[k]));
    const W = 360, Hh = 110, bw = Math.min(40, (W - 20) / ks.length);
    let g = '';
    ks.forEach((k, i) => { const h = ((Hh - 34) * S.counts[k]) / mx, x = 10 + i * bw + (W - 20 - bw * ks.length) / 2; g += `<rect x="${r2(x + 2)}" y="${r2(Hh - 18 - h)}" width="${r2(bw - 4)}" height="${r2(h)}" class="tr-bar"/><text x="${r2(x + bw / 2)}" y="${Hh - 4}" font-size="11" class="st lbl">${esc(k)}</text>`; });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" class="lp-sim slsvg" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
  };
  const draw = () => {
    const env = S.env();
    if (F.show) box.querySelector('.tr-sg').innerHTML = S.n ? run(F.show, { r: S.r }, '') : '';
    const le = box.querySelector('.tr-last'); le.innerHTML = S.n && F.last ? `最近一次：${run(F.last, { r: S.r }, '')}` : ''; tex(le);
    chart(); hist();
    const el = box.querySelector('.sl-info');
    el.innerHTML = F.info ? run(F.info, env, '') : !S.n ? '<span class="muted">点下面的按钮开始做试验</span>'
      : mode === 'f' ? `做了 <b>${H.num(S.n)}</b> 次，${esc(p.hit_label || '发生')} <b>${H.num(S.h)}</b> 次，频率 <b>${env.f.toFixed(4)}</b>`
        : `做了 <b>${H.num(S.n)}</b> 次，平均 <b>${env.mean.toFixed(4)}</b>`;
    if (p.exact != null && S.n >= (p.reveal || 0) && p.exact_label) el.innerHTML += `<div class="muted">${p.exact_label}</div>`;
    tex(el);
    if (F.tip) { const t = run(F.tip, env, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (F.goal ? run(F.goal, env, false) : S.n >= need) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tr-reset')) { Object.assign(S, trialsCore(p)); }
    else { const b = e.target.closest('.tr-run'); if (!b) return; try { S.step(+b.dataset.k); } catch (err) { console.error(err); } }
    draw();
  });
  draw();
}

// ───────── 立体图（拖动旋转） ─────────
// { V: {A: [x, y, z], …}（z 朝上）, F: [['A', 'B', 'C', 'D'], …]（面，给了就能分出看得见 / 看不见的棱，按凸多面体算）, E: [['A', 'B'], …]（不给就从面里取）,
//   cubes: [[x, y, z], …]（单位小方块堆，代替 V / F）, labels: true, yaw: -35, pitch: 22（初始视角，度）, zoom: 1, vw: 360, vh: 280,
//   pts: {M: [x, y, z]}（额外的点，带名字）, segs: [['A', 'M', '类'], …], polys: [[['A', 'B', 'M'], '类'], …]（类：plum / jade / ink / warn，加 ' dash' 虚线、' thin' 细线、' nofill' 不填色、' noline' 不描边）,
//   balls: [{c: [x, y, z], r, cls}]（球的轮廓圆）, center: [x, y, z]（旋转中心，默认包围盒中心）,
//   vars: 滑块变量, dyn: '表达式，返回 {pts, segs, polys}（变量：滑块变量、V、S、has、n，可以跟着点选变）', pick: 'vertex' | 'edge' | 'face' | 'cube'（点选；single: true 一次只选一个，seen 是点过几个不同的；键是 'A'、'AB'（棱的两端按字母排序）、'ABCD'（照 F 里的写法）、'x,y,z'）,
//   info / goal / tip（变量：S 已选的键、has(键)、n 已选个数、滑块变量）, solution: [要选的键] }
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function solidModel(p) {
  const V = { ...(p.V || {}) }; let Fc = (p.F || []).map((f) => ({ k: f.join(''), v: f }));
  if (p.cubes) {
    const has = new Set(p.cubes.map((c) => c.join(',')));
    Fc = [];
    p.cubes.forEach(([x, y, z]) => FACE_DIRS.forEach(([a, b, c], d) => {
      if (has.has([x + a, y + b, z + c].join(','))) return;
      // 小方块 [x, x+1]×[y, y+1]×[z, z+1] 的一个面：四个角
      const corner = (i, j) => { const q = [x, y, z]; const ax = a ? 0 : b ? 1 : 2, o = [0, 1, 2].filter((t) => t !== ax); q[ax] += (a + b + c) > 0 ? 1 : 0; q[o[0]] += i; q[o[1]] += j; return q; };
      const ks = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => { const q = corner(i, j), k = '_' + q.join('_'); V[k] = q; return k; });
      Fc.push({ k: `${x},${y},${z}`, v: ks, cube: `${x},${y},${z}`, dir: d });
    }));
  }
  let E = (p.E || []).map((e) => e.slice(0, 2));
  if (!p.E && !p.cubes) { const seen = new Set(); Fc.forEach((f) => f.v.forEach((a, i) => { const b = f.v[(i + 1) % f.v.length], k = [a, b].sort().join('|'); if (!seen.has(k)) { seen.add(k); E.push([a, b]); } })); }
  const real = Object.entries(V).filter(([k]) => !k.startsWith('_') || p.cubes).map(([, q]) => q), all = [...Object.values(V), ...Object.values(p.pts || {}), ...(p.balls || []).flatMap((b) => [0, 1, 2].flatMap((i) => [-1, 1].map((sg) => b.c.map((t, j) => t + (j === i ? sg * b.r : 0)))))];
  const c = p.center || [0, 1, 2].map((i) => (Math.min(...all.map((q) => q[i])) + Math.max(...all.map((q) => q[i]))) / 2);
  // 判断面朝外用顶点的平均（包围盒中心可能在不对称的立体外面）
  const m = [0, 1, 2].map((i) => real.reduce((s, q) => s + q[i], 0) / (real.length || 1));
  const R = Math.max(...all.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]))) || 1;
  return { V, F: Fc, E, c, m, R };
}
const SD_CLS = (c) => (c || 'plum').split(' ').map((x) => `sd-${x}`).join(' ');
function solid(box, p, api) {
  const M = solidModel(p), vw = p.vw || 360, vh = p.vh || 280;
  const scale = (Math.min(vw, vh) * 0.42 * (p.zoom || 1)) / M.R;
  const v = varsInit(p.vars), vk = (p.vars || []).map((x) => x.k), dyn = fnc(p.dyn, [...vk, 'V', 'S', 'has', 'n', 'seen']);
  const keys = [...vk, 'V', 'S', 'has', 'n', 'seen'];
  const F = { info: fnc(p.info, keys), goal: fnc(p.goal, keys), tip: fnc(p.tip, keys) };
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  let yaw = p.yaw ?? -35, pitch = p.pitch ?? 22; const sel = new Set(), ever = new Set();
  box.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" class="lp-sim slsvg sdsvg" xmlns="http://www.w3.org/2000/svg"><g class="sd-g"></g></svg><div class="sl-info"></div>${varsHtml(p.vars, v)}${bar(btn('sd-spin', '转一圈') + btn('sd-home', '复位') + (p.pick ? btn('sd-clear', '清空') : ''))}`;
  const svg = box.querySelector('svg');
  const proj = (q) => {
    const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
    const x = q[0] - M.c[0], y = q[1] - M.c[1], z = q[2] - M.c[2];
    const x1 = x * Math.cos(a) - y * Math.sin(a), y1 = x * Math.sin(a) + y * Math.cos(a);
    const d = y1 * Math.cos(b) - z * Math.sin(b), z2 = y1 * Math.sin(b) + z * Math.cos(b);
    return [r2(vw / 2 + scale * x1), r2(vh / 2 - scale * z2), d];
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const draw = () => {
    const D = run(dyn, { ...v, V: M.V, S: [...sel], has: (k) => sel.has(k), n: sel.size, seen: ever.size }, {}) || {};
    const PT = { ...M.V, ...(p.pts || {}), ...(D.pts || {}) };
    const at = (k) => (Array.isArray(k) ? k : PT[k]);
    const S2 = {}; for (const [k, q] of Object.entries(PT)) S2[k] = proj(q);
    const pr = (k) => (Array.isArray(k) ? proj(k) : S2[k]);
    // 面的朝向：外法向（相对整体中心）在视线方向的分量 < 0 就朝着我们
    const faces = M.F.map((f) => {
      const P0 = at(f.v[0]), nrm0 = cross(sub(at(f.v[1]), P0), sub(at(f.v[2]), P0));
      const ctr = [0, 1, 2].map((i) => f.v.reduce((s, k) => s + at(k)[i], 0) / f.v.length);
      const ref = f.cube ? f.cube.split(',').map((t) => +t + 0.5) : M.m;
      const out = (nrm0[0] * (ctr[0] - ref[0]) + nrm0[1] * (ctr[1] - ref[1]) + nrm0[2] * (ctr[2] - ref[2])) < 0 ? nrm0.map((t) => -t) : nrm0;
      const tip = proj([ctr[0] + out[0], ctr[1] + out[1], ctr[2] + out[2]])[2] - proj(ctr)[2];
      return { ...f, front: tip < -1e-9, depth: proj(ctr)[2], pts: f.v.map((k) => S2[k].slice(0, 2).join(',')).join(' ') };
    });
    let g = '';
    if (p.cubes) {
      faces.filter((f) => f.front).sort((a, b) => b.depth - a.depth).forEach((f) => {
        g += `<polygon points="${f.pts}" class="sd-cf sd-d${Math.floor(f.dir / 2)}${sel.has(f.cube) ? ' on' : ''}" data-k="${f.cube}"/>`;
      });
    } else {
      const vis = new Map(); faces.forEach((f) => f.v.forEach((a, i) => { const k = [a, f.v[(i + 1) % f.v.length]].sort().join('|'); vis.set(k, (vis.get(k) || false) || f.front); }));
      // 面：远的先画，点选时近的在上面
      faces.slice().sort((a, b) => b.depth - a.depth).forEach((f) => { g += `<polygon points="${f.pts}" class="sd-f${f.front ? ' front' : ''}${sel.has(f.k) ? ' on' : ''}${p.pick === 'face' ? ' pk' : ''}" data-k="${esc(f.k)}"/>`; });
      M.E.forEach(([a, b]) => {
        const k = [a, b].sort().join(''), shown = M.F.length ? vis.get([a, b].sort().join('|')) ?? true : true, A = S2[a], B = S2[b];
        g += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="sd-e${shown ? '' : ' hid'}${sel.has(k) ? ' on' : ''}"/>`;
        if (p.pick === 'edge') g += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="sd-eh" data-k="${esc(k)}"/>`;
      });
    }
    const extra = (L, poly) => (L || []).forEach((it) => {
      if (poly) { const [ks, c] = it; g += `<polygon points="${ks.map((k) => pr(k).slice(0, 2).join(',')).join(' ')}" class="sd-x sd-poly ${SD_CLS(c)}"/>`; return; }
      const [a, b, c] = it, A = pr(a), B = pr(b); if (!A || !B) return;
      g += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="sd-x ${SD_CLS(c)}"/>`;
    });
    extra(p.polys, true); extra(D.polys, true); extra(p.segs); extra(D.segs);
    for (const b of [...(p.balls || []), ...(D.balls || [])]) { const q = proj(b.c); g += `<circle cx="${q[0]}" cy="${q[1]}" r="${r2(b.r * scale)}" class="sd-x sd-ball ${SD_CLS(b.cls || 'ink thin')}"/>`; }
    if (!p.cubes) {
      const named = Object.keys(PT).filter((k) => !k.startsWith('_'));
      const ctr = proj(M.c);
      named.forEach((k) => {
        const [x, y] = S2[k]; let dx = x - ctr[0], dy = y - ctr[1]; const L = Math.hypot(dx, dy) || 1; dx = (dx / L) * 13; dy = (dy / L) * 13 || -13;
        const extraPt = !(k in M.V);
        if (extraPt || p.pick === 'vertex') g += `<circle cx="${x}" cy="${y}" r="${extraPt ? 3.5 : 4}" class="sd-v${sel.has(k) ? ' on' : ''}"/>`;
        if (p.pick === 'vertex' && !extraPt) g += `<circle cx="${x}" cy="${y}" r="14" class="sd-vh" data-k="${esc(k)}"/>`;
        if (p.labels !== false || extraPt) g += `<text x="${r2(x + dx)}" y="${r2(y + dy + 5)}" font-size="14" text-anchor="middle" class="st lbl">${esc(k)}</text>`;
      });
    }
    box.querySelector('.sd-g').innerHTML = g;
    box.querySelectorAll('.sl-v').forEach((e) => { e.textContent = H.fmt(v[e.dataset.k]); });
    const env = { ...v, V: M.V, S: [...sel], has: (k) => sel.has(k), n: sel.size, seen: ever.size };
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, env, ''); tex(el); }
    if (F.tip) { const t = run(F.tip, env, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, env, false)) ok();
  };
  // 拖动旋转；没怎么动就当作点选
  let down = null, moved = false, dragEnd = 0, spin = null;
  const stopSpin = () => { if (spin) { cancelAnimationFrame(spin); spin = null; } };
  svg.addEventListener('pointerdown', (e) => { stopSpin(); down = [e.clientX, e.clientY, yaw, pitch]; moved = false; svg.setPointerCapture?.(e.pointerId); });
  svg.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down[0], dy = e.clientY - down[1];
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true; yaw = down[2] - dx * 0.6; pitch = clamp(down[3] + dy * 0.5, -89, 89); draw();
  });
  const up = () => { if (moved) dragEnd = Date.now(); down = null; moved = false; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('click', (e) => {
    if (Date.now() - dragEnd < 300) return;
    const t = e.target.closest('[data-k]'); if (!t || !p.pick) return;
    const k = t.dataset.k;
    if (p.single) { const was = sel.has(k); sel.clear(); if (!was) sel.add(k); } else if (sel.has(k)) sel.delete(k); else sel.add(k);
    if (sel.has(k)) ever.add(k); draw();
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('.sd-home')) { stopSpin(); yaw = p.yaw ?? -35; pitch = p.pitch ?? 22; draw(); }
    else if (e.target.closest('.sd-clear')) { sel.clear(); draw(); }
    else if (e.target.closest('.sd-spin')) {
      stopSpin(); const y0 = yaw, t0 = performance.now();
      const stepf = (t) => { if (!box.isConnected) return stopSpin(); const k = Math.min(1, (t - t0) / 4000); yaw = y0 + 360 * k; draw(); spin = k < 1 ? requestAnimationFrame(stepf) : null; };
      spin = requestAnimationFrame(stepf);
    }
  });
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { v[r.dataset.k] = +r.value; draw(); }));
  draw();
}

export const SIMS_HS = { plane, trials, solid };
export const HS_CORE = { planeState, planeKeys, planeFrame, trialsCore, trialFn, solidModel, varsInit, RNG_KEYS };
