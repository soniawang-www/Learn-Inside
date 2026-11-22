// 打卡和吉祥物的共用小部件（数学、语文、首页都用）
export const WEEK = '一二三四五六日';
// 吉祥物「狸狸」和学科小伙伴在 cast.js；这里转出去，各页面照旧从 pal.js 引
// 形象怎么放看布局：打卡卡片紧挨着的地方不再放第二个大形象；列表里的小头像、成绩页的小伙伴可以有
import { mascot, friend, FRIENDS, castRow } from './cast.js?v=20261122e';
import { XHS } from './brand.js?v=20261122a';
import qrcode from './print/qrcode.js?v=20261111';
export { XHS };
export { mascot, friend, FRIENDS, castRow };
// 科目小头像：数学圆圆、语文墨墨、英语乐乐
export const subjHead = (subject) => friend(FRIENDS[subject], 'happy', { head: true });
// 成绩旁边的学科小伙伴：80% 以上欢呼，50% 以上开心，再低就想一想
// 开始答题前：学科小伙伴站在「开始」按钮旁边
export const startPal = (subject) => `<span class="start-pal">${friend(FRIENDS[subject] || FRIENDS.math, 'happy')}</span>`;
export const scorePal = (subject, got, full) => { const r = full ? got / full : 0; return `<span class="score-pal">${friend(FRIENDS[subject] || FRIENDS.math, r >= 0.8 ? 'cheer' : r >= 0.5 ? 'happy' : 'think')}</span>`; };
// 连续打卡里程碑：到了给一枚徽章（完成页），首页提示还差几天
export const MILES = [3, 7, 14, 30, 60, 100, 180, 365];
export const nextMile = (k) => MILES.find((m) => m > k);
export const MEDAL = (n) => `<svg viewBox="0 0 40 48" class="medal" aria-hidden="true"><path d="M12 2h7l-4 14h-7zM21 2h7l4 14h-7z" fill="#B04A6F"/><circle cx="20" cy="29" r="15" fill="#FFD25E" stroke="#F08A24" stroke-width="3"/><text x="20" y="34.5" text-anchor="middle" font-size="${n >= 100 ? 11 : 14}" font-weight="800" fill="#8A4B00" font-family="inherit">${n}</text></svg>`;
export const STAR = '<svg viewBox="0 0 24 24" class="star" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>';
export const weekRow = (week) => `<div class="sc-week">${(week || []).map((d, i) => `<span class="${d.done ? 'done' : ''} ${d.today ? 'today' : ''}"><i>${WEEK[i]}</i><em>${d.done ? '✓' : ''}</em></span>`).join('')}</div>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUBJ_PATH = { math: '/math/', chinese: '/chinese/', english: '/english/' };
// 英语的答题页按考试分：KET #/ket/…，PET #/pet/…，小托福 #/tj/…
// 语文打卡也在数学页那套「一屏一题」的打卡页里做；看解析回各科自己的复盘页
export const examUrl = (subject, sid, done, family) => !done && subject === 'chinese' ? `/math/#/exam/${encodeURIComponent(sid)}` : `${SUBJ_PATH[subject] || '/math/'}#/${subject === 'english' ? `${family === 'toefljr' ? 'tj' : family || 'ket'}/` : ''}${done ? 'review' : 'exam'}/${encodeURIComponent(sid)}`;
export const START_URL = '/math/#/start';
export const SUBJ_NAME = { math: '数学', chinese: '语文', english: '英语' };
export const PLAN_URL = '/math/#/plan';
export const TEAM_URL = '/math/#/team';

/**
 * 打卡卡片（首页、数学页、语文页共用）
 * pr = GET /api/students/:id/prep；team = GET /api/students/:id/team；only = 只列这一科的备考项（各科主页）
 */
export function todayCard(pr, { team = null, only = null } = {}) {
  const all = pr?.items || [];
  if (!all.length) {
    return `<section class="today-card empty"><div class="tc-hello">${mascot('happy')}<b>每天几道真题</b></div>
      <a class="tc-start" href="${START_URL}">开始</a></section>`;
  }
  const its = only ? all.filter((x) => x.subject === only) : all;
  const more = its.find((x) => x.subject !== 'english'); // 都做完了：再练一组（英语按 Part，不加练）
  const addOnly = only && !its.length ? `<a class="tc-add" href="${START_URL}/${only}">＋ 加入${SUBJ_NAME[only]}打卡</a>` : '';
  const doneAny = all.some((x) => x.today?.done);
  const pw = pr.per_week || 7, wk = pw < 7;
  const title = wk ? `本周 ${pr.week_count || 0}/${pw} 次` : doneAny ? `连续打卡 ${pr.streak} 天` : pr.streak ? `已连续 ${pr.streak} 天` : '今天还没打卡';
  const nm = !wk && pr.streak ? nextMile(pr.streak) : 0; // 下一个徽章还差几天（今天没打卡的，今天也算一天）
  const sub = [doneAny ? (all.every((x) => x.today?.done) ? '今天全部完成' : '今天已打卡') : wk ? (pr.streak ? `连续 ${pr.streak} 周达标` : '') : pr.streak ? '今天还没打卡' : '',
    nm ? `再 ${nm - pr.streak} 天拿 ${nm} 天徽章` : ''].filter(Boolean).join(' · ');
  const row = (x) => {
    const done = !!x.today?.done;
    const size = x.today ? `${x.today.n} 题` : `${x.per_day} ${x.unit || '题'}`;
    const when = x.plan && x.days_left != null ? (x.days_left > 0 ? `还有 ${x.days_left} 天` : '考试加油') : '每日练习';
    return `<button class="tc-item ${done ? 'done' : ''}" data-tc-fam="${esc(x.family)}" data-tc-sub="${esc(x.subject)}" ${x.today ? `data-tc-sid="${esc(x.today.session_id)}"` : ''}>
      <i class="tc-tag s-${esc(x.subject)}">${esc(x.subject_name)}</i><span><b>${esc(x.name)}</b><small>${when} · ${size}</small></span>
      <em>${done ? '✓' : x.today ? '继续' : '开始'}</em></button>`;
  };
  let tm = '';
  if (team?.team) { const b = team.board, i = b.findIndex((x) => x.me); tm = `<a href="${TEAM_URL}">${esc(team.team.name)} · 第 ${i + 1}/${b.length}</a>`; }
  else tm = `<a href="${TEAM_URL}">组队</a>`;
  return `<section class="today-card ${doneAny ? 'done' : ''}">
    <div class="tc-top"><span class="sc-fox ${doneAny ? 'on' : ''}">${mascot(doneAny ? 'happy' : 'sleep', { head: true })}<b>${wk ? pr.week_count || 0 : pr.streak}</b></span><div class="tc-txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>
      <button class="pts-chip" data-pts aria-label="积分">${STAR}${pr.points?.total || 0}</button></div>
    ${weekRow(pr.week)}
    ${its.length ? `<div class="tc-items">${its.map(row).join('')}</div>` : addOnly}
    ${its.length && its.every((x) => x.today?.done) && more ? `<button class="tc-more" data-tc-more="${esc(more.family)}">再练一组</button>` : ''}
    <div class="tc-foot"><a href="${START_URL}">＋ 备考项</a><span><a href="${PLAN_URL}">计划</a>${tm}</span></div>
  </section>`;
}

/** 积分：余额 + 换互动解析次数。onDone(结果) 在换成功后调用 */
export async function pointsSheet({ sid, token, onDone } = {}) {
  const call = async (path, opt = {}) => {
    const r = await fetch(`/api/students/${encodeURIComponent(sid)}/points${path}`, { ...opt, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '没换成'); return j;
  };
  let d; try { d = await call(''); } catch (e) { alert(e.message); return; }
  const dlg = document.createElement('dialog'); dlg.className = 'pts-dlg';
  const draw = (msg = '') => {
    const can = d.total >= d.per_credit;
    dlg.innerHTML = `<div class="pd-top">${STAR}<b>${d.total}</b><span>积分</span><button class="pd-x" aria-label="关闭">×</button></div>
      <div class="pd-ex"><span><b>${d.per_credit} 积分换 1 次互动解析</b><small>现有 ${d.credits} 次</small></span>
        <button class="pd-go" ${can ? '' : 'disabled'}>${can ? '换 1 次' : `还差 ${d.per_credit - d.total}`}</button></div>
      ${msg ? `<p class="pd-msg">${msg}</p>` : ''}
      <p class="pd-how">做对一题 +10 · 打卡 +20</p>`;
    dlg.querySelector('.pd-x').onclick = () => dlg.close();
    dlg.querySelector('.pd-go').onclick = async (e) => {
      e.target.disabled = true;
      try { d = { ...d, ...(await call('/redeem', { method: 'POST', body: JSON.stringify({ n: 1 }) })) }; draw('换好了'); onDone?.(d); document.querySelectorAll('[data-pts]').forEach((x) => (x.lastChild.textContent = d.total)); }
      catch (x) { draw(x.message); }
    };
  };
  draw();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg); dlg.showModal();
}

// ───────── 回来的路：从桌面图标打开、在微信 / 小红书里打开 ─────────
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const bjDay = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
/** 计一次数（同一台设备同一天只计一次；后台统计页里设成「自己的设备」的不计） */
export function pev(e, { once = false } = {}) {
  if (LS.get('li.noev') === 'true') return;
  const k = 'li.ev.' + e, v = once ? 'y' : bjDay();
  if (LS.get(k) === v) return; LS.set(k, v);
  fetch('/api/ev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ e }), keepalive: true }).catch(() => {});
}
export const INAPP = /MicroMessenger|XiaoHongShu|xhsdiscover|Weibo|QQ\//i.test(navigator.userAgent); // 微信、小红书等 App 里打开的网页
export const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /[?&]src=home\b/.test(location.search);
if (STANDALONE) { pev('a2hs_done'); pev('a2hs_new', { once: true }); } // 苹果没有「装好了」的通知，所以以第一次从图标打开为准
addEventListener('appinstalled', () => pev('a2hs_new', { once: true }));
if (INAPP) pev('inapp_seen');
const inappOff = () => Date.now() - Number(LS.get('li.inappOff') || 0) < 7 * 86400e3; // 点了 ✕ 一周内不再提

// ───────── 联系我们：客服微信、小红书、公众号（有了才显示）─────────
const IN_WX = /MicroMessenger/i.test(navigator.userAgent);
const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch {}
  try { const ta = document.createElement('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}
function toast(html) {
  document.querySelector('.li-toast')?.remove();
  const t = document.createElement('div'); t.className = 'li-toast'; t.innerHTML = html; (document.querySelector('dialog[open]') || document.body).append(t); // 弹窗开着时放进弹窗里，不然被盖住
  setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}
const qrOf = (url) => { try { const q = qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch { return ''; } };
let contactCache = null;
/** 联系我们。只要客服时（比如「把转发截图发给客服」）传 only: 'support' */
export async function openContact({ title = '联系我们', only = '' } = {}) {
  try { contactCache ||= await (await fetch('/api/support')).json(); } catch { contactCache = {}; }
  const s = contactCache, link = /^https:\/\//.test(s.url || '') ? s.url : '';
  const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  // 一张卡：平台色的小标签、二维码、名字、一行说明、（手机上）一个按钮
  const card = (cls, tag, qr, name, sub, act = '') => `<div class="ct-card ${cls}"><span class="ct-tag">${tag}</span>
      <div class="ct-qr">${qr || `<span class="ct-ic">${mascot('happy', { head: true })}</span>`}</div>
      <b class="ct-name">${name}</b>${sub ? `<small class="ct-sub">${sub}</small>` : ''}${act}</div>`;
  const nm = (x) => x.split(' | ').map((p) => `<span>${escH(p)}</span>`).join('');
  const support = card('ct-sup', '客服微信', s.qr ? `<img src="${escH(s.qr)}" alt="客服微信二维码">` : '', '有问题直接问',
    s.text ? escH(s.text) : IN_WX && link ? '' : '微信扫码',
    link && IN_WX ? `<a class="ct-act" href="${escH(link)}">打开微信客服</a>` : '');
  const xhs = card('ct-xhs', '小红书', qrOf(XHS.link), nm(XHS.name),
    `<a href="javascript:" class="ct-copy" data-copy="${XHS.id}" title="复制小红书号"><i>小红书号</i>${XHS.id}${COPY}</a>`,
    `<a class="ct-act ct-open" href="${escH(XHS.link)}" target="_blank" rel="noopener">打开小红书</a>`);
  const mp = s.mp ? card('ct-mp', '公众号', s.mp.qr ? `<img src="${escH(s.mp.qr)}" alt="公众号二维码">` : '', nm(s.mp.name || '公众号'),
    IN_WX && s.mp.qr ? '长按二维码关注' : s.mp.name ? `<a href="javascript:" class="ct-copy" data-copy="${escH(s.mp.name)}" title="复制公众号名字"><i>微信搜</i>${escH(s.mp.name)}${COPY}</a>` : '微信扫码关注') : '';
  const cards = only === 'support' ? [support] : [support, xhs, mp].filter(Boolean);
  const dlg = document.createElement('dialog'); dlg.className = `ct-dlg n${cards.length}`;
  dlg.innerHTML = `<div class="ct-hero"><span class="ct-grab"></span><div class="ct-fox">${mascot('cheer')}</div><h2>${escH(title)}</h2><button class="ct-x" aria-label="关闭">×</button></div>
    <div class="ct-cards n${cards.length}">${cards.join('')}</div>`;
  dlg.querySelector('.ct-x').onclick = () => dlg.close();
  dlg.addEventListener('click', async (e) => {
    if (e.target === dlg) return dlg.close();
    const c = e.target.closest('[data-copy]'); if (!c) return;
    e.preventDefault(); toast((await copyText(c.dataset.copy)) ? `已复制「${escH(c.dataset.copy)}」` : '没复制上，请手动记一下');
  });
  dlg.querySelector('.ct-open')?.addEventListener('click', () => pev('xhs_open'));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal(); pev('contact_open');
}
if (!window.__liContact) {
  window.__liContact = true;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-support], [data-xhs]'); if (!a) return;
    e.preventDefault();
    const t = a.dataset.support;
    openContact(t ? { title: t, only: 'support' } : {});
  });
}

/** 教他点右上角换到浏览器：游客先拿一把一次性钥匙放进地址，浏览器打开后接上原来的记录 */
export async function openInBrowserGuide({ token } = {}) {
  pev('inapp_tap');
  const back = location.href;
  const ov = document.createElement('div'); ov.className = 'ib-ov';
  ov.innerHTML = `<svg class="ib-arrow" viewBox="0 0 90 110" aria-hidden="true"><path d="M14 104C20 60 44 30 76 14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 11"/><path d="M58 10L80 10L76 32" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div class="ib-txt"><b>点右上角 ···</b><b>选「在浏览器打开」</b><span>打开后能放到桌面、设每日提醒</span></div>
    <button class="ib-ok">知道了</button>`;
  const close = () => { ov.remove(); if (location.href !== back) history.replaceState(null, '', back); };
  ov.addEventListener('click', close);
  document.body.append(ov);
  if (token) try {
    const r = await fetch('/api/account/handoff', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    const j = await r.json(); if (r.ok && j.key && ov.isConnected) history.replaceState(null, '', `/?r=${j.key}`);
  } catch {}
}
/** 在 App 里打开时，打卡卡片上面一条：去浏览器打开 */
function inAppBar(root, token) {
  if (!INAPP || inappOff() || document.querySelector('.ib-bar')) return;
  const card = root.querySelector('.today-card'); if (!card) return;
  const bar = document.createElement('div'); bar.className = 'ib-bar';
  bar.innerHTML = `<button class="ib-go"><svg class="ib-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span><b>去浏览器打开</b><small>能放到桌面、每天提醒</small></span><i>›</i></button><button class="ib-x" aria-label="不再提示">×</button>`;
  bar.querySelector('.ib-go').onclick = () => openInBrowserGuide({ token });
  bar.querySelector('.ib-x').onclick = () => { LS.set('li.inappOff', String(Date.now())); bar.remove(); };
  (root.id === 'today' ? root : card).before(bar);
}

/** 点备考项：没出题先出题，再进答题页；做完的看解析 */
export function bindToday(root, { sid, token }) {
  inAppBar(root, token);
  root.querySelector('[data-pts]')?.addEventListener('click', () => pointsSheet({ sid, token }));
  root.querySelector('[data-tc-more]')?.addEventListener('click', async (e) => { // 今天的都做完了：再练一组（不算打卡）
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await fetch(`/api/students/${encodeURIComponent(sid)}/prep/extra?family=${encodeURIComponent(b.dataset.tcMore)}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || '没开始成');
      location.href = `/math/#/exam/${encodeURIComponent(j.session_id)}`;
    } catch (x) { b.disabled = false; alert(x.message); }
  });
  root.querySelectorAll('[data-tc-fam]').forEach((b) => (b.onclick = async () => {
    const sub = b.dataset.tcSub, done = b.classList.contains('done');
    if (b.dataset.tcSid) { location.href = examUrl(sub, b.dataset.tcSid, done, b.dataset.tcFam); return; }
    b.disabled = true;
    try {
      const r = await fetch(`/api/students/${encodeURIComponent(sid)}/prep/today?family=${encodeURIComponent(b.dataset.tcFam)}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '没开始成');
      location.href = examUrl(j.subject || sub, j.session_id, false, b.dataset.tcFam);
    } catch (e) { b.disabled = false; alert(e.message); }
  }));
}
