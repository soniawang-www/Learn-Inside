// 小托福（TOEFL Junior 标准考试）仿真模拟：原创题，每套拆成听力 / 语言形式与含义 / 阅读三份卷
// 路由：#/tj（套题列表）  #/tj/exam/:会话 id（做题）  #/tj/review/:会话 id（复盘）
// 题目材料在 exam.sections[0].groups：听力组有 audio、script，语言题和阅读组有 title、text（[[n]] 是空）
let X; // app.js 传进来的工具：api、page、esc、enc、modal、store、auth、BACK_IC、$app、setCleanup
export const initTJ = (ctx) => { X = ctx; };

const AUDIO = '/english/audio/toefljr/';
const PART = { l: '听力', f: '语言形式与含义', r: '阅读' };
const partOf = (examId) => String(examId).slice(-1);
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const paras = (t) => X.esc(t).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

// ───────── 套题列表 ─────────
export async function renderTJ() {
  const exams = await X.api(`/api/exams?student=${X.enc(X.auth.student.id)}&family=toefljr`);
  const sets = new Map();
  for (const e of exams) { const m = e.id.match(/^toefljr-mock-(\d+)-([lfr])$/); if (!m) continue; (sets.get(m[1]) || sets.set(m[1], {}).get(m[1]))[m[2]] = e; }
  const nums = [...sets.keys()].sort((a, b) => a - b);
  X.page(`<a class="back" href="#/">${X.BACK_IC}英语首页</a>
    <div class="hero"><h1>小托福</h1></div>
    ${nums.length ? nums.map((n) => `<section class="card tj-set"><div class="card-h"><h2>仿真模拟 第 ${n} 套</h2></div>
      <div class="tj-parts">${['l', 'f', 'r'].map((k) => { const e = sets.get(n)[k]; if (!e) return ''; return `<div class="tj-part">
        <b>${PART[k]}</b><span>${e.problem_count} 题 · ${Math.round(e.duration_sec / 60)} 分钟</span>
        ${e.last_session ? `<a class="tj-score" href="#/tj/review/${e.last_session}">${e.last_score} / ${e.problem_count}</a>` : '<span class="tj-score muted">—</span>'}
        <button class="btn ${e.last_session ? '' : 'primary'}" data-start="${e.id}">${e.last_session ? '再做一次' : '开始'}</button></div>`; }).join('')}</div></section>`).join('')
      : '<div class="card"><p class="muted">录入中</p></div>'}`, 'home');
  X.$app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await X.api('/api/sessions', { method: 'POST', body: { exam_id: b.dataset.start, student_id: X.auth.student.id, mode: 'exam' } });
      location.hash = `#/tj/exam/${r.session.id}`;
    } catch (e) { b.disabled = false; X.modal(`<p>${X.esc(e.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  }));
}

// ───────── 做题 ─────────
// 一屏一组材料：听力是一段录音 + 它的题；语言题是一篇带空的短文；阅读是一篇文章 + 它的题
export async function renderTJExam(sid) {
  const d = await X.api(`/api/sessions/${X.enc(sid)}`);
  if (d.session.submitted) { location.replace(`#/tj/review/${sid}`); return; }
  const part = partOf(d.exam.id);
  const G = d.exam.sections?.[0]?.groups || [];
  const P = d.problems; const byNum = new Map(P.map((p) => [p.number, p]));
  const key = `tj.s.${sid}`;
  const S = Object.assign({ g: 0, answers: {}, played: {} }, X.store.get(key, {}));
  const save = () => X.store.set(key, S);
  const skew = d.session.server_now - Date.now();
  const left = () => (d.session.deadline_at - (Date.now() + skew)) / 1000;
  let timer = null, audio = null, submitting = false;
  X.setCleanup(() => { clearInterval(timer); audio?.pause(); });

  async function submit(auto) {
    if (submitting) return; submitting = true; clearInterval(timer); audio?.pause();
    try {
      await X.api(`/api/sessions/${X.enc(sid)}/submit`, { method: 'POST', body: { answers: S.answers, times: {} } });
      X.store.del(key);
      if (auto) X.modal('<h2>时间到，已自动交卷</h2><div class="actions"><button class="btn primary" data-close>看成绩</button></div>');
      location.replace(`#/tj/review/${sid}`);
    } catch (e) { submitting = false; X.modal(`<h2>交卷没成功</h2><p>${X.esc(e.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  }
  function finish() {
    const blank = P.filter((p) => !S.answers[p.id]).length;
    if (!blank) return submit(false);
    X.modal(`<h2>还有 ${blank} 题没做</h2><div class="actions"><button class="btn" data-close>回去检查</button><button class="btn primary" id="sure">交卷</button></div>`,
      (m, close) => { m.querySelector('#sure').onclick = () => { close(); submit(false); }; });
  }
  const qBlock = (p, label) => `<div class="tj-q" id="q${p.number}"><div class="tj-qh"><b>${p.number}</b>${label ? `<span>${X.esc(label)}</span>` : ''}</div>
    <div class="tj-opts">${Object.entries(p.choices).map(([k, v]) => `<button type="button" class="tj-opt ${S.answers[p.id] === k ? 'on' : ''}" data-p="${p.id}" data-k="${k}"><i>${k}</i><span>${X.esc(v)}</span></button>`).join('')}</div></div>`;
  function formText(g) { // 空里显示已选的词
    return paras(g.text).replace(/\[\[(\d+)\]\]/g, (_, n) => {
      const p = P.find((x) => x.extra?.blank === +n); const a = p && S.answers[p.id];
      return `<a class="tj-blank ${a ? 'on' : ''}" href="javascript:" data-jump="${p?.number}"><sup>${p?.number}</sup>${a ? X.esc(p.choices[a]) : '　　　　'}</a>`;
    });
  }
  function draw() {
    audio?.pause(); audio = null;
    const g = G[S.g]; const qs = []; for (let n = g.from; n <= g.to; n++) qs.push(byNum.get(n));
    const done = P.filter((p) => S.answers[p.id]).length;
    const last = S.g === G.length - 1;
    let mat = '';
    if (part === 'l') {
      const played = S.played[g.id];
      mat = `<div class="tj-listen"><button class="tj-play" id="play" ${played === 'done' ? 'disabled' : ''}>${played === 'done' ? '已播放' : played ? '播放中…' : '▶ 播放录音'}</button>
        <div class="tj-prog"><i id="aprog"></i></div><p class="small muted">${g.from === g.to ? `第 ${g.from} 题` : `第 ${g.from}–${g.to} 题`} · 录音只放一遍</p></div>`;
    } else mat = `<article class="tj-text">${g.title ? `<h3>${X.esc(g.title)}</h3>` : ''}${part === 'f' ? formText(g) : paras(g.text)}</article>`;
    const qsHtml = qs.map((p) => qBlock(p, part === 'l' || part === 'r' ? p.stem : '')).join('');
    X.$app.innerHTML = `<div class="tj-bar"><a class="back" href="#/tj">${X.BACK_IC}退出</a><b>${X.esc(d.exam.title)}</b>
        <span class="tj-clock" id="clock">${mmss(left())}</span><span class="tj-done">${done}/${P.length}</span><button class="btn sm" id="fin">交卷</button></div>
      <main class="page wide tj-main ${part === 'l' ? 'tj-l' : 'tj-2col'}">
        <div class="tj-mat">${mat}</div><div class="tj-qs">${qsHtml}</div>
      </main>
      <div class="tj-nav"><button class="btn" id="prev" ${S.g ? '' : 'disabled'}>上一${part === 'l' ? '段' : '篇'}</button>
        <span class="tj-gc">${S.g + 1} / ${G.length}</span><div class="tj-dots">${G.map((x, i) => { let all = true; for (let n = x.from; n <= x.to; n++) if (!S.answers[byNum.get(n).id]) all = false; return `<button class="${i === S.g ? 'cur' : ''} ${all ? 'ok' : ''}" data-g="${i}" aria-label="第 ${i + 1} 组">${i + 1}</button>`; }).join('')}</div>
        <button class="btn primary" id="next">${last ? '交卷' : `下一${part === 'l' ? '段' : '篇'}`}</button></div>`;
    document.body.className = 'tj-mode';
    window.scrollTo(0, 0);
    X.$app.querySelectorAll('.tj-opt').forEach((b) => (b.onclick = () => {
      const p = P.find((x) => x.id === b.dataset.p);
      S.answers[p.id] = b.dataset.k; save();
      b.parentElement.querySelectorAll('.tj-opt').forEach((x) => x.classList.toggle('on', x === b));
      if (part === 'f') { const t = X.$app.querySelector('.tj-text'); t.innerHTML = `${g.title ? `<h3>${X.esc(g.title)}</h3>` : ''}${formText(g)}`; bindJump(); }
      X.$app.querySelector('.tj-done').textContent = `${P.filter((x) => S.answers[x.id]).length}/${P.length}`;
    }));
    const bindJump = () => X.$app.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = () => X.$app.querySelector(`#q${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
    bindJump();
    const go = (i) => { S.g = i; save(); draw(); };
    X.$app.querySelector('#prev').onclick = () => go(S.g - 1);
    X.$app.querySelector('#next').onclick = () => (last ? finish() : go(S.g + 1));
    X.$app.querySelector('#fin').onclick = finish;
    X.$app.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => go(+b.dataset.g)));
    const pb = X.$app.querySelector('#play');
    if (pb) pb.onclick = () => {
      if (S.played[g.id] === 'done') return;
      audio = new Audio(AUDIO + g.audio);
      audio.ontimeupdate = () => { const el = X.$app.querySelector('#aprog'); if (el && audio.duration) el.style.width = `${(100 * audio.currentTime) / audio.duration}%`; };
      audio.onended = () => { S.played[g.id] = 'done'; save(); pb.textContent = '已播放'; pb.disabled = true; };
      audio.play().then(() => { S.played[g.id] = 'on'; save(); pb.textContent = '播放中…'; pb.disabled = true; })
        .catch(() => X.modal('<p>录音没能播放，请检查网络后再点一次。</p><div class="actions"><button class="btn" data-close>好</button></div>'));
    };
  }
  timer = setInterval(() => { const el = X.$app.querySelector('#clock'); if (el) el.textContent = mmss(left()); if (left() <= 0) submit(true); }, 1000);
  draw();
}

// 语言题的考点很细，复盘统计时并成几大类
const formType = (t = '') => /名词短语/.test(t) ? '名词短语与词序'
  : /介词/.test(t) ? '介词' : /从句|连词|引导/.test(t) ? '从句与连词'
  : /doing|to do|不定式|动名词|enjoy|forward|trouble|ask|need/.test(t) ? '非谓语动词'
  : /含义/.test(t) ? '词义' : /时|语态|主谓|谓语|will|情态|原形|短语动词|hide/.test(t) ? '动词的形式' : '其他';

// ───────── 复盘 ─────────
export async function renderTJReview(sid) {
  const r = await X.api(`/api/sessions/${X.enc(sid)}/review`);
  const part = partOf(r.exam.id);
  const G = r.exam.sections?.[0]?.groups || [];
  const items = new Map(r.items.map((it) => [it.number, it]));
  const right = r.items.filter((it) => it.correct).length;
  const types = {};
  for (const it of r.items) { const t = part === 'f' ? formType(it.extra?.type) : it.extra?.type || '其他'; (types[t] ||= [0, 0])[1]++; if (it.correct) types[t][0]++; }
  const typeRows = Object.entries(types).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
  let audio = null; X.setCleanup(() => audio?.pause());
  const optRow = (it) => Object.entries(it.choices).map(([k, v]) => `<div class="tj-ro ${k === it.answer ? 'key' : ''} ${k === it.choice && !it.correct ? 'bad' : ''}"><i>${k}</i><span>${X.esc(v)}</span>${k === it.answer ? '<em>正确答案</em>' : k === it.choice ? '<em>你的选择</em>' : ''}</div>`).join('');
  const qRev = (it) => `<div class="tj-rq ${it.correct ? 'ok' : it.choice ? 'bad' : 'skip'}" id="q${it.number}"><div class="tj-qh"><b>${it.number}</b>${it.stem ? `<span>${X.esc(it.stem)}</span>` : ''}<small>${it.extra?.type || ''}</small></div>
    ${optRow(it)}${it.basic ? `<p class="tj-exp">${X.esc(it.basic)}</p>` : ''}</div>`;
  const formRev = (g) => paras(g.text).replace(/\[\[(\d+)\]\]/g, (_, n) => { const it = r.items.find((x) => x.extra?.blank === +n); return `<a class="tj-blank on ${it?.correct ? 'ok' : 'bad'}" href="#q${it?.number}"><sup>${it?.number}</sup>${X.esc(it?.choices[it.answer] ?? '')}</a>`; });
  const groupRev = (g) => {
    const its = []; for (let n = g.from; n <= g.to; n++) its.push(items.get(n));
    const mat = part === 'l'
      ? `<div class="tj-script"><button class="btn sm" data-audio="${X.esc(g.audio)}">▶ 再听一遍</button><details><summary>录音原文</summary>${g.script.map(([who, , line]) => `<p><b>${X.esc(who)}:</b> ${X.esc(line)}</p>`).join('')}</details></div>`
      : `<article class="tj-text">${g.title ? `<h3>${X.esc(g.title)}</h3>` : ''}${part === 'f' ? formRev(g) : paras(g.text)}</article>`;
    return `<section class="card tj-rg"><div class="tj-rg-h">${g.from === g.to ? `第 ${g.from} 题` : `第 ${g.from}–${g.to} 题`}</div>${mat}${its.map(qRev).join('')}</section>`;
  };
  X.page(`<a class="back" href="#/tj">${X.BACK_IC}小托福</a>
    <div class="hero"><h1>${X.esc(r.exam.title)}</h1></div>
    <div class="tj-sum card"><div class="tj-big"><b>${right}</b> / ${r.items.length}<small>答对</small></div>
      <div class="tj-types">${typeRows.map(([t, [a, b]]) => `<div class="tj-type"><span>${X.esc(t)}</span><i><u style="width:${(100 * a) / b}%"></u></i><em>${a}/${b}</em></div>`).join('')}</div></div>
    <div class="tj-sheet">${r.items.map((it) => `<a href="#q${it.number}" class="${it.correct ? 'ok' : it.choice ? 'bad' : 'skip'}">${it.number}</a>`).join('')}</div>
    ${G.map(groupRev).join('')}`, 'home');
  X.$app.querySelectorAll('.tj-sheet a, a.tj-blank').forEach((a) => (a.onclick = (e) => { e.preventDefault(); X.$app.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  X.$app.querySelectorAll('[data-audio]').forEach((b) => (b.onclick = () => {
    if (audio && !audio.paused && audio.dataset === b.dataset.audio) { audio.pause(); return; }
    audio?.pause(); audio = new Audio(AUDIO + b.dataset.audio); audio.play();
  }));
}
