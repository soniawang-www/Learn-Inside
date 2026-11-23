// 思维 100 互动解析用到的通用组件（接口同 sims.js：(box, p, api)）

import { compile, H } from './sims24.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text, extra = '') => `<button class="lp-ghost ${cls}" ${extra}>${text}</button>`;
const SVG = (w, h, body, cls = '', cap = 0) => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim ${cls}"${cap ? ` style="max-width:${Math.round(w * cap)}px"` : ''} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };

// ── 取石子博弈：孩子当先手，电脑当后手且按最优策略走 ──
// { ns: [可选的起始石子数], a: [先手每次能拿的数], b: [后手每次能拿的数], names: ['小明', '小红'], games: 完成需要下几盘（默认 2） }
// 谁拿到最后一颗谁赢。电脑每步都会说一句它为什么这样拿（如果给了 why_b：'剩下 {r}，不是 3 的幂'之类模板，{r} 换成剩余数）。
function takeaway(box, p, api) {
  const A = p.a, B = p.b, names = p.names || ['你', '电脑'];
  const memo = new Map();
  // win(n, t)：轮到 t（0 先手 / 1 后手）面对 n 颗时，先手能不能赢
  const win = (n, t) => {
    const key = n * 2 + t; if (memo.has(key)) return memo.get(key);
    const mv = (t ? B : A).filter((m) => m <= n);
    const r = t ? mv.every((m) => m !== n && win(n - m, 0)) : mv.some((m) => m === n || win(n - m, 1));
    memo.set(key, r); return r;
  };
  let n = null, left = 0, log = [], over = false, games = 0;
  const need = p.games || 2;
  const ok = once(() => api.solved(p.say_ok));
  const pile = (k) => {
    const shown = Math.min(k, 60), per = 15, s = 22;
    let out = '';
    for (let i = 0; i < shown; i++) out += `<circle cx="${20 + (i % per) * s}" cy="${20 + Math.floor(i / per) * s}" r="8" style="fill:var(--lp-jade);opacity:.85"/>`;
    if (k > shown) out += `<text x="${20 + per * s}" y="${20 + 3 * s}" text-anchor="end" font-size="14" class="st">…共 ${k} 颗</text>`;
    return SVG(20 + per * s, Math.max(44, 20 + Math.ceil(shown / per) * s), out);
  };
  const paint = () => { paint0(); const lg = box.querySelector('.tk-log'); if (lg) lg.scrollTop = lg.scrollHeight; };
  const paint0 = () => {
    if (n === null) {
      box.innerHTML = `<div class="tk-pick"><p>${esc(p.pick || '先选一堆石子的颗数，你先拿：')}</p>${bar(p.ns.map((x) => btn('tk-n', x, `data-n="${x}"`)).join(''))}</div>`;
      return;
    }
    const mv = A.filter((m) => m <= left);
    box.innerHTML = `<div class="tk"><div class="tk-left">还剩 <b>${left}</b> 颗</div>${pile(left)}
      <div class="tk-log">${log.map((x) => `<div>${x}</div>`).join('')}</div>
      ${over ? bar(btn('tk-again', '再来一盘')) : `<div class="tk-moves"><span>${esc(names[0])}拿：</span>${mv.map((m) => btn('tk-m', m, `data-m="${m}"`)).join('')}</div>`}</div>`;
  };
  const end = (who) => {
    over = true; games++;
    log.push(`<b class="${who ? 'plum' : ''}">${esc(names[who])}拿到最后一颗，${esc(names[who])}赢了。</b>`);
    if (games >= need) ok(); else api.say(who ? `${names[1]}赢了。换一个数再试试？` : `${names[0]}赢了！换一个数再试试？`);
  };
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('tk-n')) { n = +t.dataset.n; left = n; log = []; over = false; paint(); return; }
    if (t.classList.contains('tk-again')) { n = null; paint(); return; }
    if (t.classList.contains('tk-m') && !over) {
      const m = +t.dataset.m; left -= m; log.push(`${esc(names[0])}拿 ${m} 颗，剩 ${left}`);
      if (left === 0) { end(0); paint(); return; }
      // 电脑：能赢就拿走全部，否则找一步让先手必输的；找不到就拿最少的
      const mv = B.filter((x) => x <= left);
      const c = mv.find((x) => x === left) ?? mv.find((x) => !win(left - x, 0)) ?? mv[0];
      left -= c;
      log.push(`${esc(names[1])}拿 ${c} 颗，剩 ${left}${p.why_b && left ? `<span class="muted">（${esc(p.why_b.replace('{r}', left))}）</span>` : ''}`);
      if (left === 0) end(1);
      paint();
    }
  });
  paint();
}

// ── 点阵连线：依次点圆点画一条路径，每个点用一次；线段不能跨过还没用过的点 ──
// { pts: [[x, y]...]（格子坐标）, cell, need: 要找到几条不同的合格路径（默认 3）, total: 一共有几条（只显示）,
//   jump: true 时允许跨过已经用过的点（手机解锁的规则）；默认跨过任何点都不行 }
function dotpath(box, p, api) {
  const c = p.cell || 70, pad = 30, pts = p.pts;
  const W = pad * 2 + Math.max(...pts.map((q) => q[0])) * c, H = pad * 2 + Math.max(...pts.map((q) => q[1])) * c;
  const X = (i) => pad + pts[i][0] * c, Y = (i) => pad + pts[i][1] * c;
  let path = [], found = new Set(), msg = '';
  const ok = once(() => api.solved(p.say_ok));
  const between = (a, b) => pts.map((_, k) => k).filter((k) => k !== a && k !== b && (() => {
    const [x1, y1] = pts[a], [x2, y2] = pts[b], [x, y] = pts[k];
    return (x - x1) * (y2 - y1) === (y - y1) * (x2 - x1) && Math.min(x1, x2) <= x && x <= Math.max(x1, x2) && Math.min(y1, y2) <= y && y <= Math.max(y1, y2);
  })());
  const paint = () => {
    let s = '';
    for (let i = 1; i < path.length; i++) s += `<line x1="${X(path[i - 1])}" y1="${Y(path[i - 1])}" x2="${X(path[i])}" y2="${Y(path[i])}" style="stroke:var(--lp-plum)" stroke-width="7" stroke-linecap="round"/>`;
    pts.forEach((_, i) => {
      const k = path.indexOf(i);
      s += `<g class="dp-p" data-i="${i}" style="cursor:pointer"><circle cx="${X(i)}" cy="${Y(i)}" r="20" style="fill:${k >= 0 ? 'var(--lp-plum-soft)' : 'var(--lp-jade-soft)'};stroke:${k >= 0 ? 'var(--lp-plum)' : 'var(--lp-jade)'}" stroke-width="2.5"/>
        <text x="${X(i)}" y="${Y(i) + 5}" text-anchor="middle" font-size="15" class="st">${k >= 0 ? k + 1 : ''}</text></g>`;
    });
    box.innerHTML = SVG(W, H, s) + `<div class="sl-info">${msg}</div>` +
      `<div class="hk-found">找到的合格路径：${found.size}${p.total ? ` / ${p.total}` : ''} 条</div>` + bar(btn('dp-undo', '退一步') + btn('dp-reset', '重画'));
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.dp-reset')) { path = []; msg = ''; paint(); return; }
    if (e.target.closest('.dp-undo')) { path.pop(); msg = ''; paint(); return; }
    const g = e.target.closest('.dp-p'); if (!g) return;
    const i = +g.dataset.i;
    if (path.includes(i)) { msg = '这个点已经用过了。'; paint(); return; }
    if (path.length) {
      const mid = between(path[path.length - 1], i).filter((k) => !(p.jump && path.includes(k)));
      if (mid.length) { msg = `<b class="plum">不行</b>：这条线会从中间的点上跨过去。`; api.say('线段跨过了中间的点，这个点就被“经过”了，不合规则。'); paint(); return; }
    }
    path.push(i); msg = '';
    if (path.length === pts.length) {
      const key = path.join('-');
      if (found.has(key)) msg = '这条路径已经画过了，换一条。';
      else { found.add(key); msg = `合格！这是第 ${found.size} 条。`; }
      setTimeout(() => { path = []; paint(); if (found.size >= (p.need || 3)) ok(); }, 700);
    }
    paint();
  });
  paint();
}


// ───────── 通用表达式：和 slider 一样的写法，可用 T、fmt、gcd、min、max… ─────────
const tex = (el) => { if (el && /\$/.test(el.textContent) && window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const fn = (expr, keys) => (expr ? compile(expr, keys) : null);
const run = (f, v, dflt) => { if (!f) return dflt; try { return f(v, H); } catch (e) { return dflt; } };
const COLORS = { card: 'var(--lp-card)', jade: 'var(--lp-jade)', plum: 'var(--lp-plum)', ink: 'var(--lp-ink)', soft: 'var(--lp-soft)', warn: 'var(--lp-warn)', jsoft: 'var(--lp-jade-soft)', psoft: 'var(--lp-plum-soft)', line: 'var(--lp-line)' };
const col = (c) => (c === 'none' ? 'transparent' : COLORS[c] || c || 'var(--lp-card)'); // 'none'：不画填充（颜色自己在 bg 里按 on() 画）

// ── 开关格：点一下在几种状态间切换（真话/假话、黑/白、左/右、选/不选） ──
// { items: [{k, x, y, w, h, r, label}]（r 给了画圆，否则画矩形；pts: [[x, y], …] 画多边形、d: 'SVG path' 画任意形状，文字放在 cx / cy（多边形默认重心）；
//            seg: [[x1, y1], [x2, y2]]（点线段：沿线段的细长热区，w 宽度，默认不描边）；stroke: false 不描边；states: 这一格自己的状态（覆盖全局）；flip: [k, …] 点这一格时这些格也一起切换；fixed: 不能点）
//   也可用 grid: [行, 列], cell, x0, y0 自动生成 k='r行c列'）,
//   states: [{label, fill, text}]（默认两种：空 / 绿；fill 可以是主题色名 card / jade / plum / ink / soft / warn / jsoft / psoft / line，也可以写固定颜色 '#d64545'，深色模式不变）,
//   init: {k: 状态号}, stroke: false（所有格都不描边，透明热区叠在图上时用）,
//   bg: 'SVG 内容（画在格子下面，表达式）', fg: '画在格子上面', info: 'HTML 表达式', goal: '布尔表达式', bad: '表达式，返回要标红的 k 数组',
//   found: '表达式，返回当前摆法的名字（字符串，不算数的摆法返回空）'：记住找到过的不同摆法，表达式里 nfound 是个数、seen 是名字数组（「找出全部 4 种」用 goal: 'nfound >= 4'）,
//   状态里 text 可写 '{label}' 代入格子自己的 label（如 '{label} ✓'）；tag: '真'（右上角小角标，格子文字不变，tag_cls 换颜色类）；sub 覆盖格子的 sub。
//   found_show: true：下面显示「找到：…」一排找到过的名字（名字要写成给孩子看的话；found_label 改前面的字）
//   表达式里可用：S（k→状态号）、L（按 items 顺序的状态号数组）、K（k 数组）、cnt(状态号)、on(k)（状态号≠0）、nfound、seen }
function toggles(box, p, api) {
  // seg：线段热区，自动换成沿线段的细长多边形（宽 w，默认 14），默认不描边；状态的 fill 写 'none' 时颜色自己在 bg 里按 on() 画
  let items = (p.items || []).map((it) => { if (!it.seg) return it; const [[x1, y1], [x2, y2]] = it.seg, L = Math.hypot(x2 - x1, y2 - y1) || 1, h = (it.w || 14) / 2, nx = (-(y2 - y1) / L) * h, ny = ((x2 - x1) / L) * h; return { stroke: false, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, ...it, pts: [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]].map((q) => q.map((t) => Math.round(t * 10) / 10)) }; });
  if (p.grid) {
    const [R, C] = p.grid, c = p.cell || 44, x0 = p.x0 ?? 10, y0 = p.y0 ?? 10;
    items = []; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) items.push({ k: `r${i}c${j}`, x: x0 + j * c, y: y0 + i * c, w: c, h: c, ...(p.cells?.[`r${i}c${j}`] || {}) });
  }
  const states = p.states || [{ fill: 'card' }, { fill: 'jade' }];
  const stOf = (it) => it.states || states;
  const S = {}; items.forEach((it) => { S[it.k] = (p.init || {})[it.k] ?? 0; });
  const keys = ['S', 'L', 'K', 'cnt', 'on', 'nfound', 'seen'];
  const F = { bg: fn(p.bg, keys), fg: fn(p.fg, keys), info: fn(p.info, keys), goal: fn(p.goal, keys), bad: fn(p.bad, keys), found: fn(p.found, keys) };
  const seen = [];
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  const tip = fn(p.tip, keys);
  const vw = p.vw || 360, vh = p.vh || 220;
  box.innerHTML = SVG(vw, vh, '<g class="tg-g"></g>', 'slsvg tgsvg', 1.6) + '<div class="sl-info"></div>' + (p.found && p.found_show ? '<div class="hk-found sl-found tg-found"></div>' : '') + bar(btn('tg-reset', '重来'));
  const env = () => { const L = items.map((it) => S[it.k]); return { S, L, K: items.map((it) => it.k), cnt: (v) => L.filter((x) => x === v).length, on: (k) => S[k] !== 0, nfound: seen.length, seen }; };
  const draw = () => {
    let v = env();
    if (F.found) { const nm = run(F.found, v, ''); if (nm && !seen.includes(String(nm))) { seen.push(String(nm)); v = env(); } }
    const bad = new Set(run(F.bad, v, []) || []);
    let g = run(F.bg, v, '') || '';
    for (const it of items) {
      const sts = stOf(it), st = sts[S[it.k]] || sts[0], cls = `tg-c${bad.has(it.k) ? ' tg-bad' : ''}${it.stroke === false || (p.stroke === false && it.stroke !== true) ? ' tg-ns' : ''}`;
      const fill = `style="fill:${col(st.fill)}${st.opacity !== undefined ? `;fill-opacity:${st.opacity}` : ''}"`;
      const shape = it.r ? `<circle cx="${it.x}" cy="${it.y}" r="${it.r}" ${fill} class="${cls}"/>`
        : it.pts ? `<polygon points="${it.pts.map((q) => q.join(',')).join(' ')}" ${fill} class="${cls}"/>`
        : it.d ? `<path d="${esc(it.d)}" ${fill} class="${cls}"/>`
        : `<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${p.rx ?? 4}" ${fill} class="${cls}"/>`;
      const dN = it.d && it.cx === undefined ? (String(it.d).match(/-?\d*\.?\d+/g) || []).map(Number) : null; // path：取数字两两成点的包围盒中心（近似）
      const dC = dN && dN.length >= 2 ? (() => { const X = dN.filter((_, i) => i % 2 === 0), Y = dN.filter((_, i) => i % 2 === 1); return [(Math.min(...X) + Math.max(...X)) / 2, (Math.min(...Y) + Math.max(...Y)) / 2]; })() : null;
      const [cx, cy] = it.cx !== undefined ? [it.cx, it.cy] : dC ? dC : it.r ? [it.x, it.y] : it.pts ? [it.pts.reduce((t, q) => t + q[0], 0) / it.pts.length, it.pts.reduce((t, q) => t + q[1], 0) / it.pts.length] : [it.x + it.w / 2, it.y + it.h / 2];
      const txt = String(st.text ?? it.label ?? '').replace('{label}', it.label ?? ''), sub = st.sub ?? it.sub;
      // tag：状态的小角标（格子文字不变，右上角标出状态）
      const [tx, ty] = it.tx !== undefined ? [it.tx, it.ty] : it.r ? [it.x + it.r * 0.78, it.y - it.r * 0.6] : it.w !== undefined && !it.pts && !it.d ? [it.x + it.w - 3, it.y + 12] : [cx + 14, cy - 10];
      const tag = st.tag ? `<text x="${tx}" y="${ty}" text-anchor="${it.r || it.tx !== undefined || it.pts || it.d ? 'middle' : 'end'}" font-size="${p.tag_size || 11}" font-weight="700" class="st tg-tag ${st.tag_cls || 'plum'}">${esc(st.tag)}</text>` : '';
      g += `<g class="tg-i${it.fixed ? ' fixed' : ''}" data-k="${esc(it.k)}">${shape}${txt !== '' ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${it.size || p.size || 15}" class="st lbl${st.fill === 'ink' || st.fill === 'plum' || st.fill === 'jade' ? ' tg-on' : ''}"${st.color ? ` style="fill:${st.color}"` : ''}>${esc(txt)}</text>` : ''}${sub ? `<text x="${cx}" y="${(it.r ? it.y + it.r : it.h !== undefined ? it.y + it.h : cy + 10) + 15}" text-anchor="middle" font-size="12" class="st lbl">${esc(sub)}</text>` : ''}${tag}</g>`;
    }
    g += '<g style="pointer-events:none">' + (run(F.fg, v, '') || '') + '</g>';
    box.querySelector('.tg-g').innerHTML = g;
    const fd = box.querySelector('.tg-found'); if (fd) fd.innerHTML = `${esc(p.found_label || '找到')}：${seen.map((x) => `<span>${esc(x)}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (tip) { const t = run(tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, v, false)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tg-reset')) { items.forEach((it) => { S[it.k] = (p.init || {})[it.k] ?? 0; }); draw(); return; }
    const g = e.target.closest('.tg-i'); if (!g) return;
    const it = items.find((x) => x.k === g.dataset.k); if (!it || it.fixed) return;
    for (const k of [it.k, ...(it.flip || [])]) { const x = items.find((y) => y.k === k); if (x) S[k] = (S[k] + 1) % stOf(x).length; }
    draw();
  });
  draw();
}

// ── 单步执行器：一步步看程序 / 算法怎么跑（栈、数组、指针、变量表、代码行高亮） ──
// { steps: [{say, svg 或 html, vars: {名: 值}, line: 代码行号(从 0)}], code: ['代码行', ...], draw: 'SVG 表达式，变量是 st（当前这一步）和 i',
//   vw, vh, ms（播放间隔，默认 900）, need: 'end'（走到最后一步才算完成，默认）或 0（看一眼就算） }
function stepper(box, p, api) {
  const steps = p.steps || [], n = steps.length, draw = fn(p.draw, ['st', 'i', 'steps']);
  const ok = once(() => api.solved(p.say_ok));
  let i = 0, timer = null, prev = {};
  const vw = p.vw || 360, vh = p.vh || 200;
  box.innerHTML = `<div class="stp">${(draw || steps.some((s) => s.svg)) ? SVG(vw, vh, '<g class="stp-g"></g>', 'slsvg') : ''}<div class="stp-html"></div>
    ${p.code ? `<pre class="stp-code">${p.code.map((l, k) => `<span data-l="${k}">${esc(l)}</span>`).join('')}</pre>` : ''}
    <div class="stp-vars"></div><div class="sl-info stp-say"></div>
    ${bar(btn('stp-prev', '◀ 上一步') + `<span class="stp-n"></span>` + btn('stp-next', '下一步 ▶') + btn('stp-play', '▶ 播放') + btn('stp-reset', '重来'))}</div>`;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } box.querySelector('.stp-play').textContent = '▶ 播放'; };
  const paint = () => {
    const st = steps[i] || {};
    const g = box.querySelector('.stp-g');
    if (g) g.innerHTML = draw ? run(draw, { st, i, steps }, '') : (st.svg || '');
    box.querySelector('.stp-html').innerHTML = st.html || '';
    box.querySelector('.stp-say').innerHTML = md(st.say || ''); tex(box.querySelector('.stp-say')); tex(box.querySelector('.stp-html'));
    box.querySelector('.stp-n').textContent = `第 ${i + 1} / ${n} 步`;
    box.querySelectorAll('.stp-code span').forEach((e) => e.classList.toggle('cur', +e.dataset.l === st.line));
    const vars = st.vars || {};
    box.querySelector('.stp-vars').innerHTML = Object.keys(vars).length ? `<table><tr>${Object.keys(vars).map((k) => `<th>${esc(k)}</th>`).join('')}</tr><tr>${Object.entries(vars).map(([k, v]) => `<td class="${String(prev[k]) !== String(v) && i ? 'chg' : ''}">${esc(v)}</td>`).join('')}</tr></table>` : '';
    box.querySelector('.stp-prev').disabled = i === 0; box.querySelector('.stp-next').disabled = i === n - 1;
    if (i === n - 1 || p.need === 0) ok();
  };
  const go = (j) => { prev = (steps[i] || {}).vars || {}; i = Math.max(0, Math.min(n - 1, j)); paint(); };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('stp-prev')) { stop(); go(i - 1); }
    if (b.classList.contains('stp-next')) { stop(); go(i + 1); }
    if (b.classList.contains('stp-reset')) { stop(); prev = {}; i = 0; paint(); }
    if (b.classList.contains('stp-play')) {
      if (timer) { stop(); return; }
      if (i === n - 1) { prev = {}; i = 0; paint(); }
      b.textContent = '⏸ 暂停';
      timer = setInterval(() => { if (i >= n - 1) { stop(); return; } go(i + 1); }, p.ms || 900);
    }
  });
  paint();
}

// ── 格子填数：点格子，再点下面的数字填进去；实时检查 ──
// { rows, cols, cell, gap（格子间距，默认 0 挨着）, round: true（圆格）, fills: {'r,c': 颜色}（格子底色，主题色名或固定色）,
//   given: {'r,c': 值}（题目给的，不能改）, block: ['r,c']（不能填的格，画灰；配 hide_block: true 就不画，用来摆出三角形、圆圈等任意形状）, nums: [可填的值],
//   bg / fg: 'SVG 表达式', info, goal, bad（返回要标红的 'r,c' 数组）。表达式里：G（二维数组，空格是 null）、R、C、filled（填满了没有）、V（格名→值）、sums
// 任意位置的圆圈（幻星、三角形数阵）：cells: [{k, x, y}]（圆心坐标，格名随便起）代替 rows / cols，配 vw / vh
// lines: [[格名, …], …]：画出这些线并在线尾显示和（sums[i]，没填满是 null）；sum: 目标和（填满后不等的线标红，不给 goal 时「全部填满且每条线都等于 sum」算完成）
// once: true：每个数只能用一次（用过的数按钮变灰）
function gridfill(box, p, api) {
  const free = !!p.cells, R = free ? 0 : p.rows, C = free ? 0 : p.cols, c = p.cell || 44, x0 = p.x0 ?? 10, y0 = p.y0 ?? 10, gap = p.gap || 0, st = c + gap;
  const round = free || p.round, given = p.given || {}, block = new Set(p.block || []);
  const cells = free ? p.cells.map((q) => ({ k: String(q.k), cx: q.x, cy: q.y, label: q.label }))
    : Array.from({ length: R * C }, (_, n) => { const i = Math.floor(n / C), j = n % C; return { k: `${i},${j}`, i, j, cx: x0 + j * st + c / 2, cy: y0 + i * st + c / 2 }; });
  const at = Object.fromEntries(cells.map((q) => [q.k, q]));
  const V = Object.fromEntries(cells.map((q) => [q.k, given[q.k] ?? null]));
  // lines 的一项也可以写 {cells: [格名, …], shape: 'path'（依次连过每个格）| 'closed'（连成闭合多边形）| 'circle'（过这些格画圆）, at: [x, y]（和写在哪）}
  const lineObj = (p.lines || []).map((L) => (Array.isArray(L) ? { cells: L.map(String) } : { ...L, cells: L.cells.map(String) }));
  const lines = lineObj.map((L) => L.cells);
  const keys = ['G', 'R', 'C', 'filled', 'V', 'sums'];
  // goal: true（布尔）时用自动条件（填满且每条线等于 sum）
  const F = { bg: fn(p.bg, keys), fg: fn(p.fg, keys), info: fn(p.info, keys), goal: typeof p.goal === 'string' ? fn(p.goal, keys) : null, bad: fn(p.bad, keys) };
  const ok = once(() => api.solved(p.say_ok));
  let sel = null;
  const vw = p.vw || (free ? Math.max(...cells.map((q) => q.cx)) + c : x0 * 2 + C * st - gap), vh = p.vh || (free ? Math.max(...cells.map((q) => q.cy)) + c : y0 * 2 + R * st - gap);
  const nums = p.nums || [1, 2, 3, 4, 5, 6, 7, 8, 9];
  box.innerHTML = SVG(vw, vh, '<g class="gf-g"></g>', 'slsvg gfsvg', 1.5) + '<div class="sl-info"></div>' +
    `<div class="gf-pad">${nums.map((v) => `<button class="lp-ghost gf-n" data-v="${esc(v)}">${esc(v)}</button>`).join('')}<button class="lp-ghost gf-n" data-v="">清除</button></div>` + bar(btn('gf-reset', '重来'));
  const num = (x) => (typeof x === 'number' ? x : +x);
  const env = () => {
    const G = Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => V[`${i},${j}`]));
    const sums = lines.map((L) => (L.every((k) => V[k] !== null && V[k] !== undefined) ? L.reduce((t, k) => t + num(V[k]), 0) : null));
    return { G, R, C, V, sums, filled: cells.every((q) => V[q.k] !== null || block.has(q.k)) };
  };
  const autoGoal = (v) => p.sum !== undefined && lines.length && v.filled && v.sums.every((x) => x === p.sum);
  const draw = () => {
    const v = env(), bad = new Set(run(F.bad, v, []) || []);
    let g = run(F.bg, v, '') || '';
    lines.forEach((L, li) => {
      const a = at[L[0]], b = at[L[L.length - 1]]; if (!a || !b) return;
      const sm = v.sums[li], wrong = p.sum !== undefined && sm !== null && sm !== p.sum, LO = lineObj[li], sh = LO.shape;
      const sty = `style="fill:none;stroke:${wrong ? 'var(--lp-warn)' : 'var(--lp-soft)'};stroke-opacity:${wrong ? 1 : 0.7}" stroke-width="${wrong ? 3 : 2}"`;
      const P = L.map((k) => at[k]).filter(Boolean), mx = P.reduce((t, q) => t + q.cx, 0) / P.length, my = P.reduce((t, q) => t + q.cy, 0) / P.length;
      if (sh === 'circle') g += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${(P.reduce((t, q) => t + Math.hypot(q.cx - mx, q.cy - my), 0) / P.length).toFixed(1)}" ${sty}/>`;
      else if (sh === 'path' || sh === 'closed') g += `<${sh === 'closed' ? 'polygon' : 'polyline'} points="${P.map((q) => `${q.cx},${q.cy}`).join(' ')}" ${sty}/>`;
      else g += `<line x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}" ${sty}/>`;
      if (p.line_sums !== false) {
        const a2 = sh === 'path' ? P[P.length - 2] || a : a, d = Math.hypot(b.cx - a2.cx, b.cy - a2.cy) || 1;
        const [ex, ey] = LO.at ? LO.at : sh === 'circle' || sh === 'closed' ? [mx, my] : [b.cx + ((b.cx - a2.cx) / d) * c * 0.95, b.cy + ((b.cy - a2.cy) / d) * c * 0.95];
        g += `<text x="${ex.toFixed(1)}" y="${(ey + 5).toFixed(1)}" text-anchor="middle" font-size="${Math.round((p.size || 18) * 0.8)}" class="st${sm === null ? ' muted' : wrong ? ' warn' : ' jade'}" font-weight="700">${sm === null ? '·' : sm}</text>`;
      }
    });
    for (const q of cells) {
      const k = q.k, val = V[k], x = q.cx - c / 2, y = q.cy - c / 2;
      if (block.has(k) && p.hide_block) continue;
      const cls = (block.has(k) ? 'gf-blk' : `gf-c${given[k] !== undefined ? ' gf-giv' : ''}${sel === k ? ' gf-sel' : ''}${bad.has(k) ? ' gf-bad' : ''}`) + (round ? ' gf-round' : '');
      const fl = p.fills?.[k] && !bad.has(k) && sel !== k ? ` style="fill:${col(p.fills[k])}"` : '';
      g += `<g class="gf-i" data-k="${esc(k)}"><rect x="${x}" y="${y}" width="${c}" height="${c}"${round ? ` rx="${c / 2}"` : ''} class="${cls}"${fl}/>${val !== null && val !== undefined ? `<text x="${q.cx}" y="${q.cy + 6}" text-anchor="middle" font-size="${p.size || 18}" class="st lbl${given[k] !== undefined ? '' : ' plum'}">${esc(val)}</text>` : q.label ? `<text x="${q.cx}" y="${q.cy + 5}" text-anchor="middle" font-size="${Math.round((p.size || 18) * 0.85)}" font-style="italic" class="st muted" style="pointer-events:none">${esc(q.label)}</text>` : ''}</g>`;
    }
    g += '<g style="pointer-events:none">' + (run(F.fg, v, '') || '') + '</g>';
    box.querySelector('.gf-g').innerHTML = g;
    if (p.once) {
      const used = new Set(Object.entries(V).filter(([k, x]) => x !== null && k !== sel).map(([, x]) => String(x)));
      box.querySelectorAll('.gf-n').forEach((b) => { b.disabled = b.dataset.v !== '' && used.has(b.dataset.v); });
    }
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (F.goal ? run(F.goal, v, false) : autoGoal(v)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.gf-reset')) { for (const q of cells) if (given[q.k] === undefined) V[q.k] = null; sel = null; draw(); return; }
    const cell = e.target.closest('.gf-i');
    if (cell) { const k = cell.dataset.k; if (!block.has(k) && given[k] === undefined) sel = k; draw(); return; }
    const b = e.target.closest('.gf-n');
    if (b && sel && !b.disabled) { const raw = b.dataset.v; V[sel] = raw === '' ? null : (isNaN(+raw) ? raw : +raw); draw(); }
  });
  draw();
}

// ── 阶梯取石子：一排格子，从左到右编号 n-1 … 0；每次从一格（0 号除外）挑任意多个球挪到右边紧邻的格；球全到 0 号时结束，挪最后一次的赢。孩子先手、电脑最优 ──
// { cells: [5, 6, 7, 0]（从左到右每格的球数，最右是 0 号）或 starts: [[…], […]]（让孩子选开局）, odd: true（奇数号格涂底色）, names, games（默认 2）, why: '电脑说的话，{r} 换成局面' }
function stairnim(box, p, api) {
  const names = p.names || ['你', '电脑'], need = p.games || 2, starts = p.starts || [p.cells];
  const ok = once(() => api.solved(p.say_ok));
  // P[j] 是 j 号格的球数（P[0] 是最右的 0 号格）
  const toP = (row) => row.slice().reverse();
  const nimx = (P) => P.reduce((x, n, j) => (j % 2 ? x ^ n : x), 0);
  const bestMove = (P) => { // 挪完让奇数号格的球数异或为 0
    const x = nimx(P); if (!x) return null;
    for (let j = 1; j < P.length; j++) {
      if (j % 2) { const t = P[j] ^ x; if (t < P[j]) return [j, P[j] - t]; }
      else { const t = P[j - 1] ^ x; if (t > P[j - 1] && t - P[j - 1] <= P[j]) return [j, t - P[j - 1]]; }
    }
    return null;
  };
  let P = null, log = [], over = false, games = 0, pick = null;
  const show = (Q) => Q.slice().reverse().join('、');
  const wide = Math.max(...starts.map((row) => row.length)) >= 5, per = wide ? 3 : 4, s = wide ? 26 : 20, br = wide ? 10.5 : 8, cw = per * s + 16;
  const tallest = Math.max(4, ...starts.map((row) => row.reduce((t, n) => t + n, 0)));
  const rows = Math.ceil(Math.min(tallest, 40) / per), ch = rows * s + 16;
  const svg = () => {
    const L = P.length, W = L * cw + 20, top = 30;
    let o = '';
    for (let col = 0; col < L; col++) {
      const j = L - 1 - col, x = 10 + col * cw, n = P[j];
      o += `<g class="sn-c" data-j="${j}" data-n="${n}"><rect x="${x}" y="${top}" width="${cw}" height="${ch}" class="sn-box" data-j="${j}" style="fill:${p.odd && j % 2 ? 'var(--lp-jade)' : 'var(--lp-card)'};fill-opacity:${p.odd && j % 2 ? 0.2 : 1};stroke:var(--lp-ink);cursor:${j ? 'pointer' : 'default'}" stroke-width="1.4"/>`;
      const shown = Math.min(n, 40);
      for (let b = 0; b < shown; b++) {
        const on = pick && pick[0] === j && b >= n - pick[1];
        o += `<circle class="sn-s" data-j="${j}" data-t="${n - b}" cx="${x + 7 + s / 2 + (b % per) * s}" cy="${top + ch - 8 - s / 2 - Math.floor(b / per) * s}" r="${br}" style="fill:${on ? 'var(--lp-plum)' : 'var(--lp-jade)'};opacity:.9;cursor:${j ? 'pointer' : 'default'}"/>`;
      }
      o += `<text x="${x + cw / 2}" y="${top - 9}" text-anchor="middle" font-size="20" font-weight="700" class="st">${n}</text>`;
      o += `<text x="${x + cw / 2}" y="${top + ch + 22}" text-anchor="middle" font-size="17" class="st">${j} 号</text></g>`;
    }
    if (pick) {
      const col = L - 1 - pick[0], x1 = 10 + col * cw + cw * 0.7, x2 = 10 + (col + 1) * cw + cw * 0.3, y = top + ch + 34;
      o += `<path d="M${x1} ${y} Q${(x1 + x2) / 2} ${y + 14} ${x2} ${y}" fill="none" style="stroke:var(--lp-plum)" stroke-width="2.4"/><path d="M${x2 - 7} ${y - 3} L${x2} ${y} L${x2 - 3} ${y + 7}" fill="none" style="stroke:var(--lp-plum)" stroke-width="2.4"/>`;
      o += `<text x="${(x1 + x2) / 2}" y="${y + 30}" text-anchor="middle" font-size="17" font-weight="700" class="st plum">${pick[1]} 个</text>`;
    }
    return SVG(W, top + ch + 70, o, 'snsvg', 1.8);
  };
  const paint = () => { paint0(); const lg = box.querySelector('.tk-log'); if (lg) lg.scrollTop = lg.scrollHeight; };
  const paint0 = () => {
    if (!P) { box.innerHTML = `<div class="tk-pick"><p>选一个开局，你先挪：</p>${bar(starts.map((row, k) => btn(`sn-start" data-k="${k}`, row.join('、'))).join(''))}</div>`; return; }
    box.innerHTML = `<div class="tk">${svg()}<div class="tk-log">${log.map((x) => `<div>${x}</div>`).join('')}</div>
      ${over ? bar(btn('sn-again', '再来一盘')) : `<div class="tk-moves"><span>${pick ? `把 ${pick[0]} 号格的 <b>${pick[1]}</b> 个挪到 ${pick[0] - 1} 号格` : '点球：点到哪个，就从那个挪到这一格最上面（点格子空白处一次多挪一个）'}</span>${pick ? btn('sn-go', '就这样挪') : ''}</div>`}</div>`;
  };
  const end = (who) => { over = true; games++; log.push(`<b class="${who ? 'plum' : ''}">${esc(names[who])}挪了最后一次，${esc(names[who])}赢了。</b>`); if (games >= need) ok(); else api.say(who ? `${names[1]}赢了。再试一盘？` : `${names[0]}赢了！再来一盘？`); };
  const doMove = (j, k) => { P[j] -= k; P[j - 1] += k; };
  const done = () => P.every((n, j) => !j || !n);
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button, .sn-s, .sn-box'); if (!t) return;
    if (t.classList.contains('sn-start')) { P = toP(starts[+t.dataset.k]); log = []; over = false; pick = null; paint(); return; }
    if (t.classList.contains('sn-again')) { P = starts.length > 1 ? null : toP(starts[0]); log = []; over = false; pick = null; paint(); return; }
    if (over) return;
    if (t.classList.contains('sn-box')) { const j = +t.dataset.j; if (j && P[j]) pick = pick && pick[0] === j ? [j, (pick[1] % P[j]) + 1] : [j, 1]; paint(); return; }
    if (t.classList.contains('sn-s')) { const j = +t.dataset.j; if (j) pick = [j, +t.dataset.t]; paint(); return; }
    if (t.classList.contains('sn-go') && pick) {
      doMove(...pick); log.push(`${esc(names[0])}把 ${pick[0]} 号格的 ${pick[1]} 个挪到 ${pick[0] - 1} 号 → ${show(P)}`); pick = null;
      if (done()) { end(0); paint(); return; }
      const m = bestMove(P) || (() => { for (let j = 1; j < P.length; j++) if (P[j]) return [j, 1]; return null; })();
      doMove(...m);
      log.push(`${esc(names[1])}把 ${m[0]} 号格的 ${m[1]} 个挪到 ${m[0] - 1} 号 → ${show(P)}${p.why ? `<span class="muted">（${esc(p.why.replace('{r}', show(P)))}）</span>` : ''}`);
      if (done()) end(1);
      paint();
    }
  });
  if (starts.length === 1) P = toP(starts[0]);
  paint();
}

// ── 汉诺塔：按住最上面的盘子拖到另一根柱子（也可以先点一根柱子、再点另一根）；大盘不能压在小盘上 ──
// { n: 盘子数, pegs: 柱子数（默认 3，最多 6）, labels: ['A', 'B', 'C']（默认 A、B、C…）, from: 0, to: 最后一根, best: 最少步数（给了就显示）,
//   strict: true（步数要等于 best 才算完成，多了提示重来） }
function hanoi(box, p, api) {
  // start / target：[[柱 1 从下到上的盘号], …]，给了就从这个局面开始、到 target 局面算完成
  const K = Math.min(p.pegs || p.start?.length || 3, 6), n = p.start ? p.start.flat().length : p.n || 3, from = p.from ?? 0, to = p.to ?? K - 1;
  const labels = p.labels || 'ABCDEF'.slice(0, K).split('');
  const ok = once(() => api.solved(p.say_ok));
  const COL = ['#e07a5f', '#f2b134', '#81b29a', '#3d9ad1', '#9b72cf', '#e56b9f', '#5fb3a8', '#c08552', '#7f8fa6', '#d4a373'];
  let S, hist, moves, sel = null, drag = null, msg = '', fin = false;
  const reset = () => { S = Array.from({ length: K }, (_, q) => (p.start ? (p.start[q] || []).slice() : [])); if (!p.start) for (let d = n; d >= 1; d--) S[from].push(d); hist = []; moves = 0; sel = null; drag = null; msg = ''; fin = false; };
  reset();
  const dh = 24, pw = Math.max(120, 50 + n * 16), W = K * pw + 20, base = 36 + (n + 1) * dh + 8, Hh = base + 32;
  const px = (q) => 10 + q * pw + pw / 2, dw = (d) => 36 + ((pw - 46) * (d - 1)) / Math.max(1, n - 1);
  const disc = (d, cx, y, lift) => `<g${lift ? ' style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.35))"' : ''}><rect x="${(cx - dw(d) / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${dw(d).toFixed(1)}" height="${dh - 3}" rx="7" style="fill:${COL[(d - 1) % COL.length]};stroke:#1f2933" stroke-width="1"/><text x="${cx.toFixed(1)}" y="${(y + dh - 8).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" style="fill:#1f2933">${d}</text></g>`;
  box.innerHTML = SVG(W, Hh, '<g class="hn-g"></g>', 'hnsvg', 1.4) + '<div class="sl-info hn-info"></div>' + bar(btn('hn-undo', '退一步') + btn('hn-reset', '重来'));
  const svg = box.querySelector('svg');
  const paint = () => {
    let o = `<rect x="6" y="${base}" width="${W - 12}" height="8" rx="3" style="fill:var(--lp-soft)"/>`;
    for (let q = 0; q < K; q++) {
      o += `<rect x="${px(q) - 3}" y="30" width="6" height="${base - 30}" rx="3" style="fill:${sel === q ? 'var(--lp-plum)' : 'var(--lp-soft)'}"/>`;
      o += `<text x="${px(q)}" y="${base + 24}" text-anchor="middle" font-size="18" font-weight="700" class="st${q === to && !p.target ? ' jade' : ''}">${esc(labels[q])}</text>`;
      S[q].forEach((d, h) => { if (!(sel === q && h === S[q].length - 1)) o += disc(d, px(q), base - (h + 1) * dh, false); });
    }
    if (sel !== null) { const d = S[sel][S[sel].length - 1]; o += drag && drag.moved ? disc(d, drag.x, drag.y - dh / 2, true) : disc(d, px(sel), 8, true); }
    for (let q = 0; q < K; q++) o += `<rect class="hn-hit" data-q="${q}" x="${10 + q * pw}" y="0" width="${pw}" height="${Hh}" fill="transparent" style="cursor:pointer"/>`;
    box.querySelector('.hn-g').innerHTML = o;
    const goalTxt = p.target ? `目标：${p.target.map((col, q) => (col.length ? `${esc(labels[q])} 柱 ${col.join('、')}` : '')).filter(Boolean).join('；')}（从下到上）<br>` : '';
    box.querySelector('.hn-info').innerHTML = `${goalTxt}已走 <b>${moves}</b> 步${p.best ? `　最少 ${p.best} 步` : ''}${msg ? `<br>${msg}` : ''}`;
  };
  const pt = (e) => { const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: q.x, y: q.y }; };
  const pegAt = (x) => Math.max(0, Math.min(K - 1, Math.floor((x - 10) / pw)));
  const tryMove = (a, b) => {
    const d = S[a][S[a].length - 1], top = S[b][S[b].length - 1];
    if (top !== undefined && top < d) { msg = `<b class="plum">不行</b>：${d} 号盘比 ${top} 号盘大，不能压在它上面。`; api.say('大盘不能压在小盘上。'); return; }
    S[b].push(S[a].pop()); hist.push([a, b]); moves++; msg = '';
    if (p.target ? p.target.every((col, q) => col.join(',') === S[q].join(',')) : S[to].length === n) {
      fin = true;
      if (p.strict && p.best && moves > p.best) { msg = `全搬过去了，用了 ${moves} 步，比最少的 ${p.best} 步多。按「重来」再试试。`; api.say(`用了 ${moves} 步，还能更少。`); }
      else { msg = p.target ? `摆好了，用了 ${moves} 步。` : `全搬到 ${esc(labels[to])} 柱了，用了 ${moves} 步。`; ok(); }
    }
  };
  svg.addEventListener('pointerdown', (e) => {
    if (fin) return;
    const q = pegAt(pt(e).x), P0 = pt(e);
    if (sel === null) { if (!S[q].length) return; sel = q; drag = { ...P0, sx: P0.x, sy: P0.y, moved: false, fresh: true }; }
    else drag = { ...P0, sx: P0.x, sy: P0.y, moved: false, fresh: false };
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有指针 */ }
    paint();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || sel === null) return;
    const q = pt(e); drag.x = q.x; drag.y = q.y;
    if (Math.hypot(q.x - drag.sx, q.y - drag.sy) > 8) drag.moved = true;
    if (drag.moved) paint();
  });
  const up = (e) => {
    if (!drag) return;
    const q = pegAt(pt(e).x), d0 = drag; drag = null;
    if (sel !== null && q !== sel) { tryMove(sel, q); sel = null; }
    else if (!d0.fresh || d0.moved) sel = null;
    paint();
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', () => { drag = null; sel = null; paint(); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('.hn-reset')) { reset(); paint(); return; }
    if (e.target.closest('.hn-undo') && hist.length && !(fin && !p.strict)) { const [a, b] = hist.pop(); S[a].push(S[b].pop()); moves--; fin = false; sel = null; msg = ''; paint(); }
  });
  paint();
}

// ── 多堆取石子：每次从一堆里拿（最多 max 颗，不给就随便拿），拿到最后一颗的赢（misere: true 时拿到最后一颗的输）。孩子先手，电脑最优 ──
// { piles: [3, 5, 7] 或 starts: [[...], [...]]（几局可选的起始局面）, max, misere, names, games（完成要下几盘，默认 2）, why: '电脑说的话模板，{r} 换成剩下的局面' }
function nim(box, p, api) {
  const max = p.max || Infinity, names = p.names || ['你', '电脑'], need = p.games || 2;
  const starts = p.starts || [p.piles];
  const memo = new Map();
  const moves = (P) => { const out = []; P.forEach((n, i) => { for (let t = 1; t <= Math.min(n, max); t++) out.push([i, t]); }); return out; };
  // win(P)：轮到走的人面对 P 能不能赢
  const win = (P) => {
    const key = [...P].sort((a, b) => a - b).join(','); if (memo.has(key)) return memo.get(key);
    const ms = moves(P); let r;
    if (!ms.length) r = !!p.misere; // 没得拿：普通规则下上一个人拿了最后一颗，当前的人输；misere 反过来
    else r = ms.some(([i, t]) => { const Q = P.slice(); Q[i] -= t; return !win(Q); });
    memo.set(key, r); return r;
  };
  const ok = once(() => api.solved(p.say_ok));
  let P = null, log = [], over = false, games = 0, pick = null;
  const pileSvg = () => {
    const s = 22, per = Math.max(...P, ...(starts.flat()), 1), w = 60 + per * s;
    let o = '';
    P.forEach((n, i) => {
      o += `<text x="8" y="${30 + i * 40}" font-size="14" class="st">第${i + 1}堆</text>`;
      for (let k = 0; k < n; k++) o += `<circle class="nm-s" data-i="${i}" data-t="${n - k}" cx="${62 + k * s}" cy="${25 + i * 40}" r="9" style="fill:${pick && pick[0] === i && k >= n - pick[1] ? 'var(--lp-plum)' : 'var(--lp-jade)'};opacity:.88;cursor:pointer"/>`;
      o += `<text x="${66 + n * s}" y="${30 + i * 40}" font-size="13" class="st">${n}</text>`;
    });
    return SVG(w + 30, 20 + P.length * 40, o, '', 1.4);
  };
  const paint = () => { paint0(); const lg = box.querySelector('.tk-log'); if (lg) lg.scrollTop = lg.scrollHeight; };
  const paint0 = () => {
    if (!P) { box.innerHTML = `<div class="tk-pick"><p>选一个开局，你先拿：</p>${bar(starts.map((st, k) => btn(`nm-start" data-k="${k}`, st.join('、'))).join(''))}</div>`; return; }
    box.innerHTML = `<div class="tk">${pileSvg()}<div class="tk-log">${log.map((x) => `<div>${x}</div>`).join('')}</div>
      ${over ? bar(btn('nm-again', '再来一盘')) : `<div class="tk-moves"><span>${pick ? `从第 ${pick[0] + 1} 堆拿 <b>${pick[1]}</b> 颗` : `点石子：点到哪颗，就从那颗拿到这一堆的末尾${max < Infinity ? `（每次最多 ${max} 颗）` : ''}`}</span>${pick ? btn('nm-go', '就这样拿') : ''}</div>`}</div>`;
  };
  const end = (who) => { over = true; games++; log.push(`<b class="${who ? 'plum' : ''}">${esc(names[who])}赢了。</b>`); if (games >= need) ok(); else api.say(who ? `${names[1]}赢了。再试一盘？` : `${names[0]}赢了！再来一盘？`); };
  const finished = (who) => { // who 刚拿完，石子没了
    end(p.misere ? 1 - who : who);
  };
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button, .nm-s'); if (!t) return;
    if (t.classList.contains('nm-start')) { P = starts[+t.dataset.k].slice(); log = []; over = false; pick = null; paint(); return; }
    if (t.classList.contains('nm-again')) { P = null; paint(); return; }
    if (over) return;
    if (t.classList.contains('nm-s')) { const i = +t.dataset.i, n = +t.dataset.t; pick = [i, Math.min(n, max)]; paint(); return; }
    if (t.classList.contains('nm-go') && pick) {
      P[pick[0]] -= pick[1]; log.push(`${esc(names[0])}从第 ${pick[0] + 1} 堆拿 ${pick[1]} 颗 → ${P.join('、')}`); pick = null;
      if (P.every((x) => !x)) { finished(0); paint(); return; }
      const ms = moves(P);
      const m = ms.find(([i, k]) => { const Q = P.slice(); Q[i] -= k; return !win(Q); }) || ms[0];
      P[m[0]] -= m[1];
      log.push(`${esc(names[1])}从第 ${m[0] + 1} 堆拿 ${m[1]} 颗 → ${P.join('、')}${p.why ? `<span class="muted">（${esc(p.why.replace('{r}', P.join('、')))}）</span>` : ''}`);
      if (P.every((x) => !x)) finished(1);
      paint();
    }
  });
  paint();
}

// ── 换位排序：点两张卡片交换位置，记步数（adjacent: true 只能换相邻的） ──
// { items: ['A', 'B', ...]（初始顺序）, adjacent, info / goal（表达式，O 是当前顺序数组，moves 是已换几次）, vw 不用 }
function sorter(box, p, api) {
  const O = p.items.slice(), keys = ['O', 'moves'];
  const F = { info: fn(p.info, keys), goal: fn(p.goal, keys) };
  const ok = once(() => api.solved(p.say_ok));
  let sel = null, moves = 0, msg = '';
  const paint = () => {
    box.innerHTML = `<div class="so-row">${O.map((x, i) => `<button class="so-c${sel === i ? ' on' : ''}" data-i="${i}">${esc(x)}</button>`).join('')}</div>
      <div class="sl-info">${msg || ''}${F.info ? run(F.info, { O, moves }, '') : ''}</div>${bar(`<span>已换 <b>${moves}</b> 次</span>` + btn('so-reset', '重来'))}`;
    if (run(F.goal, { O, moves }, false)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.so-reset')) { O.splice(0, O.length, ...p.items); sel = null; moves = 0; msg = ''; paint(); return; }
    const c = e.target.closest('.so-c'); if (!c) return;
    const i = +c.dataset.i; msg = '';
    if (sel === null) sel = i;
    else if (sel === i) sel = null;
    else if (p.adjacent && Math.abs(sel - i) !== 1) { msg = '<b class="plum">只能换相邻的两张。</b> '; sel = i; }
    else { [O[sel], O[i]] = [O[i], O[sel]]; moves++; sel = null; }
    paint();
  });
  paint();
}

export const SIMS_SWB = { takeaway, dotpath, toggles, stepper, gridfill, nim, sorter, stairnim, hanoi };
