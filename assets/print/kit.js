// 全站统一的打印预览：点「打印」直接出 A4 预览，「调整」里改范围、版式和选项。
// 预览、打印、存 PDF 用同一份分好页的纸面：所见即所得。
//   电脑：主按钮「打印」，另有「存成 PDF」「发到手机」
//   手机：主按钮「存成 PDF」，另有「打印」
//   安卓微信（不能下载文件）：主按钮「去浏览器打开」，凭不用登录的打印链接在浏览器里打开
// 各科只管出内容：openPrint({ build(opts) → { blocks }, css, controls, ... })

import qrcode from './qrcode.js?v=20261111';

const PW = 794, PH = 1123;            // A4（96 dpi）
const PAD_T = 52, PAD_X = 64, PAD_B = 112;
const CW = PW - 2 * PAD_X;             // 正文宽度
const JADE = '#1D5C4D', INK = '#1E2B28', SOFT = '#5D6A65', LINE = '#DCD7CA';
const SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

export const PRINT_ICON = '<svg class="lp-ic" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>';
const IC = {
  x: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  dl: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>',
  phone: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  out: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  sl: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  back: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 纸面样式：预览、打印和 PDF 共用（PDF 里要整段带进 SVG 图片）
export const PAGE_CSS = `
.lp-page{width:${PW}px;height:${PH}px;box-sizing:border-box;position:relative;overflow:hidden;background:#fff;color:${INK};padding:${PAD_T}px ${PAD_X}px 0;font-family:${SANS};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lp-page *{box-sizing:border-box}
.lp-head{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:${SOFT}}
.lp-brand{display:flex;align-items:center;gap:8px;font-weight:700;color:${JADE}}
.lp-mark{width:22px;height:22px;border-radius:5px;background:${JADE};color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.lp-title{margin:14px 0 10px;font-size:27px;line-height:1.3;font-weight:800;color:${INK}}
.lp-info{display:flex;flex-wrap:wrap;gap:8px 26px;font-size:14px}
.lp-info span{display:flex;gap:6px;align-items:flex-end}
.lp-info i{display:inline-block;border-bottom:1px solid ${INK};height:1.1em}
.lp-rule{height:2px;background:${JADE};margin:12px 0 4px}
.lp-run{display:flex;justify-content:space-between;font-size:12px;color:${SOFT};border-bottom:1px solid ${LINE};padding-bottom:6px;margin-bottom:6px}
.lp-sheet{width:${CW}px}
.lp-b{display:flow-root}
.lp-foot{position:absolute;left:${PAD_X}px;right:${PAD_X}px;bottom:28px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #E6E1D6;padding-top:8px;font-size:12px;color:${SOFT}}
.lp-qr{display:flex;align-items:center;gap:10px}
.lp-qr svg{width:58px;height:58px;display:block}
.lp-qr div{display:flex;flex-direction:column;gap:2px}
.lp-qr b{font-size:13px;font-weight:600;color:${INK}}
@media print{.lp-out .lp-page{width:210mm;height:296mm;break-after:page;page-break-after:always}.lp-out .lp-page:last-child{break-after:auto;page-break-after:auto}}
`;
// 纸面放进隔离区（shadow DOM）：网站自己的样式（.card、h2、table…）影响不到纸面，预览、打印和 PDF 一个样
function isolated(css, links) {
  const host = document.createElement('div');
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = (links || []).map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('') + `<style>${css}</style>`;
  const ready = Promise.all([...sr.querySelectorAll('link')].map((l) => new Promise((r) => { l.onload = l.onerror = r; })));
  return { host, sr, ready };
}

const UI_CSS = `
.lp-entry{display:inline-flex;align-items:center;gap:6px}
.lp-entry .lp-ic{flex:none}
body.lp-open{overflow:hidden}
#lp{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;background:#EDEAE2;color:${INK};font-family:${SANS};color-scheme:light}
:where(#lp) button{font-family:inherit;cursor:pointer;color:inherit}
#lp button:focus-visible{outline:2px solid #B04A6F;outline-offset:2px}
.lp-top{flex:none;height:56px;padding:0 16px 0 6px;padding-top:env(safe-area-inset-top,0px);display:flex;align-items:center;gap:6px;background:#fff;border-bottom:1px solid #E2DDD2}
.lp-x{flex:none;height:36px;padding:0 14px 0 8px;margin-left:8px;border:1px solid #E2DDD2;background:#fff;border-radius:999px;display:flex;align-items:center;gap:2px;font-size:14px;color:inherit;text-decoration:none}.lp-x:hover{border-color:#1D5C4D;color:#1D5C4D}
.lp-tt{display:flex;flex-direction:column;min-width:0}
.lp-tt b{font-size:16px}
.lp-tt span{font-size:12px;color:${SOFT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-pg{margin-left:auto;font-size:13px;color:${SOFT};white-space:nowrap}
.lp-wx{flex:none;padding:9px 16px;background:#F6EFD9;color:#5A4A1C;font-size:13px}
.lp-main{flex:1;min-height:0;display:flex}
.lp-pv{flex:1;min-width:0;overflow:auto;padding:20px 16px 28px;display:flex;flex-wrap:wrap;gap:18px;justify-content:center;align-content:flex-start}
.lp-pw{flex:none;background:#fff;box-shadow:0 2px 10px rgba(30,43,40,.15);overflow:hidden}
.lp-msg{align-self:center;margin:60px auto;color:${SOFT};font-size:15px;text-align:center;line-height:1.7}
.lp-side{width:320px;flex:none;box-sizing:border-box;background:#fff;border-left:1px solid #E2DDD2;padding:20px;display:flex;flex-direction:column;gap:18px;overflow:auto}
.lp-ctls{display:flex;flex-direction:column;gap:18px}
.lp-lab{font-size:13px;color:${SOFT};margin-bottom:8px}
.lp-seg{display:grid;gap:4px;padding:4px;background:#F1EEE6;border-radius:12px}
.lp-seg button{min-height:40px;border:0;border-radius:9px;background:none;color:${INK};font-size:14px;font-weight:600;padding:4px 4px}
.lp-seg button[aria-pressed=true]{background:${JADE};color:#fff}
.lp-tgs{display:flex;flex-direction:column}
.lp-tg{min-height:50px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #EEEAE1;font-size:15px}
.lp-sw{position:relative;flex:none;width:46px;height:26px;border:0;border-radius:13px;padding:0;background:#BDB6A7;transition:background .15s}
.lp-sw i{position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.lp-sw[aria-pressed=true]{background:${JADE}}
.lp-sw[aria-pressed=true] i{left:22px}
.lp-rg{width:100%;min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;border:1px solid #CFC9BC;border-radius:12px;background:#fff;font-size:15px;text-align:left}
.lp-rg span:last-child{color:${SOFT};white-space:nowrap}
.lp-acts{margin-top:auto;display:flex;flex-direction:column;gap:10px}
.lp-acts .lp-n{font-size:13px;color:${SOFT}}
.lp-row{display:flex;gap:10px}
.lp-pri,.lp-sec{min-height:46px;border-radius:12px;font-size:15px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 12px}
.lp-pri{border:0;background:${JADE};color:#fff!important;font-weight:700}
.lp-sec{flex:1;border:1px solid #CFC9BC;background:#fff}
.lp-pri:disabled,.lp-sec:disabled{opacity:.55;cursor:default}
.lp-bot{flex:none;display:flex;gap:10px;padding:12px 16px;padding-bottom:calc(14px + env(safe-area-inset-bottom,0px));background:#fff;border-top:1px solid #E2DDD2}
.lp-bot .lp-pri{flex:1.4}
.lp-bot .lp-adj{flex:none}
.lp-ov{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;background:rgba(20,30,28,.45)}
.lp-shade{flex:1;min-height:60px;border:0;background:transparent}
.lp-sheet-ui{max-height:78%;overflow:auto;background:#fff;border-radius:18px 18px 0 0;padding:8px 20px;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:16px}
.lp-handle{align-self:center;width:40px;height:4px;border-radius:2px;background:#D6D0C3}
.lp-sh{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:17px;font-weight:700}
.lp-done{min-height:44px;border:0;background:none;color:${JADE}!important;font-size:16px;font-weight:700;padding:0 4px}
.lp-bk{min-height:44px;border:0;background:none;display:flex;align-items:center;gap:2px;font-size:16px;font-weight:700;padding:0}
.lp-ps{display:flex;flex-direction:column;gap:6px}
.lp-ps button{min-height:46px;display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border:1px solid #CFC9BC;border-radius:12px;background:#fff;font-size:15px;text-align:left}
.lp-ps button[aria-pressed=true]{border-color:${JADE};box-shadow:inset 0 0 0 1px ${JADE};color:${JADE}}
.lp-ps button span:last-child{color:${SOFT};font-size:13px}
.lp-cl{display:flex;flex-direction:column}
.lp-cl h4{margin:12px 0 4px;font-size:13px;color:${SOFT};font-weight:600}
.lp-cl label{display:flex;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid #EEEAE1;font-size:15px}
.lp-cl input{width:20px;height:20px;accent-color:${JADE};flex:none}
.lp-cl small{color:${SOFT};font-size:12px;margin-left:auto;text-align:right}
.lp-clh{display:flex;align-items:center;gap:10px;font-size:13px;color:${SOFT}}
.lp-clh button{border:0;background:none;color:${JADE}!important;font-size:14px;font-weight:600;min-height:36px;padding:0 4px}
.lp-note{font-size:13px;color:${SOFT};line-height:1.6}
.lp-link{word-break:break-all;user-select:all;-webkit-user-select:all;background:#F6F4EE;border:1px solid ${LINE};border-radius:8px;padding:8px 10px;font-size:13px}
.lp-modal{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,30,28,.45)}
.lp-box{width:min(420px,100%);background:#fff;border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:12px}
.lp-box h3{margin:0;font-size:17px}
#lp-out{display:none}
@media (min-width:900px){.lp-bot{display:none}.lp-pv{padding:28px 24px 36px;gap:24px}}
@media (max-width:899px){.lp-side{display:none}}
@media print{
  @page{size:A4;margin:0}
  html,body{background:#fff!important;margin:0!important;padding:0!important}
  body.lp-printing>*:not(#lp-out){display:none!important}
  body.lp-printing #lp-out{display:block!important}
}
`;

let cssDone = false;
function ensureCss() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'lp-css';
  st.textContent = PAGE_CSS + UI_CSS;
  document.head.appendChild(st);
}
ensureCss();

// ───────── 设备判断 ─────────
// 安卓、鸿蒙的微信 / 企业微信里不能下载文件（2026-11-03 实测：苹果微信能下载 PDF），要换到浏览器打开
export const needsBrowser = () => /MicroMessenger|wxwork/i.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);
const inWeChat = () => /MicroMessenger|wxwork/i.test(navigator.userAgent);
const isMobile = () => /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const wide = () => window.matchMedia('(min-width: 900px)').matches;

// ───────── 分页：内容拆成一块一块，一页放不下就换页；一块比一页还高就缩小放下 ─────────
// block：HTML 字符串，或 { html, page: true 另起一页, keep: true 和下一块放同一页 }
async function paginate(blocks, head, typeset, css, links) {
  const { host, sr, ready } = isolated(css, links);
  host.style.cssText = `position:fixed;left:-30000px;top:0;visibility:hidden;width:${PW}px`;
  const pg = document.createElement('div');
  pg.className = 'lp-page'; pg.style.height = 'auto';
  pg.innerHTML = `<div class="lp-hd">${head.first}</div><div class="lp-hr">${head.run}</div><div class="lp-sheet"></div>`;
  sr.appendChild(pg);
  document.body.appendChild(host);
  try {
    await ready;
    const sheet = sr.querySelector('.lp-sheet');
    const bs = blocks.filter(Boolean).map((b) => (typeof b === 'string' ? { html: b } : b));
    sheet.innerHTML = bs.map((b) => `<div class="lp-b">${b.html}</div>`).join('');
    if (typeset) await typeset(sheet);
    await Promise.all([...sheet.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    const nodes = [...sheet.children];
    const hs = nodes.map((n) => n.getBoundingClientRect().height);
    const h1 = PH - PAD_T - PAD_B - sr.querySelector('.lp-hd').getBoundingClientRect().height;
    const hN = PH - PAD_T - PAD_B - sr.querySelector('.lp-hr').getBoundingClientRect().height;
    const pages = [[]];
    let left = h1;
    const room = () => (pages.length === 1 ? h1 : hN);
    for (let i = 0; i < nodes.length; i++) {
      const b = bs[i], cur = pages[pages.length - 1];
      let need = hs[i];
      if (b.keep && i + 1 < nodes.length) need += Math.min(hs[i + 1], room());
      if (cur.length && (b.page || need > left + 0.5)) { pages.push([]); left = room(); }
      const n = nodes[i];
      if (hs[i] > left + 0.5) { // 一块比整页还高：缩小
        const f = left / hs[i];
        const w = document.createElement('div');
        w.className = 'lp-b';
        w.style.cssText = `height:${Math.floor(hs[i] * f)}px;overflow:hidden`;
        n.style.cssText = `width:${CW / f}px;transform:scale(${f});transform-origin:0 0`;
        w.appendChild(n);
        pages[pages.length - 1].push(w);
        left = 0;
      } else {
        pages[pages.length - 1].push(n);
        left -= hs[i];
      }
    }
    return pages;
  } finally { host.remove(); }
}

function buildPages(groups, head) {
  const n = groups.length;
  return groups.map((g, i) => {
    const pg = document.createElement('div');
    pg.className = 'lp-page';
    const left = head.qr ? `<div class="lp-qr">${head.qr}<div><b>${esc(head.qrText || '扫码回到网站')}</b><span>${esc(head.foot)}</span></div></div>` : `<span>${esc(head.foot)}</span>`;
    pg.innerHTML = `${i === 0 ? head.first : head.run}<div class="lp-sheet"></div><div class="lp-foot">${left}<span>第 ${i + 1} 页 / 共 ${n} 页</span></div>`;
    const sheet = pg.querySelector('.lp-sheet');
    g.forEach((node) => sheet.appendChild(node));
    return pg;
  });
}

// ───────── 存成 PDF：每页的 HTML 放进 SVG 的 foreignObject 画成图片，再拼成 PDF ─────────
const W = 1240, H = 1754; // A4 图片（150 dpi）
const loadImg = (src) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('img')); im.src = src; });
const isWebKit = () => /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(navigator.userAgent);
async function pageCanvases(pages, css) {
  const out = [];
  for (const pg of pages) {
    const wrap = document.createElement('div');
    wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrap.style.cssText = `width:${PW}px;height:${PH}px;background:#fff`;
    const st = document.createElement('style'); st.textContent = css; wrap.appendChild(st);
    wrap.appendChild(pg.cloneNode(true));
    const xml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${PW} ${PH}"><foreignObject x="0" y="0" width="${PW}" height="${PH}">${xml}</foreignObject></svg>`;
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    let img = await loadImg(src);
    if (isWebKit()) { // Safari 第一次画时字体和图片常常还没就绪：先画一次，等一下再重新加载
      const t = document.createElement('canvas'); t.width = 4; t.height = 4; t.getContext('2d').drawImage(img, 0, 0, 4, 4);
      await new Promise((r) => setTimeout(r, 250)); img = await loadImg(src);
    }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.getImageData(0, 0, 1, 1); // 画布被污染（个别浏览器）会在这里报错
    out.push(cv);
  }
  return out;
}
/** 不用任何库，自己拼一个 PDF：每页放一张 A4 图片 */
export function makePdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
  const n = pages.length, total = 3 + n * 3, PW_ = 595.28, PH_ = 841.89;
  offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + n + ' >>\nendobj\n');
  pages.forEach((cv, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    const bin = atob(cv.toDataURL('image/jpeg', 0.88).split(',')[1]), jpg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
    const content = 'q ' + PW_ + ' 0 0 ' + PH_ + ' 0 0 cm /Im0 Do Q';
    offs[pid] = len; push(pid + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW_ + ' ' + PH_ + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>\nendobj\n');
    offs[cid] = len; push(cid + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    offs[iid] = len; push(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
    push(jpg); push('\nendstream\nendobj\n');
  });
  const xref = len; let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (let id = 1; id < total; id++) x += String(offs[id]).padStart(10, '0') + ' 00000 n \n';
  push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

// 页脚二维码：扫码回到网站上对应的页面（回填答案、在线背诵、看解析…）
function qrSvg(url) {
  if (!url) return '';
  try {
    const q = qrcode(0, 'M');
    q.addData(new URL(url, location.origin).href);
    q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  } catch { return ''; }
}

// ───────── 打开预览 ─────────
let active = null;
export const closePrint = () => active?.close();

/**
 * cfg:
 *   name        顶栏「打印」下面的小字，如「必背古诗」（后面自动接「· N 题」）
 *   label       纸面右上角，如「语文 · 古诗文大会」
 *   title(o)    纸面大标题
 *   info        纸面标题下的填写栏，如 ['姓名','日期','用时','得分']；false 不要
 *   foot        纸面左下角，默认 learn-inside.com
 *   qr(o)       页脚二维码指向的网址（相对本站也行）；qrText 二维码旁边的一句话
 *   opts        初始选项（ids 是要打印的内容 id）
 *   controls    [{type:'range', label, presets:[{label, ids()}], items:[{id,label,sub,group}], max}
 *                {type:'seg', key, label, options:[[值, 文字]], show(o)}
 *                {type:'toggle', key, label, show(o)}]
 *   build(o)    → { blocks, count }（count：这次印了几题 / 几篇）
 *   unit        count 的单位，默认「题」
 *   css         各科纸面样式（写在 .lp-sheet 下面）
 *   typeset(el) 排版公式（数学）；pdfCss() 存 PDF 时额外要带的样式（如公式字体）
 *   link(o)     不用登录也能打开的打印链接（安卓微信去浏览器、发到手机）
 *   file        存 PDF 的文件名
 *   remember    记住版式和开关的本地存储键
 *   standalone  打印链接打开的独立页：没有关闭按钮；home 是「返回」去的地方
 */
export function openPrint(cfg) {
  active?.close(true);
  const o = Object.assign({}, cfg.opts);
  const keys = (cfg.controls || []).filter((c) => c.key && c.type !== 'range').map((c) => c.key);
  if (cfg.remember) { try { const s = JSON.parse(localStorage.getItem(cfg.remember) || '{}'); keys.forEach((k) => { if (k in s) o[k] = s[k]; }); } catch {} }
  Object.assign(o, cfg.force || {}); // 从特定入口进来：指定版式（如模拟比赛卡片 → 模拟题单）
  (cfg.controls || []).filter((c) => c.type === 'seg').forEach((c) => { if (!c.options.some(([v]) => v === o[c.key])) o[c.key] = c.options[0][0]; });
  const keep = () => { if (!cfg.remember) return; try { localStorage.setItem(cfg.remember, JSON.stringify(Object.fromEntries(keys.map((k) => [k, o[k]])))); } catch {} };

  const sheetCss = PAGE_CSS + (cfg.css || '');

  const root = document.createElement('div');
  root.id = 'lp';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '打印');
  document.body.appendChild(root);
  document.body.classList.add('lp-open');
  const wx = needsBrowser();
  const mobile = isMobile();

  let pages = [], count = 0, view = 'ctl', sheetOpen = false, pdf = null, linkUrl = null, building = 0, timer = 0;

  root.innerHTML = `<div class="lp-top">${cfg.standalone ? (cfg.home ? `<a class="lp-x" href="${esc(cfg.home)}">${IC.back}<span>返回</span></a>` : '<span style="width:10px"></span>') : `<button class="lp-x" data-a="close">${IC.back}<span>返回</span></button>`}
      <div class="lp-tt"><b>打印</b><span id="lp-sub"></span></div><span class="lp-pg" id="lp-pg"></span></div>
    ${wx ? '<div class="lp-wx">在微信里不能保存文件：点「去浏览器打开」，在浏览器里打印或存 PDF</div>' : ''}
    <div class="lp-main"><div class="lp-pv" id="lp-pv"><div class="lp-msg">正在排版…</div></div><div class="lp-side" id="lp-side"></div></div>
    <div class="lp-bot" id="lp-bot"></div><div id="lp-layer"></div>`;
  const $ = (id) => root.querySelector('#' + id);

  const visible = () => (cfg.controls || []).filter((c) => !c.show || c.show(o));
  const range = () => (cfg.controls || []).find((c) => c.type === 'range');
  const rangeText = () => {
    const r = range(); if (!r) return '';
    const p = (r.presets || []).find((x) => x.label === o.rangeLabel);
    return p ? p.label : `自己挑的 ${o.ids?.length || 0} ${cfg.unit || '题'}`;
  };
  const ctlHtml = () => visible().map((c) => {
    if (c.type === 'range') return `<div><div class="lp-lab">${esc(c.label || '范围')}</div><button class="lp-rg" data-a="range"><span>${esc(rangeText())}</span><span>${o.ids?.length || 0} ${cfg.unit || '题'} ›</span></button></div>`;
    if (c.type === 'seg') return `<div><div class="lp-lab">${esc(c.label)}</div><div class="lp-seg" style="grid-template-columns:repeat(${c.options.length},minmax(0,1fr))">${c.options.map(([v, l]) => `<button data-seg="${esc(c.key)}" data-v="${esc(v)}" aria-pressed="${o[c.key] === v}">${esc(l)}</button>`).join('')}</div></div>`;
    return null;
  }).filter(Boolean).join('') + (() => {
    const ts = visible().filter((c) => c.type === 'toggle');
    return ts.length ? `<div class="lp-tgs">${ts.map((c) => `<div class="lp-tg"><span>${esc(c.label)}</span><button class="lp-sw" data-tg="${esc(c.key)}" aria-pressed="${!!o[c.key]}" aria-label="${esc(c.label)}"><i></i></button></div>`).join('')}</div>` : '';
  })();

  // 范围：预设几种（今天的 / 全部 / 随机几题…）+ 自己挑
  const rangeHtml = () => {
    const r = range();
    const on = new Set(o.ids || []);
    const groups = [];
    (r.items || []).forEach((it) => { const g = it.group || ''; let x = groups.find((y) => y.g === g); if (!x) groups.push(x = { g, list: [] }); x.list.push(it); });
    return `<div class="lp-ps">${(r.presets || []).map((p, i) => `<button data-preset="${i}" aria-pressed="${o.rangeLabel === p.label}"><span>${esc(p.label)}</span><span>${p.ids().length} ${cfg.unit || '题'}</span></button>`).join('')}</div>
      ${r.items?.length ? `<div class="lp-clh"><span>自己挑${r.max ? `（最多 ${r.max} ${cfg.unit || '题'}）` : ''}</span><span style="margin-left:auto"></span><button data-a="all">全选</button><button data-a="none">清空</button></div>
      <div class="lp-cl">${groups.map((g) => `${g.g ? `<h4>${esc(g.g)}</h4>` : ''}${g.list.map((it) => `<label><input type="checkbox" data-id="${esc(it.id)}" ${on.has(it.id) ? 'checked' : ''}><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</label>`).join('')}`).join('')}</div>` : ''}`;
  };

  const actsHtml = (side) => {
    const n = pages.length ? `共 ${pages.length} 页 · A4` : '';
    const busy = !pages.length;
    const pdfLabel = pdf ? `保存 PDF（${pdf.pages} 页）` : '存成 PDF';
    if (wx) return side ? '' : `<button class="lp-sec lp-adj" data-a="adjust">${IC.sl}调整</button><button class="lp-pri" data-a="browser">${IC.out}去浏览器打开</button>`; // 只要链接，不用等排版
    if (side) {
      return `<div class="lp-acts"><span class="lp-n">${n}</span>
        ${mobile ? `<button class="lp-pri" data-a="pdf" ${busy ? 'disabled' : ''}>${IC.dl}${pdfLabel}</button><div class="lp-row"><button class="lp-sec" data-a="print" ${busy ? 'disabled' : ''}>${PRINT_ICON}打印</button></div>`
          : `<button class="lp-pri" data-a="print" ${busy ? 'disabled' : ''}>${PRINT_ICON}打印</button><div class="lp-row"><button class="lp-sec" data-a="pdf" ${busy ? 'disabled' : ''}>${IC.dl}${pdfLabel}</button>${cfg.link && !cfg.standalone ? `<button class="lp-sec" data-a="send" ${busy ? 'disabled' : ''}>${IC.phone}发到手机</button>` : ''}</div>`}</div>`;
    }
    return `<button class="lp-sec lp-adj" data-a="adjust">${IC.sl}调整</button>
      ${mobile ? `<button class="lp-sec" data-a="print" ${busy ? 'disabled' : ''}>打印</button><button class="lp-pri" data-a="pdf" ${busy ? 'disabled' : ''}>${IC.dl}${pdf ? '保存 PDF' : '存成 PDF'}</button>`
        : `<button class="lp-sec" data-a="pdf" ${busy ? 'disabled' : ''}>${pdf ? '保存 PDF' : '存成 PDF'}</button><button class="lp-pri" data-a="print" ${busy ? 'disabled' : ''}>${PRINT_ICON}打印</button>`}`;
  };

  function drawUi(light) {
    if (light && view === 'range') { // 正在挑范围：只更新页数和按钮，不重画列表（免得滚动位置跳回顶部）
      $('lp-sub').textContent = `${cfg.name || ''}${count ? ` · ${count} ${cfg.unit || '题'}` : ''}`;
      $('lp-pg').textContent = pages.length ? `共 ${pages.length} 页` : '';
      if (!wide()) $('lp-bot').innerHTML = actsHtml(false);
      return;
    }
    const hasCtl = (cfg.controls || []).length > 0;
    if (wide()) {
      $('lp-side').innerHTML = view === 'range' ? `<div class="lp-sh"><button class="lp-bk" data-a="back">${IC.back}范围</button><button class="lp-done" data-a="back">完成</button></div>${rangeHtml()}`
        : `${hasCtl ? `<div class="lp-ctls">${ctlHtml()}</div>` : ''}${actsHtml(true)}`;
      if (wx) $('lp-side').innerHTML += `<div class="lp-acts"><button class="lp-pri" data-a="browser">${IC.out}去浏览器打开</button></div>`;
      $('lp-layer').innerHTML = '';
    } else {
      $('lp-bot').innerHTML = actsHtml(false);
      const adj = root.querySelector('.lp-adj'); if (adj && !hasCtl) adj.hidden = true;
      $('lp-layer').innerHTML = sheetOpen ? `<div class="lp-ov"><button class="lp-shade" data-a="shut" aria-label="收起"></button><div class="lp-sheet-ui"><span class="lp-handle"></span>
        ${view === 'range' ? `<div class="lp-sh"><button class="lp-bk" data-a="back">${IC.back}范围</button><button class="lp-done" data-a="back">完成</button></div>${rangeHtml()}`
          : `<div class="lp-sh"><span>调整</span><button class="lp-done" data-a="shut">完成</button></div><div class="lp-ctls">${ctlHtml()}</div>`}</div></div>` : '';
    }
    $('lp-sub').textContent = `${cfg.name || ''}${count ? ` · ${count} ${cfg.unit || '题'}` : ''}`;
    $('lp-pg').textContent = pages.length ? `共 ${pages.length} 页` : '';
  }

  function fit() {
    const pv = $('lp-pv');
    const cw = pv.clientWidth - (wide() ? 48 : 32);
    const two = wide() && cw >= 2 * 360 + 24 && pages.length > 1;
    const w = Math.max(200, Math.min(two ? (cw - 24) / 2 : cw, two ? 460 : 560));
    const s = w / PW;
    pv.querySelectorAll('.lp-pw').forEach((x) => { x.style.width = `${Math.round(w)}px`; x.style.height = `${Math.round(PH * s)}px`; const pg = x.shadowRoot.querySelector('.lp-page'); pg.style.transform = `scale(${s})`; pg.style.transformOrigin = '0 0'; });
  }

  async function rebuild() {
    const my = ++building;
    pdf = null;
    const pv = $('lp-pv');
    if (!(o.ids?.length ?? 1)) { pages = []; count = 0; pv.innerHTML = '<div class="lp-msg">没有选内容</div>'; drawUi(true); return; }
    try {
      const r = await cfg.build(o);
      if (my !== building) return;
      count = r.count ?? 0;
      const title = typeof cfg.title === 'function' ? cfg.title(o) : cfg.title || '';
      const info = typeof cfg.info === 'function' ? cfg.info(o) : cfg.info;
      const head = {
        first: `<div class="lp-head"><div class="lp-brand"><span class="lp-mark">Li</span><span>learn-inside</span></div><span>${esc(cfg.label || '')}</span></div>
          <h1 class="lp-title">${esc(title)}</h1>${info?.length ? `<div class="lp-info">${info.map((t) => `<span>${esc(t)}<i style="width:${t === '姓名' ? 120 : t === '日期' ? 96 : 72}px"></i></span>`).join('')}</div>` : ''}<div class="lp-rule"></div>`,
        run: `<div class="lp-run"><span>${esc(title)}</span><span>learn-inside</span></div>`,
        foot: cfg.foot || 'learn-inside.com',
        qr: qrSvg(typeof cfg.qr === 'function' ? cfg.qr(o) : cfg.qr),
        qrText: typeof cfg.qrText === 'function' ? cfg.qrText(o) : cfg.qrText,
      };
      const groups = await paginate(r.blocks || [], head, cfg.typeset, sheetCss, cfg.links);
      if (my !== building) return;
      pages = buildPages(groups, head);
      pv.innerHTML = '';
      pages.forEach((pg) => { const { host, sr } = isolated(sheetCss, cfg.links); host.className = 'lp-pw'; sr.appendChild(pg); pv.appendChild(host); });
      if (!pages.length || !(r.blocks || []).length) pv.innerHTML = '<div class="lp-msg">没有可打印的内容</div>';
      fit();
    } catch (e) {
      console.error(e);
      if (my === building) { pages = []; pv.innerHTML = `<div class="lp-msg">${esc(e.message || '没能排版')}</div>`; }
    }
    drawUi(true);
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 120); };

  // ── 打印：把分好的页按原尺寸放进打印区 ──
  async function doPrint() {
    document.getElementById('lp-out')?.remove();
    const { host: out, sr, ready } = isolated(sheetCss, cfg.links);
    out.id = 'lp-out';
    const box = document.createElement('div'); box.className = 'lp-out';
    pages.forEach((pg) => { const c = pg.cloneNode(true); c.style.transform = ''; box.appendChild(c); });
    sr.appendChild(box);
    document.body.appendChild(out);
    if (cfg.links?.length) await Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]);
    document.body.classList.add('lp-printing');
    const done = () => { document.body.classList.remove('lp-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch {} // 打印结束（afterprint）或关掉预览时恢复页面
  }

  // ── 存成 PDF：先生成，再点一次保存（手机分享要在点击里调用） ──
  async function doPdf(btn) {
    if (pdf) return savePdf();
    const label = btn.innerHTML;
    btn.disabled = true; btn.textContent = '正在生成…';
    try {
      const css = PAGE_CSS + '\n' + (cfg.css || '') + '\n' + ((await cfg.pdfCss?.()) || '');
      const cvs = await pageCanvases(pages.map((p) => { const c = p.cloneNode(true); c.style.transform = ''; return c; }), css);
      pdf = { blob: makePdf(cvs), pages: cvs.length };
      drawUi();
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.innerHTML = label;
      modal('没能生成 PDF', '<p class="lp-note">请换 Safari 或 Chrome 再试，也可以点「打印」，在打印窗口里选「存储为 PDF」。</p>');
    }
  }
  function savePdf() {
    const d = new Date(), name = `${cfg.file || 'learn-inside'}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.pdf`;
    const f = typeof File === 'function' ? new File([pdf.blob], name, { type: 'application/pdf' }) : null;
    let canShare = false; try { canShare = !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch {}
    let inFrame = true; try { inFrame = window.self !== window.top; } catch {}
    if (canShare && mobile && !inFrame && !inWeChat()) {
      navigator.share({ files: [f], title: name }).catch((e) => { if (e?.name !== 'AbortError') download(name); });
      return;
    }
    download(name);
  }
  function download(name) {
    try {
      const u = URL.createObjectURL(pdf.blob), l = document.createElement('a');
      l.href = u; l.download = name; l.rel = 'noopener';
      document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch { modal('没能保存', '<p class="lp-note">这个浏览器不允许保存文件，请换 Safari 或 Chrome。</p>'); }
  }

  function modal(title, body) {
    $('lp-layer').innerHTML = `<div class="lp-modal"><div class="lp-box"><h3>${esc(title)}</h3>${body}<div class="lp-row"><button class="lp-sec" data-a="mclose">好</button></div></div></div>`;
  }
  async function getLink() {
    if (!linkUrl) linkUrl = await cfg.link(o);
    return linkUrl;
  }
  let restoreUrl = null;
  async function goBrowser() {
    try {
      const url = await getLink();
      // 微信右上角「在浏览器打开」打开的是当前网址，所以把打印链接换到地址栏
      if (!restoreUrl) restoreUrl = location.href;
      try { history.replaceState(history.state, '', url); } catch {}
      modal('去浏览器打开', `<p class="lp-note">点右上角 <b>「···」</b>，选 <b>「在浏览器打开」</b>，就能打印或存 PDF。链接 24 小时内有效。</p><div class="lp-link">${esc(url)}</div><button class="lp-sec" data-a="copy">复制链接</button>`);
    } catch (e) { modal('没能生成打印链接', `<p class="lp-note">${esc(e.message)}</p>`); }
  }
  async function sendPhone() {
    try {
      const url = await getLink();
      modal('发到手机', `<p class="lp-note">用手机打开这个链接，不用登录就能打印或存 PDF，24 小时内有效。</p><div class="lp-link">${esc(url)}</div><button class="lp-sec" data-a="copy">复制链接</button>`);
    } catch (e) { modal('没能生成打印链接', `<p class="lp-note">${esc(e.message)}</p>`); }
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button,[data-a]');
    if (!b || !root.contains(b)) return;
    const a = b.dataset.a;
    if (b.dataset.seg) { o[b.dataset.seg] = b.dataset.v; keep(); linkUrl = null; drawUi(); later(); return; }
    if (b.dataset.tg) { o[b.dataset.tg] = !o[b.dataset.tg]; keep(); linkUrl = null; drawUi(); later(); return; }
    if (b.dataset.preset) { const p = range().presets[+b.dataset.preset]; o.ids = p.ids(); o.rangeLabel = p.label; linkUrl = null; drawUi(); later(); return; }
    if (!a) return;
    if (a === 'close') return close();
    if (a === 'adjust') { sheetOpen = true; view = 'ctl'; return drawUi(); }
    if (a === 'shut') { sheetOpen = false; view = 'ctl'; return drawUi(); }
    if (a === 'range') { view = 'range'; return drawUi(); }
    if (a === 'back') { view = 'ctl'; return drawUi(); }
    if (a === 'all' || a === 'none') {
      const r = range(); const max = r.max || Infinity;
      o.ids = a === 'all' ? r.items.slice(0, max).map((x) => x.id) : [];
      o.rangeLabel = null; linkUrl = null; drawUi(); later(); return;
    }
    if (a === 'print') return doPrint();
    if (a === 'pdf') return doPdf(b);
    if (a === 'browser') return goBrowser();
    if (a === 'send') return sendPhone();
    if (a === 'mclose') { $('lp-layer').innerHTML = ''; return drawUi(); }
    if (a === 'copy') { try { await navigator.clipboard.writeText(linkUrl); b.textContent = '已复制'; } catch { b.textContent = '长按上面的链接复制'; } }
  });
  root.addEventListener('change', (e) => {
    const c = e.target.closest('input[data-id]'); if (!c) return;
    const r = range(); const set = new Set(o.ids || []);
    if (c.checked) { if (r.max && set.size >= r.max) { c.checked = false; return; } set.add(c.dataset.id); } else set.delete(c.dataset.id);
    o.ids = r.items.map((x) => x.id).filter((id) => set.has(id));
    o.rangeLabel = null; linkUrl = null;
    const rg = root.querySelector('.lp-rg span'); if (rg) rg.textContent = rangeText();
    root.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    later();
  });
  const onKey = (e) => { if (e.key === 'Escape' && !cfg.standalone) { if (sheetOpen) { sheetOpen = false; drawUi(); } else close(); } };
  const onResize = () => { drawUi(); fit(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  // 手机返回键：关掉预览，不离开页面
  let pushed = false;
  const onPop = () => { if (pushed) { pushed = false; close(true); } };
  if (!cfg.standalone) { try { history.pushState({ lp: 1 }, ''); pushed = true; window.addEventListener('popstate', onPop); } catch {} }

  function close(fromPop) {
    if (active !== api) return;
    active = null;
    clearTimeout(timer); building++;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('popstate', onPop);
    if (restoreUrl) { try { history.replaceState(history.state, '', restoreUrl); } catch {} }
    root.remove();
    document.getElementById('lp-out')?.remove();
    document.body.classList.remove('lp-open', 'lp-printing');
    if (pushed && !fromPop) { pushed = false; history.back(); }
    cfg.onClose?.();
  }
  const api = { close };
  active = api;
  drawUi();
  rebuild();
  return api;
}

// 小工具：随机选 n 个（打乱顺序后取前 n 个）
export const pickRandom = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
