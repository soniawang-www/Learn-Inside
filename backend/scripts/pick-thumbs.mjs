// 给每道题的互动解析挑一张「最精彩」的缩略图，写到 worker/thumbs.generated.js（复盘页、单题页用）。
// 做法：在浏览器里把课件里每一张能当封面的图都画出来——分步演示的每一帧、互动演示的初始状态 /
// 播放到一半 / 达成目标时的样子、配图——按「图形多、有彩色重点、铺得开、字少」打分，取最高的一张。
// 新导入的题没在表里时，页面上还是用课件里第一张图。
//
// 用法（需要 Playwright）：
//   node backend/scripts/pick-thumbs.mjs <math-data 目录> [--sheet <目录>]
//   --sheet 另外输出缩略图总览（每套卷一张 HTML），方便人工看挑得好不好
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const DATA = args.find((a) => !a.startsWith('--'));
const SHEET = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;
if (!DATA) { console.error('用法：node backend/scripts/pick-thumbs.mjs <math-data 目录> [--sheet <目录>]'); process.exit(1); }
const FAMS = ['amc8', 'swb100', 'hope']; // 只做数学

// 静态文件：页面要加载 math/sims*.js 和 style.css
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
fs.writeFileSync(path.join(ROOT, 'math/.thumbpick.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/math/style.css">
<body><div class="lp" id="stage" style="width:420px"></div><script type="module">
import { SIMS } from '/math/sims.js';
import { compile, H } from '/math/sims24.js';
const stage = document.getElementById('stage');
const rgb = (c) => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
// 彩色：够亮、色差够大（深灰蓝的墨线不算）
const sat = (c) => { const [r, g, b] = rgb(c); if (r === undefined) return 0; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx < 85 || mx - mn < 55 ? 0 : (mx - mn) / mx; };
function score(svg) {
  const vb = svg.viewBox?.baseVal; const W = vb?.width || svg.clientWidth || 1, Hh = vb?.height || svg.clientHeight || 1;
  let n = 0, colored = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const el of svg.querySelectorAll('path,polygon,polyline,circle,ellipse,rect,line')) {
    let bb; try { bb = el.getBBox(); } catch { continue; }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (bb.width * bb.height > 0.85 * W * Hh) continue; // 整张底色
    const fill = cs.fill !== 'none' && +cs.fillOpacity > 0.05, stroke = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0;
    if (!fill && !stroke) continue;
    n++;
    if ((fill && sat(cs.fill) > 0.3) || (stroke && sat(cs.stroke) > 0.35)) colored++;
    x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.width); y1 = Math.max(y1, bb.y + bb.height);
  }
  const chars = svg.textContent.replace(/\\s/g, '').length;
  const spread = n ? Math.min(1, ((x1 - x0) * (y1 - y0)) / (W * Hh)) : 0;
  if (n < 2) return -5 + n;
  return Math.min(Math.log1p(n), 2.5) + Math.min(colored, 8) * 0.45 + spread * 1.2 - Math.min(chars / (n + 3), 6) * 0.2;
}
const biggest = (box) => { const a = (x) => (x.viewBox?.baseVal?.width || 0) * (x.viewBox?.baseVal?.height || 0);
  return [...box.querySelectorAll('svg')].filter((x) => !x.closest('button') && a(x) > 4000).sort((p, q) => a(q) - a(p))[0]; };
function renderSim(s, vars) {
  const p = JSON.parse(JSON.stringify(s));
  if (vars && p.vars) p.vars.forEach((v) => { if (v.k in vars) v.init = vars[v.k]; });
  const box = document.createElement('div'); box.className = 'lp-simbox sim-' + p.sim; stage.appendChild(box);
  try { SIMS[p.sim](box, p, { say: () => {}, solved: () => {} }); } catch { return null; }
  return biggest(box);
}
// 滑块：在变量范围里找一个满足 goal 的取值（最多试 400 组）
function goalVars(s) {
  if (!s.goal || !s.vars?.length) return null;
  const keys = s.vars.map((v) => v.k); let g; try { g = compile(s.goal, keys); } catch { return null; }
  const vals = s.vars.map((v) => { const st = v.step || 1, n = Math.floor((v.max - v.min) / st + 1e-9) + 1, k = Math.min(n, Math.max(2, Math.floor(Math.pow(400, 1 / keys.length))));
    return Array.from({ length: k }, (_, i) => +(v.min + Math.round((i * (n - 1)) / Math.max(1, k - 1)) * st).toFixed(6)); });
  const idx = vals.map(() => 0);
  for (let t = 0; t < 400; t++) {
    const o = Object.fromEntries(keys.map((k, i) => [k, vals[i][idx[i]]]));
    try { if (g(o, H)) return o; } catch {}
    let j = 0; while (j < idx.length && ++idx[j] >= vals[j].length) idx[j++] = 0; if (j === idx.length) break;
  }
  return null;
}
window.pick = (lesson) => {
  const steps = Array.isArray(lesson) ? lesson : lesson.steps || [];
  const cands = [];
  const add = (spec, svg, bonus) => { if (!svg) return; cands.push({ spec, score: +(score(svg) + bonus).toFixed(3), html: svg.outerHTML }); };
  steps.forEach((s, i) => {
    stage.innerHTML = '';
    if (s.type === 'sim' && s.sim === 'frames' && s.frames?.length) {
      s.frames.forEach((f, k) => { stage.innerHTML = '<svg viewBox="0 0 ' + (s.vw || 360) + ' ' + (s.vh || 220) + '" class="lp-sim slsvg" xmlns="http://www.w3.org/2000/svg">' + f.svg + '</svg>';
        add({ step: i, frame: k }, stage.firstChild, 0.6 + 0.5 * k / Math.max(1, s.frames.length - 1)); });
    } else if (s.type === 'sim' && SIMS[s.sim]) {
      add({ step: i }, renderSim(s), 0.6);
      const pv = s.play && s.vars?.find((v) => v.k === s.play);
      if (pv) { stage.innerHTML = ''; const o = { [pv.k]: +(pv.min + (pv.max - pv.min) * 0.6).toFixed(4) }; add({ step: i, vars: o }, renderSim(s, o), 0.8); }
      const gv = s.sim === 'slider' ? goalVars(s) : null;
      if (gv) { stage.innerHTML = ''; add({ step: i, vars: gv }, renderSim(s, gv), 1.1); }
    }
    if (s.fig) { stage.innerHTML = '<div class="lp-fig">' + s.fig + '</div>'; add({ step: i, fig: 1 }, stage.querySelector('svg'), i === 0 ? -1.6 : -1.2); } // 第一步的配图多半就是题目原图
  });
  stage.innerHTML = '';
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, 3);
};
window.ready = true;
</script>`);

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', () => {});
await page.goto(`${BASE}/math/.thumbpick.html`);
await page.waitForFunction(() => window.ready);

const out = {};
let total = 0, picked = 0;
for (const fam of FAMS) {
  const dir = path.join(DATA, 'exams', fam);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const ex = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const rows = [];
    for (const p of ex.problems || []) {
      const a = p.advanced;
      if (!a || typeof a !== 'object' || !(Array.isArray(a) || a.steps)) continue;
      total++;
      const pid = `${ex.id}-p${String(p.number).padStart(2, '0')}`;
      const top = await page.evaluate((l) => window.pick(l), a).catch(() => []);
      if (top[0]) { out[pid] = top[0].spec; picked++; }
      if (SHEET) rows.push({ pid, n: p.number, top });
    }
    if (SHEET && rows.length) {
      fs.mkdirSync(SHEET, { recursive: true });
      fs.writeFileSync(path.join(SHEET, `${ex.id}.html`), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${BASE}/math/style.css">
<style>body{font:13px sans-serif;margin:12px}.r{display:flex;gap:10px;align-items:center;margin:6px 0}.r b{width:3em}.c{width:200px;height:125px;border:1px solid #ccc;border-radius:8px;padding:6px;box-sizing:border-box;display:flex;flex-direction:column}
.c.top{border:2px solid #1D5C4D}.c svg{flex:1;width:100%;min-height:0}.c i{font-size:11px;color:#666}</style><h3>${ex.id}</h3><div class="lp">
${rows.map((r) => `<div class="r"><b>${r.n}</b>${r.top.map((c, k) => `<div class="c ${k ? '' : 'top'}">${c.html}<i>${JSON.stringify(c.spec)} ${c.score}</i></div>`).join('')}</div>`).join('')}</div>`);
    }
    process.stdout.write(`${ex.id} `);
  }
}
await browser.close(); srv.close();
fs.rmSync(path.join(ROOT, 'math/.thumbpick.html'), { force: true });
fs.writeFileSync(path.join(ROOT, 'worker/thumbs.generated.js'),
  `// 由 backend/scripts/pick-thumbs.mjs 生成：每道题互动解析的缩略图用课件里哪一步（分步演示的第几帧 / 互动演示停在什么取值 / 配图）。不要手改。\nexport const THUMBS = ${JSON.stringify(out)};\n`);
console.log(`\n${picked}/${total} 道题挑好缩略图 → worker/thumbs.generated.js`);
