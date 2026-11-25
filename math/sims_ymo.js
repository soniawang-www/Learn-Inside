// 钟面 clockface、一笔画 trace、火柴棒 matches、线段图 tape、天平 balance（接口同 sims.js：(box, p, api)）
// 表达式写法同 slider：只来自后台导入的课程内容。YMO_CORE 里是不碰页面的部分，生成检查脚本也用它。

import { compile, H } from './sims24.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text) => `<button class="lp-ghost ${cls}">${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim slsvg ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
const tex = (el) => { if (el && /\$/.test(el.textContent) && typeof window !== 'undefined' && window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
const fnc = (expr, keys) => (expr ? compile(expr, keys) : null);
const run = (f, v, d) => { if (!f) return d; try { return f(v, H); } catch (e) { return d; } };
const r1 = (x) => Math.round(x * 10) / 10;
const mod = (a, n) => ((a % n) + n) % n;

// ───────── 钟面 ─────────
// { t（初始时间，从 0:00 起的分钟数）, min / max（默认 0～720）, step（分钟，默认 1）, den（分母：den: 11 时按 1/11 分走）,
//   clocks: [{label, off, rate}]（几只钟：显示 off + rate × t；默认一只准钟）, angle: true（画出两针夹角）, h24: true（显示 0～23 时）,
//   drag: false（不能拖指针，只用下面的滑块）, time: false（钟下和滑块旁不显示时刻，免得露答案；show: '表达式' 自定义滑块旁的字）,
//   found: '表达式，返回当前时刻的名字'（记下找到过的，下面列出来；found_show: false 不列），goal 写 'nfound >= 2'，配 solution_seq, play: true（「播放」按钮）, ms, bg / fg（SVG，画在钟下面 / 上面）, info, goal, tip }
// 表达式里：t、h（第一只钟的时，0～11）、m（分，可带小数）、hd / md（时针 / 分针从 12 点顺时针转过的度数）、ang（两针夹角，0～180）、clk（每只钟显示的分钟数）、nfound、seen
const CK_KEYS = ['t', 'h', 'm', 'hd', 'md', 'ang', 'clk', 'nfound', 'seen'];
function ckHands(x) { const y = mod(x, 720), md = mod(x, 60) * 6, hd = y / 2; let a = Math.abs(hd - md) % 360; if (a > 180) a = 360 - a; return { hd, md, ang: r1(a * 1000) / 1000 }; }
function ckEnv(p, t) {
  const cl = p.clocks || [{}], clk = cl.map((c) => (c.off || 0) + (c.rate ?? 1) * t), x = clk[0], hh = ckHands(x);
  return { t, h: Math.floor(mod(x, 720) / 60), m: Math.round(mod(x, 60) * 1e6) / 1e6, hd: hh.hd, md: hh.md, ang: hh.ang, clk, nfound: 0, seen: [] };
}
function ckLabel(x, p) {
  const den = p.den || 1, tot = Math.round(x * den), mm = mod(tot, 60 * den), hr = Math.floor(mod(tot, (p.h24 ? 1440 : 720) * den) / (60 * den));
  const w = Math.floor(mm / den), fr = mm % den, hs = p.h24 ? hr : hr || 12;
  return `${hs}:${String(w).padStart(2, '0')}${fr ? ` 又 ${fr}/${den} 分` : ''}`;
}
function clockface(box, p, api) {
  const cl = p.clocks || [{}], n = cl.length, R = n > 2 ? 70 : 88, cw = 2 * R + 46, vw = p.vw || Math.max(240, cw * n), vh = p.vh || 2 * R + 76;
  const step = p.step || 1, den = p.den || 1, unit = step / den, lo = p.min ?? 0, hi = p.max ?? 720;
  const F = { bg: fnc(p.bg, CK_KEYS), fg: fnc(p.fg, CK_KEYS), info: fnc(p.info, CK_KEYS), goal: typeof p.goal === 'string' ? fnc(p.goal, CK_KEYS) : null, tip: fnc(p.tip, CK_KEYS), found: fnc(p.found, CK_KEYS), show: fnc(p.show, CK_KEYS) };
  const seen = [];
  const ok = once(() => api.solved(p.say_ok));
  let t = p.t ?? lo, raw = t, lastTip = '', timer = null;
  const cxOf = (i) => vw / 2 + (i - (n - 1) / 2) * cw, cy = R + 30;
  box.innerHTML = SVG(vw, vh, '<g class="ck2-g"></g>', 'ck2svg') + '<div class="sl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found ck2-found"></div>' : '') +
    bar(`<span>${esc(p.label || '时间')} <b class="ck2-v"></b></span><input type="range" min="${Math.round(lo / unit)}" max="${Math.round(hi / unit)}" step="1" value="${Math.round(t / unit)}" data-k="t" aria-label="${esc(p.label || '时间')}">`) +
    bar((p.play ? btn('ck2-play', '▶ 播放') : '') + btn('ck2-reset', '重来'));
  if (p.maxw || n === 1) Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw || 320}px`, marginInline: 'auto' });
  const face = (i, x) => {
    const cx = cxOf(i), hh = ckHands(x), pt = (deg, r) => [r1(cx + r * Math.sin(deg * Math.PI / 180)), r1(cy - r * Math.cos(deg * Math.PI / 180))];
    let s = `<circle cx="${cx}" cy="${cy}" r="${R}" class="ck2-face"/>`;
    for (let k = 0; k < 60; k++) { const big = k % 5 === 0, [x1, y1] = pt(k * 6, R - (big ? 9 : 5)), [x2, y2] = pt(k * 6, R - 1); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ck2-tk${big ? ' big' : ''}"/>`; }
    let nums = '';
    for (let k = 1; k <= 12; k++) { const [x1, y1] = pt(k * 30, R - 21); nums += `<text x="${x1}" y="${r1(y1 + 5)}" text-anchor="middle" font-size="${R > 80 ? 14 : 12}" class="st lbl ck2-num">${k}</text>`; }
    let al = '';
    if (p.angle) {
      let a = hh.hd, b = hh.md, d = mod(b - a, 360); if (d > 180) { [a, b] = [b, a]; d = 360 - d; }
      const rr = R * 0.32, [ax, ay] = pt(a, rr), [bx, by] = pt(a + d, rr), [lx, ly] = pt(a + d / 2, rr + 16);
      if (d > 0.5) s += `<path d="M${cx},${cy} L${ax},${ay} A${rr},${rr} 0 0 1 ${bx},${by} Z" class="ck2-arc"/>`;
      if (d > 0.5) al = `<text x="${lx}" y="${r1(ly + 4)}" text-anchor="middle" font-size="12" class="st jade lbl ck2-alab" font-weight="700">${r1(d * 100) / 100}°</text>`;
    }
    const [hx, hy] = pt(hh.hd, R * 0.5), [mx, my] = pt(hh.md, R * 0.78);
    s += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" class="ck2-hh"/><line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" class="ck2-mh"/><circle cx="${cx}" cy="${cy}" r="4" class="ck2-c"/>` + nums + al;
    if (p.drag !== false) s += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" class="ck2-hit" data-i="${i}" data-hand="h"/><line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" class="ck2-hit" data-i="${i}" data-hand="m"/>`;
    const cap = `${cl[i].label ? `${cl[i].label}  ` : ''}${p.time === false ? '' : ckLabel(x, p)}`.trim();
    if (cap) s += `<text x="${cx}" y="${cy + R + 24}" text-anchor="middle" font-size="${n > 1 ? 16 : 15}" class="st lbl" font-weight="700">${esc(cap)}</text>`;
    return s;
  };
  const draw = () => {
    let v = { ...ckEnv(p, t), nfound: seen.length, seen };
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = { ...v, nfound: seen.length }; } }
    const fd = box.querySelector('.ck2-found'); if (fd) fd.innerHTML = `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    box.querySelector('.ck2-g').innerHTML = (run(F.bg, v, '') || '') + cl.map((_, i) => face(i, v.clk[i])).join('') + `<g style="pointer-events:none">${run(F.fg, v, '') || ''}</g>`;
    box.querySelector('.ck2-v').textContent = F.show ? run(F.show, v, '') : p.time === false ? '' : ckLabel(t, p);
    box.querySelector('input[data-k="t"]').value = Math.round(t / unit);
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (F.tip) { const s = run(F.tip, v, ''); if (s && s !== lastTip) { lastTip = s; api.say(s); } }
    if (run(F.goal, v, false)) ok();
  };
  const set = (x) => { t = Math.min(hi, Math.max(lo, Math.round(x / unit) * unit)); t = Math.round(t * 1e6) / 1e6; draw(); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } const b = box.querySelector('.ck2-play'); if (b) b.textContent = '▶ 播放'; };
  box.querySelector('input[data-k="t"]').addEventListener('input', (e) => { stop(); raw = +e.target.value * unit; set(raw); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ck2-reset')) { stop(); raw = p.t ?? lo; set(raw); return; }
    const b = e.target.closest('.ck2-play'); if (!b) return;
    if (timer) return stop();
    if (t >= hi) { t = lo; }
    b.textContent = '❚❚ 暂停';
    timer = setInterval(() => { if (!box.isConnected) return stop(); raw = t + unit; set(raw); if (t >= hi) stop(); }, p.ms || 80);
  });
  // 拖指针：按角度变化累加，转过 12 也能接着走
  let drag = null;
  const angAt = (e, i) => { const svg = box.querySelector('svg'), q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return mod(Math.atan2(q.x - cxOf(i), -(q.y - cy)) * 180 / Math.PI, 360); };
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.ck2-hit'); if (!h) return;
    e.preventDefault(); stop();
    drag = { i: +h.dataset.i, hand: h.dataset.hand, a: angAt(e, +h.dataset.i) }; raw = t;
    box.querySelector('svg').setPointerCapture?.(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const a = angAt(e, drag.i); let d = a - drag.a; if (d > 180) d -= 360; if (d < -180) d += 360; drag.a = a;
    raw += (drag.hand === 'm' ? d / 6 : d * 2) / (cl[drag.i].rate ?? 1);
    raw = Math.min(hi, Math.max(lo, raw)); set(raw);
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  draw();
}

// ───────── 一笔画 ─────────
// { nodes: [{k, x, y, label}], edges: [[a, b]] 或 [a, b, {c: [x, y]}]（c 是弯线的控制点；两点间可以有几条线）,
//   removed: [[a, b], …]（去掉的线，画成虚线、不能走）, strokes（允许几笔，默认 1）, simple: true（同一笔里每个点只能经过一次：最长路线、走遍各点）, start: 'A'（第一笔只能从这个点出发）, deg: true（点旁标出连了几条线）, odd: true（奇点涂色）, vw, vh, bg / fg, info, goal, tip,
//   solution: [k, k, …]（一笔的顺序）或 [[…], […]]（几笔） }
// 点一个点开始，再点相邻的点（或直接点线）沿线走；走过的线不能再走。strokes > 1 时有「抬笔」按钮，或直接点别的点另起一笔。
// 表达式里：used（走过几条）、E（一共几条）、nstroke（用了几笔）、paths（每笔走过的点）、deg（点→连线数）、end（笔尖所在的点）、done（全部走完）、left（点→还没走的线数）、stuck（走进死路：笔尖没线可走但还没走完）
// 走进死路时（没写 tip）自动提示退一步或抬笔
// 不写 goal 时「全部走完，且笔数不超过 strokes」算完成。
const TR_KEYS = ['used', 'E', 'nstroke', 'paths', 'deg', 'end', 'done', 'left', 'stuck'];
function trEdges(p) { return (p.edges || []).map((e, i) => (Array.isArray(e) ? { i, a: String(e[0]), b: String(e[1]), ...(e[2] || {}) } : { i, ...e, a: String(e.a), b: String(e.b) })); }
function trDeg(p) { const d = Object.fromEntries((p.nodes || []).map((q) => [String(q.k), 0])); for (const e of trEdges(p)) { d[e.a]++; d[e.b]++; } return d; }
// 从 st（{strokes: [{nodes, edges}], lift}）出发走到 k：能走就返回新状态，不能走返回提示文字
function trStep(p, st, k, ei = null) {
  const E = trEdges(p), used = new Set(st.strokes.flatMap((s) => s.edges)), cur = st.strokes[st.strokes.length - 1], allow = p.strokes || 1;
  const start = () => (!st.strokes.length && p.start !== undefined && String(p.start) !== k ? `从 ${p.start} 出发。` : st.strokes.length < allow ? { strokes: [...st.strokes, { nodes: [k], edges: [] }], lift: false } : `只能画 ${allow} 笔。`);
  if (!cur || st.lift) return ei !== null ? (() => { const e = E[ei]; const s1 = start(); return typeof s1 === 'string' ? s1 : trStep(p, s1, e.a === k ? e.b : e.a, ei); })() : start();
  const end = cur.nodes[cur.nodes.length - 1];
  const cand = E.filter((e) => !used.has(e.i) && ((e.a === end && e.b === k) || (e.b === end && e.a === k)) && (ei === null || e.i === ei));
  if (cand.length && p.simple && cur.nodes.includes(k)) return '这个点已经经过了，不能再经过。';
  if (cand.length) return { strokes: [...st.strokes.slice(0, -1), { nodes: [...cur.nodes, k], edges: [...cur.edges, cand[0].i] }], lift: false };
  if (k === end) return '笔尖已经在这里了。';
  if (!cur.edges.length) return st.strokes.length === 1 && p.start !== undefined ? `从 ${p.start} 出发。` : { strokes: [...st.strokes.slice(0, -1), { nodes: [k], edges: [] }], lift: false };
  return E.some((e) => (e.a === end && e.b === k) || (e.b === end && e.a === k)) ? '这条线已经走过了，不能再走。' : '笔尖不能离开纸跳过去，要沿着线走。';
}
function trEnv(p, st) {
  const E = trEdges(p).length, used = st.strokes.reduce((t, s) => t + s.edges.length, 0), cur = st.strokes[st.strokes.length - 1];
  const usedSet = new Set(st.strokes.flatMap((s) => s.edges)), left = Object.fromEntries((p.nodes || []).map((q) => [String(q.k), 0]));
  for (const e of trEdges(p)) if (!usedSet.has(e.i)) { left[e.a]++; left[e.b]++; }
  const end = cur && !st.lift ? cur.nodes[cur.nodes.length - 1] : null;
  return { used, E, nstroke: st.strokes.filter((s) => s.edges.length).length, paths: st.strokes.map((s) => s.nodes), deg: trDeg(p), end, done: used === E, left, stuck: !!end && used < E && cur.edges.length > 0 && left[end] === 0 };
}
// 按 solution 走一遍：返回 [状态, 出错提示]
function trRun(p, sol) {
  const seqs = sol && Array.isArray(sol[0]) ? sol : [sol || []];
  let st = { strokes: [], lift: false };
  for (const seq of seqs) {
    if (st.strokes.length) st = { ...st, lift: true };
    for (const k of seq) { const r = trStep(p, st, String(k)); if (typeof r === 'string') return [st, `走到 ${k} 时：${r}`]; st = r; }
  }
  return [st, ''];
}
function trGoal(p, v, F) { return F ? run(F, v, false) : v.done && v.nstroke <= (p.strokes || 1); }
function trace(box, p, api) {
  const nodes = (p.nodes || []).map((q) => ({ ...q, k: String(q.k) })), at = Object.fromEntries(nodes.map((q) => [q.k, q])), E = trEdges(p), deg = trDeg(p);
  const vw = p.vw || 360, vh = p.vh || 240;
  const F = { bg: fnc(p.bg, TR_KEYS), fg: fnc(p.fg, TR_KEYS), info: fnc(p.info, TR_KEYS), goal: typeof p.goal === 'string' ? fnc(p.goal, TR_KEYS) : null, tip: fnc(p.tip, TR_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  let st = { strokes: [], lift: false }, hist = [], lastTip = '';
  box.innerHTML = SVG(vw, vh, '<g class="tr2-g"></g>', 'tr2svg') + '<div class="sl-info"></div>' +
    bar(btn('tr2-undo', '退一步') + ((p.strokes || 1) > 1 ? btn('tr2-lift', '抬笔') : '') + btn('tr2-reset', '重来'));
  if (p.maxw) Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw}px`, marginInline: 'auto' });
  // 度数默认写在点的「空」的一侧：和连出去的线的平均方向相反
  const away = Object.fromEntries(nodes.map((q) => {
    // 8 个方向里挑离连线和点名都最远的
    const dirs = []; for (const e of E) { if (e.a !== q.k && e.b !== q.k) continue; const o = at[e.a === q.k ? e.b : e.a]; dirs.push(Math.atan2((e.c ? e.c[1] : o.y) - q.y, (e.c ? e.c[0] : o.x) - q.x)); }
    const lab = q.label ? [q.lx ?? 0, (q.ly ?? -13) - 5] : null; let best = [13, 17], sc = -1;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8, x = 17 * Math.cos(a), y = 17 * Math.sin(a); let m = Math.min(Math.PI, ...dirs.map((d) => { const t = Math.abs(((a - d + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); return t; })); if (lab) m = Math.min(m, Math.hypot(x - lab[0], y - lab[1]) / 12); if (m > sc) { sc = m; best = [r1(x), r1(y + 4)]; } }
    return [q.k, best];
  }));
  const dOf = (e) => { const A = at[e.a], B = at[e.b]; return e.c ? `M${A.x},${A.y} Q${e.c[0]},${e.c[1]} ${B.x},${B.y}` : `M${A.x},${A.y} L${B.x},${B.y}`; };
  const mid = (e) => { const A = at[e.a], B = at[e.b]; return e.c ? [(A.x + 2 * e.c[0] + B.x) / 4, (A.y + 2 * e.c[1] + B.y) / 4] : [(A.x + B.x) / 2, (A.y + B.y) / 2]; };
  const draw = () => {
    const v = trEnv(p, st), order = new Map(); let n = 0;
    st.strokes.forEach((s, si) => s.edges.forEach((ei) => order.set(ei, [++n, si])));
    let g = run(F.bg, v, '') || '';
    for (const [a, b, c] of p.removed || []) { const A = at[String(a)], B = at[String(b)]; if (A && B) g += `<path d="${c ? `M${A.x},${A.y} Q${c[0]},${c[1]} ${B.x},${B.y}` : `M${A.x},${A.y} L${B.x},${B.y}`}" class="tr2-rm"/>`; }
    for (const e of E) g += `<path d="${dOf(e)}" class="tr2-e${order.has(e.i) ? ` on s${order.get(e.i)[1] % 3}` : ''}"/><path d="${dOf(e)}" class="tr2-hit" data-e="${e.i}"/>`;
    for (const e of E) if (order.has(e.i)) { const [mx, my] = mid(e), sm = Math.hypot(at[e.a].x - at[e.b].x, at[e.a].y - at[e.b].y) < 44 && !e.c, rr = sm ? 6 : 8; g += `<circle cx="${r1(mx)}" cy="${r1(my)}" r="${rr}" class="tr2-no"/><text x="${r1(mx)}" y="${r1(my + (sm ? 3 : 4))}" text-anchor="middle" font-size="${sm ? 8 : 10}" class="st num">${order.get(e.i)[0]}</text>`; }
    for (const q of nodes) {
      const odd = p.odd && deg[q.k] % 2;
      g += `<g class="tr2-n${v.end === q.k ? ' cur' : ''}" data-k="${esc(q.k)}"><circle cx="${q.x}" cy="${q.y}" r="14" class="tr2-hn"/><circle cx="${q.x}" cy="${q.y}" r="${v.end === q.k ? 8 : 6}" class="tr2-d${odd ? ' odd' : ''}"/>` +
        (q.label ? `<text x="${q.x + (q.lx ?? 0)}" y="${q.y + (q.ly ?? -13)}" text-anchor="middle" font-size="14" class="st lbl" font-weight="700">${esc(q.label)}</text>` : '') +
        (p.deg ? `<text x="${q.x + (q.dx ?? away[q.k][0])}" y="${q.y + (q.dy ?? away[q.k][1])}" text-anchor="middle" font-size="12" class="st lbl ${deg[q.k] % 2 ? 'warn' : 'jade'}" font-weight="700">${deg[q.k]}</text>` : '') + '</g>';
    }
    g += `<g style="pointer-events:none">${run(F.fg, v, '') || ''}</g>`;
    box.querySelector('.tr2-g').innerHTML = g;
    const el = box.querySelector('.sl-info');
    el.innerHTML = F.info ? run(F.info, v, '') : `走过 <b>${v.used}</b> / ${v.E} 条线${(p.strokes || 1) > 1 ? `，用了 <b>${v.nstroke}</b> 笔` : ''}`; tex(el);
    const tipNow = F.tip ? run(F.tip, v, '') : v.stuck ? `走到 ${v.end} 没有路了，还剩 ${v.E - v.used} 条线没走。按「退一步」换条路${(p.strokes || 1) > v.nstroke ? '，或者「抬笔」另起一笔' : ''}。` : '';
    if (tipNow && tipNow !== lastTip) { lastTip = tipNow; api.say(tipNow); }
    if (trGoal(p, v, F.goal)) ok();
  };
  const go = (k, ei = null) => { const r = trStep(p, st, k, ei); if (typeof r === 'string') { api.say(r); return; } hist.push(st); st = r; draw(); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tr2-reset')) { st = { strokes: [], lift: false }; hist = []; draw(); return; }
    if (e.target.closest('.tr2-undo')) { if (hist.length) st = hist.pop(); draw(); return; }
    if (e.target.closest('.tr2-lift')) { if (st.strokes.length && st.strokes[st.strokes.length - 1].edges.length) { hist.push(st); st = { ...st, lift: true }; draw(); } return; }
    const nd = e.target.closest('.tr2-n'); if (nd) return go(nd.dataset.k);
    const ed = e.target.closest('.tr2-hit'); if (!ed) return;
    const ed2 = E[+ed.dataset.e], v = trEnv(p, st);
    if (v.end === ed2.a) go(ed2.b, ed2.i); else if (v.end === ed2.b) go(ed2.a, ed2.i); else if (!v.end) go(ed2.a, ed2.i); else api.say('从笔尖所在的点出发，沿相连的线走。');
  });
  draw();
}

// ───────── 火柴棒 ─────────
// count: false 不显示「移动 n 根」（要孩子自己数根数时）；remove 时拿走的位置留虚线
// 算式：{ eq: '6+4=4'（数字 0～9、'_' 空数字位、+ - = ×）, n（移几根，默认 1）, op: 'move'（默认）| 'remove' | 'add', target: '正确算式'（只认这一个）, variants: true（6 / 9 / 7 少一根的写法也认）}
// 自由摆：{ slots: [[x1, y1, x2, y2], …]（所有能放火柴的位置）, on: [序号]（一开始有火柴的，默认全部）, vw, vh }
// 移动：先点一根火柴（拿起），再点空位放下；remove 点火柴拿走；add 点空位添上。「退一步」「重来」。
// 表达式里：S（位置名→有没有火柴）、on（有火柴的位置名数组）、n（已经动了几根）、txt（算式现在的样子，认不出的数字是 ?）、valid（等式成立）、nfound、seen
// 不写 goal 时：算式成立，并且动的根数正好是 n（给了 target 时还要和它一样）。
// solution：move 写 [[从, 到], …]，remove / add 写 [位置名, …]；位置名：算式里第 i 个字的第几根，数字 'a'～'g'（上、右上、右下、下、左下、左上、中），
//   加号 / 减号 'h'（横）'v'（竖），等号 'u' 'd'，乘号 'p' 'q'，写成 '2g'（第 3 个字的中间那根，i 从 0 数）；自由摆就是序号字符串 '0'、'1'…
const MT_KEYS = ['S', 'on', 'n', 'txt', 'valid', 'nfound', 'seen'];
const SEG = { a: [[0, 0], [1, 0]], b: [[1, 0], [1, 1]], c: [[1, 1], [1, 2]], d: [[0, 2], [1, 2]], e: [[0, 1], [0, 2]], f: [[0, 0], [0, 1]], g: [[0, 1], [1, 1]] };
const DIG = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9' };
const DIG_V = { cdefg: '6', abcfg: '9', abcf: '7' };
const OPS = { '+': ['h', 'v'], '-': ['h', 'v'], '=': ['u', 'd'], '×': ['p', 'q'], x: ['p', 'q'] };
function mtLayout(p) {
  if (p.slots) return { slots: p.slots.map((s, i) => ({ id: String(i), seg: s })), on: new Set((p.on || p.slots.map((_, i) => i)).map(String)), vw: p.vw || 360, vh: p.vh || 200, chars: null };
  const L = 30, top = 14, slots = [], on = new Set(), chars = []; let x = 12;
  [...p.eq].forEach((ch, i) => {
    if (/[0-9_]/.test(ch)) {
      const segs = ch === '_' ? '' : Object.keys(DIG).find((k) => DIG[k] === ch);
      for (const s of 'abcdefg') { const [[x1, y1], [x2, y2]] = SEG[s]; slots.push({ id: `${i}${s}`, seg: [x + x1 * L, top + y1 * L, x + x2 * L, top + y2 * L] }); if (segs.includes(s)) on.add(`${i}${s}`); }
      chars.push({ i, type: 'd' }); x += L + 22;
    } else if (OPS[ch]) {
      const cx = x + 14, cy = top + L, a = 15;
      const geo = { h: [cx - a, cy, cx + a, cy], v: [cx, cy - a, cx, cy + a], u: [cx - a, cy - 7, cx + a, cy - 7], d: [cx - a, cy + 7, cx + a, cy + 7], p: [cx - 10, cy - 10, cx + 10, cy + 10], q: [cx - 10, cy + 10, cx + 10, cy - 10] };
      for (const s of OPS[ch]) { slots.push({ id: `${i}${s}`, seg: geo[s] }); if (ch !== '-' || s === 'h') on.add(`${i}${s}`); }
      chars.push({ i, type: ch === '=' ? 'e' : ch === '×' || ch === 'x' ? 'x' : 'o' }); x += 40;
    }
  });
  return { slots, on, vw: p.vw || Math.max(200, x + 4), vh: p.vh || top + 2 * L + 16, chars };
}
function mtText(p, lay, S) {
  if (!lay.chars) return '';
  return lay.chars.map((c) => {
    const has = (s) => S[`${c.i}${s}`];
    if (c.type === 'd') { const k = [...'abcdefg'].filter(has).join(''); return k === '' ? '' : DIG[k] ?? (p.variants ? DIG_V[k] : undefined) ?? '?'; }
    if (c.type === 'o') return has('h') && has('v') ? '+' : has('h') ? '-' : has('v') ? '?' : '';
    if (c.type === 'e') return has('u') && has('d') ? '=' : has('u') || has('d') ? '-' : '';
    return has('p') && has('q') ? '×' : has('p') || has('q') ? '?' : '';
  }).join('');
}
function mtValid(txt) {
  if (!/^[0-9+\-×=]+$/.test(txt) || !txt.includes('=')) return false;
  const val = (s) => {
    if (!/^\d+([+\-×]\d+)*$/.test(s) || /(^|[^\d])0\d/.test(s)) return null;
    const terms = s.split(/(?=[+-])/); let tot = 0;
    for (const t of terms) { const sg = t[0] === '-' ? -1 : 1, body = t.replace(/^[+-]/, ''); tot += sg * body.split('×').reduce((a, b) => a * +b, 1); }
    return tot;
  };
  const vs = txt.split('=').map(val);
  return vs.length >= 2 && vs.every((x) => x !== null && x === vs[0]);
}
function mtEnv(p, lay, S, n, seen = []) {
  const txt = mtText(p, lay, S);
  return { S, on: Object.keys(S).filter((k) => S[k]), n, txt, valid: mtValid(txt), nfound: seen.length, seen };
}
function mtApply(p, lay, S, act) {
  const op = p.op || 'move', T2 = { ...S };
  if (op === 'move') { const [a, b] = act.map(String); if (!T2[a]) return `${a} 上没有火柴`; if (T2[b]) return `${b} 上已经有火柴`; T2[a] = false; T2[b] = true; return T2; }
  const k = String(act); if (!(k in T2)) return `没有位置 ${k}`;
  if (op === 'remove') { if (!T2[k]) return `${k} 上没有火柴`; T2[k] = false; } else { if (T2[k]) return `${k} 上已经有火柴`; T2[k] = true; }
  return T2;
}
function mtInit(lay) { return Object.fromEntries(lay.slots.map((s) => [s.id, lay.on.has(s.id)])); }
function mtGoal(p, v, F) { return F ? run(F, v, false) : !!(v.valid && v.n === (p.n ?? 1) && (!p.target || v.txt === p.target)); }
// 按 solution（或 solution_seq 里每一种，每种都从头摆）走一遍：返回 [环境, 出错提示]
function mtRun(p, sol, seq) {
  const lay = mtLayout(p), seen = [], F = p.found ? compile(p.found, MT_KEYS) : null;
  let v = null;
  for (const acts of [...(seq || []), ...(sol ? [sol] : [])]) {
    let S = mtInit(lay), n = 0;
    for (const a of acts) { const r = mtApply(p, lay, S, a); if (typeof r === 'string') return [null, r]; S = r; n++; if (F) { const nm = run(F, mtEnv(p, lay, S, n, seen), ''); if (nm && !seen.includes(String(nm))) seen.push(String(nm)); } }
    v = mtEnv(p, lay, S, n, seen);
  }
  return [v, ''];
}
function matches(box, p, api) {
  const lay = mtLayout(p), op = p.op || 'move';
  const F = { bg: fnc(p.bg, MT_KEYS), fg: fnc(p.fg, MT_KEYS), info: fnc(p.info, MT_KEYS), goal: typeof p.goal === 'string' ? fnc(p.goal, MT_KEYS) : null, tip: fnc(p.tip, MT_KEYS), found: fnc(p.found, MT_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  let S = mtInit(lay), n = 0, sel = null, hist = [], lastTip = '';
  const seen = [];
  box.innerHTML = SVG(lay.vw, lay.vh, '<g class="mt-g"></g>', 'mtsvg') + '<div class="sl-info"></div>' + (p.found ? '<div class="hk-found mt-found"></div>' : '') +
    bar((p.count === false ? '<b class="mt-n" hidden></b>' : `<span>${op === 'remove' ? '拿走' : op === 'add' ? '添上' : '移动'} <b class="mt-n">0</b> 根</span>`) + btn('mt-undo', '退一步') + btn('mt-reset', '重来'));
  if (p.maxw) Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw}px`, marginInline: 'auto' });
  const stick = (s, cls) => {
    const [x1, y1, x2, y2] = s.seg, L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, sx = r1(x1 + ux * 4), sy = r1(y1 + uy * 4), ex = r1(x2 - ux * 4), ey = r1(y2 - uy * 4);
    return `<g class="mt-s ${cls}" data-k="${s.id}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="mt-hit"/>` +
      (cls === 'off' ? `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" class="mt-slot"/>` : `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" class="mt-wood"/><circle cx="${ex}" cy="${ey}" r="3.2" class="mt-head"/>`) + '</g>';
  };
  const draw = () => {
    let v = mtEnv(p, lay, S, n, seen);
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = mtEnv(p, lay, S, n, seen); } }
    const showSlots = op !== 'remove' && (op === 'add' || sel !== null || p.slots_show !== false);
    box.querySelector('.mt-g').innerHTML = (run(F.bg, v, '') || '') + lay.slots.map((s) => (S[s.id] ? stick(s, sel === s.id ? 'on sel' : 'on') : showSlots || (op === 'remove' && lay.on.has(s.id)) ? stick(s, 'off') : '')).join('') + `<g style="pointer-events:none">${run(F.fg, v, '') || ''}</g>`;
    box.querySelector('.mt-n').textContent = n;
    const el = box.querySelector('.sl-info');
    el.innerHTML = F.info ? run(F.info, v, '') : lay.chars ? `现在是 <b>${esc(v.txt || ' ')}</b>${v.valid ? ' <b class="jade">成立</b>' : v.txt.includes('?') ? '（有认不出的数字）' : ''}` : ''; tex(el);
    if (p.found) box.querySelector('.mt-found').innerHTML = `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (F.tip) { const s = run(F.tip, v, ''); if (s && s !== lastTip) { lastTip = s; api.say(s); } }
    if (mtGoal(p, v, F.goal)) ok();
  };
  const act = (a) => { const r = mtApply(p, lay, S, a); if (typeof r === 'string') return; hist.push([S, n]); S = r; n++; sel = null; draw(); };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.mt-reset')) { S = mtInit(lay); n = 0; sel = null; hist = []; draw(); return; }
    if (e.target.closest('.mt-undo')) { if (hist.length) [S, n] = hist.pop(); sel = null; draw(); return; }
    const g = e.target.closest('.mt-s'); if (!g) return;
    const k = g.dataset.k;
    if (op === 'remove') { if (S[k]) act(k); return; }
    if (op === 'add') { if (!S[k]) act(k); return; }
    if (S[k]) { sel = sel === k ? null : k; draw(); return; }
    if (sel === null) { api.say('先点一根火柴把它拿起来，再点空位放下。'); return; }
    act([sel, k]);
  });
  draw();
}

// ───────── 线段图 ─────────
// { bars: [{label, x0, parts: [{len, text, cls, unit, show, drag}]}]（len / x0 / show 可以是表达式；text 里 {表达式} 会换成算出的数；
//     cls: a 绿、b 粉、c 橙、d 灰、ghost 虚线空格；unit 每隔多长画一道分份线；drag: 'x' 这段的右端能拖，拖动改变量 x）,
//   braces: [{row, from, to 或 parts: [i, j], text, side: 'top' | 'bottom', show}] 或 {rows: [a, b], text}（右边竖着括几行）,
//   marks: [{at, rows, text, cls}]（竖虚线：相遇点、对齐线）, vars: [{k, min, max, step, init, label, unit, values, labels}]（下面的滑块）,
//   max（全长对应多少，默认按变量取值自动算）, vw, labelw, bh（条高）, play: 'k', ms, info, goal, tip, found, found_label, solution: {k: 值} }
// 表达式里：各变量、L（每行的总长）、nfound、seen
const TP_BASE = ['L', 'nfound', 'seen'];
const fmtN = (x) => (typeof x !== 'number' ? String(x ?? '') : Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : String(+x.toFixed(2)));
function tpKeys(p) { return [...(p.vars || []).map((x) => x.k), ...TP_BASE]; }
function tpInit(p) { return Object.fromEntries((p.vars || []).map((x) => [x.k, x.init ?? (x.values ? x.values[0] : x.min)])); }
function tpEval(p) {
  const keys = tpKeys(p), cache = new Map();
  const fn = (e) => { if (!cache.has(e)) cache.set(e, compile(String(e), keys)); return cache.get(e); };
  const ev = (x, v, d = 0) => (x === undefined || x === null ? d : typeof x === 'number' || typeof x === 'boolean' ? x : fn(x)(v, H));
  const txt = (t, v) => String(t ?? '').replace(/\{([^{}]+)\}/g, (_, e) => fmtN(ev(e, v)));
  return { ev, txt };
}
// 每行每段的起止（单位长度），不碰页面；表达式出错直接抛出
function tpLayout(p, vals, E = tpEval(p), seen = []) {
  const v0 = { ...vals, L: [], nfound: seen.length, seen };
  const rows = (p.bars || []).map((b) => {
    let x = +E.ev(b.x0, v0, 0);
    const parts = (b.parts || []).map((q, i) => { const len = Math.max(0, +E.ev(q.len, v0, 0)), on = !!E.ev(q.show, v0, true), o = { i, x0: x, x1: x + len, len, on }; x += len; return o; });
    return { parts, end: x };
  });
  const v = { ...v0, L: rows.map((r) => r.end) };
  rows.forEach((r, ri) => r.parts.forEach((o) => { o.text = E.txt(p.bars[ri].parts[o.i].text, v); }));
  return { rows, v };
}
function tpVals(x) { if (x.values) return x.values; const st = x.step || 1, n = Math.min(4000, Math.round((x.max - x.min) / st)); return Array.from({ length: n + 1 }, (_, i) => +(x.min + i * st).toFixed(6)); }
function tpMax(p, E = tpEval(p)) {
  if (p.max) return p.max;
  const v0 = tpInit(p), tries = [v0];
  for (const x of p.vars || []) { const vs = tpVals(x); tries.push({ ...v0, [x.k]: vs[0] }, { ...v0, [x.k]: vs[vs.length - 1] }); }
  let m = 0; for (const t of tries) { try { for (const r of tpLayout(p, t, E).rows) m = Math.max(m, r.end, ...r.parts.map((o) => o.x1)); } catch (e) { /* 生成检查会报 */ } }
  return m || 1;
}
function brace(x1, x2, y, dir, h = 8) {
  // 横着的大括号：dir = -1 尖朝上，1 尖朝下；y 是括号贴着线段的那一边
  const q = Math.min(6, (x2 - x1) / 4), m = (x1 + x2) / 2, yh = y + dir * h / 2, yt = y + dir * h;
  return `M${r1(x1)},${r1(y)} Q${r1(x1)},${r1(yh)} ${r1(x1 + q)},${r1(yh)} L${r1(m - q)},${r1(yh)} Q${r1(m)},${r1(yh)} ${r1(m)},${r1(yt)} Q${r1(m)},${r1(yh)} ${r1(m + q)},${r1(yh)} L${r1(x2 - q)},${r1(yh)} Q${r1(x2)},${r1(yh)} ${r1(x2)},${r1(y)}`;
}
function vbrace(y1, y2, x, h = 8) {
  const q = Math.min(6, (y2 - y1) / 4), m = (y1 + y2) / 2, xh = x + h / 2, xt = x + h;
  return `M${r1(x)},${r1(y1)} Q${r1(xh)},${r1(y1)} ${r1(xh)},${r1(y1 + q)} L${r1(xh)},${r1(m - q)} Q${r1(xh)},${r1(m)} ${r1(xt)},${r1(m)} Q${r1(xh)},${r1(m)} ${r1(xh)},${r1(m + q)} L${r1(xh)},${r1(y2 - q)} Q${r1(xh)},${r1(y2)} ${r1(x)},${r1(y2)}`;
}
function tape(box, p, api) {
  const E = tpEval(p), keys = tpKeys(p), bars = p.bars || [], braces = p.braces || [], marks = p.marks || [];
  const F = { info: fnc(p.info, keys), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, keys) : null, tip: fnc(p.tip, keys), found: fnc(p.found, keys) };
  const ok = once(() => api.solved(p.say_ok));
  const vals = tpInit(p), seen = [];
  let lastTip = '', timer = null, drag = null;
  const vw = p.vw || 360, BH = p.bh || 26, LW = p.labelw ?? (bars.some((b) => b.label) ? 46 : 8), RW = braces.some((b) => b.rows) ? 64 : 14;
  const MAX = tpMax(p, E), sc = (vw - LW - RW) / MAX, X = (u) => r1(LW + u * sc);
  // 竖向排布：每行上下留出括号的地方
  const hasB = (ri, side) => braces.some((b) => !b.rows && (b.row ?? 0) === ri && (b.side || 'top') === side);
  const markTxt = marks.some((m) => m.text);
  const Y = []; let y = markTxt ? 20 : 6;
  bars.forEach((_, ri) => { y += hasB(ri, 'top') ? 28 : 8; Y.push(y); y += BH + (hasB(ri, 'bottom') ? 28 : 6); });
  const vh = p.vh || y + 6;
  const vk = (p.vars || []);
  const shown = (x, val) => { if (x.values && x.labels) { const i = x.values.findIndex((q) => Math.abs(q - val) < 1e-9); return x.labels[i] ?? fmtN(val); } return fmtN(val); };
  box.innerHTML = SVG(vw, vh, '<g class="tp-g"></g>', 'tpsvg') + '<div class="sl-info"></div>' + (p.found && p.found_show !== false ? '<div class="hk-found sl-found tp-found"></div>' : '') +
    vk.map((x) => bar(`<span>${esc(x.label || x.k)} = <b class="sl-v" data-k="${x.k}"></b>${x.unit ? ` ${esc(x.unit)}` : ''}</span>` + (x.values
      ? `<input type="range" min="0" max="${x.values.length - 1}" step="1" value="0" data-k="${x.k}" data-values="1" aria-label="${esc(x.label || x.k)}">`
      : `<input type="range" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${vals[x.k]}" data-k="${x.k}" aria-label="${esc(x.label || x.k)}">`))).join('') +
    (p.play || vk.length ? bar((p.play ? btn('tp-play', '▶ 播放') : '') + btn('tp-reset', '重来')) : '');
  if (p.maxw) Object.assign(box.querySelector('svg').style, { maxWidth: `${p.maxw}px`, marginInline: 'auto' });
  const draw = () => {
    let L; try { L = tpLayout(p, vals, E, seen); } catch (e) { return; }
    let v = L.v;
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = { ...v, nfound: seen.length, seen }; } }
    let s = '';
    L.rows.forEach((r, ri) => {
      const b = bars[ri], yy = Y[ri];
      if (b.label) s += `<text x="${LW - 8}" y="${r1(yy + BH / 2 + 5)}" text-anchor="end" font-size="14" class="st lbl" font-weight="700">${esc(E.txt(b.label, v))}</text>`;
      for (const o of r.parts) {
        if (!o.on || o.len <= 0) continue;
        const q = b.parts[o.i], x1 = X(o.x0), x2 = X(o.x1), w = r1(x2 - x1);
        s += `<rect x="${x1}" y="${yy}" width="${w}" height="${BH}" class="tp-p c-${esc(E.txt(q.cls || 'a', v))}"/>`;
        const u = +E.ev(q.unit, v, 0);
        if (u > 0 && o.len / u <= 60) for (let k = 1; k * u < o.len - 1e-9; k++) s += `<line x1="${X(o.x0 + k * u)}" y1="${yy}" x2="${X(o.x0 + k * u)}" y2="${yy + BH}" class="tp-u"/>`;
        if (o.text && w >= Math.min(16, o.text.length * 7)) s += `<text x="${r1((x1 + x2) / 2)}" y="${r1(yy + BH / 2 + 4.5)}" text-anchor="middle" font-size="13" class="st lbl tp-t">${esc(o.text)}</text>`;
      }
      for (const o of r.parts) {
        const q = b.parts[o.i]; if (!q.drag || !o.on) continue;
        const hx = X(o.x1);
        s += `<line x1="${hx}" y1="${yy - 4}" x2="${hx}" y2="${yy + BH + 4}" class="tp-h"/><circle cx="${hx}" cy="${r1(yy + BH / 2)}" r="7" class="tp-hd"/>` +
          `<rect x="${r1(hx - 14)}" y="${yy - 8}" width="28" height="${BH + 16}" class="tp-hit" data-r="${ri}" data-i="${o.i}" data-k="${esc(q.drag)}"/>`;
      }
    });
    for (const bz of braces) {
      if (!E.ev(bz.show, v, true)) continue;
      const t = E.txt(bz.text, v);
      if (bz.rows) {
        const [a, c] = bz.rows, x = X(Math.max(...bz.rows.map((ri) => L.rows[ri]?.end ?? 0))) + 4, y1 = Y[a], y2 = Y[c] + BH;
        s += `<path d="${vbrace(y1, y2, x)}" class="tp-br"/><text x="${x + 12}" y="${r1((y1 + y2) / 2 + 4.5)}" font-size="13" class="st lbl tp-bt">${esc(t)}</text>`;
        continue;
      }
      const ri = bz.row ?? 0, r = L.rows[ri]; if (!r) continue;
      let a, c;
      if (bz.parts) { a = r.parts[bz.parts[0]]?.x0; c = r.parts[bz.parts[1] ?? bz.parts[0]]?.x1; } else { a = +E.ev(bz.from, v, 0); c = +E.ev(bz.to, v, r.end); }
      if (a === undefined || c === undefined || c - a <= 0) continue;
      const top = (bz.side || 'top') === 'top', yy = top ? Y[ri] - 3 : Y[ri] + BH + 3, x1 = X(a), x2 = X(c);
      s += `<path d="${brace(x1, x2, yy, top ? -1 : 1)}" class="tp-br"/><text x="${r1((x1 + x2) / 2)}" y="${top ? yy - 13 : yy + 22}" text-anchor="middle" font-size="13" class="st lbl tp-bt">${esc(t)}</text>`;
    }
    for (const m of marks) {
      if (!E.ev(m.show, v, true)) continue;
      const rs = m.rows || bars.map((_, i) => i), x = X(+E.ev(m.at, v, 0)), y1 = Y[Math.min(...rs)] - 6, y2 = Y[Math.max(...rs)] + BH + 6;
      s += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="tp-m ${esc(m.cls || '')}"/>`;
      if (m.text) s += `<text x="${x}" y="${y1 - 4}" text-anchor="middle" font-size="12" class="st lbl tp-mt">${esc(E.txt(m.text, v))}</text>`;
    }
    box.querySelector('.tp-g').innerHTML = s;
    vk.forEach((x) => { box.querySelector(`.sl-v[data-k="${x.k}"]`).textContent = shown(x, vals[x.k]); const r = box.querySelector(`input[data-k="${x.k}"]`); r.value = x.values ? Math.max(0, x.values.findIndex((q) => Math.abs(q - vals[x.k]) < 1e-9)) : vals[x.k]; });
    const fd = box.querySelector('.tp-found'); if (fd) fd.innerHTML = `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, v, false)) ok();
  };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } const b = box.querySelector('.tp-play'); if (b) b.textContent = '▶ 播放'; };
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { stop(); const x = vk.find((q) => q.k === r.dataset.k); vals[x.k] = x.values ? x.values[+r.value] : +r.value; draw(); }));
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tp-reset')) { stop(); Object.assign(vals, tpInit(p)); draw(); return; }
    const b = e.target.closest('.tp-play'); if (!b) return;
    if (timer) return stop();
    const x = vk.find((q) => q.k === p.play); if (!x) return;
    const vs = tpVals(x); if (vals[x.k] >= vs[vs.length - 1]) vals[x.k] = vs[0];
    b.textContent = '❚❚ 暂停';
    timer = setInterval(() => { if (!box.isConnected) return stop(); const i = vs.findIndex((q) => q > vals[x.k] + 1e-9); if (i < 0) return stop(); vals[x.k] = vs[i]; draw(); if (i === vs.length - 1) stop(); }, p.ms || 120);
  });
  // 拖段的右端：在变量的所有取值里找右端最接近手指的那个
  const ux = (e) => { const svg = box.querySelector('svg'), q = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return (q.x - LW) / sc; };
  box.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.tp-hit'); if (!h) return;
    const x = vk.find((q) => q.k === h.dataset.k); if (!x) return;
    e.preventDefault(); stop(); drag = { r: +h.dataset.r, i: +h.dataset.i, x, vs: tpVals(x) };
    box.querySelector('svg').setPointerCapture?.(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const want = ux(e); let best = vals[drag.x.k], bd = Infinity;
    for (const val of drag.vs) { let o; try { o = tpLayout(p, { ...vals, [drag.x.k]: val }, E).rows[drag.r].parts[drag.i]; } catch (er) { continue; } const d = Math.abs(o.x1 - want); if (d < bd - 1e-9) { bd = d; best = val; } }
    if (best !== vals[drag.x.k]) { vals[drag.x.k] = best; draw(); }
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  draw();
}

// ───────── 天平 ─────────
// { items: [{k, label（物体上的字，1～2 个字）, name（说话用的名字）, w（真实重量，不显示）, cls: a/b/c/d, shape: circle/square/tri/weight}],
//   left / right: {k: 个数}（一开始盘里有的）, tray: [k, …]（下面能往盘里放的，默认全部；tray: false 不能放）, remove: false（不能点盘里的拿走）,
//   subs: [{from: {k: n}, to: {k: n}, label, pan: 'L' | 'R'}]（「等量代换」按钮：把一边盘里的 from 换成 to）, both: true（两边都有同一种时出现「两边各拿走 1 个」）,
//   given: [{left, right}]（上面画几架已知的小天平）, show_w: true（盘下写总重）, max（每盘最多几个，默认 16）, info, goal, tip, found, solution: ['L+A', 'R-B', 'sub:0', 'both:A', …] }
// 表达式里：L / R（盘里 k→个数）、wl / wr（两边总重）、bal（平衡）、tilt（-1 左沉、0 平、1 右沉）、nl / nr（个数）、ops（操作了几步）、nfound、seen
const BL_KEYS = ['L', 'R', 'wl', 'wr', 'bal', 'tilt', 'nl', 'nr', 'ops', 'nfound', 'seen'];
const cnt = (o) => Object.values(o).reduce((a, b) => a + b, 0);
function blW(p, o) { const W = Object.fromEntries((p.items || []).map((it) => [String(it.k), +it.w || 0])); return Object.entries(o).reduce((a, [k, n]) => a + (W[k] || 0) * n, 0); }
function blInit(p) { const cl = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, n]) => n > 0).map(([k, n]) => [String(k), n])); return { L: cl(p.left), R: cl(p.right), ops: 0 }; }
function blEnv(p, st, seen = []) {
  const wl = blW(p, st.L), wr = blW(p, st.R), d = wr - wl, tilt = Math.abs(d) < 1e-9 ? 0 : Math.sign(d);
  return { L: { ...st.L }, R: { ...st.R }, wl, wr, bal: tilt === 0, tilt, nl: cnt(st.L), nr: cnt(st.R), ops: st.ops, nfound: seen.length, seen };
}
const blName = (p, k) => { const it = (p.items || []).find((q) => String(q.k) === k); return it ? it.name || it.label || k : k; };
function blApply(p, st, a) {
  const S = { L: { ...st.L }, R: { ...st.R }, ops: st.ops + 1 }, max = p.max || 16, ks = (p.items || []).map((q) => String(q.k));
  let m = /^([LR])([+-])(.+)$/.exec(a);
  if (m) {
    const [, side, op, k] = m; if (!ks.includes(k)) return `没有 ${k} 这种东西`;
    if (op === '+') { if (cnt(S[side]) >= max) return '盘里放不下了'; S[side][k] = (S[side][k] || 0) + 1; } else { if (!S[side][k]) return `${side === 'L' ? '左' : '右'}盘里没有${blName(p, k)}`; if (--S[side][k] === 0) delete S[side][k]; }
    return S;
  }
  if ((m = /^both:(.+)$/.exec(a))) { const k = m[1]; if (!S.L[k] || !S.R[k]) return `两边不是都有${blName(p, k)}`; for (const side of ['L', 'R']) if (--S[side][k] === 0) delete S[side][k]; return S; }
  if ((m = /^sub:(\d+)$/.exec(a))) {
    const sb = (p.subs || [])[+m[1]]; if (!sb) return '没有这个代换';
    const has = (side) => Object.entries(sb.from).every(([k, n]) => (S[side][String(k)] || 0) >= n);
    const side = sb.pan || (has('L') ? 'L' : has('R') ? 'R' : null);
    if (!side || !has(side)) return '盘里凑不齐要换掉的东西';
    for (const [k, n] of Object.entries(sb.from)) { S[side][k] -= n; if (!S[side][k]) delete S[side][k]; }
    for (const [k, n] of Object.entries(sb.to)) S[side][k] = (S[side][k] || 0) + n;
    if (cnt(S[side]) > max) return '盘里放不下了';
    return S;
  }
  return `不认识的操作 ${a}`;
}
function blRun(p, sol) { let st = blInit(p); for (const a of sol || []) { const r = blApply(p, st, a); if (typeof r === 'string') return [st, `${a}：${r}`]; st = r; } return [st, null]; }
const BL_SHAPE = (it, x, y, R) => {
  const c = `bl-k c-${esc(it.cls || 'a')}`;
  if (it.shape === 'square') return `<rect x="${r1(x - R)}" y="${r1(y - R)}" width="${2 * R}" height="${2 * R}" rx="3" class="${c}"/>`;
  if (it.shape === 'tri') return `<path d="M${r1(x)},${r1(y - R * 1.1)} L${r1(x + R * 1.05)},${r1(y + R * 0.9)} L${r1(x - R * 1.05)},${r1(y + R * 0.9)} Z" class="${c}"/>`;
  if (it.shape === 'weight') return `<path d="M${r1(x - R * 0.6)},${r1(y - R)} L${r1(x + R * 0.6)},${r1(y - R)} L${r1(x + R)},${r1(y + R)} L${r1(x - R)},${r1(y + R)} Z" class="bl-k bl-wt"/>`;
  return `<circle cx="${x}" cy="${y}" r="${R}" class="${c}"/>`;
};
// 画一架天平（不带外层 svg）：中心 cx，支点高 py；act 为真时盘里的东西能点
function blDraw(p, st, cx, py, act) {
  const env = blEnv(p, st), Lb = 118, S = 84, deg = env.tilt === 0 ? 0 : env.tilt * Math.min(11, 5 + 6 * Math.abs(env.wr - env.wl) / Math.max(env.wl, env.wr, 1e-9));
  const rad = deg * Math.PI / 180, ex = Lb * Math.cos(rad), ey = Lb * Math.sin(rad), ground = py + S + 38;
  let s = `<path d="M${cx},${py} L${cx - 26},${ground} L${cx + 26},${ground} Z" class="bl-post"/><line x1="${cx - 70}" y1="${ground}" x2="${cx + 70}" y2="${ground}" class="bl-base"/>`;
  const its = Object.fromEntries((p.items || []).map((it) => [String(it.k), it]));
  for (const [side, sx, sy] of [['L', cx - ex, py - ey], ['R', cx + ex, py + ey]]) {
    const pw = 56, panY = sy + S;
    s += `<line x1="${r1(sx)}" y1="${r1(sy)}" x2="${r1(sx - pw)}" y2="${r1(panY)}" class="bl-str"/><line x1="${r1(sx)}" y1="${r1(sy)}" x2="${r1(sx + pw)}" y2="${r1(panY)}" class="bl-str"/>`;
    s += `<path d="M${r1(sx - pw - 4)},${r1(panY)} Q${r1(sx)},${r1(panY + 16)} ${r1(sx + pw + 4)},${r1(panY)} Z" class="bl-pan"/>`;
    const list = []; for (const [k, n] of Object.entries(st[side])) for (let i = 0; i < n; i++) list.push(k);
    const N = list.length, per = N > 12 ? 6 : 4, R = N > 12 ? 8 : 10.5, gap = 2 * R + 3;
    list.forEach((k, i) => {
      const row = Math.floor(i / per), inRow = Math.min(per, N - row * per), col = i % per, x = r1(sx + (col - (inRow - 1) / 2) * gap), y = r1(panY - R - 1 - row * (2 * R + 2));
      const it = its[k] || { k }, lab = it.label ?? k;
      s += `<g class="${act && p.remove !== false ? 'bl-act bl-tok' : ''}" data-a="${side}-${esc(k)}">${BL_SHAPE(it, x, y, R)}<text x="${x}" y="${r1(y + (it.shape === 'tri' ? 6 : 4.5))}" text-anchor="middle" font-size="${R > 9 ? (String(lab).length > 1 ? 10 : 12) : 9}" class="bl-kt" font-weight="700">${esc(lab)}</text></g>`;
    });
    if (p.show_w) s += `<text x="${r1(sx)}" y="${r1(panY + 30)}" text-anchor="middle" font-size="13" class="st lbl">${fmtN(side === 'L' ? env.wl : env.wr)}</text>`;
  }
  s += `<line x1="${r1(cx - ex)}" y1="${r1(py - ey)}" x2="${r1(cx + ex)}" y2="${r1(py + ey)}" class="bl-beam"/><circle cx="${cx}" cy="${py}" r="5" class="bl-piv"/>`;
  return s;
}
function balance(box, p, api) {
  const F = { info: fnc(p.info, BL_KEYS), goal: typeof p.goal === 'string' && p.goal ? fnc(p.goal, BL_KEYS) : null, tip: fnc(p.tip, BL_KEYS), found: fnc(p.found, BL_KEYS) };
  const ok = once(() => api.solved(p.say_ok));
  const items = p.items || [], tray = p.tray === false ? [] : (p.tray || items.map((it) => it.k)).map(String), seen = [];
  let st = blInit(p), hist = [], lastTip = '';
  const VW = 360, VH = 180;
  const chip = (it) => `<svg viewBox="-13 -13 26 26" class="bl-chip">${BL_SHAPE(it, 0, 0, 11)}<text x="0" y="${it.shape === 'tri' ? 6 : 4.5}" text-anchor="middle" font-size="${String(it.label ?? it.k).length > 1 ? 10 : 12}" class="bl-kt" font-weight="700">${esc(it.label ?? it.k)}</text></svg>`;
  const chipsOf = (o) => Object.entries(o || {}).flatMap(([k, n]) => Array(n).fill(k)).map((k) => chip(items.find((q) => String(q.k) === String(k)) || { k })).join('');
  const given = (p.given || []).map((g) => `<span class="bl-eq">${chipsOf(g.left)}<b>=</b>${chipsOf(g.right)}</span>`).join('');
  box.innerHTML = (given ? `<div class="bl-given">${given}</div>` : '') + SVG(VW, VH, '<g class="bl-g"></g>', 'blsvg bl-main') + '<div class="sl-info"></div>' +
    (p.found && p.found_show !== false ? '<div class="hk-found sl-found bl-found"></div>' : '') +
    (tray.length ? `<div class="bl-tray">${tray.map((k) => { const it = items.find((q) => String(q.k) === k) || { k }; return `<span class="bl-ti">${chip(it)}<b>${esc(it.name || it.label || k)}</b>${btn('bl-act', '放左边').replace('<button', `<button data-a="L+${esc(k)}"`)}${btn('bl-act', '放右边').replace('<button', `<button data-a="R+${esc(k)}"`)}</span>`; }).join('')}</div>` : '') +
    `<div class="lp-gbar bl-ops"></div>`;
  Object.assign(box.querySelector('.bl-main').style, { maxWidth: `${p.maxw || 340}px`, marginInline: 'auto' });
  const desc = (o) => Object.entries(o).map(([k, n]) => `${esc(blName(p, k))}×${n}`).join('、') || '空';
  const draw = () => {
    let v = blEnv(p, st, seen);
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = blEnv(p, st, seen); } }
    box.querySelector('.bl-g').innerHTML = blDraw(p, st, VW / 2, 30, true);
    const el = box.querySelector('.sl-info');
    el.innerHTML = F.info ? run(F.info, v, '') : `左边 ${desc(st.L)}　右边 ${desc(st.R)}　<b class="${v.bal ? 'jade' : ''}">${v.bal ? '平衡' : v.tilt < 0 ? '左边重' : '右边重'}</b>`; tex(el);
    const subs = (p.subs || []).map((sb, i) => (typeof blApply(p, st, `sub:${i}`) === 'string' ? '' : `<button class="lp-ghost bl-act" data-a="sub:${i}">${esc(sb.label || '代换')}</button>`)).join('');
    const both = p.both ? Object.keys(st.L).filter((k) => st.R[k]).map((k) => `<button class="lp-ghost bl-act" data-a="both:${esc(k)}">两边各拿走 1 个${esc(blName(p, k))}</button>`).join('') : '';
    box.querySelector('.bl-ops').innerHTML = subs + both + btn('bl-undo', '退一步') + btn('bl-reset', '重来');
    const fd = box.querySelector('.bl-found'); if (fd) fd.innerHTML = `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (F.tip) { const t = run(F.tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, v, false)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.bl-reset')) { st = blInit(p); hist = []; draw(); return; }
    if (e.target.closest('.bl-undo')) { if (hist.length) st = hist.pop(); draw(); return; }
    const a = e.target.closest('.bl-act'); if (!a) return;
    const r = blApply(p, st, a.dataset.a); if (typeof r === 'string') { api.say(r + '。'); return; }
    hist.push(st); st = r; draw();
  });
  draw();
}

export const SIMS_YMO = { clockface, trace, matches, tape, balance };
export const YMO_CORE = { CK_KEYS, ckEnv, ckLabel, TR_KEYS, trEdges, trRun, trEnv, trGoal, MT_KEYS, mtLayout, mtRun, mtGoal, mtText, mtValid, TP_BASE, tpKeys, tpInit, tpEval, tpLayout, tpVals, BL_KEYS, blInit, blEnv, blApply, blRun };
