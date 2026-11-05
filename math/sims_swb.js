// 思维 100 互动解析用到的通用组件（接口同 sims.js：(box, p, api)）

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text, extra = '') => `<button class="lp-ghost ${cls}" ${extra}>${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
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

export const SIMS_SWB = { takeaway, dotpath };
