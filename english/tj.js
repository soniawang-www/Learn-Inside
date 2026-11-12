// 小托福（TOEFL Junior 标准考试）仿真模拟：原创题，每套拆成听力 / 语言形式与含义 / 阅读三份卷
// 路由：#/tj（套题列表）  #/tj/exam/:会话 id（做题）  #/tj/review/:会话 id（复盘）
// 题目材料在 exam.sections[0].groups：听力组有 audio、script，语言题和阅读组有 title、text（[[n]] 是空）
import { openPrint, PRINT_ICON } from '/assets/print/kit.js?v=20261111u';
let X; // app.js 传进来的工具：api、page、esc、enc、modal、store、auth、BACK_IC、$app、setCleanup
export const initTJ = (ctx) => { X = ctx; };

const AUDIO = '/english/audio/toefljr/';
const PART = { l: '听力', f: '语言形式与含义', r: '阅读' };
const partOf = (examId) => String(examId).slice(-1);
const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const paras = (t) => X.esc(t).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

// ───────── 套题列表 ─────────
// 一套一行：三个部分是三个小按钮（没做过点了直接开始；做过显示分数，点了看复盘），右边是打印
async function start(examId) {
  const r = await X.api('/api/sessions', { method: 'POST', body: { exam_id: examId, student_id: X.auth.student.id, mode: 'exam' } });
  location.hash = `#/tj/exam/${r.session.id}`;
}
export async function renderTJ() {
  const exams = await X.api(`/api/exams?student=${X.enc(X.auth.student.id)}&family=toefljr`);
  const sets = new Map();
  for (const e of exams) { const m = e.id.match(/^toefljr-mock-(\d+)-([lfr])$/); if (!m) continue; (sets.get(m[1]) || sets.set(m[1], {}).get(m[1]))[m[2]] = e; }
  const nums = [...sets.keys()].sort((a, b) => a - b);
  const SHORT = { l: '听力', f: '语言', r: '阅读' };
  X.page(`<a class="back" href="#/">${X.BACK_IC}英语首页</a>
    <div class="hero"><h1>小托福</h1></div>
    ${nums.length ? `<section class="card tj-list">${nums.map((n) => `<div class="tj-row"><b>第 ${n} 套</b>
      <div class="tj-chips">${['l', 'f', 'r'].map((k) => { const e = sets.get(n)[k]; if (!e) return '<span></span>';
        return e.last_session ? `<a class="tj-chip done" href="#/tj/review/${e.last_session}">${SHORT[k]}<em>${e.last_score}/${e.problem_count}</em></a>`
          : `<button class="tj-chip" data-start="${e.id}">${SHORT[k]}</button>`; }).join('')}</div>
      <button class="tj-pr" data-print="${n}" aria-label="打印第 ${n} 套">${PRINT_ICON}</button></div>`).join('')}</section>`
      : '<div class="card"><p class="muted">录入中</p></div>'}`, 'tj');
  X.$app.querySelectorAll('[data-start]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await start(b.dataset.start); } catch (e) { b.disabled = false; X.modal(`<p>${X.esc(e.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  }));
  X.$app.querySelectorAll('[data-print]').forEach((b) => (b.onclick = () => printTJ(b.dataset.print)));
}

// ───────── 打印 ─────────
// 一套里选一个部分印成纸面卷；可以附答案和讲解、听力原文（录音扫码在网站上听）
const tjCache = new Map();
const loadTJ = async (id) => tjCache.get(id) || tjCache.set(id, await (await fetch(`/api/toefljr/${id}`)).json()).get(id);
const pe = (s) => X.esc(s).split(/\n\s*\n/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
const optsHtml = (p) => `<div class="tq-o">${Object.entries(p.choices).map(([k, v]) => `<span>(${k}) ${X.esc(v)}</span>`).join('')}</div>`;
function tjBlocks(d, part, o) {
  const G = d.sections?.[0]?.groups || [], P = new Map(d.problems.map((p) => [p.number, p])), out = [];
  for (const g of G) {
    const qs = []; for (let n = g.from; n <= g.to; n++) qs.push(P.get(n));
    const h = `<div class="tg-h">${g.from === g.to ? `Question ${g.from}` : `Questions ${g.from}–${g.to}`}</div>`;
    if (part === 'l') out.push(`<div class="tg">${h}${qs.map((p) => `<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)}${optsHtml(p)}</div>`).join('')}</div>`);
    else if (part === 'f') {
      const text = pe(g.text).replace(/\[\[(\d+)\]\]/g, (_, n) => { const p = qs.find((x) => x.extra?.blank === +n); return `<span class="bl">(${p?.number})</span>`; });
      out.push(`<div class="tg">${h}<div class="tt"><h3>${X.esc(g.title || '')}</h3>${text}</div>${qs.map((p) => `<div class="tq"><b>${p.number}.</b>${optsHtml(p)}</div>`).join('')}</div>`);
    } else {
      out.push(`<div class="tg">${h}<div class="tt"><h3>${X.esc(g.title || '')}</h3>${pe(g.text)}</div></div>`);
      qs.forEach((p) => out.push(`<div class="tq"><b>${p.number}.</b> ${X.esc(p.stem)}${optsHtml(p)}</div>`));
    }
  }
  if (part === 'l' && o.script) G.forEach((g, i) => out.push({ page: i === 0, html: `${i === 0 ? '<h3 class="tk-h">录音原文</h3>' : ''}<div class="tg"><div class="tg-h">${g.from === g.to ? `Question ${g.from}` : `Questions ${g.from}–${g.to}`}</div>${g.script.map(([w, , t]) => `<p class="ts"><b>${X.esc(w)}:</b> ${X.esc(t)}</p>`).join('')}</div>` }));
  if (o.ans) {
    out.push({ page: true, html: `<h3 class="tk-h">答案</h3><div class="tk">${d.problems.map((p) => `<span><b>${p.number}</b> ${p.answer}</span>`).join('')}</div>` });
    if (o.exp) d.problems.forEach((p) => out.push(`<div class="te"><b>${p.number}. ${p.answer}</b>${p.extra?.type ? `<i>${X.esc(p.extra.type)}</i>` : ''} ${X.esc(p.basic || '')}</div>`));
  }
  return out;
}
const TJ_CSS = `
.lp-sheet .tg{margin:0 0 6px}
.lp-sheet .tg-h{font-size:12px;color:#5D6A65;margin:10px 0 4px;font-weight:600}
.lp-sheet .tt{font-family:Georgia,"Times New Roman",serif;font-size:14.5px;line-height:1.7;border:1px solid #DCD7CA;border-radius:6px;padding:8px 12px;margin-bottom:8px}
.lp-sheet .tt h3{font-size:15px;margin:0 0 4px}
.lp-sheet .tt p{margin:0 0 6px}
.lp-sheet .bl{display:inline-block;min-width:4.5em;border-bottom:1px solid #333;text-align:left;font-size:12px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.lp-sheet .tq{font-family:Georgia,"Times New Roman",serif;font-size:14px;line-height:1.5;padding:5px 0}
.lp-sheet .tq-o{display:grid;grid-template-columns:1fr 1fr;gap:1px 18px;padding-left:1.4em;margin-top:2px}
.lp-sheet .tk-h{font-size:15px;margin:4px 0 8px}
.lp-sheet .tk{display:grid;grid-template-columns:repeat(7,1fr);gap:4px 10px;font-size:13px}
.lp-sheet .ts{font-family:Georgia,"Times New Roman",serif;font-size:13.5px;line-height:1.6;margin:0 0 4px}
.lp-sheet .te{font-size:12.5px;line-height:1.6;padding:3px 0}
.lp-sheet .te i{font-style:normal;color:#5D6A65;margin:0 6px;font-size:11.5px}
`;
const PART_NAME = { l: '听力', f: '语言形式与含义', r: '阅读' };
export function printTJ(n, part = 'r') {
  openPrint({
    name: `小托福 第 ${n} 套`, label: '英语 · 小托福', file: `toefljr-${n}`, unit: '题', remember: 'tj.print',
    title: (o) => `仿真模拟 第 ${n} 套 · ${PART_NAME[o.part]}`,
    info: ['姓名', '日期', '用时', '得分'],
    opts: { part, ans: false, exp: true, script: false },
    controls: [
      { type: 'seg', key: 'part', label: '部分', options: [['l', '听力'], ['f', '语言'], ['r', '阅读']] },
      { type: 'toggle', key: 'ans', label: '附答案' },
      { type: 'toggle', key: 'exp', label: '附讲解', show: (o) => o.ans },
      { type: 'toggle', key: 'script', label: '附录音原文', show: (o) => o.part === 'l' },
    ],
    async build(o) { const d = await loadTJ(`toefljr-mock-${n}-${o.part}`); return { blocks: tjBlocks(d, o.part, o), count: d.problems.length }; },
    css: TJ_CSS,
    qr: () => '/english/#/tj', qrText: (o) => (o.part === 'l' ? '扫码在线听录音、交卷判分' : '扫码在线做题、交卷判分'),
  });
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
    <div class="actions tj-acts"><button class="btn primary" id="again">再做一次</button><button class="btn" id="prt">${PRINT_ICON}打印</button></div>
    <div class="tj-sheet">${r.items.map((it) => `<a href="#q${it.number}" class="${it.correct ? 'ok' : it.choice ? 'bad' : 'skip'}">${it.number}</a>`).join('')}</div>
    ${G.map(groupRev).join('')}`, 'tj');
  const setN = r.exam.id.match(/mock-(\d+)-/)?.[1];
  X.$app.querySelector('#again').onclick = (e) => { e.currentTarget.disabled = true; start(r.exam.id).catch((x) => X.modal(`<p>${X.esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`)); };
  X.$app.querySelector('#prt').onclick = () => printTJ(setN, part);
  X.$app.querySelectorAll('.tj-sheet a, a.tj-blank').forEach((a) => (a.onclick = (e) => { e.preventDefault(); X.$app.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  X.$app.querySelectorAll('[data-audio]').forEach((b) => (b.onclick = () => {
    if (audio && !audio.paused && audio.dataset === b.dataset.audio) { audio.pause(); return; }
    audio?.pause(); audio = new Audio(AUDIO + b.dataset.audio); audio.play();
  }));
}
