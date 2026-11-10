// 英语打印：ESDP 题目的几种纸面（模拟题单 / 话题卡 / 讲稿单 / 背诵单 / 写作）和句型名言，放进统一打印预览。
// 应用里（题库页、模拟比赛卡片、句型页）和打印链接页（/english/print.html，不用登录）共用。
import { openPrint, esc } from '/assets/print/kit.js?v=20261111';
import { PHRASES, QUOTES } from './phrases.js?v=20261110';

const ROUNDS = { 1: '复赛问答', 2: '即兴演讲', 3: '决赛定题' };
const TAG = { open: '开头', body: '展开', example: '举例', close: '结尾' };
const RULE = {
  1: ['复赛 · 评委提问', '没有准备时间，含提问不超过 2 分钟'],
  2: ['半决赛 · 即兴演讲', '5 秒读题 + 15 秒构思，演讲不超过 1.5 分钟'],
  3: ['决赛 · 定题演讲', '准备 5 分钟，演讲 2 分钟，再答评委 2 问'],
};
const grp = (id) => (String(id).includes('-high') ? '小高组' : '小低组');
const limitOf = (bank) => (String(bank).includes('-high') ? 150 : 100);
export const isWrite = (id) => String(id).startsWith('esdp-write-');
const meta = (x) => `${grp(x.bank)} · ${isWrite(x.id) ? '写作' : ROUNDS[x.section] || ''} · 第 ${x.number} 题`;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phraseRe = (m) => { const ps = (m.phrases || []).map((p) => p.en).filter(Boolean).sort((a, b) => b.length - a.length); return ps.length ? new RegExp(ps.map(reEsc).join('|'), 'gi') : null; };
function splitBy(s, re, fn) { if (!re) return esc(s); let out = '', i = 0; for (const m of s.matchAll(re)) { out += esc(s.slice(i, m.index)) + fn(m[0]); i = m.index + m[0].length; } return out + esc(s.slice(i)); }
const holes = (s, re) => splitBy(s, re, (w) => `<span class="hole">${'&nbsp;'.repeat(Math.max(6, Math.ceil(w.length * 1.4)))}</span>`);
const letters = (s) => s.split(/([A-Za-z]+(?:['’][A-Za-z]+)?)/).map((t, i) => (i % 2 ? `${esc(t[0])}<span class="ul">${'_'.repeat(Math.min(t.length - 1, 8))}</span>` : esc(t))).join('');
const lines = (n) => Array.from({ length: n }, () => '<div class="wl"></div>').join('');
const topQ = (x) => `<div class="meta">${meta(x)}</div><h2 lang="en">${esc(x.stem)}</h2>${x.stem_zh ? `<p class="qzh">${esc(x.stem_zh)}</p>` : ''}`;
const lockedNote = '<p class="locked">提纲和参考稿：开通英语会员或解锁这道题后可打印</p>';
const paperPage = (x) => ({ page: true, html: `<div class="paper"><div class="meta">${esc(meta(x))} · ${limitOf(x.bank)} 词以内</div><h2 lang="en">${esc(x.stem)}</h2>${lines(24)}<div class="cnt">共 ______ 词</div></div>` });

export const CSS = `
.lp-sheet [lang=en]{font-family:Georgia,"Times New Roman",serif}
.lp-sheet .meta{font-size:12px;color:#5D6A65}
.lp-sheet h2{font-family:Georgia,"Times New Roman",serif;font-size:19px;margin:4px 0 2px;line-height:1.4}
.lp-sheet .qzh{font-size:13px;color:#33413D;margin:0 0 8px}
.lp-sheet h4{font-size:12.5px;color:#5D6A65;margin:12px 0 4px;font-weight:600}
.lp-sheet ol{margin:0;padding-left:1.4em;font-size:14px;line-height:1.7}
.lp-sheet .it{padding:14px 0 4px}
.lp-sheet .sep{border-bottom:1px dashed #DCD7CA;height:10px}
.lp-sheet .pa{margin:0 0 10px}
.lp-sheet .pa i{display:inline-block;font-style:normal;font-size:11px;color:#1D5C4D;border:1px solid #1D5C4D;border-radius:3px;padding:0 4px;margin-right:6px;vertical-align:2px;font-family:-apple-system,"PingFang SC",sans-serif}
.lp-sheet .pa .en{font-family:Georgia,"Times New Roman",serif;font-size:15.5px;line-height:1.75}
.lp-sheet .pa .zh{font-size:13px;color:#4A5753;line-height:1.6;margin-top:2px}
.lp-sheet .hole{display:inline-block;min-width:4em;border-bottom:1px solid #666}
.lp-sheet .ul{color:#999;letter-spacing:1px}
.lp-sheet .wl{height:30px;border-bottom:1px solid #C9C3B6}
.lp-sheet .phr{font-size:13px;line-height:1.8}
.lp-sheet .phr span{display:inline-block;margin-right:14px}
.lp-sheet .phr em{font-family:Georgia,"Times New Roman",serif;font-style:normal;font-weight:600}
.lp-sheet .locked{font-size:13px;color:#B04A6F;margin:8px 0 0}
.lp-sheet .cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px}
.lp-sheet .tc{border:1.5px dashed #9C9586;margin:0 -1.5px -1.5px 0;padding:18px 20px;min-height:200px;display:flex;flex-direction:column;gap:8px}
.lp-sheet .tc .q{font-family:Georgia,"Times New Roman",serif;font-size:19px;line-height:1.4;margin:0}
.lp-sheet .tc .zh{font-size:13.5px;color:#33413D;margin:0}
.lp-sheet .tc .tip{font-size:12px;color:#5D6A65;margin:auto 0 0;padding-top:6px;border-top:1px dotted #DCD7CA}
.lp-sheet .mk{border:1.5px solid #1E2B28;border-radius:6px;padding:12px 16px 14px;margin-top:14px}
.lp-sheet .mk .rule{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#5D6A65;border-bottom:1px dotted #DCD7CA;padding-bottom:6px;margin-bottom:8px}
.lp-sheet .mk .rule b{color:#1D5C4D}
.lp-sheet .mk .q{font-family:Georgia,"Times New Roman",serif;font-size:19px;line-height:1.4;margin:0 0 2px}
.lp-sheet .mk .zh{font-size:13px;color:#33413D;margin:0 0 4px}
.lp-sheet .mk .wl{height:28px}
.lp-sheet .mk .tm{display:flex;gap:22px;font-size:12px;color:#5D6A65;margin-top:8px}
.lp-sheet .paper h2{font-size:16px}
.lp-sheet .paper .wl{height:34px}
.lp-sheet .paper .cnt{text-align:right;font-size:12px;color:#5D6A65;margin-top:8px}
.lp-sheet .ah{font-size:18px;font-weight:800;margin:6px 0 4px;color:#1E2B28}
.lp-sheet .an{padding:8px 0;border-bottom:1px dashed #DCD7CA}
.lp-sheet .an b{font-size:13px}
.lp-sheet .an p{font-family:Georgia,"Times New Roman",serif;font-size:13.5px;line-height:1.6;margin:2px 0}
.lp-sheet .pg h3{font-size:15px;margin:10px 0 6px;color:#1D5C4D}
.lp-sheet .pg table{width:100%;border-collapse:collapse;font-size:14px}
.lp-sheet .pg td{border-bottom:1px solid #E3E0D8;padding:4px 6px}
.lp-sheet .pg td:first-child{font-family:Georgia,"Times New Roman",serif;width:55%}
.lp-sheet .qt{margin:0 0 12px}
.lp-sheet .qt b{font-size:12px;color:#5D6A65}
.lp-sheet .qt p{margin:2px 0}
.lp-sheet .qt .en{font-family:Georgia,"Times New Roman",serif;font-size:15.5px}
`;

// ───────── 各版式：内容拆成一块一块（分页时块不拆开） ─────────
function mock(items, o) {
  const out = [];
  items.forEach((x) => {
    const w = isWrite(x.id);
    const [name, rule] = w ? ['写作', `30 或 45 分钟，${limitOf(x.bank)} 词左右`] : RULE[x.section] || ['口语', ''];
    const n = !o.notes ? 0 : w ? 6 : x.section === 1 ? 3 : 5;
    out.push(`<div class="mk"><div class="rule"><span><b>${name}</b> · ${grp(x.bank)} · 第 ${x.number} 题</span><span>${rule}</span></div>
      <p class="q" lang="en">${esc(x.stem)}</p>${o.zh && x.stem_zh ? `<p class="zh">${esc(x.stem_zh)}</p>` : ''}
      ${n ? `${lines(n)}<div class="tm"><span>用时 ______</span><span>${w ? '字数 ______' : '自评：内容 □ 语言 □ 台风 □'}</span></div>` : ''}</div>`);
  });
  if (o.paper) items.filter((x) => isWrite(x.id)).forEach((x) => out.push(paperPage(x)));
  return out;
}
function topics(items, o) {
  const card = (x) => `<div class="tc"><div class="meta">${meta(x)}</div><p class="q" lang="en">${esc(x.stem)}</p>${o.zh && x.stem_zh ? `<p class="zh">${esc(x.stem_zh)}</p>` : ''}${o.tips && x.tips ? `<p class="tip">思路：${esc(x.tips)}</p>` : ''}</div>`;
  const out = [];
  for (let i = 0; i < items.length; i += 2) out.push(`<div class="cards">${card(items[i])}${items[i + 1] ? card(items[i + 1]) : ''}</div>`);
  return out;
}
function script(items, o) {
  const out = [];
  items.forEach((x, i) => {
    const m = x.model;
    const first = { html: `<div class="it">${topQ(x)}</div>`, page: i > 0 && o.brk, keep: true };
    if (!m || m.locked) { out.push(first, `${x.tips ? `<h4>思路</h4><p class="qzh">${esc(x.tips)}</p>` : ''}${lockedNote}<div class="sep"></div>`); return; }
    out.push(first);
    if (m.outline?.length) out.push(`<h4>提纲</h4><ol>${m.outline.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`);
    out.push({ html: `<h4>${isWrite(x.id) ? '范文' : '参考稿'}${m.words ? `（${m.words} 词）` : ''}</h4>`, keep: true });
    (m.paras || []).forEach((p) => out.push(`<div class="pa"><div class="en" lang="en"><i>${TAG[p.tag] || ''}</i>${esc(p.en)}</div>${o.zh ? `<div class="zh">${esc(p.zh)}</div>` : ''}</div>`));
    if (m.phrases?.length) out.push(`<h4>好用的表达</h4><div class="phr">${m.phrases.map((p) => `<span><em lang="en">${esc(p.en)}</em> ${esc(p.zh)}</span>`).join('')}</div>`);
    out.push('<div class="sep"></div>');
  });
  return out;
}
function recite(items, o) {
  const mode = o.rm || 'h';
  const out = [];
  items.forEach((x) => {
    const m = x.model;
    out.push({ html: `<div class="it">${topQ(x)}</div>`, keep: true });
    if (!m || m.locked) { out.push(`${lockedNote}<div class="sep"></div>`); return; }
    const re = phraseRe(m);
    (m.paras || []).forEach((p) => out.push(mode === 'c'
      ? `<div class="pa"><div class="zh"><i>${TAG[p.tag] || ''}</i>${esc(p.zh)}</div>${lines(Math.max(2, Math.ceil(p.en.length / 70)))}</div>`
      : `<div class="pa"><div class="en" lang="en"><i>${TAG[p.tag] || ''}</i>${mode === 'l' ? letters(p.en) : holes(p.en, re)}</div></div>`));
    out.push('<div class="sep"></div>');
  });
  const open = items.filter((x) => x.model && !x.model.locked);
  if (o.ans && open.length) {
    out.push({ html: '<div class="ah">答案</div>', page: true, keep: true });
    open.forEach((x) => out.push(`<div class="an"><b>${esc(meta(x))}</b>${(x.model.paras || []).map((p) => `<p lang="en">${esc(p.en)}</p>`).join('')}</div>`));
  }
  return out;
}
function write(items, o) {
  const out = [];
  items.forEach((x, i) => {
    const m = x.model;
    out.push({ html: `<div class="it">${topQ(x)}${x.tips ? `<h4>思路</h4><p class="qzh">${esc(x.tips)}</p>` : ''}</div>`, page: i > 0, keep: o.ref });
    if (o.ref) {
      if (!m || m.locked) out.push(lockedNote);
      else {
        if (m.outline?.length) out.push(`<h4>提纲</h4><ol>${m.outline.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`);
        out.push({ html: '<h4>范文</h4>', keep: true });
        (m.paras || []).forEach((p) => out.push(`<div class="pa"><div class="en" lang="en">${esc(p.en)}</div>${o.zh ? `<div class="zh">${esc(p.zh)}</div>` : ''}</div>`));
      }
    }
    if (o.paper) out.push(paperPage(x));
  });
  return out;
}
const BUILD = { mock, topics, script, recite, write };
const TITLE = { mock: 'ESDP 模拟题单', topics: 'ESDP 话题卡', script: 'ESDP 讲稿单', write: 'ESDP 写作' };
const RECITE = { h: '背诵单 · 挖空句型', l: '背诵单 · 首字母', c: '背诵单 · 看中文写英文' };

/**
 * 打印一组 ESDP 题目。
 *   name     顶栏小字（如「小低组 · 即兴演讲」）
 *   items    这一组可选的题（有 id、number、stem、open）
 *   presets  范围预设 [{label, ids()}]；第一个是默认
 *   v        指定版式（从模拟比赛卡片进来是 mock）
 *   fetch    取题目和参考稿（按解锁情况）：ids → items
 *   link     不用登录的打印链接
 */
export function openEnglishPrint({ name, items, presets, v, fetch, link, standalone, home, opts }) {
  const write = items.some((x) => isWrite(x.id));
  const V = write ? [['mock', '模拟题单'], ['topics', '话题卡'], ['write', '写作']]
    : [['mock', '模拟题单'], ['topics', '话题卡'], ['script', '讲稿单'], ['recite', '背诵单']];
  const cache = new Map();
  const first = presets[0];
  const ids0 = first.ids();
  return openPrint({
    name, label: '英语 · ESDP 演讲', unit: '题', file: 'esdp',
    title: (o) => (o.v === 'recite' ? RECITE[o.rm] || RECITE.h : TITLE[o.v]),
    info: (o) => (o.v === 'mock' ? ['姓名', '日期', '用时'] : o.v === 'recite' || o.v === 'write' ? ['姓名', '日期'] : false),
    remember: write ? 'en.print.w' : 'en.print.s',
    force: Object.assign({}, opts || {}, v ? { v } : {}), // 打印链接带来的选项、或入口指定的版式，盖过记住的
    opts: { v: 'topics', zh: true, tips: false, notes: true, paper: true, brk: false, rm: 'h', ans: true, ref: true, ids: ids0, rangeLabel: first.label },
    controls: [
      { type: 'range', label: '范围', presets, max: 60, items: items.map((x) => ({ id: x.id, label: `${x.number}. ${x.stem}`, sub: x.open === false ? '未解锁' : '' })) },
      { type: 'seg', key: 'v', label: '版式', options: V },
      { type: 'seg', key: 'rm', label: '背诵方式', options: [['h', '挖空句型'], ['l', '首字母'], ['c', '看中文写']], show: (o) => o.v === 'recite' },
      { type: 'toggle', key: 'zh', label: '带中文', show: (o) => o.v !== 'recite' },
      { type: 'toggle', key: 'tips', label: '带思路提示', show: (o) => o.v === 'topics' },
      { type: 'toggle', key: 'notes', label: '留几行写构思', show: (o) => o.v === 'mock' },
      { type: 'toggle', key: 'ref', label: '附提纲和范文', show: (o) => o.v === 'write' },
      { type: 'toggle', key: 'paper', label: '附作文纸', show: (o) => write && (o.v === 'mock' || o.v === 'write') },
      { type: 'toggle', key: 'brk', label: '每题另起一页', show: (o) => o.v === 'script' },
      { type: 'toggle', key: 'ans', label: '附答案', show: (o) => o.v === 'recite' },
    ],
    async build(o) {
      const need = (o.ids || []).filter((id) => !cache.has(id));
      if (need.length) (await fetch(need)).forEach((x) => cache.set(x.id, x));
      const its = (o.ids || []).map((id) => cache.get(id)).filter(Boolean);
      return { blocks: (BUILD[o.v] || topics)(its, o), count: its.length };
    },
    css: CSS, link, standalone, home,
  });
}

/** 句型和名言（免费，一两页） */
export function openPhrasesPrint({ standalone, home } = {}) {
  const blocks = PHRASES.map(([t, ...xs]) => `<div class="pg"><h3>${t}</h3><table>${xs.map(([en, zh]) => `<tr><td lang="en">${esc(en)}</td><td>${zh}</td></tr>`).join('')}</table></div>`);
  blocks.push({ html: '<div class="pg"><h3>百搭名言</h3></div>', keep: true });
  QUOTES.forEach(([t, en, who, zh]) => blocks.push(`<div class="qt"><b>${t}</b><p class="en" lang="en">${esc(en)} — ${esc(who)}</p><p>${zh}</p></div>`));
  return openPrint({
    name: '句型和名言', label: '英语 · ESDP 演讲', title: '「总-分-总」句型和百搭名言', info: false, file: 'esdp-phrases',
    build: async () => ({ blocks, count: 0 }), css: CSS,
    link: async () => `${location.origin}/english/print.html#phrases`, standalone, home,
  });
}

// 打印链接里的选项：只放版式和开关（题目 id 在链接凭证里）
const OPT_KEYS = ['v', 'zh', 'tips', 'notes', 'paper', 'brk', 'rm', 'ans', 'ref'];
export const packOpts = (o) => encodeURIComponent(JSON.stringify(Object.fromEntries(OPT_KEYS.map((k) => [k, o[k]]))));
export const unpackOpts = (s) => { try { const x = JSON.parse(decodeURIComponent(s || '')); return Object.fromEntries(OPT_KEYS.filter((k) => k in x).map((k) => [k, x[k]])); } catch { return {}; } };
