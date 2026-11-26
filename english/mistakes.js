// 英语错题本（#/mistakes）：KET、PET、小托福仿真卷里做错的题，按「一篇文章 / 一段录音」成组显示。
// 英语题很多要看上下文（阅读原文、录音、完形的前后句、配图），所以每组都带着原材料，用的是复盘页同一套显示；
// 订正也按组重做（整篇 / 整段），交卷后状态跟着变：待订正 → 已订正 →（7 天后）该复习了 → 再对一次就算已掌握。
import { tjGroupRev } from './tj.js?v=20261126d';
import { ketGroupRev } from './ket.js?v=20261126d';
import { bindPlayers } from './player.js?v=20261114a';
import { mascot } from '/assets/pal.js?v=20261122y';
let X;
export const initMistakes = (ctx) => { X = ctx; };

const STATUS = { pending: '待订正', due: '该复习了', fixed: '已订正', mastered: '已掌握' };
const todoOf = (m) => m.status === 'pending' || m.status === 'due';
const famOf = (examId) => (String(examId).startsWith('ket-') ? 'ket' : String(examId).startsWith('pet-') ? 'pet' : 'tj');
const FAM_NAME = { ket: 'KET', pet: 'PET', tj: '小托福' };
const AUDIO = { ket: '/english/audio/ket/', pet: '/english/audio/pet/', tj: '/english/audio/toefljr/' };
const KET_F = { ket: { id: 'ket', name: 'KET', crit: [] }, pet: { id: 'pet', name: 'PET', crit: [] } };

const examCache = new Map();
const loadExam = async (id) => examCache.get(id) || examCache.set(id, await (await fetch(`/api/toefljr/${encodeURIComponent(id)}`)).json()).get(id);

export async function englishMistakes() {
  const r = await X.api(`/api/students/${X.enc(X.auth.student.id)}/mistakes?subject=english`);
  return r.mistakes || [];
}

let view = { fam: 'all', todo: true };
export async function renderMistakes() {
  const list = await englishMistakes();
  if (!list.length) {
    return X.page(`<div class="hero"><h1>错题本</h1></div><div class="card pal-empty">${mascot('happy')}<p class="muted">还没有错题</p><a class="btn primary" href="#/ket">去做一套</a></div>`, 'mistakes');
  }
  // 按组归拢：同一套卷子的同一个部分（一篇文章 / 一段录音）放一起
  const exams = [...new Set(list.map((m) => m.exam_id))];
  const data = new Map(await Promise.all(exams.map(async (id) => [id, await loadExam(id).catch(() => null)])));
  const cards = new Map();
  for (const m of list) {
    const d = data.get(m.exam_id); if (!d?.sections) continue;
    const p = d.problems.find((x) => x.number === m.number); if (!p) continue;
    const g = (d.sections[0]?.groups || []).find((x) => (p.extra?.group ? x.id === p.extra.group : +x.from <= m.number && m.number <= +x.to));
    if (!g) continue;
    const key = `${m.exam_id}|${g.id}`;
    const c = cards.get(key) || { key, exam: d, g, fam: famOf(m.exam_id), ms: [], last: 0 };
    c.ms.push(m); c.last = Math.max(c.last, m.last_wrong_at || 0);
    cards.set(key, c);
  }
  const all = [...cards.values()].sort((a, b) => b.last - a.last || String(a.exam.id).localeCompare(String(b.exam.id)) || +a.g.from - +b.g.from);
  const fams = ['ket', 'pet', 'tj'].filter((f) => all.some((c) => c.fam === f));
  if (view.fam !== 'all' && !fams.includes(view.fam)) view.fam = 'all';
  const inFam = (c) => view.fam === 'all' || c.fam === view.fam;
  const shown = all.filter((c) => inFam(c) && (!view.todo || c.ms.some(todoOf)));
  const nAll = all.filter(inFam).reduce((s, c) => s + c.ms.length, 0);
  const nTodo = all.filter(inFam).reduce((s, c) => s + c.ms.filter(todoOf).length, 0);

  const cardHTML = (c, ci) => {
    const nums = new Set(c.ms.map((m) => m.number));
    const byNum = new Map(c.ms.map((m) => [m.number, m]));
    const from = +c.g.from, to = +c.g.to;
    // 这一组的全部题：错过的显示上次的选择，其他题当作做对了（默认收起，要看上下文时可以展开）
    const items = c.exam.problems.filter((p) => (p.extra?.group ? p.extra.group === c.g.id : from <= p.number && p.number <= to)).map((p) => {
      const m = byNum.get(p.number);
      return { ...p, problem_id: m?.problem_id, choice: m ? m.last_choice : p.answer, correct: !m };
    });
    const g = { ...c.g, from, to };
    const part = c.fam === 'tj' ? String(c.exam.id).slice(-1) : null;
    let html = c.fam === 'tj' ? tjGroupRev(part, items)(g) : ketGroupRev(KET_F[c.fam], items)(g);
    html = html.replace(/id="q(\d+)"/g, `id="m${ci}q$1"`).replace(/href="#q(\d+)"/g, `href="#m${ci}q$1"`); // 同一页里有很多组，题号会重
    const setN = String(c.exam.id).match(/mock-(\d+)-/)?.[1];
    const where = c.g.name ? c.g.name : c.fam === 'tj' ? ({ l: '听力', f: '语言形式与含义', r: '阅读' }[part] || '') : '';
    const range = from === to ? `第 ${from} 题` : `第 ${from}–${to} 题`;
    const head = `${FAM_NAME[c.fam]} 第 ${setN} 套 · ${where}${c.fam === 'tj' ? ` · ${c.g.title || range}` : ''}`;
    const todo = c.ms.filter(todoOf);
    const others = items.length - nums.size;
    return `<section class="mk-card" data-ci="${ci}">
      <div class="mk-h"><div><b>${X.esc(head)}</b><span class="small muted">错 ${c.ms.length} 题${todo.length ? `，${todo.length} 题待订正` : ''}</span></div>
        <button class="btn ${todo.length ? 'primary' : ''} sm" data-redo="${ci}">${todo.length ? '重做这一部分' : '再做一遍'}</button></div>
      <div class="mk-body only">${html}</div>
      ${others ? `<button class="mk-more" data-more="${ci}">看同组其他 ${others} 题</button>` : ''}
    </section>`;
  };

  X.page(`<div class="hero"><h1>错题本</h1></div>
    <div class="card mk-top"><p class="muted">共 ${nAll} 题，待订正 ${nTodo} 题</p>
      <div class="mk-filter">${fams.length > 1 ? `<div class="seg" role="tablist">${[['all', '全部'], ...fams.map((f) => [f, FAM_NAME[f]])].map(([k, n]) => `<button role="tab" data-fam="${k}" aria-selected="${view.fam === k}">${n}</button>`).join('')}</div>` : ''}
        <label class="small"><input type="checkbox" id="mk-todo" ${view.todo ? 'checked' : ''}> 只看待订正</label></div></div>
    ${shown.length ? shown.map((c) => cardHTML(c, all.indexOf(c))).join('') : `<div class="card pal-empty">${mascot('happy')}<p class="muted">都订正过了</p></div>`}`, 'mistakes');

  // 每道错题标上状态
  const stops = [];
  X.$app.querySelectorAll('.mk-card').forEach((el) => {
    const c = all[+el.dataset.ci];
    for (const m of c.ms) {
      const q = el.querySelector(`#m${el.dataset.ci}q${m.number}`); if (!q) continue;
      q.classList.add('mk-q');
      q.querySelector('.tj-qh')?.insertAdjacentHTML('beforeend', `<span class="mk-st"><span class="tag ${todoOf(m) ? 'bad' : 'ok'}">${STATUS[m.status]}</span><small class="muted">错 ${m.wrong_n} 次</small></span>`);
    }
    stops.push(bindPlayers(el, AUDIO[c.fam]));
  });
  X.setCleanup(() => stops.forEach((f) => f?.()));
  X.$app.querySelectorAll('.mk-body a[href^="#m"]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = X.$app.querySelector(a.getAttribute('href')); if (t) { t.closest('.mk-body')?.classList.remove('only'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }));
  X.$app.querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { b.closest('.mk-card').querySelector('.mk-body').classList.remove('only'); b.remove(); }));
  X.$app.querySelectorAll('[data-fam]').forEach((b) => (b.onclick = () => { view.fam = b.dataset.fam; renderMistakes(); }));
  const cb = X.$app.querySelector('#mk-todo'); if (cb) cb.onchange = () => { view.todo = cb.checked; renderMistakes(); };
  X.$app.querySelectorAll('[data-redo]').forEach((b) => (b.onclick = async () => {
    const c = all[+b.dataset.redo]; b.disabled = true;
    try { location.hash = await redoPart(c.exam.id, c.g.id, c.ms.some((m) => m.status === 'due') ? 'due' : 'pending'); }
    catch (x) { b.disabled = false; X.modal(`<p>${X.esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  }));
}

/** 开一份只有这几个部分的练习卷（不限时），返回做题页地址 */
export async function redoPart(examId, part, purpose = 'pending') {
  const s = await X.api('/api/sessions', { method: 'POST', body: { exam_id: examId, part, student_id: X.auth.student.id, purpose } });
  return `#/${famOf(examId)}/exam/${s.session.id}`;
}
