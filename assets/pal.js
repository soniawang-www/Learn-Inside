// 打卡和吉祥物的共用小部件（数学、语文、首页都用）
export const FLAME = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12.6 1.2C14.4 4.6 18.2 7.4 19.9 11.6 20.6 13.3 21 15.1 21 17.2 21 22.6 17 26.8 12 26.8S3 22.6 3 17.6C3 14.4 4.3 11.7 6.4 9.6 6.6 11.3 7.3 12.6 8.5 13.2 8.2 8.6 9.9 4.4 12.6 1.2Z"/><path class="fl-hi" d="M15.6 7.6C17.9 9.9 19.4 12.6 19.7 15.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/><path class="fl-in" d="M12 25.6C8.9 25.6 6.8 23.3 6.8 20.4 6.8 17.8 8.3 16 9.9 14.4 10.1 15.7 10.7 16.6 11.6 17 11.5 14.6 12.4 12.6 14 11.1 15.9 13.6 17.2 16.3 17.2 20 17.2 23.2 15 25.6 12 25.6Z"/></svg>';
export const WEEK = '一二三四五六日';
// 吉祥物「小铅笔」：happy 答对、think 答错再想想、cheer 欢呼。三面的笔杆、金属箍、削过的木头、地上的影子
const INK = '#1E2B28', JADE = '#1D5C4D';
export function pencil(mood = 'happy') {
  const d = mood === 'cheer' ? -8 : 0, y = (v) => v + d;
  const star = (x, yy, r, c = '#FFC93C') => `<path d="M${x} ${yy - r}Q${x + r * .22} ${yy - r * .22} ${x + r} ${yy}Q${x + r * .22} ${yy + r * .22} ${x} ${yy + r}Q${x - r * .22} ${yy + r * .22} ${x - r} ${yy}Q${x - r * .22} ${yy - r * .22} ${x} ${yy - r}Z" fill="${c}"/>`;
  const body = `
    <path d="M72 ${y(50)}V${y(36)}Q72 ${y(25)} 83 ${y(25)}H117Q128 ${y(25)} 128 ${y(36)}V${y(50)}Z" fill="#EE8FB0"/>
    <rect x="77" y="${y(30)}" width="5" height="15" rx="2.5" fill="#fff" opacity=".45"/>
    <rect x="70" y="${y(47)}" width="60" height="14" rx="3" fill="#D3CEC1"/>
    <path d="M71 ${y(52)}H129M71 ${y(56.5)}H129" stroke="#B3AD9D" stroke-width="1.8"/>
    <path d="M70 ${y(60)}H130V${y(150)}H70Z" fill="#FFC943"/>
    <path d="M82 ${y(60)}H118V${y(150)}H82Z" fill="#FFDA6B"/>
    <rect x="86" y="${y(64)}" width="4" height="80" rx="2" fill="#FFF1BE" opacity=".8"/>
    <path d="M70 ${y(149)}Q76 ${y(157)} 82 ${y(149)}Q88 ${y(157)} 94 ${y(149)}Q100 ${y(157)} 106 ${y(149)}Q112 ${y(157)} 118 ${y(149)}Q124 ${y(157)} 130 ${y(149)}L102 ${y(186)}Q100 ${y(188.5)} 98 ${y(186)}Z" fill="#F7DFB8"/>
    <path d="M93.4 ${y(177.4)}Q100 ${y(181.5)} 106.6 ${y(177.4)}L102 ${y(186)}Q100 ${y(188.5)} 98 ${y(186)}Z" fill="#3D4441"/>`;
  const eye = (x, yy) => `<ellipse cx="${x}" cy="${yy}" rx="5.4" ry="6.6" fill="${INK}"/><circle cx="${x + 1.9}" cy="${yy - 2.4}" r="2.1" fill="#fff"/>`;
  const blush = `<ellipse cx="80" cy="${y(111)}" rx="5" ry="3" fill="#F38FB0" opacity=".75"/><ellipse cx="120" cy="${y(111)}" rx="5" ry="3" fill="#F38FB0" opacity=".75"/>`;
  const face = {
    happy: `${eye(89, 98)}${eye(111, 98)}${blush}<path d="M93 111Q100 118.5 107 111" stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    think: `<path d="M84 87Q89 84 94 87" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M106 89.5Q111 88 116 89.5" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="89" cy="99" rx="5.4" ry="6.6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><ellipse cx="111" cy="99" rx="5.4" ry="6.6" fill="#fff" stroke="${INK}" stroke-width="2.4"/><circle cx="91" cy="96.6" r="3" fill="${INK}"/><circle cx="113" cy="96.6" r="3" fill="${INK}"/>${blush}<path d="M95 114.5Q97.5 112 100 114.5T105 114.5" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cheer: `<path d="M83.5 ${y(99)}Q89 ${y(91)} 94.5 ${y(99)}M105.5 ${y(99)}Q111 ${y(91)} 116.5 ${y(99)}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>${blush}<path d="M90 ${y(107)}Q100 ${y(107)} 110 ${y(107)}Q109 ${y(121)} 100 ${y(121)}Q91 ${y(121)} 90 ${y(107)}Z" fill="${INK}"/><path d="M94.5 ${y(117.5)}Q100 ${y(112.5)} 105.5 ${y(117.5)}Q100 ${y(121)} 94.5 ${y(117.5)}Z" fill="#F27A9E"/>`,
  }[mood];
  const arm = (p, hx, hy) => `<path d="${p}" stroke="${JADE}" stroke-width="5.5" fill="none" stroke-linecap="round"/><circle cx="${hx}" cy="${hy}" r="5" fill="${JADE}"/>`;
  const arms = {
    happy: arm('M70 114Q57 112 54 98', 54, 96) + arm('M130 114Q143 120 147 108', 147.5, 106),
    think: arm('M130 117Q143 133 113 123', 111, 122) + arm('M70 118Q60 128 63 141', 63, 143) + `<text x="146" y="56" font-size="30" font-weight="900" fill="#B04A6F" font-family="Nunito, system-ui, sans-serif" transform="rotate(12 152 46)">?</text>`,
    cheer: arm(`M70 ${y(108)}Q55 ${y(96)} 52 ${y(74)}`, 52, y(71)) + arm(`M130 ${y(108)}Q145 ${y(96)} 148 ${y(74)}`, 148, y(71)) + star(52, 40, 7) + star(152, 46, 5.5) + star(140, 24, 4, '#F38FB0'),
  }[mood];
  const shadow = `<ellipse cx="100" cy="191" rx="${mood === 'cheer' ? 16 : 22}" ry="3.2" fill="${INK}" opacity=".1"/>`;
  return `<svg class="pencil ${mood}" viewBox="40 10 125 185" aria-hidden="true">${shadow}${mood === 'think' ? `<g transform="rotate(-8 100 110)">${body}${face}</g>` : body + face}${arms}</svg>`;
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
