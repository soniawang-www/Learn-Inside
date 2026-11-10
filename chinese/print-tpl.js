// 语文打印：古诗（学习版 / 提示字版 / 默写版）和诗人卡、常识卡，放进统一打印预览。
// 应用里（每日背诗、诗页、知识卡列表）和打印链接页（/chinese/print.html，不用登录）共用。
import { openPrint, esc } from '/assets/print/kit.js?v=20261111';

const HAN = /[㐀-鿿]/;
const by = (p) => `${p.dynasty ? `〔${esc(p.dynasty)}〕` : ''}${esc(p.author || '')}`;

export const CSS = `
.lp-sheet .ph{text-align:center;padding-top:16px}
.lp-sheet .ph h2{margin:0;font-family:"Songti SC","STSong","Noto Serif SC","Source Han Serif SC","SimSun",serif;font-size:22px;letter-spacing:.06em}
.lp-sheet .ph .by{color:#5D6A65;font-size:13px;margin:4px 0 10px}
.lp-sheet .ln{text-align:center;font-family:"Songti SC","STSong","Noto Serif SC","Source Han Serif SC","SimSun",serif;font-size:20px;line-height:1.9;letter-spacing:.08em}
.lp-sheet .pl{text-align:center;font-size:12.5px;color:#5D6A65;line-height:1.5;margin:-2px 0 6px}
.lp-sheet .gap{height:10px}
.lp-sheet .notes{display:grid;grid-template-columns:max-content 1fr;gap:2px 10px;font-size:12.5px;margin:10px auto 0;max-width:560px}
.lp-sheet .notes dt{font-weight:700}
.lp-sheet .notes dd{margin:0;color:#444}
.lp-sheet .about{font-size:12.5px;color:#444;margin:8px auto 0;max-width:560px;line-height:1.7}
.lp-sheet .sep{border-bottom:1px dashed #DCD7CA;height:14px}
.lp-sheet .blank .ln{line-height:2.4}
.lp-sheet .blank .w{display:inline-block;width:1.05em;border-bottom:1px solid #888;color:transparent;margin:0 .5px}
.lp-sheet .hn{text-align:center;font-size:13px;color:#5D6A65;padding-top:16px}
.lp-sheet .hc{display:flex;justify-content:center;gap:14px;margin:8px 0 12px}
.lp-sheet .hc span{display:grid;place-items:center;width:46px;height:46px;border:1.5px solid #1E2B28;font-family:"Songti SC","STSong","Noto Serif SC",serif;font-size:27px}
.lp-sheet .wl{height:36px;border-bottom:1px solid #A9A396;margin:0 40px}
.lp-sheet .ah{font-size:18px;font-weight:800;margin:6px 0 4px}
.lp-sheet .a{font-size:13.5px;line-height:1.8;margin:0;padding:6px 0;border-bottom:1px dashed #DCD7CA}
.lp-sheet .a b{font-family:"Songti SC","STSong","Noto Serif SC",serif}
.lp-sheet .card{padding:14px 0 16px;border-bottom:1px dashed #DCD7CA}
.lp-sheet .card h2{font-family:"Songti SC","STSong","Noto Serif SC",serif;font-size:22px;margin:0 0 2px}
.lp-sheet .card .by{color:#5D6A65;font-size:13px;margin-bottom:8px}
.lp-sheet .card dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 12px;margin:0 0 8px;font-size:14px}
.lp-sheet .card dt{color:#5D6A65}
.lp-sheet .card dd{margin:0}
.lp-sheet .card h4{font-size:13px;color:#5D6A65;margin:10px 0 4px;font-weight:600}
.lp-sheet .card p,.lp-sheet .card li{font-size:14px;line-height:1.7;margin:0}
.lp-sheet .card ul{margin:0;padding-left:1.2em}
.lp-sheet .card .lines li{font-family:"Songti SC","STSong","Noto Serif SC",serif}
.lp-sheet .card table{width:100%;border-collapse:collapse;font-size:13.5px}
.lp-sheet .card th,.lp-sheet .card td{border:1px solid #DCD7CA;padding:5px 8px;text-align:left;vertical-align:top;line-height:1.6}
.lp-sheet .card th{width:28%;font-weight:600;background:#F6F4EE}
.lp-sheet .card.ct{border-bottom:0;padding-bottom:8px}
.lp-sheet .card.cm{border-bottom:0;padding:0}
.lp-sheet .card.cm table{margin-top:-1px}
.lp-sheet .mix{margin-top:10px;padding:8px 12px;border:1px solid #B04A6F;border-radius:6px}
.lp-sheet .mix h4{color:#B04A6F;margin-top:0}
`;

// 一首诗拆成几块：诗题（和下一块放同一页）+ 每 4 行一块
function chunks(p, line) {
  const out = [{ html: `<div class="ph"><h2>${esc(p.title)}</h2><div class="by">${by(p)}</div></div>`, keep: true }];
  let cur = '';
  let n = 0;
  p.text.forEach((l, i) => {
    cur += l === '—' ? '<div class="gap"></div>' : line(l, i);
    if (l !== '—' && ++n % 4 === 0) { out.push(cur); cur = ''; }
  });
  if (cur) out.push(cur);
  return out;
}
function study(p, o) {
  const out = chunks(p, (l, i) => `<div class="ln">${esc(l)}</div>${o.m && p.plain?.[i] && p.plain[i] !== '—' ? `<div class="pl">${esc(p.plain[i])}</div>` : ''}`);
  if (o.n && p.notes?.length) out.push(`<dl class="notes">${p.notes.map((x) => `<dt>${esc(x.w)}</dt><dd>${esc(x.m)}</dd>`).join('')}</dl>`);
  if (o.a && p.about) out.push(`<p class="about">${esc(p.about)}</p>`);
  out.push('<div class="sep"></div>');
  return out;
}
// 默写版：每句只留第一个字，其余字换成横线格（标点保留）
function blank(p) {
  const line = (l) => l.match(/[^，。、；：？！…“”—]+[，。、；：？！…”]*/g)?.map((c) => { let first = true; return [...c].map((ch) => { if (!HAN.test(ch)) return esc(ch); if (first) { first = false; return esc(ch); } return '<span class="w">口</span>'; }).join(''); }).join('') ?? esc(l);
  return [...chunks(p, (l) => `<div class="ln">${line(l)}</div>`).map((b) => (typeof b === 'string' ? `<div class="blank">${b}</div>` : b)), '<div class="sep"></div>'];
}
// 提示字版：只给 3 个字（首句、中间、末句的第一个字），不给题目，凭提示字写出整首
function hintChars(p) {
  const L = p.text.filter((l) => l !== '—');
  const pick = [...new Set([0, Math.floor(L.length / 2), L.length - 1])].map((i) => [...L[i]].find((c) => HAN.test(c)));
  return pick.length >= 3 ? pick : [...pick, ...[...L.join('')].filter((c) => HAN.test(c) && !pick.includes(c)).slice(1, 4 - pick.length)];
}
function hint(p, n) {
  const L = p.text.filter((l) => l !== '—');
  const out = [{ html: `<div class="hn">第 ${n} 首</div><div class="hc">${hintChars(p).map((c) => `<span>${esc(c)}</span>`).join('')}</div>`, keep: true }];
  for (let i = 0; i < L.length; i += 6) out.push(L.slice(i, i + 6).map(() => '<div class="wl"></div>').join(''));
  out.push('<div class="sep"></div>');
  return out;
}
const answers = (ps, numbered) => [{ html: '<div class="ah">答案</div>', page: true, keep: true },
  ...ps.map((p, i) => `<p class="a">${numbered ? `第 ${i + 1} 首　` : ''}<b>《${esc(p.title)}》</b>${by(p)}<br>${esc(p.text.filter((l) => l !== '—').join(''))}</p>`)];

function card(c) {
  const li = (xs) => xs.map((x) => `<li>${esc(x)}</li>`).join('');
  const mix = c.mix?.length ? `<div class="mix"><h4>容易混</h4><ul>${li(c.mix)}</ul></div>` : '';
  if (c.kind === 'poet') {
    const rows = [['字', c.zi], ['号', c.hao], ['称号', (c.titles || []).join('、')], ['并称', (c.groups || []).join('；')], ['流派', c.school]].filter(([, v]) => v);
    return `<div class="card"><h2>${esc(c.name)}</h2><div class="by">${c.dynasty ? `〔${esc(c.dynasty)}〕` : ''}</div>
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${c.life ? `<p>${esc(c.life)}</p>` : ''}
      ${c.works?.length ? `<h4>代表作</h4><p>${c.works.map((w) => `《${esc(w)}》`).join(' ')}</p>` : ''}
      ${c.lines?.length ? `<h4>名句</h4><ul class="lines">${li(c.lines)}</ul>` : ''}${mix}</div>`;
  }
  // 常识卡的表格可能很长：每 3 行一段，可以跨页（标题和第一段放同一页）
  const rows = c.rows || [], out = [{ html: `<div class="card ct"><h2>${esc(c.name)}</h2>${c.intro ? `<p>${esc(c.intro)}</p>` : ''}</div>`, keep: true }];
  for (let i = 0; i < rows.length; i += 3) out.push(`<div class="card cm"><table>${rows.slice(i, i + 3).map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('')}</table></div>`);
  if (mix) out.push(`<div class="card cm">${mix}</div>`);
  out.push('<div class="sep"></div>');
  return out;
}

const TITLE = { study: '古诗文学习单', hint: '凭提示字背整首诗', blank: '古诗文默写单' };
const OPT_KEYS = ['v', 'm', 'n', 'a', 'k'];
export const packOpts = (o) => encodeURIComponent(JSON.stringify(Object.fromEntries(OPT_KEYS.map((k) => [k, o[k]]))));
export const unpackOpts = (s) => { try { const x = JSON.parse(decodeURIComponent(s || '')); return Object.fromEntries(OPT_KEYS.filter((k) => k in x).map((k) => [k, x[k]])); } catch { return {}; } };

/**
 * 打印古诗。poems：可选的全部篇目；presets：范围预设 [{label, ids()}]（id 是篇目号的字符串）
 */
export function openPoemPrint({ name, poems, presets, standalone, home, opts }) {
  const byId = new Map(poems.map((p) => [String(p.idx), p]));
  const first = presets[0];
  return openPrint({
    name: name || '古诗', label: '语文 · 古诗文大会', unit: '篇', file: 'gushi',
    title: (o) => TITLE[o.v] || TITLE.study,
    info: (o) => (o.v === 'study' ? false : ['姓名', '日期', '得分']),
    remember: 'cn.print.poem', force: opts || null,
    opts: { v: 'study', m: true, n: true, a: false, k: true, ids: first.ids(), rangeLabel: first.label },
    controls: [
      { type: 'range', label: '范围', presets, items: poems.map((p) => ({ id: String(p.idx), label: p.title, sub: p.author, group: p.section })) },
      { type: 'seg', key: 'v', label: '版式', options: [['study', '学习版'], ['hint', '提示字版'], ['blank', '默写版']] },
      { type: 'toggle', key: 'm', label: '白话意思', show: (o) => o.v === 'study' },
      { type: 'toggle', key: 'n', label: '字词注释', show: (o) => o.v === 'study' },
      { type: 'toggle', key: 'a', label: '写作背景', show: (o) => o.v === 'study' },
      { type: 'toggle', key: 'k', label: '附答案', show: (o) => o.v !== 'study' },
    ],
    async build(o) {
      const ps = (o.ids || []).map((id) => byId.get(String(id))).filter(Boolean);
      const blocks = o.v === 'blank' ? ps.flatMap(blank) : o.v === 'hint' ? ps.flatMap((p, i) => hint(p, i + 1)) : ps.flatMap((p) => study(p, o));
      if (o.k && o.v !== 'study' && ps.length) blocks.push(...answers(ps, o.v === 'hint'));
      return { blocks, count: ps.length };
    },
    css: CSS, standalone, home,
    link: async (o) => `${location.origin}/chinese/print.html#p=${(o.ids || []).join(',')}&x=${packOpts(o)}`,
  });
}

/** 打印诗人卡、常识卡 */
export function openCardPrint({ cards, presets, standalone, home }) {
  const map = new Map(cards.map((c) => [c.id, c]));
  const first = presets[0];
  return openPrint({
    name: '知识卡', label: '语文 · 古诗文大会', unit: '张', file: 'cards', info: false,
    title: (o) => { const cs = (o.ids || []).map((id) => map.get(id)).filter(Boolean); return cs.every((c) => c.kind === 'poet') ? '诗人卡' : cs.every((c) => c.kind === 'topic') ? '常识卡' : '诗人卡和常识卡'; },
    opts: { ids: first.ids(), rangeLabel: first.label },
    controls: [{ type: 'range', label: '范围', presets, items: cards.map((c) => ({ id: c.id, label: c.name, sub: c.kind === 'poet' ? c.dynasty || '' : '', group: c.kind === 'poet' ? `诗人 · ${c.dynasty || ''}` : '常识' })) }],
    async build(o) { const cs = (o.ids || []).map((id) => map.get(id)).filter(Boolean); return { blocks: cs.flatMap(card), count: cs.length }; },
    css: CSS, standalone, home,
    link: async (o) => `${location.origin}/chinese/print.html#c=${(o.ids || []).map(encodeURIComponent).join(',')}`,
  });
}
