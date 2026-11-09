// 加载时统一的样子：内容区原地换成灰色占位块（导航不动），顶部细进度条在走。
// 第一次打开：占位块直接写在各页 index.html 里（body 带 net-wait），页面画出来后去掉进度条。
// 站内换页：数据 0.3 秒内没回来，才换成占位块。
const SKELETON = `<div class="sk" role="status" aria-label="加载中">
  <div class="sk-b sk-h1"></div>
  <div class="sk-row"><div class="sk-b sk-card"></div><div class="sk-b sk-card"></div><div class="sk-b sk-card"></div></div>
  <div class="sk-grid"><div class="sk-b sk-big"></div><div class="sk-b sk-side"></div></div>
</div>`;

const first = document.getElementById('app');
if (first?.querySelector('.sk-first')) {
  new MutationObserver((_, o) => {
    if (!first.querySelector('.sk-first')) { document.body.classList.remove('net-wait'); o.disconnect(); }
  }).observe(first, { childList: true, subtree: true });
}

export function loadStart() {
  const app = document.getElementById('app');
  if (!app || app.querySelector('.sk-first')) return () => {}; // 第一次打开：占位块已经在了
  const timer = setTimeout(() => {
    const main = app.querySelector(':scope > main, :scope > .page');
    if (main && !main.querySelector(':scope > .sk')) { main.innerHTML = SKELETON; window.scrollTo(0, 0); }
  }, 300);
  return () => clearTimeout(timer);
}
