// 个人知识图谱：知识项按前置关系从左到右分层，颜色 = 这个学生的掌握度。
// 点一个知识项：放大到它和直接上下游，并高亮整条前置链 / 后续链；缩小可以看全局。
// 交互：滚轮 / 双指缩放，拖动平移，按钮放大、缩小、全局、回到焦点。

const NW = 172, NH = 54, COLGAP = 70, ROWGAP = 16, PAD = 40;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 分层布局：层 = 最长前置链长度；层内按前置的平均位置排序，减少交叉 */
function layout(nodes, edges, modOrder) {
  const pre = {}, next = {};
  nodes.forEach((n) => { pre[n.id] = []; next[n.id] = []; });
  edges.forEach(([a, b]) => { if (pre[b] && next[a]) { pre[b].push(a); next[a].push(b); } });
  const depth = {};
  const d = (id, seen = new Set()) => {
    if (depth[id] !== undefined) return depth[id];
    if (seen.has(id)) return 0; seen.add(id);
    return (depth[id] = pre[id].length ? 1 + Math.max(...pre[id].map((p) => d(p, seen))) : 0);
  };
  nodes.forEach((n) => d(n.id));
  const cols = [];
  nodes.forEach((n) => (cols[depth[n.id]] ||= []).push(n));
  const row = {};
  cols.forEach((c) => c.sort((a, b) => modOrder.indexOf(a.module) - modOrder.indexOf(b.module)).forEach((n, i) => (row[n.id] = i)));
  for (let pass = 0; pass < 4; pass++) {
    cols.forEach((c, ci) => {
      if (!ci) return;
      const bc = (n) => (pre[n.id].length ? pre[n.id].reduce((s, p) => s + row[p], 0) / pre[n.id].length : row[n.id]);
      c.sort((a, b) => bc(a) - bc(b) || modOrder.indexOf(a.module) - modOrder.indexOf(b.module)).forEach((n, i) => (row[n.id] = i));
    });
  }
  const maxRows = Math.max(...cols.map((c) => c.length));
  const pos = {};
  cols.forEach((c, ci) => {
    const off = ((maxRows - c.length) * (NH + ROWGAP)) / 2; // 每列竖直居中
    c.forEach((n, i) => (pos[n.id] = { x: PAD + ci * (NW + COLGAP), y: PAD + off + i * (NH + ROWGAP) }));
  });
  return { pos, pre, next, width: PAD * 2 + cols.length * NW + (cols.length - 1) * COLGAP, height: PAD * 2 + maxRows * (NH + ROWGAP) - ROWGAP };
}

const closure = (id, adj) => { const out = new Set(); const st = [id]; while (st.length) { const u = st.pop(); for (const v of adj[u] || []) if (!out.has(v)) { out.add(v); st.push(v); } } return out; };

const LEVEL = { strong: '掌握较好', ok: '基本掌握', weak: '薄弱', insufficient: '数据不足', none: '还没做过' };
const lv = (n) => (n.mastery ? n.mastery.level : 'none');

/**
 * @param box   容器
 * @param data  /api/students/:id/graph 的返回
 * @param opts  { focus, onFocus(id), panel(node, ctx) → html }
 */
export function mountGraph(box, data, opts = {}) {
  const modOrder = data.modules.map((m) => m.id);
  const L = layout(data.nodes, data.edges, modOrder);
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  let exam = 'amc8', focus = opts.focus && byId[opts.focus] ? opts.focus : null;
  const full = { x: 0, y: 0, w: L.width, h: L.height };
  let vb = { ...full };

  box.innerHTML = `<div class="kg">
    <div class="kg-bar">
      <div class="kg-tools">
        <button class="btn" data-z="in" aria-label="放大">＋</button><button class="btn" data-z="out" aria-label="缩小">－</button>
        <button class="btn" data-z="all">看全局</button><button class="btn" data-z="focus" ${focus ? '' : 'disabled'}>回到焦点</button>
      </div>
      <div class="kg-exams">考情：${data.exams.map((e) => `<button class="${e.id === exam ? 'on' : ''}" data-exam="${e.id}" ${e.years ? '' : 'disabled'}>${esc(e.name)}${e.years ? '' : '（真题待录入）'}</button>`).join('')}</div>
    </div>
    <div class="kg-legend">${['strong', 'ok', 'weak', 'insufficient', 'none'].map((k) => `<span><i class="kg-sw lv-${k}"></i>${LEVEL[k]}</span>`).join('')}<span><i class="kg-dot"></i>有没订正的错题</span></div>
    <div class="kg-main">
      <div class="kg-view"><svg class="kg-svg" role="img" aria-label="个人知识图谱"></svg></div>
      <aside class="kg-panel card" aria-live="polite"></aside>
    </div></div>`;
  const svg = box.querySelector('.kg-svg'), panel = box.querySelector('.kg-panel');

  const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  let anim = 0;
  const animateTo = (t) => {
    cancelAnimationFrame(anim);
    const from = { ...vb }, start = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    const step = (now) => {
      const k = dur ? Math.min(1, (now - start) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      vb = { x: from.x + (t.x - from.x) * e, y: from.y + (t.y - from.y) * e, w: from.w + (t.w - from.w) * e, h: from.h + (t.h - from.h) * e };
      setVB(); if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  // 让一组节点刚好充满视窗（保持视窗的宽高比）
  const fit = (ids, margin = 50) => {
    const ps = ids.map((id) => L.pos[id]);
    let x0 = Math.min(...ps.map((p) => p.x)) - margin, x1 = Math.max(...ps.map((p) => p.x + NW)) + margin;
    let y0 = Math.min(...ps.map((p) => p.y)) - margin, y1 = Math.max(...ps.map((p) => p.y + NH)) + margin;
    const r = svg.clientWidth / Math.max(svg.clientHeight, 1) || 1.6;
    let w = x1 - x0, h = y1 - y0;
    const minW = Math.min(full.w, (r < 1 ? 2 * NW + COLGAP : 3 * NW + 2 * COLGAP) + 2 * margin); // 横屏至少三列、竖屏两列，字不会放得太大
    if (w < minW) { x0 -= (minW - w) / 2; w = minW; }
    if (w / h > r) { const nh = w / r; y0 -= (nh - h) / 2; h = nh; } else { const nw = h * r; x0 -= (nw - w) / 2; w = nw; }
    return { x: x0, y: y0, w, h };
  };
  const fitAll = () => fit(data.nodes.map((n) => n.id), 20);
  // 焦点视图：大屏显示整条前置链 + 直接后续（补缺看的是前置）；竖屏只看直接上下游，免得字太小
  const fitFocus = () => {
    const portrait = svg.clientWidth < svg.clientHeight;
    const ids = portrait ? [focus, ...L.pre[focus], ...L.next[focus]] : [focus, ...closure(focus, L.pre), ...L.next[focus]];
    return fit(ids);
  };

  function draw() {
    const up = focus ? closure(focus, L.pre) : new Set(), down = focus ? closure(focus, L.next) : new Set();
    const near = focus ? new Set([focus, ...L.pre[focus], ...L.next[focus]]) : null;
    const cls = (id) => (!focus ? '' : id === focus ? 'sel' : near.has(id) ? 'near' : up.has(id) || down.has(id) ? 'chain' : 'far');
    let e = '';
    for (const [a, b] of data.edges) {
      const p = L.pos[a], q = L.pos[b]; if (!p || !q) continue;
      const x1 = p.x + NW, y1 = p.y + NH / 2, x2 = q.x - 4, y2 = q.y + NH / 2, mx = (x1 + x2) / 2;
      const on = focus && ((b === focus || up.has(b)) && (a === focus || up.has(a)) || (a === focus || down.has(a)) && (b === focus || down.has(b)));
      const direct = focus && (a === focus || b === focus);
      e += `<path class="kg-e ${on ? 'on' : ''} ${direct ? 'direct' : ''} ${focus && !on ? 'far' : ''}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#kg-arrow${on ? '-on' : ''})"/>`;
    }
    let nds = '';
    for (const n of data.nodes) {
      const { x, y } = L.pos[n.id], s = n.exams[exam], m = n.mastery;
      const sub = `${LEVEL[lv(n)]}${m && m.level !== 'insufficient' ? ` ${m.score}` : ''}${s ? ` · 每届 ${s.per_exam} 题` : ''}`;
      nds += `<g class="kg-n lv-${lv(n)} ${cls(n.id)}" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.name)}：${esc(sub)}">
        <rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="10"/>
        <text class="t1" x="${x + 12}" y="${y + 22}">${esc(n.name)}</text>
        <text class="t2" x="${x + 12}" y="${y + 41}">${esc(sub)}</text>
        ${n.wrong?.todo ? `<circle class="kg-badge" cx="${x + NW - 4}" cy="${y + 4}" r="10"/><text class="kg-badge-t" x="${x + NW - 4}" y="${y + 8}">${n.wrong.todo}</text>` : ''}
      </g>`;
    }
    svg.innerHTML = `<defs><marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="kg-ah"/></marker>
      <marker id="kg-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="kg-ah on"/></marker></defs>
      <g class="kg-edges">${e}</g><g class="kg-nodes">${nds}</g>`;
    svg.classList.toggle('focused', !!focus);
    box.querySelector('[data-z="focus"]').disabled = !focus;
    panel.innerHTML = focus ? opts.panel(byId[focus], { byId, pre: L.pre[focus], next: L.next[focus], up, down, exam, LEVEL, lv }) : (opts.empty || '');
    panel.querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => select(b.dataset.focus)));
  }
  function select(id) {
    focus = id; draw(); animateTo(fitFocus()); opts.onFocus?.(id);
  }

  // 点节点 / 键盘
  svg.addEventListener('click', (ev) => { if (moved) return; const g = ev.target.closest('.kg-n'); if (g) select(g.dataset.id); });
  svg.addEventListener('keydown', (ev) => { const g = ev.target.closest('.kg-n'); if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(g.dataset.id); } });

  // 缩放：以某点为中心
  const zoomAt = (k, cx, cy) => {
    const w = Math.min(Math.max(vb.w * k, 260), full.w * 3), r = w / vb.w;
    vb = { x: cx - (cx - vb.x) * r, y: cy - (cy - vb.y) * r, w, h: vb.h * r }; setVB();
  };
  const toSvg = (ev) => { const b = svg.getBoundingClientRect(); return { x: vb.x + ((ev.clientX - b.left) / b.width) * vb.w, y: vb.y + ((ev.clientY - b.top) / b.height) * vb.h }; };
  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); cancelAnimationFrame(anim); const p = toSvg(ev); zoomAt(Math.exp(ev.deltaY * 0.0015), p.x, p.y); }, { passive: false });

  // 拖动平移 + 双指缩放
  const ptrs = new Map(); let last = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', (ev) => { ptrs.set(ev.pointerId, ev); moved = false; last = ev; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
  svg.addEventListener('pointermove', (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.set(ev.pointerId, ev); cancelAnimationFrame(anim);
    const b = svg.getBoundingClientRect();
    if (ptrs.size === 2 && pinch) {
      const [p, q] = [...ptrs.values()], dnow = Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY);
      const c = toSvg({ clientX: (p.clientX + q.clientX) / 2, clientY: (p.clientY + q.clientY) / 2 });
      zoomAt(pinch / dnow, c.x, c.y); pinch = dnow; moved = true; return;
    }
    const dx = ev.clientX - last.clientX, dy = ev.clientY - last.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; svg.setPointerCapture?.(ev.pointerId); }
    if (moved) { vb.x -= (dx / b.width) * vb.w; vb.y -= (dy / b.height) * vb.h; setVB(); }
    last = ev;
  });
  const up = (ev) => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; setTimeout(() => (moved = false), 0); };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);

  box.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => {
    const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    if (b.dataset.z === 'in') { cancelAnimationFrame(anim); zoomAt(0.7, c.x, c.y); }
    else if (b.dataset.z === 'out') { cancelAnimationFrame(anim); zoomAt(1.4, c.x, c.y); }
    else if (b.dataset.z === 'all') animateTo(fitAll());
    else if (focus) animateTo(fitFocus());
  }));
  box.querySelectorAll('[data-exam]').forEach((b) => (b.onclick = () => {
    exam = b.dataset.exam; box.querySelectorAll('[data-exam]').forEach((x) => x.classList.toggle('on', x === b)); draw();
  }));

  draw();
  requestAnimationFrame(() => { vb = focus ? fitFocus() : fitAll(); setVB(); });
  const onResize = () => { vb = focus ? fitFocus() : fitAll(); setVB(); };
  window.addEventListener('resize', onResize);
  return { select, destroy: () => window.removeEventListener('resize', onResize) };
}
