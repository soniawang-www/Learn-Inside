// 英语错题本（#/mistakes）：KET、PET、小托福仿真卷里做错的题，按「一篇文章 / 一段录音」成组显示。
// 英语题很多要看上下文（阅读原文、录音、完形的前后句、配图），所以每组都带着原材料，用的是复盘页同一套显示；
// 订正也按组重做（整篇 / 整段），交卷后状态跟着变：待订正 → 已订正 →（7 天后）该复习了 → 再对一次就算已掌握。
import { tjGroupRev, tjBlocks, TJ_CSS } from './tj.js?v=20261128m';
import { ketGroupRev, examBlocks as ketBlocks, KET_CSS, inlineSvgs } from './ket.js?v=20261128m';
import { openPrint, PRINT_ICON } from '/assets/print/kit.js?v=20261126d';
import { bindPlayers } from './player.js?v=20261114a';
import { mascot } from '/assets/pal.js?v=20261128m';
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

// 按组归拢：同一套卷子的同一个部分（一篇文章 / 一段录音）放一起；错题页和打印共用
async function buildCards(list) {
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
  return [...cards.values()].sort((a, b) => b.last - a.last || String(a.exam.id).localeCompare(String(b.exam.id)) || +a.g.from - +b.g.from);
}
const setNo = (c) => String(c.exam.id).match(/mock-(\d+)-/)?.[1];
const partOf = (c) => (c.fam === 'tj' ? String(c.exam.id).slice(-1) : String(c.exam.id).replace(/^.*-mock-\d+-/, ''));
const inGroup = (c) => c.exam.problems.filter((p) => (p.extra?.group ? p.extra.group === c.g.id : +c.g.from <= p.number && p.number <= +c.g.to));
const cardHead = (c) => {
  const from = +c.g.from, to = +c.g.to, part = partOf(c);
  const where = c.g.name ? c.g.name : c.fam === 'tj' ? ({ l: '听力', f: '语言形式与含义', r: '阅读' }[part] || '') : '';
  return `${FAM_NAME[c.fam]} 第 ${setNo(c)} 套 · ${where}${c.fam === 'tj' ? ` · ${c.g.title || (from === to ? `第 ${from} 题` : `第 ${from}–${to} 题`)}` : ''}`;
};

let view = { fam: 'all', todo: true };
export async function renderMistakes() {
  const list = await englishMistakes();
  if (!list.length) {
    return X.page(`<div class="hero"><h1>错题本</h1></div><div class="card pal-empty">${mascot('happy')}<p class="muted">还没有错题</p><a class="btn primary" href="#/ket">去做一套</a></div>`, 'mistakes');
  }
  const all = await buildCards(list);
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
    const head = cardHead(c);
    const todo = c.ms.filter(todoOf);
    const others = items.length - nums.size;
    return `<section class="mk-card" data-ci="${ci}">
      <div class="mk-h"><div><b>${X.esc(head)}</b><span class="small muted">错 ${c.ms.length} 题${todo.length ? `，${todo.length} 题待订正` : ''}</span></div>
        <button class="btn ${todo.length ? 'primary' : ''} sm" data-redo="${ci}">${todo.length ? '重做这一部分' : '再做一遍'}</button></div>
      <div class="mk-body only">${html}</div>
      ${others ? `<button class="mk-more" data-more="${ci}">看同组其他 ${others} 题</button>` : ''}
    </section>`;
  };

  X.page(`<div class="hero hero-row"><h1>错题本</h1><button class="btn lp-entry" id="mk-print">${PRINT_ICON}打印</button></div>
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
  X.$app.querySelector('#mk-print').onclick = () => openEnMistakesPrint({
    list, force: { fam: view.fam, scope: view.todo ? 'todo' : 'all' },
    link: async (o) => {
      const ids = (await buildCards(list)).filter((c) => (o.fam === 'all' || c.fam === o.fam)).flatMap((c) => c.ms).filter((m) => o.scope === 'all' || todoOf(m)).map((m) => m.problem_id);
      const r = await X.api(`/api/students/${X.enc(X.auth.student.id)}/mistakes/print-link`, { method: 'POST', body: { problem_ids: ids, with_ans: !!o.ans, opts: o } });
      return `${location.origin}/english/print.html#mk=${r.token}`;
    },
  });
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

// ───────── 打印错题 ─────────
// 一组一块：先印原材料（文章、短文、配图、听力题），错的题号圈出来；可附答案、错题讲解、录音原文
const escH = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scope = (css, cls) => css.replace(/\.lp-sheet /g, `.lp-sheet .${cls} `);
const MK_CSS = `${scope(TJ_CSS, 'ft')}${scope(KET_CSS, 'fk')}
.lp-sheet .mh{font-size:15px;font-weight:700;color:#1D5C4D;border-bottom:2px solid #1D5C4D;padding:6px 0 4px;margin:14px 0 6px}
.lp-sheet .mw{display:inline-grid;place-items:center;min-width:1.7em;height:1.7em;border:1.5px solid #B04A6F;border-radius:999px;color:#B04A6F;padding:0 2px}
.lp-sheet .bl.mw{display:inline-block;border:0;border-bottom:1px solid #333;border-radius:0;height:auto;color:#B04A6F;font-weight:700}
.lp-sheet .ah{font-size:18px;font-weight:800;margin:6px 0 4px;border-bottom:2px solid #1D5C4D;padding-bottom:6px}
.lp-sheet .ma{font-size:13px;font-weight:700;color:#1D5C4D;margin:10px 0 2px}
.lp-sheet .mk{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;line-height:1.7}
.lp-sheet .mk .x{color:#B04A6F;font-weight:700}
.lp-sheet .mk s{color:#5D6A65;margin-left:4px}
.lp-sheet .me{font-size:12.5px;line-height:1.6;padding:2px 0 2px 1.2em;color:#33413D}
.lp-sheet .ms p{font-family:Georgia,"Times New Roman",serif;font-size:13.5px;line-height:1.6;margin:0 0 4px}
`;
const ansOf = (p) => (p.kind === 'fill' ? [p.answer, ...(p.accept || [])].join(' / ') : p.answer);
function scriptOf(c) {
  const g = c.g;
  const sc = g.script ? [g.script] : inGroup(c).map((p) => p.extra?.script).filter(Boolean);
  return sc.flat().map(([w, , x]) => `<p><b>${escH(w)}:</b> ${escH(x)}</p>`).join('');
}
function cardBlocks(c, o) {
  const qs = inGroup(c), wrong = new Set(c.ms.map((m) => m.number));
  const d = { ...c.exam, sections: [{ ...(c.exam.sections?.[0] || {}), groups: [{ ...c.g, from: +c.g.from, to: +c.g.to }] }], problems: qs };
  const part = partOf(c);
  const raw = c.fam === 'tj' ? tjBlocks(d, part, { ans: false, script: false }) : ketBlocks(KET_F[c.fam], d, part, { ans: false, script: false });
  const cls = c.fam === 'tj' ? 'ft' : 'fk';
  const mark = (h) => h.replace(/<b>(\d+)\.<\/b>/g, (m, n) => (wrong.has(+n) ? `<b class="mw">${n}</b>` : m))
    .replace(/<b>(\d+)\. /g, (m, n) => (wrong.has(+n) ? `<b class="mw">${n}</b> <b>` : m))
    .replace(/<span class="bl">\((\d+)\)<\/span>/g, (m, n) => (wrong.has(+n) ? `<span class="bl mw">(${n})</span>` : m));
  const out = [{ html: `<div class="mh">${escH(cardHead(c))}</div>`, keep: true }];
  raw.forEach((b) => { const h = typeof b === 'string' ? b : b.html; out.push(`<div class="${cls}">${mark(h)}</div>`); });
  if (o.script && (part === 'l')) { const s = scriptOf(c); if (s) out.push(`<div class="${cls}"><div class="tg-h">录音原文</div><div class="ms">${s}</div></div>`); }
  return out;
}
function ansBlocks(cards, o) {
  const out = [{ html: '<div class="ah">答案</div>', page: true, keep: true }];
  for (const c of cards) {
    const byNum = new Map(c.ms.map((m) => [m.number, m]));
    const qs = inGroup(c);
    out.push(`<div class="ma">${escH(cardHead(c))}</div><div class="mk">${qs.map((p) => { const m = byNum.get(p.number); return `<span${m ? ' class="x"' : ''}>${p.number}. ${escH(ansOf(p))}${m && m.last_choice ? `<s>${escH(m.last_choice)}</s>` : ''}</span>`; }).join('')}</div>`);
    if (o.exp) qs.filter((p) => byNum.has(p.number) && p.basic).forEach((p) => out.push(`<div class="me"><b>${p.number}.</b> ${escH(p.basic)}</div>`));
  }
  return out;
}
/** 打印英语错题。list：错题本条目；force：入口带来的选项（家里看的范围、发到手机的链接） */
export function openEnMistakesPrint({ list, force, link, standalone, home }) {
  let cardsP = null;
  const getCards = () => (cardsP ||= buildCards(list));
  const fams = ['ket', 'pet', 'tj'].filter((f) => list.some((m) => famOf(m.exam_id) === f));
  return openPrint({
    name: '错题本', label: '英语', unit: '题', file: 'mistakes', title: '英语错题本', info: ['姓名', '日期', '得分'],
    remember: 'en.print.ms', force: force || null,
    opts: { scope: 'todo', fam: 'all', ans: true, exp: true, script: true },
    controls: [
      { type: 'seg', key: 'scope', label: '范围', options: [['todo', '待订正'], ['all', '全部错题']] },
      ...(fams.length > 1 ? [{ type: 'seg', key: 'fam', label: '考试', options: [['all', '全部'], ...fams.map((f) => [f, FAM_NAME[f]])] }] : []),
      { type: 'toggle', key: 'ans', label: '附答案' },
      { type: 'toggle', key: 'exp', label: '附讲解', show: (o) => o.ans },
      { type: 'toggle', key: 'script', label: '附录音原文' },
    ],
    async build(o) {
      const cards = (await getCards())
        .filter((c) => o.fam === 'all' || !fams.includes(o.fam) || c.fam === o.fam)
        .map((c) => ({ ...c, ms: c.ms.filter((m) => o.scope === 'all' || todoOf(m)) })).filter((c) => c.ms.length);
      const names = [];
      for (const c of cards) if (c.fam !== 'tj') { names.push(...(c.g.pics || [])); for (const p of inGroup(c)) if (p.extra?.pics) names.push(...Object.values(p.extra.pics)); }
      await inlineSvgs(names);
      const blocks = cards.flatMap((c) => cardBlocks(c, o));
      if (o.ans && cards.length) blocks.push(...ansBlocks(cards, o));
      return { blocks, count: cards.reduce((n, c) => n + c.ms.length, 0) };
    },
    css: MK_CSS, link, standalone, home,
    qr: '/english/#/mistakes', qrText: '扫码在线订正',
  });
}
