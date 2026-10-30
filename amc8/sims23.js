// 2023 AMC 8 互动解析用到的组件（接口同 sims.js：(box, p, api)）

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text) => `<button class="lp-ghost ${cls}">${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.anchor || 'middle'}" font-size="${o.size || 15}" class="${o.cls || 'st'}"${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };
const tex = (el) => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$', right: '$', display: false }], throwOnError: false }); };
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };

// ── 分步看图：frames: [{ svg, info, say }]，vw / vh 是画布大小 ──
function frames(box, p, api) {
  let k = 0;
  const n = p.frames.length;
  box.innerHTML = SVG(p.vw || 360, p.vh || 220, '<g class="fr-g"></g>', 'slsvg') + '<div class="sl-info fr-info"></div>' +
    bar(`<span class="fr-no"></span>${btn('fr-prev', '上一张')}${btn('fr-next', p.next || '下一步')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = (speak) => {
    const f = p.frames[k];
    box.querySelector('.fr-g').innerHTML = f.svg;
    box.querySelector('.fr-info').innerHTML = f.info || '';
    tex(box.querySelector('.fr-info'));
    box.querySelector('.fr-no').textContent = `${k + 1}/${n}`;
    box.querySelector('.fr-prev').disabled = k === 0;
    box.querySelector('.fr-next').disabled = k === n - 1;
    if (k === n - 1) ok(); else if (speak && f.say) api.say(f.say);
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.fr-prev')) k = Math.max(0, k - 1);
    else if (e.target.closest('.fr-next')) k = Math.min(n - 1, k + 1);
    else return;
    paint(true);
  });
  paint(false);
}

// ── 螺旋填数（第 4 题） ──
function spiral(box, p, api) {
  const N = 7, u = 40, o = 6, c = 3;
  const pos = { 1: [0, 0] };
  let x = 0, y = 0, n = 1, step = 1, d = 0;
  const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  while (n < 49) { for (let t = 0; t < 2; t++) { const [dx, dy] = D[d % 4]; for (let s = 0; s < step && n < 49; s++) { x += dx; y += dy; n++; pos[n] = [x, y]; } d++; } step++; }
  const shade = (p.shade || []).map(([a, b]) => `${a},${b}`);
  let k = p.start || 7;
  box.innerHTML = SVG(o * 2 + N * u, o * 2 + N * u, '<g class="sp-g"></g>', 'spsvg') + '<div class="sl-info sp-info"></div>' +
    bar(`${btn('sp-next', '填下一个')}${btn('sp-ring', '填完这一圈')}${btn('sp-all', '全部填完')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    let g = '';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const gx = j - c, gy = c - i, sh = shade.includes(`${gx},${gy}`);
      g += `<rect x="${o + j * u}" y="${o + i * u}" width="${u}" height="${u}" class="sp-c ${sh ? 'sh' : ''}"/>`;
    }
    for (let m = 1; m <= k; m++) {
      const [gx, gy] = pos[m], sh = shade.includes(`${gx},${gy}`);
      g += T(o + (gx + c) * u + u / 2, o + (c - gy) * u + u / 2 + 5, m, { size: 14, cls: `st ${sh && isPrime(m) ? 'plum' : ''}` });
    }
    box.querySelector('.sp-g').innerHTML = g;
    const vals = shade.map((s) => { const [a, b] = s.split(',').map(Number); return Object.keys(pos).find((m) => pos[m][0] === a && pos[m][1] === b && +m <= k); }).filter(Boolean).map(Number);
    box.querySelector('.sp-info').innerHTML = `已填到 <b>${k}</b> · 阴影格：${vals.length ? vals.map((v) => `${v}${isPrime(v) ? '（质数）' : ''}`).join('、') : '还没填到'}`;
    box.querySelector('.sp-next').disabled = k >= 49;
    if (vals.length === shade.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.sp-next')) k = Math.min(49, k + 1);
    else if (e.target.closest('.sp-ring')) { const r = Math.ceil((Math.sqrt(k + 1) - 1) / 2); k = Math.min(49, (2 * r + 1) ** 2); }
    else if (e.target.closest('.sp-all')) k = 49;
    else return;
    paint();
  });
  paint();
}

// ── 数字填进方框（第 6 题）：底数 指数 × 底数 指数 ──
function digitbox(box, p, api) {
  const digits = p.digits; // [2,0,2,3]
  let slots = [null, null, null, null], best = null;
  box.innerHTML = '<div class="db-expr"></div><div class="db-pal"></div><div class="sl-info db-info"></div>' + bar(btn('db-reset', '清空'));
  const ok = once(() => api.solved(p.say_ok));
  const used = () => slots.filter((s) => s !== null);
  const paint = () => {
    const v = (i) => (slots[i] === null ? '<i class="db-empty"></i>' : `<b>${digits[slots[i]]}</b>`);
    box.querySelector('.db-expr').innerHTML = `<span class="db-b">${v(0)}<sup>${v(1)}</sup></span><span class="db-x">×</span><span class="db-b">${v(2)}<sup>${v(3)}</sup></span>`;
    box.querySelector('.db-pal').innerHTML = digits.map((d, i) => `<button class="as-g db-d ${used().includes(i) ? 'used' : ''}" data-i="${i}">${d}</button>`).join('');
    if (used().length === 4) {
      const [a, b, c, e] = slots.map((s) => digits[s]);
      const val = a ** b * c ** e;
      if (best === null || val > best) best = val;
      box.querySelector('.db-info').innerHTML = `${a}<sup>${b}</sup> × ${c}<sup>${e}</sup> = ${a ** b} × ${c ** e} = <b>${val}</b> · 目前最大 <b class="plum">${best}</b>`;
      if (val === p.max) ok(); else api.say(`得 ${val}。还能更大吗？点「清空」再试。`);
    } else box.querySelector('.db-info').innerHTML = `依次点数字，填进四个方框${best !== null ? ` · 目前最大 <b class="plum">${best}</b>` : ''}`;
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.db-reset')) { slots = [null, null, null, null]; paint(); return; }
    const d = e.target.closest('.db-d'); if (!d) return;
    const i = +d.dataset.i; if (used().includes(i)) return;
    const k = slots.indexOf(null); if (k < 0) return;
    slots[k] = i; paint();
  });
  paint();
}

// ── 每列之和（第 8 题）：点格子在 0 / 1 之间切换 ──
function colsum(box, p, api) {
  const rows = p.rows; // [{name, bits, edit}]
  const cur = rows.map((r) => r.bits.split('').map((c) => (c === '?' ? null : +c)));
  box.innerHTML = '<div class="cs-t"></div><div class="sl-info cs-info"></div>' + bar(btn('cs-reset', '清空'));
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const L = cur[0].length;
    const sums = Array.from({ length: L }, (_, j) => cur.reduce((a, r) => a + (r[j] ?? 0), 0));
    box.querySelector('.cs-t').innerHTML = `<table class="cs-tb"><tr><th></th>${sums.map((_, j) => `<th>第 ${j + 1} 轮</th>`).join('')}</tr>` +
      rows.map((r, i) => `<tr><th>${esc(r.name)}</th>${cur[i].map((v, j) => `<td class="${r.edit ? 'ed' : ''}" data-i="${i}" data-j="${j}">${v ?? '?'}</td>`).join('')}</tr>`).join('') +
      `<tr class="sum"><th>本轮赢</th>${sums.map((s) => `<td class="${s === p.each ? 'good' : 'bad'}">${s}</td>`).join('')}</tr></table>`;
    const filled = cur.every((r) => r.every((v) => v !== null));
    box.querySelector('.cs-info').innerHTML = `每一轮有 2 场比赛，所以每一列应该正好有 <b>${p.each}</b> 个 1`;
    if (filled && sums.every((s) => s === p.each)) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.cs-reset')) { rows.forEach((r, i) => { if (r.edit) cur[i] = cur[i].map(() => null); }); paint(); return; }
    const td = e.target.closest('td.ed'); if (!td) return;
    const i = +td.dataset.i, j = +td.dataset.j;
    cur[i][j] = cur[i][j] === 1 ? 0 : 1; paint();
  });
  paint();
}

// ── 分组（第 21 题）：点卡片，在第 1、2、3 组之间切换 ──
function groups(box, p, api) {
  const n = p.n || 9, G = p.g || 3, target = p.target;
  const g = Array(n + 1).fill(0);
  const found = new Set();
  box.innerHTML = '<div class="gp-cards"></div><div class="gp-bins"></div><div class="hk-found gp-found"></div>' + bar(btn('gp-reset', '清空'));
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelector('.gp-cards').innerHTML = Array.from({ length: n }, (_, i) => `<button class="gp-c g${g[i + 1]}" data-k="${i + 1}">${i + 1}</button>`).join('');
    const bins = Array.from({ length: G }, (_, b) => Array.from({ length: n }, (_, i) => i + 1).filter((k) => g[k] === b + 1));
    box.querySelector('.gp-bins').innerHTML = bins.map((b, i) => { const s = b.reduce((a, x) => a + x, 0); return `<div class="gp-b g${i + 1} ${b.length === 3 && s === target ? 'good' : ''}"><b>第 ${i + 1} 组</b><span>${b.join(' + ') || '—'}</span><em>和 ${s}</em></div>`; }).join('');
    box.querySelector('.gp-found').innerHTML = `找到的分法：${[...found].map((f) => `<span>${f}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (bins.every((b) => b.length === 3 && b.reduce((a, x) => a + x, 0) === target)) {
      const key = bins.map((b) => b.join('')).sort().map((s) => `{${s.split('').join(',')}}`).join(' ');
      if (!found.has(key)) { found.add(key); paint(); api.say(found.size >= p.total ? '' : `找到一种！已经 ${found.size} 种了，还有别的分法吗？`); if (found.size >= p.total) ok(); }
    }
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.gp-reset')) { g.fill(0); paint(); return; }
    const c = e.target.closest('.gp-c'); if (!c) return;
    const k = +c.dataset.k; g[k] = (g[k] + 1) % (G + 1); paint();
  });
  paint();
}

export const SIMS23 = { frames, spiral, digitbox, colsum, groups };
