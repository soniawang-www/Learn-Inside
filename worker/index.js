// AMC 8 模拟考 · Cloudflare Worker API（挂在 Learn-Inside 站点的 /amc8/ 下）
// wrangler.jsonc 里 run_worker_first 只包含 /amc8/api/*，其余请求不经过这里，直接出静态文件。
import { recomputeMastery, displayMastery } from './mastery.js';
import { seedDatabase, importContent, migrate } from './seed.js';
import { SCHEMA, KNOWLEDGE, EXAMS } from './content.generated.js';

const PREFIX = '/amc8';
let migrated = null;

const DEADLINE_GRACE_MS = 30_000; // 交卷允许的网络延迟

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

async function requireStudent(env, account, studentId) {
  const s = await env.DB.prepare('SELECT * FROM student WHERE id = ? AND account_id = ?').bind(studentId, account.id).first();
  if (!s) throw new HttpError(404, '找不到这个学生');
  return s;
}

/** 唯一的付费判断入口。试用期 FREE_MODE=true 时全部放开；以后接支付只需往 entitlement 写记录 */
async function hasTier(env, account, tier) {
  if (tier === 'free' || env.FREE_MODE === 'true') return true;
  const t = now();
  const e = await env.DB
    .prepare('SELECT 1 FROM entitlement WHERE account_id = ? AND tier = ? AND starts_at <= ? AND (expires_at IS NULL OR expires_at > ?)')
    .bind(account.id, tier, t, t)
    .first();
  return !!e;
}

// ───────── 路由 ─────────
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

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
  return json({ account_id: acc.id, students, premium: await hasTier(env, acc, 'premium'), free_mode: env.FREE_MODE === 'true' });
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
  const { results } = await env.DB
    .prepare(
      `SELECT e.id, e.title, e.year, e.source, e.duration_sec,
              (SELECT COUNT(*) FROM problem p WHERE p.exam_id = e.id) AS problem_count,
              (SELECT s.score FROM exam_session s WHERE s.exam_id = e.id AND s.student_id = ? AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 1) AS last_score,
              (SELECT s.id FROM exam_session s WHERE s.exam_id = e.id AND s.student_id = ? AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 1) AS last_session
         FROM exam e WHERE e.published = 1 ORDER BY e.year DESC, e.id`
    )
    .bind(studentId, studentId)
    .all();
  return json(results);
});

// 开始考试：服务端定 deadline，下发题目（不含答案）
// 开始考试 / 知识点突击 / 单题练习
//   { exam_id, mode }          整套试卷（exam 模考 / practice 练习）
//   { kp_id }                  知识点突击：该考点下所有已发布真题（会员）
//   { problem_ids: [id] }      单题练习（从知识点页「相关真题」进入）
route('POST', '/api/sessions', async (req, env) => {
  const acc = await requireAccount(req, env);
  const { exam_id, student_id, mode = 'exam', kp_id, problem_ids } = await body(req);
  await requireStudent(env, acc, student_id);
  const id = uid();
  const t = now();
  if (kp_id || problem_ids) {
    let ids, title;
    if (kp_id) {
      const kp = await env.DB.prepare('SELECT id, name FROM knowledge_point WHERE id = ?').bind(kp_id).first();
      if (!kp) throw new HttpError(404, '知识点不存在');
      if (!(await hasTier(env, acc, 'premium'))) throw new HttpError(402, '知识点突击是会员功能');
      ids = await drillProblemIds(env, kp_id);
      title = `知识点突击 · ${kp.name}`;
    } else {
      if (!Array.isArray(problem_ids) || !problem_ids.length || problem_ids.length > 30) throw new HttpError(400, 'problem_ids 不合法');
      const { results } = await env.DB
        .prepare(`SELECT p.id FROM problem p JOIN exam e ON e.id = p.exam_id WHERE e.published = 1 AND p.id IN (${problem_ids.map(() => '?').join(',')})`)
        .bind(...problem_ids).all();
      const ok = new Set(results.map((r) => r.id));
      ids = problem_ids.filter((x) => ok.has(x));
      title = ids.length === 1 ? '单题练习' : '专项练习';
    }
    if (!ids.length) throw new HttpError(404, '没有可练的题');
    const stmts = [env.DB
      .prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, kp_id) VALUES (?, ?, 'drill', 'practice', ?, ?, ?, ?)")
      .bind(id, student_id, t, t + ids.length * 180 * 1000, title, kp_id ?? null)];
    ids.forEach((pid, i) => stmts.push(env.DB.prepare('INSERT INTO session_problem (session_id, problem_id, ord) VALUES (?, ?, ?)').bind(id, pid, i)));
    await env.DB.batch(stmts);
    return json(await sessionPayload(env, id));
  }
  if (!['exam', 'practice'].includes(mode)) throw new HttpError(400, 'mode 只能是 exam 或 practice');
  const exam = await env.DB.prepare('SELECT * FROM exam WHERE id = ? AND published = 1').bind(exam_id).first();
  if (!exam) throw new HttpError(404, '试卷不存在');
  await env.DB
    .prepare('INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, student_id, exam_id, mode, t, t + exam.duration_sec * 1000)
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

async function sessionPayload(env, sessionId) {
  const s = await env.DB.prepare('SELECT * FROM exam_session WHERE id = ?').bind(sessionId).first();
  const exam = await env.DB.prepare('SELECT id, title, duration_sec FROM exam WHERE id = ?').bind(s.exam_id).first();
  const drill = s.exam_id === 'drill';
  if (drill) { exam.title = s.title; exam.duration_sec = Math.round((s.deadline_at - s.started_at) / 1000); }
  const results = (await sessionProblems(env, s,
    'p.id, p.number, p.stem, p.stem_zh, p.figure, p.choices, p.choices_zh, (SELECT COUNT(*) FROM hint h WHERE h.problem_id = p.id) AS hint_count'))
    .map((p, i) => ({ ...p, label: labelOf(p), seq: i + 1, number: drill ? i + 1 : p.number }));
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

// 交卷：判分、写原始事件、重算画像
route('POST', '/api/sessions/:id/submit', async (req, env, p) => {
  const acc = await requireAccount(req, env);
  const s = await loadSession(env, acc, p.id);
  if (s.submitted_at) return json({ already: true, ...(await reviewPayload(env, acc, s.id)) });
  const { answers = {}, times = {}, flags = {} } = await body(req);
  const t = now();
  const late = t > s.deadline_at + DEADLINE_GRACE_MS;

  const problems = await sessionProblems(env, s, 'p.id, p.answer');
  const { results: hintRows } = await env.DB
    .prepare('SELECT problem_id, MAX(level) AS lv FROM session_hint WHERE session_id = ? GROUP BY problem_id')
    .bind(s.id)
    .all();
  const hintMap = Object.fromEntries(hintRows.map((r) => [r.problem_id, r.lv]));

  let score = 0;
  const stmts = [];
  for (const pr of problems) {
    let choice = answers[pr.id] ?? null;
    if (choice !== null && !'ABCDE'.includes(choice)) choice = null;
    // 超时（late）仍记录作答，前端提示“超时交卷”；如需严格按官方规则，可在 late 时把 choice 置空
    const correct = choice === pr.answer ? 1 : 0;
    score += correct;
    stmts.push(
      env.DB
        .prepare(
          `INSERT INTO attempt_event (session_id, student_id, problem_id, choice, correct, time_sec, hints_used, flagged, error_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
        )
        .bind(s.id, s.student_id, pr.id, choice, correct, Math.round(Number(times[pr.id]) || 0), hintMap[pr.id] || 0, flags[pr.id] ? 1 : 0, t)
    );
  }
  stmts.push(env.DB.prepare('UPDATE exam_session SET submitted_at = ?, score = ? WHERE id = ?').bind(t, score, s.id));
  await env.DB.batch(stmts);
  await recomputeMastery(env.DB, s.student_id);
  return json({ late, ...(await reviewPayload(env, acc, s.id)) });
});

/** 题目的考点（带识别信号；讲解 / 突击是否解锁） */
async function kpTags(env, acc, problemIds) {
  if (!problemIds.length) return {};
  const premium = await hasTier(env, acc, 'premium');
  const { results } = await env.DB
    .prepare(
      `SELECT pk.problem_id, pk.weight, k.id, k.name, k.tier, k.amc_ext, k.summary, k.signals, (k.lesson IS NOT NULL OR k.content IS NOT NULL) AS has_lesson
         FROM problem_kp pk JOIN knowledge_point k ON k.id = pk.kp_id
        WHERE pk.problem_id IN (${problemIds.map(() => '?').join(',')}) ORDER BY pk.weight DESC`
    )
    .bind(...problemIds)
    .all();
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
  const exam = await env.DB.prepare('SELECT id, title, duration_sec FROM exam WHERE id = ?').bind(s.exam_id).first();
  const drill = s.exam_id === 'drill';
  if (drill) { exam.title = s.title; exam.duration_sec = Math.round((s.deadline_at - s.started_at) / 1000); }
  const premium = await hasTier(env, acc, 'premium');
  const { results: rows } = await env.DB
    .prepare(
      `SELECT p.id, p.number, p.stem, p.stem_zh, p.figure, p.choices, p.choices_zh, p.answer,
              ae.id AS attempt_id, ae.choice, ae.correct, ae.time_sec, ae.hints_used, ae.flagged, ae.error_reason,
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
      basic: r.basic,
      advanced: r.adv_tier ? { locked: !(r.adv_tier === 'free' || premium) } : null,
      kps: kpByProblem[r.id] || [],
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
  if (!(await hasTier(env, acc, sol.tier))) return json({ locked: true, tier: sol.tier }, 402);
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
  const premium = await hasTier(env, acc, 'premium');
  const out = {
    problem_id: pr.id, number: pr.number, label: `${pr.exam_title} 第 ${pr.number} 题`, exam_title: pr.exam_title,
    stem: pr.stem, stem_zh: pr.stem_zh, figure: pr.figure, choices: JSON.parse(pr.choices), choices_zh: pr.choices_zh ? JSON.parse(pr.choices_zh) : null,
    kps: (await kpTags(env, acc, [pr.id]))[pr.id] || [],
    attempted: !!last, last,
  };
  if (last) {
    const sb = await env.DB.prepare("SELECT content FROM solution WHERE problem_id = ? AND kind = 'basic'").bind(pr.id).first();
    const sa = await env.DB.prepare("SELECT tier FROM solution WHERE problem_id = ? AND kind = 'advanced'").bind(pr.id).first();
    Object.assign(out, { answer: pr.answer, basic: sb?.content ?? null, advanced: sa ? { locked: !(sa.tier === 'free' || premium) } : null });
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
  const kp = await env.DB.prepare('SELECT * FROM knowledge_point WHERE id = ?').bind(p.id).first();
  if (!kp) throw new HttpError(404, '知识点不存在');
  const unlocked = await hasTier(env, acc, kp.tier);
  const { results: prereq } = await env.DB
    .prepare('SELECT k.id, k.name FROM kp_edge e JOIN knowledge_point k ON k.id = e.from_kp WHERE e.to_kp = ?')
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
  const premium = await hasTier(env, acc, 'premium');
  return json({
    id: kp.id, name: kp.name, summary: kp.summary, amc_ext: !!kp.amc_ext,
    signals: kp.signals ? JSON.parse(kp.signals) : [],
    has_lesson: !!(kp.lesson || kp.content),
    locked: !unlocked, content: unlocked ? kp.content : null, lesson: unlocked && kp.lesson ? JSON.parse(kp.lesson) : null,
    drill: { count: problems.filter((x) => x.weight >= 0.5).length, locked: !premium },
    prerequisites: prereq,
    problems: problems.map((x) => ({ ...x, label: `${x.exam_title} 第 ${x.number} 题`, status: x.last_correct === null ? 'todo' : x.last_correct ? 'right' : 'wrong' })),
    mastery,
  });
});

// 学生画像
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
              (SELECT COUNT(*) FROM attempt_event a WHERE a.session_id = s.id) AS total
         FROM exam_session s JOIN exam e ON e.id = s.exam_id
        WHERE s.student_id = ? AND s.submitted_at IS NOT NULL ORDER BY s.submitted_at DESC LIMIT 20`
    )
    .bind(st.id)
    .all();
  const { results: reasons } = await env.DB
    .prepare("SELECT error_reason, COUNT(*) AS n FROM attempt_event WHERE student_id = ? AND correct = 0 GROUP BY error_reason")
    .bind(st.id)
    .all();
  const points = m
    .map((r) => ({ id: r.kp_id, name: r.name, group: r.parent_name, evidence: Math.round(r.evidence * 10) / 10, ...displayMastery(r.rating, r.evidence) }))
    .sort((a, b) => a.score - b.score);
  return json({ student: { id: st.id, nickname: st.nickname }, points, sessions, error_reasons: reasons });
});

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
  let exams = [], points = [];
  if (Array.isArray(payload)) exams = payload;
  else {
    if (payload.exams) exams = payload.exams;
    else if (payload.problems) exams = [payload];
    if (payload.knowledge?.points) points = payload.knowledge.points;
    else if (payload.points) points = payload.points;
  }
  try {
    const result = await importContent(env.DB, { schema: SCHEMA, exams, points });
    return json({ ok: true, ...result });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
});

// ───────── 入口 ─────────
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(PREFIX + '/api/')) return env.ASSETS.fetch(req);
    const path = url.pathname.slice(PREFIX.length);
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
