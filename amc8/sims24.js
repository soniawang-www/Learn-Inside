// 2024 AMC 8 互动解析用到的组件（接口同 sims.js：(box, p, api)）
// slider 是通用组件：课程数据给出变量和表达式，表达式只来自后台导入的课程内容。

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text) => `<button class="lp-ghost ${cls}">${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.anchor || 'middle'}" font-size="${o.size || 15}" class="${o.cls || 'st'}"${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const num = (x) => Number(x).toLocaleString('en-US');

// ── 通用滑块：vars 是变量，view / info / goal 是用这些变量写的表达式 ──
// { vars: [{ k, min, max, step, init, label }], view: 'SVG 内容表达式', vw, vh, info: 'HTML 表达式', goal: '布尔表达式', say_ok }
const H = { T, fmt, gcd, num, esc, pi: Math.PI, sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, min: Math.min, max: Math.max, sin: Math.sin, cos: Math.cos };
function compile(expr, keys) {
  // eslint-disable-next-line no-new-func
  return new Function('v', 'h', `const {${Object.keys(H).join(',')}} = h; const {${keys.join(',')}} = v; return (${expr});`);
}
function slider(box, p, api) {
  const keys = p.vars.map((v) => v.k);
  const view = p.view ? compile(p.view, keys) : null, info = p.info ? compile(p.info, keys) : null, goal = p.goal ? compile(p.goal, keys) : null;
  const tip = p.tip ? compile(p.tip, keys) : null;
  const v = Object.fromEntries(p.vars.map((x) => [x.k, x.init ?? x.min]));
  box.innerHTML = (view ? SVG(p.vw || 360, p.vh || 220, '<g class="sl-g"></g>', 'slsvg') : '') + '<div class="sl-info"></div>' +
    p.vars.map((x) => bar(`<span>${esc(x.label || x.k)} = <b class="sl-v" data-k="${x.k}"></b>${x.unit ? ` ${esc(x.unit)}` : ''}</span><input type="range" min="${x.min}" max="${x.max}" step="${x.step || 1}" value="${v[x.k]}" data-k="${x.k}" aria-label="${esc(x.label || x.k)}">`)).join('');
  const ok = once(() => api.solved(p.say_ok));
  let lastTip = '';
  const draw = () => {
    if (view) box.querySelector('.sl-g').innerHTML = view(v, H);
    box.querySelectorAll('.sl-v').forEach((e) => { e.textContent = fmt(v[e.dataset.k]); });
    if (info) box.querySelector('.sl-info').innerHTML = info(v, H);
    if (tip) { const t = tip(v, H); if (t && t !== lastTip) { lastTip = t; api.say(t); } }
    if (goal && goal(v, H)) ok();
  };
  box.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { v[r.dataset.k] = +r.value; draw(); }));
  draw();
}

// ── 连减看个位（第 1 题） ──
function chain(box, p, api) {
  let k = 0;
  box.innerHTML = '<div class="cn-rows"></div>' + bar(`${btn('cn-next', '减下一个')}${btn('cn-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const hl = (n) => { const s = num(n); return `${s.slice(0, -1)}<b class="plum">${s.slice(-1)}</b>`; };
  const paint = () => {
    let cur = p.start, rows = `<div class="cn-r"><span></span><span class="cn-v">${hl(cur)}</span><span class="muted">个位 ${cur % 10}</span></div>`;
    for (let i = 0; i < k; i++) {
      const b = p.subs[i], nx = cur - b;
      rows += `<div class="cn-r"><span class="cn-op">− ${hl(b)}</span><span class="cn-v">= ${hl(nx)}</span><span class="muted">个位 ${cur % 10} − ${b % 10} → ${nx % 10}</span></div>`;
      cur = nx;
    }
    box.querySelector('.cn-rows').innerHTML = rows;
    box.querySelector('.cn-next').disabled = k >= p.subs.length;
    if (k >= p.subs.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cn-reset')) k = 0;
    else if (e.target.closest('.cn-next')) { k = Math.min(p.subs.length, k + 1); if (k === 2) api.say('注意右边：只要看个位就能一路算下去。个位不够减的时候，借 1 当 10。'); }
    else return;
    paint();
  });
  paint();
}

// ── 叠正方形（第 3 题） ──
function stack(box, p, api) {
  const sizes = p.sizes, gray = p.gray, u = p.u || 18, o = 14, Hh = o * 2 + sizes[0] * u;
  let k = 0;
  box.innerHTML = SVG(o * 2 + sizes[0] * u + 120, Hh, '<g class="sk-g"></g>') + '<div class="sk-info"></div>' + bar(`${btn('sk-next', '放下一个')}${btn('sk-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    let g = '', parts = [];
    for (let i = 0; i < k; i++) {
      const s = sizes[i];
      g += `<rect x="${o}" y="${Hh - o - s * u}" width="${s * u}" height="${s * u}" class="${gray[i] ? 'sk-gray' : 'sk-white'}"/>` + T(o + s * u - 10, Hh - o - s * u + 14, s, { size: 12 });
    }
    for (let i = 0; i < k; i++) if (gray[i]) { const nx = i + 1 < k ? sizes[i + 1] : 0; parts.push(nx ? `(${sizes[i]}² − ${nx}²)` : `${sizes[i]}²`); }
    const area = sizes.slice(0, k).reduce((a, s, i) => a + (gray[i] ? s * s - (i + 1 < k ? sizes[i + 1] ** 2 : 0) : 0), 0);
    box.querySelector('.sk-g').innerHTML = g;
    box.querySelector('.sk-info').innerHTML = k ? `看得见的灰色 = ${parts.join(' + ')} = <b>${area}</b>` : '<span class="muted">从最大的开始，一个一个往上放</span>';
    box.querySelector('.sk-next').disabled = k >= sizes.length;
    if (k >= sizes.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.sk-reset')) k = 0;
    else if (e.target.closest('.sk-next')) { k = Math.min(sizes.length, k + 1); if (p.says?.[k - 1]) api.say(p.says[k - 1]); }
    else return;
    paint();
  });
  paint();
}

// ── 两个骰子（第 5 题） ──
function dice(box, p, api) {
  let hiOn = false, sum = null;
  const mult = (a, b) => (a * b) % 6 === 0;
  let cells = '<div class="dc-c dc-h">×</div>' + [1, 2, 3, 4, 5, 6].map((b) => `<div class="dc-c dc-h">${b}</div>`).join('');
  for (let a = 1; a <= 6; a++) { cells += `<div class="dc-c dc-h">${a}</div>`; for (let b = 1; b <= 6; b++) cells += `<div class="dc-c" data-a="${a}" data-b="${b}">${a * b}</div>`; }
  box.innerHTML = `<div class="dc-grid">${cells}</div><div class="dc-info"></div>` +
    bar(`${btn('dc-hi', '标出 6 的倍数')}${p.sums.map((s) => `<button class="lp-tp dc-s" data-s="${s}">和 ${s}</button>`).join('')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelectorAll('.dc-c[data-a]').forEach((c) => {
      const a = +c.dataset.a, b = +c.dataset.b;
      c.classList.toggle('m6', hiOn && mult(a, b));
      c.classList.toggle('sum', sum !== null && a + b === sum);
    });
    box.querySelectorAll('.dc-s').forEach((b) => b.classList.toggle('on', +b.dataset.s === sum));
    if (sum === null) { box.querySelector('.dc-info').innerHTML = '<span class="muted">先标出“积是 6 的倍数”的格子，再点下面的“和”</span>'; return; }
    const hits = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) if (a + b === sum && mult(a, b)) hits.push(`${a} + ${b}（积 ${a * b}）`);
    box.querySelector('.dc-info').innerHTML = hits.length ? `和为 ${sum} 可以：${hits.join('、')}` : `<b class="plum">和为 ${sum} 的格子里，没有一个积是 6 的倍数！</b>`;
    if (!hits.length && hiOn) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.dc-hi')) { hiOn = !hiOn; paint(); if (hiOn) api.say('涂色的格子都是“积是 6 的倍数”的情况。现在点下面的和，看看哪个和找不到涂色格子。'); return; }
    const b = e.target.closest('.dc-s'); if (!b) return;
    sum = +b.dataset.s; if (!hiOn) { hiOn = true; } paint();
  });
  paint();
}

// ── 铺砖（第 7 题）：选砖块，点格子放（点已放的砖块拿掉） ──
function tiles(box, p, api) {
  const W = p.w, Hn = p.h, u = 44, o = 8;
  const kinds = p.kinds || [['2×2', 2, 2], ['1×4', 4, 1], ['1×1', 1, 1]];
  let cur = 0; const placed = []; // {x,y,w,h,kind}
  const occ = () => { const g = Array.from({ length: Hn }, () => Array(W).fill(-1)); placed.forEach((t, i) => { for (let a = 0; a < t.h; a++) for (let b = 0; b < t.w; b++) g[t.y + a][t.x + b] = i; }); return g; };
  box.innerHTML = SVG(o * 2 + W * u, o * 2 + Hn * u, '<g class="tl-c"></g><g class="tl-t"></g>', 'tlsvg') + '<div class="tl-info"></div>' +
    bar(`${kinds.map(([n], i) => `<button class="lp-tp tl-k" data-i="${i}">${n}</button>`).join('')}${btn('tl-reset', '清空')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const g = occ();
    let c = '';
    for (let y = 0; y < Hn; y++) for (let x = 0; x < W; x++) c += `<rect class="tl-cell ${g[y][x] >= 0 ? 'f' : ''}" data-x="${x}" data-y="${y}" x="${o + x * u}" y="${o + y * u}" width="${u}" height="${u}"/>`;
    box.querySelector('.tl-c').innerHTML = c;
    box.querySelector('.tl-t').innerHTML = placed.map((t, i) => `<rect class="tl-p k${t.kind}" data-i="${i}" x="${o + t.x * u + 3}" y="${o + t.y * u + 3}" width="${t.w * u - 6}" height="${t.h * u - 6}" rx="6"/>`).join('');
    box.querySelectorAll('.tl-k').forEach((b) => b.classList.toggle('on', +b.dataset.i === cur));
    const ones = placed.filter((t) => t.w * t.h === 1).length, filled = placed.reduce((a, t) => a + t.w * t.h, 0);
    const rows = Array.from({ length: Hn }, (_, y) => placed.filter((t) => t.w * t.h === 1 && t.y === y).length);
    box.querySelector('.tl-info').innerHTML = `已铺 <b>${filled}</b>/${W * Hn} 格 · 用了 1×1 <b class="plum">${ones}</b> 块${p.rows ? ` · 每行 1×1：${rows.join(' / ')}` : ''}`;
    if (filled === W * Hn) { if (ones <= p.best) ok(); else api.say(`铺满了！用了 ${ones} 块 1×1。能不能更少？`); }
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tl-reset')) { placed.length = 0; paint(); return; }
    const k = e.target.closest('.tl-k'); if (k) { cur = +k.dataset.i; paint(); return; }
    const t = e.target.closest('.tl-p'); if (t) { placed.splice(+t.dataset.i, 1); paint(); return; }
    const c = e.target.closest('.tl-cell'); if (!c) return;
    const [, w, h] = kinds[cur], x = +c.dataset.x, y = +c.dataset.y, g = occ();
    if (x + w > W || y + h > Hn) { api.say('放不下：砖块会伸到长方形外面。点的格子是砖块的左上角。'); return; }
    for (let a = 0; a < h; a++) for (let b = 0; b < w; b++) if (g[y + a][x + b] >= 0) { api.say('和已经放的砖块重叠了。点已放的砖块可以拿掉。'); return; }
    placed.push({ x, y, w, h, kind: cur }); paint();
  });
  paint();
}

// ── 每天两种选择的树（第 8 题） ──
function tree(box, p, api) {
  let d = 0;
  const f = [(x) => x + 3, (x) => x * 2];
  const days = p.days;
  box.innerHTML = SVG(560, 70 + days.length * 70, '<g class="tr-g"></g>', 'trsvg') + '<div class="tr-info"></div>' + bar(`${btn('tr-next', '下一天')}${btn('tr-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const levels = [[p.start]];
    for (let i = 0; i < d; i++) levels.push(levels[i].flatMap((x) => [f[0](x), f[1](x)]));
    let g = '';
    levels.forEach((lv, i) => {
      const y = 30 + i * 70, n = lv.length;
      const cnt = {}; lv.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
      g += T(30, y + 5, days[i] ?? '', { size: 12, cls: 'st muted' });
      lv.forEach((x, j) => {
        const cx = 70 + (j + 0.5) * (480 / n);
        if (i) { const px = 70 + (Math.floor(j / 2) + 0.5) * (480 / (n / 2)); g += `<line x1="${px}" y1="${y - 52}" x2="${cx}" y2="${y - 16}" class="tr-l"/>` + T((px + cx) / 2 + (j % 2 ? 10 : -10), y - 34, j % 2 ? '×2' : '+3', { size: 11, cls: 'st plum' }); }
        g += `<circle cx="${cx}" cy="${y}" r="16" class="tr-n ${i && cnt[x] > 1 ? 'dup' : ''}"/>` + T(cx, y + 5, x, { size: 14 });
      });
    });
    box.querySelector('.tr-g').innerHTML = g;
    const lv = levels[levels.length - 1], uniq = [...new Set(lv)].sort((a, b) => a - b);
    box.querySelector('.tr-info').innerHTML = d ? `${days[d]}：${lv.length} 个结果，去掉重复后 <b>${uniq.length}</b> 种：${uniq.join('、')}` : '';
    box.querySelector('.tr-next').disabled = d >= days.length - 1;
    if (d >= days.length - 1) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tr-reset')) d = 0;
    else if (e.target.closest('.tr-next')) d = Math.min(days.length - 1, d + 1);
    else return;
    paint();
  });
  paint();
}

// ── 上下跳台阶（第 13 题） ──
function hops(box, p, api) {
  const n = p.n || 6, found = [];
  let seq = [];
  const u = 30, o = 20;
  box.innerHTML = SVG(o * 2 + n * 50, o * 2 + 4 * u, '<g class="hp-g"></g>', 'hpsvg') + '<div class="hp-info"></div><div class="hk-found hp-found"></div>' +
    bar(`${btn('hp-up', '上 ↑')}${btn('hp-dn', '下 ↓')}${btn('hp-reset', '重跳')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    let g = '';
    for (let j = 0; j <= 3; j++) g += `<line x1="${o}" y1="${o + (3 - j) * u}" x2="${o + n * 50}" y2="${o + (3 - j) * u}" class="hp-lv"/>` + T(o - 8, o + (3 - j) * u + 4, j ? j : '地', { size: 11, anchor: 'end', cls: 'st muted' });
    let h = 0, d = `M${o},${o + 3 * u}`;
    seq.forEach((s, i) => { h += s; d += ` L${o + (i + 1) * 50},${o + (3 - h) * u}`; });
    g += `<path d="${d}" class="hp-p"/><circle cx="${o + seq.length * 50}" cy="${o + (3 - h) * u}" r="7" class="hp-me"/>`;
    box.querySelector('.hp-g').innerHTML = g;
    box.querySelector('.hp-info').innerHTML = `已跳 ${seq.length}/${n} 次：${seq.map((s) => (s > 0 ? '上' : '下')).join('-') || '—'}`;
    box.querySelector('.hp-found').innerHTML = `找到：${found.map((f) => `<span>${f}</span>`).join('') || '<span class="muted">还没有</span>'}`;
  };
  const h = () => seq.reduce((a, b) => a + b, 0);
  box.addEventListener('click', (e) => {
    if (e.target.closest('.hp-reset')) { seq = []; paint(); return; }
    const up = e.target.closest('.hp-up'), dn = e.target.closest('.hp-dn');
    if (!up && !dn) return;
    if (seq.length >= n) { seq = []; }
    if (dn && h() === 0) { api.say('已经在地面上了，不能再往下跳。'); return; }
    seq.push(up ? 1 : -1); paint();
    if (seq.length === n) {
      const key = seq.map((s) => (s > 0 ? '上' : '下')).join('');
      if (h() !== 0) api.say(`跳完 ${n} 次停在第 ${h()} 级，没有回到地面。再按一次就重新开始。`);
      else if (found.includes(key)) api.say('这一种已经找到过了，换一种。');
      else { found.push(key); paint(); api.say(`回到地面！找到 ${found.length} 种。`); if (found.length >= p.total) ok(); }
    }
  });
  paint();
}

// ── 单行道最短路（第 14 题） ──
function route(box, p, api) {
  const N = p.nodes, E = p.edges; // E: [u, v, w, q?]
  let path = [p.from];
  const tried = [];
  box.innerHTML = SVG(p.vw || 520, p.vh || 230, '<g class="rt-e"></g><g class="rt-n"></g>', 'rtsvg') + '<div class="rt-info"></div><div class="hk-found rt-found"></div>' +
    bar(`${btn('rt-back', '退一步')}${btn('rt-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const len = () => path.slice(1).reduce((a, v, i) => a + E.find((e) => e[0] === path[i] && e[1] === v)[2], 0);
  const paint = () => {
    const on = new Set(path.slice(1).map((v, i) => `${path[i]}>${v}`));
    box.querySelector('.rt-e').innerHTML = E.map(([a, b, w, q]) => {
      const [x1, y1] = N[a], [x2, y2] = N[b];
      const cx = q ? q[0] : (x1 + x2) / 2, cy = q ? q[1] : (y1 + y2) / 2;
      // 让箭头停在圆边上
      const ex = x2 - (x2 - cx) / Math.hypot(x2 - cx, y2 - cy) * 18, ey = y2 - (y2 - cy) / Math.hypot(x2 - cx, y2 - cy) * 18;
      const lx = q ? q[0] : cx, ly = q ? q[1] + (q[1] > y1 ? 4 : -2) : cy;
      return `<path d="M${x1},${y1} Q${cx},${cy} ${ex},${ey}" class="rt-ed ${on.has(`${a}>${b}`) ? 'on' : ''}" marker-end="url(#rtA)"/>` + T(lx + (q ? 0 : (y1 === y2 ? 0 : (x2 > x1 ? -10 : 10))), ly + (y1 === y2 && !q ? -6 : 0), w, { size: 13 });
    }).join('') + '<defs><marker id="rtA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="rt-ar"/></marker></defs>';
    box.querySelector('.rt-n').innerHTML = Object.entries(N).map(([k, [x, y]]) => `<g class="rt-node ${path.includes(k) ? 'on' : ''} ${k === path[path.length - 1] ? 'cur' : ''}" data-k="${k}"><circle cx="${x}" cy="${y}" r="17"/>${T(x, y + 5, k, { italic: true })}</g>`).join('');
    box.querySelector('.rt-info').innerHTML = `路线：${path.join(' → ')} · 长度 <b>${len()}</b> 千米`;
    box.querySelector('.rt-found').innerHTML = `走到 Z 的路线：${tried.map((t) => `<span>${t}</span>`).join('') || '<span class="muted">还没有</span>'}`;
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.rt-reset')) { path = [p.from]; paint(); return; }
    if (e.target.closest('.rt-back')) { if (path.length > 1) path.pop(); paint(); return; }
    const nd = e.target.closest('.rt-node'); if (!nd) return;
    const k = nd.dataset.k, cur = path[path.length - 1];
    if (cur === p.to) { api.say('已经到 Z 了。点「重来」再找一条。'); return; }
    if (!E.some((ed) => ed[0] === cur && ed[1] === k)) { api.say(`从 ${cur} 没有通往 ${k} 的单行道，注意箭头方向。`); return; }
    path.push(k); paint();
    if (k === p.to) {
      const L = len(); tried.push(`${L}`); paint();
      if (L === p.best) ok(); else api.say(`到了，${L} 千米。还有更短的吗？点「重来」再找。`);
    }
  });
  paint();
}

// ── 两个国王（第 17 题） ──
function kings(box, p, api) {
  const n = 3, u = 70, o = 10, rec = {};
  let at = null;
  box.innerHTML = SVG(o * 2 + n * u, o * 2 + n * u, '<g class="kg-g"></g>', 'kgsvg') + '<div class="kg-info"></div>' + bar(btn('kg-reset', '重来'));
  const ok = once(() => api.solved(p.say_ok));
  const safe = (r, c) => { let s = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if ((a !== r || b !== c) && Math.max(Math.abs(a - r), Math.abs(b - c)) > 1) s++; return s; };
  const paint = () => {
    let g = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = o + c * u, y = o + r * u, k = `${r},${c}`;
      let cls = 'kg-c';
      if (at) { const d = Math.max(Math.abs(r - at[0]), Math.abs(c - at[1])); cls += d === 0 ? ' me' : d === 1 ? ' atk' : ' ok'; }
      g += `<rect class="${cls}" data-r="${r}" data-c="${c}" x="${x}" y="${y}" width="${u}" height="${u}"/>`;
      if (at && at[0] === r && at[1] === c) g += T(x + u / 2, y + u / 2 + 8, '♔', { size: 28 });
      else if (at && Math.max(Math.abs(r - at[0]), Math.abs(c - at[1])) > 1) g += T(x + u / 2, y + u / 2 + 6, '✓', { size: 18, cls: 'st plum' });
      if (rec[k] !== undefined) g += T(x + u - 10, y + 16, rec[k], { size: 13, cls: 'st muted' });
    }
    box.querySelector('.kg-g').innerHTML = g;
    const ks = Object.keys(rec), tot = ks.reduce((a, k) => a + rec[k], 0);
    box.querySelector('.kg-info').innerHTML = at ? `白王在这里，黑王有 <b>${safe(at[0], at[1])}</b> 个安全格 · 已试 ${ks.length}/9 格，合计 <b>${tot}</b>` : '点一个格子放白王';
    if (ks.length === 9) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.kg-reset')) { at = null; for (const k in rec) delete rec[k]; paint(); return; }
    const c = e.target.closest('.kg-c'); if (!c) return;
    at = [+c.dataset.r, +c.dataset.c]; rec[`${at[0]},${at[1]}`] = safe(at[0], at[1]); paint();
  });
  paint();
}

// ── 立方体上的等边三角形（第 20 题） ──
function cube(box, p, api) {
  // 顶点三维坐标（P 在前上左）
  const V = { P: [0, 1, 0], Q: [1, 1, 0], R: [1, 1, 1], S: [0, 1, 1], T: [0, 0, 1], U: [1, 0, 1], V: [1, 0, 0], W: [0, 0, 0] };
  const S2 = (v) => [60 + v[0] * 170 + v[2] * 70, 250 - v[1] * 170 - v[2] * 55];
  const d2 = (a, b) => V[a].reduce((s, x, i) => s + (x - V[b][i]) ** 2, 0);
  const NAME = { 1: '棱', 2: '面对角线', 3: '体对角线' };
  const LEN = { 1: '1', 2: '√2', 3: '√3' };
  const edges = []; const ks = Object.keys(V);
  ks.forEach((a, i) => ks.slice(i + 1).forEach((b) => { if (d2(a, b) === 1) edges.push([a, b]); }));
  let pick = [];
  const found = new Set();
  box.innerHTML = SVG(330, 270, '<g class="cb-g"></g>', 'cbsvg') + '<div class="cb-info"></div><div class="hk-found cb-found"></div>' + bar(btn('cb-reset', '重选'));
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    let g = edges.map(([a, b]) => { const [x1, y1] = S2(V[a]), [x2, y2] = S2(V[b]); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="cb-e"/>`; }).join('');
    if (pick.length === 2) { const pts = ['P', ...pick].map((k) => S2(V[k]).join(',')).join(' '); g += `<polygon points="${pts}" class="cb-tri ${isEq() ? 'eq' : ''}"/>`; }
    g += ks.map((k) => { const [x, y] = S2(V[k]); return `<g class="cb-v ${k === 'P' ? 'p' : ''} ${pick.includes(k) ? 'on' : ''}" data-k="${k}"><circle cx="${x}" cy="${y}" r="13"/>${T(x, y + 5, k, { italic: true, size: 14 })}</g>`; }).join('');
    box.querySelector('.cb-g').innerHTML = g;
    if (pick.length === 2) {
      const [a, b] = pick, s = [d2('P', a), d2('P', b), d2(a, b)];
      box.querySelector('.cb-info').innerHTML = `P${a} 是${NAME[s[0]]}（${LEN[s[0]]}），P${b} 是${NAME[s[1]]}（${LEN[s[1]]}），${a}${b} 是${NAME[s[2]]}（${LEN[s[2]]}）· ${isEq() ? '<b class="plum">等边！</b>' : '不是等边'}`;
    } else box.querySelector('.cb-info').innerHTML = `P 已选好，再点 ${2 - pick.length} 个顶点`;
    box.querySelector('.cb-found').innerHTML = `找到的等边三角形：${[...found].map((f) => `<span>${f}</span>`).join('') || '<span class="muted">还没有</span>'}`;
  };
  const isEq = () => pick.length === 2 && d2('P', pick[0]) === d2('P', pick[1]) && d2('P', pick[0]) === d2(pick[0], pick[1]);
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cb-reset')) { pick = []; paint(); return; }
    const v = e.target.closest('.cb-v'); if (!v) return;
    const k = v.dataset.k; if (k === 'P') return;
    if (pick.includes(k)) pick = pick.filter((x) => x !== k); else { if (pick.length === 2) pick = []; pick.push(k); }
    if (isEq()) { found.add('P' + [...pick].sort().join('')); if (found.size >= 3) ok(); else api.say(`找到一个！已经 ${found.size} 个了，还有吗？`); }
    paint();
  });
  paint();
}

// ── 线段穿过几个格子（第 23 题） ──
function linecells(box, p, api) {
  let a = p.a0 || 2, b = p.b0 || 4;
  const seen = new Set();
  box.innerHTML = SVG(380, 300, '<g class="lc-g"></g>', 'lcsvg') + '<div class="lc-info"></div>' +
    bar(`<span>横 <b class="lc-a"></b></span><input type="range" min="1" max="8" value="${a}" class="lc-ra" aria-label="横">`) +
    bar(`<span>竖 <b class="lc-b"></b></span><input type="range" min="1" max="8" value="${b}" class="lc-rb" aria-label="竖">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = () => {
    const m = Math.max(a, b), u = Math.min(40, 260 / m), o = 20, Hh = o + b * u;
    let g = '';
    let cnt = 0;
    for (let i = 0; i < a; i++) {
      const y0 = (b * i) / a, y1 = (b * (i + 1)) / a;
      for (let j = Math.floor(y0 + 1e-9); j < Math.ceil(y1 - 1e-9); j++) { cnt++; g += `<rect x="${o + i * u}" y="${Hh - (j + 1) * u}" width="${u}" height="${u}" class="lc-on"/>`; }
    }
    for (let i = 0; i <= a; i++) g += `<line x1="${o + i * u}" y1="${Hh}" x2="${o + i * u}" y2="${Hh - b * u}" class="lc-gl"/>`;
    for (let j = 0; j <= b; j++) g += `<line x1="${o}" y1="${Hh - j * u}" x2="${o + a * u}" y2="${Hh - j * u}" class="lc-gl"/>`;
    for (let t = 1; t < gcd(a, b); t++) g += `<circle cx="${o + (a / gcd(a, b)) * t * u}" cy="${Hh - (b / gcd(a, b)) * t * u}" r="5" class="lc-pt"/>`;
    g += `<line x1="${o}" y1="${Hh}" x2="${o + a * u}" y2="${Hh - b * u}" class="lc-seg"/>`;
    box.querySelector('.lc-g').innerHTML = g;
    box.querySelector('.lc-a').textContent = a; box.querySelector('.lc-b').textContent = b;
    const k = gcd(a, b);
    box.querySelector('.lc-info').innerHTML = `从 (0,0) 到 (${a},${b})：涂色 <b>${cnt}</b> 格 · 横 + 竖 − 1 = ${a + b - 1}${k > 1 ? ` · 线段正好穿过 <b class="plum">${k - 1}</b> 个格点（圆点），每穿过一个就少涂 1 格` : ''}`;
    seen.add(k > 1 ? 'g' : 'c');
    if (a === p.a && b === p.b && seen.has('g')) ok();
    else if (a === p.a && b === p.b) api.say(`${p.a} 和 ${p.b} 互质，正好是 ${cnt} 格。再把横竖调成有公因数的，比如 2 和 4，看看会怎样？`);
  };
  box.querySelector('.lc-ra').addEventListener('input', (e) => { a = +e.target.value; draw(); });
  box.querySelector('.lc-rb').addEventListener('input', (e) => { b = +e.target.value; draw(); });
  draw();
}

// ── 飞机座位（第 25 题） ──
function seats(box, p, api) {
  const R = 4, C = 3;
  let occ = new Set(), trials = 0, good = 0;
  box.innerHTML = '<div class="se-plane"></div><div class="se-info"></div>' + bar(`${btn('se-one', '随机坐 8 人')}${btn('se-many', '连试 100 次')}`);
  const ok = once(() => api.solved(p.say_ok));
  const hasPair = (o) => { for (let r = 0; r < R; r++) for (let c = 0; c < C - 1; c++) if (!o.has(r * C + c) && !o.has(r * C + c + 1)) return [r * C + c, r * C + c + 1]; return null; };
  const rand = () => { const a = [...Array(R * C).keys()]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return new Set(a.slice(0, 8)); };
  const paint = () => {
    const pr = trials ? hasPair(occ) : null;
    box.querySelector('.se-plane').innerHTML = Array.from({ length: R }, (_, r) => `<div class="se-row">${Array.from({ length: C }, (_, c) => { const k = r * C + c; return `<i class="${occ.has(k) ? 'o' : ''} ${pr && pr.includes(k) ? 'cp' : ''}"></i>`; }).join('')}</div>`).join('');
    box.querySelector('.se-info').innerHTML = trials ? `${pr ? '<b class="plum">有相邻的两个空座</b>' : '没有相邻的空座'} · 试了 <b>${trials}</b> 次，成功 ${good} 次，约 <b>${((good / trials) * 100).toFixed(1)}%</b>（20/33 ≈ 60.6%）` : '<span class="muted">点「随机坐 8 人」</span>';
  };
  const one = () => { occ = rand(); trials++; if (hasPair(occ)) good++; };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.se-one')) one();
    else if (e.target.closest('.se-many')) for (let i = 0; i < 100; i++) one();
    else return;
    paint();
    if (trials >= 20) ok();
  });
  paint();
}

export const SIMS24 = { slider, chain, stack, dice, tiles, tree, hops, route, kings, cube, linecells, seats };
