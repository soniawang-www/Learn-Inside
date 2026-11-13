// KET（A2 Key for Schools）仿真模拟：原创题，每套两份卷：阅读写作（32 题）、听力（25 题）
// 路由：#/ket（套题列表）  #/ket/exam/:会话 id（做题）  #/ket/review/:会话 id（复盘）
// 材料在 exam.sections[0].groups，一组是一个 Part；题目 extra.part / extra.group 指回去
// 题型：选择（kind choice）、填空（kind fill，没有选项）、写作（kind self，交卷后对照范文自评 0–15 分）
import { openPrint, PRINT_ICON } from '/assets/print/kit.js?v=20261111u';
let X; // app.js 传进来的工具：api、page、esc、enc、modal、store、auth、BACK_IC、$app、setCleanup
export const initKET = (ctx) => { X = ctx; };

const AUDIO = '/english/audio/ket/';
const IMG = '/english/img/ket/';
const partOf = (examId) => (String(examId).endsWith('-l') ? 'l' : 'rw');
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const paras = (t) => X.esc(t).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const words = (t) => (String(t || '').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
const PART_NAME = { rw: '阅读写作', l: '听力' };
const say = (msg) => X.modal(`<p>${X.esc(msg)}</p><div class="actions"><button class="btn" data-close>好</button></div>`);
const range = (g) => (g.from === g.to ? `Question ${g.from}` : `Questions ${g.from}–${g.to}`);
const lines = (script) => script.map(([who, , t]) => `<p><b>${X.esc(who)}:</b> ${X.esc(t)}</p>`).join('');
// 题目要求（和真卷一致的英文说明）
const RUBRIC = {
  R1: 'For each question, choose the correct answer.',
  R2: 'For each question, choose the correct answer.',
  R3: 'For each question, choose the correct answer.',
  R4: 'For each question, choose the correct answer.',
  R5: 'For each question, write the correct answer. Write one word for each gap.',
  W6: 'Write 25 words or more.',
  W7: 'Write 35 words or more.',
  L1: 'For each question, choose the correct answer.',
  L2: 'For each question, write the correct answer in the gap. Write one word or a number or a date or a time.',
  L3: 'For each question, choose the correct answer.',
  L4: 'For each question, choose the correct answer.',
  L5: 'For each question, choose the correct answer.',
};

// ───────── 套题列表 ─────────
async function start(examId) {
  const r = await X.api('/api/sessions', { method: 'POST', body: { exam_id: examId, student_id: X.auth.student.id, mode: 'exam' } });
  location.hash = `#/ket/exam/${r.session.id}`;
}
export async function renderKET() {
  const exams = await X.api(`/api/exams?student=${X.enc(X.auth.student.id)}&family=ket`);
  const sets = new Map();
  for (const e of exams) { const m = e.id.match(/^ket-mock-(\d+)-(rw|l)$/); if (!m) continue; (sets.get(m[1]) || sets.set(m[1], {}).get(m[1]))[m[2]] = e; }
  const nums = [...sets.keys()].sort((a, b) => a - b);
  X.page(`<a class="back" href="#/">${X.BACK_IC}英语首页</a>
    <div class="hero"><h1>KET</h1></div>
    ${nums.length ? `<section class="card tj-list">${nums.map((n) => `<div class="tj-row kt-row"><b>第 ${n} 套</b>
      <div class="tj-chips kt-chips">${['rw', 'l'].map((k) => { const e = sets.get(n)[k]; if (!e) return '<span></span>';
        return e.last_session ? `<a class="tj-chip done" href="#/ket/review/${e.last_session}">${PART_NAME[k]}<em>${fmt(e.last_score)}/${k === 'rw' ? 60 : 25}</em></a>`
          : `<button class="tj-chip" data-start="${e.id}">${PART_NAME[k]}</button>`; }).join('')}</div>
      <button class="tj-pr" data-print="${n}" aria-label="打印第 ${n} 套">${PRINT_ICON}</button></div>`).join('')}</section>`
      : '<div class="card"><p class="muted">录入中</p></div>'}`, 'ket');
  X.$app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await start(b.dataset.start); } catch (e) { b.disabled = false; say(e.message); }
  }));
  X.$app.querySelectorAll('[data-print]').forEach((b) => (b.onclick = () => printKET(b.dataset.print)));
}
const fmt = (x) => (Number.isInteger(+x) ? +x : (+x).toFixed(1));

// ───────── 材料的画法（做题、复盘共用） ─────────
function notice(it) {
  const t = X.esc(it.text).replace(/\n/g, '<br>');
  if (it.kind === 'text') return `<div class="kt-sms"><small>${X.esc(it.head)}</small><p>${t}</p></div>`;
  if (it.kind === 'email') return `<div class="kt-mail"><div class="kt-mail-h">${X.esc(it.head).replace(/\n/g, '<br>')}</div><p>${t}</p></div>`;
  if (it.kind === 'note') return `<div class="kt-note"><b>${X.esc(it.head)}</b><p>${t}</p></div>`;
  return `<div class="kt-sign ${it.kind}"><b>${X.esc(it.head)}</b><p>${t}</p></div>`;
}
const pic = (f, alt = '') => `<img class="kt-pic" src="${IMG}${X.esc(f)}" alt="${X.esc(alt)}" loading="lazy">`;
function blanks(text, P, part, fn) { // [[n]] → 第 n 个空（同一组里按 extra.blank 找题）
  return paras(text).replace(/\[\[(\d+)\]\]/g, (_, n) => { const p = P.find((x) => x.extra?.part === part && x.extra?.blank === +n); return p ? fn(p) : ''; });
}
function notesForm(g, fn) { // 听力 Part 2 的笔记：数字是第几个空，字符串里的 [n] 也是空
  const cell = (v) => (typeof v === 'number' ? fn(v) : X.esc(v).replace(/\[(\d+)\]/g, (_, n) => fn(+n)));
  return `<div class="kt-notes"><h3>${X.esc(g.title)}</h3>${g.notes.map(([k, v]) => `<div class="kt-nr"><span>${X.esc(k)}</span><div>${cell(v)}</div></div>`).join('')}</div>`;
}

// ───────── 做题 ─────────
export async function renderKETExam(sid) {
  const d = await X.api(`/api/sessions/${X.enc(sid)}`);
  if (d.session.submitted) { location.replace(`#/ket/review/${sid}`); return; }
  const part = partOf(d.exam.id);
  const G = d.exam.sections?.[0]?.groups || [];
  const P = d.problems;
  const inG = (g) => P.filter((p) => p.extra?.group === g.id);
  const key = `ket.s.${sid}`;
  const S = Object.assign({ g: 0, answers: {}, played: {} }, X.store.get(key, {}));
  const save = () => X.store.set(key, S);
  const skew = d.session.server_now - Date.now();
  const left = () => (d.session.deadline_at - (Date.now() + skew)) / 1000;
  const has = (p) => String(S.answers[p.id] ?? '').trim() !== '';
  let timer = null, audio = null, submitting = false;
  X.setCleanup(() => { clearInterval(timer); audio?.pause(); });

  async function submit(auto) {
    if (submitting) return; submitting = true; clearInterval(timer); audio?.pause();
    try {
      await X.api(`/api/sessions/${X.enc(sid)}/submit`, { method: 'POST', body: { answers: S.answers, times: {} } });
      X.store.del(key);
      if (auto) X.modal('<h2>时间到，已自动交卷</h2><div class="actions"><button class="btn primary" data-close>看成绩</button></div>');
      location.replace(`#/ket/review/${sid}`);
    } catch (e) { submitting = false; X.modal(`<h2>交卷没成功</h2><p>${X.esc(e.message)}</p><div class="actions"><button class="btn primary" data-close>好</button></div>`); }
  }
  function finish() {
    const blank = P.filter((p) => !has(p)).length;
    if (!blank) return submit(false);
    X.modal(`<h2>还有 ${blank} 题没做</h2><div class="actions"><button class="btn" data-close>回去检查</button><button class="btn primary" id="sure">交卷</button></div>`,
      (m, close) => { m.querySelector('#sure').onclick = () => { close(); submit(false); }; });
  }
  const opts = (p, label) => `<div class="tj-opts">${Object.entries(p.choices).map(([k, v]) => `<button type="button" class="tj-opt ${S.answers[p.id] === k ? 'on' : ''}" data-p="${p.id}" data-k="${k}"><i>${k}</i><span>${X.esc(label ? label(k, v) : v)}</span></button>`).join('')}</div>`;
  const qBox = (p, stem, body) => `<div class="tj-q" id="q${p.number}"><div class="tj-qh"><b>${p.number}</b>${stem ? `<span>${X.esc(stem)}</span>` : ''}</div>${body}</div>`;
  const input = (p, cls = '') => `<label class="kt-in ${cls}"><sup>${p.number}</sup><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-fill="${p.id}" value="${X.esc(S.answers[p.id] || '')}" aria-label="第 ${p.number} 题"></label>`;

  function body(g) {
    const qs = inG(g);
    switch (g.kind) {
      case 'notices': return `<div class="kt-n-list">${qs.map((p) => `<div class="kt-n" id="q${p.number}"><div class="kt-n-m">${notice(g.items[p.extra.idx])}</div>
        <div class="kt-n-q"><div class="tj-qh"><b>${p.number}</b></div>${opts(p)}</div></div>`).join('')}</div>`;
      case 'people': return `<div class="tj-2col"><div class="tj-mat kt-people">${g.title ? `<h3>${X.esc(g.title)}</h3>` : ''}<p class="kt-intro">${X.esc(g.intro)}</p>
        ${g.people.map((x, i) => `<article class="tj-text kt-person"><h4><i>${'ABC'[i]}</i>${X.esc(x.name)}</h4>${paras(x.text)}</article>`).join('')}</div>
        <div class="tj-qs">${qs.map((p) => qBox(p, p.stem, opts(p))).join('')}</div></div>`;
      case 'article': return `<div class="tj-2col"><div class="tj-mat"><article class="tj-text"><h3>${X.esc(g.title)}</h3>${g.byline ? `<p class="kt-by">${X.esc(g.byline)}</p>` : ''}${paras(g.text)}</article></div>
        <div class="tj-qs">${qs.map((p) => qBox(p, p.stem, opts(p))).join('')}</div></div>`;
      case 'cloze': return `<div class="tj-2col"><div class="tj-mat"><article class="tj-text"><h3>${X.esc(g.title)}</h3>${clozeText(g, qs)}</article></div>
        <div class="tj-qs">${qs.map((p) => qBox(p, '', opts(p))).join('')}</div></div>`;
      case 'open': return `<div class="kt-solo"><article class="tj-text kt-mailbox"><div class="kt-mail-h">${X.esc(g.head).replace(/\n/g, '<br>')}</div>${blanks(g.text, qs, 5, (p) => input(p))}</article></div>`;
      case 'email': case 'story': {
        const p = qs[0]; const v = S.answers[p.id] || '';
        return `<div class="kt-solo"><div class="tj-text kt-task">${paras(g.prompt)}${g.points ? `<p>In your email:</p><ul>${g.points.map((x) => `<li>${X.esc(x)}</li>`).join('')}</ul>` : ''}
          ${g.pics ? `<div class="kt-story">${g.pics.map((f, i) => pic(f, g.alt?.[i])).join('')}</div>` : ''}<p class="kt-rub"><b>${X.esc(RUBRIC[g.id])}</b></p></div>
          <div class="kt-write"><textarea data-write="${p.id}" rows="9" spellcheck="false" placeholder="Write here…">${X.esc(v)}</textarea><div class="kt-wc" id="wc"><b>${words(v)}</b> words</div></div></div>`;
      }
      case 'pictures': return listen(g) + `<div class="tj-qs">${qs.map((p) => qBox(p, p.stem, `<div class="kt-pics">${Object.entries(p.choices).map(([k, v]) =>
        `<button type="button" class="kt-pick tj-opt ${S.answers[p.id] === k ? 'on' : ''}" data-p="${p.id}" data-k="${k}"><i>${k}</i>${pic(p.extra.pics[k], v)}</button>`).join('')}</div>`)).join('')}</div>`;
      case 'notes': return listen(g) + `<p class="kt-intro">${X.esc(g.intro)}</p>` + notesForm(g, (n) => input(qs[n - 1], 'wide'));
      case 'conv': return listen(g) + `<p class="kt-intro">${X.esc(g.intro)}</p><div class="tj-qs">${qs.map((p) => qBox(p, p.stem, opts(p))).join('')}</div>`;
      case 'short': return listen(g) + `<div class="tj-qs">${qs.map((p) => qBox(p, '', `<p class="kt-ctx">${X.esc(p.extra.ctx)}</p><p class="kt-stem">${X.esc(p.stem)}</p>${opts(p)}`)).join('')}</div>`;
      case 'match': {
        const ch = qs[0].choices;
        return listen(g) + `<p class="kt-intro">${X.esc(g.intro)}</p><p class="kt-stem">${X.esc(g.q)}</p>
          <div class="kt-match"><div class="kt-mopts">${Object.entries(ch).map(([k, v]) => `<span><i>${k}</i>${X.esc(v)}</span>`).join('')}</div>
          <div class="kt-mrows"><div class="kt-mr kt-ex"><b>0</b><span>${X.esc(g.example[0])}</span><div class="kt-mk"><button class="on" disabled>${g.example[1]}</button></div></div>
          ${qs.map((p) => `<div class="kt-mr" id="q${p.number}"><b>${p.number}</b><span>${X.esc(p.stem)}</span><div class="kt-mk">${Object.keys(p.choices).map((k) =>
            `<button type="button" class="${S.answers[p.id] === k ? 'on' : ''}" data-p="${p.id}" data-k="${k}" aria-label="${X.esc(p.stem)}：${k} ${X.esc(p.choices[k])}">${k}</button>`).join('')}</div></div>`).join('')}</div></div>`;
      }
    }
    return '';
  }
  function clozeText(g, qs) {
    return blanks(g.text, qs, 4, (p) => { const a = S.answers[p.id]; return `<a class="tj-blank ${a ? 'on' : ''}" href="javascript:" data-jump="${p.number}"><sup>${p.number}</sup>${a ? X.esc(p.choices[a]) : '　　　　'}</a>`; });
  }
  function listen(g) {
    const st = S.played[g.id];
    return `<div class="tj-listen"><button class="tj-play" id="play" ${st === 'done' ? 'disabled' : ''}>${st === 'done' ? '已播放' : st ? '播放中…' : '▶ 播放录音'}</button>
      <div class="tj-prog"><i id="aprog"></i></div><p class="small muted">${range(g)} · 每段录音读两遍，只能播放一次</p></div>`;
  }
  function draw() {
    audio?.pause(); audio = null;
    const g = G[S.g];
    const done = P.filter(has).length;
    const last = S.g === G.length - 1;
    const wide = ['notices', 'people', 'article', 'cloze'].includes(g.kind);
    X.$app.innerHTML = `<div class="tj-bar"><a class="back" href="#/ket">${X.BACK_IC}退出</a><b>${X.esc(d.exam.title)}</b>
        <span class="tj-clock" id="clock">${mmss(left())}</span><span class="tj-done">${done}/${P.length}</span><button class="btn sm" id="fin">交卷</button></div>
      <main class="page ${wide ? 'wide' : ''} tj-main kt-main">
        <div class="kt-head"><b>${X.esc(g.name)}</b><span>${range(g)}</span></div>${g.part > 5 ? '' : `<p class="kt-rub">${X.esc(RUBRIC[g.id])}</p>`}
        ${body(g)}
      </main>
      <div class="tj-nav"><button class="btn" id="prev" ${S.g ? '' : 'disabled'}>上一部分</button>
        <span class="tj-gc">${S.g + 1} / ${G.length}</span><div class="tj-dots">${G.map((x, i) => `<button class="${i === S.g ? 'cur' : ''} ${inG(x).every(has) ? 'ok' : ''}" data-g="${i}" aria-label="${X.esc(x.name)}">${x.id.slice(1)}</button>`).join('')}</div>
        <button class="btn primary" id="next">${last ? '交卷' : '下一部分'}</button></div>`;
    document.body.className = 'tj-mode';
    window.scrollTo(0, 0);
    const count = () => { X.$app.querySelector('.tj-done').textContent = `${P.filter(has).length}/${P.length}`; };
    X.$app.querySelectorAll('[data-p][data-k]').forEach((b) => (b.onclick = () => {
      const p = P.find((x) => x.id === b.dataset.p);
      S.answers[p.id] = b.dataset.k; save();
      b.parentElement.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
      if (g.kind === 'cloze') { X.$app.querySelector('.tj-mat .tj-text').innerHTML = `<h3>${X.esc(g.title)}</h3>${clozeText(g, inG(g))}`; bindJump(); }
      count();
    }));
    X.$app.querySelectorAll('[data-fill]').forEach((el) => (el.oninput = () => { S.answers[el.dataset.fill] = el.value; save(); count(); }));
    const ta = X.$app.querySelector('[data-write]');
    if (ta) ta.oninput = () => { S.answers[ta.dataset.write] = ta.value; save(); X.$app.querySelector('#wc b').textContent = words(ta.value); count(); };
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
        .catch(() => say('录音没能播放，请检查网络后再点一次。'));
    };
  }
  timer = setInterval(() => { const el = X.$app.querySelector('#clock'); if (el) el.textContent = mmss(left()); if (left() <= 0) submit(true); }, 1000);
  draw();
}

// ───────── 复盘 ─────────
// 写作按官方三项（内容、结构、语言）各 0–5 分自评
const CRIT = [
  ['内容', { email: '三个要点都写到了吗？读的人能完全看明白吗？', story: '三幅图的内容都写到了吗？读的人能看明白发生了什么吗？' }],
  ['结构', '句子之间有没有用 and、but、because、then 这类词连起来？'],
  ['语言', '用词合适吗？简单的语法基本写对了吗？'],
];
export async function renderKETReview(sid) {
  const r = await X.api(`/api/sessions/${X.enc(sid)}/review`);
  const part = partOf(r.exam.id);
  const G = r.exam.sections?.[0]?.groups || [];
  const items = r.items;
  const inG = (g) => items.filter((it) => it.extra?.group === g.id);
  let audio = null; X.setCleanup(() => audio?.pause());
  const auto = items.filter((it) => it.kind !== 'self');
  const right = auto.filter((it) => it.correct).length;
  const W = items.filter((it) => it.kind === 'self');
  const wGot = W.reduce((s, it) => s + (+it.got || 0), 0);
  const bars = G.filter((g) => inG(g).some((it) => it.kind !== 'self')).map((g) => { const its = inG(g); const a = its.filter((x) => x.correct).length; return [g.name.replace('Reading ', '').replace('Listening ', ''), a, its.length]; });

  const optRow = (it, label) => Object.entries(it.choices).map(([k, v]) => `<div class="tj-ro ${k === it.answer ? 'key' : ''} ${k === it.choice && !it.correct ? 'bad' : ''}"><i>${k}</i><span>${X.esc(label ? label(k, v) : v)}</span>${k === it.answer ? '<em>正确答案</em>' : k === it.choice ? '<em>你的选择</em>' : ''}</div>`).join('');
  const st = (it) => (it.correct ? 'ok' : it.choice ? 'bad' : 'skip');
  const exp = (it) => (it.basic ? `<p class="tj-exp">${X.esc(it.basic)}</p>` : '');
  const qRev = (it, inner) => `<div class="tj-rq ${st(it)}" id="q${it.number}"><div class="tj-qh"><b>${it.number}</b>${it.stem && it.kind !== 'self' ? `<span>${X.esc(it.stem)}</span>` : ''}</div>${inner ?? optRow(it)}${exp(it)}</div>`;
  const fillRev = (it) => `<div class="tj-rq ${st(it)}" id="q${it.number}"><div class="tj-qh"><b>${it.number}</b></div>
    <div class="kt-fill"><span class="${it.correct ? 'ok' : 'bad'}">你填的：${it.choice ? `<b>${X.esc(it.choice)}</b>` : '没填'}</span><span>答案：<b>${X.esc(it.answer)}</b></span></div>${exp(it)}</div>`;
  const pickRev = (it) => `<div class="kt-pics">${Object.entries(it.choices).map(([k, v]) => `<div class="kt-pick rv ${k === it.answer ? 'key' : ''} ${k === it.choice && !it.correct ? 'bad' : ''}"><i>${k}</i>${pic(it.extra.pics[k], v)}<small>${k === it.answer ? '正确答案' : k === it.choice ? '你的选择' : ''}</small></div>`).join('')}</div>`;
  const play = (g) => `<button class="btn sm" data-audio="${X.esc(g.audio)}">▶ 再听一遍</button>`;
  const scriptBox = (sc, label = '录音原文') => `<details class="kt-scr"><summary>${label}</summary>${lines(sc)}</details>`;
  const writeRev = (g, it) => {
    const v = it.choice || ''; const n = words(v); const need = g.words;
    return `<div class="tj-rq kt-wr" id="q${it.number}"><div class="tj-qh"><b>${it.number}</b><span>${g.kind === 'email' ? '写邮件' : '看图写故事'}</span></div>
      <div class="kt-task-mini">${paras(g.prompt)}${g.points ? `<ul>${g.points.map((x) => `<li>${X.esc(x)}</li>`).join('')}</ul>` : ''}${g.pics ? `<div class="kt-story sm">${g.pics.map((f, i) => pic(f, g.alt?.[i])).join('')}</div>` : ''}</div>
      <div class="kt-mine"><div class="kt-lab">你写的 <span class="${n >= need ? 'ok' : 'bad'}">${n} 词${n >= need ? '' : `，不到 ${need} 词`}</span></div>${v ? paras(v) : '<p class="muted">没写</p>'}</div>
      <div class="kt-model"><div class="kt-lab">参考范文</div>${paras(it.basic || '')}</div>
      <div class="kt-self" data-self="${it.problem_id}">${CRIT.map(([k, tip], i) => `<div class="kt-crit"><div><b>${k}</b><small>${typeof tip === 'string' ? tip : tip[g.kind]}</small></div><div class="kt-sc">${[0, 1, 2, 3, 4, 5].map((s) => `<button type="button" data-c="${i}" data-s="${s}">${s}</button>`).join('')}</div></div>`).join('')}
        <div class="kt-selfsum">自评 <b data-sum>${it.got ? fmt(it.got) : '–'}</b> / 15</div></div></div>`;
  };
  const groupRev = (g) => {
    const its = inG(g); let mat = '', qs = '';
    switch (g.kind) {
      case 'notices': qs = its.map((it) => `<div class="kt-n rv"><div class="kt-n-m">${notice(g.items[it.extra.idx])}</div><div>${qRev(it)}</div></div>`).join(''); break;
      case 'people': mat = g.people.map((x, i) => `<details class="kt-pp"><summary><i>${'ABC'[i]}</i>${X.esc(x.name)}</summary><div class="tj-text">${paras(x.text)}</div></details>`).join('');
        qs = its.map((it) => qRev(it)).join(''); break;
      case 'article': mat = `<details class="kt-pp"><summary>${X.esc(g.title)}</summary><div class="tj-text">${paras(g.text)}</div></details>`; qs = its.map((it) => qRev(it)).join(''); break;
      case 'cloze': mat = `<article class="tj-text"><h3>${X.esc(g.title)}</h3>${blanks(g.text, its, 4, (it) => `<a class="tj-blank on ${it.correct ? 'ok' : 'bad'}" href="#q${it.number}"><sup>${it.number}</sup>${X.esc(it.choices[it.answer])}</a>`)}</article>`;
        qs = its.map((it) => qRev(it)).join(''); break;
      case 'open': mat = `<article class="tj-text"><div class="kt-mail-h">${X.esc(g.head).replace(/\n/g, '<br>')}</div>${blanks(g.text, its, 5, (it) => `<a class="tj-blank on ${it.correct ? 'ok' : 'bad'}" href="#q${it.number}"><sup>${it.number}</sup>${X.esc(it.answer)}</a>`)}</article>`;
        qs = its.map(fillRev).join(''); break;
      case 'email': case 'story': qs = writeRev(g, its[0]); break;
      case 'pictures': mat = play(g); qs = its.map((it) => qRev(it, pickRev(it) + scriptBox(it.extra.script))).join(''); break;
      case 'notes': mat = `${play(g)}${notesForm(g, (n) => { const it = its[n - 1]; return `<a class="tj-blank on ${it.correct ? 'ok' : 'bad'}" href="#q${it.number}"><sup>${it.number}</sup>${X.esc(it.answer)}</a>`; })}${scriptBox(g.script)}`;
        qs = its.map(fillRev).join(''); break;
      case 'conv': mat = `${play(g)}${scriptBox(g.script)}`; qs = its.map((it) => qRev(it)).join(''); break;
      case 'short': mat = play(g); qs = its.map((it) => qRev({ ...it, stem: `${it.extra.ctx} ${it.stem}` }, optRow(it) + scriptBox(it.extra.script))).join(''); break;
      case 'match': mat = `${play(g)}${scriptBox(g.script)}`; qs = its.map((it) => qRev(it, optRow(it))).join(''); break;
    }
    return `<section class="card tj-rg"><div class="tj-rg-h">${X.esc(g.name)} · ${range(g)}</div>${mat}${qs}</section>`;
  };
  const sum = part === 'rw'
    ? `<div class="tj-big"><b>${right}</b> / 30<small>阅读</small></div><div class="tj-big"><b id="wsum">${W.some((x) => x.got) ? fmt(wGot) : '–'}</b> / 30<small>写作自评</small></div>`
    : `<div class="tj-big"><b>${right}</b> / 25<small>听力</small></div>`;
  X.page(`<a class="back" href="#/ket">${X.BACK_IC}KET</a>
    <div class="hero"><h1>${X.esc(r.exam.title)}</h1></div>
    <div class="tj-sum card">${sum}
      <div class="tj-types">${bars.map(([t, a, b]) => `<div class="tj-type"><span>${X.esc(t)}</span><i><u style="width:${(100 * a) / b}%"></u></i><em>${a}/${b}</em></div>`).join('')}</div></div>
    <div class="actions tj-acts"><button class="btn primary" id="again">再做一次</button><button class="btn" id="prt">${PRINT_ICON}打印</button></div>
    <div class="tj-sheet">${items.map((it) => `<a href="#q${it.number}" class="${it.kind === 'self' ? 'skip' : st(it)}">${it.number}</a>`).join('')}</div>
    ${G.map(groupRev).join('')}`, 'ket');
  const setN = r.exam.id.match(/mock-(\d+)-/)?.[1];
  X.$app.querySelector('#again').onclick = (e) => { e.currentTarget.disabled = true; start(r.exam.id).catch((x) => say(x.message)); };
  X.$app.querySelector('#prt').onclick = () => printKET(setN, part);
  X.$app.querySelectorAll('.tj-sheet a, a.tj-blank').forEach((a) => (a.onclick = (e) => { e.preventDefault(); X.$app.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  X.$app.querySelectorAll('[data-audio]').forEach((b) => (b.onclick = () => { audio?.pause(); audio = new Audio(AUDIO + b.dataset.audio); audio.play(); }));
  // 写作自评：三项都点了才提交
  X.$app.querySelectorAll('[data-self]').forEach((box) => {
    const pid = box.dataset.self; const k = `ket.self.${sid}.${pid}`; const sc = X.store.get(k, [null, null, null]);
    const paint = () => { box.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', sc[+b.dataset.c] === +b.dataset.s)); };
    paint();
    box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
      sc[+b.dataset.c] = +b.dataset.s; X.store.set(k, sc); paint();
      if (sc.some((x) => x === null)) return;
      const got = sc.reduce((a, x) => a + x, 0);
      try {
        await X.api(`/api/sessions/${X.enc(sid)}/selfscore`, { method: 'POST', body: { problem_id: pid, got } });
        box.querySelector('[data-sum]').textContent = got;
        const it = items.find((x) => x.problem_id === pid); it.got = got;
        const el = X.$app.querySelector('#wsum'); if (el) el.textContent = fmt(W.reduce((s, x) => s + (+x.got || 0), 0));
      } catch (e) { say(e.message); }
    }));
  });
}

// ───────── 打印 ─────────
// 一套印一份卷（阅读写作 / 听力），可以附答案、讲解和听力原文；配图直接内嵌（存 PDF 时外链图片画不出来）
const cache = new Map();
const loadKET = async (id) => cache.get(id) || cache.set(id, await (await fetch(`/api/toefljr/${id}`)).json()).get(id);
const svgCache = new Map();
async function inlineSvgs(names) {
  await Promise.all([...new Set(names)].filter((n) => !svgCache.has(n)).map(async (n) => svgCache.set(n, (await (await fetch(IMG + n)).text()).replace(/^<\?xml[^>]*>/, ''))));
}
const pe = (s) => X.esc(s).split(/\n\s*\n/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
const po = (p) => `<div class="tq-o">${Object.entries(p.choices).map(([k, v]) => `<span>(${k}) ${X.esc(v)}</span>`).join('')}</div>`;
const isvg = (n) => `<span class="ki">${svgCache.get(n) || ''}</span>`;
function ketBlocks(d, part, o) {
  const G = d.sections?.[0]?.groups || [], P = d.problems, out = [];
  const inG = (g) => P.filter((p) => p.extra?.group === g.id);
  const head = (g) => `<div class="kh"><b>${X.esc(g.name)}</b> · ${range(g)}</div><div class="kr">${X.esc(RUBRIC[g.id])}</div>`;
  const line = (p) => `<span class="bl">(${p.number})</span>`;
  for (const g of G) {
    const qs = inG(g);
    switch (g.kind) {
      case 'notices': out.push({ page: g !== G[0], html: head(g) });
        qs.forEach((p) => { const it = g.items[p.extra.idx]; out.push(`<div class="kn"><div class="kb ${it.kind}"><b>${X.esc(it.head).replace(/\n/g, '<br>')}</b><div>${X.esc(it.text).replace(/\n/g, '<br>')}</div></div><div class="tq"><b>${p.number}.</b>${po(p)}</div></div>`); }); break;
      case 'people': out.push({ page: true, html: `${head(g)}<div class="tt"><h3>${X.esc(g.title)}</h3>${g.people.map((x, i) => `<p><b>${'ABC'[i]} ${X.esc(x.name)}</b><br>${X.esc(x.text)}</p>`).join('')}</div>` });
        qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)} <span class="abc">A ${X.esc(p.choices.A)}　B ${X.esc(p.choices.B)}　C ${X.esc(p.choices.C)}</span></div>`)); break;
      case 'article': out.push({ page: true, html: `${head(g)}<div class="tt"><h3>${X.esc(g.title)}</h3>${g.byline ? `<p><i>${X.esc(g.byline)}</i></p>` : ''}${pe(g.text)}</div>` });
        qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)}${po(p)}</div>`)); break;
      case 'cloze': out.push({ page: true, html: `${head(g)}<div class="tt"><h3>${X.esc(g.title)}</h3>${pe(g.text).replace(/\[\[(\d+)\]\]/g, (_, n) => line(qs[n - 1]))}</div>` });
        qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b>${po(p)}</div>`)); break;
      case 'open': out.push(`${head(g)}<div class="tt">${X.esc(g.head).replace(/\n/g, '<br>')}${pe(g.text).replace(/\[\[(\d+)\]\]/g, (_, n) => line(qs[n - 1]))}</div>`); break;
      case 'email': case 'story': out.push({ page: true, html: `${head(g)}<div class="tt">${pe(g.prompt)}${g.points ? `<ul>${g.points.map((x) => `<li>${X.esc(x)}</li>`).join('')}</ul>` : ''}</div>
        ${g.pics ? `<div class="ks">${g.pics.map(isvg).join('')}</div>` : ''}<div class="wl">${'<i></i>'.repeat(g.kind === 'email' ? 7 : 9)}</div>` }); break;
      case 'pictures': out.push({ page: g !== G[0], html: head(g) });
        qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)}<div class="kp">${Object.keys(p.choices).map((k) => `<div><b>${k}</b>${isvg(p.extra.pics[k])}</div>`).join('')}</div></div>`)); break;
      case 'notes': out.push(`${head(g)}<div class="kr">${X.esc(g.intro)}</div><div class="tt kt"><h3>${X.esc(g.title)}</h3>${g.notes.map(([k, v]) => `<div class="kq"><span>${X.esc(k)}</span><span>${typeof v === 'number' ? line(qs[v - 1]) : X.esc(v).replace(/\[(\d+)\]/g, (_, n) => line(qs[n - 1]))}</span></div>`).join('')}</div>`); break;
      case 'conv': out.push(`${head(g)}<div class="kr">${X.esc(g.intro)}</div>`); qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)}${po(p)}</div>`)); break;
      case 'short': out.push(head(g)); qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.extra.ctx)}<br>${X.esc(p.stem)}${po(p)}</div>`)); break;
      case 'match': out.push(`${head(g)}<div class="kr">${X.esc(g.intro)} ${X.esc(g.q)}</div><div class="km"><div>${Object.entries(qs[0].choices).map(([k, v]) => `<span><b>${k}</b> ${X.esc(v)}</span>`).join('')}</div>
        <div><p><i>Example: 0 ${X.esc(g.example[0])} — ${g.example[1]}</i></p>${qs.map((p) => `<p><b>${p.number}</b> ${X.esc(p.stem)} <span class="bl s"></span></p>`).join('')}</div></div>`); break;
    }
  }
  if (part === 'l' && o.script) {
    let first = true;
    for (const g of G) {
      const sc = g.script ? [[range(g), g.script]] : inG(g).map((p) => [`Question ${p.number}`, p.extra.script]);
      sc.forEach(([t, s]) => { out.push({ page: first, html: `${first ? '<h3 class="tk-h">录音原文</h3>' : ''}<div class="tg"><div class="tg-h">${X.esc(g.name)} · ${t}</div>${s.map(([w, , x]) => `<p class="ts"><b>${X.esc(w)}:</b> ${X.esc(x)}</p>`).join('')}</div>` }); first = false; });
    }
  }
  if (o.ans) {
    const auto = P.filter((p) => p.kind !== 'self');
    out.push({ page: true, html: `<h3 class="tk-h">答案</h3><div class="tk">${auto.map((p) => `<span><b>${p.number}</b> ${X.esc(p.kind === 'fill' ? [p.answer, ...(p.accept || [])].join(' / ') : p.answer)}</span>`).join('')}</div>` });
    if (o.exp) auto.forEach((p) => out.push(`<div class="te"><b>${p.number}. ${X.esc(p.answer)}</b> ${X.esc(p.basic || '')}</div>`));
    P.filter((p) => p.kind === 'self').forEach((p) => out.push(`<div class="te"><b>${p.number}. 参考范文</b><div class="tt">${pe(p.basic || '')}</div></div>`));
  }
  return out;
}
const KET_CSS = `
.lp-sheet .kh{font-size:14px;margin:10px 0 2px}
.lp-sheet .kr{font-size:12.5px;color:#5D6A65;margin:0 0 6px;font-family:Georgia,"Times New Roman",serif;font-style:italic}
.lp-sheet .tt{font-family:Georgia,"Times New Roman",serif;font-size:14px;line-height:1.65;border:1px solid #DCD7CA;border-radius:6px;padding:8px 12px;margin-bottom:8px}
.lp-sheet .tt h3{font-size:15px;margin:0 0 4px}
.lp-sheet .tt p{margin:0 0 6px}
.lp-sheet .tt ul{margin:4px 0;padding-left:20px}
.lp-sheet .bl{display:inline-block;min-width:5.5em;border-bottom:1px solid #333;font-size:11px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.lp-sheet .bl.s{min-width:3em}
.lp-sheet .tq{font-family:Georgia,"Times New Roman",serif;font-size:14px;line-height:1.5;padding:5px 0}
.lp-sheet .tq-o{display:grid;grid-template-columns:1fr;gap:1px;padding-left:1.4em;margin-top:2px}
.lp-sheet .abc{display:block;padding-left:1.4em;color:#5D6A65;font-size:13px}
.lp-sheet .kn{display:grid;grid-template-columns:42% 1fr;gap:14px;align-items:center;padding:6px 0;border-bottom:1px dashed #DCD7CA}
.lp-sheet .kb{border:1.5px solid #333;border-radius:6px;padding:8px 10px;font-family:Georgia,serif;font-size:13px;line-height:1.5;text-align:center}
.lp-sheet .kb.text,.lp-sheet .kb.email,.lp-sheet .kb.note{text-align:left;border-style:solid;border-radius:10px}
.lp-sheet .kb b{display:block;margin-bottom:3px}
.lp-sheet .kp{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:4px}
.lp-sheet .kp>div{display:grid;justify-items:center;gap:2px;font-size:12px}
.lp-sheet .ki svg{width:100%;height:auto;display:block}
.lp-sheet .kp .ki{width:150px}
.lp-sheet .ks{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:6px 0}
.lp-sheet .wl i{display:block;height:30px;border-bottom:1px solid #999}
.lp-sheet .kt .kq{display:grid;grid-template-columns:48% 1fr;padding:3px 0}
.lp-sheet .km{display:grid;grid-template-columns:30% 1fr;gap:16px;font-family:Georgia,serif;font-size:14px}
.lp-sheet .km span{display:block;line-height:1.7}
.lp-sheet .km p{margin:0 0 8px}
.lp-sheet .tg-h{font-size:12px;color:#5D6A65;margin:10px 0 4px;font-weight:600}
.lp-sheet .tk-h{font-size:15px;margin:4px 0 8px}
.lp-sheet .tk{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 10px;font-size:13px}
.lp-sheet .ts{font-family:Georgia,"Times New Roman",serif;font-size:13.5px;line-height:1.6;margin:0 0 4px}
.lp-sheet .te{font-size:12.5px;line-height:1.6;padding:3px 0}
`;
export function printKET(n, part = 'rw') {
  openPrint({
    name: `KET 第 ${n} 套`, label: '英语 · KET', file: `ket-${n}`, unit: '题', remember: 'ket.print',
    title: (o) => `KET 仿真模拟 第 ${n} 套 · ${PART_NAME[o.part]}`,
    info: ['姓名', '日期', '用时', '得分'],
    opts: { part, ans: false, exp: true, script: false },
    controls: [
      { type: 'seg', key: 'part', label: '部分', options: [['rw', '阅读写作'], ['l', '听力']] },
      { type: 'toggle', key: 'ans', label: '附答案' },
      { type: 'toggle', key: 'exp', label: '附讲解', show: (o) => o.ans },
      { type: 'toggle', key: 'script', label: '附录音原文', show: (o) => o.part === 'l' },
    ],
    async build(o) {
      const d = await loadKET(`ket-mock-${n}-${o.part}`);
      const names = [];
      for (const g of d.sections?.[0]?.groups || []) names.push(...(g.pics || []));
      for (const p of d.problems) if (p.extra?.pics) names.push(...Object.values(p.extra.pics));
      await inlineSvgs(names);
      return { blocks: ketBlocks(d, o.part, o), count: d.problems.length };
    },
    css: KET_CSS,
    qr: () => '/english/#/ket', qrText: (o) => (o.part === 'l' ? '扫码在线听录音、交卷判分' : '扫码在线做题、交卷判分'),
  });
}
