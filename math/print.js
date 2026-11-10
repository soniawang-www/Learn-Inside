// 数学打印的纸面：整套试卷（纸笔做）和错题练习单，放进统一打印预览（/assets/print/kit.js）。
// 真题里有 KaTeX 公式和 SVG 图：预览和打印用页面里的 KaTeX 样式，存 PDF 时把公式字体内嵌进去。

const JADE = '#1D5C4D', PLUM = '#B04A6F', INK = '#1E2B28', SOFT = '#5D6A65', LINE = '#DCD7CA';

export const PRINT_CSS = `.lp-sheet{font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;font-size:12pt;line-height:1.6;color:${INK}}
.lp-sheet .it{display:flex;gap:4px;padding:10px 0 12px;border-bottom:1px dashed ${LINE};break-inside:avoid;page-break-inside:avoid}
.lp-sheet .sn{flex:none;min-width:2em;color:${JADE};font-weight:800}
.lp-sheet .sq{flex:1;min-width:0}
.lp-sheet .src{display:block;font-size:9pt;color:${SOFT};margin-bottom:2px}
.lp-sheet .stx{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif;font-size:12.5pt;line-height:1.65;overflow-wrap:anywhere}
.lp-sheet .stx .zh,.lp-sheet .ai .zh{margin-top:4px;padding-top:0;border-top:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;font-size:11pt;color:#3A4743}
.lp-sheet .fg{display:flex;flex-direction:column;align-items:center;gap:6px;margin:8px 0 2px;color:${INK}}
.lp-sheet .fg svg{width:min(260px,100%);height:auto}
.lp-sheet .fg img{max-width:min(320px,100%);height:auto;display:block}
.lp-sheet .op{display:flex;flex-wrap:wrap;gap:3px 2.2em;margin-top:6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif;font-size:12pt;color:#3A4743}
.lp-sheet .op b{font-family:-apple-system,"PingFang SC",sans-serif;font-weight:700;color:${JADE};margin-right:.35em}
.lp-sheet .op .zi{color:${SOFT};font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif;font-size:10pt;margin-left:.4em}
.lp-sheet .op.figs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 14px}
.lp-sheet .op.figs span{display:flex;gap:4px;align-items:flex-start}
.lp-sheet .op.figs svg{width:100%;max-width:170px;height:auto;display:block}
.lp-sheet .op.figs img{max-width:100%;height:auto;display:block}
.lp-sheet .work{height:120px}
.lp-sheet .fa{margin-top:8px;font-size:11.5pt;color:#3A4743;display:flex;align-items:flex-end;gap:4px}
.lp-sheet .fa i{display:inline-block;width:12em;border-bottom:1px solid ${INK};height:1.2em}
.lp-sheet .ah{border-bottom:2px solid ${JADE};padding-bottom:6px;margin:6px 0 4px}
.lp-sheet .ah h1{font-size:17pt;margin:0}
.lp-sheet .ai{display:flex;gap:4px;padding:7px 0;border-bottom:1px dashed ${LINE};font-size:10.5pt;line-height:1.6;break-inside:avoid;page-break-inside:avoid}
.lp-sheet .ai .src{display:inline;margin:0 .8em 0 0}
.lp-sheet .ai .key{color:${PLUM};font-weight:800;font-size:12pt;margin-right:.8em}
.lp-sheet .ai .kp{color:${SOFT};font-size:9.5pt}
.lp-sheet .ai .sol{margin-top:2px;overflow-wrap:anywhere}
.lp-sheet .katex{font-size:1.05em}`;

/** 一道错题在纸上的样子：预览和 PDF 共用同一份 HTML */
function itemHtml(it, i, h, space) {
  const ks = Object.keys(it.choices);
  const figs = ks.length > 0 && ks.every((k) => h.isFig(it.choices[k]));
  const opt = (k) => {
    const en = it.choices[k];
    if (figs || h.isFig(en)) return `<span><b>(${k})</b>${en}</span>`;
    const zh = it.choices_zh?.[k], L = h.lang();
    const txt = !zh || zh === en || L === 'en' ? h.rich(en) : L === 'zh' ? h.rich(zh) : `${h.rich(en)}<span class="zi">${h.rich(zh)}</span>`;
    return `<span><b>(${k})</b>${txt}</span>`;
  };
  return `<div class="it blk"><span class="sn">${it.no ?? i + 1}.</span><div class="sq">
    ${it.label ? `<span class="src">${h.esc(it.label)}</span>` : ''}
    <div class="stx">${h.stemHtml(it)}</div>
    ${it.figure ? `<div class="fg">${it.figure}</div>` : ''}
    ${ks.length ? `<div class="op ${figs ? 'figs' : ''}">${ks.map(opt).join('')}</div>` : '<div class="fa">答：<i></i></div>'}
    ${space ? '<div class="work"></div>' : ''}
  </div></div>`;
}
function answerHtml(it, i, h) {
  const kp = (it.types?.length ? it.types : (it.kps || []).filter((k) => k.primary).map((k) => k.name)).join('、');
  return `<div class="ai blk"><span class="sn">${it.no ?? i + 1}.</span><div class="sq">
    <span class="key">${h.esc(it.answer)}</span><span class="src">${h.esc(it.label)}</span>${kp ? `<span class="kp">考点：${h.esc(kp)}</span>` : ''}
    ${it.basic ? `<div class="sol">${h.rich(it.basic)}</div>` : ''}
  </div></div>`;
}
/** 拆成分页用的块：每题一块；附答案时另起一页 */
export function sheetBlocks({ items, withAns, space }, h) {
  const out = items.map((it, i) => itemHtml(it, i, h, space));
  if (withAns && items.length) {
    out.push({ html: '<div class="ah"><h1>答案和解题思路</h1></div>', page: true, keep: true });
    items.forEach((it, i) => out.push(answerHtml(it, i, h)));
  }
  return out;
}

// ───────── 存 PDF 时公式字体要内嵌（SVG 图片里不能加载外部文件） ─────────
let katexCss = null;
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
/** KaTeX 样式，字体换成内嵌的 data: 地址（SVG 图片里不能加载外部文件） */
export async function embeddedKatexCss() {
  if (katexCss) return katexCss;
  const href = document.querySelector('link[href*="katex"]')?.href || new URL('vendor/katex/katex.min.css', location.href).href;
  let css = await (await fetch(href)).text();
  const names = [...new Set([...css.matchAll(/url\((fonts\/[^)]+?\.woff2)\)/g)].map((m) => m[1]))];
  const data = {};
  await Promise.all(names.map(async (n) => { try { data[n] = b64(await (await fetch(new URL(n, href))).arrayBuffer()); } catch {} }));
  css = css.replace(/src:\s*url\((fonts\/[^)]+?\.woff2)\)\s*format\("woff2"\)[^;}]*/g, (_, n) => (data[n] ? `src:url(data:font/woff2;base64,${data[n]}) format("woff2")` : 'src:local("Times New Roman")'));
  return (katexCss = css);
}
