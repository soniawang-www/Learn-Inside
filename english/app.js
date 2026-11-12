// 英语 · ESDP 备赛练习（learn-inside.com/english/）· 前端（原生 JS，无构建步骤）
// 两条线：模拟比赛（按赛制限时）和按话题学（提示 → 提纲 → 参考句子 → 背诵）。
// 路由：#/（英语首页）  #/esdp（ESDP：组别、模拟比赛、按话题学、赛制）  #/bank/:id?s=轮次（话题列表）
//       #/learn/:题目 id（学一个话题）  #/interview（模拟复赛：连问几题）  #/speech/:题目 id（模拟半决赛：准备 → 限时演讲）
//       （决赛定题的题目进 #/speech 时走模拟决赛：准备 5 分钟 → 演讲 2 分钟 → 评委 2 问）
//       #/write/:题目 id（模拟写作）  #/draw/:题库?s=轮次（抽一题）  #/phrases（句型和名言）  #/join（登录 / 注册，在全站账号页）
// 账号全站通用：和数学、语文共用 li.token / li.student。接口在 /api/english/（worker/english.js）。

import { sideNav } from '/assets/sidenav.js?v=20261107e';
import { loadStart } from '/assets/loadcomic.js?v=20261109';
import { PHRASES, QUOTES } from './phrases.js?v=20261110';
import { PRINT_ICON, pickRandom } from '/assets/print/kit.js?v=20261111u';
import { openEnglishPrint, openPhrasesPrint, packOpts } from './print-tpl.js?v=20261111w';
import { initTJ, renderTJ, renderTJExam, renderTJReview } from './tj.js?v=20261112d';
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');

// ───────── 存储 / 账号 ─────────
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const auth = {
  get token() { return store.get('li.token'); },
  get student() { return store.get('li.student'); },
  save(token, student) { store.set('li.token', token); store.set('li.student', student); },
  clear() { store.del('li.token'); store.del('li.student'); },
};
let me = null; // /api/me
const isGuest = () => !!me?.guest;

// ───────── API ─────────
let busy = 0;
async function api(path, { method = 'GET', body } = {}) {
  busy++; document.body.classList.add('net-wait');
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('网络不太好，请稍后再试');
  } finally { if (!--busy) document.body.classList.remove('net-wait'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { auth.clear(); me = null; location.hash = store.get('li.hadAccount') ? '#/join' : '#/'; }
  if (res.status === 402) return { ...data, status: 402 };
  if (!res.ok) { const e = new Error(data.error || `请求失败 (${res.status})`); e.status = res.status; throw e; }
  return data;
}

// ───────── 小工具 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const txt = (s) => esc(s).replace(/\n/g, '<br>');
const enc = encodeURIComponent;
const ms = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
const day = (t) => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const countWords = (s) => (String(s).match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).length;
const IN_WX = /MicroMessenger/i.test(navigator.userAgent);
function modal(html, bind) {
  $modal.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { $modal.innerHTML = ''; };
  $modal.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  $modal.querySelector('.modal-back').onclick = (e) => { if (e.target.classList.contains('modal-back')) close(); };
  bind?.($modal, close);
  return close;
}

// ───────── ESDP 基本设定 ─────────
const GROUPS = [
  { id: 'low', name: '小低组', grades: '1–3 年级', limit: 90, words: 100 },
  { id: 'high', name: '小高组', grades: '4–5 年级', limit: 120, words: 150 },
];
const ROUNDS = { 1: '复赛问答', 2: '即兴演讲', 3: '决赛定题' };
const grpOf = (bankOrItemId) => (String(bankOrItemId).includes('-high') ? GROUPS[1] : GROUPS[0]);
const isWrite = (id) => String(id).startsWith('esdp-write-');
const curGroup = () => GROUPS.find((g) => g.id === store.get('en.grp')) || GROUPS[0];
const TAG = { open: '开头', body: '展开', example: '举例', close: '结尾' };
const isReal = (x) => (x.tags || []).some((t) => t.id === 'real');
const realTag = (x, full = true) => (x.tags || []).filter((t) => t.id === 'real').map((t) => `<span class="tag real">真题${full ? ` · ${esc(t.name)}` : ''}</span>`).join('');

function topnav(active = '') {
  const who = me ? { name: me.guest ? '游客 · 注册' : auth.student?.nickname || '账号', note: me.guest ? '注册送 10 次' : '' } : null;
  return sideNav({ section: 'english', sub: [['#/tj', '小托福', 'exam', active === 'tj'], ['#/phrases', '句型积累', 'exam', active === 'phrases']], who });
}
let supportCache = null;
async function showSupport() {
  try { supportCache ||= await (await fetch('/api/support')).json(); } catch { supportCache = {}; }
  const s = supportCache;
  const link = /^https:\/\//.test(s.url || '') ? s.url : '';
  modal(`<h2>联系客服</h2>${link && IN_WX ? `<p><a class="btn primary block" href="${esc(link)}">打开微信客服</a></p>` : ''}
    ${s.qr && !(link && IN_WX) ? `<p class="center"><img src="${esc(s.qr)}" alt="微信客服二维码" style="width:220px;max-width:100%;border-radius:12px;background:#fff;padding:8px"></p><p class="center small muted">微信扫一扫，直接和客服聊</p>` : ''}
    ${s.text ? `<p class="muted">${esc(s.text)}</p>` : s.qr || link ? '' : '<p class="muted">客服联系方式还没有设置。</p>'}
    <div class="actions" style="justify-content:center"><button class="btn" data-close>关闭</button></div>`);
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-support]')) { e.preventDefault(); showSupport(); } });
let cleanup = null; // 离开页面时停掉计时器、麦克风
// 返回：统一成带左箭头的小按钮（.back）
const BACK_IC = '<svg class="bk-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const page = (html, active) => {
  cleanup?.(); cleanup = null;
  document.body.className = '';
  $app.innerHTML = `${topnav(active)}<main class="page wide">${html}</main>`;
  window.scrollTo(0, 0);
};
const errorPage = (msg) => page(`<div class="card"><p class="err">${esc(msg)}</p><a class="btn" href="#/">回首页</a></div>`);

// 静默建游客：同时触发几次也只建一个
let guestP = null;
function autoGuest() {
  return (guestP ||= api('/api/auth/guest', { method: 'POST', body: {} }).then((r) => { auth.save(r.token, r.student); }).finally(() => { guestP = null; }));
}

// ───────── 路由 ─────────
async function router() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const q = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const loaded = loadStart();
  try {
    if (parts[0] === 'join' || (!auth.token && store.get('li.hadAccount'))) { // 登录 / 注册统一在全站账号页，登录后回到这里
      store.set('li.back', location.pathname + (parts[0] === 'join' ? '#/' : location.hash));
      location.replace('/account/'); return;
    }
    if (!auth.token) await autoGuest(); // 第一次来：直接建游客用起来，不先要求注册
    if (!me) me = await api('/api/me');
    if (!parts.length) return await renderHome();
    if (parts[0] === 'tj') { // 小托福
      if (parts[1] === 'exam') return await renderTJExam(parts[2]);
      if (parts[1] === 'review') return await renderTJReview(parts[2]);
      return await renderTJ();
    }
    if (parts[0] === 'esdp') return await renderEsdp();
    if (parts[0] === 'bank') return await renderBank(parts[1], q);
    if (parts[0] === 'learn') return await renderLearn(parts[1]);
    if (parts[0] === 'interview') return await renderInterview();
    if (parts[0] === 'speech') return await renderSpeech(parts[1]);
    if (parts[0] === 'write') return await renderWrite(parts[1]);
    if (parts[0] === 'draw') return await drawOne(parts[1], q.get('s'));
    if (parts[0] === 'phrases') return renderPhrases();
    if (parts[0] === 'print') return location.replace('#/esdp'); // 旧的打印设置页：打印改在各页直接出预览
    location.hash = '#/';
  } catch (e) { errorPage(e.message); } finally { loaded(); }
}
// 匿名计数：每台设备每天每种事件只报一次，只记次数，不记是谁
function ev(e) {
  const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), k = 'li.ev.' + e;
  if (store.get(k) === d) return; store.set(k, d);
  fetch('/api/ev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e }), keepalive: true }).catch(() => {});
}
ev('view_english');
initTJ({ api, page: (...a) => page(...a), esc, enc, modal, store, auth, BACK_IC, $app, setCleanup: (f) => { cleanup = f; } });
window.addEventListener('hashchange', router);

// 题库缓存（一个题库一百来题，同一次打开里反复抽题不用重新拉）
const bankCache = new Map();
async function loadBank(id, fresh = false) {
  if (!fresh && bankCache.has(id)) return bankCache.get(id);
  const d = await api(`/api/english/banks/${enc(id)}?student=${enc(auth.student.id)}`);
  bankCache.set(id, d);
  return d;
}

// ───────── 英语首页 ─────────
async function renderHome() {
  const d = await api(`/api/english/banks?student=${enc(auth.student.id)}`);
  const n = d.banks.reduce((a, b) => a + (b.problem_count || 0), 0);
  const done = d.banks.reduce((a, b) => a + b.practiced, 0);
  page(`<div class="hero"><h1>英语竞赛</h1></div>
    <div class="fam-cards">
      <a class="fam-card" href="#/tj"><b>小托福</b><span>仿真模拟 10 套 · 听力 语言 阅读</span><small></small><i>›</i></a>
      <a class="fam-card" href="#/esdp"><b>ESDP</b><span>${n ? `口语 · 写作 ${n} 题` : '录入中'}</span><small>${done ? `已练 ${done} 题` : ''}</small><i>›</i></a>
    </div>
    ${recentCard(d.recent)}`, 'home');
}
const recentCard = (recent) => (recent?.length ? `<section class="card"><div class="card-h"><h2>最近练习</h2></div>
  <div class="recent">${recent.map((r) => `<a class="rc-row" href="#/learn/${enc(r.problem_id)}">
    <span class="rc-k">${r.kind === 'write' ? '写作' : '口语'}</span><span class="rc-t">${esc(r.stem)}</span>
    <small>${r.kind === 'write' ? `${r.words ?? 0} 词` : ms(r.seconds || 0)} · ${day(r.created_at)}</small></a>`).join('')}</div></section>` : '');

// ───────── ESDP 页：练习（按赛制模拟）+ 学习（按话题） ─────────
// 赛制（上海赛区官方通知，以当届通知为准）：
//   复选 = 面试，无准备，含评委提问不超过 2 分钟；半决选 = 5 秒读题 + 15 秒构思，即兴演讲不超过 1.5 分钟；
//   决选第 2 轮 = 定题演讲，准备 5 分钟，讲 2 分钟，再答评委 2 个问题（共 1.5 分钟）；
//   写作 = 初选 30 分钟、复选和决选 45 分钟，小低约 100 词、小高约 150 词。
const MOCK = { interviewQs: 3, interviewSec: 120, speechPrep: 15, speechSec: 90, finalPrep: 300, finalSec: 120, finalQaSec: 90 };
async function renderEsdp() {
  const g = curGroup();
  const d = await api(`/api/english/banks?student=${enc(auth.student.id)}`);
  const sid = `esdp-speak-${g.id}`, wid = `esdp-write-${g.id}`;
  const sb = d.banks.some((b) => b.id === sid) ? await loadBank(sid) : null;
  const wb = d.banks.some((b) => b.id === wid) ? await loadBank(wid) : null;
  const of = (bank, s) => (bank ? bank.items.filter((x) => !s || x.section === s) : []);
  const mock = (title, rule, href, n, pr) => `<div class="mode"><div class="mode-h"><b>${title}</b></div><p class="mode-sub">${rule}</p>
    ${n ? `<div class="actions"><a class="btn primary" href="${href}">开始</a><button class="btn lp-entry" data-mock="${pr}">${PRINT_ICON}打印</button></div>` : '<div class="mode-n">录入中</div>'}</div>`;
  const learn = (title, href, list) => `<a class="learn-row" href="${href}"><b>${title}</b>
    <span class="lr-n">${list.length ? `${list.length} 个话题` : '录入中'}</span>
    <span class="lr-bar" title="背会 ${list.filter((x) => x.learned).length} / ${list.length}"><i style="width:${list.length ? (list.filter((x) => x.learned).length / list.length) * 100 : 0}%"></i></span>
    <small>${list.filter((x) => x.learned).length ? `背会 ${list.filter((x) => x.learned).length}` : ''}</small><i class="go">›</i></a>`;
  page(`<a class="back" href="#/">${BACK_IC}英语首页</a>
    <div class="hero"><h1>ESDP 英语演讲</h1></div>
    <div class="seg" role="tablist" aria-label="组别">${GROUPS.map((x) => `<button role="tab" aria-selected="${x.id === g.id}" data-grp="${x.id}">${x.name}<small>${x.grades}</small></button>`).join('')}</div>
    <h2 class="sec-h">模拟比赛</h2>
    <div class="modes">
      ${mock('复赛', `评委连问 ${MOCK.interviewQs} 题，即问即答，共 ${ms(MOCK.interviewSec)}`, '#/interview', of(sb, 1).length, `${sid}|1|3`)}
      ${mock('半决赛', `抽题，${MOCK.speechPrep} 秒构思，即兴演讲 ${ms(MOCK.speechSec)}`, `#/draw/${sid}?s=2`, of(sb, 2).length, `${sid}|2|5`)}
      ${mock('决赛', `定题演讲：准备 ${MOCK.finalPrep / 60} 分钟，讲 ${ms(MOCK.finalSec)}，再答评委 2 问`, `#/draw/${sid}?s=3`, of(sb, 3).length, `${sid}|3|3`)}
      ${mock('写作', `抽题，30 或 45 分钟，${g.words} 词左右`, `#/draw/${wid}`, of(wb).length, `${wid}||2`)}
    </div>
    <h2 class="sec-h">按话题学</h2>
    <div class="card learn-list">
      ${learn('复赛问答', `#/bank/${sid}?s=1`, of(sb, 1))}
      ${learn('即兴演讲', `#/bank/${sid}?s=2`, of(sb, 2))}
      ${learn('决赛定题', `#/bank/${sid}?s=3`, of(sb, 3))}
      ${learn('写作', `#/bank/${wid}`, of(wb))}
      <a class="learn-row" href="#/phrases"><b>句型和名言</b><span class="lr-n">「总-分-总」句型 · 10 句百搭名言</span><span></span><small></small><i class="go">›</i></a>
    </div>
    <section class="card">
      <div class="card-h"><h2>赛制</h2></div>
      <table class="tbl rules-t"><tbody>
        <tr><th>初选</th><td>自拟题目原创演讲，不超过 1.5 分钟</td><td class="num">10–11 月</td></tr>
        <tr><th>复选</th><td>线上面试，评委就学习、生活、兴趣即时提问；没有准备时间，含提问不超过 2 分钟</td><td class="num">11 月</td></tr>
        <tr><th>半决选</th><td>屏幕出题，5 秒读题 + 15 秒构思，即兴演讲不超过 1.5 分钟</td><td class="num">12 月</td></tr>
        <tr><th>决选</th><td>第 1 轮即兴演讲；第 2 轮定题演讲，准备 5 分钟、讲 2 分钟，再答评委 2 个问题</td><td class="num">12–1 月</td></tr>
        <tr><th>写作季</th><td>当场出题，初选 30 分钟，复选和决选 45 分钟；小低约 100 词，小高约 150 词</td><td class="num">1–3 月</td></tr>
      </tbody></table>
      <div class="crit">
        <div><b>内容 60</b><span>结构清晰，表达完整，素材得当</span></div>
        <div><b>语言 20</b><span>发音、语调、停顿、流利、用词</span></div>
        <div><b>台风 20</b><span>仪态、表情、肢体、眼神交流</span></div>
      </div>
      <p class="small muted">赛制按上海赛区往届通知，评分比例为云南赛区公布；以当届比赛通知为准。</p>
    </section>`, 'home');
  $app.querySelectorAll('[data-grp]').forEach((b) => (b.onclick = () => { store.set('en.grp', b.dataset.grp); renderEsdp(); }));
  $app.querySelectorAll('[data-mock]').forEach((b) => (b.onclick = () => { // 纸上模拟：随机几题，模拟题单
    const [bid, s, n] = b.dataset.mock.split('|');
    openBankPrint(bid, (bid === sid ? sb : wb).items, +s || 0, { v: 'mock', random: +n });
  }));
}

// 抽题：优先抽没练过的，不连着抽到同一题
function pickFrom(items, n = 1) {
  let pool = items.filter((x) => !x.practiced);
  if (pool.length < n) pool = items.slice();
  const last = store.get('en.last');
  if (pool.length > n) pool = pool.filter((x) => x.id !== last);
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
async function drawOne(bankId, s) {
  const d = await loadBank(bankId);
  const [pick] = pickFrom(d.items.filter((x) => !s || String(x.section) === String(s)));
  if (!pick) return errorPage('这个题库还没有题目');
  location.replace(`#/${isWrite(bankId) ? 'write' : 'speech'}/${enc(pick.id)}?draw=1`);
}

// ───────── 话题列表（学习入口） ─────────
async function renderBank(bankId, q) {
  const d = await loadBank(bankId, true);
  const s = q.get('s') || '';
  const f = q.get('f') || '';
  const write = isWrite(bankId);
  const all = d.items.filter((x) => !s || String(x.section) === s);
  const list = all.filter((x) => (f === 'new' ? !x.learned : f === 'done' ? x.learned : f === 'real' ? isReal(x) : true));
  const nReal = all.filter(isReal).length;
  const g = grpOf(bankId);
  const title = write ? '写作' : ROUNDS[s] || '口语';
  const base = `#/bank/${bankId}${s ? `?s=${s}&` : '?'}`;
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="hero hero-row"><h1>${title}<small class="h-sub">${g.name} · ${all.length} 个话题</small></h1>${all.length ? `<button class="btn lp-entry" id="bank-print">${PRINT_ICON}打印</button>` : ''}</div>
    <div class="chips">
      <a class="chip${!f ? ' on' : ''}" href="${base}">全部</a>
      <a class="chip${f === 'new' ? ' on' : ''}" href="${base}f=new">没背会</a>
      <a class="chip${f === 'done' ? ' on' : ''}" href="${base}f=done">背会了 ${all.filter((x) => x.learned).length}</a>
      ${nReal ? `<a class="chip${f === 'real' ? ' on' : ''}" href="${base}f=real">真题 ${nReal}</a>` : ''}
    </div>
    <div class="card qlist">${list.length ? list.map((x) => `<a class="q-row" href="#/learn/${enc(x.id)}">
      <span class="q-n">${x.number}</span>
      <span class="q-t"><span lang="en">${esc(x.stem)}</span><small>${esc(x.stem_zh || '')}</small></span>
      <span class="q-m">${realTag(x, false)}${x.learned ? '<i class="tag ok">背会</i>' : ''}${x.practiced ? `<i class="tag">练 ${x.practiced}</i>` : ''}</span></a>`).join('') : '<p class="muted">暂无</p>'}</div>
    <p class="small muted center">${esc(d.bank.origin || '')}</p>`, 'home');
  $app.querySelector('#bank-print')?.addEventListener('click', () => openBankPrint(bankId, d.items, +s || 0));
}

// 打印一组题：题库页默认这一轮全部，模拟比赛卡片默认随机几题、模拟题单；范围和版式在预览的「调整」里改
function openBankPrint(bankId, items, s, { v, random } = {}) {
  const list = items.filter((x) => !s || String(x.section) === String(s));
  if (!list.length) return;
  const round = isWrite(bankId) ? '写作' : ROUNDS[s] || '口语';
  const all = { label: `${round}全部 ${list.length} 题`, ids: () => list.map((x) => x.id) };
  const rnd = (n) => ({ label: `随机 ${n} 题`, ids: () => pickRandom(list, n).map((x) => x.id) });
  openEnglishPrint({
    name: `${grpOf(bankId).name} · ${round}`, items: list, v, qr: `/english/#/bank/${bankId}${s ? `?s=${s}` : ''}`,
    presets: random ? [rnd(random), all] : [all, rnd(5)],
    fetch: async (ids) => (await api('/api/english/print', { method: 'POST', body: { student_id: auth.student.id, ids } })).items,
    link: async (o) => {
      const r = await api('/api/english/print-link', { method: 'POST', body: { student_id: auth.student.id, ids: o.ids, v: o.v } });
      return `${location.origin}/english/print.html#t=${r.token}&o=${packOpts(o)}`;
    },
  });
}

// ───────── 示范回答的几种显示：参考句子 / 背诵（挖空、首字母、只看中文） ─────────
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 句型在原文里的位置（不分大小写），按长的优先
function phraseRe(m) {
  const ps = (m.phrases || []).map((p) => p.en).filter(Boolean).sort((a, b) => b.length - a.length);
  return ps.length ? new RegExp(ps.map(reEsc).join('|'), 'gi') : null;
}
// 把原文按句型切开，句型部分用 fn 处理，其余部分用 other 处理（都先转义）
function splitBy(s, re, fn, other = esc) {
  if (!re) return other(s);
  let out = '', i = 0;
  for (const m of s.matchAll(re)) { out += other(s.slice(i, m.index)) + fn(m[0]); i = m.index + m[0].length; }
  return out + other(s.slice(i));
}
const markPhrases = (s, re) => splitBy(s, re, (w) => `<mark>${esc(w)}</mark>`);
const holes = (s, re) => splitBy(s, re, (w) => `<span class="hole" tabindex="0" role="button" data-w="${esc(w)}">${'＿'.repeat(Math.max(2, Math.ceil(w.length / 3)))}</span>`);
const firstLetters = (s) => s.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/).map((t, i) => (i % 2 ? `${esc(t[0])}<span class="blank">${'_'.repeat(Math.min(t.length - 1, 8))}</span>` : esc(t))).join('');

// ───────── 学习页：提示 → 提纲 → 参考句子 → 背诵 ─────────
async function renderLearn(id) {
  const d = await api(`/api/english/items/${enc(id)}?student=${enc(auth.student.id)}`);
  const g = grpOf(d.bank);
  const write = isWrite(d.id);
  const m = d.model;
  const open = m && !m.locked;
  const re = open ? phraseRe(m) : null;
  const backTo = write ? `#/bank/${d.bank}` : `#/bank/${d.bank}?s=${d.section}`;
  const lockBox = m?.locked ? `<div class="lock-box"><b>${write ? '提纲、范文和背诵' : '提纲、参考句子和背诵'}</b><span>中英对照，标出结构和好用的句型</span>
    <button class="btn primary" data-unlock="${esc(m.item)}">解锁这道题</button></div>` : '';
  const step = (n, title, body, opts = {}) => `<section class="step${opts.shut ? ' shut' : ''}" data-step="${n}">
    <div class="step-h"><i>${n}</i><h2>${title}</h2>${opts.btn ? `<button class="btn sm" data-reveal="${n}">${opts.btn}</button>` : ''}</div>
    <div class="step-b">${body}</div></section>`;
  const paras = open ? m.paras.map((p, i) => `<div class="para t-${esc(p.tag)}" data-p="${i}"><i>${TAG[p.tag] || ''}</i>
      <p class="zh">${esc(p.zh)}</p><p lang="en" class="en">${markPhrases(p.en, re)}</p>
      <button class="link-btn" data-show="${i}">看英文</button></div>`).join('') : '';
  page(`<a class="back" href="${backTo}">${BACK_IC}${write ? '写作' : ROUNDS[d.section]} · ${g.name}</a>
    <div class="card learn-top">
      <div class="spk-top"><span class="tag ok">${write ? '写作' : ROUNDS[d.section]}</span><span class="small muted">第 ${d.number} 题${write ? ` · ${g.words} 词以内` : ''}</span>${realTag(d)}</div>
      <h2 class="topic" lang="en">${txt(d.stem)}</h2>
      <p class="topic-zh">${esc(d.stem_zh || '')}</p>
    </div>
    <div class="steps">
      ${step(1, '提示', d.tips ? `<p>${txt(d.tips)}</p>` : '<p class="muted">暂无</p>', { shut: true, btn: '看提示' })}
      ${open ? `
      ${step(2, '提纲', `<ol class="outline">${(m.outline || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ol>`, { shut: true, btn: '看提纲' })}
      ${step(3, write ? '范文' : '参考句子', `<div class="ref-tools"><button class="btn sm" id="all-en">全部显示英文</button><span class="small muted">${m.words || ''} 词</span></div>
        <div class="paras ref">${paras}</div>
        ${m.phrases?.length ? `<div class="phr"><b>好用的表达</b>${m.phrases.map((p) => `<span><em lang="en">${esc(p.en)}</em>${esc(p.zh)}</span>`).join('')}</div>` : ''}`, { shut: true, btn: write ? '看范文' : '看参考句子' })}
      ${step(4, '背诵', `<div class="chips rc-modes">${[['full', '全文'], ['holes', '挖空句型'], ['letters', '首字母'], ['zh', '只看中文']].map(([k, n], i) => `<button class="chip${i ? '' : ' on'}" data-mode="${k}">${n}</button>`).join('')}</div>
        <div class="recite" id="recite"></div>
        ${write ? '' : `<div class="rec-line" id="recl"></div>`}
        <div class="actions"><button class="btn primary" id="got">${d.learned ? '又背了一遍' : '背会了'}</button>
          <a class="btn" href="#/${write ? 'write' : 'speech'}/${enc(d.id)}">${write ? '限时写一篇' : '限时说一遍'}</a></div>`, { shut: true, btn: '开始背' })}`
      : `<section class="step"><div class="step-b">${lockBox || '<p class="muted">这道题的参考还在整理</p>'}</div></section>`}
    </div>`, 'home');
  // 一步一步打开：先自己想，卡住再看下一步
  $app.querySelectorAll('[data-reveal]').forEach((b) => (b.onclick = () => {
    const n = +b.dataset.reveal;
    $app.querySelectorAll('.step').forEach((s) => { if (+s.dataset.step <= n) { s.classList.remove('shut'); s.querySelector('[data-reveal]')?.remove(); } });
  }));
  $app.querySelectorAll('[data-unlock]').forEach((b) => (b.onclick = () => askUnlock(b.dataset.unlock, d, () => renderLearn(id))));
  if (!open) return;
  // 参考句子：先看中文自己说，再点开英文对照
  $app.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => { b.closest('.para').classList.add('show-en'); b.remove(); }));
  $app.querySelector('#all-en').onclick = (e) => { $app.querySelectorAll('.ref .para').forEach((p) => p.classList.add('show-en')); $app.querySelectorAll('[data-show]').forEach((b) => b.remove()); e.target.remove(); };
  // 背诵
  const $r = $app.querySelector('#recite');
  const showMode = (mode) => {
    $r.innerHTML = m.paras.map((p) => `<p class="rc t-${esc(p.tag)}">${
      mode === 'full' ? markPhrases(p.en, re) : mode === 'holes' ? holes(p.en, re) : mode === 'letters' ? firstLetters(p.en) : `<span class="zh-only">${esc(p.zh)}</span>`}</p>`).join('');
    $r.querySelectorAll('.hole').forEach((h) => (h.onclick = h.onkeydown = (e) => { if (e.type === 'keydown' && e.key !== 'Enter') return; h.textContent = h.dataset.w; h.classList.add('open'); }));
  };
  $app.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    $app.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); showMode(b.dataset.mode);
  }));
  showMode('full');
  if (!write) cleanup = recorder($app.querySelector('#recl'), g.limit);
  $app.querySelector('#got').onclick = async (e) => {
    e.target.disabled = true;
    await api('/api/english/practice', { method: 'POST', body: { student_id: auth.student.id, problem_id: d.id, kind: 'learn' } }).catch(() => {});
    bankCache.delete(d.bank);
    e.target.textContent = '已记下';
  };
}

// 背一遍录下来听：不限时，只显示用时和限时
function recorder($el, limit) {
  let rec = null, stream = null, url = null, timer = null, t0 = 0;
  const stop = () => { clearInterval(timer); try { rec?.state === 'recording' && rec.stop(); } catch {} stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const idle = () => { $el.innerHTML = `<button class="btn sm" id="rgo">录一遍</button>${url ? `<audio controls src="${url}"></audio>` : ''}`; $el.querySelector('#rgo').onclick = go; };
  const go = async () => {
    if (!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)) { $el.innerHTML = '<span class="small muted">这个浏览器不能录音</span>'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { $el.innerHTML = '<span class="small muted">没有开麦克风</span>'; return; }
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { if (url) URL.revokeObjectURL(url); url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null; idle(); };
    rec.start(); t0 = performance.now();
    $el.innerHTML = `<i class="rec-dot"></i><b class="num" id="rt">0:00</b><span class="small muted">/ ${ms(limit)}</span><button class="btn sm" id="rst">停</button>`;
    $el.querySelector('#rst').onclick = () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); rec.stop(); };
    timer = setInterval(() => { const s = (performance.now() - t0) / 1000; const el = $el.querySelector('#rt'); if (el) { el.textContent = ms(s); el.classList.toggle('over', s > limit); } }, 250);
  };
  idle();
  return () => { stop(); if (url) URL.revokeObjectURL(url); };
}

const practiced = (d) => { bankCache.delete(d.bank); store.set('en.last', d.id); };
// 练完之后：去学这道题
const learnLink = (id, write) => `<a class="btn" href="#/learn/${enc(id)}">${write ? '看范文，学这道题' : '看参考，学这道题'}</a>`;

// 麦克风录音（模拟比赛用）：能开就录，开不了只计时
async function startRec() {
  if (!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
    return {
      stream,
      stop: () => new Promise((r) => {
        rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); r(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null); };
        try { rec.state === 'recording' ? rec.stop() : rec.onstop(); } catch { r(null); }
      }),
      kill: () => { try { rec.state === 'recording' && rec.stop(); } catch {} stream.getTracks().forEach((t) => t.stop()); },
    };
  } catch { return null; }
}

// ───────── 模拟半决赛：抽题 → 准备 → 限时演讲 → 回放 ─────────
const PREPS = [[15, '15 秒'], [60, '1 分钟'], [120, '2 分钟'], [0, '不准备']];
async function renderSpeech(id) {
  const d = await api(`/api/english/items/${enc(id)}?student=${enc(auth.student.id)}`);
  if (d.section === 3) return renderFinal(d);
  const g = grpOf(d.bank);
  const limit = MOCK.speechSec;
  let prep = store.get('en.prep', MOCK.speechPrep);
  if (!PREPS.some(([s]) => s === prep)) prep = MOCK.speechPrep;
  const drawn = /[?&]draw=/.test(location.hash);
  let timer = null, r = null, audioUrl = null;
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="spk card">
      <div class="spk-top"><span class="tag ok">模拟${d.section === 1 ? '复赛' : '半决赛'}</span><span class="small muted">${g.name} · 第 ${d.number} 题</span>${realTag(d)}</div>
      <h2 class="topic" lang="en">${esc(d.stem)}</h2>
      <p class="topic-zh" hidden>${esc(d.stem_zh || '')}</p>
      <button class="link-btn" id="zh">看中文意思</button>
      <div id="stage"></div>
    </div>`, 'home');
  cleanup = () => { clearInterval(timer); r?.kill(); if (audioUrl) URL.revokeObjectURL(audioUrl); };
  const $s = $app.querySelector('#stage');
  $app.querySelector('#zh').onclick = (e) => { const p = $app.querySelector('.topic-zh'); p.hidden = !p.hidden; e.target.textContent = p.hidden ? '看中文意思' : '收起中文'; };
  const stageReady = () => {
    $s.innerHTML = `<div class="prep-pick"><span class="small muted">准备时间</span>
      ${PREPS.map(([s, n]) => `<button class="chip${s === prep ? ' on' : ''}" data-prep="${s}">${n}</button>`).join('')}</div>
      <div class="actions"><button class="btn primary big" id="go">${prep ? '开始准备' : '开始说'}</button>
      ${drawn ? `<a class="btn" href="#/draw/${d.bank}?s=${d.section}">换一题</a>` : ''}</div>`;
    $s.querySelectorAll('[data-prep]').forEach((b) => (b.onclick = () => { prep = +b.dataset.prep; store.set('en.prep', prep); stageReady(); }));
    $s.querySelector('#go').onclick = () => (prep ? stagePrep() : stageTalk());
  };
  const stagePrep = () => {
    const end = performance.now() + prep * 1000;
    $s.innerHTML = `<div class="clock prep"><span>准备</span><b id="clk">${ms(prep)}</b></div>
      <div class="actions"><button class="btn primary big" id="go">准备好了，开始说</button></div>`;
    $s.querySelector('#go').onclick = () => { clearInterval(timer); stageTalk(); };
    timer = setInterval(() => {
      const left = (end - performance.now()) / 1000;
      if (left <= 0) { clearInterval(timer); stageTalk(); return; }
      $s.querySelector('#clk').textContent = ms(Math.ceil(left));
    }, 200);
  };
  const stageTalk = async () => {
    $s.innerHTML = `<div class="clock talk" id="clock"><span id="rec-st">计时</span><b id="clk">0:00</b><small>限时 ${ms(limit)}</small>
      <div class="lim"><i id="lim"></i></div></div>
      <div class="actions"><button class="btn primary big" id="stop">说完了</button></div>`;
    r = await startRec();
    $s.querySelector('#rec-st').innerHTML = r ? '<i class="rec-dot"></i>录音中' : '没有开麦克风 · 只计时';
    const t0 = performance.now();
    const tick = () => {
      const sec = (performance.now() - t0) / 1000;
      $s.querySelector('#clk').textContent = ms(sec);
      $s.querySelector('#lim').style.width = `${Math.min(100, (sec / limit) * 100)}%`;
      const c = $s.querySelector('#clock');
      c.classList.toggle('near', sec >= limit - 15 && sec < limit);
      c.classList.toggle('over', sec >= limit);
      return sec;
    };
    timer = setInterval(tick, 200);
    $s.querySelector('#stop').onclick = async (e) => {
      e.target.disabled = true;
      const sec = tick();
      clearInterval(timer);
      audioUrl = r ? await r.stop() : null; r = null;
      api('/api/english/practice', { method: 'POST', body: { student_id: auth.student.id, problem_id: d.id, kind: 'speak', seconds: sec } }).catch(() => {});
      practiced(d);
      stageDone(sec);
    };
  };
  const stageDone = (sec) => {
    const over = sec > limit, short = sec < limit * 0.5;
    $s.innerHTML = `<div class="result ${over ? 'over' : short ? 'short' : 'good'}"><b>${ms(sec)}</b>
      <span>${over ? `超时 ${ms(sec - limit)}` : short ? '不到限时的一半，可以多说一点' : `在 ${ms(limit)} 以内`}</span></div>
      ${audioUrl ? `<audio controls src="${audioUrl}" class="play"></audio>` : ''}
      ${checks(['开头一两句就回答了问题 / 亮出观点', '中间有两个左右的理由或方面', '至少有一个具体的例子或小故事', '有结尾，总结或呼应开头', '声音清楚，不卡顿，语速不赶'])}
      <div class="actions"><button class="btn" id="again">再说一次</button>${learnLink(d.id)}<a class="btn primary" href="#/draw/${d.bank}?s=${d.section}">下一题</a></div>`;
    $s.querySelector('#again').onclick = () => { if (audioUrl) URL.revokeObjectURL(audioUrl); audioUrl = null; stageReady(); };
  };
  stageReady();
}
const checks = (list) => `<div class="checks"><b>听一遍，对照检查</b>${list.map((c) => `<label><input type="checkbox"> ${c}</label>`).join('')}</div>`;

// ───────── 模拟决赛：定题演讲，准备 5 分钟 → 演讲 2 分钟 → 评委 2 个问题（共 1.5 分钟） ─────────
// 第 1 问针对演讲内容（思路里「评委可能追问」的那句，没有就用通用追问），第 2 问是开放问题（从复赛问答里抽）
const FOLLOW_UPS = ['Why did you choose this example?', 'What did you learn from this experience?', 'Can you tell us more about the most important point in your speech?'];
async function renderFinal(d) {
  const g = grpOf(d.bank);
  const bank = await loadBank(d.bank);
  const fromTips = (d.tips || '').match(/[A-Z][^。！？\n]*\?/g) || [];
  const q1 = fromTips[0] || FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)];
  const [q2] = pickFrom(bank.items.filter((x) => x.section === 1));
  let timer = null, r = null, audioUrl = null;
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="spk card">
      <div class="spk-top"><span class="tag ok">模拟决赛</span><span class="small muted">${g.name} · 定题演讲</span>${realTag(d)}</div>
      <h2 class="topic" lang="en">${esc(d.stem)}</h2>
      <p class="topic-zh" hidden>${esc(d.stem_zh || '')}</p>
      <button class="link-btn" id="zh">看中文意思</button>
      <div id="stage"><ol class="rules">
        <li>准备 ${MOCK.finalPrep / 60} 分钟，可以在纸上列提纲。</li>
        <li>演讲 ${ms(MOCK.finalSec)}，脱稿。</li>
        <li>讲完评委问 2 个问题：一个关于你的演讲，一个开放问题，两题共 ${ms(MOCK.finalQaSec)}。</li></ol>
        <div class="actions"><button class="btn primary big" id="go">开始准备</button></div></div>
    </div>`, 'home');
  cleanup = () => { clearInterval(timer); r?.kill(); if (audioUrl) URL.revokeObjectURL(audioUrl); };
  const $s = $app.querySelector('#stage');
  $app.querySelector('#zh').onclick = (e) => { const p = $app.querySelector('.topic-zh'); p.hidden = !p.hidden; e.target.textContent = p.hidden ? '看中文意思' : '收起中文'; };
  // 一段计时：倒计时（准备）或正计时（演讲、答问），返回用时
  const clock = (label, sec, down, btn, extra = '') => new Promise((resolve) => {
    $s.innerHTML = `<div class="clock ${down ? 'prep' : 'talk'}" id="clock"><span>${label}</span><b id="clk">${ms(down ? sec : 0)}</b><small>${down ? '' : `限时 ${ms(sec)}`}</small>
      <div class="lim"><i id="lim"></i></div></div>${extra}
      <div class="actions"><button class="btn primary big" id="nx">${btn}</button></div>`;
    const t0 = performance.now();
    const tick = () => {
      const el = (performance.now() - t0) / 1000;
      const c = $s.querySelector('#clock'); if (!c) return el;
      $s.querySelector('#clk').textContent = ms(down ? Math.ceil(Math.max(0, sec - el)) : el);
      $s.querySelector('#lim').style.width = `${Math.min(100, (el / sec) * 100)}%`;
      if (!down) { c.classList.toggle('near', el >= sec - 15 && el < sec); c.classList.toggle('over', el >= sec); }
      if (down && el >= sec) { clearInterval(timer); resolve(el); }
      return el;
    };
    timer = setInterval(tick, 200);
    $s.querySelector('#nx').onclick = () => { clearInterval(timer); resolve(tick()); };
  });
  $s.querySelector('#go').onclick = async () => {
    await clock('准备', MOCK.finalPrep, true, '准备好了，开始演讲');
    r = await startRec();
    const rec = r ? '<i class="rec-dot"></i>录音中 · ' : '';
    const talk = await clock(`${rec}演讲`, MOCK.finalSec, false, '讲完了');
    const t1 = performance.now();
    const qa1 = await clock(`${rec}评委提问 1 / 2`, MOCK.finalQaSec, false, '下一个问题', `<h2 class="topic qa" lang="en">${esc(q1)}</h2>`);
    const qa2 = await clock(`${rec}评委提问 2 / 2`, Math.max(15, MOCK.finalQaSec - qa1), false, '答完了', `<h2 class="topic qa" lang="en">${esc(q2?.stem || FOLLOW_UPS[2])}</h2>`);
    audioUrl = r ? await r.stop() : null; r = null;
    const qa = (performance.now() - t1) / 1000;
    api('/api/english/practice', { method: 'POST', body: { student_id: auth.student.id, problem_id: d.id, kind: 'speak', seconds: talk } }).catch(() => {});
    practiced(d);
    const row = (n, sec, lim) => `<div class="fr-row"><span>${n}</span><b class="num ${sec > lim ? 'over' : ''}">${ms(sec)}</b><small>/ ${ms(lim)}</small></div>`;
    $s.innerHTML = `<div class="fin-res">${row('演讲', talk, MOCK.finalSec)}${row('答问', qa, MOCK.finalQaSec)}</div>
      ${audioUrl ? `<audio controls src="${audioUrl}" class="play"></audio>` : ''}
      ${checks(['开头点题，观点或主题一句话说清', '有一个打动人的具体故事或细节', '结尾升华，回到题目', '答问时先直接回答，再补一个理由或例子', '眼神看镜头，自信、有表情'])}
      <div class="actions">${learnLink(d.id)}<a class="btn primary" href="#/draw/${d.bank}?s=3">换一题</a></div>`;
  };
}

// ───────── 模拟复赛：评委连问几题，即问即答，总时长限时 ─────────
async function renderInterview() {
  const g = curGroup();
  const bank = await loadBank(`esdp-speak-${g.id}`);
  const qs = pickFrom(bank.items.filter((x) => x.section === 1), MOCK.interviewQs);
  if (!qs.length) return errorPage('这个题库还没有题目');
  const total = MOCK.interviewSec;
  let timer = null, r = null, audioUrl = null;
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="spk card iv" id="iv">
      <div class="spk-top"><span class="tag ok">模拟复赛</span><span class="small muted">${g.name} · ${qs.length} 题 · 共 ${ms(total)}</span></div>
      <div id="stage"><ol class="rules">
        <li>评委会连着问 ${qs.length} 个关于你自己的问题，题目出现就开始回答，没有准备时间。</li>
        <li>答完一题点「下一题」。${qs.length} 题加起来 ${ms(total)}，每题大约 ${Math.round(total / qs.length)} 秒。</li>
        <li>看着屏幕上方（像看着评委），微笑，大声说。</li></ol>
        <div class="actions"><button class="btn primary big" id="go">开始</button></div></div>
    </div>`, 'home');
  cleanup = () => { clearInterval(timer); r?.kill(); if (audioUrl) URL.revokeObjectURL(audioUrl); };
  const $s = $app.querySelector('#stage');
  $s.querySelector('#go').onclick = async () => {
    r = await startRec();
    const t0 = performance.now();
    const marks = [0];
    let i = 0;
    const show = () => {
      $s.innerHTML = `<div class="clock talk" id="clock"><span>${r ? '<i class="rec-dot"></i>录音中' : '计时'} · 第 ${i + 1} / ${qs.length} 题</span><b id="clk">0:00</b><small>共 ${ms(total)}</small>
        <div class="lim"><i id="lim"></i></div></div>
        <h2 class="topic" lang="en">${esc(qs[i].stem)}</h2>
        <div class="actions"><button class="btn primary big" id="nx">${i < qs.length - 1 ? '下一题' : '答完了'}</button></div>`;
      $s.querySelector('#nx').onclick = async (e) => {
        marks.push((performance.now() - t0) / 1000);
        if (++i < qs.length) return show();
        e.target.disabled = true;
        clearInterval(timer);
        audioUrl = r ? await r.stop() : null; r = null;
        done(marks);
      };
    };
    const tick = () => {
      const sec = (performance.now() - t0) / 1000;
      const el = $s.querySelector('#clk'); if (!el) return;
      el.textContent = ms(sec);
      $s.querySelector('#lim').style.width = `${Math.min(100, (sec / total) * 100)}%`;
      const c = $s.querySelector('#clock');
      c.classList.toggle('near', sec >= total - 20 && sec < total);
      c.classList.toggle('over', sec >= total);
    };
    show();
    timer = setInterval(tick, 200);
  };
  const done = (marks) => {
    const all = marks[marks.length - 1];
    qs.forEach((q, k) => {
      api('/api/english/practice', { method: 'POST', body: { student_id: auth.student.id, problem_id: q.id, kind: 'speak', seconds: marks[k + 1] - marks[k] } }).catch(() => {});
    });
    bankCache.delete(`esdp-speak-${g.id}`);
    store.set('en.last', qs[qs.length - 1].id);
    $s.innerHTML = `<div class="result ${all > total ? 'over' : 'good'}"><b>${ms(all)}</b><span>${all > total ? `超时 ${ms(all - total)}` : `在 ${ms(total)} 以内`}</span></div>
      ${audioUrl ? `<audio controls src="${audioUrl}" class="play"></audio>` : ''}
      <div class="iv-list">${qs.map((q, k) => `<a class="q-row" href="#/learn/${enc(q.id)}"><span class="q-n num">${ms(marks[k + 1] - marks[k])}</span>
        <span class="q-t"><span lang="en">${esc(q.stem)}</span><small>${esc(q.stem_zh || '')}</small></span><span class="q-m"><i class="tag">学</i></span></a>`).join('')}</div>
      ${checks(['每题第一句就直接回答了问题', '每题都补充了细节或原因，不只是一句话', '没有长时间停顿或「嗯……」', '声音清楚，面带微笑'])}
      <div class="actions"><a class="btn primary" href="#/interview?again=${Date.now()}">再来一组</a></div>`;
  };
}

// ───────── 写作：限时写 → 字数 → 去学范文 ─────────
async function renderWrite(id) {
  const d = await api(`/api/english/items/${enc(id)}?student=${enc(auth.student.id)}`);
  const g = grpOf(d.bank);
  const key = `en.draft.${id}`;
  const drawn = /[?&]draw=/.test(location.hash);
  let wmin = store.get('en.wmin', 30);
  if (![30, 45].includes(wmin)) wmin = 30;
  let limitSec = wmin * 60;
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="card wr">
      <div class="spk-top"><span class="tag ok">模拟写作</span><span class="small muted">${g.name} · 第 ${d.number} 题 · ${g.words} 词左右</span>${realTag(d)}
        <span class="wclock num" id="wclk">${ms(limitSec)}</span></div>
      <div class="prep-pick" id="wmin"><span class="small muted">时长</span>${[[30, '30 分钟'], [45, '45 分钟']].map(([m, n]) => `<button class="chip${m === wmin ? ' on' : ''}" data-wmin="${m}">${n}</button>`).join('')}</div>
      <h2 class="topic" lang="en">${txt(d.stem)}</h2>
      <p class="topic-zh" hidden>${esc(d.stem_zh || '')}</p>
      <button class="link-btn" id="zh">看中文意思</button>
      <textarea id="txt" lang="en" spellcheck="false" autocapitalize="sentences" placeholder="Write here..." rows="10">${esc(store.get(key, ''))}</textarea>
      <div class="wc"><span id="wc">0</span> / ${g.words} 词<div class="lim"><i id="lim"></i></div></div>
      <div class="actions"><button class="btn primary" id="done">交稿</button>${drawn ? `<a class="btn" href="#/draw/${d.bank}">换一题</a>` : ''}</div>
    </div>
    <div id="after"></div>`, 'home');
  const $t = $app.querySelector('#txt');
  $app.querySelector('#zh').onclick = (e) => { const p = $app.querySelector('.topic-zh'); p.hidden = !p.hidden; e.target.textContent = p.hidden ? '看中文意思' : '收起中文'; };
  // 从第一次打字开始倒计时，到时只提醒、不强制交
  let t0 = null;
  const timer = setInterval(() => {
    if (t0 === null) return;
    const left = limitSec - (performance.now() - t0) / 1000;
    const el = $app.querySelector('#wclk'); if (!el) return;
    el.textContent = left >= 0 ? ms(left) : `超时 ${ms(-left)}`;
    el.classList.toggle('over', left < 0);
  }, 500);
  cleanup = () => clearInterval(timer);
  const upd = () => {
    const n = countWords($t.value);
    $app.querySelector('#wc').textContent = n;
    $app.querySelector('#lim').style.width = `${Math.min(100, (n / g.words) * 100)}%`;
    $app.querySelector('.wc').classList.toggle('over', n > g.words);
    store.set(key, $t.value);
  };
  $app.querySelectorAll('[data-wmin]').forEach((b) => (b.onclick = () => {
    wmin = +b.dataset.wmin; store.set('en.wmin', wmin); limitSec = wmin * 60;
    $app.querySelectorAll('[data-wmin]').forEach((x) => x.classList.toggle('on', x === b));
    $app.querySelector('#wclk').textContent = ms(limitSec);
  }));
  $t.oninput = () => { if (t0 === null) { t0 = performance.now(); $app.querySelector('#wmin')?.remove(); } upd(); };
  upd();
  $app.querySelector('#done').onclick = async (e) => {
    const text = $t.value.trim();
    if (countWords(text) < 10) return modal(`<p>再多写一点吧。</p><div class="actions"><button class="btn" data-close>好</button></div>`);
    e.target.disabled = true;
    try {
      const sec = t0 === null ? null : (performance.now() - t0) / 1000;
      const r = await api('/api/english/practice', { method: 'POST', body: { student_id: auth.student.id, problem_id: d.id, kind: 'write', text, seconds: sec } });
      practiced(d);
      store.del(key);
      clearInterval(timer);
      const words = r.words ?? countWords(text);
      $app.querySelector('.wr').innerHTML = `<div class="spk-top"><span class="tag ok">模拟写作</span><span class="small muted">${g.name} · 第 ${d.number} 题</span></div>
        <h2 class="topic" lang="en">${txt(d.stem)}</h2>
        <div class="result ${words > g.words ? 'over' : 'good'}"><b>${words} 词</b><span>${words > g.words ? `超出 ${words - g.words} 词，比赛要求 ${g.words} 词以内` : `在 ${g.words} 词以内`}${sec ? ` · 用时 ${ms(sec)}` : ''}</span></div>
        <p lang="en" class="essay">${txt(text)}</p>
        ${checks(['第一段直接回应题目', '每段围绕一个意思，有理由或例子', '有结尾段', '句首字母大写，句末有标点', '单词拼写正确，没有中式表达']).replace('听一遍', '读一遍')}
        <div class="actions"><a class="btn" href="#/write/${enc(d.id)}">再写一篇</a>${learnLink(d.id, true)}<a class="btn primary" href="#/draw/${d.bank}">下一题</a></div>`;
      window.scrollTo(0, 0);
    } catch (x) { e.target.disabled = false; modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
  };
  const mine = await api(`/api/english/items/${enc(id)}/mine?student=${enc(auth.student.id)}`).catch(() => ({ records: [] }));
  if (mine.records.length) $app.querySelector('#after').innerHTML = `<section class="card"><h2>以前写的</h2>${mine.records.map((r) => `<details class="mk"><summary>${day(r.created_at)} · ${r.words ?? 0} 词</summary><p lang="en" class="essay">${txt(r.text)}</p></details>`).join('')}</section>`;
}

// 内容没解锁：游客 → 注册送 10 次；有次数 → 用 1 次；没次数 → 分享再得 10 次 / 开通会员
const SHARE_IMG = '/math/share-poster.png';
const shareCard = () => `<div class="share"><img src="${SHARE_IMG}" alt="learn-inside 宣传图（带二维码）">
  <div class="share-t"><b>分享再得 10 次</b>
    <ol><li>${IN_WX ? '长按上面的图片，保存到手机' : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? '长按图片保存，或点「保存宣传图」' : '点「保存宣传图」下载'}</li><li>转发到 <b>100 人以上</b>的微信群</li><li>截图发给客服，客服给你加 <b>10 次</b></li></ol>
    <div class="share-btns">${IN_WX ? '' : `<a class="btn" href="${SHARE_IMG}" download="learn-inside-宣传图.png">保存宣传图</a>`}<button class="btn primary" data-support="把转发截图发给客服，领 10 次">发截图给客服</button></div></div></div>`;
async function askUnlock(item, d, then) {
  if (isGuest()) return modal(`<h2>注册就送 10 次</h2><p>提纲、参考句子和背诵是会员内容。注册账号就送 10 次，这道题马上能学；现在的练习记录也会保留。</p>
    <div class="actions"><button class="btn" data-close>先不了</button><a class="btn primary" href="#/join">去注册</a></div>`);
  if (d.credits > 0) return modal(`<h2>解锁这道题</h2>
    <p>用 1 次免费次数解锁，之后这道题的提纲、参考句子和背诵可以随时反复看。</p>
    <p class="small muted">剩余 ${d.credits} 次。开通会员后不限次数。</p>
    <div class="actions"><a class="btn" href="/account/">看看会员</a><button class="btn primary" id="unl">用 1 次解锁</button></div>`, (m, close) => {
    m.querySelector('#unl').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('/api/unlock', { method: 'POST', body: { item } });
        close();
        if (r.status === 402) return askUnlock(item, { ...d, credits: 0 }, then);
        bankCache.clear();
        then();
      } catch (x) { close(); modal(`<p>${esc(x.message)}</p><div class="actions"><button class="btn" data-close>好</button></div>`); }
    };
  });
  modal(`<h2>免费次数用完了</h2>${shareCard()}
    <p class="small muted share-or">或者开通会员，所有话题不限次数。</p>
    <div class="actions"><button class="btn" data-close>先不了</button><a class="btn primary" href="/account/">开通会员</a></div>`);
}

// ───────── 句型和名言 ─────────
function renderPhrases() {
  page(`<a class="back" href="#/esdp">${BACK_IC}ESDP</a>
    <div class="hero hero-row"><h1>句型积累</h1><button class="btn lp-entry" id="ph-print">${PRINT_ICON}打印</button></div>
    <section class="card"><h2>「总-分-总」常用句型</h2>
      <div class="ph-grid">${PHRASES.map(([t, ...xs]) => `<div class="ph-g"><b>${t}</b>${xs.map(([en, zh]) => `<p><span lang="en">${esc(en)}</span><small>${zh}</small></p>`).join('')}</div>`).join('')}</div></section>
    <section class="card"><h2>百搭名言</h2>
      <div class="quotes">${QUOTES.map(([t, en, who, zh]) => `<figure><figcaption>${t}</figcaption><blockquote lang="en">${esc(en)}<cite>— ${esc(who)}</cite></blockquote><p>${zh}</p></figure>`).join('')}</div></section>`, 'phrases');
  $app.querySelector('#ph-print').onclick = () => openPhrasesPrint();
}

router();
