// 数学、语文、账号三个页面共用的左侧导航（网站首页本身就是导览，不用它）
// 电脑：左侧栏，可收起成图标窄条（记在 localStorage）；手机：左上角菜单按钮，点开从左边滑出
// 用法：sideNav({ section: 'math' | 'chinese' | 'account', sub: [[href, 名称, 图标, 是否当前]], who: { name, note } })
//       返回 HTML，放在页面最前面；收起 / 展开 / 抽屉的点击由本文件统一处理

const P = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/>',
  math: '<path d="M5 7h6M8 4v6M14 7h5M5 16l5 5M10 16l-5 5M14 17h5M14 20h5"/>',
  chinese: '<path d="M5 6h14M12 3v18M7 10l-2 5M17 10l2 5M8 18h8"/>',
  account: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5"/>',
  chat: '<path d="M5 6.5h14v9H10l-4 3.5v-3.5H5z"/><path d="M9 11h6"/>',
  exam: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  graph: '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 7h8M7 9l4 7M17 9l-4 7"/>',
  mistakes: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M10 10l4 4M14 10l-4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fold: '<path d="M14 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
};
const ic = (k) => `<svg class="sn-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[k] || ''}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOGO = '<svg viewBox="0 0 120 120" width="28" height="28" aria-hidden="true"><rect width="120" height="120" rx="30" fill="#2E8B74"/><path d="M40 32V84H86" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M64 58V68" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="64" cy="42" r="6.5" fill="#F29BBB"/></svg>';
const NAMES = { math: '数学', chinese: '语文', account: '账号' };

export function sideNav({ section = 'math', sub = [], who = null } = {}) {
  const item = (href, name, icon, on, cls = '') => `<a class="${cls}${on ? ' on' : ''}" href="${href}" title="${esc(name)}">${ic(icon)}<span>${esc(name)}</span></a>`;
  const subs = (s) => (section === s && sub.length ? `<div class="sn-sub">${sub.map(([h, n, i, on]) => item(h, n, i, on)).join('')}</div>` : '');
  const nav = [
    item('/', '首页', 'home', false),
    item('/math/', '数学', 'math', section === 'math' && !sub.some((x) => x[3])), subs('math'),
    item('/chinese/', '语文', 'chinese', section === 'chinese' && !sub.some((x) => x[3])), subs('chinese'),
    item('/account/', '账号', 'account', section === 'account'),
  ].join('');
  const name = who?.name ? esc(who.name) : '登录 / 注册';
  return `<aside class="side" aria-label="导航">
    <div class="sn-top"><a class="sn-logo" href="/" title="learn-inside 首页">${LOGO}<span>learn-inside</span></a>
      <button class="sn-fold" type="button" data-sidefold aria-label="收起导航" title="收起 / 展开">${ic('fold')}</button>
      <button class="sn-close" type="button" data-sideclose aria-label="关闭导航">${ic('close')}</button></div>
    <nav class="sn-nav">${nav}</nav>
    <a class="sn-help" href="javascript:" data-support title="联系客服">${ic('chat')}<span>联系客服</span></a>
    <a class="sn-who" href="/account/" title="${name}"><i class="sn-av">${esc((who?.name || '我').slice(0, 1))}</i><span><b>${name}</b>${who?.note ? `<small>${esc(who.note)}</small>` : ''}</span></a>
  </aside>
  <header class="sn-bar"><button class="sn-menu" type="button" data-sideopen aria-label="打开导航">${ic('menu')}</button>
    <a class="sn-logo" href="/">${LOGO}<b>${NAMES[section] || ''}</b></a></header>
  <div class="sn-mask" data-sideclose></div>`;
}

// 收起状态记在浏览器里；只绑一次（页面每次重绘都会重新生成导航 HTML）
const MINI = 'li.side.mini';
try { if (localStorage.getItem(MINI) === '1') document.documentElement.classList.add('side-mini'); } catch {}
if (!window.__liSideBound) {
  window.__liSideBound = true;
  document.addEventListener('click', (e) => {
    const h = document.documentElement;
    if (e.target.closest('[data-sidefold]')) {
      const on = h.classList.toggle('side-mini');
      try { localStorage.setItem(MINI, on ? '1' : '0'); } catch {}
    } else if (e.target.closest('[data-sideopen]')) h.classList.add('side-open');
    else if (e.target.closest('[data-sideclose]') || e.target.closest('.side a[href]')) h.classList.remove('side-open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.documentElement.classList.remove('side-open'); });
  window.addEventListener('hashchange', () => document.documentElement.classList.remove('side-open'));
}
