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
  const paint = () => {
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
const col = (c) => COLORS[c] || c || 'var(--lp-card)';

// ── 开关格：点一下在几种状态间切换（真话/假话、黑/白、左/右、选/不选） ──
// { items: [{k, x, y, w, h, r, label}]（r 给了画圆，否则画矩形；也可用 grid: [行, 列], cell, x0, y0 自动生成 k='r行c列'）,
//   states: [{label, fill, text}]（默认两种：空 / 绿）, init: {k: 状态号},
//   bg: 'SVG 内容（画在格子下面，表达式）', fg: '画在格子上面', info: 'HTML 表达式', goal: '布尔表达式', bad: '表达式，返回要标红的 k 数组',
//   表达式里可用：S（k→状态号）、L（按 items 顺序的状态号数组）、K（k 数组）、cnt(状态号)、on(k)（状态号≠0） }
function toggles(box, p, api) {
  let items = p.items || [];
  if (p.grid) {
    const [R, C] = p.grid, c = p.cell || 44, x0 = p.x0 ?? 10, y0 = p.y0 ?? 10;
    items = []; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) items.push({ k: `r${i}c${j}`, x: x0 + j * c, y: y0 + i * c, w: c, h: c, ...(p.cells?.[`r${i}c${j}`] || {}) });
  }
  const states = p.states || [{ fill: 'card' }, { fill: 'jade' }];
  const S = {}; items.forEach((it) => { S[it.k] = (p.init || {})[it.k] ?? 0; });
  const keys = ['S', 'L', 'K', 'cnt', 'on'];
  const F = { bg: fn(p.bg, keys), fg: fn(p.fg, keys), info: fn(p.info, keys), goal: fn(p.goal, keys), bad: fn(p.bad, keys) };
  const ok = once(() => api.solved(p.say_ok)); let lastTip = '';
  const tip = fn(p.tip, keys);
  const vw = p.vw || 360, vh = p.vh || 220;
  box.innerHTML = SVG(vw, vh, '<g class="tg-g"></g>', 'slsvg tgsvg', 1.6) + '<div class="sl-info"></div>' + bar(btn('tg-reset', '重来'));
  const env = () => { const L = items.map((it) => S[it.k]); return { S, L, K: items.map((it) => it.k), cnt: (v) => L.filter((x) => x === v).length, on: (k) => S[k] !== 0 }; };
  const draw = () => {
    const v = env(), bad = new Set(run(F.bad, v, []) || []);
    let g = run(F.bg, v, '') || '';
    for (const it of items) {
      const st = states[S[it.k]] || states[0], cls = `tg-c${bad.has(it.k) ? ' tg-bad' : ''}`;
      const shape = it.r ? `<circle cx="${it.x}" cy="${it.y}" r="${it.r}" style="fill:${col(st.fill)}" class="${cls}"/>` : `<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="${p.rx ?? 4}" style="fill:${col(st.fill)}" class="${cls}"/>`;
      const cx = it.r ? it.x : it.x + it.w / 2, cy = it.r ? it.y : it.y + it.h / 2;
      const txt = st.text ?? it.label ?? '';
      g += `<g class="tg-i" data-k="${esc(it.k)}">${shape}${txt !== '' ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${it.size || p.size || 15}" class="st lbl${st.fill === 'ink' || st.fill === 'plum' || st.fill === 'jade' ? ' tg-on' : ''}">${esc(txt)}</text>` : ''}${it.sub ? `<text x="${cx}" y="${(it.r ? it.y + it.r : it.y + it.h) + 15}" text-anchor="middle" font-size="12" class="st lbl">${esc(it.sub)}</text>` : ''}</g>`;
    }
    g += '<g style="pointer-events:none">' + (run(F.fg, v, '') || '') + '</g>';
    box.querySelector('.tg-g').innerHTML = g;
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (tip) { const t = run(tip, v, ''); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (run(F.goal, v, false)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tg-reset')) { items.forEach((it) => { S[it.k] = (p.init || {})[it.k] ?? 0; }); draw(); return; }
    const g = e.target.closest('.tg-i'); if (!g) return;
    const it = items.find((x) => x.k === g.dataset.k); if (!it || it.fixed) return;
    S[it.k] = (S[it.k] + 1) % states.length; draw();
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
// { rows, cols, cell, given: {'r,c': 值}（题目给的，不能改）, block: ['r,c']（不能填的格，画灰）, nums: [可填的值],
//   bg / fg: 'SVG 表达式', info, goal, bad（返回要标红的 'r,c' 数组）。表达式里：G（二维数组，空格是 null）、R、C、filled（填满了没有） }
function gridfill(box, p, api) {
  const R = p.rows, C = p.cols, c = p.cell || 44, x0 = p.x0 ?? 10, y0 = p.y0 ?? 10;
  const G = Array.from({ length: R }, () => Array(C).fill(null)), given = p.given || {}, block = new Set(p.block || []);
  for (const [k, v] of Object.entries(given)) { const [r, cc] = k.split(',').map(Number); G[r][cc] = v; }
  const keys = ['G', 'R', 'C', 'filled'];
  const F = { bg: fn(p.bg, keys), fg: fn(p.fg, keys), info: fn(p.info, keys), goal: fn(p.goal, keys), bad: fn(p.bad, keys) };
  const ok = once(() => api.solved(p.say_ok));
  let sel = null;
  const vw = p.vw || x0 * 2 + C * c, vh = p.vh || y0 * 2 + R * c;
  box.innerHTML = SVG(vw, vh, '<g class="gf-g"></g>', 'slsvg', 1.5) + '<div class="sl-info"></div>' +
    `<div class="gf-pad">${(p.nums || [1, 2, 3, 4, 5, 6, 7, 8, 9]).map((v) => `<button class="lp-ghost gf-n" data-v="${esc(v)}">${esc(v)}</button>`).join('')}<button class="lp-ghost gf-n" data-v="">清除</button></div>` + bar(btn('gf-reset', '重来'));
  const env = () => ({ G, R, C, filled: G.every((row, i) => row.every((v, j) => v !== null || block.has(`${i},${j}`))) });
  const draw = () => {
    const v = env(), bad = new Set(run(F.bad, v, []) || []);
    let g = run(F.bg, v, '') || '';
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const k = `${i},${j}`, x = x0 + j * c, y = y0 + i * c, val = G[i][j];
      const cls = block.has(k) ? 'gf-blk' : `gf-c${given[k] !== undefined ? ' gf-giv' : ''}${sel === k ? ' gf-sel' : ''}${bad.has(k) ? ' gf-bad' : ''}`;
      g += `<g class="gf-i" data-k="${k}"><rect x="${x}" y="${y}" width="${c}" height="${c}" class="${cls}"/>${val !== null && val !== undefined ? `<text x="${x + c / 2}" y="${y + c / 2 + 6}" text-anchor="middle" font-size="${p.size || 18}" class="st lbl${given[k] !== undefined ? '' : ' plum'}">${esc(val)}</text>` : ''}</g>`;
    }
    g += '<g style="pointer-events:none">' + (run(F.fg, v, '') || '') + '</g>';
    box.querySelector('.gf-g').innerHTML = g;
    if (F.info) { const el = box.querySelector('.sl-info'); el.innerHTML = run(F.info, v, ''); tex(el); }
    if (run(F.goal, v, false)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.gf-reset')) { for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (given[`${i},${j}`] === undefined) G[i][j] = null; sel = null; draw(); return; }
    const cell = e.target.closest('.gf-i');
    if (cell) { const k = cell.dataset.k; if (!block.has(k) && given[k] === undefined) sel = k; draw(); return; }
    const b = e.target.closest('.gf-n');
    if (b && sel) { const [i, j] = sel.split(',').map(Number); const raw = b.dataset.v; G[i][j] = raw === '' ? null : (isNaN(+raw) ? raw : +raw); draw(); }
  });
  draw();
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
  const paint = () => {
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

export const SIMS_SWB = { takeaway, dotpath, toggles, stepper, gridfill, nim, sorter };
