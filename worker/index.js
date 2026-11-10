// 奥数（learn-inside.com/math/）· Cloudflare Worker API
// wrangler.jsonc 里 run_worker_first 只包含 /math/api/* 和旧地址 /amc8/*，其余请求直接出静态文件。
// 旧地址：/amc8/api/* 照常处理（旧页面缓存还在用），/amc8/ 下的页面 301 到 /math/。
import { recomputeMastery, displayMastery } from './mastery.js';
const parseJ = (v, d = null) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
import { seedDatabase, importContent, migrate } from './seed.js';
import { SCHEMA, KNOWLEDGE, EXAMS } from './content.generated.js';
import { registerBilling, SAMPLES } from './billing.js';
import { judge, normalizeInput } from './answers.js';
import { registerEnglish } from './english.js';
const SAMPLE_DRILLS = SAMPLES.drills;

const PREFIX = '/math', OLD_PREFIX = '/amc8';
// 考试系列：试卷 id 以前缀区分。画像、知识图谱、错题本不分考试；考情、试卷、成绩按考试分开。
const FAMILIES = [
  { id: 'amc8', name: 'AMC 8', prefix: 'amc8-', desc: '美国数学竞赛 8 年级组：25 道选择题，40 分钟', subject: 'math' },
  { id: 'swb100', name: '思维 100', prefix: 'swb100-', desc: '思维 100 STEM 应用能力活动（数学）：按年级分卷，填空题为主，60 分钟', grades: true, subject: 'math' },
  { id: 'hope', name: '希望数学', prefix: 'hope-', desc: '希望数学（HMTC）：按年级分卷，填空题为主', grades: true, subject: 'math' },
  // 语文（learn-inside.com/chinese）
  { id: 'hanzi', name: '汉字小达人', prefix: 'hanzi-', desc: '上海市小学生「美丽汉字小达人」：150 题，40 分钟', subject: 'chinese' },
  { id: 'gushiwen', name: '古诗文大会', prefix: 'gsw-', desc: '上海小学生古诗文大会：线上初选 / 复选单选，按年级分卷', grades: true, subject: 'chinese' },
  // 英语（learn-inside.com/english）：口语 / 写作练习题库，不走考试流程（接口在 worker/english.js）
  { id: 'esdp', name: 'ESDP', prefix: 'esdp-', desc: '全国中小学生英语演讲与辩论五项大赛：口语、写作', subject: 'english' },
];
const familyOf = (examOrProblemId) => FAMILIES.find((f) => String(examOrProblemId).startsWith(f.prefix)) || null;
// 科目：数学、语文的成绩和错题分开（画像、知识图谱目前只有数学）
const SUBJECTS = ['math', 'chinese', 'english'];
const subjectOf = (examOrProblemId) => familyOf(examOrProblemId)?.subject || 'math';
const subjectParam = (url) => (SUBJECTS.includes(url?.searchParams.get('subject')) ? url.searchParams.get('subject') : 'math');
let migrated = null;

const DEADLINE_GRACE_MS = 30_000; // 交卷允许的网络延迟
const PAPER_DAYS = 30; // 纸笔做的卷子：开始回填后多少天内交
const PAPER_MAX_MIN = 600; // 回填时填的用时上限（分钟）

// ───────── 工具 ─────────
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const fail = (status, message) => json({ error: message }, status);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const uid = () => crypto.randomUUID();
const now = () => Date.now();

async function body(req) {
  try { return await req.json(); } catch { throw new HttpError(400, '请求体不是合法 JSON'); }
}

// ───────── 账号与权益 ─────────
async function requireAccount(req, env) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) throw new HttpError(401, '未登录');
  const acc = await env.DB.prepare('SELECT * FROM account WHERE token = ?').bind(token).first();
  if (!acc) throw new HttpError(401, '登录已失效');
  return acc;
}

// 游客只能考试、看对错和答案；错题本、知识图谱、知识项、错因、错题练习要注册
const REG_ONLY = '注册后才能用：错题本、知识图谱、知识项突击';
function requireRegistered(acc) { if (acc.guest) throw new HttpError(403, REG_ONLY); }

async function requireStudent(env, account, studentId) {
  const s = await env.DB.prepare('SELECT * FROM student WHERE id = ? AND account_id = ?').bind(studentId, account.id).first();
  if (!s) throw new HttpError(404, '找不到这个学生');
  return s;
}

/** 知识项讲解等只认会员的内容（数学会员或全科会员；试用期全部放开） */
async function hasTier(env, account, tier) {
  if (tier === 'free') return true;
  return (await billing.accessCtx(env, account, 'math')).member;
}

// ───────── 路由 ─────────
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

const billing = registerBilling({ route, json, HttpError, body, requireAccount, uid, now });
registerEnglish({ route, json, HttpError, body, requireAccount, requireStudent, billing, uid, now });

// 加入试用：邀请码 + 孩子昵称 → 返回 token
route('POST', '/api/auth/join', async (req, env) => {
  const { invite_code = '', nickname = '' } = await body(req);
  const codes = (env.INVITE_CODES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (codes.length && !codes.includes(invite_code.trim())) throw new HttpError(403, '邀请码不正确');
  const name = nickname.trim().slice(0, 20);
  if (!name) throw new HttpError(400, '请填写孩子的昵称');
  const account = { id: uid(), token: uid() + uid().slice(0, 8), created_at: now() };
  const student = { id: uid(), nickname: name };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO account (id, token, invite_code, created_at) VALUES (?, ?, ?, ?)').bind(account.id, account.token, invite_code || null, account.created_at),
    env.DB.prepare('INSERT INTO student (id, account_id, nickname, created_at) VALUES (?, ?, ?, ?)').bind(student.id, account.id, name, now()),
  ]);
  return json({ token: account.token, student });
});

route('GET', '/api/me', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { results: students } = await env.DB.prepare('SELECT id, nickname FROM student WHERE account_id = ? ORDER BY created_at').bind(acc.id).all();
  const ctx = await billing.accessCtx(env, acc);
  return json({ account_id: acc.id, students, premium: ctx.member, free_mode: ctx.free, credits: ctx.credits, has_phone: !!acc.phone, guest: !!acc.guest });
});

route('POST', '/api/students', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { nickname = '' } = await body(req);
  const name = nickname.trim().slice(0, 20);
  if (!name) throw new HttpError(400, '请填写昵称');
  const s = { id: uid(), nickname: name };
  await env.DB.prepare('INSERT INTO student (id, account_id, nickname, created_at) VALUES (?, ?, ?, ?)').bind(s.id, acc.id, name, now()).run();
  return json(s);
});

// 试卷列表（附带该学生的最近成绩）
route('GET', '/api/exams', async (req, env, _p, url) => {
  const acc = await requireAccount(req, env);
  const studentId = url.searchParams.get('student');
  if (studentId) await requireStudent(env, acc, studentId);
  const fam = url.searchParams.get('family');
  const prefix = fam ? FAMILIES.find((f) => f.id === fam)?.prefix : null;
  // 题数用导入时存好的 problem_count；按考试筛选放在查询里（只看这一种考试的卷）
  const { results } = await env.DB
    .prepare(
      `SELECT e.id, e.title, e.year, e.grade, e.source, e.duration_sec,
              COALESCE(e.problem_count, (SELECT COUNT(*) FROM problem p WHERE p.exam_id = e.id)) AS problem_count,
              (SELECT s.score FROM exam_session s WHERE s.student_id = ? AND s.exam_id = e.id AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 1) AS last_score,
              (SELECT s.id FROM exam_session s WHERE s.student_id = ? AND s.exam_id = e.id AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 1) AS last_session
         FROM exam e WHERE e.published = 1${prefix ? ' AND e.id LIKE ?' : ''} ORDER BY e.year DESC, e.grade, e.id`
    )
    .bind(studentId, studentId, ...(prefix ? [prefix + '%'] : []))
    .all();
  return json(fam ? results.filter((e) => familyOf(e.id)?.id === fam) : results);
});

// 开始考试：服务端定 deadline，下发题目（不含答案）
// 开始考试 / 知识点突击 / 单题练习
//   { exam_id, mode }          整套试卷（exam 模考 / practice 练习）
//   { kp_id }                  知识点突击：该考点下所有已发布真题（会员）
//   { problem_ids: [id] }      单题练习（从知识点页「相关真题」进入）
//   { problem_ids, purpose }   错题本：purpose = pending 订正 / due 复习（只影响标题）
route('POST', '/api/sessions', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { exam_id, student_id, mode = 'exam', kp_id, problem_ids, purpose } = await body(req);
  await requireStudent(env, acc, student_id);
  // 英语题库是练习用的，不能当试卷开考
  if ([exam_id, ...(Array.isArray(problem_ids) ? problem_ids : [])].some((x) => familyOf(x ?? '')?.subject === 'english')) throw new HttpError(400, '英语题库不能开考');
  const id = uid();
  const t = now();
  if (kp_id || problem_ids) {
    requireRegistered(acc); // 知识项突击、错题订正 / 复习、单题练习只对注册用户
    let ids, title;
    if (kp_id) {
      const kp = await env.DB.prepare('SELECT id, name FROM knowledge_point WHERE id = ?').bind(kp_id).first();
      if (!kp) throw new HttpError(404, '知识项不存在');
      const ctx = await billing.accessCtx(env, acc);
      if (!ctx.can(`drill:${kp_id}`)) return json({ error: '知识项突击需要会员或用 1 次免费次数解锁', item: `drill:${kp_id}`, credits: ctx.credits }, 402);
      ids = await drillProblemIds(env, kp_id);
      title = `知识项突击 · ${kp.name}`;
    } else {
      if (!Array.isArray(problem_ids) || !problem_ids.length || problem_ids.length > 30) throw new HttpError(400, 'problem_ids 不合法');
      const { results } = await env.DB
        .prepare(`SELECT p.id FROM problem p JOIN exam e ON e.id = p.exam_id WHERE e.published = 1 AND p.id IN (${problem_ids.map(() => '?').join(',')})`)
        .bind(...problem_ids).all();
      const ok = new Set(results.map((r) => r.id));
      ids = problem_ids.filter((x) => ok.has(x));
      title = { pending: '错题订正', due: '错题复习' }[purpose] || (ids.length === 1 ? '单题练习' : '专项练习');
    }
    if (!ids.length) throw new HttpError(404, '没有可练的题');
    const stmts = [env.DB
      .prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, kp_id, subject) VALUES (?, ?, 'drill', 'practice', ?, ?, ?, ?, ?)")
      .bind(id, student_id, t, t + ids.length * (subjectOf(ids[0]) === 'chinese' ? 30 : 180) * 1000, title, kp_id ?? null, subjectOf(ids[0]))];
    ids.forEach((pid, i) => stmts.push(env.DB.prepare('INSERT INTO session_problem (session_id, problem_id, ord) VALUES (?, ?, ?)').bind(id, pid, i)));
    await env.DB.batch(stmts);
    return json(await sessionPayload(env, id));
  }
  if (!['exam', 'practice', 'paper'].includes(mode)) throw new HttpError(400, 'mode 只能是 exam、practice 或 paper');
  if (mode === 'paper' && subjectOf(exam_id ?? '') !== 'math') throw new HttpError(400, '只有数学试卷可以纸笔做、回填答案');
  const exam = await env.DB.prepare('SELECT * FROM exam WHERE id = ? AND published = 1').bind(exam_id).first();
  if (!exam) throw new HttpError(404, '试卷不存在');
  // paper：在纸上做完，回来填答案判分；不限时（回填的期限放宽到 PAPER_DAYS 天）
  await env.DB
    .prepare('INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, subject) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, student_id, exam_id, mode, t, t + (mode === 'paper' ? PAPER_DAYS * 86400 : exam.duration_sec) * 1000, subjectOf(exam_id))
    .run();
  return json(await sessionPayload(env, id));
});

/** 知识点突击的题：主考点或权重 ≥ 0.5 的已发布真题，按年份、题号 */
async function drillProblemIds(env, kpId) {
  const { results } = await env.DB
    .prepare(`SELECT p.id FROM problem_kp pk JOIN problem p ON p.id = pk.problem_id JOIN exam e ON e.id = p.exam_id
               WHERE pk.kp_id = ? AND pk.weight >= 0.5 AND e.published = 1 ORDER BY e.year, p.number`)
    .bind(kpId).all();
  return results.map((r) => r.id);
}

/** 会话里的题（整卷按题号；突击按加入顺序），cols 是要取的 p.* 列 */
async function sessionProblems(env, s, cols) {
  const sql = s.exam_id === 'drill'
    ? `SELECT ${cols}, e.title AS exam_title FROM session_problem sp JOIN problem p ON p.id = sp.problem_id JOIN exam e ON e.id = p.exam_id
        WHERE sp.session_id = ? ORDER BY sp.ord`
    : `SELECT ${cols}, e.title AS exam_title FROM problem p JOIN exam e ON e.id = p.exam_id WHERE p.exam_id = ? ORDER BY p.number`;
  const { results } = await env.DB.prepare(sql).bind(s.exam_id === 'drill' ? s.id : s.exam_id).all();
  return results;
}
const labelOf = (p) => `${p.exam_title} 第 ${p.number} 题`;

async function loadSession(env, account, sessionId) {
  const s = await env.DB
    .prepare('SELECT s.*, st.account_id FROM exam_session s JOIN student st ON st.id = s.student_id WHERE s.id = ?')
    .bind(sessionId)
    .first();
  if (!s || s.account_id !== account.id) throw new HttpError(404, '找不到这次考试');
  return s;
}

/** 会话对应的试卷信息（突击 / 错题练习用会话自己的标题和时长）；sections = 大题划分（语文） */
async function examInfo(env, s) {
  const e = await env.DB.prepare('SELECT id, title, duration_sec, sections, origin FROM exam WHERE id = ?').bind(s.exam_id).first();
  const exam = { id: e.id, title: e.title, duration_sec: e.duration_sec, sections: parseJ(e.sections, null), origin: e.origin ?? null, subject: s.subject || 'math' };
  if (s.exam_id === 'drill') { exam.title = s.title; exam.duration_sec = Math.round((s.deadline_at - s.started_at) / 1000); }
  return exam;
}
async function sessionPayload(env, sessionId) {
  const s = await env.DB.prepare('SELECT * FROM exam_session WHERE id = ?').bind(sessionId).first();
  const exam = await examInfo(env, s);
  const drill = s.exam_id === 'drill';
  const results = (await sessionProblems(env, s,
    'p.id, p.number, p.stem, p.stem_zh, p.figure, p.choices, p.choices_zh, p.section, p.input_hint, p.kind, p.points, p.extra, (SELECT COUNT(*) FROM hint h WHERE h.problem_id = p.id) AS hint_count'))
    .map((p, i) => { const { rubric, ...extra } = parseJ(p.extra, {}) || {}; return { ...p, extra: p.extra ? extra : null, label: labelOf(p), seq: i + 1, number: drill ? i + 1 : p.number }; });
  const { results: seen } = await env.DB.prepare('SELECT problem_id, level FROM session_hint WHERE session_id = ?').bind(sessionId).all();
  return {
    session: { id: s.id, mode: s.mode, started_at: s.started_at, deadline_at: s.deadline_at, submitted: !!s.submitted_at, server_now: now(), drill },
    exam,
    problems: results.map((p) => ({ ...p, choices: JSON.parse(p.choices), choices_zh: p.choices_zh ? JSON.parse(p.choices_zh) : null, hint_count: s.mode === 'practice' ? p.hint_count : 0 })),
    hints_seen: seen,
  };
}

route('GET', '/api/sessions/:id', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  await loadSession(env, acc, p.id);
  return json(await sessionPayload(env, p.id));
});

// 练习模式取提示：必须逐级解锁
route('POST', '/api/sessions/:id/hint', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (s.mode !== 'practice') throw new HttpError(403, '模考模式不提供提示');
  if (s.submitted_at) throw new HttpError(409, '已交卷');
  const { problem_id, level } = await body(req);
  if (level > 1) {
    const prev = await env.DB.prepare('SELECT 1 FROM session_hint WHERE session_id = ? AND problem_id = ? AND level = ?').bind(s.id, problem_id, level - 1).first();
    if (!prev) throw new HttpError(400, '请先看上一级提示');
  }
  if (!(await sessionProblems(env, s, 'p.id')).some((x) => x.id === problem_id)) throw new HttpError(404, '这道题不在本次练习里');
  const h = await env.DB
    .prepare('SELECT h.content FROM hint h WHERE h.problem_id = ? AND h.level = ?')
    .bind(problem_id, level)
    .first();
  if (!h) throw new HttpError(404, '没有这一级提示');
  await env.DB.prepare('INSERT OR IGNORE INTO session_hint (session_id, problem_id, level, viewed_at) VALUES (?, ?, ?, ?)').bind(s.id, problem_id, level, now()).run();
  return json({ level, content: h.content });
});

// 练习（错题重做）：确认一题后马上判对错、给正确答案和简单解析。模考会话不能用（防止考试中途看答案）。
route('POST', '/api/sessions/:id/check', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (s.mode !== 'practice') throw new HttpError(403, '模考中不能查看答案');
  const { problem_id, answer } = await body(req);
  const pr = (await sessionProblems(env, s, 'p.id, p.answer, p.choices, p.accept, p.kind')).find((x) => x.id === problem_id);
  if (!pr) throw new HttpError(404, '这道题不在本次练习里');
  const key = { choices: parseJ(pr.choices, {}), answer: pr.answer, accept: parseJ(pr.accept, []) };
  const sol = await env.DB.prepare("SELECT content FROM solution WHERE problem_id = ? AND kind = 'basic'").bind(pr.id).first();
  if (pr.kind === 'self') return json({ correct: false, self: true, answer: pr.answer, basic: sol?.content ?? null });
  return json({ correct: judge(key, answer), answer: pr.answer, basic: sol?.content ?? null });
});

// 飞花令（语文会员）：会员拿整个诗库；不是会员只给一个字（花）试用
const FEIHUA_SAMPLE = '花';
let feihuaCache = null;
async function feihuaData(env) {
  if (!feihuaCache) {
    const r = await env.DB.prepare("SELECT value FROM setting WHERE key = 'feihua'").first();
    if (!r?.value) throw new HttpError(503, '飞花令诗库还没导入');
    feihuaCache = JSON.parse(r.value);
  }
  return feihuaCache;
}
function feihuaSample(d, ch) {
  const lines = d.lines.filter((l) => l[0].includes(ch));
  const keep = [...new Set(lines.map((l) => l[1]))];
  const map = new Map(keep.map((pi, i) => [pi, i]));
  return { chars: d.chars.filter((c) => c[0] === ch), poems: keep.map((pi) => d.poems[pi]), lines: lines.map((l) => [l[0], map.get(l[1]), ...l.slice(2)]) };
}
route('GET', '/api/chinese/feihua', async (req, env) => {
  const acc = await requireAccount(req, env);
  const ctx = await billing.accessCtx(env, acc, 'chinese');
  const d = await feihuaData(env);
  return json(ctx.member ? { member: true, data: d } : { member: false, sample: FEIHUA_SAMPLE, data: feihuaSample(d, FEIHUA_SAMPLE) });
});

// 飞花令会背记录：读全部；add / remove 一次最多 500 句
route('GET', '/api/chinese/feihua/done', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  const sid = url.searchParams.get('student');
  await requireStudent(env, acc, sid);
  const { results } = await env.DB.prepare('SELECT line FROM feihua_done WHERE student_id = ?').bind(sid).all();
  return json({ lines: results.map((r) => r.line) });
});
route('POST', '/api/chinese/feihua/done', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { student_id, add = [], remove = [] } = await body(req);
  await requireStudent(env, acc, student_id);
  const ok = (xs) => (Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 80).slice(0, 500);
  const a = ok(add), r = ok(remove), t = now();
  const stmts = [
    ...a.map((x) => env.DB.prepare('INSERT OR IGNORE INTO feihua_done (student_id, line, created_at) VALUES (?, ?, ?)').bind(student_id, x, t)),
    ...r.map((x) => env.DB.prepare('DELETE FROM feihua_done WHERE student_id = ? AND line = ?').bind(student_id, x)),
  ];
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return json({ ok: true, added: a.length, removed: r.length });
});

// ───────── 每日背诗（免费）：篇目 + 每个孩子的背诵进度，复习间隔 1 / 3 / 7 / 15 / 30 天 ─────────
let poemsCache = null;
async function poemsData(env) {
  if (!poemsCache) {
    const r = await env.DB.prepare("SELECT value FROM setting WHERE key = 'gsw_poems'").first();
    if (!r?.value) throw new HttpError(503, '篇目还没导入');
    poemsCache = JSON.parse(r.value);
  }
  return poemsCache;
}
const POEM_DAYS = [1, 3, 7, 15, 30];
route('GET', '/api/chinese/poems', async (req, env) => {
  await requireAccount(req, env);
  return json({ items: await poemsData(env) });
});
route('GET', '/api/chinese/poems/progress', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  const sid = url.searchParams.get('student');
  await requireStudent(env, acc, sid);
  const { results } = await env.DB.prepare('SELECT poem, stage, due_at, reps, lapses, first_at, updated_at FROM poem_progress WHERE student_id = ?').bind(sid).all();
  return json({ progress: results, server_now: now() });
});
// ───────── 古诗文大会练习：速答（每题 6 秒，交卷出分）/ 按考点专项练（每题马上判对错）─────────
// 题库 = 已发布的古诗文单选题（答案待确认的不收），按题干 + 选项去重；每个 Worker 实例缓存一份
const GSW_TOPICS = { mingju: '名句补全', chuchu: '作者与出处', shiren: '诗人常识', shiyi: '诗意理解', xiuci: '修辞与体裁', wenhua: '文化常识', zixing: '字音字形', paixu: '诗句排序', ciyi: '字词释义', wenyan: '文言文阅读' };
let gswPool = null;
async function gswPoolData(env) {
  if (!gswPool) {
    const { results } = await env.DB.prepare(`SELECT p.id, p.stem, p.choices, p.types, e.grade FROM problem p JOIN exam e ON e.id = p.exam_id
       WHERE e.published = 1 AND p.id LIKE 'gsw-%' AND p.kind IS NULL AND p.reviewed = 1`).all();
    const han = (x) => String(x || '').replace(/[^\u3400-\u9fff]/g, '');
    const seen = new Map();
    for (const r of results) {
      const key = han(r.stem) + '|' + Object.values(parseJ(r.choices, {})).map(han).sort().join('/');
      const topic = (parseJ(r.types, [])[0]?.id || '').replace(/^gsw-/, '');
      const x = seen.get(key);
      if (x) x.grades.add(r.grade); else seen.set(key, { id: r.id, topic, grades: new Set([r.grade]), t: key });
    }
    gswPool = [...seen.values()];
  }
  return gswPool;
}
// 年级：小学按年级（不分年级的题给所有小学年级）；初中（6 预初·初一、8 初二·初三、7 初中通用）不再细分
const gradeOk = (x, g) => !g || (g >= 6 ? [...x.grades].some((y) => y >= 6) : x.grades.has(g) || x.grades.has(null));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
route('GET', '/api/chinese/gsw/topics', async (req, env, p, url) => {
  await requireAccount(req, env);
  const g = Number(url.searchParams.get('grade')) || null;
  const pool = (await gswPoolData(env)).filter((x) => gradeOk(x, g));
  return json({ total: pool.length, topics: Object.entries(GSW_TOPICS).map(([id, name]) => ({ id, name, n: pool.filter((x) => x.topic === id).length })).filter((t) => t.n) });
});
// 诗人卡 / 常识卡
let cardsCache = null;
async function cardsData(env) {
  if (!cardsCache) {
    const r = await env.DB.prepare("SELECT value FROM setting WHERE key = 'gsw_cards'").first();
    if (!r?.value) throw new HttpError(503, '知识卡还没导入');
    cardsCache = JSON.parse(r.value);
  }
  return cardsCache;
}
route('GET', '/api/chinese/cards', async (req, env) => {
  await requireAccount(req, env);
  return json({ items: await cardsData(env) });
});
route('POST', '/api/chinese/gsw/drill', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { student_id, kind, topic, grade, card } = await body(req);
  await requireStudent(env, acc, student_id);
  if (!['speed', 'topic', 'card'].includes(kind)) throw new HttpError(400, '练习类型不对');
  if (kind === 'topic' && !GSW_TOPICS[topic]) throw new HttpError(400, '没有这个考点');
  const cd = kind === 'card' ? (await cardsData(env)).find((c) => c.id === card) : null;
  if (kind === 'card' && !cd) throw new HttpError(400, '没有这张卡');
  const g = Number(grade) || null;
  const hit = (x) => kind === 'card' ? cd.kw.some((k) => k && x.t.includes(k)) : kind !== 'topic' || x.topic === topic;
  let pool = (await gswPoolData(env)).filter((x) => gradeOk(x, g) && hit(x)); // 不分年级的题（练习题库、年级不明的真卷）每个年级都抽
  if (kind !== 'speed' && pool.length < 5) pool = (await gswPoolData(env)).filter((x) => hit(x) && (g >= 6 ? [...x.grades].some((y) => y >= 6) : ![...x.grades].some((y) => y >= 6))); // 本年级题太少就放宽到同学段
  const n = kind === 'speed' ? 20 : 15;
  const ids = shuffle(pool.slice()).slice(0, n).map((x) => x.id);
  if (!ids.length) throw new HttpError(404, '没有可练的题');
  const id = uid(), t = now();
  const speed = kind === 'speed';
  const title = speed ? '速答训练' : kind === 'card' ? `${cd.kind === 'poet' ? '诗人卡' : '常识卡'} · ${cd.name}` : `专项练习 · ${GSW_TOPICS[topic]}`;
  const stmts = [env.DB.prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, subject) VALUES (?, ?, 'drill', ?, ?, ?, ?, 'chinese')")
    .bind(id, student_id, speed ? 'exam' : 'practice', t, t + (speed ? ids.length * 6 + 5 : ids.length * 60) * 1000, title)];
  ids.forEach((pid, i) => stmts.push(env.DB.prepare('INSERT INTO session_problem (session_id, problem_id, ord) VALUES (?, ?, ?)').bind(id, pid, i)));
  await env.DB.batch(stmts);
  return json(await sessionPayload(env, id));
});

// 一篇诗在真题里怎么考过（篇目里预先算好的题号，n = 在几套卷子里出现过）
route('GET', '/api/chinese/poems/:idx/questions', async (req, env, p) => {
  await requireAccount(req, env);
  const po = (await poemsData(env)).find((x) => x.idx === Number(p.idx));
  if (!po) throw new HttpError(404, '没有这一篇');
  const qs = po.qs || [];
  if (!qs.length) return json({ items: [] });
  const rows = await allIn(env, `SELECT p.id, p.stem, p.choices, p.answer, p.kind, p.extra, e.title AS exam_title, sb.content AS basic
      FROM problem p JOIN exam e ON e.id = p.exam_id LEFT JOIN solution sb ON sb.problem_id = p.id AND sb.kind = 'basic'
     WHERE e.published = 1 AND p.id IN (?IDS)`, qs.map((q) => q.id));
  const by = new Map(rows.map((r) => [r.id, r]));
  return json({ items: qs.filter((q) => by.has(q.id)).map((q) => {
    const r = by.get(q.id); const ex = parseJ(r.extra, null);
    return { id: r.id, n: q.n, real: q.real, exam: r.exam_title, stem: r.stem, kind: r.kind, choices: parseJ(r.choices, {}), answer: r.answer, basic: r.basic, group: ex?.group?.text || null };
  }) });
});
// result: learned 学完四步背会了 / good 复习背出来了 / again 复习没背出来
route('POST', '/api/chinese/poems/progress', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { student_id, poem, result } = await body(req);
  await requireStudent(env, acc, student_id);
  const items = await poemsData(env);
  if (!Number.isInteger(poem) || !items.some((x) => x.idx === poem)) throw new HttpError(400, '没有这一篇');
  if (!['learned', 'good', 'again'].includes(result)) throw new HttpError(400, '结果不对');
  const t = now(), DAY = 86400000;
  const cur = await env.DB.prepare('SELECT * FROM poem_progress WHERE student_id = ? AND poem = ?').bind(student_id, poem).first();
  let stage = cur?.stage ?? 0, lapses = cur?.lapses ?? 0;
  if (result === 'again') { stage = 0; lapses++; } else if (result === 'learned') stage = Math.max(stage, 1); else stage = Math.min(stage + 1, POEM_DAYS.length);
  const due = t + (result === 'again' ? 1 : POEM_DAYS[Math.max(0, stage - 1)]) * DAY;
  // 「已掌握」：最后一轮（30 天）复习也背出来了，就不再安排复习
  const done = result === 'good' && cur && cur.stage >= POEM_DAYS.length;
  await env.DB.prepare(`INSERT INTO poem_progress (student_id, poem, stage, due_at, reps, lapses, first_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT (student_id, poem) DO UPDATE SET stage = excluded.stage, due_at = excluded.due_at, reps = poem_progress.reps + 1, lapses = excluded.lapses, updated_at = excluded.updated_at`)
    .bind(student_id, poem, stage, done ? null : due, lapses, t, t).run();
  return json({ ok: true, poem, stage, due_at: done ? null : due, mastered: !!done });
});

// 交卷：判分、写原始事件、重算画像
route('POST', '/api/sessions/:id/submit', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (s.submitted_at) return json({ already: true, ...(await reviewPayload(env, acc, s.id)) });
  const { answers = {}, times = {}, flags = {}, used_min } = await body(req);
  const t = now();
  // 纸笔卷：用时是孩子自己填的分钟数，记成 started_at = 交卷时间 − 用时；没填就记成 0（复盘不显示用时）
  let paperStart = null;
  if (s.mode === 'paper') {
    const m = used_min == null || used_min === '' ? 0 : Number(used_min);
    if (!Number.isFinite(m) || m < 0 || m > PAPER_MAX_MIN) throw new HttpError(400, `用时要在 0 到 ${PAPER_MAX_MIN} 分钟之间`);
    paperStart = t - Math.round(m * 60) * 1000;
  }
  const late = t > s.deadline_at + DEADLINE_GRACE_MS;

  const problems = await sessionProblems(env, s, 'p.id, p.answer, p.choices, p.accept, p.kind, p.points');
  const { results: hintRows } = await env.DB
    .prepare('SELECT problem_id, MAX(level) AS lv FROM session_hint WHERE session_id = ? GROUP BY problem_id')
    .bind(s.id)
    .all();
  const hintMap = Object.fromEntries(hintRows.map((r) => [r.problem_id, r.lv]));

  let score = 0;
  const stmts = [];
  for (const pr of problems) {
    // 选择题存字母，填空题存孩子填的内容（规范化后）
    const key = { choices: parseJ(pr.choices, {}), answer: pr.answer, accept: parseJ(pr.accept, []) };
    const self = pr.kind === 'self'; // 简答题：交卷后孩子对照参考答案自评（/selfscore），先记 0 分
    const choice = self ? (String(answers[pr.id] ?? '').trim().slice(0, 400) || null) : normalizeInput(key.choices, answers[pr.id]);
    // 超时（late）仍记录作答，前端提示“超时交卷”；如需严格按官方规则，可在 late 时把 choice 置空
    const correct = !self && judge(key, choice) ? 1 : 0;
    const got = correct * (pr.points ?? 1);
    score += got;
    stmts.push(
      env.DB
        .prepare(
          `INSERT INTO attempt_event (session_id, student_id, problem_id, choice, correct, time_sec, hints_used, flagged, error_reason, created_at, got)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
        .bind(s.id, s.student_id, pr.id, choice, correct, Math.round(Number(times[pr.id]) || 0), hintMap[pr.id] || 0, flags[pr.id] ? 1 : 0, t, pr.points == null ? null : got)
    );
  }
  stmts.push(paperStart == null
    ? env.DB.prepare('UPDATE exam_session SET submitted_at = ?, score = ? WHERE id = ?').bind(t, score, s.id)
    : env.DB.prepare('UPDATE exam_session SET submitted_at = ?, score = ?, started_at = ? WHERE id = ?').bind(t, score, paperStart, s.id));
  await env.DB.batch(stmts);
  await recomputeMastery(env.DB, s.student_id);
  return json({ late, ...(await reviewPayload(env, acc, s.id)) });
});

// 简答题自评：交卷后对照参考答案和得分点给自己打分（0 ~ 该题分值，按 0.5 分取整），总分跟着更新
route('POST', '/api/sessions/:id/selfscore', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (!s.submitted_at) throw new HttpError(409, '交卷后才能自评');
  const { problem_id, got } = await body(req);
  const pr = await env.DB.prepare('SELECT p.kind, p.points FROM attempt_event a JOIN problem p ON p.id = a.problem_id WHERE a.session_id = ? AND a.problem_id = ?')
    .bind(s.id, problem_id).first();
  if (!pr || pr.kind !== 'self') throw new HttpError(400, '这道题不用自评');
  const full = pr.points ?? 1;
  const g = Math.max(0, Math.min(full, Math.round((Number(got) || 0) * 2) / 2));
  await env.DB.batch([
    env.DB.prepare('UPDATE attempt_event SET got = ?, correct = ? WHERE session_id = ? AND problem_id = ?').bind(g, g >= full ? 1 : 0, s.id, problem_id),
    env.DB.prepare(`UPDATE exam_session SET score = (SELECT SUM(COALESCE(a.got, a.correct)) FROM attempt_event a WHERE a.session_id = ?) WHERE id = ?`).bind(s.id, s.id),
  ]);
  await recomputeMastery(env.DB, s.student_id);
  const row = await env.DB.prepare('SELECT score FROM exam_session WHERE id = ?').bind(s.id).first();
  return json({ ok: true, got: g, score: row.score });
});

/** D1 一条语句最多 100 个参数：ids 很多时（语文一套 150 题）分批查询再合并结果 */
async function allIn(env, sql, ids, size = 90) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    const { results } = await env.DB.prepare(sql.replace('(?IDS)', `(${part.map(() => '?').join(',')})`)).bind(...part).all();
    out.push(...results);
  }
  return out;
}

/** 题目的考点（带识别信号；讲解 / 突击是否解锁） */
async function kpTags(env, acc, problemIds) {
  if (!problemIds.length) return {};
  const premium = await hasTier(env, acc, 'premium');
  const results = (await allIn(env,
    `SELECT pk.problem_id, pk.weight, k.id, k.name, k.tier, k.amc_ext, k.summary, k.signals, (k.lesson IS NOT NULL OR k.content IS NOT NULL) AS has_lesson
       FROM problem_kp pk JOIN knowledge_point k ON k.id = pk.kp_id
      WHERE pk.problem_id IN (?IDS)`, problemIds)).sort((a, b) => b.weight - a.weight);
  const out = {};
  for (const t of results) {
    (out[t.problem_id] ||= []).push({
      id: t.id, name: t.name, primary: t.weight >= 1, amc_ext: !!t.amc_ext, summary: t.summary,
      signals: t.signals ? JSON.parse(t.signals) : [], has_lesson: !!t.has_lesson,
      locked: !(t.tier === 'free' || premium),
    });
  }
  return out;
}

// 复盘数据：答案、解题思路、考点（带锁定状态）
async function reviewPayload(env, acc, sessionId) {
  const s = await env.DB.prepare('SELECT * FROM exam_session WHERE id = ?').bind(sessionId).first();
  const exam = await examInfo(env, s);
  const drill = s.exam_id === 'drill';
  const ctx = await billing.accessCtx(env, acc);
  const { results: rows } = await env.DB
    .prepare(
      `SELECT p.id, p.number, p.stem, p.stem_zh, p.figure, p.choices, p.choices_zh, p.answer, p.types, p.section, p.input_hint, p.kind, p.points, p.extra,
              ae.id AS attempt_id, ae.choice, ae.correct, ae.time_sec, ae.hints_used, ae.flagged, ae.error_reason, ae.got,
              sb.content AS basic,
              sa.tier AS adv_tier, e.title AS exam_title
         FROM attempt_event ae
         JOIN problem p ON p.id = ae.problem_id
         JOIN exam e ON e.id = p.exam_id
         LEFT JOIN solution sb ON sb.problem_id = p.id AND sb.kind = 'basic'
         LEFT JOIN solution sa ON sa.problem_id = p.id AND sa.kind = 'advanced'
        WHERE ae.session_id = ? ORDER BY ae.id`
    )
    .bind(sessionId)
    .all();
  const kpByProblem = await kpTags(env, acc, rows.map((r) => r.id));
  return {
    session: { id: s.id, mode: s.mode, started_at: s.started_at, submitted_at: s.submitted_at, score: s.score, student_id: s.student_id },
    exam,
    total: rows.length,
    items: rows.map((r, i) => ({
      problem_id: r.id, number: drill ? i + 1 : r.number, label: labelOf(r), stem: r.stem, stem_zh: r.stem_zh, figure: r.figure, choices: JSON.parse(r.choices),
      choices_zh: r.choices_zh ? JSON.parse(r.choices_zh) : null,
      answer: r.answer, choice: r.choice, correct: !!r.correct, time_sec: r.time_sec, hints_used: r.hints_used,
      flagged: !!r.flagged, error_reason: r.error_reason, attempt_id: r.attempt_id,
      basic: r.basic, section: r.section, input_hint: r.input_hint,
      advanced: r.adv_tier ? { locked: !(r.adv_tier === 'free' || ctx.can(`adv:${r.id}`)) } : null,
      kps: kpByProblem[r.id] || [],
      types: parseJ(r.types, []),
      kind: r.kind ?? null, points: r.points ?? 1, got: r.got ?? (r.correct ? (r.points ?? 1) : 0), extra: parseJ(r.extra, null),
    })),
  };
}

route('GET', '/api/sessions/:id/review', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (!s.submitted_at) throw new HttpError(409, '还没交卷');
  return json(await reviewPayload(env, acc, s.id));
});

// 复盘时标错因 → 重算画像
route('PATCH', '/api/attempts/:id', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  requireRegistered(acc);
  const { error_reason } = await body(req);
  const allowed = [null, 'unknown', 'careless', 'no_time', 'reading'];
  if (!allowed.includes(error_reason)) throw new HttpError(400, '错因不合法');
  const a = await env.DB
    .prepare('SELECT ae.id, ae.student_id FROM attempt_event ae JOIN student st ON st.id = ae.student_id WHERE ae.id = ? AND st.account_id = ?')
    .bind(p.id, acc.id)
    .first();
  if (!a) throw new HttpError(404, '找不到作答记录');
  await env.DB.prepare('UPDATE attempt_event SET error_reason = ? WHERE id = ?').bind(error_reason, a.id).run();
  await recomputeMastery(env.DB, a.student_id);
  return json({ ok: true });
});

// 高级解析（付费 + 必须做过这道题，防止考前偷看）
route('GET', '/api/problems/:id/advanced', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const done = await env.DB
    .prepare('SELECT 1 FROM attempt_event ae JOIN student st ON st.id = ae.student_id WHERE ae.problem_id = ? AND st.account_id = ? LIMIT 1')
    .bind(p.id, acc.id)
    .first();
  if (!done) throw new HttpError(403, '做完这道题后才能看解析');
  const sol = await env.DB.prepare("SELECT * FROM solution WHERE problem_id = ? AND kind = 'advanced'").bind(p.id).first();
  if (!sol) throw new HttpError(404, '这道题还没有高级解析');
  if (sol.tier !== 'free') {
    const ctx = await billing.accessCtx(env, acc);
    if (!ctx.can(`adv:${p.id}`)) return json({ locked: true, item: `adv:${p.id}`, credits: ctx.credits }, 402);
  }
  let lesson;
  try { const v = JSON.parse(sol.content); lesson = Array.isArray(v) ? { steps: v } : v; } catch { lesson = { steps: [{ title: '解析', body: sol.content }] }; }
  return json({ locked: false, lesson, steps: lesson.steps, url: sol.url });
});

// 单题页：题目、出处、考点；做过的才给答案和解析（防止先看答案）
route('GET', '/api/problems/:id', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  const studentId = url.searchParams.get('student');
  if (studentId) await requireStudent(env, acc, studentId);
  const pr = await env.DB
    .prepare(`SELECT p.*, e.title AS exam_title FROM problem p JOIN exam e ON e.id = p.exam_id WHERE p.id = ? AND e.published = 1`)
    .bind(p.id).first();
  if (!pr) throw new HttpError(404, '题目不存在');
  const last = studentId ? await env.DB
    .prepare('SELECT choice, correct, created_at, session_id FROM attempt_event WHERE problem_id = ? AND student_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .bind(pr.id, studentId).first() : null;
  const ctx = await billing.accessCtx(env, acc);
  const out = {
    problem_id: pr.id, number: pr.number, label: `${pr.exam_title} 第 ${pr.number} 题`, exam_title: pr.exam_title,
    stem: pr.stem, stem_zh: pr.stem_zh, figure: pr.figure, choices: JSON.parse(pr.choices), choices_zh: pr.choices_zh ? JSON.parse(pr.choices_zh) : null,
    kps: (await kpTags(env, acc, [pr.id]))[pr.id] || [],
    types: parseJ(pr.types, []),
    attempted: !!last, last,
  };
  if (last) {
    const sb = await env.DB.prepare("SELECT content FROM solution WHERE problem_id = ? AND kind = 'basic'").bind(pr.id).first();
    const sa = await env.DB.prepare("SELECT tier FROM solution WHERE problem_id = ? AND kind = 'advanced'").bind(pr.id).first();
    Object.assign(out, { answer: pr.answer, basic: sb?.content ?? null, advanced: sa ? { locked: !(sa.tier === 'free' || ctx.can(`adv:${pr.id}`)) } : null });
  }
  return json(out);
});

// 知识图谱（名称与一句话说明免费）
route('GET', '/api/kp', async (req, env) => {
  await requireAccount(req, env);
  const { results } = await env.DB.prepare('SELECT id, parent_id, name, amc_ext, sort, tier, summary FROM knowledge_point ORDER BY sort, id').all();
  return json(results);
});

// 知识点讲解（受 tier 保护）+ 相关题目
route('GET', '/api/kp/:id', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  requireRegistered(acc);
  const kp = await env.DB.prepare('SELECT * FROM knowledge_point WHERE id = ?').bind(p.id).first();
  if (!kp) throw new HttpError(404, '知识项不存在');
  const unlocked = await hasTier(env, acc, kp.tier);
  const { results: prereq } = await env.DB
    .prepare('SELECT k.id, k.name FROM kp_edge e JOIN knowledge_point k ON k.id = e.from_kp WHERE e.to_kp = ?')
    .bind(kp.id)
    .all();
  const { results: nexts } = await env.DB
    .prepare('SELECT k.id, k.name FROM kp_edge e JOIN knowledge_point k ON k.id = e.to_kp WHERE e.from_kp = ?')
    .bind(kp.id)
    .all();
  const studentId = url.searchParams.get('student');
  const { results: problems } = await env.DB
    .prepare(
      `SELECT p.id, p.number, e.title AS exam_title, pk.weight,
              (SELECT ae.correct FROM attempt_event ae WHERE ae.problem_id = p.id AND ae.student_id = ? ORDER BY ae.created_at DESC, ae.id DESC LIMIT 1) AS last_correct
         FROM problem_kp pk JOIN problem p ON p.id = pk.problem_id JOIN exam e ON e.id = p.exam_id
        WHERE pk.kp_id = ? AND e.published = 1 ORDER BY e.year DESC, p.number`
    )
    .bind(studentId, kp.id)
    .all();
  let mastery = null;
  if (studentId) {
    await requireStudent(env, acc, studentId);
    const m = await env.DB.prepare('SELECT rating, evidence FROM mastery WHERE student_id = ? AND kp_id = ?').bind(studentId, kp.id).first();
    if (m) mastery = displayMastery(m.rating, m.evidence);
  }
  const ctx = await billing.accessCtx(env, acc);
  const fam = FAMILIES.some((f) => f.id === url.searchParams.get('family')) ? url.searchParams.get('family') : 'amc8';
  const st = await kpStats(env, fam);
  return json({
    id: kp.id, name: kp.name, summary: kp.summary, amc_ext: !!kp.amc_ext,
    signals: kp.signals ? JSON.parse(kp.signals) : [],
    has_lesson: !!(kp.lesson || kp.content),
    locked: !unlocked, content: unlocked ? kp.content : null, lesson: unlocked && kp.lesson ? JSON.parse(kp.lesson) : null,
    drill: { count: problems.filter((x) => x.weight >= 0.5).length, locked: !ctx.can(`drill:${kp.id}`), sample: SAMPLE_DRILLS.includes(kp.id), credits: ctx.credits },
    prerequisites: prereq, dependents: nexts, types: parseJ(kp.types, []),
    problems: problems.map((x) => ({ ...x, label: `${x.exam_title} 第 ${x.number} 题`, status: x.last_correct === null ? 'todo' : x.last_correct ? 'right' : 'wrong' })),
    mastery,
    family: fam, families: FAMILIES.map((f) => ({ id: f.id, name: f.name })),
    stats: st.exams ? st.kps[kp.id] || null : null, exam_years: st.years, type_stats: st.types,
    my_mistakes: studentId ? (await mistakeBook(env, studentId)).filter((m) => m.kps.some((k) => k.id === kp.id))
      .map((m) => ({ problem_id: m.problem_id, label: m.label, family: familyOf(m.problem_id)?.name || '其他', status: m.status, types: m.types })) : [],
  });
});

// 考情：每个知识点在历年真题里的出现率和题号分布（只算正式真题、权重 ≥ 0.5 的考点）
// 题库导入后才变，按 isolate 缓存 10 分钟
let statsCache = {};
async function kpStats(env, family = 'amc8') {
  const fam = FAMILIES.find((f) => f.id === family) || FAMILIES[0];
  const hit = statsCache[fam.id];
  if (hit && now() - hit.at < 600000) return hit.data;
  // 存在数据库里的结果（导入题目时清掉）：读 1 行，不用每次扫题目表
  const key = `kpstats:${fam.id}`;
  const saved = await env.DB.prepare('SELECT data FROM stat_cache WHERE key = ?').bind(key).first().catch(() => null);
  if (saved) { const data = JSON.parse(saved.data); statsCache[fam.id] = { at: now(), data }; return data; }
  const like = fam.prefix + '%';
  const { results: exams } = await env.DB.prepare("SELECT year FROM exam WHERE published = 1 AND source = 'official' AND year IS NOT NULL AND id LIKE ? ORDER BY year").bind(like).all();
  const nExams = exams.length || 1;
  const years = [...new Set(exams.map((e) => e.year))]; // 分年级的考试一年有几套卷
  const recent = new Set(years.slice(-10));
  const { results } = await env.DB
    .prepare(`SELECT pk.kp_id, pk.weight, p.number, e.year FROM problem_kp pk JOIN problem p ON p.id = pk.problem_id JOIN exam e ON e.id = p.exam_id
               WHERE e.published = 1 AND e.source = 'official' AND e.year IS NOT NULL AND e.id LIKE ? AND pk.weight >= 0.5`)
    .bind(like).all();
  const by = {};
  for (const r of results) (by[r.kp_id] ||= []).push(r);
  const { results: mx } = await env.DB.prepare('SELECT MAX(p.number) AS n FROM problem p WHERE p.exam_id LIKE ?').bind(like).all();
  const maxNum = Math.max(25, mx[0]?.n || 0);
  const cut = [Math.round(maxNum * 0.4), Math.round(maxNum * 0.8)]; // 前 40% 基础、中段、后 20% 难题（AMC 8：10 / 20 / 25）
  const data = { family: fam.id, exams: exams.length, years, max_num: maxNum, cut, kps: {} };
  // 各模块占比：每题按主考点分 1 份
  const { results: parents } = await env.DB.prepare('SELECT id, parent_id FROM knowledge_point WHERE parent_id IS NOT NULL').all();
  const parentOf = Object.fromEntries(parents.map((r) => [r.id, r.parent_id]));
  const { results: prim } = await env.DB
    .prepare(`SELECT pk.problem_id, pk.kp_id FROM problem_kp pk JOIN problem p ON p.id = pk.problem_id JOIN exam e ON e.id = p.exam_id
               WHERE e.published = 1 AND e.source = 'official' AND e.id LIKE ? AND pk.weight >= 1`)
    .bind(like).all();
  const perProb = {};
  for (const r of prim) (perProb[r.problem_id] ||= []).push(r.kp_id);
  const share = {}, unitShare = {};
  for (const ks of Object.values(perProb)) for (const k of ks) {
    share[parentOf[k]] = (share[parentOf[k]] || 0) + 1 / ks.length; unitShare[k] = (unitShare[k] || 0) + 1 / ks.length;
  }
  const nProb = Object.keys(perProb).length || 1;
  data.modules = Object.fromEntries(Object.entries(share).map(([m, v]) => [m, Math.round((v / nProb) * 1000) / 10]));
  for (const [kp, rows] of Object.entries(by)) {
    const nums = rows.map((r) => r.number).sort((a, b) => a - b);
    const at = (f) => nums[Math.round(f * (nums.length - 1))];
    const ys = new Set(rows.map((r) => r.year));
    const perYear = {}, perNum = Array(maxNum).fill(0);
    for (const r of rows) { perYear[r.year] = (perYear[r.year] || 0) + 1; if (r.number >= 1 && r.number <= maxNum) perNum[r.number - 1]++; }
    const band = (a, b) => Math.round((nums.filter((n) => n >= a && n <= b).length / nums.length) * 100);
    data.kps[kp] = {
      rate: Math.round((ys.size / years.length) * 100),           // 出现过的届数 / 总届数
      years_hit: ys.size,
      recent_hit: [...ys].filter((y) => recent.has(y)).length,   // 近 10 届里出现几届
      recent_n: recent.size,
      per_exam: Math.round((rows.length / nExams) * 10) / 10, // 平均每套卷几题
      total: rows.length,
      from: at(0.25), to: at(0.75), median: at(0.5),             // 一半的题落在 from–to
      bands: { easy: band(1, cut[0]), mid: band(cut[0] + 1, cut[1]), hard: band(cut[1] + 1, maxNum) },
      per_year: perYear, per_num: perNum,
      share: Math.round(((unitShare[kp] || 0) / nProb) * 1000) / 10, // 主考点份额
    };
  }
  // 题型：每个题型考过几届、平均每届几题
  const { results: tp } = await env.DB
    .prepare(`SELECT p.types, e.year FROM problem p JOIN exam e ON e.id = p.exam_id
               WHERE e.published = 1 AND e.source = 'official' AND e.year IS NOT NULL AND p.types IS NOT NULL AND e.id LIKE ?`)
    .bind(like).all();
  const tacc = {};
  for (const r of tp) for (const t of parseJ(r.types, [])) {
    if (t.w < 0.5) continue;
    const a = (tacc[t.id] ||= { n: 0, ys: new Set() }); a.n++; a.ys.add(r.year);
  }
  data.types = Object.fromEntries(Object.entries(tacc).map(([k, a]) => [k, {
    total: a.n, per_exam: Math.round((a.n / nExams) * 100) / 100, rate: Math.round((a.ys.size / years.length) * 100) }]));
  statsCache[fam.id] = { at: now(), data };
  await env.DB.prepare('INSERT OR REPLACE INTO stat_cache (key, data, at) VALUES (?, ?, ?)').bind(key, JSON.stringify(data), now()).run().catch(() => {});
  return data;
}

// 考试列表（首页）
route('GET', '/api/families', async (req, env, _p, url) => {
  const acc = await requireAccount(req, env);
  const studentId = url.searchParams.get('student');
  if (studentId) await requireStudent(env, acc, studentId);
  const { results: ex } = await env.DB.prepare('SELECT id FROM exam WHERE published = 1').all();
  const { results: ss } = studentId ? await env.DB
    .prepare('SELECT exam_id, score, submitted_at FROM exam_session WHERE student_id = ? AND submitted_at IS NOT NULL ORDER BY submitted_at DESC').bind(studentId).all() : { results: [] };
  const subject = subjectParam(url); // 默认数学；语文页面传 subject=chinese
  return json(FAMILIES.filter((f) => f.subject === subject).map((f) => {
    const mine = ss.filter((s) => s.exam_id.startsWith(f.prefix));
    return { id: f.id, name: f.name, desc: f.desc, exams: ex.filter((e) => e.id.startsWith(f.prefix)).length, sessions: mine.length, last: mine[0] || null };
  }));
});

// 一种考试：试卷、考情、这个学生的成绩记录
route('GET', '/api/families/:id', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  const fam = FAMILIES.find((f) => f.id === p.id);
  if (!fam) throw new HttpError(404, '没有这种考试');
  const studentId = url.searchParams.get('student');
  if (studentId) await requireStudent(env, acc, studentId);
  const stats = await kpStats(env, fam.id);
  const { results: kps } = await env.DB.prepare('SELECT id, parent_id, name FROM knowledge_point ORDER BY sort, id').all();
  const { results: sessions } = studentId ? await env.DB
    .prepare(`SELECT s.id, s.mode, s.score, s.submitted_at, e.title, (SELECT COALESCE(SUM(COALESCE(pp.points, 1)), 0) FROM attempt_event a JOIN problem pp ON pp.id = a.problem_id WHERE a.session_id = s.id) AS total
                FROM exam_session s JOIN exam e ON e.id = s.exam_id
               WHERE s.student_id = ? AND s.submitted_at IS NOT NULL AND s.exam_id LIKE ? ORDER BY s.submitted_at DESC LIMIT 50`)
    .bind(studentId, fam.prefix + '%').all() : { results: [] };
  return json({
    family: { id: fam.id, name: fam.name, desc: fam.desc, grades: !!fam.grades },
    stats: {
      exams: stats.exams, years: stats.years, max_num: stats.max_num, cut: stats.cut,
      modules: kps.filter((k) => !k.parent_id).map((m) => ({ id: m.id, name: m.name, share: stats.modules?.[m.id] || 0 })),
      units: kps.filter((k) => k.parent_id).map((k) => ({ id: k.id, name: k.name, module: k.parent_id, ...(stats.kps[k.id] || {}) })),
    },
    sessions,
  });
});

// 学生画像（错题本、复盘页用）
route('GET', '/api/students/:id/profile', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const st = await requireStudent(env, acc, p.id);
  const { results: m } = await env.DB
    .prepare(
      `SELECT m.kp_id, m.rating, m.evidence, k.name, k.parent_id, pk.name AS parent_name
         FROM mastery m JOIN knowledge_point k ON k.id = m.kp_id
         LEFT JOIN knowledge_point pk ON pk.id = k.parent_id
        WHERE m.student_id = ?`
    )
    .bind(st.id)
    .all();
  const { results: sessions } = await env.DB
    .prepare(
      `SELECT s.id, s.mode, s.score, s.submitted_at, COALESCE(s.title, e.title) AS title,
              (SELECT COALESCE(SUM(COALESCE(pp.points, 1)), 0) FROM attempt_event a JOIN problem pp ON pp.id = a.problem_id WHERE a.session_id = s.id) AS total
         FROM exam_session s JOIN exam e ON e.id = s.exam_id
        WHERE s.student_id = ? AND s.submitted_at IS NOT NULL AND COALESCE(s.subject, 'math') = ? ORDER BY s.submitted_at DESC LIMIT 20`
    )
    .bind(st.id, subjectParam(new URL(req.url)))
    .all();
  if (acc.guest) return json({ student: { id: st.id, nickname: st.nickname }, points: [], edges: [], sessions, error_reasons: [], mistakes: [], locked: REG_ONLY });
  const { results: reasons } = await env.DB
    .prepare("SELECT error_reason, COUNT(*) AS n FROM attempt_event WHERE student_id = ? AND correct = 0 GROUP BY error_reason")
    .bind(st.id)
    .all();
  const stats = await kpStats(env);
  const points = m
    .map((r) => ({ id: r.kp_id, name: r.name, group: r.parent_name, evidence: Math.round(r.evidence * 10) / 10, ...displayMastery(r.rating, r.evidence), stats: stats.kps[r.kp_id] || null }))
    .sort((a, b) => a.score - b.score);
  const { results: edges } = await env.DB
    .prepare('SELECT e.from_kp AS pre, e.to_kp AS kp, k.name AS pre_name FROM kp_edge e JOIN knowledge_point k ON k.id = e.from_kp')
    .all();
  return json({ student: { id: st.id, nickname: st.nickname }, points, edges, sessions, error_reasons: reasons, mistakes: await mistakeBook(env, st.id) });
});

// 个人知识图谱：全部知识项 + 前置关系 + 这个学生的掌握度，以及在各考试里错过的题
route('GET', '/api/students/:id/graph', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  requireRegistered(acc);
  const st = await requireStudent(env, acc, p.id);
  const { results: kps } = await env.DB.prepare('SELECT id, parent_id, name, sort, amc_ext FROM knowledge_point ORDER BY sort, id').all();
  const { results: edges } = await env.DB.prepare('SELECT from_kp, to_kp FROM kp_edge').all();
  const { results: m } = await env.DB.prepare('SELECT kp_id, rating, evidence FROM mastery WHERE student_id = ?').bind(st.id).all();
  const mas = Object.fromEntries(m.map((r) => [r.kp_id, { ...displayMastery(r.rating, r.evidence), evidence: Math.round(r.evidence * 10) / 10 }]));
  const book = await mistakeBook(env, st.id);
  const wrong = {};
  // 考试系列：按题目 id 前缀（amc8-2024-p05 → AMC 8）
  const family = (pid) => familyOf(pid)?.name || '其他';
  for (const x of book) for (const k of x.kps) {
    const w = (wrong[k.id] ||= { total: 0, todo: 0, list: [] }); w.total++; if (x.status === 'pending' || x.status === 'due') w.todo++;
    w.list.push({ problem_id: x.problem_id, label: x.label, family: family(x.problem_id), status: x.status, reason: x.reason, types: x.types, main: k.primary });
  }
  const units = kps.filter((k) => k.parent_id);
  return json({
    student: { id: st.id, nickname: st.nickname },
    modules: kps.filter((k) => !k.parent_id).map((k) => ({ id: k.id, name: k.name })),
    nodes: units.map((k) => ({
      id: k.id, name: k.name, module: k.parent_id, ext: !!k.amc_ext,
      mastery: mas[k.id] || null, wrong: wrong[k.id] || null,
    })),
    edges: edges.map((e) => [e.from_kp, e.to_kp]),
  });
});

// 打印错题：给错题本里的题（按请求顺序）题干、选项、图、答案和解题思路，拼练习单用。
// 只给这个孩子错题本里的题：没做过、做对过但没错过的题一律不给（防止拿来先看答案）。
const PRINT_MAX = 60;
const PRINT_LINK_MS = 24 * 3600 * 1000;
function printIds(problem_ids) {
  if (!Array.isArray(problem_ids) || !problem_ids.length) throw new HttpError(400, '没有要打印的题');
  if (problem_ids.length > PRINT_MAX) throw new HttpError(400, `一次最多打印 ${PRINT_MAX} 题`);
  return [...new Set(problem_ids.map(String))];
}
/** 这个孩子错题本里的这些题（按给定顺序）的打印内容 */
async function printItems(env, studentId, wanted) {
  const book = new Map((await mistakeBook(env, studentId)).map((m) => [m.problem_id, m]));
  const ids = wanted.filter((id) => book.has(id));
  if (!ids.length) return [];
  const { results } = await env.DB
    .prepare(`SELECT p.id, p.number, p.stem, p.stem_zh, p.figure, p.choices, p.choices_zh, p.answer, e.title AS exam_title, sb.content AS basic
                FROM problem p JOIN exam e ON e.id = p.exam_id
                LEFT JOIN solution sb ON sb.problem_id = p.id AND sb.kind = 'basic'
               WHERE p.id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids).all();
  const by = new Map(results.map((r) => [r.id, r]));
  return ids.filter((id) => by.has(id)).map((id) => {
    const r = by.get(id), m = book.get(id);
    return {
      problem_id: id, label: labelOf(r), stem: r.stem, stem_zh: r.stem_zh, figure: r.figure,
      choices: JSON.parse(r.choices), choices_zh: r.choices_zh ? JSON.parse(r.choices_zh) : null,
      answer: r.answer, basic: r.basic ?? null, status: m.status, types: m.types, kps: m.kps,
    };
  });
}
route('POST', '/api/students/:id/mistakes/print', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  requireRegistered(acc);
  const st = await requireStudent(env, acc, p.id);
  const ids = printIds((await body(req)).problem_ids);
  return json({ student: { id: st.id, nickname: st.nickname }, items: await printItems(env, st.id, ids) });
});
// 打印链接：微信（安卓 / 鸿蒙）里不能保存文件，换到手机浏览器打开这个链接再存 PDF。
// 外面的浏览器没有登录状态，所以凭链接里的随机凭证取题；只含这一次要打印的错题，24 小时后失效。
route('POST', '/api/students/:id/mistakes/print-link', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  requireRegistered(acc);
  const st = await requireStudent(env, acc, p.id);
  const b = await body(req);
  const ids = printIds(b.problem_ids);
  const book = new Set((await mistakeBook(env, st.id)).map((m) => m.problem_id));
  const keep = ids.filter((id) => book.has(id));
  if (!keep.length) throw new HttpError(400, '没有要打印的错题');
  const token = (uid() + uid()).replace(/-/g, '');
  const t = now();
  const payload = {
    problem_ids: keep, title: String(b.title || `${st.nickname}的错题本`).slice(0, 60), sub: String(b.sub || '').slice(0, 80),
    with_ans: !!b.with_ans, space: !!b.space, lang: ['en', 'zh', 'both'].includes(b.lang) ? b.lang : 'en',
  };
  await env.DB.prepare('DELETE FROM print_job WHERE expires_at < ?').bind(t).run();
  await env.DB.prepare('INSERT INTO print_job (token, student_id, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, st.id, JSON.stringify(payload), t, t + PRINT_LINK_MS).run();
  return json({ token, expires_at: t + PRINT_LINK_MS });
});
route('GET', '/api/print/:token', async (_req, env, p) => {
  const job = await env.DB.prepare('SELECT * FROM print_job WHERE token = ?').bind(p.token).first();
  if (!job || job.expires_at < now()) throw new HttpError(404, '这个打印链接已经失效（24 小时有效），请回到原来的页面重新打印');
  const pl = parseJ(job.payload, {});
  if (pl.exam_id) return json({ ...pl, expires_at: job.expires_at, items: (await examPrint(env, pl.exam_id)).items });
  return json({ ...pl, problem_ids: undefined, expires_at: job.expires_at, items: await printItems(env, job.student_id, pl.problem_ids || []) });
});

// 整套试卷打印（纸笔做）：只有题，不带答案和解题思路——做完回填答案、交卷后在复盘里看
async function examPrint(env, examId) {
  const exam = await env.DB.prepare('SELECT id, title, duration_sec FROM exam WHERE id = ? AND published = 1').bind(examId).first();
  if (!exam || subjectOf(examId) !== 'math') throw new HttpError(404, '试卷不存在');
  const { results } = await env.DB
    .prepare('SELECT id, number, stem, stem_zh, figure, choices, choices_zh FROM problem WHERE exam_id = ? ORDER BY number')
    .bind(examId).all();
  return {
    exam: { id: exam.id, title: exam.title, duration_sec: exam.duration_sec },
    items: results.map((r) => ({ problem_id: r.id, no: r.number, label: '', stem: r.stem, stem_zh: r.stem_zh, figure: r.figure,
      choices: JSON.parse(r.choices), choices_zh: r.choices_zh ? JSON.parse(r.choices_zh) : null })),
  };
}
route('GET', '/api/exams/:id/print', async (req, env, p) => {
  await requireAccount(req, env);
  return json(await examPrint(env, p.id));
});
route('POST', '/api/exams/:id/print-link', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const b = await body(req);
  const st = await requireStudent(env, acc, b.student_id);
  const { exam } = await examPrint(env, p.id);
  const token = (uid() + uid()).replace(/-/g, '');
  const t = now();
  const payload = { exam_id: exam.id, title: exam.title, sub: String(b.sub || '').slice(0, 80), with_ans: false, space: !!b.space, lang: ['en', 'zh', 'both'].includes(b.lang) ? b.lang : 'en' };
  await env.DB.prepare('DELETE FROM print_job WHERE expires_at < ?').bind(t).run();
  await env.DB.prepare('INSERT INTO print_job (token, student_id, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, st.id, JSON.stringify(payload), t, t + PRINT_LINK_MS).run();
  return json({ token, expires_at: t + PRINT_LINK_MS });
});

// 错题本：做错过（含未作答）的题，按最近一次错误后的表现分阶段
//   pending  待订正：最近一次还是错的
//   due      该复习：订正对了一次，已过 REVIEW_DAYS 天，再做一次巩固
//   fixed    已订正：订正对了一次，还没到复习时间
//   mastered 已掌握：最近一次错误之后又做对了两次以上
const REVIEW_DAYS = 7;
route('GET', '/api/students/:id/mistakes', async (req, env, p, url) => {
  const acc = await requireAccount(req, env);
  const st = await requireStudent(env, acc, p.id);
  requireRegistered(acc);
  const subject = subjectParam(url);
  const book = await mistakeBook(env, st.id, subject);
  const det = {};
  const rows = await allIn(env, `SELECT p.id, p.stem, p.figure, p.choices, p.answer, p.section, p.input_hint, e.sections, sb.content AS basic
      FROM problem p JOIN exam e ON e.id = p.exam_id LEFT JOIN solution sb ON sb.problem_id = p.id AND sb.kind = 'basic'
     WHERE p.id IN (?IDS)`, book.map((m) => m.problem_id));
  for (const r of rows) {
    const sec = (parseJ(r.sections, []) || []).find((x) => x.no === r.section);
    det[r.id] = { stem: r.stem, figure: r.figure, choices: parseJ(r.choices, {}), answer: r.answer, input_hint: r.input_hint, basic: r.basic, section: r.section, section_name: sec?.name ?? null };
  }
  return json({ subject, mistakes: book.map((m) => ({ ...m, ...det[m.problem_id] })) });
});

async function mistakeBook(env, studentId, subject = 'math') {
  const { results: rows } = await env.DB
    .prepare(
      `SELECT ae.problem_id, ae.choice, ae.correct, ae.error_reason, ae.created_at, p.number, p.types, e.title AS exam_title, e.year
         FROM attempt_event ae JOIN problem p ON p.id = ae.problem_id JOIN exam e ON e.id = p.exam_id
        WHERE ae.student_id = ? AND ae.problem_id IN (SELECT problem_id FROM attempt_event WHERE student_id = ? AND correct = 0)
        ORDER BY ae.created_at, ae.id`
    )
    .bind(studentId, studentId)
    .all();
  const by = new Map();
  for (const r of rows) {
    const m = by.get(r.problem_id) || { problem_id: r.problem_id, label: labelOf(r), year: r.year, number: r.number, wrong_n: 0, right_since: 0,
      types: parseJ(r.types, []).filter((t) => t.w >= 1).map((t) => t.name) };
    if (r.correct) m.right_since++;
    else { m.wrong_n++; m.right_since = 0; m.last_wrong_at = r.created_at; m.last_choice = r.choice; if (r.error_reason) m.reason = r.error_reason; }
    m.last_at = r.created_at;
    by.set(r.problem_id, m);
  }
  const list = [...by.values()].filter((m) => subjectOf(m.problem_id) === subject);
  if (!list.length) return [];
  const kps = (await allIn(env, `SELECT pk.problem_id, pk.weight, k.id, k.name FROM problem_kp pk JOIN knowledge_point k ON k.id = pk.kp_id
               WHERE pk.weight >= 0.5 AND pk.problem_id IN (?IDS)`, list.map((x) => x.problem_id))).sort((a, b) => b.weight - a.weight);
  const kpOf = {};
  for (const k of kps) (kpOf[k.problem_id] ||= []).push({ id: k.id, name: k.name, primary: k.weight >= 1 });
  const t = now();
  return list
    .map((m) => {
      const status = m.right_since === 0 ? 'pending' : m.right_since >= 2 ? 'mastered'
        : t - m.last_at >= REVIEW_DAYS * 86400000 ? 'due' : 'fixed';
      const review_at = status === 'fixed' ? m.last_at + REVIEW_DAYS * 86400000 : null;
      return { ...m, status, review_at, reason: m.reason ?? null, kps: kpOf[m.problem_id] || [] };
    })
    .sort((a, b) => b.last_wrong_at - a.last_wrong_at);
}

// 初始化 / 更新题库：建表 + 写入内置题库（可重复执行）
// 数据库还没有试卷时任何人都能触发（首次上线只需打开一次这个地址）；
// 之后需要带上 ADMIN_KEY（在 Cloudflare 控制台以 Secret 设置，不要写进仓库）。
async function seedHandler(req, env, _p, url) {
  let empty = true;
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM exam').first();
    empty = !r || r.n === 0;
  } catch { empty = true; } // 表还不存在
  if (!empty) {
    const key = req.headers.get('x-admin-key') || url.searchParams.get('key');
    if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) throw new HttpError(403, '题库已初始化；更新需要管理员密钥');
  }
  const result = await seedDatabase(env.DB, { schema: SCHEMA, knowledge: KNOWLEDGE, exams: EXAMS });
  statsCache = {};
  return json({ ok: true, ...result });
}
route('GET', '/api/admin/seed', seedHandler);
route('POST', '/api/admin/seed', seedHandler);

// 导入试卷（真题放在私有仓库，通过 /amc8/admin.html 上传 JSON，始终需要 ADMIN_KEY）
route('POST', '/api/admin/import', async (req, env) => {
  const key = req.headers.get('x-admin-key');
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) throw new HttpError(403, '管理员密钥不正确');
  const payload = await body(req);
  // 支持：{ exams: [...], knowledge: { points: [...] } }，也支持直接传一套试卷或一个知识点文件
  let exams = [], points = [], edges = null, prune = false;
  if (Array.isArray(payload)) exams = payload;
  else {
    if (payload.exams) exams = payload.exams;
    else if (payload.problems) exams = [payload];
    if (payload.knowledge?.points) points = payload.knowledge.points;
    else if (payload.points) points = payload.points;
    edges = payload.knowledge?.edges ?? payload.edges ?? null;
    prune = !!(payload.knowledge?.prune ?? payload.prune);
  }
  // 飞花令诗库（math-data extras/feihua/feihua.json）：整份存进 setting，会员接口 /api/chinese/feihua 下发
  // 每日背诗篇目（math-data extras/gushiwen/poems.json，{kind: 'gsw-poems', items: [...]}）
  // 诗人卡 / 常识卡（extras/gushiwen/cards.json，{kind: 'gsw-cards', items: [...]}）
  if (!Array.isArray(payload) && payload.kind === 'gsw-cards' && Array.isArray(payload.items)) {
    await env.DB.prepare("INSERT INTO setting (key, value, updated_at) VALUES ('gsw_cards', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(JSON.stringify(payload.items), now()).run();
    cardsCache = null;
    return json({ ok: true, cards: payload.items.length });
  }
  if (!Array.isArray(payload) && payload.kind === 'gsw-poems' && Array.isArray(payload.items)) {
    await env.DB.prepare("INSERT INTO setting (key, value, updated_at) VALUES ('gsw_poems', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(JSON.stringify(payload.items), now()).run();
    poemsCache = null;
    return json({ ok: true, poems: payload.items.length });
  }
  if (!Array.isArray(payload) && (payload.feihua || (payload.chars && payload.poems && payload.lines))) { // 后台直接上传 feihua.json 也认
    const d = payload.feihua || payload;
    if (!Array.isArray(d.chars) || !Array.isArray(d.poems) || !Array.isArray(d.lines)) throw new HttpError(400, '飞花令数据格式不对');
    await env.DB.prepare("INSERT INTO setting (key, value, updated_at) VALUES ('feihua', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .bind(JSON.stringify(d), now()).run();
    feihuaCache = null;
    if (!exams.length && !points.length) return json({ ok: true, feihua: { chars: d.chars.length, poems: d.poems.length, lines: d.lines.length } });
  }
  try {
    const result = await importContent(env.DB, { schema: SCHEMA, exams, points, edges, prune });
    statsCache = {};
    gswPool = null;
    // 考点或知识体系变了：所有学生的画像按新的考点重算（分批导入时前面几批传 recompute: false，最后一批再重算）
    if ((points.length || exams.length) && payload.recompute !== false) {
      const { results: sts } = await env.DB.prepare('SELECT DISTINCT student_id AS id FROM attempt_event').all();
      for (const st of sts) await recomputeMastery(env.DB, st.id);
      result.recomputed = sts.length;
    }
    return json({ ok: true, ...result });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
});

// ───────── 入口 ─────────
export default {
  async fetch(req, env) {
    // 支付宝后台给的变量名：AIPAY_APP_ID、AIPAY_PRIVATE_KEY（Java 应用私钥）或 AIPAY_PRIVATE_PKCS_KEY（非 Java 私钥）、
    // AIPAY_ALIPAY_PUBLIC_KEY（支付宝公钥）。AIPAY_PUBLIC_KEY 是应用公钥，验签用不到。
    if (!env.ALIPAY_APP_ID && env.AIPAY_APP_ID) {
      env = { ...env, ALIPAY_APP_ID: env.AIPAY_APP_ID };
      env.ALIPAY_PRIVATE_KEY ||= env.AIPAY_PRIVATE_KEY || env.AIPAY_PRIVATE_PKCS_KEY;
      env.ALIPAY_PUBLIC_KEY ||= env.AIPAY_ALIPAY_PUBLIC_KEY;
      env.ALIPAY_GATEWAY ||= env.AIPAY_GATEWAY;
      env.ALIPAY_SELLER_ID ||= env.AIPAY_SELLER_ID;
    }
    const url = new URL(req.url);
    // 全站接口（账号、会员、支付）在 /api/，数学的在 /math/api/；两边路由表相同，旧地址 /amc8/api/ 也照常处理
    const base = [PREFIX, OLD_PREFIX, ''].find((p) => url.pathname.startsWith(p + '/api/'));
    // 管理页面挪到了 /admin/
    const MOVED = { '/math/admin.html': '/admin/import.html', '/math/members.html': '/admin/members.html' };
    if (MOVED[url.pathname]) return Response.redirect(new URL(MOVED[url.pathname], url).toString(), 301);
    if (base === undefined) {
      if (url.pathname === OLD_PREFIX || url.pathname.startsWith(OLD_PREFIX + '/')) {
        return Response.redirect(new URL(PREFIX + url.pathname.slice(OLD_PREFIX.length) + url.search, url).toString(), 301);
      }
      return env.ASSETS.fetch(req);
    }
    const path = url.pathname.slice(base.length);
    // 每个 Worker 实例启动后先补一次列（旧库升级用，之后直接跳过）
    migrated ??= migrate(env.DB).catch((e) => { migrated = null; throw e; });
    try { await migrated; } catch (e) { console.error('migrate failed', e); }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        return await r.handler(req, env, params, url);
      } catch (e) {
        if (e instanceof HttpError) return fail(e.status, e.message);
        console.error(e);
        return fail(500, '服务器出错了');
      }
    }
    return fail(404, '接口不存在');
  },
};
