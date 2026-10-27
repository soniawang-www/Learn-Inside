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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const typeset = (el) => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); };
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

// ───────── 播放器 ─────────
export function mountPlayer(root, lesson, { onDone, doneLabel = '学完了', onClose } = {}) {
  const steps = (lesson.steps || lesson).map((s) => (s.type ? s : { type: 'info', say: s.body, html: s.title ? `<div class="lp-h">${md(s.title)}</div>` : '' }));
  let i = 0, playing = false, solved = new Set();
  root.innerHTML = `<div class="lp">
    ${lesson.title ? `<div class="lp-title"><span>${md(lesson.title)}</span>${onClose ? '<button class="lp-x" aria-label="关闭">✕</button>' : ''}</div>` : ''}
    <div class="lp-player">
      <div class="lp-top"><div class="lp-segs">${steps.map(() => '<i></i>').join('')}</div><span class="lp-no"></span>
        <button class="lp-vb" aria-pressed="${voice.on}">声音 ${voice.on ? '开' : '关'}</button></div>
      <div class="lp-scr"><span class="lp-turn" hidden>轮到你了，点一点</span><div class="lp-main"></div><p class="lp-say" aria-live="polite"></p></div>
      <div class="lp-ctl"><button class="lp-rb lp-prev" aria-label="上一步">${ICON.prev}</button>
        <button class="lp-rb lp-play" aria-label="播放">${ICON.play}</button>
        <button class="lp-nx">下一步</button></div>
    </div>
    <p class="lp-tip">按中间的播放键会自动往下讲，遇到「轮到你了」会停下来等你。也可以自己按「下一步」。</p>
  </div>`;
  const $ = (q) => root.querySelector(q);
  const main = $('.lp-main'), say = $('.lp-say'), turn = $('.lp-turn');
  const setSay = (t) => { say.innerHTML = md(t); typeset(say); if (playing && voice.on) voice.speak(t, () => {}); };
  const interactive = (s) => ['quiz', 'pick2'].includes(s.type) || (s.type === 'grid' && s.grid?.mode === 'draw');

  function solvedNow(i0, text) {
    solved.add(i0);
    turn.hidden = true;
    setSay(text);
    if (playing) voice.speak(text, () => { if (playing && i === i0) go(i + 1); });
  }

  function render() {
    const s = steps[i];
    root.querySelectorAll('.lp-segs i').forEach((e, k) => { e.className = k < i ? 'd' : k === i ? 'c' : ''; });
    $('.lp-no').textContent = `${i + 1}/${steps.length}`;
    $('.lp-prev').disabled = i === 0;
    $('.lp-nx').textContent = i === steps.length - 1 ? doneLabel : '下一步';
    main.innerHTML = s.html ? `<div class="lp-html">${s.html}</div>` : '';
    turn.hidden = !(interactive(s) && !solved.has(i));
    if (s.grid && s.type !== 'grid') main.appendChild(gridWidget(s.grid, () => {}, setSay));
    let first = s.say || '';
    if (s.type === 'tabs') {
      const box = document.createElement('div');
      box.innerHTML = `<div class="lp-tabs">${s.tabs.map((t, k) => `<button class="lp-tp ${k ? '' : 'on'}" data-k="${k}">${md(t.label)}</button>`).join('')}</div><div class="lp-tab"></div>`;
      main.appendChild(box);
      const show = (k, initial) => {
        box.querySelectorAll('.lp-tp').forEach((b) => b.classList.toggle('on', +b.dataset.k === k));
        const t = s.tabs[k], pane = box.querySelector('.lp-tab');
        pane.innerHTML = t.html || '';
        if (t.grid) pane.appendChild(gridWidget(t.grid, () => {}, setSay));
        typeset(pane);
        if (t.say && !initial) setSay(t.say);
      };
      box.addEventListener('click', (e) => { const b = e.target.closest('.lp-tp'); if (b) show(+b.dataset.k); });
      show(0, true); first = s.tabs[0].say || first;
    }
    if (s.type === 'quiz' || s.type === 'pick2') {
      const box = document.createElement('div');
      box.className = 'lp-quiz' + (s.type === 'pick2' ? ' two' : '');
      box.innerHTML = (s.q ? `<div class="lp-q">${md(s.q)}</div>` : '') + `<div class="lp-opts">${s.opts.map((o, k) => `<button class="lp-opt" data-k="${k}">${md(o)}</button>`).join('')}</div>`;
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
    if (s.type === 'grid') main.appendChild(gridWidget(s.grid, (t) => solvedNow(i, t), setSay));
    if (s.type === 'here') {
      const box = document.createElement('div');
      box.className = 'lp-here';
      box.innerHTML = s.items.map((it) => `<div class="${it.on ? 'on' : ''}"><b>${md(it.t)}</b><span>${md(it.d || '')}</span></div>`).join('');
      main.appendChild(box);
    }
    if (solved.has(i) && s.ok) first = s.ok;
    say.innerHTML = md(first);
    typeset(main); typeset(say);
    main.classList.remove('lp-in'); void main.offsetWidth; if (!reduce()) main.classList.add('lp-in');
    if (playing) {
      if (interactive(s) && !solved.has(i)) voice.speak(first, () => {}); // 等孩子操作
      else voice.speak(first, () => { if (playing && steps[i] === s) go(i + 1); });
    }
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
  $('.lp-nx').onclick = () => go(i + 1);
  $('.lp-play').onclick = () => setPlaying(!playing);
  $('.lp-vb').onclick = (e) => { voice.set(!voice.on); e.currentTarget.setAttribute('aria-pressed', voice.on); e.currentTarget.textContent = `声音 ${voice.on ? '开' : '关'}`; };
  root.querySelector('.lp-x')?.addEventListener('click', () => { voice.stop(); onClose(); });
  render();
  return { stop: () => { playing = false; voice.stop(); } };
}
