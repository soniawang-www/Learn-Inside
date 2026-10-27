// AMC 8 模拟考 · 前端（无构建步骤，原生 JS）
// 路由：#/  #/exam/:sid  #/review/:sid  #/kp/:id  #/profile

const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');

// ───────── 存储 ─────────
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const auth = {
  get token() { return store.get('amc8.token'); },
  get student() { return store.get('amc8.student'); },
  save(token, student) { store.set('amc8.token', token); store.set('amc8.student', student); },
  setStudent(s) { store.set('amc8.student', s); },
  clear() { store.del('amc8.token'); store.del('amc8.student'); },
};

// ───────── API ─────────
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { auth.clear(); location.hash = '#/'; }
  if (!res.ok && res.status !== 402) throw new Error(data.error || `请求失败 (${res.status})`);
  return { status: res.status, ...data, _array: Array.isArray(data) ? data : undefined };
}
const apiList = async (path) => (await api(path))._array;

// ───────── 渲染工具 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** 题目文本：转义 HTML，保留 $…$ 给 KaTeX；**粗体** 和换行 */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
function typeset(el = document.body) {
  if (!window.renderMathInElement) { setTimeout(() => typeset(el), 60); return; }
  window.renderMathInElement(el, {
    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
    throwOnError: false,
  });
}
/** 极简 Markdown：## 标题、表格、段落、$$ 公式块 */
function markdown(src) {
  const lines = String(src || '').split('\n');
  let html = '', para = [], table = [];
  const flushPara = () => { if (para.length) { html += `<p>${rich(para.join(' '))}</p>`; para = []; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => rich(c.trim())));
    html += `<table><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    table = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('|')) { flushPara(); table.push(line); continue; }
    flushTable();
    if (!line) { flushPara(); continue; }
    if (line.startsWith('## ')) { flushPara(); html += `<h2>${rich(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('$$')) { flushPara(); html += `<p>${esc(line)}</p>`; continue; }
    para.push(line);
  }
  flushPara(); flushTable();
  return html;
}
const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const fmtDate = (ms) => new Date(ms).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function modal(html, onMount) {
  $modal.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  const root = $modal.firstElementChild;
  const close = () => { $modal.innerHTML = ''; };
  root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) close(); });
  typeset(root);
  onMount?.(root.querySelector('.modal'), close);
  return close;
}

function topnav() {
  const s = auth.student;
  return `<nav class="topnav"><span class="brand">AMC 8 模拟考</span><span class="spacer"></span>
    ${s ? `<a href="#/">试卷</a><a href="#/profile">${esc(s.nickname)} 的画像</a>` : ''}</nav>`;
}

// ───────── 路由 ─────────
let cleanup = null;
async function router() {
  cleanup?.(); cleanup = null;
  $modal.innerHTML = '';
  const [, page, id] = (location.hash.slice(1) || '/').split('/');
  try {
    if (!auth.token) return renderJoin();
    if (page === 'exam') return await renderExam(id);
    if (page === 'review') return await renderReview(id);
    if (page === 'kp') return await renderKp(id);
    if (page === 'profile') return await renderProfile();
    return await renderHome();
  } catch (e) {
    $app.innerHTML = `${topnav()}<div class="page"><div class="card"><p class="error-msg">${esc(e.message)}</p><a href="#/">返回首页</a></div></div>`;
  }
}
window.addEventListener('hashchange', router);

// ───────── 加入试用 ─────────
function renderJoin() {
  $app.innerHTML = `${topnav()}<div class="page"><div class="card" style="max-width:420px;margin:40px auto">
    <h1>加入试用</h1>
    <form id="join">
      <label class="field"><span>邀请码</span><input type="text" name="invite_code" autocomplete="off"></label>
      <label class="field"><span>孩子的昵称</span><input type="text" name="nickname" maxlength="20" placeholder="比如：小桐"></label>
      <button class="btn primary" type="submit">开始</button>
      <div class="error-msg" id="err"></div>
    </form>
    <p class="small muted">试用期间所有内容免费。孩子的作答记录只用于生成学习画像。</p>
  </div></div>`;
  document.getElementById('join').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/amc8/api/auth/join', { method: 'POST', body: Object.fromEntries(f) });
      auth.save(r.token, r.student);
      location.hash = '#/'; router();
    } catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

// ───────── 首页：试卷列表 ─────────
async function renderHome() {
  const me = await api('/amc8/api/me');
  if (!auth.student || !me.students.find((s) => s.id === auth.student.id)) auth.setStudent(me.students[0]);
  const st = auth.student;
  const exams = await apiList(`/amc8/api/exams?student=${st.id}`);
  $app.innerHTML = `${topnav()}<div class="page">
    <h1>选择试卷</h1>
    ${me.students.length > 1 ? `<div class="card row"><span class="muted">当前学生</span>
      <select id="stu">${me.students.map((s) => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${esc(s.nickname)}</option>`).join('')}</select></div>` : ''}
    <div class="card exam-list">
      ${exams.map((e) => `<div class="exam">
        <div><div class="title">${esc(e.title)}</div>
          <div class="small muted">${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟${e.source === 'original' ? ' · 原创' : ''}
          ${e.last_score !== null ? ` · 上次 <a href="#/review/${e.last_session}">${e.last_score}/${e.problem_count}</a>` : ''}</div></div>
        <div class="row">
          <button class="btn" data-start="${e.id}" data-mode="practice">练习模式</button>
          <button class="btn primary" data-start="${e.id}" data-mode="exam">模考</button>
        </div></div>`).join('') || '<p class="muted">还没有试卷</p>'}
    </div>
    <p class="small muted">模考：完全按正式考试计时，不提供提示。练习：同样计时，可以逐级查看提示，用了提示的题在画像里会打折计算。</p>
  </div>`;
  document.getElementById('stu')?.addEventListener('change', (e) => { auth.setStudent(me.students.find((s) => s.id === e.target.value)); router(); });
  $app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => showInstructions(exams.find((e) => e.id === b.dataset.start), b.dataset.mode)));
}

function showInstructions(exam, mode) {
  const mins = Math.round(exam.duration_sec / 60);
  modal(`<div class="instructions"><h2>${esc(exam.title)} · ${mode === 'exam' ? '模考' : '练习'}</h2>
    <ol>
      <li>本卷共 ${exam.problem_count} 道选择题，每题有 A、B、C、D、E 五个选项，只有一个正确。</li>
      <li>答对 1 题得 1 分，答错不扣分，所以每题都值得作答。</li>
      <li>只允许使用草稿纸、笔、直尺和橡皮；不能用计算器、量角器、圆规或任何电子设备。</li>
      <li>图形不一定按比例绘制。</li>
      <li>作答时间 ${mins} 分钟，时间到会自动交卷。</li>
      ${mode === 'practice' ? '<li>练习模式可以逐级查看提示（最多 3 级）。</li>' : ''}
    </ol></div>
    <div class="actions"><button class="btn" data-close>取消</button><button class="btn primary" id="go">开始答题</button></div>`,
  (el, close) => {
    el.querySelector('#go').onclick = async () => {
      const r = await api('/amc8/api/sessions', { method: 'POST', body: { exam_id: exam.id, student_id: auth.student.id, mode } });
      close(); location.hash = `#/exam/${r.session.id}`;
    };
  });
}

// ───────── 考试界面（按 AMC 8 中国区线上考试操作手册“第八步”截图还原） ─────────
// 布局：顶栏（刷新 / 大字号 / 剩余时间 / 交卷）+ 左侧答题卡（进度、题号格、图例）+ 右侧一题一屏
async function renderExam(sid) {
  const data = await api(`/amc8/api/sessions/${sid}`);
  if (data.session.submitted) { location.hash = `#/review/${sid}`; return; }
  const key = `amc8.s.${sid}`;
  const S = Object.assign({ answers: {}, flags: {}, times: {}, hints: {}, cur: 0, big: false }, store.get(key, {}));
  const problems = data.problems;
  const clockOffset = data.session.server_now - Date.now();
  const practice = data.session.mode === 'practice';
  let enteredAt = Date.now();
  let submitting = false;
  let cardOpen = false; // 窄屏时答题卡默认收起

  const save = () => store.set(key, S);
  const flushTime = () => {
    const p = problems[S.cur];
    S.times[p.id] = (S.times[p.id] || 0) + (Date.now() - enteredAt) / 1000;
    enteredAt = Date.now();
  };
  const go = (i) => { flushTime(); S.cur = Math.max(0, Math.min(problems.length - 1, i)); cardOpen = false; save(); draw(); };

  // 刷新 / 断线重连时找回已看过的提示
  for (const h of data.hints_seen) {
    const list = (S.hints[h.problem_id] ||= []);
    if (!list[h.level - 1]) {
      const r = await api(`/amc8/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: h.problem_id, level: h.level } });
      list[h.level - 1] = r.content;
    }
  }

  function draw() {
    const p = problems[S.cur];
    const answered = problems.filter((x) => S.answers[x.id]).length;
    const hints = S.hints[p.id] || [];
    $app.innerHTML = `<div class="ez ${S.big ? 'big' : ''}">
      <header class="ez-top">
        <button class="ez-cardbtn" id="cardbtn">☰ 答题卡</button>
        <span class="ez-user">👤 ${esc(auth.student?.nickname || '')}</span>
        <span class="ez-title">${esc(data.exam.title)}${practice ? '<span class="ez-mode">练习</span>' : ''}</span>
        <span class="ez-sp"></span>
        <button class="ez-tool" id="refresh" title="图片没显示完整时点一下">⟳ 刷新</button>
        <button class="ez-tool ${S.big ? 'on' : ''}" id="font">A<small>A</small> 大字号</button>
        <span class="ez-timer" id="timer">剩余时间 <b>--:--</b></span>
        <button class="ez-submit" id="submit">交卷</button>
      </header>
      <div class="ez-body">
        <aside class="ez-card ${cardOpen ? 'open' : ''}">
          <div class="ez-card-head"><b>答题卡</b><span class="muted">☰</span></div>
          <div class="ez-progress"><div class="ez-prow"><span>进度</span><span>${answered}/${problems.length}</span></div>
            <div class="ez-pbar"><div style="width:${(answered / problems.length) * 100}%"></div></div></div>
          <div class="ez-grid">${problems.map((x, i) => `<button class="ez-cell ${S.answers[x.id] ? 'done' : ''} ${S.flags[x.id] ? 'flag' : ''} ${i === S.cur ? 'cur' : ''}" data-go="${i}">${x.number}</button>`).join('')}</div>
          <div class="ez-legend"><span><i class="lg done"></i>已答</span><span><i class="lg"></i>未答</span><span><i class="lg flag"></i>标记</span></div>
        </aside>
        <main class="ez-main">
          <div class="ez-q">
            <div class="ez-qhead"><span class="ez-qno">${p.number}.(1分)</span>
              <button class="ez-pin ${S.flags[p.id] ? 'on' : ''}" id="flag" title="标记这道题，稍后回来检查">📌 ${S.flags[p.id] ? '已标记' : '标记'}</button></div>
            <div class="ez-stem">${rich(p.stem)}</div>
            ${p.figure ? `<div class="figure">${p.figure}</div>` : ''}
            <ul class="ez-opts">${Object.entries(p.choices).map(([k, v]) => `<li class="ez-opt ${S.answers[p.id] === k ? 'sel' : ''}" data-choice="${k}" role="radio" aria-checked="${S.answers[p.id] === k}"><span class="ez-letter">${k}</span><span class="ez-otext">${rich(v)}</span></li>`).join('')}</ul>
            <div class="ez-nav">
              <button class="ez-btn" id="prev" ${S.cur === 0 ? 'disabled' : ''}>上一题</button>
              <button class="ez-btn next" id="next" ${S.cur === problems.length - 1 ? 'disabled' : ''}>下一题</button>
              ${practice && p.hint_count ? `<button class="ez-btn hint" id="hint" ${hints.length >= p.hint_count ? 'disabled' : ''}>💡 提示 ${hints.length}/${p.hint_count}</button>` : ''}
            </div>
            ${hints.length ? `<div class="hint-box">${hints.map((h, i) => `<div class="hint"><b>提示 ${i + 1}</b>${rich(h)}</div>`).join('')}</div>` : ''}
          </div>
        </main>
      </div>
      ${cardOpen ? '<div class="ez-mask" id="mask"></div>' : ''}
    </div>`;
    typeset($app);
    tick();

    $app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(+b.dataset.go)));
    $app.querySelectorAll('[data-choice]').forEach((c) => (c.onclick = () => { S.answers[p.id] = c.dataset.choice; save(); draw(); }));
    $app.querySelector('#prev').onclick = () => go(S.cur - 1);
    $app.querySelector('#next').onclick = () => go(S.cur + 1);
    $app.querySelector('#flag').onclick = () => { S.flags[p.id] ? delete S.flags[p.id] : (S.flags[p.id] = true); save(); draw(); };
    $app.querySelector('#refresh').onclick = () => { flushTime(); save(); location.reload(); };
    $app.querySelector('#font').onclick = () => { S.big = !S.big; save(); draw(); };
    $app.querySelector('#cardbtn').onclick = () => { cardOpen = !cardOpen; draw(); };
    $app.querySelector('#mask')?.addEventListener('click', () => { cardOpen = false; draw(); });
    $app.querySelector('#submit').onclick = confirmSubmit;
    const hb = $app.querySelector('#hint');
    if (hb) hb.onclick = async () => {
      const level = hints.length + 1;
      const r = await api(`/amc8/api/sessions/${sid}/hint`, { method: 'POST', body: { problem_id: p.id, level } });
      (S.hints[p.id] ||= [])[level - 1] = r.content; save(); draw();
    };
  }

  function confirmSubmit() {
    const un = problems.filter((x) => !S.answers[x.id]);
    const fl = problems.filter((x) => S.flags[x.id]);
    modal(`<h2>确认交卷？</h2>
      <p>已答 <b>${problems.length - un.length}</b> 题，未答 <b style="color:var(--bad)">${un.length}</b> 题，标记 <b style="color:var(--flag)">${fl.length}</b> 题。</p>
      ${un.length ? `<p class="small muted">未答：${un.map((x) => x.number).join('、')}。答错不扣分，空着的题建议也选一个。</p>` : ''}
      <p class="small muted">交卷后不能再修改答案。</p>
      <div class="actions"><button class="btn" data-close>继续作答</button><button class="btn primary" id="yes">确认交卷</button></div>`,
    (el, close) => { el.querySelector('#yes').onclick = () => { close(); submit(false); }; });
  }

  function tick() {
    const left = (data.session.deadline_at - (Date.now() + clockOffset)) / 1000;
    const el = document.getElementById('timer');
    if (el) { el.querySelector('b').textContent = fmtTime(left); el.classList.toggle('warn', left <= 300); }
    if (left <= 0 && !submitting) submit(true);
  }
  const timer = setInterval(tick, 500);

  // 键盘：A–E 选答案，←/→ 翻题
  const onKey = (e) => {
    if ($modal.innerHTML || e.target.tagName === 'INPUT') return;
    const k = e.key.toUpperCase();
    if (k.length === 1 && 'ABCDE'.includes(k)) { S.answers[problems[S.cur].id] = k; save(); draw(); }
    else if (e.key === 'ArrowRight') go(S.cur + 1);
    else if (e.key === 'ArrowLeft') go(S.cur - 1);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };

  async function submit(auto) {
    if (submitting) return;
    submitting = true; flushTime(); save();
    if (auto) modal('<h2>考试时间到</h2><p>系统正在自动交卷…</p>');
    try {
      await api(`/amc8/api/sessions/${sid}/submit`, { method: 'POST', body: { answers: S.answers, times: S.times, flags: S.flags } });
      store.del(key);
      $modal.innerHTML = '';
      location.hash = `#/review/${sid}`;
    } catch (e) {
      submitting = false;
      modal(`<h2>交卷失败</h2><p>${esc(e.message)}</p><p class="small muted">答案已保存在本机，网络恢复后再点“交卷”即可。</p><div class="actions"><button class="btn primary" data-close>好</button></div>`);
    }
  }

  draw();
}

// ───────── 复盘 ─────────
const REASONS = [['unknown', '不会'], ['careless', '粗心'], ['no_time', '没时间'], ['reading', '没读懂题']];

async function renderReview(sid) {
  const r = await api(`/amc8/api/sessions/${sid}/review`);
  const used = (r.session.submitted_at - r.session.started_at) / 1000;
  const wrong = r.items.filter((i) => !i.correct);
  $app.innerHTML = `${topnav()}<div class="page">
    <div class="card"><div class="scorebox">
      <div><div class="muted small">得分</div><span class="big">${r.session.score}</span><span class="muted"> / ${r.total}</span></div>
      <div><div class="muted small">用时</div><b>${fmtTime(used)}</b><span class="muted"> / ${fmtTime(r.exam.duration_sec)}</span></div>
      <div><div class="muted small">模式</div><b>${r.session.mode === 'exam' ? '模考' : '练习'}</b></div>
      <div style="margin-left:auto"><a class="btn" href="#/profile">查看画像</a></div>
    </div>
    ${wrong.length ? `<p class="small muted" style="margin:12px 0 0">做错 / 没做的 ${wrong.length} 题，请让孩子在每道题下面点一下“错因”。这能让画像区分“不会”和“粗心”，准确很多。</p>` : ''}
    </div>
    <h2>${esc(r.exam.title)}</h2>
    ${r.items.map(itemView).join('')}
  </div>`;
  typeset($app);

  function itemView(it) {
    const cls = it.choice === null ? 'blank' : it.correct ? 'right' : 'wrong';
    return `<details class="ritem ${cls}" ${it.correct ? '' : 'open'}>
      <summary><span class="mark">${it.correct ? '✓' : it.choice === null ? '–' : '✗'}</span>
        <b>Problem ${it.number}</b>
        <span class="muted small">${it.choice === null ? '未作答' : `你的答案 ${it.choice}`}${it.correct ? '' : ` · 正确答案 ${it.answer}`}</span>
        <span class="meta">${fmtTime(it.time_sec)}${it.hints_used ? ` · 提示 ${it.hints_used} 级` : ''}${it.flagged ? ' · ⚑' : ''}</span></summary>
      <div class="body">
        <div class="stem">${rich(it.stem)}${it.figure ? `<div class="figure">${it.figure}</div>` : ''}</div>
        <ul class="choices">${Object.entries(it.choices).map(([k, v]) => `<li class="choice ${k === it.answer ? 'correct' : k === it.choice ? 'picked-wrong' : ''}"><span class="letter">${k}</span><span>${rich(v)}</span></li>`).join('')}</ul>
        ${it.correct ? '' : `<div class="section-label">错因</div><div class="reason-chips row" data-attempt="${it.attempt_id}">
          ${REASONS.map(([k, label]) => `<button data-reason="${k}" class="${it.error_reason === k ? 'on' : ''}">${label}</button>`).join('')}</div>`}
        ${it.basic ? `<div class="section-label">简单思路</div><div class="solution">${rich(it.basic)}</div>` : ''}
        <div class="section-label">考点</div>
        <div class="chips">${it.kps.map((k) => `<a class="chip ${k.primary ? 'primary' : ''}" href="#/kp/${encodeURIComponent(k.id)}">${esc(k.name)}${k.locked ? '<span class="lock">🔒</span>' : ''}</a>`).join('')}</div>
        ${it.advanced ? `<div style="margin-top:14px"><button class="btn" data-adv="${it.problem_id}">▶ 互动解析${it.advanced.locked ? ' 🔒' : ''}</button></div>` : ''}
      </div></details>`;
  }

  $app.querySelectorAll('.reason-chips button').forEach((b) => (b.onclick = async () => {
    const box = b.parentElement;
    const on = b.classList.contains('on');
    await api(`/amc8/api/attempts/${box.dataset.attempt}`, { method: 'PATCH', body: { error_reason: on ? null : b.dataset.reason } });
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', !on && x === b));
  }));
  $app.querySelectorAll('[data-adv]').forEach((b) => (b.onclick = () => openAdvanced(b.dataset.adv)));
}

async function openAdvanced(problemId) {
  const r = await api(`/amc8/api/problems/${problemId}/advanced`);
  if (r.locked) return modal(lockedPanel('互动解析是会员内容'));
  if (r.url) { window.open(r.url, '_blank'); return; }
  let shown = 1;
  modal(`<h2>互动解析</h2><div class="progress"><div></div></div><div class="steps"></div>
    <div class="actions"><button class="btn" data-close>关闭</button><button class="btn" id="all">全部展开</button><button class="btn primary" id="nx">下一步</button></div>`,
  (el) => {
    const paint = () => {
      el.querySelector('.steps').innerHTML = r.steps.slice(0, shown).map((s) => `<div class="step"><b>${rich(s.title)}</b>${rich(s.body)}</div>`).join('');
      el.querySelector('.progress div').style.width = `${(shown / r.steps.length) * 100}%`;
      el.querySelector('#nx').disabled = shown >= r.steps.length;
      typeset(el);
    };
    el.querySelector('#nx').onclick = () => { shown++; paint(); };
    el.querySelector('#all').onclick = () => { shown = r.steps.length; paint(); };
    paint();
  });
}

const lockedPanel = (title) => `<div class="locked-panel"><div class="icon">🔒</div><p><b>${esc(title)}</b></p>
  <p class="small">开通会员后可以查看。</p><div class="actions" style="justify-content:center"><button class="btn" data-close>知道了</button></div></div>`;

// ───────── 知识点 ─────────
async function renderKp(id) {
  const k = await api(`/amc8/api/kp/${encodeURIComponent(id)}?student=${auth.student.id}`);
  $app.innerHTML = `${topnav()}<div class="page">
    <a href="javascript:history.back()" class="small">← 返回</a>
    <h1>${esc(k.name)} ${k.amc_ext ? '<span class="tag ext">AMC 扩展</span>' : ''}</h1>
    <div class="card">
      <p>${rich(k.summary || '')}</p>
      ${k.mastery ? `<p class="small muted">当前掌握度：<b>${k.mastery.label}</b>（${k.mastery.score}）</p>` : ''}
      ${k.prerequisites.length ? `<p class="small muted">前置知识：${k.prerequisites.map((p) => `<a href="#/kp/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join('、')}</p>` : ''}
    </div>
    <div class="card md">${k.locked ? lockedPanel('知识点讲解是会员内容').replace(/<div class="actions".*?<\/div>/, '') : k.content ? markdown(k.content) : '<p class="muted">讲解内容还在编写中。</p>'}</div>
    ${k.problems.length ? `<div class="card"><h2>相关题目</h2><div class="chips">${k.problems.map((p) => `<span class="chip">${esc(p.exam_title)} · 第 ${p.number} 题</span>`).join('')}</div></div>` : ''}
  </div>`;
  typeset($app);
}

// ───────── 画像 ─────────
async function renderProfile() {
  const r = await api(`/amc8/api/students/${auth.student.id}/profile`);
  const reasonName = Object.fromEntries(REASONS);
  const totalWrong = r.error_reasons.reduce((a, x) => a + x.n, 0);
  $app.innerHTML = `${topnav()}<div class="page">
    <h1>${esc(r.student.nickname)} 的学习画像</h1>
    <div class="card"><h2>知识点掌握度</h2>
      ${r.points.length ? `<p class="small muted">从薄弱到擅长排序。证据量 = 做过的相关题目（按考点权重累加），少于 1.5 时显示“数据不足”。</p>
        ${r.points.map((p) => `<div class="kprow lv-${p.level}">
          <div><a href="#/kp/${encodeURIComponent(p.id)}">${esc(p.name)}</a> <span class="small muted">${esc(p.group || '')} · 证据 ${p.evidence}</span></div>
          <div class="bar"><div style="width:${p.score}%"></div></div>
          <div class="lv-label">${p.label}</div></div>`).join('')}`
      : '<p class="muted">还没有数据，先做一套卷子吧。</p>'}
    </div>
    ${totalWrong ? `<div class="card"><h2>错因分布</h2><div class="chips">${r.error_reasons.map((x) => `<span class="chip">${x.error_reason ? reasonName[x.error_reason] : '未标注'} ${x.n}</span>`).join('')}</div></div>` : ''}
    <div class="card"><h2>考试记录</h2>
      ${r.sessions.map((s) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)">
        <span>${esc(s.title)} <span class="tag">${s.mode === 'exam' ? '模考' : '练习'}</span></span>
        <span><a href="#/review/${s.id}">${s.score}/${s.total}</a> <span class="small muted">${fmtDate(s.submitted_at)}</span></span></div>`).join('') || '<p class="muted">暂无</p>'}
    </div>
  </div>`;
}

router();
