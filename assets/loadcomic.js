// 数学 / 语文页切换页面时，超过 0.3 秒就弹出和首次打开一样的四格漫画（样式见 loadcomic.css）
const TPL = document.querySelector('#app > .li-load')?.outerHTML || '';
let el = null;
let open = 0;

export function loadStart() {
  if (!TPL || document.querySelector('#app > .li-load')) return () => {}; // 首次打开时页面里已经有一份
  open++;
  if (!el) {
    const box = document.createElement('div');
    box.innerHTML = TPL;
    el = box.firstElementChild;
    document.body.appendChild(el);
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--open <= 0) { open = 0; el?.remove(); el = null; }
  };
}
