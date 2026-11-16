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
const pair = (s, d) => (Array.isArray(s) ? [+s[0], +s[1]] : [s ?? d, s ?? d]);

// ───────── 坐标平面 ─────────
// { xr: [-5, 5], yr: [-5, 5], vw: 360, vh: 300, equal: true（横纵同比例）, step: 1 或 [横, 纵]（网格）, tick（刻度数字间隔，默认自动，也可 [横, 纵]）, grid: true, axes: true,
//   pts: [{k: 'A', x, y, label（默认 k，'' 不写）, snap（默认 p.snap ?? 1，也可 [横, 纵]）, fixed, color: 'plum'|'jade'|'ink',
//          on: 'x'（只能横着拖）| 'y'（只能竖着拖）, f: 'y 关于 x 的表达式（可用滑块变量）'（点在曲线上）, c: [cx, cy, r]（点在圆上，deg: 角度吸附）, xr / yr: 拖动范围}],
//   calc: {Q: '由点和滑块算出的点 / 数（表达式，按顺序算，后面的能用前面的）'}, nudge: true / false（微调按钮，默认吸附小于 0.5 时出现）,
//   vars: 滑块变量（同 slider）, bg: '画在网格上、点下面（SVG 表达式）', fg: '画在点上面', info, goal, tip, solution: {A: [x, y], a: 值} }
// 表达式里：点名（{x, y}）、calc 的名字、滑块变量，以及 sx(x) sy(y)（换成画布坐标）、seg(A, B, 类) line(A, B, 类)（整条直线）、ray(A, B, 类)、poly([A, B, C], 类)、
//   circ(C, r, 类)、arc(C, r, 起角, 终角, 类)（度，逆时针）、sector(C, r, 起角, 终角, 类)（扇形）、plot(x => …, 类, a, b)（函数图像，自动断开、裁到画布里）、dot(A, 类)、lab(A, 文字, dx, dy, 类)、
//   dist(A, B)、slope(A, B)、mid(A, B)、area([A, B, C])、ang(A, O, B)（度）、inter(A, B, C, D)（直线 AB 与 CD 的交点，平行时 null）、
//   foot(P, A, B)（P 到直线 AB 的垂足）、refl(P, A, B)（P 关于直线 AB 的对称点）、rot(P, O, 度)（P 绕 O 逆时针转）。点可以写 {x, y} 也可以写 [x, y]。
//   类：ln（实线）、dash（虚线）、sh / sh2（填色）、c1 / c2（紫 / 绿粗线）、dot1 / dot2 / dot0（紫 / 绿 / 黑点）、hollow（空心点，取不到的端点）。
const PL_HELP = ['sx', 'sy', 'seg', 'line', 'ray', 'poly', 'circ', 'arc', 'sector', 'plot', 'dot', 'lab', 'dist', 'slope', 'mid', 'area', 'ang', 'inter', 'foot', 'refl', 'rot'];
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
// 点的名字（A、P1、B′）写斜体粗体，和能拖的点一致
const NAME_RE = /^[A-Za-z]{1,2}[0-9₀-₉]*[′'″]*$/;
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
  // 圆弧按角度取点画折线（横纵比例不同时也对）
  const arcPts = (O, r, a0, a1) => { O = Q(O); let d = a1 - a0; if (d < 0) d += 360 * Math.ceil(-d / 360); const n = Math.max(2, Math.ceil(d / 3)); return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + (d * i) / n) * Math.PI) / 180; return `${sx(O.x + r * Math.cos(a))},${sy(O.y + r * Math.sin(a))}`; }); };
  const arc = (O, r, a0, a1, c) => `<polyline points="${arcPts(O, r, a0, a1).join(' ')}" class="${C(c, 'ln')}"/>`;
  const sector = (O, r, a0, a1, c) => { const o = Q(O); return `<polygon points="${sx(o.x)},${sy(o.y)} ${arcPts(O, r, a0, a1).join(' ')}" class="${C(c, 'sh')}"/>`; };
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
  const lab = (A, s, dx = 8, dy = -8, c) => { A = Q(A); const nm = NAME_RE.test(String(s)); return `<text x="${r2(sx(A.x) + dx)}" y="${r2(sy(A.y) + dy)}" font-size="${nm ? 15 : 14}" text-anchor="middle" class="st lbl${nm ? ' pl-nm' : ''}${c ? ' ' + c : ''}">${esc(s)}</text>`; };
  const dist = (A, B) => { A = Q(A); B = Q(B); return Math.hypot(B.x - A.x, B.y - A.y); };
  const slope = (A, B) => { A = Q(A); B = Q(B); return (B.y - A.y) / (B.x - A.x); };
  const mid = (A, B) => { A = Q(A); B = Q(B); return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; };
  const area = (L) => { L = L.map(Q); let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
  const ang = (A, O, B) => { A = Q(A); O = Q(O); B = Q(B); const u = Math.atan2(A.y - O.y, A.x - O.x), w = Math.atan2(B.y - O.y, B.x - O.x); let d = Math.abs(u - w) * 180 / Math.PI; return d > 180 ? 360 - d : d; };
  return { sx, sy, seg, line, ray, poly, circ, arc, sector, plot, dot, lab, dist, slope, mid, area, ang, ...PL_GEO };
}
// 不依赖画布的几何函数（检查脚本也能用）
const PL_GEO = {
  inter: (A, B, C, D) => { A = Q(A); B = Q(B); C = Q(C); D = Q(D); const ux = B.x - A.x, uy = B.y - A.y, wx = D.x - C.x, wy = D.y - C.y, det = ux * wy - uy * wx; if (Math.abs(det) < 1e-12) return null; const t = ((C.x - A.x) * wy - (C.y - A.y) * wx) / det; return { x: r6(A.x + t * ux), y: r6(A.y + t * uy) }; },
  foot: (P, A, B) => { P = Q(P); A = Q(A); B = Q(B); const ux = B.x - A.x, uy = B.y - A.y, t = ((P.x - A.x) * ux + (P.y - A.y) * uy) / (ux * ux + uy * uy || 1); return { x: r6(A.x + t * ux), y: r6(A.y + t * uy) }; },
  refl: (P, A, B) => { const F = PL_GEO.foot(P, A, B); P = Q(P); return { x: r6(2 * F.x - P.x), y: r6(2 * F.y - P.y) }; },
  rot: (P, O, deg) => { P = Q(P); O = Q(O); const a = (deg * Math.PI) / 180, dx = P.x - O.x, dy = P.y - O.y; return { x: r6(O.x + dx * Math.cos(a) - dy * Math.sin(a)), y: r6(O.y + dx * Math.sin(a) + dy * Math.cos(a)) }; },
};
// 按约束把 (x, y) 放到点上
function planePlace(pt, x, y, v, fr, p, fcache) {
  const [s1, s2] = pair(pt.snap ?? p.snap, 1);
  const xr = pt.xr || [fr.X0, fr.X1], yr = pt.yr || [fr.Y0, fr.Y1];
  if (pt.c) {
    const [cx, cy, r] = pt.c; let a = Math.atan2(y - cy, x - cx);
    if (pt.deg) a = (Math.round((a * 180) / Math.PI / pt.deg) * pt.deg * Math.PI) / 180;
    return { x: r6(cx + r * Math.cos(a)), y: r6(cy + r * Math.sin(a)) };
  }
  if (pt.f) { const nx = clamp(snapTo(x, s1), xr[0], xr[1]); return { x: nx, y: planeFy(pt, nx, v, fcache) }; }
  if (pt.on === 'x') return { x: clamp(snapTo(x, s1), xr[0], xr[1]), y: pt.y };
  if (pt.on === 'y') return { x: pt.x, y: clamp(snapTo(y, s2), yr[0], yr[1]) };
  return { x: clamp(snapTo(x, s1), xr[0], xr[1]), y: clamp(snapTo(y, s2), yr[0], yr[1]) };
}
function planeFy(pt, x, v, fcache) {
  const f = fcache[pt.k] || (fcache[pt.k] = compile(pt.f, ['x', ...Object.keys(v)]));
  return r6(f({ x, ...v }, H));
}
const calcKeys = (p) => Object.keys(p.calc || {});
function planeKeys(p) { return [...(p.vars || []).map((x) => x.k), ...(p.pts || []).map((x) => x.k), ...calcKeys(p), ...PL_HELP]; }
const CALC = new WeakMap();
function planeEnv(p, P, v, fr) {
  const env = { ...v, ...P, ...planeHelpers(fr) };
  if (p.calc) {
    let cf = CALC.get(p);
    if (!cf) { const keys = planeKeys(p); cf = Object.entries(p.calc).map(([k, e]) => [k, compile(e, keys)]); CALC.set(p, cf); }
    for (const [k, f] of cf) {
      let val; try { val = f(env, H); } catch (e) { val = null; }
      env[k] = Array.isArray(val) && val.length === 2 && val.every((t) => typeof t === 'number') ? Q(val) : val;
    }
  }
  return env;
}
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
  const pts = p.pts || [], cid = `plc${++uid}`, movable = pts.filter((x) => !x.fixed);
  const nudge = p.nudge ?? movable.some((x) => !x.c && Math.min(...pair(x.snap ?? p.snap, 1).filter((t) => t > 0)) < 0.5);
  let cur = movable[0] || null;
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  const nb = (d, t) => btn('pl-nb', t, `data-d="${d}" aria-label="${t}"`);
  box.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" class="lp-sim slsvg plsvg" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="${cid}"><rect x="0" y="0" width="${vw}" height="${vh}"/></clipPath></defs><g class="pl-g"></g></svg><div class="sl-info"></div>${varsHtml(p.vars, v)}${nudge && cur ? bar(`<b class="pl-cur"></b>${nb('-1,0', '←')}${nb('1,0', '→')}${nb('0,-1', '↓')}${nb('0,1', '↑')}`) : ''}`;
  const svg = box.querySelector('svg');
  // 网格和坐标轴（不变，只画一次）
  const [stx, sty] = pair(p.step, 1);
  const [tkx, tky] = Array.isArray(p.tick) ? pair(p.tick) : [p.tick || stx * Math.max(1, Math.ceil(24 / (stx * fr.ux))), p.tick || sty * Math.max(1, Math.ceil(24 / (sty * fr.uy)))];
  let base = '';
  if (p.grid !== false) {
    for (let x = Math.ceil(fr.X0 / stx) * stx; x <= fr.X1; x = r6(x + stx)) base += `<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${vh}" class="pl-gr"/>`;
    for (let y = Math.ceil(fr.Y0 / sty) * sty; y <= fr.Y1; y = r6(y + sty)) base += `<line x1="0" y1="${sy(y)}" x2="${vw}" y2="${sy(y)}" class="pl-gr"/>`;
  }
  if (p.axes !== false) {
    // 原点不在画面里时，坐标轴放在给定范围靠近原点的那条边上
    const [x0, x1] = p.xr || [-5, 5], [y0, y1] = p.yr || [-5, 5];
    const ax = clamp(sx(clamp(0, x0, x1)), 0, vw), ay = clamp(sy(clamp(0, y0, y1)), 0, vh);
    base += `<line x1="0" y1="${ay}" x2="${vw}" y2="${ay}" class="pl-ax"/><line x1="${ax}" y1="0" x2="${ax}" y2="${vh}" class="pl-ax"/>`;
    base += `<path d="M${vw - 8} ${ay - 4}L${vw} ${ay}L${vw - 8} ${ay + 4}M${ax - 4} 8L${ax} 0L${ax + 4} 8" class="pl-ax"/>`;
    // 坐标轴贴着画布边（原点不在画面里）时，刻度数字放到画布里面那一侧
    const below = ay < vh - 20, left = ax > 30;
    const tyX = below ? ay + 14 : ay - 6, txY = left ? ax - 5 : ax + 5, anY = left ? 'end' : 'start';
    base += `<text x="${vw - 6}" y="${below ? ay - 8 : ay - 22}" font-size="13" text-anchor="end" class="st lbl" font-style="italic">x</text><text x="${left ? ax + 8 : ax + 8}" y="13" font-size="13" class="st lbl" font-style="italic">y</text>`;
    if (p.ticks !== false) {
      for (let x = Math.ceil((x0 > 0 ? x0 : fr.X0) / tkx) * tkx; x <= (x1 < 0 ? x1 : fr.X1 - tkx * 0.5); x = r6(x + tkx)) if (Math.abs(x) > 1e-9 && sx(x) > 8 && Math.abs(sx(x) - ax) > (left ? 10 : 4)) base += `<text x="${sx(x)}" y="${tyX}" font-size="11" text-anchor="middle" class="st lbl pl-tk">${H.fmt(x)}</text>`;
      for (let y = Math.ceil((y0 > 0 ? y0 : fr.Y0) / tky) * tky; y <= (y1 < 0 ? y1 : fr.Y1 - tky * 0.5); y = r6(y + tky)) if (Math.abs(y) > 1e-9 && sy(y) < vh - 6 && sy(y) > 18 && Math.abs(sy(y) - ay) > (below ? 10 : 18)) base += `<text x="${txY}" y="${sy(y) + 4}" font-size="11" text-anchor="${anY}" class="st lbl pl-tk">${H.fmt(y)}</text>`;
      if (Math.abs(ax - sx(0)) < 0.5 && Math.abs(ay - sy(0)) < 0.5) base += `<text x="${txY}" y="${tyX}" font-size="11" text-anchor="${anY}" class="st lbl pl-tk">0</text>`;
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
      g += `<g class="pl-h${pt.fixed ? ' fixed' : ''}${nudge && cur === pt ? ' cur' : ''}" data-k="${esc(pt.k)}"${pt.fixed ? '' : ` tabindex="0" role="slider" aria-label="${esc(label || pt.k)}"`}>${pt.fixed ? '' : `<circle cx="${x}" cy="${y}" r="18" class="pl-hit"/><circle cx="${x}" cy="${y}" r="10" class="pl-ring pl-${c}"/>`}<circle cx="${x}" cy="${y}" r="5" class="pl-pt pl-${c}"/>${label ? `<text x="${r2(x + (pt.dx ?? 10))}" y="${r2(y + (pt.dy ?? -10))}" font-size="15" text-anchor="middle" class="st lbl pl-nm">${esc(label)}</text>` : ''}</g>`;
    }
    box.querySelector('.pl-g').innerHTML = g;
    box.querySelectorAll('.sl-v').forEach((e) => { e.textContent = H.fmt(v[e.dataset.k]); });
    const ce = box.querySelector('.pl-cur'); if (ce && cur) ce.textContent = `${cur.label || cur.k}(${H.fmt(P[cur.k].x, 2)}, ${H.fmt(P[cur.k].y, 2)})`;
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, env, ''); tex(el); }
    if (F.tip) { const t = run(F.tip, env, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, env, false)) ok();
  };
  // 按一下挪一格（吸附间隔；圆上的点挪 deg 度）
  const step = (pt, dx, dy) => {
    const [s1, s2] = pair(pt.snap ?? p.snap, 1), o = P[pt.k];
    if (pt.c) { const [cx, cy, r] = pt.c, a = Math.atan2(o.y - cy, o.x - cx) + ((dx || dy) * (pt.deg || 5) * Math.PI) / 180; P[pt.k] = planePlace(pt, cx + r * Math.cos(a), cy + r * Math.sin(a), v, fr, p, fc); }
    else P[pt.k] = planePlace(pt, o.x + dx * (s1 || 0.1), o.y + dy * (s2 || 0.1), v, fr, p, fc);
    draw();
  };
  let drag = null;
  const at = (e) => { const m = svg.getScreenCTM(); if (!m) return null; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [fr.mx(q.x), fr.my(q.y)]; };
  const move = (e) => { const xy = at(e); if (!xy) return; const n = planePlace(drag, xy[0], xy[1], v, fr, p, fc); const o = P[drag.k]; if (n.x !== o.x || n.y !== o.y) { P[drag.k] = n; draw(); } };
  svg.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.pl-h'); if (!h) return;
    const pt = pts.find((x) => x.k === h.dataset.k); if (!pt || pt.fixed) return;
    drag = pt; if (cur !== pt) { cur = pt; draw(); } svg.setPointerCapture?.(e.pointerId); e.preventDefault(); move(e);
  });
  svg.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    const h = e.target.closest('.pl-h'); if (!h) return;
    const pt = pts.find((x) => x.k === h.dataset.k); if (!pt || pt.fixed) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!d) return;
    e.preventDefault(); cur = pt; step(pt, d[0], d[1]);
    svg.querySelector(`.pl-h[data-k="${CSS.escape(pt.k)}"]`)?.focus();
  });
  box.addEventListener('click', (e) => { const b = e.target.closest('.pl-nb'); if (!b || !cur) return; const [dx, dy] = b.dataset.d.split(',').map(Number); step(cur, dx, dy); });
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { v[r.dataset.k] = +r.value; draw(); }));
  draw();
}

// ───────── 随机模拟 ─────────
// { trial: '一次试验，返回结果（表达式；要写多句就写函数体并 return）', hit: '由结果 r 判断事件是否发生'（给了就统计频率，不给就统计 r 的平均值）,
//   exact: 理论值（画虚线对照；会露出答案时别给，或用 reveal: 做满多少次才画）, exact_label: '理论值的说法，可以有 $公式$',
//   last: '最近一次结果的说明（HTML 表达式，变量 r）', show: '最近一次结果的图（SVG 表达式，变量 r）', vw, vh,
//   hist: true（按结果分组画柱状图，柱顶写次数）| 'pct'（柱顶写百分比）, hist_label: '柱状图横轴是什么', yr: [下, 上]（平均值模式的纵轴）, runs: [1, 100, 1000, 10000], need: 做满几次算完成（默认 1000）,
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
  const CW = 360, CH = 158, L = 42, Rr = 22, T0 = 20, B = 26;
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
    g += `<text x="${L + 6}" y="${T0 - 7}" font-size="11" class="st lbl pl-tk">${mode === 'f' ? '频率' : '平均值'}</text><text x="${CW - Rr}" y="${CH - B - 6}" font-size="11" text-anchor="end" class="st lbl pl-tk">次数</text>`;
    if (p.exact != null && S.n >= (p.reveal || 0)) g += `<line x1="${L}" y1="${r2(ly(p.exact))}" x2="${CW - Rr}" y2="${r2(ly(p.exact))}" class="pl-dash pl-c2"/>`;
    if (S.series.length) g += `<polyline points="${S.series.map(([n, y]) => `${r2(lx(n))},${r2(ly(clamp(y, ya, yb)))}`).join(' ')}" class="pl-c1"/>`;
    box.querySelector('.tr-cg').innerHTML = g;
  };
  const hist = () => {
    const el = box.querySelector('.tr-hist'); if (!p.hist || !S.n) { el.innerHTML = ''; return; }
    const ks = Object.keys(S.counts).sort((a, b) => (isNaN(a) || isNaN(b) ? a.localeCompare(b) : a - b)).slice(0, 40), mx = Math.max(...ks.map((k) => S.counts[k]));
    const W = 360, lb = p.hist_label ? 18 : 0, Hh = 132 + lb, base = Hh - 22 - lb, top = 16, bw = Math.min(40, (W - 20) / ks.length), x0 = 10 + (W - 20 - bw * ks.length) / 2;
    const every = Math.max(1, Math.ceil(18 / bw)), showV = bw >= (p.hist === 'pct' ? 30 : 24);
    let g = `<line x1="${r2(x0)}" y1="${base}" x2="${r2(x0 + bw * ks.length)}" y2="${base}" class="pl-ax"/>`;
    ks.forEach((k, i) => {
      const c = S.counts[k], h = ((base - top) * c) / mx, x = x0 + i * bw;
      g += `<rect x="${r2(x + 2)}" y="${r2(base - h)}" width="${r2(bw - 4)}" height="${r2(h)}" class="tr-bar"/>`;
      if (showV) g += `<text x="${r2(x + bw / 2)}" y="${r2(base - h - 3)}" font-size="10" text-anchor="middle" class="st lbl pl-tk">${p.hist === 'pct' ? `${H.fmt((100 * c) / S.n, 1)}%` : H.num(c)}</text>`;
      if (i % every === 0) g += `<text x="${r2(x + bw / 2)}" y="${base + 15}" font-size="11" text-anchor="middle" class="st lbl">${esc(k)}</text>`;
    });
    if (p.hist_label) g += `<text x="${W / 2}" y="${Hh - 4}" font-size="11" text-anchor="middle" class="st lbl pl-tk">${esc(p.hist_label)}</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" class="lp-sim slsvg tr-chart" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
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
// { V: {A: [x, y, z], …}（z 朝上）, F: [['A', 'B', 'C', 'D'], …]（面，给了就能分出看得见 / 看不见的棱；凹的立体也行，面要围成封闭的表面）, E: [['A', 'B'], …]（不给就从面里取）,
//   round: [{type: 'cyl' | 'cone' | 'frustum', c: [x, y, z]（底面圆心）, r, h, r2（圆台上底半径）, axis: 'z'（默认竖直，'x' / 'y' 横放，h 沿轴的正方向）, cls: 'jade' | 'plum' | 'warn'（填色，比如水）, top / base: false（不画上 / 下底）}]（圆柱、圆锥、圆台；只画轮廓线和底面圆；dyn 也能返回 round）,
//   cubes: [[x, y, z], [x, y, z, 'plum'], …]（单位小方块堆，代替 V / F；第 4 项是这一块的颜色：plum / jade / ink / warn）, grid: false（同一平面上的小方块不画分隔线）, explode: true（加「拆开」按钮，点选方块时默认有）,
//   labels: true, yaw: -35, pitch: 22（初始视角，度）, zoom: 1, vw: 360, vh: 280,
//   pts: {M: [x, y, z]}（额外的点，带名字；pt_names: false 只画点不写名字）, segs: [['A', 'M', '类'], …], curves: [[[点, 点, …], '类'], …]（一串点连成的曲线）, texts: [[点名或 [x, y, z], '文字', 'plum'|'jade'|'warn'], …]（写字，比如面上的数字；被挡住的变淡）, polys: [[['A', 'B', 'M'], '类'], …]（类：plum / jade / ink / warn，加 ' dash' 虚线、' thin' 细线、' nofill' 不填色、' noline' 不描边、' opaque' 不透明；多边形按远近排序）, fit: 'live'（每次按当前画面定中心和缩放，展开图折叠用）,
//   额外的线、多边形的边被立体挡住的部分自动画成虚线（hide: false 整步关掉；类里写 dash 一直是虚线，写 solid 一直是实线）,
//   balls: [{c: [x, y, z], r, cls, eq: true（画赤道，背面一半虚线）}], center: [x, y, z]（旋转中心，默认包围盒中心）,
//   vars: 滑块变量, dyn: '表达式，返回 {pts, segs, polys, curves, texts, balls, round, cubes}（变量：滑块变量、V、S、has、n、seen、yaw、pitch）', pick: 'vertex' | 'edge' | 'face' | 'cube'（点选；single: true 一次只选一个，seen 是点过几个不同的；键是 'A'、'AB'（棱的两端按字母排序）、'ABCD'（照 F 里的写法）、'x,y,z'）,
//   info / goal / tip（变量：S 已选的键、has(键)、n 已选个数、滑块变量、yaw（0～360）、pitch（-89～89）当前视角、side（'前' 从 -y 看 / '后' / '左' / '右' / '上' / '下'））, pick_color: 'plum'（选中方块的颜色，可 'warn' / 'ink' / 'jade'）, texts_back: true（被挡住的字画成淡色，默认不画）, solution: [要选的键], solution_vars: {滑块: 值}, solution_view: {yaw, pitch} }
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const SD_KEYS = ['V', 'S', 'has', 'n', 'seen', 'yaw', 'pitch', 'side'];
// 从哪面看：pitch 大于 45 是上、小于 -45 是下，否则按 yaw 分前（从 -y 往 +y 看）/ 后 / 左 / 右
const sdSide = (yaw, pitch) => { if (pitch > 45) return '上'; if (pitch < -45) return '下'; const a = (yaw * Math.PI) / 180, x = -Math.sin(a), y = -Math.cos(a); return Math.abs(x) > Math.abs(y) ? (x > 0 ? '右' : '左') : (y > 0 ? '后' : '前'); };
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 多边形法向（Newell，顶点顺序决定方向）
const newell = (L) => { const n = [0, 0, 0]; L.forEach((a, i) => { const b = L[(i + 1) % L.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }); return n; };
const ekey = (a, b) => [a, b].sort().join('|');
function solidModel(p) {
  const V = { ...(p.V || {}) }, Fc = (p.F || []).map((f) => ({ k: f.join(''), v: f })), ext = [];
  // 圆柱 / 圆锥 / 圆台：侧面分成 n 条窄面（同一组 grp，组内的棱只在轮廓处画）
  // 叠在一起的两个形体（圆锥放在圆台上）接缝处坐标相同的点共用，接缝才能按一条棱分虚实
  const byPos = new Map();
  (p.round || []).forEach((s, gi) => {
    const n = s.n || 48, r = s.r, h = s.h, rt = s.type === 'cone' ? 0 : s.type === 'cyl' ? r : (s.r2 ?? r), g = `r${gi}`;
    // axis：轴的方向（默认 z 竖直；'x' / 'y' 横放）。在 (圆周 e1, e2, 轴 e3) 里算好再换回世界坐标
    const ax = { x: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], y: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] }[s.axis] || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const W3 = (u, v, w) => [0, 1, 2].map((j) => r6(s.c[j] + u * ax[0][j] + v * ax[1][j] + w * ax[2][j]));
    const ring = (rr, zz, tag) => Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n, q = W3(rr * Math.cos(a), rr * Math.sin(a), zz), pk = q.join(',');
      if (byPos.has(pk)) return byPos.get(pk);
      const k = `_${g}${tag}${i}`; V[k] = q; byPos.set(pk, k); return k;
    });
    const B = ring(r, 0, 'b'), T = rt > 0 ? ring(rt, h, 't') : null;
    let apex = null; if (!T) { apex = `_${g}a`; V[apex] = W3(0, 0, h); }
    if (s.base !== false) Fc.push({ k: `_${g}B`, v: B.slice().reverse(), cap: g, rc: s.cls });
    if (T && s.top !== false) Fc.push({ k: `_${g}T`, v: T, cap: g, rc: s.cls });
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; Fc.push({ k: `_${g}s${i}`, v: T ? [B[i], B[j], T[j], T[i]] : [B[i], B[j], apex], grp: g, rc: s.cls }); }
  });
  // 小方块：每块 6 个面都记下，exposed 表示露在外面；inner[i] 表示第 i 条边外侧同一平面上还接着同色的露面（grid: false 时不画这条线）
  let cubeCls = null;
  if (p.cubes) {
    cubeCls = new Map(p.cubes.map((c) => [c.slice(0, 3).join(','), c[3] || '']));
    const exposed = (q, d) => cubeCls.has(q.join(',')) && !cubeCls.has(q.map((t, i) => t + FACE_DIRS[d][i]).join(','));
    p.cubes.forEach((cb) => {
      const [x, y, z] = cb.slice(0, 3).map(Number), key = `${x},${y},${z}`, cls = cb[3] || '';
      FACE_DIRS.forEach(([a, b, c], d) => {
        const ax = a ? 0 : b ? 1 : 2, o = [0, 1, 2].filter((t) => t !== ax);
        const corner = (i, j) => { const q = [x, y, z]; q[ax] += (a + b + c) > 0 ? 1 : 0; q[o[0]] += i; q[o[1]] += j; return q; };
        const v = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([i, j]) => corner(i, j));
        const inner = [[o[1], -1], [o[0], 1], [o[1], 1], [o[0], -1]].map(([t, sg]) => { const q = [x, y, z]; q[t] += sg; return exposed(q, d) && cubeCls.get(q.join(',')) === cls; });
        Fc.push({ k: key, v, cube: key, cls, dir: d, inner, exposed: exposed([x, y, z], d) });
        v.forEach((q) => ext.push(q));
      });
    });
  }
  // 棱：给了 E 就用 E（再加上圆柱等自动生成的），没给就从面里取；adj 记每条棱挨着哪些面
  const adj = new Map();
  Fc.forEach((f, fi) => { if (f.cube) return; f.v.forEach((a, i) => { const k = ekey(a, f.v[(i + 1) % f.v.length]); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(fi); }); });
  const E = (p.E || []).map((e) => e.slice(0, 2)), seenE = new Set(E.map(([a, b]) => ekey(a, b)));
  Fc.forEach((f) => { if (f.cube || (p.E && !f.grp && !f.cap)) return; f.v.forEach((a, i) => { const b = f.v[(i + 1) % f.v.length], k = ekey(a, b); if (!seenE.has(k)) { seenE.add(k); E.push([a, b]); } }); });
  const smooth = new Set([...adj].filter(([, L]) => L.length === 2 && Fc[L[0]].grp && Fc[L[0]].grp === Fc[L[1]].grp).map(([k]) => k));
  const real = [...Object.values(V), ...ext];
  const all = [...real, ...Object.values(p.pts || {}), ...(p.balls || []).flatMap((b) => [0, 1, 2].flatMap((i) => [-1, 1].map((sg) => b.c.map((t, j) => t + (j === i ? sg * b.r : 0)))))];
  const empty = !all.length;
  const c = p.center || (empty ? [0, 0, 0] : [0, 1, 2].map((i) => (Math.min(...all.map((q) => q[i])) + Math.max(...all.map((q) => q[i]))) / 2));
  // 判断面朝外用顶点的平均（包围盒中心可能在不对称的立体外面）
  const m = [0, 1, 2].map((i) => real.reduce((s, q) => s + q[i], 0) / (real.length || 1));
  const R = Math.max(...all.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]))) || 1;
  // 凸不凸：每个面的平面都把所有顶点放在同一侧
  const at = (k) => V[k];
  const poly = Fc.filter((f) => !f.cube);
  const used = [...new Set(poly.flatMap((f) => f.v))].map(at);
  const convex = poly.every((f) => { const L = f.v.map(at), nr = newell(L), d0 = vdot(nr, L[0]), tol = 1e-6 * (Math.hypot(...nr) * R + 1); let pos = 0, neg = 0; used.forEach((q) => { const s = vdot(nr, q) - d0; if (s > tol) pos++; else if (s < -tol) neg++; }); return !(pos && neg); });
  // 凹的立体：沿公共棱把面的顶点顺序调成一致，再按体积正负定朝外的方向
  if (!convex) {
    const dirOf = (L) => new Set(L.map((a, i) => `${a}>${L[(i + 1) % L.length]}`));
    const done = new Array(Fc.length).fill(false);
    Fc.forEach((f) => { if (!f.cube) f.vo = f.v.slice(); });
    poly.forEach((f0) => {
      const i0 = Fc.indexOf(f0); if (done[i0]) return; done[i0] = true; const queue = [i0];
      while (queue.length) {
        const fi = queue.shift(), f = Fc[fi];
        f.vo.forEach((a, i) => {
          const b = f.vo[(i + 1) % f.vo.length];
          for (const gj of adj.get(ekey(a, b)) || []) { if (done[gj]) continue; const g2 = Fc[gj]; if (dirOf(g2.vo).has(`${a}>${b}`)) g2.vo.reverse(); done[gj] = true; queue.push(gj); }
        });
      }
    });
    const vol = poly.reduce((s, f) => { const L = f.vo.map(at); let t = 0; for (let i = 1; i + 1 < L.length; i++) t += vdot(L[0], vcross(L[i], L[i + 1])); return s + t; }, 0);
    if (vol < 0) poly.forEach((f) => f.vo.reverse());
  }
  return { V, F: Fc, E, c, m, R, adj, smooth, convex, cubeCls, empty };
}
const SD_CLS = (c) => (c || 'plum').split(' ').map((x) => `sd-${x}`).join(' ');
// 二维凸包（圆柱、圆锥侧面的整体填色）
const hull2 = (P) => {
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
function solid(box, p, api) {
  const M = solidModel(p), vw = p.vw || 360, vh = p.vh || 280;
  const v = varsInit(p.vars), vk = (p.vars || []).map((x) => x.k), keys = [...vk, ...SD_KEYS], dyn = fnc(p.dyn, keys);
  const F = { info: fnc(p.info, keys), goal: fnc(p.goal, keys), tip: fnc(p.tip, keys) };
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  let yaw = p.yaw ?? -35, pitch = p.pitch ?? 22; const sel = new Set(), ever = new Set();
  const envOf = () => ({ ...v, V: M.V, S: [...sel], has: (k) => sel.has(k), n: sel.size, seen: ever.size, yaw: r2((((yaw % 360) + 360) % 360)), pitch: r2(pitch), side: sdSide(yaw, pitch) });
  // dyn 画出来的点也要装进画面：滑块取两端各算一遍
  let R = M.R;
  if (dyn) {
    const vs = (p.vars || []).slice(0, 4); let combos = [{ ...v }];
    vs.forEach((x) => { combos = combos.flatMap((c) => [x.min, (x.min + x.max) / 2, x.max].map((t) => ({ ...c, [x.k]: t }))); });
    const P0 = { ...M.V, ...(p.pts || {}) };
    const allQ = [];
    combos.forEach((c) => {
      const D = run(dyn, { ...envOf(), ...c }, {}) || {}, P1 = { ...P0, ...(D.pts || {}) };
      const qs = [...Object.values(D.pts || {}), ...(D.segs || []).flatMap((s) => [s[0], s[1]]), ...(D.polys || []).flatMap((s) => s[0]), ...(D.curves || []).flatMap((s) => s[0])].map((k) => (Array.isArray(k) ? k : P1[k])).filter((q) => q && q.every(Number.isFinite));
      (D.balls || []).forEach((b) => qs.push(...[0, 1, 2].flatMap((i) => [-1, 1].map((sg) => b.c.map((t, j) => t + (j === i ? sg * b.r : 0))))));
      allQ.push(...qs);
      (D.cubes || []).forEach((cb) => [0, 1].forEach((d) => allQ.push(cb.slice(0, 3).map((t) => +t + d))));
      if (D.round) allQ.push(...Object.values(solidModel({ round: D.round }).V));
    });
    // 没有固定的立体（全靠 dyn 画）时，按 dyn 画出的东西定旋转中心
    if (M.empty && !p.center && allQ.length) { M.c = [0, 1, 2].map((i) => (Math.min(...allQ.map((q) => q[i])) + Math.max(...allQ.map((q) => q[i]))) / 2); R = 0; }
    allQ.forEach((q) => { R = Math.max(R, Math.hypot(q[0] - M.c[0], q[1] - M.c[1], q[2] - M.c[2])); });
    R = R || 1;
  }
  const scale0 = (Math.min(vw, vh) * 0.42 * (p.zoom || 1)) / R;
  const canEx = (p.cubes || /cubes/.test(p.dyn || '')) && (p.explode ?? p.pick === 'cube'); let ex = 0, exT = 0, exAnim = null;
  box.innerHTML = `<svg viewBox="0 0 ${vw} ${vh}" class="lp-sim slsvg sdsvg" xmlns="http://www.w3.org/2000/svg"><g class="sd-g"></g></svg><div class="sl-info"></div>${varsHtml(p.vars, v)}${bar(btn('sd-spin', '转一圈') + btn('sd-home', '复位') + (canEx ? btn('sd-ex', '拆开') : '') + (p.pick ? btn('sd-clear', '清空') : ''))}`;
  const svg = box.querySelector('svg');
  // dyn 返回 round（比如跟着滑块升高的液面圆锥）时按它重建模型，旋转中心不变
  let mKey = null, mLast = null;
  const modelFor = (D) => { const k = JSON.stringify([D.round, D.cubes]); if (k !== mKey) { mKey = k; mLast = solidModel({ ...p, round: [...(p.round || []), ...(D.round || [])], ...(D.cubes ? { cubes: D.cubes } : {}), center: M.c }); } return mLast; };
  const draw = () => {
    const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const env = envOf();
    const D = run(dyn, env, {}) || {};
    const MM = D.round || D.cubes ? modelFor(D) : M, CUBES = !!(p.cubes || D.cubes);
    const PT = { ...MM.V, ...(p.pts || {}), ...(D.pts || {}) };
    // fit: 'live'：按当前画面（含 dyn 画的东西）定中心和缩放，比如展开图折起来后正方体跟着变大
    let C = M.c, scale = scale0 / (1 + ex * 1.2);
    if (p.fit === 'live') {
      const pt0 = (k) => (Array.isArray(k) ? k : PT[k]);
      const Q = [...Object.values(MM.V), ...Object.entries({ ...(p.pts || {}), ...(D.pts || {}) }).filter(([k]) => !k.startsWith('_')).map(([, q]) => q), ...(D.segs || []).flatMap((x) => [x[0], x[1]]), ...(D.polys || []).flatMap((x) => x[0]), ...(D.curves || []).flatMap((x) => x[0]), ...(D.cubes || []).flatMap((cb2) => [0, 1].map((d) => cb2.slice(0, 3).map((t) => +t + d)))].map(pt0).filter((q) => q && q.every(Number.isFinite));
      if (Q.length) {
        C = [0, 1, 2].map((i) => (Math.min(...Q.map((q) => q[i])) + Math.max(...Q.map((q) => q[i]))) / 2);
        const RL = Math.max(...Q.map((q) => Math.hypot(q[0] - C[0], q[1] - C[1], q[2] - C[2]))) || 1;
        scale = (Math.min(vw, vh) * 0.42 * (p.zoom || 1)) / RL;
      }
    }
    // 视线方向（世界坐标）：d 越小越近
    const W = [sa * cb, ca * cb, -sb];
    const proj = (q) => {
      const x = q[0] - C[0], y = q[1] - C[1], z = q[2] - C[2];
      const x1 = x * ca - y * sa, y1 = x * sa + y * ca;
      return [r2(vw / 2 + scale * x1), r2(vh / 2 - scale * (y1 * sb + z * cb)), y1 * cb - z * sb];
    };
    const at = (k) => (Array.isArray(k) ? k : PT[k]);
    const S2 = {}; for (const [k, q] of Object.entries(PT)) S2[k] = proj(q);
    const pr = (k) => (Array.isArray(k) ? proj(k) : S2[k]);
    // 小方块拆开：每块从中心往外挪
    const off = (f) => (f.cube && ex ? f.cube.split(',').map((t, i) => (+t + 0.5 - MM.c[i]) * ex) : null);
    const faces = MM.F.filter((f) => !f.cube || ex > 0 || f.exposed).map((f) => {
      const o = off(f), L = f.v.map((k) => { const q = at(k); return o ? [q[0] + o[0], q[1] + o[1], q[2] + o[2]] : q; });
      const ctr = [0, 1, 2].map((i) => L.reduce((s, q) => s + q[i], 0) / L.length);
      let out;
      if (f.cube) out = FACE_DIRS[f.dir];
      else if (f.vo) out = newell(f.vo.map(at));
      else { const n0 = newell(L), ref = MM.m; out = vdot(n0, vsub(ctr, ref)) < 0 ? n0.map((t) => -t) : n0; }
      const P2 = L.map(proj);
      return { ...f, P2, front: vdot(out, W) < -1e-9 * Math.hypot(...out), depth: proj(ctr)[2], pts: P2.map((q) => `${q[0]},${q[1]}`).join(' ') };
    });
    // 挡线用的面：朝着我们的面，记下屏幕上的多边形和深度平面
    const occ = faces.filter((f) => f.front).map((f) => {
      const P2 = f.P2; let best = null, bn = 0;
      for (let i = 1; i + 1 < P2.length; i++) { const n = vcross(vsub(P2[i], P2[0]), vsub(P2[i + 1], P2[0])); if (Math.abs(n[2]) > bn) { bn = Math.abs(n[2]); best = n; } }
      if (!best || bn < 1e-6) return null;
      const xs = P2.map((q) => q[0]), ys = P2.map((q) => q[1]);
      return { P2, n: best, o: P2[0], bb: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] };
    }).filter(Boolean);
    const eps = 1e-3 * R;
    const onBack = (w) => faces.some((f) => {
      if (f.front) return false;
      const L = f.P2.length ? f.v.map(at) : null; if (!L || L.some((q) => !q)) return false;
      const nr = newell(L), nl = Math.hypot(...nr) || 1; if (Math.abs(vdot(nr, vsub(w, L[0]))) / nl > eps * 5) return false;
      const q = proj(w); let c = false;
      for (let i = 0, j = f.P2.length - 1; i < f.P2.length; j = i++) { const [xi, yi] = f.P2[i], [xj, yj] = f.P2[j]; if ((yi > q[1]) !== (yj > q[1]) && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) c = !c; }
      return c;
    });
    const inside = (P2, x, y) => {
      let c = false, md = Infinity;
      for (let i = 0, j = P2.length - 1; i < P2.length; j = i++) {
        const [xi, yi] = P2[i], [xj, yj] = P2[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        const dx = xj - xi, dy = yj - yi, t = clamp(((x - xi) * dx + (y - yi) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        md = Math.min(md, Math.hypot(x - xi - t * dx, y - yi - t * dy));
      }
      return c && md > 0.8;
    };
    const hidden = (q) => occ.some(({ P2, n, o, bb }) => q[0] > bb[0] && q[0] < bb[1] && q[1] > bb[2] && q[1] < bb[3] && inside(P2, q[0], q[1]) && o[2] - (n[0] * (q[0] - o[0]) + n[1] * (q[1] - o[1])) / n[2] < q[2] - eps);
    // 一条线按是否被挡住切成几段：[[x1, y1, x2, y2, 挡住]]
    const split = (A, B) => {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), N = clamp(Math.ceil(len / 6), 3, 60), out = [];
      const pt = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
      for (let i = 0; i < N; i++) {
        const h = hidden(pt((i + 0.5) / N)), last = out[out.length - 1];
        if (last && last[2] === h) last[1] = (i + 1) / N; else out.push([i / N, (i + 1) / N, h]);
      }
      return out.map(([t0, t1, h]) => { const p0 = pt(t0), p1 = pt(t1); return [r2(p0[0]), r2(p0[1]), r2(p1[0]), r2(p1[1]), h]; });
    };
    const ln = (q, cls) => `<line x1="${q[0]}" y1="${q[1]}" x2="${q[2]}" y2="${q[3]}" class="${cls}"/>`;
    let g = '';
    if (CUBES) {
      faces.filter((f) => f.front).sort((a2, b2) => b2.depth - a2.depth).forEach((f) => {
        const merge = p.grid === false && !ex && f.inner.some(Boolean);
        g += `<polygon points="${f.pts}" class="sd-cf sd-d${Math.floor(f.dir / 2)}${f.cls ? ` cc-${f.cls}` : ''}${merge ? ' nol' : ''}${sel.has(f.cube) ? ` on pk-${p.pick_color || 'plum'}` : ''}" data-k="${f.cube}"/>`;
        if (merge) f.P2.forEach((q, i) => { if (!f.inner[i]) { const r = f.P2[(i + 1) % 4]; g += ln([q[0], q[1], r[0], r[1]], 'sd-ce'); } });
      });
    } else {
      // 面：远的先画，点选时近的在上面；圆柱等的侧面不单独画，整体填一次色
      faces.slice().sort((a2, b2) => b2.depth - a2.depth).forEach((f) => { if (!f.grp) g += `<polygon points="${f.pts}" class="sd-f${f.front ? ' front' : ''}${f.rc ? ` rc-${f.rc}` : ''}${sel.has(f.k) ? ' on' : ''}${p.pick === 'face' && !f.cap ? ' pk' : ''}" data-k="${esc(f.k)}"/>`; });
      [...new Set(faces.filter((f) => f.grp).map((f) => f.grp))].forEach((gp) => { const fs = faces.filter((f) => f.grp === gp), rc = fs[0].rc; g = `<polygon points="${hull2(fs.flatMap((f) => f.P2)).map((q) => `${q[0]},${q[1]}`).join(' ')}" class="sd-f front${rc ? ` rc-${rc}` : ''}"/>` + g; });
      const frontOf = (fi) => faces[fi].front;
      MM.E.forEach(([a2, b2]) => {
        const kk = ekey(a2, b2), k = [a2, b2].sort().join(''), A = S2[a2], B = S2[b2], on = sel.has(k) ? ' on' : '';
        const L = MM.adj.get(kk) || [];
        if (MM.smooth.has(kk)) { if (frontOf(L[0]) !== frontOf(L[1])) g += ln([A[0], A[1], B[0], B[1]], 'sd-e'); return; }
        if (MM.convex || !L.length) {
          const shown = L.length ? L.some(frontOf) : true;
          g += ln([A[0], A[1], B[0], B[1]], `sd-e${shown ? '' : ' hid'}${on}`);
        } else split(A, B).forEach((q) => { g += ln(q, `sd-e${q[4] ? ' hid' : ''}${on}`); });
        if (p.pick === 'edge') g += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" class="sd-eh" data-k="${esc(k)}"/>`;
      });
    }
    const auto = p.hide !== false && occ.length;
    const extra = (L, isPoly) => (L || []).forEach((it) => {
      if (isPoly) {
        const [ks, c] = it, P2 = ks.map(pr); if (P2.some((q) => !q)) return;
        const cls = c || 'plum', noLine = / (noline|dash|solid)\b/.test(` ${cls}`) || !auto;
        g += `<polygon points="${P2.map((q) => `${q[0]},${q[1]}`).join(' ')}" class="sd-x sd-poly ${SD_CLS(cls)}${noLine ? '' : ' sd-noline'}"/>`;
        if (!noLine) P2.forEach((q, i) => split(q, P2[(i + 1) % P2.length]).forEach((s) => { g += ln(s, `sd-x ${SD_CLS(cls.replace(/\bnofill\b/, ''))}${s[4] ? ' sd-hid' : ''}`); }));
        return;
      }
      const [a2, b2, c] = it, A = pr(a2), B = pr(b2); if (!A || !B) return;
      const cls = c || 'plum';
      if (!auto || /\b(dash|solid)\b/.test(cls)) g += ln([A[0], A[1], B[0], B[1]], `sd-x ${SD_CLS(cls)}`);
      else split(A, B).forEach((s) => { g += ln(s, `sd-x ${SD_CLS(cls)}${s[4] ? ' sd-hid' : ''}`); });
    });
    const depthOf = (ks) => { const L = ks.map(pr).filter(Boolean); return L.length ? L.reduce((t, q) => t + q[2], 0) / L.length : 0; };
    extra([...(p.polys || []), ...(D.polys || [])].sort((x, y) => depthOf(y[0]) - depthOf(x[0])), true); extra(p.segs); extra(D.segs);
    for (const [ks, c] of [...(p.curves || []), ...(D.curves || [])]) {
      const P2 = ks.map(pr); if (P2.length < 2 || P2.some((q) => !q)) continue;
      const cls = c || 'plum', fixed = !auto || /\b(dash|solid)\b/.test(cls), runs = [];
      for (let i = 0; i + 1 < P2.length; i++) for (const q of (fixed ? [[P2[i][0], P2[i][1], P2[i + 1][0], P2[i + 1][1], false]] : split(P2[i], P2[i + 1]))) {
        const last = runs[runs.length - 1];
        if (last && last.h === q[4]) last.pts.push(`${q[2]},${q[3]}`); else runs.push({ h: q[4], pts: [`${q[0]},${q[1]}`, `${q[2]},${q[3]}`] });
      }
      runs.forEach((r) => { g += `<polyline points="${r.pts.join(' ')}" class="sd-x ${SD_CLS(cls)}${r.h ? ' sd-hid' : ''}"/>`; });
    }
    for (const bl of [...(p.balls || []), ...(D.balls || [])]) {
      const q = proj(bl.c), cls = SD_CLS(bl.cls || 'ink thin');
      g += `<circle cx="${q[0]}" cy="${q[1]}" r="${r2(bl.r * scale)}" class="sd-x sd-ball ${cls}"/>`;
      if (bl.eq) {
        const ring = Array.from({ length: 73 }, (_, i) => { const t = (2 * Math.PI * i) / 72; return proj([bl.c[0] + bl.r * Math.cos(t), bl.c[1] + bl.r * Math.sin(t), bl.c[2]]); });
        let curv = [], back = null; const flush = () => { if (curv.length > 1) g += `<polyline points="${curv.join(' ')}" class="sd-x sd-ball ${cls}${back ? ' sd-hid' : ''}"/>`; };
        ring.forEach((r) => { const bk = r[2] > q[2] + 1e-9; if (back !== null && bk !== back) { curv.push(`${r[0]},${r[1]}`); flush(); curv = []; } back = bk; curv.push(`${r[0]},${r[1]}`); });
        flush();
      }
    }
    // texts：任意位置写字（面上的数字等），被挡住的变淡
    for (const [k, txt, c] of [...(p.texts || []), ...(D.texts || [])]) {
      const q = pr(k); if (!q) continue;
      const w = at(k), hid = auto && (hidden(q) || (w && onBack(w)));
      if (hid && !p.texts_back) continue;
      g += `<text x="${q[0]}" y="${r2(q[1] + 5)}" font-size="15" text-anchor="middle" class="st sd-t${c ? ' sd-t-' + c : ''}${hid ? ' hid' : ''}">${esc(txt)}</text>`;
    }
    if (!CUBES) {
      const named = Object.keys(PT).filter((k) => !k.startsWith('_'));
      const ctr = proj(C);
      named.forEach((k) => {
        const [x, y] = S2[k]; let dx = x - ctr[0], dy = y - ctr[1]; const L = Math.hypot(dx, dy) || 1; dx = (dx / L) * 13; dy = (dy / L) * 13 || -13;
        const extraPt = !(k in MM.V);
        if (extraPt || p.pick === 'vertex') g += `<circle cx="${x}" cy="${y}" r="${extraPt ? 3.5 : 4}" class="sd-v${sel.has(k) ? ' on' : ''}${extraPt && auto && hidden(S2[k]) ? ' hid' : ''}"/>`;
        if (p.pick === 'vertex' && !extraPt) g += `<circle cx="${x}" cy="${y}" r="14" class="sd-vh" data-k="${esc(k)}"/>`;
        if (extraPt ? p.pt_names !== false : p.labels !== false) g += `<text x="${r2(x + dx)}" y="${r2(y + dy + 5)}" font-size="14" text-anchor="middle" class="st lbl">${esc(k)}</text>`;
      });
    }
    box.querySelector('.sd-g').innerHTML = g;
    box.querySelectorAll('.sl-v').forEach((e) => { e.textContent = H.fmt(v[e.dataset.k]); });
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
    else if (e.target.closest('.sd-ex')) {
      const b = e.target.closest('.sd-ex'); exT = exT ? 0 : 0.7; b.textContent = exT ? '合上' : '拆开';
      if (exAnim) cancelAnimationFrame(exAnim);
      const e0 = ex, t0 = performance.now();
      const stepf = (t) => { if (!box.isConnected) return; const k = Math.min(1, (t - t0) / 400); ex = e0 + (exT - e0) * k; draw(); exAnim = k < 1 ? requestAnimationFrame(stepf) : null; };
      exAnim = requestAnimationFrame(stepf);
    } else if (e.target.closest('.sd-spin')) {
      stopSpin(); const y0 = yaw, t0 = performance.now();
      const stepf = (t) => { if (!box.isConnected) return stopSpin(); const k = Math.min(1, (t - t0) / 4000); yaw = y0 + 360 * k; draw(); spin = k < 1 ? requestAnimationFrame(stepf) : null; };
      spin = requestAnimationFrame(stepf);
    }
  });
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { v[r.dataset.k] = +r.value; draw(); }));
  draw();
}

export const SIMS_HS = { plane, trials, solid };
export const HS_CORE = { planeState, planeKeys, planeFrame, trialsCore, trialFn, solidModel, varsInit, RNG_KEYS, SD_KEYS, sdSide };
