// 备战计划 + 每日打卡（数学、语文；连续天数和积分全站共用：哪一科打了卡都算今天打过）
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
  // 积分：每道题第一次答对加一次（没用提示 10、用了提示 5），每次打卡 20；同一件事只记一次（kind + ref 唯一）
  `CREATE TABLE IF NOT EXISTS points_log (student_id TEXT NOT NULL REFERENCES student(id), kind TEXT NOT NULL, ref TEXT NOT NULL,
     pts INTEGER NOT NULL, session_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (student_id, kind, ref))`,
  'CREATE INDEX IF NOT EXISTS idx_points_student ON points_log(student_id, created_at)',
  // 练习里每题第一次提交的结果：以它为准（改答案再提交不加分）
  `CREATE TABLE IF NOT EXISTS session_check (session_id TEXT NOT NULL, problem_id TEXT NOT NULL, correct INTEGER NOT NULL,
     created_at INTEGER NOT NULL, PRIMARY KEY (session_id, problem_id))`,
  // 备考项：每个考试一项（数学 AMC 8、语文汉字小达人 / 古诗文大会……），每项每天一次打卡；连续天数和积分全站共用
  `CREATE TABLE IF NOT EXISTS prep_item (student_id TEXT NOT NULL REFERENCES student(id), family TEXT NOT NULL, subject TEXT NOT NULL, grade INTEGER,
     exam_date TEXT NOT NULL, per_day INTEGER NOT NULL, per_week INTEGER NOT NULL DEFAULT 7, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
     PRIMARY KEY (student_id, family))`,
  `CREATE TABLE IF NOT EXISTS checkin (student_id TEXT NOT NULL REFERENCES student(id), day TEXT NOT NULL, family TEXT NOT NULL, subject TEXT NOT NULL,
     session_id TEXT NOT NULL, kind TEXT NOT NULL, done_at INTEGER, PRIMARY KEY (student_id, day, family))`,
  'CREATE INDEX IF NOT EXISTS idx_checkin_session ON checkin(session_id)',
  'ALTER TABLE exam_session ADD COLUMN part TEXT', // 英语打卡：只做这套卷子里的这几个 Part
  // 只有数学时建的两张表：搬过来后清空（顺序执行，搬完才清）
  `INSERT OR IGNORE INTO prep_item (student_id, family, subject, exam_date, per_day, per_week, created_at, updated_at)
     SELECT student_id, family, 'math', exam_date, per_day, per_week, created_at, updated_at FROM prep_plan`,
  'DELETE FROM prep_plan',
  `INSERT OR IGNORE INTO checkin (student_id, day, family, subject, session_id, kind, done_at) SELECT student_id, day, 'amc8', 'math', session_id, kind, done_at FROM prep_day`,
  'DELETE FROM prep_day',
];
export const PTS = { solve: 10, solve_hint: 5, checkin: 20, solve_chinese: 3 };
/** 记一笔积分；已经记过（同一道题 / 同一天打卡）返回 0 */
export async function award(env, sid, kind, ref, pts, sessionId, t) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO points_log (student_id, kind, ref, pts, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sid, kind, ref, pts, sessionId ?? null, t).run();
  return r.meta?.changes ? pts : 0;
}
const TEAM_MAX = 30;

// 能打卡的考试：grades = 适合哪些年级（1–9，7–9 是初中）；next = 下一次考试日期（官方公布了才写，没写的让家长自己选）
// byGrade = 按年级分卷（出题时挑和孩子年级最接近的卷子）；mock = 原创仿真题（英语）
const PREP_FAMILIES = {
  amc8: { name: 'AMC 8', prefix: 'amc8-', subject: 'math', grades: [3, 4, 5, 6, 7, 8], next: [['2027-01-21', '2027 年 1 月 21–27 日']] },
  amc10: { name: 'AMC 10', prefix: 'amc10-', subject: 'math', grades: [7, 8, 9] },
  amc12: { name: 'AMC 12', prefix: 'amc12-', subject: 'math', grades: [8, 9] },
  kangaroo: { name: '袋鼠数学', prefix: 'kangaroo-', subject: 'math', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9], byGrade: true },
  hope: { name: '希望数学', prefix: 'hope-', subject: 'math', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9], byGrade: true },
  swb100: { name: '思维 100', prefix: 'swb100-', subject: 'math', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9], byGrade: true },
  hanzi: { name: '汉字小达人', prefix: 'hanzi-', subject: 'chinese', grades: [1, 2, 3, 4, 5] },
  gushiwen: { name: '古诗文大会', prefix: 'gsw-', subject: 'chinese', grades: [3, 4, 5, 6, 7, 8, 9], byGrade: true },
  ket: { name: 'KET', prefix: 'ket-', subject: 'english', grades: [3, 4, 5, 6, 7, 8, 9], mock: true },
  pet: { name: 'PET', prefix: 'pet-', subject: 'english', grades: [4, 5, 6, 7, 8, 9], mock: true },
  toefljr: { name: '小托福', prefix: 'toefljr-', subject: 'english', grades: [4, 5, 6, 7, 8, 9], mock: true },
};
// 每科：轻松 / 认真 / 冲刺 各几题（英语是几个 Part）；没计划时每天几题、默认练哪个考试
export const PREP_SUBJECTS = {
  math: { per: [2, 5, 10], daily: 2, name: '数学', fam: 'amc8', unit: '题' },
  chinese: { per: [10, 20, 30], daily: 10, name: '语文', fam: 'hanzi', unit: '题' },
  english: { per: [1, 2, 3], daily: 1, name: '英语', fam: 'ket', unit: '个 Part' },
};
const SELF_KINDS = new Set(['email', 'story', 'choose']); // 英语写作：要自评，不进打卡
const LEVELS = ['easy', 'normal', 'hard'];
const DAY = 86400000;
const UNTIMED_DAYS = 30;
const HIGH_RATE = 50; // 高频知识项：一半以上的届数都考过
// 古诗文按学段出题：小学按年级，初中分预初·初一（6）、初二·初三（8）
const gswGrade = (g) => (g >= 8 ? 8 : g >= 6 ? 6 : g);

const parseJ = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const bjDay = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间的日期
const dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
// 稳定的伪随机：同一个种子永远给同一个数
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export function registerPrep({ route, json, HttpError, body, requireAccount, requireStudent, uid, now, kpStats, mistakeBook, bump, gswPool, gradeOk }) {
  const items = async (env, sid) => (await env.DB.prepare('SELECT family, subject, grade, exam_date, per_day, per_week, created_at FROM prep_item WHERE student_id = ? ORDER BY created_at, family').bind(sid).all()).results;
  const getPlan = (env, sid, family) => env.DB.prepare('SELECT family, subject, grade, exam_date, per_day, per_week, created_at FROM prep_item WHERE student_id = ? AND family = ?').bind(sid, family).first();
  // 连续按天还是按周：一周几次是所有备考项共用的
  const perWeekOf = async (env, sid) => (await env.DB.prepare('SELECT MAX(per_week) AS w FROM prep_item WHERE student_id = ?').bind(sid).first())?.w || 7;

  // 连续：每天练的按天算（今天打了从今天往前数，没打从昨天往前数）；一周几次的按周算（每周打满目标次数算一周达标，本周达标了也算上）
  async function streak(env, sid, today, perWeek = 7) {
    const { results } = await env.DB.prepare('SELECT DISTINCT day FROM checkin WHERE student_id = ? AND done_at IS NOT NULL ORDER BY day DESC LIMIT 400').bind(sid).all();
    const done = new Set(results.map((r) => r.day));
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const mon = dayNum(today) - dow; // 本周一
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

  async function highItems(env, family) {
    const st = await kpStats(env, family);
    const { results: names } = await env.DB.prepare('SELECT id, name FROM knowledge_point WHERE parent_id IS NOT NULL').all();
    const name = Object.fromEntries(names.map((r) => [r.id, r.name]));
    const all = Object.entries(st.kps).map(([id, k]) => ({ id, name: name[id] || id, per_exam: k.per_exam, rate: k.rate })).sort((a, b) => b.per_exam - a.per_exam);
    return { all, high: all.filter((x) => x.rate >= HIGH_RATE) };
  }

  // 语文：从汉字小达人真题 / 古诗文题库里出没做过的题；错题本里该订正、该复习的混进来
  async function chineseProblems(env, sid, plan, today) {
    const n = plan?.per_day || PREP_SUBJECTS.chinese.daily;
    const fam = plan?.family || 'hanzi';
    const { results: seenRows } = await env.DB
      .prepare(`SELECT problem_id FROM attempt_event WHERE student_id = ? UNION
                SELECT sp.problem_id FROM session_problem sp JOIN checkin d ON d.session_id = sp.session_id WHERE d.student_id = ?`)
      .bind(sid, sid).all();
    const seen = new Set(seenRows.map((r) => r.problem_id));
    let pool;
    if (fam === 'gushiwen') pool = (await gswPool(env)).filter((x) => gradeOk(x, plan?.grade || null)).map((x) => x.id);
    else pool = (await env.DB.prepare(`SELECT p.id FROM problem p JOIN exam e ON e.id = p.exam_id WHERE e.published = 1 AND e.source = 'official'
                                         AND p.id LIKE 'hanzi-%' AND p.kind = 'choice' ORDER BY p.id`).all()).results.map((r) => r.id);
    const fresh = pool.filter((id) => !seen.has(id));
    const src = fresh.length >= n ? fresh : pool;
    const ms = (await mistakeBook(env, sid, 'chinese')).filter((m) => (m.status === 'pending' || m.status === 'due') && m.problem_id.startsWith(PREP_FAMILIES[fam].prefix))
      .sort((a, b) => a.last_wrong_at - b.last_wrong_at).slice(0, Math.floor(n / 5)).map((m) => m.problem_id);
    const picked = src.map((id) => [hash(sid + today + id), id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).filter((id) => !ms.includes(id)).slice(0, n - ms.length);
    return [...picked, ...ms];
  }

  const seenSet = async (env, sid) => new Set((await env.DB
    .prepare(`SELECT problem_id FROM attempt_event WHERE student_id = ? UNION
              SELECT sp.problem_id FROM session_problem sp JOIN checkin d ON d.session_id = sp.session_id WHERE d.student_id = ?`)
    .bind(sid, sid).all()).results.map((r) => r.problem_id));

  // 其他数学比赛（AMC 10/12、袋鼠、希望、思维 100）：按年级挑卷子，出没做过的题，题号从前往后（先易后难）混着来
  async function genericProblems(env, sid, plan, family, today) {
    const f = PREP_FAMILIES[family];
    const n = plan?.per_day || PREP_SUBJECTS[f.subject].daily;
    const { results } = await env.DB.prepare(`SELECT p.id, p.number, e.grade FROM problem p JOIN exam e ON e.id = p.exam_id
        WHERE e.published = 1 AND e.source = 'official' AND p.id LIKE ? AND COALESCE(p.kind, '') != 'self' ORDER BY p.id`).bind(f.prefix + '%').all();
    let pool = results;
    if (f.byGrade && plan?.grade) {
      const gs = [...new Set(results.map((r) => r.grade).filter((x) => x != null))].sort((a, b) => a - b);
      const g = gs.filter((x) => x <= plan.grade).pop() ?? gs[0];
      if (g != null) pool = results.filter((r) => r.grade === g || r.grade == null);
    }
    const seen = await seenSet(env, sid);
    const fresh = pool.filter((r) => !seen.has(r.id));
    const src = fresh.length >= n ? fresh : pool;
    return src.map((r) => [r.number + hash(sid + today + r.id) * 12, r.id]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
  }

  // 英语：按套、按 Part 往下做（写作要自评，跳过）；一次 1–3 个 Part，都在同一份卷子里
  async function englishPart(env, sid, plan, family) {
    const f = PREP_FAMILIES[family];
    const want = plan?.per_day || 1;
    const { results: exams } = await env.DB.prepare('SELECT id, sections FROM exam WHERE published = 1 AND id LIKE ?').bind(f.prefix + '%').all();
    const num = (id) => Number((id.match(/-(\d+)-/) || [])[1] || 0);
    const paper = (id) => ({ rw: 0, r: 0, f: 1, l: 2 }[id.split('-').pop()] ?? 3);
    exams.sort((a, b) => num(a.id) - num(b.id) || paper(a.id) - paper(b.id));
    const { results: doneRows } = await env.DB.prepare(`SELECT DISTINCT p.exam_id || '|' || json_extract(p.extra, '$.group') AS k FROM attempt_event ae JOIN problem p ON p.id = ae.problem_id
        WHERE ae.student_id = ? AND p.id LIKE ?`).bind(sid, f.prefix + '%').all();
    const { results: asg } = await env.DB.prepare(`SELECT s.exam_id, s.part FROM checkin c JOIN exam_session s ON s.id = c.session_id WHERE c.student_id = ? AND s.part IS NOT NULL`).bind(sid).all();
    const done = new Set(doneRows.map((r) => r.k));
    for (const a of asg) for (const g of String(a.part).split(',')) done.add(`${a.exam_id}|${g}`);
    for (const pass of [0, 1]) { // 全做过了就从头再来
      for (const e of exams) {
        if (e.id.endsWith('-w')) continue;
        const all = parseJ(e.sections)?.[0]?.groups || [];
        const gs = all.filter((g) => !SELF_KINDS.has(g.kind) && (pass || !done.has(`${e.id}|${g.id}`))).slice(0, want);
        // 名字：KET / PET 用 Part 几；小托福的组没有名字，按第几篇
        if (gs.length) return { exam_id: e.id, part: gs.map((g) => g.id).join(','), label: gs.map((g) => (g.name ? g.name.replace(/^(Reading|Listening) /, '') : `第 ${all.indexOf(g) + 1} 篇`)).join('、') };
      }
    }
    return null;
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
                SELECT sp.problem_id FROM session_problem sp JOIN checkin d ON d.session_id = sp.session_id WHERE d.student_id = ?`)
      .bind(sid, sid).all();
    const seen = new Set(seenRows.map((r) => r.problem_id));
    const { results: assigned } = await env.DB
      .prepare(`SELECT pk.kp_id, COUNT(*) AS c FROM session_problem sp JOIN checkin d ON d.session_id = sp.session_id
                  JOIN problem_kp pk ON pk.problem_id = sp.problem_id AND pk.weight >= 1
                 WHERE d.student_id = ? AND d.family = 'amc8' AND d.kind = 'plan' AND d.day >= ? GROUP BY pk.kp_id`)
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

  // 积分：总数和本周（周一起）
  async function points(env, sid, today) {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monT = (dayNum(today) - dow) * DAY - 8 * 3600e3; // 北京时间本周一 0 点
    const r = await env.DB.prepare('SELECT COALESCE(SUM(pts), 0) AS total, COALESCE(SUM(CASE WHEN created_at >= ? THEN pts END), 0) AS week FROM points_log WHERE student_id = ?')
      .bind(monT, sid).first();
    return { total: r?.total || 0, week: r?.week || 0 };
  }

  // 每个考试：有几套真题、适合哪些年级、下一次考试（今天以后最近的一次）
  // 英语按「套」数（一套拆成两三份卷子）
  async function families(env, today) {
    const out = [];
    for (const [id, f] of Object.entries(PREP_FAMILIES)) {
      const r = f.mock
        ? await env.DB.prepare("SELECT COUNT(*) AS n FROM exam WHERE published = 1 AND id LIKE ? AND id LIKE '%-l'").bind(f.prefix + '%').first()
        : await env.DB.prepare("SELECT COUNT(*) AS n FROM exam WHERE published = 1 AND source = 'official' AND id LIKE ?").bind(f.prefix + '%').first();
      if (!r?.n) continue; // 还没录题的不列
      const nx = (f.next || []).find(([d]) => d > today);
      out.push({ id, name: f.name, subject: f.subject, subject_name: PREP_SUBJECTS[f.subject].name, exams: r.n, sets: f.mock ? `${r.n} 套仿真题` : `${r.n} 套真题`, grades: f.grades,
        next: nx ? { date: nx[0], label: nx[1] } : null, per: PREP_SUBJECTS[f.subject].per, unit: PREP_SUBJECTS[f.subject].unit });
    }
    return out;
  }

  // 首页、各科主页的打卡卡片：备考项（没定计划但最近两周在打卡的科目也算一项「每日练习」）+ 今天每项做没做
  async function status(env, sid) {
    const t = now(), today = bjDay(t);
    const plans = await items(env, sid);
    const { results: days } = await env.DB.prepare(`SELECT c.family, c.subject, c.day, c.session_id, c.done_at,
        (SELECT COUNT(*) FROM session_problem sp WHERE sp.session_id = c.session_id) + (SELECT COUNT(*) FROM problem p JOIN exam_session s ON s.id = c.session_id
           WHERE s.part IS NOT NULL AND p.exam_id = s.exam_id AND instr(',' || s.part || ',', ',' || json_extract(p.extra, '$.group') || ',') > 0) AS n
                                                     FROM checkin c WHERE c.student_id = ? AND c.day >= ? ORDER BY c.day DESC`).bind(sid, new Date((dayNum(today) - 14) * DAY).toISOString().slice(0, 10)).all();
    const todayOf = (fam) => { const d = days.find((x) => x.family === fam && x.day === today); return d ? { session_id: d.session_id, n: d.n, done: !!d.done_at } : null; };
    const out = [];
    for (const p of plans) {
      const f = PREP_FAMILIES[p.family]; if (!f) continue;
      const it = { family: p.family, subject: p.subject, name: f.name, subject_name: PREP_SUBJECTS[p.subject].name, plan: true, exam_date: p.exam_date,
        days_left: dayNum(p.exam_date) - dayNum(today), per_day: p.per_day, grade: p.grade, today: todayOf(p.family) };
      if (p.family === 'amc8') {
        const { high } = await highItems(env, 'amc8');
        const hist = await itemHistory(env, sid, p.created_at);
        it.cover = { done: high.filter((x) => hist[x.id]?.since).length, total: high.length };
      }
      out.push(it);
    }
    for (const d of days) { // 没计划、最近在做「每日练习」的
      if (out.some((x) => x.family === d.family)) continue;
      const f = PREP_FAMILIES[d.family]; if (!f) continue;
      out.push({ family: d.family, subject: d.subject, name: f.name, subject_name: PREP_SUBJECTS[d.subject].name, plan: false, per_day: PREP_SUBJECTS[d.subject].daily, today: todayOf(d.family) });
    }
    const first = plans[0];
    const level = first ? LEVELS[Math.max(0, PREP_SUBJECTS[first.subject].per.indexOf(first.per_day))] : 'easy';
    for (const it of out) it.unit = PREP_SUBJECTS[it.subject].unit;
    return { today, ...(await streak(env, sid, today, await perWeekOf(env, sid))), grade: first?.grade ?? null, level, items: out,
      subjects: Object.entries(PREP_SUBJECTS).map(([id, x]) => ({ id, name: x.name })),
      families: await families(env, today), points: await points(env, sid, today) };
  }

  route('GET', '/api/students/:id/prep', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    return json(await status(env, st.id));
  });

  // 定计划（新手引导、计划页一起存）：{ grade, per_week, level, items: [{ family, exam_date }] }；不在 items 里的备考项删掉
  route('PUT', '/api/students/:id/prep', async (req, env, p) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    const { grade, per_week = 7, level = 'easy', items: want = [], merge = false } = await body(req); // merge：只加 / 改这几项，别的不动（「＋ 备考项」）
    const g = Number(grade);
    if (!(Number.isInteger(g) && g >= 1 && g <= 9)) throw new HttpError(400, '请选择年级');
    if (![3, 5, 7].includes(Number(per_week))) throw new HttpError(400, '一周练 3 次、5 次或每天');
    if (!LEVELS.includes(level)) throw new HttpError(400, '每次练多少没选');
    if (!Array.isArray(want) || want.length > Object.keys(PREP_FAMILIES).length) throw new HttpError(400, '备考项不对');
    const today = bjDay(now());
    for (const it of want) {
      if (!PREP_FAMILIES[it.family]) throw new HttpError(400, '暂时不支持这个考试');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.exam_date || '') || isNaN(Date.parse(it.exam_date))) throw new HttpError(400, `请选择${PREP_FAMILIES[it.family].name}的考试日期`);
      if (it.exam_date <= today) throw new HttpError(400, '考试日期要在今天之后');
      if (dayNum(it.exam_date) - dayNum(today) > 730) throw new HttpError(400, '考试日期太远了');
    }
    const t = now();
    const old = await items(env, st.id);
    const keep = new Set(want.map((x) => x.family));
    const stmts = (merge ? [] : old).filter((o) => !keep.has(o.family)).map((o) => env.DB.prepare('DELETE FROM prep_item WHERE student_id = ? AND family = ?').bind(st.id, o.family));
    for (const it of want) {
      const f = PREP_FAMILIES[it.family], per = PREP_SUBJECTS[f.subject].per[LEVELS.indexOf(level)];
      const o = old.find((x) => x.family === it.family);
      stmts.push(env.DB.prepare(`INSERT INTO prep_item (student_id, family, subject, grade, exam_date, per_day, per_week, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (student_id, family) DO UPDATE SET grade = excluded.grade, exam_date = excluded.exam_date, per_day = excluded.per_day, per_week = excluded.per_week, updated_at = excluded.updated_at`)
        .bind(st.id, it.family, f.subject, f.byGrade ? gswGrade(g) : g, it.exam_date, per, Number(per_week), o?.created_at ?? t, t));
    }
    // 今天还没开始做的打卡题按新计划重出
    const { results: fresh } = await env.DB.prepare("SELECT c.family, c.session_id FROM checkin c JOIN exam_session s ON s.id = c.session_id WHERE c.student_id = ? AND c.day = ? AND c.done_at IS NULL AND (s.draft IS NULL OR s.draft = '')")
      .bind(st.id, today).all();
    for (const d of fresh) stmts.push( // 还没动过的会话一起删掉，免得出现在「继续答题」里
      env.DB.prepare('DELETE FROM checkin WHERE student_id = ? AND day = ? AND family = ?').bind(st.id, today, d.family),
      env.DB.prepare('DELETE FROM session_problem WHERE session_id = ?').bind(d.session_id),
      env.DB.prepare('DELETE FROM exam_session WHERE id = ? AND submitted_at IS NULL').bind(d.session_id));
    if (stmts.length) await env.DB.batch(stmts);
    if (!old.length && want.length) await bump(env, 'prep_plan');
    return json(await status(env, st.id));
  });

  // 今天这一项的打卡题：第一次打开时出题、建练习会话；之后一直返回同一个。family 不给 = 按 subject 的默认考试
  route('POST', '/api/students/:id/prep/today', async (req, env, p, url) => {
    const acc = await requireAccount(req, env);
    const st = await requireStudent(env, acc, p.id);
    const subj = PREP_SUBJECTS[url.searchParams.get('subject')] ? url.searchParams.get('subject') : 'math';
    const family = PREP_FAMILIES[url.searchParams.get('family')] ? url.searchParams.get('family') : PREP_SUBJECTS[subj].fam;
    const subject = PREP_FAMILIES[family].subject;
    const t = now(), today = bjDay(t);
    const have = await env.DB.prepare('SELECT session_id FROM checkin WHERE student_id = ? AND day = ? AND family = ?').bind(st.id, today, family).first();
    if (have) return json({ session_id: have.session_id, subject });
    const plan = await getPlan(env, st.id, family);
    const id = uid();
    const stmts = [];
    if (subject === 'english') {
      const pt = await englishPart(env, st.id, plan, family);
      if (!pt) throw new HttpError(404, '题库还没有题');
      const e = await env.DB.prepare('SELECT title FROM exam WHERE id = ?').bind(pt.exam_id).first();
      stmts.push(env.DB.prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, subject, part) VALUES (?, ?, ?, 'practice', ?, ?, ?, 'english', ?)")
        .bind(id, st.id, pt.exam_id, t, t + UNTIMED_DAYS * DAY, `${PREP_FAMILIES[family].name} ${e.title.replace('仿真模拟 ', '')} · ${pt.label}`, pt.part));
    } else {
      let ids;
      if (subject === 'chinese') ids = await chineseProblems(env, st.id, plan || { family }, today);
      else if (family === 'amc8') { ids = plan ? await planProblems(env, st.id, plan, today) : []; if (!ids.length) ids = await dailyTwo(env, today); }
      else ids = await genericProblems(env, st.id, plan, family, today);
      if (!ids.length) throw new HttpError(404, '题库还没有题');
      stmts.push(env.DB.prepare("INSERT INTO exam_session (id, student_id, exam_id, mode, started_at, deadline_at, title, subject) VALUES (?, ?, 'drill', 'practice', ?, ?, ?, ?)")
          .bind(id, st.id, t, t + UNTIMED_DAYS * DAY, `${PREP_FAMILIES[family].name} · 今日 ${ids.length} 题`, subject),
        ...ids.map((pid, i) => env.DB.prepare('INSERT INTO session_problem (session_id, problem_id, ord) VALUES (?, ?, ?)').bind(id, pid, i)));
    }
    await env.DB.batch([
      ...stmts,
      env.DB.prepare('INSERT INTO checkin (student_id, day, family, subject, session_id, kind) VALUES (?, ?, ?, ?, ?, ?)').bind(st.id, today, family, subject, id, plan ? 'plan' : 'daily'),
    ]);
    await bump(env, 'daily_start');
    return json({ session_id: id, subject });
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
      const q = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(ae.correct), 0) AS ok FROM checkin d JOIN attempt_event ae ON ae.session_id = d.session_id
                                      WHERE d.student_id = ? AND d.done_at IS NOT NULL AND d.day >= ?`).bind(m.id, mon).first();
      const pt = await points(env, m.id, today);
      rows.push({ nickname: m.nickname, me: m.id === me, owner: m.id === team.owner_student, week_count: sk.week_count, per_week: pw, week_points: pt.week,
        streak: sk.streak, unit: sk.unit, week_n: q?.n || 0, week_ok: q?.ok || 0, today: sk.week.find((d) => d.today)?.done || false });
    }
    // 本周积分 → 本周完成比例（次数 / 目标）→ 连续
    rows.sort((a, b) => b.week_points - a.week_points || Math.min(1, b.week_count / b.per_week) - Math.min(1, a.week_count / a.per_week) || b.streak - a.streak);
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
    // 交卷时调用：这是打卡题就记打卡（打卡积分每天只给一次，几项都打也是 20）
    async onSubmit(env, sessionId, t) {
      const r = await env.DB.prepare('UPDATE checkin SET done_at = ? WHERE session_id = ? AND done_at IS NULL').bind(t, sessionId).run();
      if (r.meta?.changes) {
        await bump(env, 'daily_done');
        const d = await env.DB.prepare('SELECT student_id, day FROM checkin WHERE session_id = ?').bind(sessionId).first();
        if (d) await award(env, d.student_id, 'checkin', d.day, PTS.checkin, sessionId, t);
      }
    },
    // 会话和复盘里带上打卡信息；next = 今天还没做完的其他备考项
    async info(env, sessionId, studentId) {
      const d = await env.DB.prepare('SELECT day, family, subject, done_at FROM checkin WHERE session_id = ?').bind(sessionId).first();
      if (!d) return null;
      const got = await env.DB.prepare('SELECT COALESCE(SUM(pts), 0) AS n FROM points_log WHERE session_id = ?').bind(sessionId).first();
      const out = { day: d.day, family: d.family, subject: d.subject, name: PREP_FAMILIES[d.family]?.name, done: !!d.done_at, points_got: got?.n || 0 };
      if (d.done_at) {
        const today = bjDay(now());
        Object.assign(out, await streak(env, studentId, today, await perWeekOf(env, studentId)), { points: await points(env, studentId, today) });
        const left = (await items(env, studentId)).filter((x) => x.family !== d.family);
        const doneToday = new Set((await env.DB.prepare('SELECT family FROM checkin WHERE student_id = ? AND day = ? AND done_at IS NOT NULL').bind(studentId, today).all()).results.map((r) => r.family));
        const nx = left.find((x) => !doneToday.has(x.family));
        if (nx) out.next = { family: nx.family, subject: nx.subject, name: PREP_FAMILIES[nx.family].name, n: nx.per_day };
      }
      return out;
    },
  };
}
