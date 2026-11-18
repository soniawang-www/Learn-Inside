// 备战计划 + 每日打卡（数学）
//
// 没有计划：每天「今日两题」，所有人同一套（AMC 8 真题，一道基础、一道中等），按日期轮换
// 有计划：选考试（先只有 AMC 8）、考试日期、每天几题。每天出题：
//   - 考得多的知识项优先（考情 per_exam），做得差的多出（作答错率），计划里练过的往后排（保证考前高频知识项都过一遍）
//   - 题号难度随进度往上走：开始多出前半卷的题，越接近考试越往后
//   - 错题本里待订正 / 该复习的题按天混进来
// 当天第一次打开时出题并建一个练习会话（每题提交看解析、不计时），交卷 = 打卡
// 游客也能用（打卡记录跟着游客账号；注册后保留）

export const PREP_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS prep_plan (student_id TEXT PRIMARY KEY REFERENCES student(id), family TEXT NOT NULL,
     exam_date TEXT NOT NULL, per_day INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS prep_day (student_id TEXT NOT NULL REFERENCES student(id), day TEXT NOT NULL,
     session_id TEXT NOT NULL, kind TEXT NOT NULL, done_at INTEGER, PRIMARY KEY (student_id, day))`,
  'CREATE INDEX IF NOT EXISTS idx_prep_day_session ON prep_day(session_id)',
  'ALTER TABLE prep_plan ADD COLUMN per_week INTEGER NOT NULL DEFAULT 7', // 一周练几次：7 = 每天
  // 组队：一起备赛的同学看彼此本周进度（每个孩子同时只在一个队里）
  `CREATE TABLE IF NOT EXISTS team (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
     owner_student TEXT NOT NULL REFERENCES student(id), created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS team_member (team_id TEXT NOT NULL REFERENCES team(id), student_id TEXT NOT NULL REFERENCES student(id),
     joined_at INTEGER NOT NULL, PRIMARY KEY (team_id, student_id))`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_team_member_student ON team_member(student_id)',
];
const TEAM_MAX = 30;

const PREP_FAMILIES = { amc8: { name: 'AMC 8', prefix: 'amc8-' } };
const PER_DAY = [2, 5, 10];
const DAY = 86400000;
const UNTIMED_DAYS = 30;
const HIGH_RATE = 50; // 高频知识项：一半以上的届数都考过

const bjDay = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间的日期
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
// 稳定的伪随机：同一个种子永远给同一个数
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export function registerPrep({ route, json, HttpError, body, requireAccount, requireStudent, uid, now, kpStats, mistakeBook, bump }) {
  const famOf = (id) => PREP_FAMILIES[id] ? id : null;

  async function getPlan(env, sid) {
    return env.DB.prepare('SELECT family, exam_date, per_day, per_week, created_at FROM prep_plan WHERE student_id = ?').bind(sid).first();
  }
  const perWeekOf = async (env, sid) => (await getPlan(env, sid))?.per_week || 7;

  // 连续：每天练的按天算（今天打了从今天往前数，没打从昨天往前数）；一周几次的按周算（每周打满目标次数算一周达标，本周达标了也算上）
  async function streak(env, sid, today, perWeek = 7) {
    const { results } = await env.DB.prepare('SELECT day FROM prep_day WHERE student_id = ? AND done_at IS NOT NULL ORDER BY day DESC LIMIT 400').bind(sid).all();
    const done = new Set(results.map((r) => r.day));
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const mon = dayNum(today) - dow; // 本周一
    // 本周（周一到周日）哪几天打了卡，给首页和打卡完成页画一周的小格子
    const week = Array.from({ length: 7 }, (_, i) => { const day = new Date((mon + i) * DAY).toISOString().slice(0, 10); return { day, done: done.has(day), today: day === today }; });
    const weekCount = week.filter((d) => d.done).length;
    let n = 0;
    if (perWeek >= 7) {
      let d = dayNum(today) - (done.has(today) ? 0 : 1);
      while (done.has(new Date(d * DAY).toISOString().slice(0, 10))) { n++; d--; }
    } else {
      const cnt = {};
      for (const r of results) { const w = dayNum(r.day) - ((new Date(`${r.day}T00:00:00Z`).getUTCDay() + 6) % 7); cnt[w] = (cnt[w] || 0) + 1; }
      let w = (cnt[mon] || 0) >= perWeek ? mon : mon - 7;
      while ((cnt[w] || 0) >= perWeek) { n++; w -= 7; }
    }
    return { streak: n, unit: perWeek >= 7 ? '天' : '周', per_week: perWeek, week_count: weekCount, total: results.length, week };
  }

  // 每个知识项（主考点）：这个学生做过几次、错几次；计划开始后做过几次
  async function itemHistory(env, sid, since) {
    const { results } = await env.DB
      .prepare(`SELECT pk.kp_id, ae.correct, ae.created_at FROM attempt_event ae JOIN problem_kp pk ON pk.problem_id = ae.problem_id AND pk.weight >= 1
                 WHERE ae.student_id = ? AND ae.problem_id LIKE 'amc8-%'`)
      .bind(sid).all();
    const h = {};
    for (const r of results) {
      const x = (h[r.kp_id] ||= { n: 0, wrong: 0, since: 0 });
      x.n++; if (!r.correct) x.wrong++; if (since != null && r.created_at >= since) x.since++;
    }
    return h;
  }

  // 能定计划的考试（新手引导里选「考什么」）
  async function familyList(env) {
    const out = [];
    for (const [id, f] of Object.entries(PREP_FAMILIES)) {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM exam WHERE published = 1 AND source = 'official' AND id LIKE ?").bind(f.prefix + '%').first();
      const { high } = await highItems(env, id);
      out.push({ id, name: f.name, exams: r?.n || 0, high: high.length });
    }
    return out;
  }

  async function highItems(env, family) {
    const st = await kpStats(env, family);
    const { results: names } = await env.DB.prepare('SELECT id, name FROM knowledge_point WHERE parent_id IS NOT NULL').all();
    const name = Object.fromEntries(names.map((r) => [r.id, r.name]));
    const all = Object.entries(st.kps).map(([id, k]) => ({ id, name: name[id] || id, per_exam: k.per_exam, rate: k.rate })).sort((a, b) => b.per_exam - a.per_exam);
    return { all, high: all.filter((x) => x.rate >= HIGH_RATE) };
  }

  // 没计划：今日两题（所有人同一套）
  async function dailyTwo(env, today) {
    const { results } = await env.DB
      .prepare(`SELECT p.id, p.number FROM problem p JOIN exam e ON e.id = p.exam_id
                 WHERE e.published = 1 AND e.source = 'official' AND e.id LIKE 'amc8-%' ORDER BY p.id`).all();
    const pick = (lo, hi, salt) => { const pool = results.filter((r) => r.number >= lo && r.number <= hi); return pool[Math.floor(hash(today + salt) * pool.length)]?.id; };
    return [pick(1, 12, 'a'), pick(13, 20, 'b')].filter(Boolean);
  }

  // 有计划：按考频、错率、计划里练过几次挑知识项，再按进度挑题号
  async function planProblems(env, sid, plan, today) {
    const n = plan.per_day;
    const { all } = await highItems(env, plan.family);
    const hist = await itemHistory(env, sid, plan.created_at);
    // 计划里已经排过的题（含还没做的）和做过的题都不再出
    const { results: seenRows } = await env.DB
      .prepare(`SELECT problem_id FROM attempt_event WHERE student_id = ? UNION
                SELECT sp.problem_id FROM session_problem sp JOIN prep_day d ON d.session_id = sp.session_id WHERE d.student_id = ?`)
      .bind(sid, sid).all();
    const seen = new Set(seenRows.map((r) => r.problem_id));
    const { results: assigned } = await env.DB
      .prepare(`SELECT pk.kp_id, COUNT(*) AS c FROM session_problem sp JOIN prep_day d ON d.session_id = sp.session_id
                  JOIN problem_kp pk ON pk.problem_id = sp.problem_id AND pk.weight >= 1
                 WHERE d.student_id = ? AND d.kind = 'plan' AND d.day >= ? GROUP BY pk.kp_id`)
      .bind(sid, bjDay(plan.created_at)).all();
    const asg = Object.fromEntries(assigned.map((r) => [r.kp_id, r.c]));
    // 错题：待订正、该复习的，最早错的先来
    const ms = (await mistakeBook(env, sid, 'math')).filter((m) => m.status === 'pending' || m.status === 'due').sort((a, b) => a.last_wrong_at - b.last_wrong_at);
    const nReview = Math.min(ms.length, n >= 10 ? 2 : n >= 5 ? 1 : ms.length >= 3 && dayNum(today) % 2 ? 1 : 0);
    const review = ms.slice(0, nReview).map((m) => m.problem_id);
    // 进度：0 = 计划第一天，1 = 考试日
    const start = dayNum(bjDay(plan.created_at)), end = dayNum(plan.exam_date);
    const prog = end > start ? Math.max(0, Math.min(1, (dayNum(today) - start) / (end - start))) : 1;
    const target = 5 + prog * 16; // 第 5 题 → 第 21 题
    const score = (it) => {
      const h = hist[it.id] || { n: 0, wrong: 0 };
      const wr = (h.wrong + 1) / (h.n + 2);
      return (it.per_exam * (0.5 + wr)) / Math.pow(1 + (asg[it.id] || 0), 1.5) + hash(today + it.id) * 0.01;
    };
    const items = all.filter((x) => x.per_exam > 0).sort((a, b) => score(b) - score(a));
    const { results: cands } = await env.DB
      .prepare(`SELECT p.id, p.number, pk.kp_id FROM problem p JOIN exam e ON e.id = p.exam_id JOIN problem_kp pk ON pk.problem_id = p.id AND pk.weight >= 1
                 WHERE e.published = 1 AND e.source = 'official' AND e.id LIKE ?`)
      .bind(PREP_FAMILIES[plan.family].prefix + '%').all();
    const byItem = {};
    for (const c of cands) (byItem[c.kp_id] ||= []).push(c);
    const out = [];
    for (const it of items) {
      if (out.length >= n - review.length) break;
      const pool = (byItem[it.id] || []).filter((c) => !seen.has(c.id) && !out.some((o) => o.id === c.id));
      if (!pool.length) continue;
      pool.sort((a, b) => Math.abs(a.number - target) + hash(today + a.id) * 3 - (Math.abs(b.number - target) + hash(today + b.id) * 3));
      out.push(pool[0]);
    }
    return [...out.sort((a, b) => a.number - b.number).map((o) => o.id), ...review];
  }

  async function status(env, sid) {
    const t = now(), today = bjDay(t);
    const plan = await getPlan(env, sid);
    const day = await env.DB.prepare('SELECT d.session_id, d.kind, d.done_at, (SELECT COUNT(*) FROM session_problem sp WHERE sp.session_id = d.session_id) AS n FROM prep_day d WHERE d.student_id = ? AND d.day = ?')
      .bind(sid, today).first();
    const out = { today, ...(await streak(env, sid, today, plan?.per_week || 7)), plan: null, day: day ? { session_id: day.session_id, n: day.n, done: !!day.done_at } : null,
      families: await familyList(env) };
    if (plan) {
      const { high } = await highItems(env, plan.family);
      const hist = await itemHistory(env, sid, plan.created_at);
      out.plan = { family: plan.family, name: PREP_FAMILIES[plan.family].name, exam_date: plan.exam_date, per_day: plan.per_day, per_week: plan.per_week || 7,
        days_left: dayNum(plan.exam_date) - dayNum(today),
        cover: { done: high.filter((x) => hist[x.id]?.since).length, total: high.length } };
    }
    return out;
  }

  route('GET', '/api/students/:id/prep', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    return json(await status(env, st.id));
  });

  route('PUT', '/api/students/:id/prep', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    const { family, exam_date, per_day, per_week = 7 } = await body(req);
    if (!famOf(family)) throw new HttpError(400, '暂时只支持 AMC 8');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exam_date || '') || isNaN(Date.parse(exam_date))) throw new HttpError(400, '请选择考试日期');
    const today = bjDay(now());
    if (exam_date <= today) throw new HttpError(400, '考试日期要在今天之后');
    if (dayNum(exam_date) - dayNum(today) > 730) throw new HttpError(400, '考试日期太远了');
    if (!PER_DAY.includes(Number(per_day))) throw new HttpError(400, '每次题数只能是 2、5 或 10');
    if (!(Number.isInteger(Number(per_week)) && per_week >= 2 && per_week <= 7)) throw new HttpError(400, '一周练 2 到 7 次');
    const t = now();
    const old = await getPlan(env, st.id);
    await env.DB.prepare(`INSERT INTO prep_plan (student_id, family, exam_date, per_day, per_week, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (student_id) DO UPDATE SET family = excluded.family, exam_date = excluded.exam_date, per_day = excluded.per_day, per_week = excluded.per_week, updated_at = excluded.updated_at`)
      .bind(st.id, family, exam_date, Number(per_day), Number(per_week), t, t).run();
    // 今天还没开始做的打卡题按新计划重出
    const d = await env.DB.prepare("SELECT d.session_id FROM prep_day d JOIN exam_session s ON s.id = d.session_id WHERE d.student_id = ? AND d.day = ? AND d.done_at IS NULL AND (s.draft IS NULL OR s.draft = '')")
      .bind(st.id, today).first();
    if (d) await env.DB.batch([ // 还没动过的会话一起删掉，免得出现在「继续答题」里
      env.DB.prepare('DELETE FROM prep_day WHERE student_id = ? AND day = ?').bind(st.id, today),
      env.DB.prepare('DELETE FROM session_problem WHERE session_id = ?').bind(d.session_id),
      env.DB.prepare('DELETE FROM exam_session WHERE id = ? AND submitted_at IS NULL').bind(d.session_id),
    ]);
    if (!old) await bump(env, 'prep_plan');
    return json(await status(env, st.id));
  });

  route('DELETE', '/api/students/:id/prep', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    await env.DB.prepare('DELETE FROM prep_plan WHERE student_id = ?').bind(st.id).run();
    return json(await status(env, st.id));
  });

  // 今天的打卡题：第一次打开时出题、建练习会话；之后一直返回同一个
  route('POST', '/api/students/:id/prep/today', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    const t = now(), today = bjDay(t);
    const have = await env.DB.prepare('SELECT session_id FROM prep_day WHERE student_id = ? AND day = ?').bind(st.id, today).first();
    if (have) return json({ session_id: have.session_id });
    const plan = await getPlan(env, st.id);
    let ids = plan ? await planProblems(env, st.id, plan, today) : [];
    if (!ids.length) ids = await dailyTwo(env, today);
    if (!ids.length) throw new HttpError(404, '题库还没有题');
    const id = uid();
    const title = plan ? `今日 ${ids.length} 题` : '今日两题';
    const stmts = [
      env.DB.prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, subject) VALUES (?, ?, 'drill', 'practice', ?, ?, ?, 'math')")
        .bind(id, st.id, t, t + UNTIMED_DAYS * DAY, title),
      ...ids.map((pid, i) => env.DB.prepare('INSERT INTO session_problem (session_id, problem_id, ord) VALUES (?, ?, ?)').bind(id, pid, i)),
      env.DB.prepare('INSERT INTO prep_day (student_id, day, session_id, kind) VALUES (?, ?, ?, ?)').bind(st.id, today, id, plan ? 'plan' : 'daily'),
    ];
    await env.DB.batch(stmts);
    await bump(env, 'daily_start');
    return json({ session_id: id });
  });

  // ───────── 组队 ─────────
  const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CH[b % CODE_CH.length]).join('');
  const myTeam = (env, sid) => env.DB.prepare('SELECT t.id, t.code, t.name, t.owner_student FROM team_member m JOIN team t ON t.id = m.team_id WHERE m.student_id = ?').bind(sid).first();
  const setName = async (env, sid, nickname) => {
    const nn = String(nickname || '').trim().slice(0, 12);
    if (nn) await env.DB.prepare('UPDATE student SET nickname = ? WHERE id = ?').bind(nn, sid).run();
  };

  async function board(env, team, me) {
    const today = bjDay(now());
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const mon = new Date((dayNum(today) - dow) * DAY).toISOString().slice(0, 10);
    const { results: ms } = await env.DB.prepare('SELECT s.id, s.nickname FROM team_member m JOIN student s ON s.id = m.student_id WHERE m.team_id = ? ORDER BY m.joined_at').bind(team.id).all();
    const rows = [];
    for (const m of ms) {
      const pw = await perWeekOf(env, m.id);
      const sk = await streak(env, m.id, today, pw);
      const q = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(ae.correct), 0) AS ok FROM prep_day d JOIN attempt_event ae ON ae.session_id = d.session_id
                                      WHERE d.student_id = ? AND d.done_at IS NOT NULL AND d.day >= ?`).bind(m.id, mon).first();
      rows.push({ nickname: m.nickname, me: m.id === me, owner: m.id === team.owner_student, week_count: sk.week_count, per_week: pw,
        streak: sk.streak, unit: sk.unit, week_n: q?.n || 0, week_ok: q?.ok || 0, today: sk.week.find((d) => d.today)?.done || false });
    }
    // 本周完成比例（次数 / 目标）→ 本周做题数 → 连续
    rows.sort((a, b) => Math.min(1, b.week_count / b.per_week) - Math.min(1, a.week_count / a.per_week) || b.week_n - a.week_n || b.streak - a.streak);
    return { team: { id: team.id, name: team.name, code: team.code, owner: team.owner_student === me, size: ms.length, max: TEAM_MAX }, board: rows };
  }

  route('GET', '/api/students/:id/team', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    const t = await myTeam(env, st.id);
    return json(t ? await board(env, t, st.id) : { team: null, nickname: st.nickname });
  });

  route('POST', '/api/teams', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { student_id, name, nickname } = await body(req);
    const st = await requireStudent(env, acc, student_id);
    if (acc.guest) throw new HttpError(403, '组队要先注册（换手机也在队里）');
    if (await myTeam(env, st.id)) throw new HttpError(409, '已经在一个队里了，先退出再建新队');
    const nm = String(name || '').trim().slice(0, 16);
    if (!nm) throw new HttpError(400, '给队伍起个名字');
    await setName(env, st.id, nickname);
    const t = { id: uid(), code: newCode(), name: nm, owner_student: st.id };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO team (id, code, name, owner_student, created_at) VALUES (?, ?, ?, ?, ?)').bind(t.id, t.code, t.name, st.id, now()),
      env.DB.prepare('INSERT INTO team_member (team_id, student_id, joined_at) VALUES (?, ?, ?)').bind(t.id, st.id, now()),
    ]);
    await bump(env, 'team_new');
    return json(await board(env, t, st.id));
  });

  // 邀请链接打开时：看一眼是哪个队
  route('GET', '/api/teams/code/:code', async (req, env, p) => {
    await requireAccount(req, env);
    const t = await env.DB.prepare('SELECT id, name, (SELECT COUNT(*) FROM team_member m WHERE m.team_id = team.id) AS size FROM team WHERE code = ?').bind(String(p.code).toUpperCase()).first();
    if (!t) throw new HttpError(404, '没有找到这个队，邀请码可能不对');
    return json({ name: t.name, size: t.size, max: TEAM_MAX });
  });

  route('POST', '/api/teams/join', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { student_id, code, nickname } = await body(req);
    const st = await requireStudent(env, acc, student_id);
    if (acc.guest) throw new HttpError(403, '组队要先注册（换手机也在队里）');
    const t = await env.DB.prepare('SELECT id, code, name, owner_student FROM team WHERE code = ?').bind(String(code || '').trim().toUpperCase()).first();
    if (!t) throw new HttpError(404, '没有找到这个队，邀请码可能不对');
    const cur = await myTeam(env, st.id);
    if (cur && cur.id !== t.id) throw new HttpError(409, `已经在「${cur.name}」里了，先退出再加入`);
    if (!cur) {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM team_member WHERE team_id = ?').bind(t.id).first();
      if (n.n >= TEAM_MAX) throw new HttpError(409, `这个队已经满 ${TEAM_MAX} 人了`);
      await env.DB.prepare('INSERT INTO team_member (team_id, student_id, joined_at) VALUES (?, ?, ?)').bind(t.id, st.id, now()).run();
      await bump(env, 'team_join');
    }
    await setName(env, st.id, nickname);
    return json(await board(env, t, st.id));
  });

  // 退出：队长退出时交给最早加入的人；没人了就解散
  route('POST', '/api/teams/leave', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { student_id } = await body(req);
    const st = await requireStudent(env, acc, student_id);
    const t = await myTeam(env, st.id);
    if (!t) return json({ team: null });
    await env.DB.prepare('DELETE FROM team_member WHERE team_id = ? AND student_id = ?').bind(t.id, st.id).run();
    const next = await env.DB.prepare('SELECT student_id FROM team_member WHERE team_id = ? ORDER BY joined_at LIMIT 1').bind(t.id).first();
    if (!next) await env.DB.prepare('DELETE FROM team WHERE id = ?').bind(t.id).run();
    else if (t.owner_student === st.id) await env.DB.prepare('UPDATE team SET owner_student = ? WHERE id = ?').bind(next.student_id, t.id).run();
    return json({ team: null });
  });

  return {
    // 交卷时调用：这是打卡题就记打卡
    async onSubmit(env, sessionId, t) {
      const r = await env.DB.prepare('UPDATE prep_day SET done_at = ? WHERE session_id = ? AND done_at IS NULL').bind(t, sessionId).run();
      if (r.meta?.changes) await bump(env, 'daily_done');
    },
    // 会话和复盘里带上打卡信息
    async info(env, sessionId, studentId) {
      const d = await env.DB.prepare('SELECT day, done_at FROM prep_day WHERE session_id = ?').bind(sessionId).first();
      if (!d) return null;
      return { day: d.day, done: !!d.done_at, ...(d.done_at ? await streak(env, studentId, bjDay(now()), await perWeekOf(env, studentId)) : {}) };
    },
  };
}
