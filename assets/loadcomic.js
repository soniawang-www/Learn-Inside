// 数学 / 语文页在站内换页时：数据 0.3 秒内没回来，内容区原地换成灰色骨架（导航不动，顶部细进度条照常走）。
// 第一次打开网站时的圆形漫画写在各页 index.html 里，不经过这里。
const SKELETON = `<div class="sk" role="status" aria-label="加载中">
  <div class="sk-b sk-h1"></div>
  <div class="sk-row"><div class="sk-b sk-card"></div><div class="sk-b sk-card"></div><div class="sk-b sk-card"></div></div>
  <div class="sk-grid"><div class="sk-b sk-big"></div><div class="sk-b sk-side"></div></div>
</div>`;

export function loadStart() {
  const app = document.getElementById('app');
  if (!app || app.querySelector(':scope > .li-load')) return () => {}; // 第一次打开：已经有漫画了
  const timer = setTimeout(() => {
    const main = app.querySelector(':scope > main, :scope > .page');
    if (main && !main.querySelector(':scope > .sk')) { main.innerHTML = SKELETON; window.scrollTo(0, 0); }
  }, 300);
  return () => clearTimeout(timer);
}
