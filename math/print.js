// 错题本打印：练习单预览 → 打印 / 存成 PDF。
// 做法照《飞花令练习馆》和学习页模板：先出全屏预览（不开新窗口），手机上 window.print() 常常没反应，所以另给「存成 PDF」。
// 和学习页不同的地方：真题里有 KaTeX 公式和 SVG / 图片，不能逐字画到 canvas 上。
// 这里把练习单按题切成 A4 页，每页的 HTML（连同样式和内嵌的 KaTeX 字体）放进 SVG 的 foreignObject 画成图片，再拼成 PDF。

const W = 1240, H = 1754, M = 96;           // A4 图片（150 dpi）和页边距
const CSS_W = 720;                           // 练习单排版宽度（CSS 像素）
const SCALE = (W - 2 * M) / CSS_W;
const PAGE_CSS_H = Math.floor((H - 2 * M - 40) / SCALE); // 每页内容高度（底部留页码）
const JADE = '#1D5C4D', PLUM = '#B04A6F', INK = '#1E2B28', SOFT = '#5D6A65', LINE = '#DCD7CA';

export const SHEET_CSS = `.sheet{font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;font-size:12pt;line-height:1.6;color:${INK};background:#fff;max-width:${CSS_W}px;margin:0 auto}
.sheet .head{display:flex;justify-content:space-between;align-items:flex-end;gap:6px 16px;flex-wrap:wrap;border-bottom:2px solid ${JADE};padding-bottom:8px;margin-bottom:4px}
.sheet h1{font-family:"Songti SC","STSong","Noto Serif SC","Noto Serif CJK SC","SimSun",serif;font-weight:600;font-size:21pt;line-height:1.3;letter-spacing:.12em;margin:0;display:block;color:${INK}}
.sheet .head span{font-size:10.5pt;color:${SOFT}}
.sheet .it{display:flex;gap:4px;padding:10px 0 12px;border-bottom:1px dashed ${LINE};break-inside:avoid;page-break-inside:avoid}
.sheet .sn{flex:none;min-width:2em;color:${JADE};font-weight:800}
.sheet .sq{flex:1;min-width:0}
.sheet .src{display:block;font-size:9pt;color:${SOFT};margin-bottom:2px}
.sheet .stx{font-family:"Times New Roman","Songti SC","STSong","Noto Serif CJK SC",serif;font-size:12.5pt;line-height:1.65;overflow-wrap:anywhere}
.sheet .stx .zh,.sheet .ai .zh{margin-top:4px;padding-top:0;border-top:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;font-size:11pt;color:#3A4743}
.sheet .fg{display:flex;flex-direction:column;align-items:center;gap:6px;margin:8px 0 2px;color:${INK}}
.sheet .fg svg{width:min(260px,100%);height:auto}
.sheet .fg img{max-width:min(320px,100%);height:auto;display:block}
.sheet .op{display:flex;flex-wrap:wrap;gap:3px 2.2em;margin-top:6px;font-family:"Times New Roman","Songti SC","Noto Serif CJK SC",serif;font-size:12pt;color:#3A4743}
.sheet .op b{font-family:-apple-system,"PingFang SC",sans-serif;font-weight:700;color:${JADE};margin-right:.35em}
.sheet .op .zi{color:${SOFT};font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif;font-size:10pt;margin-left:.4em}
.sheet .op.figs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px}
.sheet .op.figs span{display:flex;gap:4px;align-items:flex-start}
.sheet .op.figs svg{width:100%;max-width:170px;height:auto;display:block}
.sheet .op.figs img{max-width:100%;height:auto;display:block}
.sheet .work{height:120px}
.sheet .ah{break-before:page;page-break-before:always;border-bottom:2px solid ${JADE};padding-bottom:6px;margin:28px 0 4px}
.sheet .ah h1{font-size:17pt}
.sheet .ai{display:flex;gap:4px;padding:7px 0;border-bottom:1px dashed ${LINE};font-size:10.5pt;line-height:1.6;break-inside:avoid;page-break-inside:avoid}
.sheet .ai .src{display:inline;margin:0 .8em 0 0}
.sheet .ai .key{color:${PLUM};font-weight:800;font-size:12pt;margin-right:.8em}
.sheet .ai .kp{color:${SOFT};font-size:9.5pt}
.sheet .ai .sol{margin-top:2px;overflow-wrap:anywhere}
.sheet .katex{font-size:1.05em}`;

/** 一道错题在纸上的样子：预览和 PDF 共用同一份 HTML */
function itemHtml(it, i, h, space) {
  const ks = Object.keys(it.choices);
  const figs = ks.every((k) => h.isFig(it.choices[k]));
  const opt = (k) => {
    const en = it.choices[k];
    if (figs || h.isFig(en)) return `<span><b>(${k})</b>${en}</span>`;
    const zh = it.choices_zh?.[k], L = h.lang();
    const txt = !zh || zh === en || L === 'en' ? h.rich(en) : L === 'zh' ? h.rich(zh) : `${h.rich(en)}<span class="zi">${h.rich(zh)}</span>`;
    return `<span><b>(${k})</b>${txt}</span>`;
  };
  return `<div class="it blk"><span class="sn">${i + 1}.</span><div class="sq">
    <span class="src">${h.esc(it.label)}</span>
    <div class="stx">${h.stemHtml(it)}</div>
    ${it.figure ? `<div class="fg">${it.figure}</div>` : ''}
    <div class="op ${figs ? 'figs' : ''}">${ks.map(opt).join('')}</div>
    ${space ? '<div class="work"></div>' : ''}
  </div></div>`;
}
function answerHtml(it, i, h) {
  const kp = (it.types?.length ? it.types : (it.kps || []).filter((k) => k.primary).map((k) => k.name)).join('、');
  return `<div class="ai blk"><span class="sn">${i + 1}.</span><div class="sq">
    <span class="key">${h.esc(it.answer)}</span><span class="src">${h.esc(it.label)}</span>${kp ? `<span class="kp">考点：${h.esc(kp)}</span>` : ''}
    ${it.basic ? `<div class="sol">${h.rich(it.basic)}</div>` : ''}
  </div></div>`;
}
export function sheetInner({ title, sub, items, withAns, space }, h) {
  return `<div class="head blk"><div><h1>${h.esc(title)}</h1><span>${h.esc(sub)}</span></div><span>姓名：________　日期：________　得分：________</span></div>
    ${items.map((it, i) => itemHtml(it, i, h, space)).join('')}
    ${withAns ? `<div class="ah blk newpage"><h1>答案和解题思路</h1></div>${items.map((it, i) => answerHtml(it, i, h)).join('')}` : ''}`;
}

// ───────── 画成 A4 图片 ─────────
let katexCss = null;
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
/** KaTeX 样式，字体换成内嵌的 data: 地址（SVG 图片里不能加载外部文件） */
async function embeddedKatexCss() {
  if (katexCss) return katexCss;
  const href = document.querySelector('link[href*="katex"]')?.href || new URL('vendor/katex/katex.min.css', location.href).href;
  let css = await (await fetch(href)).text();
  const names = [...new Set([...css.matchAll(/url\((fonts\/[^)]+?\.woff2)\)/g)].map((m) => m[1]))];
  const data = {};
  await Promise.all(names.map(async (n) => { try { data[n] = b64(await (await fetch(new URL(n, href))).arrayBuffer()); } catch {} }));
  css = css.replace(/src:\s*url\((fonts\/[^)]+?\.woff2)\)\s*format\("woff2"\)[^;}]*/g, (_, n) => (data[n] ? `src:url(data:font/woff2;base64,${data[n]}) format("woff2")` : 'src:local("Times New Roman")'));
  return (katexCss = css);
}
const loadImg = (src) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('img')); im.src = src; });
const isWebKit = () => /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(navigator.userAgent);

/** 把预览里的练习单（已经排好公式）切成 A4 页，返回 canvas 列表 */
export async function sheetCanvases(sheetEl) {
  const css = SHEET_CSS + '\n' + (await embeddedKatexCss());
  // 离屏按固定宽度重新排版，一页一页往里放题，放不下就换页
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${CSS_W}px;background:#fff;visibility:hidden`;
  document.body.appendChild(host);
  const pages = [];
  try {
    let page = null;
    const newPage = () => { page = document.createElement('div'); page.className = 'sheet'; page.style.cssText = `width:${CSS_W}px;max-width:none;margin:0;padding:1px 0`; host.appendChild(page); pages.push(page); };
    newPage();
    for (const b of sheetEl.querySelectorAll(':scope > .blk')) {
      const c = b.cloneNode(true);
      if (c.classList.contains('newpage')) { c.style.marginTop = '0'; if (page.childElementCount) newPage(); }
      page.appendChild(c);
      if (page.offsetHeight > PAGE_CSS_H && page.childElementCount > 1) { page.removeChild(c); newPage(); page.appendChild(c); }
    }
    await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      const hCss = Math.min(pg.offsetHeight, PAGE_CSS_H * 3);
      // 一题比一页还长（很少见）：缩小到一页放下
      const fit = Math.min(1, PAGE_CSS_H / hCss);
      const wrap = document.createElement('div');
      wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrap.style.cssText = `width:${CSS_W}px;background:#fff`;
      const st = document.createElement('style'); st.textContent = css; wrap.appendChild(st);
      const copy = pg.cloneNode(true); copy.style.visibility = 'visible'; wrap.appendChild(copy);
      const xml = new XMLSerializer().serializeToString(wrap);
      const pw = Math.round(CSS_W * SCALE * fit), ph = Math.round(hCss * SCALE * fit);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${CSS_W} ${hCss}"><foreignObject x="0" y="0" width="${CSS_W}" height="${hCss}">${xml}</foreignObject></svg>`;
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      let img = await loadImg(src);
      if (isWebKit()) { // Safari 第一次画时字体和图片常常还没就绪：先画一次，等一下再重新加载
        const t = document.createElement('canvas'); t.width = 4; t.height = 4; t.getContext('2d').drawImage(img, 0, 0, 4, 4);
        await new Promise((r) => setTimeout(r, 250)); img = await loadImg(src);
      }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, M + (W - 2 * M - pw) / 2, M, pw, ph);
      ctx.font = '20px -apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif'; ctx.fillStyle = SOFT;
      ctx.textAlign = 'left'; ctx.fillText('learn-inside.com/math', M, H - M / 2);
      ctx.textAlign = 'right'; ctx.fillText(`第 ${i + 1} / ${pages.length} 页`, W - M, H - M / 2);
      cv.getContext('2d').getImageData(0, 0, 1, 1); // 画布被污染（个别浏览器）会在这里报错
      out.push(cv);
    }
    return out;
  } finally { host.remove(); }
}

/** 不用任何库，自己拼一个 PDF：每页放一张 A4 图片（和学习页模板一致） */
export function makePdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
  const n = pages.length, total = 3 + n * 3, PW = 595.28, PH = 841.89;
  offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offs[2] = len; push('2 0 obj\n<< /Type /Pages /Kids [' + pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + n + ' >>\nendobj\n');
  pages.forEach((cv, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    const bin = atob(cv.toDataURL('image/jpeg', 0.88).split(',')[1]), jpg = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) jpg[k] = bin.charCodeAt(k);
    const content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
    offs[pid] = len; push(pid + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>\nendobj\n');
    offs[cid] = len; push(cid + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    offs[iid] = len; push(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
    push(jpg); push('\nendstream\nendobj\n');
  });
  const xref = len; let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (let id = 1; id < total; id++) x += String(offs[id]).padStart(10, '0') + ' 00000 n \n';
  push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

// ───────── 预览和保存 ─────────
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function area() {
  let a = document.getElementById('printArea');
  if (!a) { a = el('div'); a.id = 'printArea'; a.hidden = true; document.body.appendChild(a); }
  return a;
}
export function closePreview() {
  if (restoreUrl) { try { history.replaceState(null, '', restoreUrl); } catch {} restoreUrl = null; }
  const a = document.getElementById('printArea');
  if (a) { a.hidden = true; a.innerHTML = ''; }
  document.body.classList.remove('printing');
}

/**
 * 打开打印预览。opts: { title, sub, items, withAns, space, file, onClose }
 * h：渲染工具 { esc, rich, stemHtml, isFig, lang, typeset }
 */
export function openPreview(opts, h) {
  const a = area();
  a.innerHTML = `<div class="pv-bar"><button class="btn plum" id="pvPrint">打印</button><button class="btn plum" id="pvPdf">存成 PDF</button><button class="btn ghost" id="pvClose">返回</button>
    <div class="pv-tip" id="pvTip">点「打印」没反应时，点「存成 PDF」保存文件，再拿去打印。</div></div>
    <div class="pv-doc"><div class="sheet" id="pvSheet">${sheetInner(opts, h)}</div></div>`;
  a.hidden = false; a.scrollTop = 0; document.body.classList.add('printing');
  const sheet = a.querySelector('#pvSheet'), tip = a.querySelector('#pvTip');
  h.typeset(sheet);
  a.querySelector('#pvClose').onclick = () => { closePreview(); opts.onClose?.(); };
  a.querySelector('#pvPrint').onclick = () => { try { window.print(); } catch {} };
  const pdfBtn = a.querySelector('#pvPdf');
  pdfBtn.onclick = async () => {
    if (opts.link && needsBrowser()) return linkFlow(tip, opts);
    pdfBtn.disabled = true; pdfBtn.textContent = '正在生成……';
    tip.textContent = `正在把 ${opts.items.length} 道题排成 A4 页，题多的话要等一会儿。`;
    let canvases, blob;
    try { canvases = await sheetCanvases(sheet); blob = makePdf(canvases); }
    catch (e) {
      console.error(e);
      tip.textContent = '这个浏览器生成 PDF 没有成功。可以点「打印」，在打印设置里选「存储为 PDF」；或者换 Safari、Chrome 再试。';
      pdfBtn.disabled = false; pdfBtn.textContent = '存成 PDF'; return;
    }
    saveOptions({ tip, canvases, blob, title: opts.title, file: opts.file });
    pdfBtn.disabled = false; pdfBtn.textContent = '存成 PDF';
  };
}

// 安卓、鸿蒙的微信 / 企业微信里不能下载文件（苹果微信实测可以），要换到手机浏览器打开再存
export const needsBrowser = () => /MicroMessenger|wxwork/i.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent);
let restoreUrl = null;
async function linkFlow(tip, opts) {
  tip.textContent = '正在生成打印链接……';
  let url;
  try { url = await opts.link(); }
  catch (e) { tip.textContent = `没能生成打印链接：${e.message}`; return; }
  // 微信右上角「在浏览器打开」打开的是当前网址，所以把打印链接换到地址栏
  if (!restoreUrl) restoreUrl = location.href;
  try { history.replaceState(null, '', url); } catch {}
  tip.innerHTML = '';
  const head = el('div'); head.innerHTML = '微信里不能直接保存文件。请点右上角 <b>「···」</b>，选 <b>「在浏览器打开」</b>，在浏览器里点「存成 PDF」就能保存。';
  const box = el('div', 'pv-save'), note = el('div', null, '这个链接 24 小时内有效，不用登录就能打开，请不要转发给不认识的人。');
  const cp = el('button', 'btn ghost', '复制链接');
  const show = () => { if (!box.querySelector('.pv-link')) box.appendChild(el('div', 'pv-link', url)); cp.textContent = '长按上面的链接复制'; };
  cp.onclick = async () => { try { await navigator.clipboard.writeText(url); cp.textContent = '已复制，粘贴到手机浏览器打开'; } catch { show(); } };
  box.appendChild(cp);
  tip.append(head, box, note);
}

/** 生成 PDF 后按设备给保存办法：手机能分享文件就用系统分享，其他一律直接下载 PDF（不用图片兜底） */
function saveOptions({ tip, canvases, blob, title, file }) {
  const pages = canvases.length;
  const name = `${title}.pdf`;
  const f = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
  let canShare = false; try { canShare = !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch {}
  const isMobile = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  let inFrame = true; try { inFrame = window.self !== window.top; } catch {}
  tip.innerHTML = '';
  const head = el('div', null, `已生成 ${pages} 页 PDF：`), box = el('div', 'pv-save'), note = el('div');
  const d0 = new Date(), dlName = `${file}-${d0.getFullYear()}${String(d0.getMonth() + 1).padStart(2, '0')}${String(d0.getDate()).padStart(2, '0')}.pdf`;
  const shareBtn = (cls) => { const b = el('button', 'btn ' + cls, '分享 / 存到本地');
    b.onclick = async () => { try { await navigator.share({ files: [f], title }); } catch (e) { if (e?.name !== 'AbortError') b.textContent = '这个浏览器不能分享文件'; } }; return b; };
  const saveBtn = (cls) => { const b = el('button', 'btn ' + cls, '保存到本地');
    b.onclick = () => { try { const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = dlName; l.rel = 'noopener';
      document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
      note.textContent = `已开始下载「${dlName}」，在浏览器的下载列表或「下载」文件夹里可以找到。没看到的话，可能是浏览器拦截了下载。`; }
    catch { note.textContent = '这个浏览器不允许保存文件。'; } }; return b; };
  if (canShare && isMobile && !inFrame) {
    box.appendChild(shareBtn('plum'));
    note.textContent = '点「分享 / 存到本地」，可以选「存储到文件」、发到微信，或直接选「打印」。';
  } else {
    // 电脑、微信（实测苹果微信能下载）和其他不能分享文件的浏览器：直接下载 PDF
    box.appendChild(saveBtn('plum'));
    const iosWx = /MicroMessenger|wxwork/i.test(navigator.userAgent) && /iPhone|iPad|iPod/.test(navigator.userAgent);
    note.textContent = iosWx
      ? '点「保存到本地」会打开 PDF 预览，再点右上角的菜单，就可以保存到手机、发给别人或打印。'
      : isMobile
      ? '点「保存到本地」保存 PDF。如果出现 PDF 预览，可以从右上角的菜单保存到手机、发给别人或打印。'
      : '点「保存到本地」，PDF 会下载到电脑的「下载」文件夹，打开后就可以打印。';
  }
  tip.append(head, box, note);
}
