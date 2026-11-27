// 互动课播放器（沿用 learn-inside 学习页的样式与交互：进度条、小助手气泡、播放 / 上一步 / 下一步、朗读、「轮到你了」）
// 用于：知识点课（会员）和题目的互动解析（会员）。
//
// 课程数据：{ title, steps: [step...] }
// step 通用字段：type、say（小助手说的话，支持 $公式$ 和 **加粗**）、html（屏幕上的主要内容，可选）
//   info   讲一句
//   tabs   几个按钮换着看：tabs: [{ label, html, say }]
//   quiz   选择题：q, opts: [...], a: 正确下标, why: [每个选项答错时的提示]（可选）, ok: 答对时说的话
//   pick2  两个说法选一个（同 quiz，选项是句子）
//   recall 合上书想一想：q, ans（点开才看答案）
//   grid   方格路线：grid: { cols, rows, pts: { F: [x, y] }, paths: [[...]], mode: 'show' | 'draw', from, to, best, dir }
//   here   全景图：items: [{ t, d, on }]
// 旧格式 [{title, body}] 自动当作 info。

import { SIMS } from './sims.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 公式里的 < > 在 HTML 字段里会被当成标签吃掉：换成 \lt \gt
const ltgt = (h) => (typeof h === 'string' && h.includes('$') ? h.replace(/\$[^$]+\$/g, (m) => m.replace(/</g, '\\lt ').replace(/>/g, '\\gt ')) : h);
// 选择题选项按固定顺序打乱（同一步每次打开顺序一样）；带编号的选项、「以上都…」不动
const hash = (t) => { let x = 2166136261; for (const c of t) x = Math.imul(x ^ c.codePointAt(0), 16777619); return x >>> 0; };
function optOrder(s, seed) {
  const idx = s.opts.map((_, k) => k);
  if (s.opts.length < 2 || s.keep_order || s.opts.some((o) => /^\s*(选项\s*\d|[A-Ea-e][.、:：）)]|[①②③④⑤])/.test(o)) || /选项|上面|下面|前一个|后一个/.test((s.q || '') + (s.say || ''))) return idx;
  const free = idx.filter((k) => !/以上|都不对|都对/.test(s.opts[k]));
  let x = hash(seed + s.opts.join('|')) || 1;
  const perm = free.slice();
  for (let k = perm.length - 1; k > 0; k--) { x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0; const j = x % (k + 1); [perm[k], perm[j]] = [perm[j], perm[k]]; }
  free.forEach((k, n) => { idx[k] = perm[n]; });
  return idx;
}
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const typeset = (el) => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); };
// 答案全是数字才弹数字键盘；有汉字、符号（星期日、<）就用普通键盘
const imode = (a) => ((a || []).every((x) => /^[\d.,\-\/:]*$/.test(String(x))) ? 'decimal' : 'text');
const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ───────── 朗读 ─────────
const voice = {
  on: (() => { try { return localStorage.getItem('amc8.voice') !== '0'; } catch { return true; } })(),
  set(v) { this.on = v; try { localStorage.setItem('amc8.voice', v ? '1' : '0'); } catch {} if (!v) this.stop(); },
  plain(s) {
    return String(s || '').replace(/\$([^$]+)\$/g, (_, m) => m
      .replace(/\\times/g, '乘').replace(/\\div/g, '除以').replace(/\\sqrt\{?(\w+)\}?/g, '根号$1').replace(/\\tfrac\{(\w+)\}\{(\w+)\}|\\frac\{(\w+)\}\{(\w+)\}/g, (_, a, b, c, d) => `${b || d}分之${a || c}`)
      .replace(/\\to/g, '到').replace(/[{}\\]/g, '').replace(/\^2/g, '的平方'))
      .replace(/\*\*/g, '').replace(/→/g, '到');
  },
  speak(text, done) {
    this.stop();
    const t = this.plain(text);
    const fallback = () => { this._t = setTimeout(done, Math.max(1800, t.length * 230)); };
    if (!this.on || !t || !window.speechSynthesis) return fallback();
    try {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'zh-CN'; u.rate = 1.02;
      const zh = speechSynthesis.getVoices().find((v) => /zh[-_]CN/i.test(v.lang));
      if (zh) u.voice = zh;
      let fired = false;
      const fin = () => { if (!fired) { fired = true; done(); } };
      u.onend = fin; u.onerror = () => { fired = true; fallback(); };
      this._t = setTimeout(fin, t.length * 400 + 4000); // 有的浏览器不触发 onend
      speechSynthesis.speak(u);
    } catch { fallback(); }
  },
  stop() { clearTimeout(this._t); try { window.speechSynthesis?.cancel(); } catch {} },
};

// ───────── 方格路线组件 ─────────
const COLORS = ['var(--lp-jade)', 'var(--lp-plum)', 'var(--lp-warn)'];
function gridWidget(cfg, onSolved, setSay) {
  const c = cfg.cell || 36, pad = 26;
  const W = cfg.cols * c + pad * 2, H = cfg.rows * c + pad * 2;
  const X = (x) => pad + x * c, Y = (y) => pad + (cfg.rows - y) * c;
  const P = (v) => (typeof v === 'string' ? cfg.pts[v] : v);
  const wrap = document.createElement('div');
  wrap.className = 'lp-grid';
  let lines = '';
  for (let i = 0; i <= cfg.cols; i++) lines += `<line x1="${X(i)}" y1="${Y(0)}" x2="${X(i)}" y2="${Y(cfg.rows)}"/>`;
  for (let j = 0; j <= cfg.rows; j++) lines += `<line x1="${X(0)}" y1="${Y(j)}" x2="${X(cfg.cols)}" y2="${Y(j)}"/>`;
  const pts = Object.entries(cfg.pts || {}).map(([k, [x, y]]) =>
    `<g class="pt"><circle cx="${X(x)}" cy="${Y(y)}" r="12"/><text x="${X(x)}" y="${Y(y) + 5}">${k}</text></g>`).join('');
  // 路线画法：dir=true 时横段深青、竖段粉色，用来看出“横 + 竖”
  const seg = (a, b, color, dir) => {
    const col = dir ? (a[1] === b[1] ? 'var(--lp-jade)' : 'var(--lp-plum)') : color;
    return `<line class="route" x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" style="stroke:${col}"/>`;
  };
  const expand = (path) => { // 把 [F, [6,3], A] 这类拐点展开成一格一格
    const out = [P(path[0])];
    for (let i = 1; i < path.length; i++) {
      const [x2, y2] = P(path[i]);
      let [x, y] = out[out.length - 1];
      while (x !== x2) { x += Math.sign(x2 - x); out.push([x, y]); }
      while (y !== y2) { y += Math.sign(y2 - y); out.push([x, y]); }
    }
    return out;
  };
  const shown = (cfg.paths || []).map((p, i) => {
    const cells = expand(p);
    return cells.slice(1).map((b, k) => seg(cells[k], b, COLORS[i % 3], cfg.dir)).join('');
  }).join('');
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="lp-gsvg"><g class="gl">${lines}</g><g class="routes">${shown}</g><g class="drawn"></g>${pts}<g class="hits"></g></svg>`;
  wrap.innerHTML = svg + (cfg.mode === 'draw' ? '<div class="lp-gbar"><span class="lp-count">已走 0 格</span><button class="lp-ghost lp-reset">重画</button></div>' : (cfg.caption ? `<div class="lp-gbar"><span>${md(cfg.caption)}</span></div>` : ''));
  if (cfg.mode !== 'draw') return wrap;

  // 画路线：从 from 出发，点相邻的路口一格一格走，点上一个路口可以退回
  const el = (q) => wrap.querySelector(q);
  const from = P(cfg.from), to = P(cfg.to);
  const best = cfg.best ?? Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
  let path = [from], done = false;
  const hits = [];
  for (let i = 0; i <= cfg.cols; i++) for (let j = 0; j <= cfg.rows; j++)
    hits.push(`<circle class="hit" data-x="${i}" data-y="${j}" cx="${X(i)}" cy="${Y(j)}" r="${c * 0.42}"/>`);
  el('.hits').innerHTML = hits.join('');
  const draw = () => {
    el('.drawn').innerHTML = path.slice(1).map((b, k) => seg(path[k], b, 'var(--lp-plum)', cfg.dir)).join('') +
      `<circle class="head" cx="${X(path[path.length - 1][0])}" cy="${Y(path[path.length - 1][1])}" r="6"/>`;
    el('.lp-count').textContent = `已走 ${path.length - 1} 格`;
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.lp-reset')) { path = [from]; done = false; wrap.classList.remove('ok'); draw(); setSay(cfg.say_reset || '重新来，从起点出发，一格一格点路口。'); return; }
    const h = e.target.closest('.hit');
    if (!h || done) return;
    const p = [+h.dataset.x, +h.dataset.y], cur = path[path.length - 1];
    if (path.length > 1 && p[0] === path[path.length - 2][0] && p[1] === path[path.length - 2][1]) { path.pop(); draw(); return; }
    if (Math.abs(p[0] - cur[0]) + Math.abs(p[1] - cur[1]) !== 1) { setSay('只能沿着街道走到**相邻**的路口哦，不能跳格，也不能斜着穿过街区。'); return; }
    path.push(p); draw();
    if (p[0] === to[0] && p[1] === to[1]) {
      const n = path.length - 1;
      if (n === best) { done = true; wrap.classList.add('ok'); onSolved(cfg.say_ok || `走了 ${n} 格，到啦！这就是最短的。`); }
      else setSay(cfg.say_long ? cfg.say_long.replace('{n}', n) : `到了，不过走了 ${n} 格。有没有更短的走法？点「重画」再试试。`);
    }
  });
  draw();
  return wrap;
}

// ───────── 读题：荧光笔划重点、红笔圈出关键处、旁边手写批注 ─────────
// text 里：[[h:要求的 / 重点]] 荧光笔；[[o1:关键条件]] 红笔圈，编号 1 对应 notes 里的批注；[[u2:…]] 红笔波浪线。
// notes=[[1, '看到「同样长」→ 差会不会变？'], …]
function readWidget(s, animate) {
  const box = document.createElement('div');
  box.className = 'lp-read';
  const marks = [];
  const html = md(s.text || '').replace(/\[\[([hou])(\d*):(.+?)\]\]/g, (_, k, n, t) => { marks.push({ k, n }); return `<span class="rd-m" data-m="${marks.length - 1}">${t}</span>`; });
  const notes = (s.notes || []).map(([n, t]) => ({ n: String(n), t }));
  box.innerHTML = `<svg class="rd-svg under"></svg><p class="rd-text">${html}</p><svg class="rd-svg over"></svg>` +
    (notes.length ? `<div class="rd-notes">${notes.map((x) => `<div class="rd-note" data-n="${x.n}">${x.n ? `<span class="rd-n">${x.n}</span>` : ''}${md(x.t)}</div>`).join('')}</div>` : '');
  const order = [];
  marks.forEach((m, k) => { order.push({ m: k }); if (m.n) notes.filter((x) => x.n === m.n).forEach((x) => order.push({ note: x.n })); });
  notes.forEach((x) => { if (!order.some((o) => o.note === x.n)) order.push({ note: x.n }); });
  const delay = {}; order.forEach((o, k) => { delay[o.m !== undefined ? 'm' + o.m : 'n' + o.note] = 0.25 + k * 0.75; });
  let first = animate;
  const jit = (k) => (Math.sin(k * 12.9898) * 43758.5453) % 1;
  const draw = () => {
    const under = box.querySelector('.rd-svg.under'), over = box.querySelector('.rd-svg.over');
    const B = box.getBoundingClientRect();
    if (!B.width) return;
    let u = '', o = '';
    box.querySelectorAll('.rd-m').forEach((el) => {
      const k = +el.dataset.m, m = marks[k], d = first ? delay['m' + k] : 0;
      const cls = first ? ' rd-draw' : '';
      // 公式会拆成很多小框：同一行的并成一个
      const rs = [];
      [...el.getClientRects()].filter((r) => r.width > 0.5).forEach((r) => {
        const a = { x: r.left - B.left, y: r.top - B.top, w: r.width, h: r.height };
        const L = rs.find((q) => Math.abs((q.y + q.h / 2) - (a.y + a.h / 2)) < Math.max(q.h, a.h) * 0.6);
        if (!L) { rs.push(a); return; }
        const x1 = Math.min(L.x, a.x), y1 = Math.min(L.y, a.y), x2 = Math.max(L.x + L.w, a.x + a.w), y2 = Math.max(L.y + L.h, a.y + a.h);
        Object.assign(L, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      });
      rs.forEach((r, j) => {
        const st = (len) => ` style="--len:${Math.ceil(len)};--d:${(d + j * 0.25).toFixed(2)}s"`;
        if (m.k === 'h') {
          const y = r.y + r.h * 0.62, a = jit(k + j) * 2;
          u += `<path class="rd-hl${cls}" stroke-width="${(r.h * 0.5).toFixed(1)}" d="M${r.x - 2},${y + a} L${r.x + r.w + 2},${y - a}"${st(r.w + 4)}/>`;
        } else if (m.k === 'o') {
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + 6, ry = r.h / 2 + 2, t0 = -2.6 + jit(k) * 0.4;
          let pth = '';
          for (let q = 0; q <= 44; q++) { const t = t0 + (q / 40) * Math.PI * 2, f = 1 + 0.05 * Math.sin(q * 0.7 + k); pth += `${q ? 'L' : 'M'}${(cx + rx * f * Math.cos(t)).toFixed(1)},${(cy + ry * f * Math.sin(t)).toFixed(1)}`; }
          o += `<path class="rd-pen${cls}" d="${pth}"${st(Math.PI * (rx + ry) * 1.15)}/>`;
          if (m.n && j === rs.length - 1) o += `<text class="rd-num" x="${(cx + rx + 2).toFixed(1)}" y="${(cy - ry + 2).toFixed(1)}">${m.n}</text>`;
        } else {
          const y = r.y + r.h - 2; let pth = `M${r.x},${y}`;
          for (let x = r.x; x < r.x + r.w; x += 8) pth += ` q2,3 4,0 t4,0`;
          o += `<path class="rd-pen${cls}" d="${pth}"${st(r.w * 1.3)}/>`;
          if (m.n && j === rs.length - 1) o += `<text class="rd-num" x="${(r.x + r.w + 3).toFixed(1)}" y="${(y + 2).toFixed(1)}">${m.n}</text>`;
        }
      });
    });
    under.innerHTML = u; over.innerHTML = o;
    box.querySelectorAll('.rd-note').forEach((el) => {
      if (first) { el.classList.add('rd-anim'); el.style.setProperty('--d', `${delay['n' + el.dataset.n] || 0}s`); }
    });
    first = false;
  };
  // 字体、公式晚到会改变排版：尺寸一变就重画（第一次画不出来时也靠这里补上）
  let want = false, sz = '';
  box.draw = () => { want = true; draw(); };
  const again = () => { const z = `${box.clientWidth}x${box.clientHeight}`; if (want && z !== sz) { sz = z; draw(); } };
  if (window.ResizeObserver) new ResizeObserver(again).observe(box);
  document.fonts?.addEventListener?.('loadingdone', () => { if (box.isConnected && want) { sz = ''; again(); } });
  return box;
}

// ───────── 播放器 ─────────
export function mountPlayer(root, lesson, { onDone, doneLabel = '学完了', onClose } = {}) {
  const steps = (lesson.steps || lesson).map((s) => (s.type ? s : { type: 'info', say: s.body, html: s.title ? `<div class="lp-h">${md(s.title)}</div>` : '' }));
  steps.forEach((s, k) => {
    if (s.html) s.html = ltgt(s.html);
    if (s.tabs) s.tabs.forEach((t) => { if (t.html) t.html = ltgt(t.html); });
    if (s.sim === 'frames' && s.frames) s.frames.forEach((f) => { if (f.info) f.info = ltgt(f.info); });
    if ((s.type === 'quiz' || s.type === 'pick2') && s.opts && !s._order) s._order = optOrder(s, `${lesson.title || ''}#${k}`);
  });
  let i = 0, playing = false, solved = new Set();
  root.innerHTML = `<div class="lp">
    ${lesson.title ? `<div class="lp-title"><span>${md(lesson.title)}</span>${onClose ? '<button class="lp-x" aria-label="关闭">✕</button>' : ''}</div>` : ''}
    <div class="lp-player">
      <div class="lp-top"><div class="lp-segs">${steps.map(() => '<i></i>').join('')}</div><span class="lp-no"></span>
        <button class="lp-vb" aria-pressed="${voice.on}">声音 ${voice.on ? '开' : '关'}</button></div>
      <div class="lp-scr"><span class="lp-turn" hidden>轮到你了，点一点</span>
        <div class="lp-vis"></div>
        <div class="lp-side"><div class="lp-main"></div><p class="lp-say" aria-live="polite"></p></div></div>
      <div class="lp-ctl"><button class="lp-rb lp-prev" aria-label="上一步">${ICON.prev}</button>
        <button class="lp-rb lp-play" aria-label="播放">${ICON.play}</button>
        <button class="lp-nx">下一步</button></div>
    </div>
    <p class="lp-tip">按中间的播放键会自动往下讲，遇到「轮到你了」会停下来等你。也可以自己按「下一步」。</p>
  </div>`;
  const $ = (q) => root.querySelector(q);
  // 题目一直贴在本子上方（读题那一步本身就是题目，不重复贴）
  const rs = steps.find((x) => x.type === 'read');
  const probText = rs ? rs.text : lesson.problem?.text;
  const probFig = rs ? rs.fig : lesson.problem?.fig;
  let prob = null;
  if (probText) {
    prob = document.createElement('div');
    prob.className = 'lp-prob';
    prob.innerHTML = `<p>${md(probText).replace(/\[\[([hou])\d*:(.+?)\]\]/g, '<span class="m-$1">$2</span>')}</p>` +
      (probFig ? `<div class="lp-pfig">${probFig}</div>` : '') + '<button type="button" class="lp-pmore" hidden>展开</button>';
    $('.lp-scr').insertBefore(prob, $('.lp-vis'));
    typeset(prob);
    prob.querySelector('.lp-pfig')?.addEventListener('click', () => prob.classList.toggle('bigfig'));
    prob.querySelector('.lp-pmore').onclick = (e) => { const o = prob.classList.toggle('open'); e.currentTarget.textContent = o ? '收起' : '展开'; };
  }
  // 思路链：大纲是整节课的骨架。plan 步列出每一环要回答的问题；带 link 的步骤是那一环的展开，孩子做完这一环才写上结论
  const planStep = steps.find((x) => x.type === 'plan');
  const chain = planStep && steps.some((x) => x.link) ? planStep.items : null;
  const planAt = chain ? steps.indexOf(planStep) : -1;
  const lastOf = chain ? chain.map((_, k) => steps.reduce((m, x, j) => (x.link === k + 1 ? j : m), -1)) : [];
  const linkDone = (k) => (lastOf[k] < 0 ? i > planAt : lastOf[k] < i || (lastOf[k] === i && solved.has(i)));
  let chainEl = null, wasDone = [];
  if (chain) { chainEl = document.createElement('div'); chainEl.className = 'lp-chain'; $('.lp-scr').insertBefore(chainEl, $('.lp-vis')); }
  function drawChain() {
    if (!chainEl) return;
    const s = steps[i], cur = s.link ? s.link - 1 : -1;
    chainEl.hidden = i <= planAt || s.type === 'read' || s.type === 'keep';
    chainEl.innerHTML = chain.map((it, k) => { const d = linkDone(k); return `${k ? '<i class="ch-ar">→</i>' : ''}<span class="ch ${d ? 'done' : k === cur ? 'cur' : 'todo'}${d && wasDone[k] === false ? ' new' : ''}"><b>${k + 1}</b><span class="ch-t">${md(d ? it.to : it.ask)}</span></span>`; }).join('');
    wasDone = chain.map((_, k) => linkDone(k));
    typeset(chainEl);
  }
  const vis = $('.lp-vis'), side = $('.lp-main'), say = $('.lp-say'), turn = $('.lp-turn'), scr = $('.lp-scr');
  const setSay = (t) => { say.innerHTML = md(t); typeset(say); stickLater(); if (playing && voice.on) voice.speak(t, () => {}); };
  // 便利贴贴在要注意的地方旁边：找出这一步里和讲解说同一件事的重点词，胶带朝着它贴
  let stickT = 0, stickKey = '';
  const stickLater = () => { clearTimeout(stickT); stickT = setTimeout(() => requestAnimationFrame(stick), 60); };
  function stick() {
    say.classList.remove('side', 'tape-l'); say.style.left = say.style.top = say.style.width = ''; say.style.removeProperty('--tx'); say.style.removeProperty('--ty');
    if (!say.textContent.trim()) return;
    const S = scr.getBoundingClientRect(); if (!S.width) return;
    const main = scr.classList.contains('solo') ? vis : side;
    const ok = (c) => /[\u4e00-\u9fa5\dA-Za-z]/.test(c), chars = new Set([...say.textContent].filter(ok));
    let tgt = null, best = 1;
    main.querySelectorAll('b, strong').forEach((b) => { if (b.closest('.lp-plan, .lp-keep')) return; const cs = [...b.textContent].filter(ok); const t = cs.filter((c) => chars.has(c)).length, sc = t * t / cs.length; if (t >= 2 && t >= cs.length * 0.4 && sc > best) { best = sc; tgt = b; } });
    stickKey = `${S.width}x${S.height}`;
    if (!tgt) return;
    const T = tgt.getClientRects()[0]; if (!T) return;
    const block = tgt.closest('.card, .lp-q, .lp-html, .lp-quiz, .lp-fill') || tgt;
    const K = block.getBoundingClientRect(), free = S.right - 20 - (K.right + 36);
    if (free >= 150) {
      // 宽屏：贴在重点那一行的右边，胶带横着压在便利贴左边、对着那一行
      say.classList.add('side', 'tape-l');
      const O = (say.offsetParent || scr).getBoundingClientRect();
      say.style.width = `${Math.min(280, free)}px`;
      say.style.left = `${K.right + 36 - O.left}px`;
      const cy = T.top + T.height / 2 - S.top;
      const top = Math.max(10, Math.min(cy - 22, S.height - say.offsetHeight - 14));
      say.style.top = `${top + S.top - O.top}px`;
      say.style.setProperty('--ty', `${Math.round(cy - top)}px`);
    } else {
      // 窄屏：便利贴在下面，胶带挪到重点词正下方那一段
      const R = say.getBoundingClientRect(), x = T.left + T.width / 2 - R.left;
      say.style.setProperty('--tx', `${Math.round(Math.max(44, Math.min(R.width - 44, x)))}px`);
    }
  }
  if (window.ResizeObserver) new ResizeObserver(() => { const S = scr.getBoundingClientRect(); if (stickKey && `${S.width}x${S.height}` !== stickKey) stickLater(); }).observe(scr);
  const interactive = (s) => ['quiz', 'pick2', 'fill'].includes(s.type) || (s.type === 'grid' && s.grid?.mode === 'draw') || (s.type === 'sim' && !!s.goal) || (s.type === 'keep' && !!s.q);

  function solvedNow(i0, text) {
    solved.add(i0);
    turn.hidden = true;
    drawChain();
    setSay(text);
    if (playing) voice.speak(text, () => { if (playing && i === i0) go(i + 1); });
  }

  function render() {
    const s = steps[i];
    root.querySelectorAll('.lp-segs i').forEach((e, k) => { e.className = k < i ? 'd' : k === i ? 'c' : ''; });
    $('.lp-no').textContent = `${i + 1}/${steps.length}`;
    $('.lp-prev').disabled = i === 0;
    $('.lp-ctl .lp-nx').textContent = i === steps.length - 1 ? doneLabel : '下一步';
    // 有图（方格路线等）时：大屏左边放图，右边放讲解和题目；没图时单列居中。手机上一律上下排。
    const hasVis = s.type === 'grid' || s.type === 'sim' || !!s.grid || !!s.fig || (s.type === 'tabs' && s.tabs.some((t) => t.grid || t.fig));
    scr.classList.toggle('solo', !hasVis);
    if (prob) {
      prob.hidden = s.type === 'read';
      prob.classList.toggle('nofig', hasVis);
      if (!prob.hidden && !prob.classList.contains('open')) requestAnimationFrame(() => { const p = prob.querySelector('p'); prob.classList.remove('short'); const fit = p.scrollHeight <= p.clientHeight + 4; prob.classList.toggle('short', fit); prob.querySelector('.lp-pmore').hidden = fit; });
    }
    const main = hasVis ? side : vis;
    vis.innerHTML = ''; side.innerHTML = '';
    drawChain();
    if (s.html) main.insertAdjacentHTML('beforeend', `<div class="lp-html">${s.html.replace(/(<div class=['"]lp-h['"]>)内核(<\/div>)/, '$1思路$2')}</div>`);
    turn.hidden = !(interactive(s) && !solved.has(i));
    if (s.grid && s.type !== 'grid' && s.sim !== 'toggles') vis.appendChild(gridWidget(s.grid, () => {}, setSay));
    if (s.fig) vis.insertAdjacentHTML('beforeend', `<div class="lp-fig">${s.fig}</div>`);
    let rd = null;
    if (s.type === 'read') { rd = readWidget(s, !reduce()); main.appendChild(rd); }
    if (s.type === 'sim') {
      const box = document.createElement('div');
      box.className = `lp-simbox sim-${s.sim}`;
      vis.appendChild(box);
      const i0 = i;
      try {
        SIMS[s.sim](box, s, { say: setSay, solved: (t) => { if (i === i0 && !solved.has(i0)) solvedNow(i0, t || s.ok || '完成！'); } });
      } catch (err) { box.textContent = '这个互动加载失败了，可以直接按「下一步」。'; console.error(err); }
    }
    if (s.type === 'fill') {
      const box = document.createElement('div');
      box.className = 'lp-fill';
      box.innerHTML = (s.q ? `<div class="lp-q">${md(s.q)}</div>` : '') +
        `<div class="lp-frow">${s.pre ? `<span>${md(s.pre)}</span>` : ''}<input class="lp-input" inputmode="${imode(s.a)}" autocomplete="off" aria-label="答案">${s.post ? `<span>${md(s.post)}</span>` : ''}<button class="lp-chk">确定</button></div>`;
      main.appendChild(box);
      let tries = 0;
      const check = () => {
        if (solved.has(i)) return;
        const v = box.querySelector('.lp-input').value.trim().replace(/\s+/g, '').replace(/，/g, ',');
        if (!v) return;
        if (s.a.map(String).includes(v)) { box.querySelector('.lp-input').classList.add('ok'); box.querySelector('.lp-input').disabled = true; solvedNow(i, s.ok || '对啦！'); }
        else { tries++; box.querySelector('.lp-input').classList.add('no'); setTimeout(() => box.querySelector('.lp-input')?.classList.remove('no'), 500); setSay(tries >= 2 && s.show ? s.show : (s.hint || '再算一算。')); }
      };
      box.querySelector('.lp-chk').onclick = check;
      box.querySelector('.lp-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    }
    let first = s.say || '';
    if (s.type === 'tabs') {
      const box = document.createElement('div');
      box.innerHTML = `<div class="lp-tabs">${s.tabs.map((t, k) => `<button class="lp-tp ${k ? '' : 'on'}" data-k="${k}">${md(t.label)}</button>`).join('')}</div>`;
      const pane = document.createElement('div');
      pane.className = 'lp-tab';
      main.appendChild(box);
      vis.appendChild(pane);
      const show = (k, initial) => {
        box.querySelectorAll('.lp-tp').forEach((b) => b.classList.toggle('on', +b.dataset.k === k));
        const t = s.tabs[k];
        pane.innerHTML = t.html || '';
        if (t.grid) pane.appendChild(gridWidget(t.grid, () => {}, setSay));
        if (t.fig) pane.insertAdjacentHTML('beforeend', `<div class="lp-fig">${t.fig}</div>`);
        typeset(pane);
        if (t.say && !initial) setSay(t.say);
      };
      box.addEventListener('click', (e) => { const b = e.target.closest('.lp-tp'); if (b) show(+b.dataset.k); });
      show(0, true); first = s.tabs[0].say || first;
    }
    if (s.type === 'quiz' || s.type === 'pick2') {
      const box = document.createElement('div');
      box.className = 'lp-quiz' + (s.type === 'pick2' ? ' two' : '');
      box.innerHTML = (s.q ? `<div class="lp-q">${md(s.q)}</div>` : '') + `<div class="lp-opts">${(s._order || s.opts.map((_, k) => k)).map((k) => `<button class="lp-opt" data-k="${k}">${md(s.opts[k])}</button>`).join('')}</div>`;
      main.appendChild(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.lp-opt');
        if (!b || solved.has(i)) return;
        const k = +b.dataset.k;
        if (k === s.a) {
          b.classList.add('is-right');
          box.querySelectorAll('.lp-opt').forEach((x) => (x.disabled = true));
          solvedNow(i, s.ok || '对啦！');
        } else {
          b.classList.add('is-wrong'); b.disabled = true;
          setSay((s.why && s.why[k]) || s.hint || '再想一想。');
        }
      });
    }
    if (s.type === 'recall') {
      const box = document.createElement('div');
      box.className = 'lp-recall';
      box.innerHTML = `<div class="lp-q">${md(s.q)}</div><button class="lp-ghost">点开看答案</button><div class="lp-ans" hidden>${md(s.ans)}</div>`;
      box.querySelector('button').onclick = (e) => { e.target.hidden = true; box.querySelector('.lp-ans').hidden = false; typeset(box); };
      main.appendChild(box);
    }
    if (s.type === 'grid') vis.appendChild(gridWidget(s.grid, (t) => solvedNow(i, t), setSay));
    if (s.type === 'plan' && chain) {
      // 思路大纲：每一环先是一个要回答的问题；做完的那一环换成「从 … → 推出 …」
      const box = document.createElement('div');
      box.className = 'lp-plan chain';
      box.innerHTML = `<div class="lp-h">思路</div><ol>${chain.map((it, k) => { const d = linkDone(k); return `<li class="${d ? 'done' : ''}"><span class="pl-row"><span class="pl-n">${k + 1}</span><span class="pl-line">${d ? `从 <b class="pl-from">${md(it.from)}</b><span class="pl-arr">→</span><span class="pl-to">${md(it.to)}</span>` : md(it.ask)}</span></span></li>`; }).join('')}</ol>`;
      main.appendChild(box);
    }
    if (s.type === 'keep') {
      // 记住：整条推理链 + 一句题眼（看到什么 → 想到什么）+ 换个数自己做一道
      const box = document.createElement('div');
      box.className = 'lp-keep';
      box.innerHTML = '<div class="lp-h">记住</div>' +
        (chain ? `<ol class="kp-chain">${chain.map((it, k) => `<li><span class="pl-n">${k + 1}</span><span>从 <b>${md(it.from)}</b><span class="pl-arr">→</span>${md(it.to)}</span></li>`).join('')}</ol>` : '') +
        `<div class="kp-cue">${s.name ? `<span class="kp-name">${md(s.name)}</span>` : ''}<span class="kp-see">看到 <b>${md(s.cue)}</b></span><span class="pl-arr">→</span><span class="kp-think">想到 <b>${md(s.think)}</b></span></div>` +
        (s.q ? `<div class="kp-var"><div class="kp-t">换个数，自己来</div><div class="lp-q">${md(s.q)}</div><div class="lp-frow">${s.pre ? `<span>${md(s.pre)}</span>` : ''}<input class="lp-input" inputmode="${imode(s.a)}" autocomplete="off" aria-label="答案">${s.post ? `<span>${md(s.post)}</span>` : ''}<button class="lp-chk">确定</button></div></div>` : '');
      main.appendChild(box);
      if (s.q) {
        let tries = 0;
        const inp = box.querySelector('.lp-input');
        const check = () => {
          if (solved.has(i)) return;
          const v = inp.value.trim().replace(/\s+/g, '').replace(/，/g, ',');
          if (!v) return;
          if (s.a.map(String).includes(v)) { inp.classList.add('ok'); inp.disabled = true; solvedNow(i, s.ok || '对啦！这一类题你会了。'); }
          else { tries++; inp.classList.add('no'); setTimeout(() => inp.classList.remove('no'), 500); setSay(tries >= 2 && s.show ? s.show : '照上面的思路，一环一环来。'); }
        };
        box.querySelector('.lp-chk').onclick = check;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      }
    }
    if (s.type === 'plan' && !chain) {
      // 思路：先列大纲（从什么 → 推出什么），点一条展开：先问一句引导，想好了再看为什么
      const box = document.createElement('div');
      box.className = 'lp-plan';
      box.innerHTML = `<div class="lp-h">思路</div><ol>${s.items.map((it, k) => `<li data-k="${k}"><button type="button" class="pl-row" aria-expanded="false"><span class="pl-n">${k + 1}</span><span class="pl-line">从 <b class="pl-from">${md(it.from)}</b><span class="pl-arr">→</span><span class="pl-to">${md(it.to)}</span></span><span class="pl-tog">展开</span></button>` +
        `<div class="pl-body" hidden>${it.ask ? `<p class="pl-ask">${md(it.ask)}</p>` : ''}${it.why ? (it.ask ? `<button type="button" class="pl-see">想好了，看看</button><p class="pl-why" hidden>${md(it.why)}</p>` : `<p class="pl-why">${md(it.why)}</p>`) : ''}</div></li>`).join('')}</ol>`;
      main.appendChild(box);
      box.addEventListener('click', (e) => {
        const see = e.target.closest('.pl-see');
        if (see) { const li = see.closest('li'); see.hidden = true; li.querySelector('.pl-why').hidden = false; typeset(li); return; }
        const row = e.target.closest('.pl-row'); if (!row) return;
        const li = row.closest('li'), body = li.querySelector('.pl-body'), open = body.hidden;
        body.hidden = !open; row.setAttribute('aria-expanded', open); li.classList.toggle('open', open); row.querySelector('.pl-tog').textContent = open ? '收起' : '展开';
        if (open) typeset(li);
      });
    }
    if (s.type === 'here') {
      const box = document.createElement('div');
      box.className = 'lp-here';
      box.innerHTML = s.items.map((it) => `<div class="${it.on ? 'on' : ''}"><b>${md(it.t)}</b><span>${md(it.d || '')}</span></div>`).join('');
      vis.appendChild(box);
    }
    if (solved.has(i) && s.ok) first = s.ok;
    say.innerHTML = sameAsCard(s, first) ? '' : md(first);
    typeset(vis); typeset(side); typeset(say);
    stickLater(); if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(stickLater);
    if (rd) Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 600))]).then(() => requestAnimationFrame(() => { if (rd.isConnected) rd.draw(); }));
    for (const el of [vis, side]) { el.classList.remove('lp-in'); void el.offsetWidth; if (!reduce()) el.classList.add('lp-in'); }
    if (playing) {
      if (interactive(s) && !solved.has(i)) voice.speak(first, () => {}); // 等孩子操作
      else voice.speak(first, () => { if (playing && steps[i] === s) go(i + 1); });
    }
  }

  function sameAsCard(s, t) {
    if (s.type !== 'info' || !s.html || !t) return false;
    const norm = (x) => String(x).replace(/<div class=['"]lp-h['"]>[^<]*<\/div>/, '').replace(/<[^>]+>|\*\*|\$|\s|[。，、：；！？,.]/g, '');
    return norm(t) === norm(s.html);
  }

  function go(n) {
    voice.stop();
    if (n >= steps.length) { setPlaying(false); onDone?.(); return; }
    i = Math.max(0, n); render();
  }
  function setPlaying(v) {
    playing = v;
    $('.lp-play').innerHTML = v ? ICON.pause : ICON.play;
    $('.lp-play').setAttribute('aria-label', v ? '暂停' : '播放');
    if (v) render(); else voice.stop();
  }
  $('.lp-prev').onclick = () => go(i - 1);
  $('.lp-ctl .lp-nx').onclick = () => go(i + 1);
  $('.lp-play').onclick = () => setPlaying(!playing);
  $('.lp-vb').onclick = (e) => { voice.set(!voice.on); e.currentTarget.setAttribute('aria-pressed', voice.on); e.currentTarget.textContent = `声音 ${voice.on ? '开' : '关'}`; };
  root.querySelector('.lp-x')?.addEventListener('click', () => { voice.stop(); onClose(); });
  render();
  return { stop: () => { playing = false; voice.stop(); } };
}
