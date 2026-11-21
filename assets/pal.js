// 打卡和吉祥物的共用小部件（数学、语文、首页都用）
export const FLAME = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1c1.2 4.2-1.6 6.2-3.4 8.6C6.6 12.2 5 14.4 5 17.4 5 22 8.2 26 12 26s7-3.6 7-8.2c0-3.6-1.9-5.9-3.4-7.7-.4 1.7-1.2 2.9-2.4 3.5.5-4.2-.2-8.6-1.2-12.6z"/><path class="fl-in" d="M12 25c-2.2 0-3.8-1.8-3.8-4.2 0-2 1.2-3.3 2.3-4.6.3 1.1.9 1.9 1.7 2.2-.1-1.6.4-3.2 1.4-4.4 1.2 2 2.2 3.6 2.2 6.4 0 2.6-1.6 4.6-3.8 4.6z"/></svg>';
export const WEEK = '一二三四五六日';
// 吉祥物「小铅笔」：happy 答对、think 答错再看看、cheer 欢呼
export function pencil(mood = 'happy') {
  const body = `<rect x="70" y="${mood === 'cheer' ? 22 : 28}" width="60" height="22" rx="10" fill="#E07C9F"/><rect x="70" y="${mood === 'cheer' ? 40 : 46}" width="60" height="12" fill="#DCD7CA"/>
    <rect x="70" y="${mood === 'cheer' ? 50 : 56}" width="60" height="96" fill="#FFE38A"/><path d="M70 ${mood === 'cheer' ? 146 : 152} L100 ${mood === 'cheer' ? 180 : 186} L130 ${mood === 'cheer' ? 146 : 152} Z" fill="#F3D9B1"/>
    <path d="M92 ${mood === 'cheer' ? 171 : 177} L100 ${mood === 'cheer' ? 180 : 186} L108 ${mood === 'cheer' ? 171 : 177} Z" fill="#1E2B28"/>`;
  const face = {
    happy: '<circle cx="88" cy="96" r="5.5" fill="#1E2B28"/><circle cx="112" cy="96" r="5.5" fill="#1E2B28"/><circle cx="90" cy="94" r="2" fill="#fff"/><circle cx="114" cy="94" r="2" fill="#fff"/><path d="M90 112 Q100 122 110 112" stroke="#1E2B28" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="80" cy="108" rx="5" ry="3.5" fill="#F6B3C8"/><ellipse cx="120" cy="108" rx="5" ry="3.5" fill="#F6B3C8"/>',
    think: '<path d="M82 96 h12" stroke="#1E2B28" stroke-width="4.5" stroke-linecap="round"/><circle cx="112" cy="96" r="5.5" fill="#1E2B28"/><path d="M92 116 h16" stroke="#1E2B28" stroke-width="4" stroke-linecap="round"/>',
    cheer: '<path d="M82 90 Q88 82 94 90" stroke="#1E2B28" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M106 90 Q112 82 118 90" stroke="#1E2B28" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M88 102 Q100 122 112 102 Z" fill="#1E2B28"/>',
  }[mood];
  const arms = {
    happy: '<path d="M70 110 Q52 100 54 84" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M130 110 Q148 116 152 102" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/>',
    think: '<path d="M130 112 Q150 98 134 76" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M70 112 Q58 124 62 140" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/><text x="146" y="60" font-size="30" font-weight="800" fill="#B04A6F">?</text>',
    cheer: '<path d="M70 100 Q50 80 50 58" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M130 100 Q150 80 150 58" stroke="#1D5C4D" stroke-width="8" fill="none" stroke-linecap="round"/>',
  }[mood];
  return `<svg class="pencil ${mood}" viewBox="40 10 125 185" aria-hidden="true">${mood === 'think' ? `<g transform="rotate(-8 100 110)">${body}${face}</g>` : body + face}${arms}</svg>`;
}
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
    return `<section class="today-card empty"><div class="tc-hello">${pencil('happy')}<b>每天几道真题</b></div>
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
    <div class="tc-top"><span class="sc-flame ${doneAny ? 'on' : ''}">${FLAME}<b>${wk ? pr.week_count || 0 : pr.streak}</b></span><div class="tc-txt"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>
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

/** 点备考项：没出题先出题，再进答题页；做完的看解析 */
export function bindToday(root, { sid, token }) {
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
