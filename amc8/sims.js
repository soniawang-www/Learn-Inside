// 互动组件库：互动解析和知识点课里的「动手」部分。
// 课程数据里写 { type: 'sim', sim: '名字', ...参数, goal: true }，goal 为真时播放器会显示「轮到你了」并等孩子完成。
// 每个组件：(box, p, api) => void；api.say(文字) 换小助手的话，api.solved(文字) 表示完成。

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));
const bar = (html) => `<div class="lp-gbar">${html}</div>`;
const btn = (cls, text) => `<button class="lp-ghost ${cls}">${text}</button>`;
const SVG = (w, h, body, cls = '') => `<svg viewBox="0 0 ${w} ${h}" class="lp-sim ${cls}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.anchor || 'middle'}" font-size="${o.size || 15}" class="${o.cls || 'st'}"${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
const once = (fn) => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };

// ── 通用：点一点（count 数一数 / select 选出来） ──
// shapes: [{ k, pts:[[x,y]...] | rect:[x,y,w,h], v, label, fill }]，坐标单位 × cell；lines:[宽,高] 画格线
function tap(box, p, api) {
  const c = p.cell || 50, pad = p.pad ?? 12;
  const W = p.w * c + pad * 2, H = p.h * c + pad * 2;
  const X = (x) => pad + x * c, Y = (y) => pad + y * c;
  const shape = (s) => {
    const a = `data-k="${esc(s.k)}" class="tp-s"`;
    if (s.rect) { const [x, y, w, h] = s.rect; return `<rect ${a} x="${X(x)}" y="${Y(y)}" width="${w * c}" height="${h * c}" rx="${s.r || 0}"/>`; }
    return `<polygon ${a} points="${s.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')}"/>`;
  };
  const center = (s) => {
    if (s.rect) return [X(s.rect[0] + s.rect[2] / 2), Y(s.rect[1] + s.rect[3] / 2)];
    const n = s.pts.length; return [X(s.pts.reduce((a, q) => a + q[0], 0) / n), Y(s.pts.reduce((a, q) => a + q[1], 0) / n)];
  };
  let grid = '';
  if (p.lines) { const [gw, gh] = p.lines; for (let i = 0; i <= gw; i++) grid += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(gh)}"/>`; for (let j = 0; j <= gh; j++) grid += `<line x1="${X(0)}" y1="${Y(j)}" x2="${X(gw)}" y2="${Y(j)}"/>`; }
  box.innerHTML = SVG(W, H, `<g class="gl">${grid}</g><g class="shapes">${p.shapes.map(shape).join('')}</g><g class="marks"></g>` +
    p.shapes.filter((s) => s.label).map((s) => { const [x, y] = center(s); return `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="${s.size || 16}" class="st lbl" data-for="${esc(s.k)}">${esc(s.label)}</text>`; }).join('') +
    (p.extra ? `<g transform="translate(${pad},${pad}) scale(${c})" class="extra">${p.extra}</g>` : ''), 'tapsvg') +
    bar(`<span class="tp-count"></span>${p.mode === 'select' ? btn('tp-check', '检查') : ''}${btn('tp-reset', '重来')}`);
  const sel = new Set(), order = [];
  const unit = p.unit || '块';
  const paint = () => {
    box.querySelectorAll('.tp-s').forEach((e) => e.classList.toggle('on', sel.has(e.dataset.k)));
    box.querySelectorAll('.lbl').forEach((e) => e.classList.toggle('on', sel.has(e.dataset.for)));
    box.querySelector('.marks').innerHTML = p.mode === 'count' ? order.map((k, i) => { const s = p.shapes.find((q) => q.k === k); const [x, y] = center(s); return T(x, y + 5, i + 1, { size: 13, cls: 'st num' }); }).join('') : '';
    const sum = [...sel].reduce((a, k) => a + (p.shapes.find((q) => q.k === k).v || 0), 0);
    box.querySelector('.tp-count').innerHTML = p.mode === 'select'
      ? (p.showSum ? `已选 ${sel.size} 个，合计 <b>${fmt(sum)}</b>` : `已选 ${sel.size} 个`)
      : `已数 <b>${sel.size}</b> ${unit}${p.each ? `，每${unit} ${p.each}，合计 <b>${fmt(sel.size * p.eachV)}</b>` : ''}`;
  };
  const ok = once(() => api.solved(p.say_ok || '完成！'));
  box.addEventListener('click', (e) => {
    if (e.target.closest('.tp-reset')) { sel.clear(); order.length = 0; paint(); return; }
    if (e.target.closest('.tp-check')) {
      const ans = new Set(p.answer);
      if (ans.size === sel.size && [...ans].every((k) => sel.has(k))) ok();
      else api.say(p.say_wrong || '还不对，再看看哪些应该选、哪些不该选。');
      return;
    }
    const s = e.target.closest('.tp-s'); if (!s) return;
    const k = s.dataset.k;
    if (sel.has(k)) { sel.delete(k); order.splice(order.indexOf(k), 1); } else { sel.add(k); order.push(k); }
    paint();
    const sh = p.shapes.find((q) => q.k === k);
    if (sel.has(k) && sh.say) api.say(sh.say);
    if (p.mode === 'count' && sel.size === p.shapes.length) ok();
  });
  paint();
}

// ── 求和：一个个点符号，算式跟着长 ──
function sum(box, p, api) {
  box.innerHTML = `<div class="sm-items">${p.items.map((it, i) => `<button class="sm-it" data-i="${i}">${it.svg || esc(it.label)}</button>`).join('')}</div>
    <div class="sm-expr"></div>` + bar(btn('sm-reset', '重来'));
  const got = new Set();
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelectorAll('.sm-it').forEach((b) => b.classList.toggle('on', got.has(+b.dataset.i)));
    const vals = [...got].sort((a, b) => a - b).map((i) => p.items[i].v);
    const groups = []; for (const v of vals) { const g = groups.find((x) => x.v === v); if (g) g.n++; else groups.push({ v, n: 1 }); }
    groups.sort((a, b) => b.v - a.v);
    const total = vals.reduce((a, b) => a + b, 0);
    box.querySelector('.sm-expr').innerHTML = got.size ? `${groups.map((g) => `${g.n > 1 ? `${g.n}×` : ''}${g.v.toLocaleString('en-US')}`).join(' + ')} = <b>${total.toLocaleString('en-US')}</b>` : '<span class="muted">点上面的符号，一个一个加起来</span>';
    if (got.size === p.items.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.sm-reset')) { got.clear(); paint(); return; }
    const b = e.target.closest('.sm-it'); if (!b) return;
    const i = +b.dataset.i; if (got.has(i)) got.delete(i); else { got.add(i); if (p.items[i].say) api.say(p.items[i].say); }
    paint();
  });
  paint();
}

// ── 数列：一个一个数下去，看「间隔」 ──
function seq(box, p, api) {
  const terms = [p.start];
  box.innerHTML = `<div class="sq-row"></div>` + bar(`<span class="sq-info"></span>${btn('sq-next', p.next_label || '数下一个')}${btn('sq-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelector('.sq-row').innerHTML = terms.map((t, i) => `${i ? `<span class="sq-gap">${p.step > 0 ? '+' : '−'}${Math.abs(p.step)}</span>` : ''}<span class="sq-t ${i + 1 === p.target ? 'hit' : ''}"><b>${t}</b><small>第 ${i + 1} 个</small></span>`).join('');
    box.querySelector('.sq-info').innerHTML = `${terms.length} 个数，中间有 <b>${terms.length - 1}</b> 个「${p.step > 0 ? '+' : '−'}${Math.abs(p.step)}」`;
    box.querySelector('.sq-next').disabled = terms.length >= p.target;
    if (terms.length >= p.target) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.sq-reset')) { terms.length = 1; paint(); return; }
    if (e.target.closest('.sq-next') && terms.length < p.target) { terms.push(terms[terms.length - 1] + p.step); paint(); }
  });
  paint();
}

// ── 平均分：总数不变，人数变了 ──
function deal(box, p, api) {
  let n = p.from;
  box.innerHTML = `<div class="dl-rows"></div>` + bar(`<span class="dl-info"></span>${p.options.map((k) => `<button class="lp-tp dl-n" data-n="${k}">${k} 人</button>`).join('')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const each = p.total / n;
    box.querySelector('.dl-rows').innerHTML = Array.from({ length: n }, (_, r) => `<div class="dl-row"><span>玩家 ${r + 1}</span><span class="dl-cards">${'<i></i>'.repeat(each)}</span><b>${each}</b></div>`).join('');
    box.querySelector('.dl-info').innerHTML = `共 <b>${p.total}</b> 张，${n} 人平分，每人 <b>${each}</b> 张`;
    box.querySelectorAll('.dl-n').forEach((b) => b.classList.toggle('on', +b.dataset.n === n));
    if (n === p.goal) ok();
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('.dl-n'); if (b) { n = +b.dataset.n; paint(); } });
  paint();
}

// ── 擦掉一个数：看余数 ──
function erase(box, p, api) {
  let shown = false;
  box.innerHTML = `<div class="er-row">${p.nums.map((x) => `<button class="er-n" data-x="${x}"><b>${x}</b><small></small></button>`).join('')}</div><div class="er-info"></div>` +
    (p.m ? bar(btn('er-show', `显示除以 ${p.m} 的余数`)) : '');
  const total = p.nums.reduce((a, b) => a + b, 0);
  const ok = once((t) => api.solved(t));
  const paint = () => {
    box.querySelectorAll('.er-n small').forEach((s, i) => { s.textContent = shown ? `余 ${p.nums[i] % p.m}` : ''; });
  };
  const sq = p.test === 'square', good = (r) => (sq ? Number.isInteger(Math.sqrt(r)) : r % p.m === 0);
  box.querySelector('.er-info').innerHTML = sq ? `${p.nums.length} 个数的和 = <b>${total}</b>。点一个数把它漏掉。` : `${p.nums.length} 个数的和 = <b>${total}</b>，除以 ${p.m} 余 <b>${total % p.m}</b>。点一个数把它擦掉。`;
  box.addEventListener('click', (e) => {
    if (e.target.closest('.er-show')) { shown = !shown; paint(); return; }
    const b = e.target.closest('.er-n'); if (!b) return;
    box.querySelectorAll('.er-n').forEach((x) => x.classList.remove('off', 'good'));
    const x = +b.dataset.x, rest = total - x;
    b.classList.add(good(rest) ? 'good' : 'off');
    box.querySelector('.er-info').innerHTML = sq ? `漏掉 ${x}：和 = ${total} − ${x} = <b>${rest}</b>${good(rest) ? ` = ${Math.sqrt(rest)}²` : '，不是平方数'}` : `擦掉 ${x}：剩下的和 = ${total} − ${x} = <b>${rest}</b>，除以 ${p.m} 余 <b>${rest % p.m}</b>`;
    if (good(rest)) ok(p.say_ok.replace('{x}', x).replace('{r}', rest));
    else api.say(sq ? (p.say_bad || `${rest} 不是平方数。比 ${total} 小的平方数有哪些？`).replace('{r}', rest) : `剩下 ${rest}，除以 ${p.m} 余 ${rest % p.m}，不是 ${p.m} 的倍数。被擦掉的数除以 ${p.m} 应该余几？`);
  });
  paint();
}

// ── 时钟：点一个数，连到正对面 ──
function clock(box, p, api) {
  const cx = 150, cy = 150, r = 105;
  const pos = (n, rr = r) => { const a = (90 - n * 30) * Math.PI / 180; return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
  let face = `<circle cx="${cx}" cy="${cy}" r="${r}" class="ck-face"/>`;
  for (let n = 1; n <= 12; n++) { const [x, y] = pos(n, r + 22); face += `<g class="ck-n" data-n="${n}"><circle cx="${x}" cy="${y}" r="15"/>${T(x, y + 5, n, { size: 15 })}</g>`; }
  box.innerHTML = SVG(300, 300, `<g class="ck-lines"></g>${face}`) + `<div class="ck-list"></div>` + bar(btn('ck-reset', '重来'));
  const pairs = new Map();
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelector('.ck-lines').innerHTML = [...pairs.keys()].map((a) => { const b = a + 6, [x1, y1] = pos(a), [x2, y2] = pos(b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }).join('');
    box.querySelectorAll('.ck-n').forEach((g) => { const n = +g.dataset.n; g.classList.toggle('on', pairs.has(n > 6 ? n - 6 : n)); });
    const avgs = [...pairs.keys()].sort((a, b) => a - b).map((a) => ({ a, b: a + 6, m: (a + a + 6) / 2 }));
    box.querySelector('.ck-list').innerHTML = avgs.map((x) => `<span>(${x.a}, ${x.b}) → <b>${fmt(x.m)}</b></span>`).join('') +
      (avgs.length === 6 ? `<div class="ck-sum">六个平均数：${avgs.map((x) => fmt(x.m)).sort((a, b) => a - b).join(', ')}；再平均：(${avgs.map((x) => fmt(x.m)).join(' + ')}) ÷ 6 = <b>${fmt(avgs.reduce((s, x) => s + x.m, 0) / 6)}</b></div>` : '');
    if (avgs.length === 6) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ck-reset')) { pairs.clear(); paint(); return; }
    const g = e.target.closest('.ck-n'); if (!g) return;
    const n = +g.dataset.n, a = n > 6 ? n - 6 : n;
    if (!pairs.has(a)) { pairs.set(a, true); api.say(`${a} 的正对面是 ${a + 6}，平均数是 (${a} + ${a + 6}) ÷ 2 = ${fmt((2 * a + 6) / 2)}。`); }
    paint();
  });
  paint();
}

// ── 旋转长方形（2025 第 10 题） ──
function rotate(box, p, api) {
  const u = 40, ox = 60, oy = 50;  // 坐标：A(0,3) B(5,3) C(5,0) D(0,0)，中心 M(2.5,0)
  const X = (x) => ox + x * u, Y = (y) => oy + (3 - y) * u;
  box.innerHTML = SVG(340, 300, `<rect x="${X(0)}" y="${Y(3)}" width="${5 * u}" height="${3 * u}" class="rt-a"/>
    <g class="rt-b"></g><rect class="rt-ov" x="${X(2.5)}" y="${Y(2.5)}" width="${2.5 * u}" height="${2.5 * u}" opacity="0"/>
    <circle cx="${X(2.5)}" cy="${Y(0)}" r="4" class="rt-m"/>${T(X(0) - 10, Y(3) - 6, 'A', { italic: true })}${T(X(5) + 10, Y(3) - 6, 'B', { italic: true })}
    ${T(X(5) + 12, Y(0) + 18, 'C', { italic: true })}${T(X(0) - 12, Y(0) + 18, 'D', { italic: true })}<g class="rt-lbl"></g>`) +
    bar(`<span class="rt-deg">0°</span><input type="range" min="0" max="90" step="5" value="0" class="rt-range" aria-label="旋转角度">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (deg) => {
    box.querySelector('.rt-deg').textContent = `${deg}°`;
    box.querySelector('.rt-b').innerHTML = `<rect x="${X(0)}" y="${Y(3)}" width="${5 * u}" height="${3 * u}" transform="rotate(${deg} ${X(2.5)} ${Y(0)})"/>`;
    const done = deg === 90;
    box.querySelector('.rt-ov').setAttribute('opacity', done ? 1 : 0);
    box.querySelector('.rt-lbl').innerHTML = done ? T(X(3.75), Y(2.5) - 8, '2.5', { size: 14, cls: 'st plum' }) + T(X(5) + 22, Y(1.25) + 5, '2.5', { size: 14, cls: 'st plum' }) : '';
    if (done) ok();
  };
  box.querySelector('.rt-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(0);
}

// ── 十字形区域里放最大的圆（2025 第 12 题） ──
function circle12(box, p, api) {
  const u = 44, o = 20, rows = [[2, 4], [1, 5], [0, 6], [0, 6], [1, 5], [2, 4]];
  let cells = ''; rows.forEach(([a, b], j) => { for (let i = a; i < b; i++) cells += `<rect x="${o + i * u}" y="${o + j * u}" width="${u}" height="${u}"/>`; });
  const notch = [[1, 1], [2, 1], [4, 1], [5, 1], [1, 5], [2, 5], [4, 5], [5, 5], [1, 2], [5, 2], [1, 4], [5, 4]]; // 凹角（相对左上角，单位格）
  const C = o + 3 * u;
  box.innerHTML = SVG(o * 2 + 6 * u, o * 2 + 6 * u, `<g class="c12-cells">${cells}</g><circle cx="${C}" cy="${C}" class="c12-c"/><g class="c12-n"></g><circle cx="${C}" cy="${C}" r="3" class="rt-m"/><line class="c12-r" x1="${C}" y1="${C}"/>`) +
    bar(`<span class="c12-info"></span><input type="range" min="1.5" max="3" step="0.01" value="1.8" class="c12-range" aria-label="半径">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (r) => {
    const fits = r * r <= 5 + 1e-9;
    const c = box.querySelector('.c12-c'); c.setAttribute('r', r * u); c.classList.toggle('bad', !fits);
    box.querySelector('.c12-r').setAttribute('x2', C + r * u); box.querySelector('.c12-r').setAttribute('y2', C);
    box.querySelector('.c12-n').innerHTML = notch.map(([x, y]) => { const hit = Math.abs(Math.hypot(x - 3, y - 3) - r) < 0.04 || (!fits && Math.hypot(x - 3, y - 3) < r); return `<circle cx="${o + x * u}" cy="${o + y * u}" r="${hit ? 6 : 3}" class="${hit ? 'hit' : ''}"/>`; }).join('');
    box.querySelector('.c12-info').innerHTML = `半径 <b>${r.toFixed(2)}</b>，r² = ${(r * r).toFixed(2)} · ${fits ? (5 - r * r < 0.12 ? '<b class="plum">正好碰到凹角</b>' : '放得下') : '<b class="bad">超出了</b>'}`;
    if (fits && 5 - r * r < 0.12) ok();
  };
  box.querySelector('.c12-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(1.8);
}

// ── 余数直方图（2025 第 13 题） ──
function hist(box, p, api) {
  const nums = []; for (let x = p.from; x <= p.to; x += p.step) nums.push(x);
  let k = 0;
  box.innerHTML = `<div class="hs-chips">${nums.map((x, i) => `<span class="hs-c" data-i="${i}">${x}<small></small></span>`).join('')}</div>
    <div class="hs-bars">${Array.from({ length: p.m }, (_, r) => `<div class="hs-b"><span class="hs-v"></span><i></i><em>余 ${r}</em></div>`).join('')}</div>` +
    bar(`<span class="hs-info"></span>${btn('hs-next', '算下一个')}${btn('hs-all', '一口气算完')}${btn('hs-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const cnt = Array(p.m).fill(0);
    box.querySelectorAll('.hs-c').forEach((c, i) => { const done = i < k; c.classList.toggle('on', done); c.classList.toggle('cyc', done && (i % p.m === 0)); c.querySelector('small').textContent = done ? nums[i] % p.m : ''; if (done) cnt[nums[i] % p.m]++; });
    const max = Math.ceil(nums.length / p.m);
    box.querySelectorAll('.hs-b').forEach((b, r) => { b.querySelector('i').style.height = `${(cnt[r] / max) * 100}%`; b.querySelector('.hs-v').textContent = cnt[r] || ''; b.classList.toggle('hi', k === nums.length && cnt[r] === max); });
    box.querySelector('.hs-info').innerHTML = `已算 <b>${k}</b> / ${nums.length}`;
    if (k === nums.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.hs-reset')) k = 0;
    else if (e.target.closest('.hs-next')) { k = Math.min(nums.length, k + 1); if (k === p.m) api.say(`算到第 ${p.m} 个了，余数是 ${nums.slice(0, p.m).map((x) => x % p.m).join('、')}——下一个会是什么？`); }
    else if (e.target.closest('.hs-all')) k = nums.length;
    else return;
    paint();
  });
  paint();
}

// ── 插入一个数（2025 第 14 题） ──
function insertN(box, p, api) {
  box.innerHTML = `<div class="in-row"></div><div class="in-stat"></div>` + bar(`<span>N = <b class="in-n"></b></span><input type="range" min="${p.min}" max="${p.max}" step="1" value="${p.init}" class="in-range" aria-label="N">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (N) => {
    const all = [...p.list.map((v) => ({ v })), { v: N, n: true }].sort((a, b) => a.v - b.v || (a.n ? 1 : -1));
    const L = all.length, med = L % 2 ? all[(L - 1) / 2].v : (all[L / 2 - 1].v + all[L / 2].v) / 2;
    const mean = all.reduce((s, x) => s + x.v, 0) / L;
    box.querySelector('.in-n').textContent = N;
    box.querySelector('.in-row').innerHTML = all.map((x, i) => `<span class="in-c ${x.n ? 'n' : ''} ${L % 2 === 0 && (i === L / 2 - 1 || i === L / 2) ? 'mid' : ''}">${x.v}</span>`).join('');
    const k = p.k ?? 2, eq = Math.abs(mean - k * med) < 1e-9;
    box.querySelector('.in-stat').innerHTML = `中位数 <b>${fmt(med)}</b> · 平均数 <b>${fmt(mean)}</b>${k !== 1 ? ` · 中位数的 ${k} 倍 <b>${fmt(k * med)}</b>` : ''} ${eq ? '<b class="plum">✓ 相等</b>' : `<span class="muted">（差 ${fmt(Math.abs(mean - k * med))}）</span>`}`;
    if (eq) ok();
  };
  box.querySelector('.in-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(p.init);
}

// ── 对折（2025 第 15 题）：点格子涂银色，看金金对 ──
function fold(box, p, api) {
  const n = 6, u = 40, o = 16, half = n / 2, NS = p.silver || 13;
  let cells = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells += `<rect class="fd-c" data-r="${r}" data-c="${c}" x="${o + c * u}" y="${o + r * u}" width="${u}" height="${u}"/>`;
  box.innerHTML = SVG(o * 2 + n * u, o * 2 + n * u, `${cells}<g class="fd-pairs"></g><line class="fd-fold" x1="${o + half * u}" y1="4" x2="${o + half * u}" y2="${o * 2 + n * u - 4}"/>`) +
    bar(`<span class="fd-info"></span>${btn('fd-reset', '清空')}`);
  const silver = new Set();
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelectorAll('.fd-c').forEach((e) => e.classList.toggle('s', silver.has(`${e.dataset.r},${e.dataset.c}`)));
    let gg = 0, ss = 0, sg = 0, marks = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < half; c++) {
      const a = silver.has(`${r},${c}`), b = silver.has(`${r},${n - 1 - c}`);
      if (!a && !b) { gg++; marks += `<circle cx="${o + c * u + u / 2}" cy="${o + r * u + u / 2}" r="5" class="gg"/><circle cx="${o + (n - 1 - c) * u + u / 2}" cy="${o + r * u + u / 2}" r="5" class="gg"/>`; }
      else if (a && b) ss++; else sg++;
    }
    box.querySelector('.fd-pairs').innerHTML = marks;
    box.querySelector('.fd-info').innerHTML = `银色 <b>${silver.size}</b>/${NS} · 金金对 <b class="plum">${gg}</b> · 银银对 ${ss} · 银金对 ${sg}`;
    if (silver.size === NS && gg === p.target) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.fd-reset')) { silver.clear(); paint(); return; }
    const c = e.target.closest('.fd-c'); if (!c) return;
    const k = `${c.dataset.r},${c.dataset.c}`;
    if (silver.has(k)) silver.delete(k); else if (silver.size < NS) silver.add(k); else { api.say(`已经涂了 ${NS} 个银色。想换位置，先点一个银色格子取消。`); return; }
    paint();
  });
  paint();
}

// ── 配对选数（2025 第 16 题） ──
function pairs16(box, p, api) {
  const pick = Array(10).fill(null); // 'lo' | 'hi'
  box.innerHTML = `<div class="pr-grid">${Array.from({ length: 10 }, (_, i) => `<div class="pr-col"><button class="pr-b" data-i="${i}" data-w="hi">${i + 11}</button><span class="pr-line"></span><button class="pr-b" data-i="${i}" data-w="lo">${i + 1}</button></div>`).join('')}</div>` +
    bar(`<span class="pr-info"></span>${btn('pr-reset', '重选')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    box.querySelectorAll('.pr-b').forEach((b) => b.classList.toggle('on', pick[+b.dataset.i] === b.dataset.w));
    const lo = pick.filter((x) => x === 'lo').length, hi = pick.filter((x) => x === 'hi').length;
    const s = pick.reduce((a, x, i) => a + (x === 'lo' ? i + 1 : x === 'hi' ? i + 11 : 0), 0);
    box.querySelector('.pr-info').innerHTML = `1~10 选了 <b>${lo}</b> 个，11~20 选了 <b>${hi}</b> 个，和 = <b>${s}</b>`;
    if (lo === 5 && hi === 5) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.pr-reset')) { pick.fill(null); paint(); return; }
    const b = e.target.closest('.pr-b'); if (!b) return;
    const i = +b.dataset.i, w = b.dataset.w;
    if (pick[i] === w) pick[i] = null;
    else { if (pick[i]) api.say(`${i + 1} 和 ${i + 11} 相差 10，同一列只能选一个，已经帮你换过来了。`); pick[i] = w; }
    paint();
  });
  paint();
}

// ── 两车相遇（2025 第 19 题） ──
function cars(box, p, api) {
  const segs = [[0, 5, 25], [5, 10, 40], [10, 15, 20]];
  const speedAt = (x, dir) => { for (const [a, b, v] of segs) if (dir > 0 ? x >= a && x < b : x > a && x <= b) return v; return 0; };
  const simulate = (tmin) => { let a = 0, b = 15, t = 0; const dt = 1 / 600; while (t < tmin / 60 - 1e-9) { if (a >= b) break; a += speedAt(a, 1) * dt; b -= speedAt(b, -1) * dt; t += dt; } return { a: Math.min(a, (a + b) / 2), b: Math.max(b, (a + b) / 2), met: a >= b }; };
  const L = 40, W = 26;
  const X = (x) => L + x * W;
  let road = '';
  segs.forEach(([a, b, v], i) => { road += `<rect x="${X(a)}" y="70" width="${(b - a) * W}" height="20" class="cr-seg s${i}"/>${T(X((a + b) / 2), 58, `${v} mph`, { size: 13 })}${T(X((a + b) / 2), 112, '5 mi', { size: 12 })}`; });
  box.innerHTML = SVG(L * 2 + 15 * W, 130, `${road}${T(X(0) - 16, 86, 'A', { italic: true })}${T(X(15) + 16, 86, 'B', { italic: true })}<g class="cr-cars"></g>`) +
    `<div class="cr-info"></div>` + bar(`<span>时间 <b class="cr-t"></b> 分钟</span><input type="range" min="0" max="20" step="0.25" value="0" class="cr-range" aria-label="时间">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (tm) => {
    const s = simulate(tm);
    box.querySelector('.cr-t').textContent = fmt(tm);
    box.querySelector('.cr-cars').innerHTML = `<circle cx="${X(s.a)}" cy="80" r="9" class="cr-a"/><circle cx="${X(s.b)}" cy="80" r="9" class="cr-b"/>` + (s.met ? `<line x1="${X(s.a)}" y1="40" x2="${X(s.a)}" y2="100" class="cr-meet"/>` : '');
    box.querySelector('.cr-info').innerHTML = s.met ? `<b class="plum">相遇！</b>在离 A <b>${fmt(Math.round(s.a * 4) / 4)}</b> 英里处` :
      `A 车在 <b>${fmt(Math.round(s.a * 100) / 100)}</b>（速度 ${speedAt(s.a, 1)}）· B 车在 <b>${fmt(Math.round(s.b * 100) / 100)}</b>（速度 ${speedAt(s.b, -1)}）· 相距 ${fmt(Math.round((s.b - s.a) * 100) / 100)}`;
    if (s.met) ok();
  };
  box.querySelector('.cr-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(0);
}

// ── 切奶酪（2025 第 20 题） ──
function cheese(box, p, api) {
  const names = ['Sarika', 'Dev', 'Rajiv'];
  const cuts = [];
  box.innerHTML = `<div class="ch-bar"></div><div class="ch-tot"></div>` + bar(`${btn('ch-next', '切下一刀')}${btn('ch-many', '一直切下去')}${btn('ch-reset', '重来')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    let left = 1; const tot = [0, 0, 0];
    const parts = cuts.map((_, i) => { const w = left / 2; left -= w; tot[i % 3] += w; return { w, who: i % 3 }; });
    box.querySelector('.ch-bar').innerHTML = parts.map((x) => `<span class="w${x.who}" style="width:${x.w * 100}%"></span>`).join('') + `<span class="rest" style="width:${left * 100}%"></span>`;
    box.querySelector('.ch-tot').innerHTML = names.map((n, i) => `<span class="w${i}"><i></i>${n}：<b>${(tot[i] * 100).toFixed(1)}%</b></span>`).join('') + `<span class="muted">剩下 ${(left * 100).toFixed(2)}%（切了 ${cuts.length} 刀）</span>`;
    if (cuts.length >= 9) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.ch-reset')) cuts.length = 0;
    else if (e.target.closest('.ch-next')) { cuts.push(1); if (cuts.length === 3) api.say('第一轮：Sarika 吃了 1/2，Dev 吃了 1/4，Rajiv 吃了 1/8。比一比，是 4 : 2 : 1。'); }
    else if (e.target.closest('.ch-many')) while (cuts.length < 15) cuts.push(1);
    else return;
    paint();
  });
  paint();
}

// ── 填年级（2025 第 21 题）：相连的两个区至少差 2 ──
function assign(box, p, api) {
  const N = p.nodes, E = p.edges;
  const val = {};
  let cur = null;
  const edge = ([u, v, q], cls) => { const [x1, y1] = N[u], [x2, y2] = N[v]; return `<path d="M${x1},${y1} ${q ? `Q${q[0]},${q[1]} ` : 'L'}${x2},${y2}" class="${cls}"/>`; };
  const NG = p.n || 7, ALL = Object.keys(N).length;
  box.innerHTML = SVG(p.vw || 380, p.vh || 280, `<g class="as-e"></g><g class="as-n"></g>`) +
    `<div class="as-pal">${Array.from({ length: NG }, (_, i) => i + 1).map((g) => `<button class="as-g" data-g="${g}">${g}</button>`).join('')}</div>` +
    bar(`<span class="as-info"></span>${btn('as-reset', '清空')}`);
  const ok = once(() => api.solved(p.say_ok));
  const paint = () => {
    const bad = E.filter(([u, v]) => val[u] && val[v] && Math.abs(val[u] - val[v]) < 2);
    box.querySelector('.as-e').innerHTML = E.map((e) => edge(e, bad.includes(e) ? 'bad' : (val[e[0]] && val[e[1]] ? 'okk' : ''))).join('');
    box.querySelector('.as-n').innerHTML = Object.entries(N).map(([k, [x, y]]) => `<g class="as-node ${cur === k ? 'cur' : ''} ${p.mark?.includes(k) ? 'mark' : ''}" data-k="${k}"><rect x="${x - 22}" y="${y - 17}" width="44" height="34" rx="6"/>${T(x - 9, y + 5, k, { italic: true, size: 15 })}${T(x + 10, y + 6, val[k] || '', { size: 16, cls: 'st plum' })}</g>`).join('');
    const used = new Set(Object.values(val));
    box.querySelectorAll('.as-g').forEach((b) => b.classList.toggle('used', used.has(+b.dataset.g)));
    const n = Object.keys(val).length;
    box.querySelector('.as-info').innerHTML = cur ? `给 <b>${cur}</b> 选一个年级` : `已填 ${n}/${ALL}${bad.length ? ` · <b class="bad">${bad.length} 条走道两端只差 1</b>` : ''}`;
    if (n === ALL && !bad.length) ok();
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.as-reset')) { for (const k in val) delete val[k]; cur = null; paint(); return; }
    const nd = e.target.closest('.as-node');
    if (nd) { cur = nd.dataset.k; if (val[cur]) delete val[cur]; paint(); return; }
    const g = e.target.closest('.as-g');
    if (g && cur) {
      const gv = +g.dataset.g;
      for (const k in val) if (val[k] === gv) delete val[k];
      val[cur] = gv; cur = null; paint();
      const bad = E.filter(([u, v]) => val[u] && val[v] && Math.abs(val[u] - val[v]) < 2);
      if (bad.length) api.say(`红色的走道两端年级只差 1，不行。换一换？`);
    } else if (g) api.say('先点一个区，再点年级。');
  });
  paint();
}

// ── 挂衣钩（2025 第 22 题） ──
function hooks(box, p, api) {
  const H = 35, found = new Set();
  box.innerHTML = `<div class="hk-row"></div><div class="hk-info"></div><div class="hk-found"></div>` +
    bar(`<span>外套 <b class="hk-c"></b> 件</span><input type="range" min="1" max="34" step="1" value="1" class="hk-range" aria-label="外套件数">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (c) => {
    const e = (H - c) / (c + 1), good = Number.isInteger(e) && e >= 1;
    box.querySelector('.hk-c').textContent = c;
    let html = '';
    if (good) { for (let i = 0; i < H; i++) html += `<i class="${(i + 1) % (e + 1) === 0 ? 'coat' : ''}"></i>`; }
    else for (let i = 0; i < H; i++) html += '<i></i>';
    box.querySelector('.hk-row').innerHTML = html;
    box.querySelector('.hk-info').innerHTML = `空钩 ${H} − ${c} = ${H - c} 个，分成 ${c} + 1 = ${c + 1} 段，每段 ${fmt((H - c) / (c + 1))} 个 · ${good ? '<b class="plum">✓ 可以</b>' : '<span class="bad">✗ 分不均</span>'}`;
    if (good && !found.has(c)) { found.add(c); api.say(`${c} 件可以！每两件之间 ${e} 个空钩。已经找到 ${found.size} 种。`); }
    box.querySelector('.hk-found').innerHTML = `找到：${[...found].sort((a, b) => a - b).map((x) => `<span>${x}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (found.size === 7) ok();
  };
  box.querySelector('.hk-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(1);
}

// ── 平方差（2025 第 23 题） ──
function n2(box, p, api) {
  const ns = [40, 50, 60, 70, 80, 90, 100];
  const seen = new Set();
  box.innerHTML = `<div class="n2-list">${ns.map((n) => `<button class="n2-r" data-n="${n}"><b>${n}² − 1</b><span></span></button>`).join('')}</div>` + bar(`<span class="n2-info"></span>`);
  const ok = once(() => api.solved(p.say_ok));
  const fac = (x) => { if (isPrime(x)) return `${x}（质数）`; for (let d = 2; d * d <= x; d++) if (x % d === 0) return `${x} = ${d}×${x / d}`; return x; };
  const paint = () => {
    box.querySelectorAll('.n2-r').forEach((b) => {
      const n = +b.dataset.n, s = seen.has(n), good = isPrime(n - 1) && isPrime(n + 1);
      b.classList.toggle('on', s); b.classList.toggle('good', s && good);
      b.querySelector('span').innerHTML = s ? `= ${n * n - 1} = ${n - 1} × ${n + 1}　<small>${fac(n - 1)}，${fac(n + 1)}</small> ${good ? '✓' : '✗'}` : '点一下拆开看';
    });
    box.querySelector('.n2-info').innerHTML = `检查了 ${seen.size}/7，符合的有 <b>${[...seen].filter((n) => isPrime(n - 1) && isPrime(n + 1)).length}</b> 个`;
    if (seen.size === 7) ok();
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('.n2-r'); if (b) { seen.add(+b.dataset.n); paint(); } });
  paint();
}

// ── 60° 梯形（2025 第 24 题） ──
function trap(box, p, api) {
  const found = new Set();
  box.innerHTML = SVG(360, 190, `<g class="tz-g"></g>`) + `<div class="hk-info tz-info"></div><div class="hk-found tz-found"></div>` +
    bar(`<span>腰长 L = <b class="tz-l"></b></span><input type="range" min="1" max="10" step="1" value="1" class="tz-range" aria-label="腰长">`);
  const ok = once(() => api.solved(p.say_ok));
  const draw = (L) => {
    const a = (30 - 3 * L) / 2, good = Number.isInteger(a) && a >= 1;
    box.querySelector('.tz-l').textContent = L;
    const s = 300 / (Math.max(a, 0) + L + 0.001), k = Math.min(s, 22);
    const bw = (a + L) * k, h = L * k * Math.sqrt(3) / 2, x0 = 180 - bw / 2, y0 = 170;
    box.querySelector('.tz-g').innerHTML = a > 0 ? `<polygon points="${x0},${y0} ${x0 + bw},${y0} ${x0 + bw - L * k / 2},${y0 - h} ${x0 + L * k / 2},${y0 - h}" class="${good ? 'good' : ''}"/>
      ${T(180, y0 - h - 8, `上底 ${fmt(a)}`, { size: 13 })}${T(180, y0 + 16, `下底 ${fmt(a + L)}`, { size: 13 })}${T(x0 + L * k / 4 - 18, y0 - h / 2, `${L}`, { size: 13 })}${T(x0 + bw - L * k / 4 + 18, y0 - h / 2, `${L}`, { size: 13 })}` :
      T(180, 100, '上底变成 0 或负数，围不成梯形了', { size: 14, cls: 'st bad' });
    box.querySelector('.tz-info').innerHTML = `周长 = 上底 + 下底 + 2 腰 = 2×上底 + 3L = 30 → 上底 = (30 − ${3 * L}) ÷ 2 = <b>${fmt(a)}</b> · ${good ? '<b class="plum">✓ 都是正整数</b>' : '<span class="bad">✗ 不行</span>'}`;
    if (good && !found.has(L)) { found.add(L); api.say(`L = ${L} 可以：上底 ${a}，下底 ${a + L}。已经找到 ${found.size} 个。`); }
    box.querySelector('.tz-found').innerHTML = `找到：${[...found].sort((x, y) => x - y).map((x) => `<span>L=${x}</span>`).join('') || '<span class="muted">还没有</span>'}`;
    if (found.size === 4) ok();
  };
  box.querySelector('.tz-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(1);
}

// ── 菱形网格路径与镜像（2025 第 25 题） ──
function mirror(box, p, api) {
  const n = 5, u = 30;
  const randPath = () => { const a = Array(n).fill('R').concat(Array(n).fill('U')); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const area = (path) => { let y = 0, s = 0; for (const st of path) { if (st === 'R') s += y; else y++; } return s; };
  let path = p.path ? p.path.split('') : randPath(), mirrored = false, mirrors = 0;
  // 未旋转坐标 (x,y)，R: x+1，U: y+1；显示时旋转 45°：屏幕 = 底点 + x·(东北) + y·(西北)
  const S = (x, y) => [150 + (x - y) * u * 0.7071, 250 - (x + y) * u * 0.7071];
  const draw1 = (pp) => {
    let g = '', shade = '', y = 0, x = 0;
    for (const st of pp) { if (st === 'R') { for (let j = 0; j < y; j++) { const q = [S(x, j), S(x + 1, j), S(x + 1, j + 1), S(x, j + 1)]; shade += `<polygon points="${q.map((v) => v.join(',')).join(' ')}"/>`; } x++; } else y++; }
    for (let i = 0; i <= n; i++) { const [a1, b1] = S(i, 0), [a2, b2] = S(i, n), [c1, d1] = S(0, i), [c2, d2] = S(n, i); g += `<line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}"/><line x1="${c1}" y1="${d1}" x2="${c2}" y2="${d2}"/>`; }
    x = 0; y = 0; let d = `M${S(0, 0).join(',')}`;
    for (const st of pp) { if (st === 'R') x++; else y++; d += ` L${S(x, y).join(',')}`; }
    return `<g class="mr-sh">${shade}</g><g class="gl">${g}</g><path d="${d}" class="mr-p"/>`;
  };
  box.innerHTML = `<div class="mr-two"><div class="mr-a"></div><div class="mr-b"></div></div><div class="mr-info"></div>` + bar(`${btn('mr-flip', '左右翻折')}${btn('mr-new', '换一条路径')}`);
  const ok = once(() => api.solved(p.say_ok));
  const flip = (pp) => pp.map((s) => (s === 'R' ? 'U' : 'R'));
  const paint = () => {
    const A = area(path);
    box.querySelector('.mr-a').innerHTML = SVG(300, 270, draw1(path)) + `<p>右侧面积 <b>${A}</b></p>`;
    box.querySelector('.mr-b').innerHTML = mirrored ? SVG(300, 270, draw1(flip(path))) + `<p>翻折后右侧面积 <b>${area(flip(path))}</b></p>` : '<p class="muted">点「左右翻折」</p>';
    box.querySelector('.mr-info').innerHTML = mirrored ? `${A} + ${area(flip(path))} = <b class="plum">${A + area(flip(path))}</b>（正好是整个网格）` : '';
  };
  box.addEventListener('click', (e) => {
    if (e.target.closest('.mr-flip')) { mirrored = true; mirrors++; paint(); if (mirrors >= 2) ok(); else api.say('两条路径的右侧面积加起来是 25。再换一条路径翻折试试？'); }
    else if (e.target.closest('.mr-new')) { path = randPath(); mirrored = false; paint(); }
  });
  paint();
}


// ── 两个圆的阴影面积（2025 第 18 题） ──
function circles18(box, p, api) {
  const k = 34;
  box.innerHTML = SVG(380, 230, `<g class="c18"></g>`) + `<div class="c18-info"></div>` +
    bar(`<span>R = <b class="c18-r"></b></span><input type="range" min="1" max="3" step="0.1" value="1.4" class="c18-range" aria-label="R">`);
  const ok = once(() => api.solved(p.say_ok));
  const ring = (cx, cy, r, quarter) => {
    const h = r / Math.SQRT2;
    const sq = `<rect x="${cx - h}" y="${cy - h}" width="${2 * h}" height="${2 * h}" class="c18-sq"/>`;
    const sh = quarter ? `<path d="M${cx + h},${cy - h} A${r} ${r} 0 0 1 ${cx + h},${cy + h} Z" class="c18-sh"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" class="c18-sh"/>${sq.replace('c18-sq', 'c18-hole')}`;
    return `${sh}<circle cx="${cx}" cy="${cy}" r="${r}" class="c18-o"/>${sq}`;
  };
  const draw = (R) => {
    const left = Math.PI - 2, right = R * R * (Math.PI - 2) / 4;
    box.querySelector('.c18-r').textContent = R.toFixed(1);
    box.querySelector('.c18').innerHTML = ring(80, 115, 1 * k, false) + ring(250, 115, R * k, true) + T(80, 215, 'r = 1', { size: 13 }) + T(250, 215, `R = ${R.toFixed(1)}`, { size: 13 });
    const eq = Math.abs(left - right) < 1e-6;
    box.querySelector('.c18-info').innerHTML = `左边阴影 π − 2 ≈ <b>${left.toFixed(2)}</b> · 右边阴影 ¼ × ${(R * R).toFixed(2)} × (π − 2) ≈ <b>${right.toFixed(2)}</b> ${eq ? '<b class="plum">✓ 相等</b>' : ''}`;
    if (eq) ok();
  };
  box.querySelector('.c18-range').addEventListener('input', (e) => draw(+e.target.value));
  draw(1.4);
}

import { SIMS24 } from './sims24.js';
export const SIMS = { ...SIMS24, circles18,  tap, sum, seq, deal, erase, clock, rotate, circle12, hist, insertN, fold, pairs16, cars, cheese, assign, hooks, n2, trap, mirror };
