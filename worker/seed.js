// 题库 → 数据库行。Worker 的 /math/api/admin/seed 和命令行脚本 build-seed.mjs 共用。

/** 把知识图谱和试卷 JSON 展开成 [表名, 行对象] 列表，同时做基本校验 */
export function buildRows(knowledge, exams) {
  const rows = [];
  const kpIds = new Set();
  knowledge.points.forEach((p, i) => {
    kpIds.add(p.id);
    rows.push(['knowledge_point', {
      id: p.id, parent_id: p.parent ?? null, name: p.name,
      amc_ext: p.amc_ext ? 1 : 0, sort: p.sort ?? i,
      tier: p.tier ?? 'premium', summary: p.summary ?? null, content: p.content ?? null,
      signals: p.signals ? JSON.stringify(p.signals) : null, lesson: p.lesson ? JSON.stringify(p.lesson) : null,
      types: p.types ? JSON.stringify(p.types) : null,
    }]);
  });
  for (const [from, to] of knowledge.edges) rows.push(['kp_edge', { from_kp: from, to_kp: to }]);

  for (const ex of exams) {
    rows.push(['exam', { id: ex.id, title: ex.title, year: ex.year ?? null, grade: ex.grade ?? null, source: ex.source, duration_sec: ex.duration_sec ?? 2400, published: ex.published === false ? 0 : 1,
      sections: ex.sections ? JSON.stringify(ex.sections) : null, origin: ex.origin ?? null }]);
    for (const p of ex.problems) {
      const pid = `${ex.id}-p${String(p.number).padStart(2, '0')}`;
      const keys = Object.keys(p.choices || {});
      // 选择题：答案是选项字母之一；填空题（没有选项）：答案是要填的内容，accept 是其他可接受的写法
      if (keys.length ? !keys.includes(p.answer) : !String(p.answer ?? '').trim()) throw new Error(`${pid}: 答案 ${p.answer} 不对（选项 ${keys.join('') || '无，填空题'}）`);
      rows.push(['problem', {
        id: pid, exam_id: ex.id, number: p.number, stem: p.stem, stem_zh: p.stem_zh ?? null, figure: p.figure ?? null,
        choices: JSON.stringify(p.choices || {}), choices_zh: p.choices_zh ? JSON.stringify(p.choices_zh) : null, answer: String(p.answer), difficulty: p.difficulty ?? null,
        accept: p.accept?.length ? JSON.stringify(p.accept) : null,
        reviewed: p.reviewed === false ? 0 : 1, types: p.types ? JSON.stringify(p.types) : null,
        section: p.section ?? null, input_hint: p.input_hint ?? null,
        kind: p.kind ?? null, points: p.points ?? null, extra: p.extra ? JSON.stringify(p.extra) : null,
      }]);
      (p.hints ?? []).forEach((h, i) => rows.push(['hint', { problem_id: pid, level: i + 1, content: h }]));
      if (p.basic) rows.push(['solution', { id: `${pid}-basic`, problem_id: pid, kind: 'basic', tier: 'free', content: p.basic, url: null }]);
      if (p.advanced) rows.push(['solution', {
        id: `${pid}-adv`, problem_id: pid, kind: 'advanced', tier: 'premium',
        content: typeof p.advanced === 'string' ? p.advanced : JSON.stringify(p.advanced), url: p.advanced_url ?? null,
      }]);
      for (const [kp, w] of Object.entries(p.kps ?? {})) {
        if (!kpIds.has(kp)) throw new Error(`${pid}: 知识点 ${kp} 不在知识图谱里`);
        rows.push(['problem_kp', { problem_id: pid, kp_id: kp, weight: w }]);
      }
    }
  }
  return rows;
}

/** 建表 SQL 拆成单条语句（去掉注释和 PRAGMA） */
export function schemaStatements(schemaSql) {
  return schemaSql
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((s) => s.trim())
    .filter((s) => s && !/^PRAGMA/i.test(s));
}

// 主键：用 UPSERT 而不是 INSERT OR REPLACE —— REPLACE 会先删后插，
// 已有作答记录（外键引用）的题目会被拒绝或丢失关联
const KEYS = {
  knowledge_point: ['id'], kp_edge: ['from_kp', 'to_kp'], exam: ['id'], problem: ['id'],
  hint: ['problem_id', 'level'], solution: ['id'], problem_kp: ['problem_id', 'kp_id'],
};
function upsertSql(table, obj) {
  const cols = Object.keys(obj);
  const keys = KEYS[table];
  const upd = cols.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (${keys.join(', ')}) DO ` +
    (upd.length ? `UPDATE SET ${upd.join(', ')}` : 'NOTHING');
}

// 已上线的库需要补的列（CREATE TABLE IF NOT EXISTS 不会给旧表加列）
import { BILLING_MIGRATIONS } from './billing.js';
import { ENGLISH_MIGRATIONS } from './english.js';
const MIGRATIONS = [
  'ALTER TABLE problem ADD COLUMN stem_zh TEXT', 'ALTER TABLE problem ADD COLUMN choices_zh TEXT',
  'ALTER TABLE knowledge_point ADD COLUMN signals TEXT', 'ALTER TABLE knowledge_point ADD COLUMN lesson TEXT',
  'ALTER TABLE knowledge_point ADD COLUMN types TEXT', 'ALTER TABLE problem ADD COLUMN types TEXT',
  'ALTER TABLE exam_session ADD COLUMN title TEXT', 'ALTER TABLE exam_session ADD COLUMN kp_id TEXT',
  'ALTER TABLE exam ADD COLUMN grade INTEGER',      // 分年级的考试（希望数学）：4 = 四年级 … 8 = 初二
  'ALTER TABLE problem ADD COLUMN accept TEXT',     // 填空题其他可接受的写法（JSON 数组）
  // 语文（汉字小达人）：大题划分、来源说明、填空输入提示；会话所属科目（数学 / 语文的成绩和错题分开）
  'ALTER TABLE exam ADD COLUMN sections TEXT',      // JSON [{no, from, to, name, title}]
  'ALTER TABLE exam ADD COLUMN origin TEXT',
  'ALTER TABLE problem ADD COLUMN section INTEGER',
  'ALTER TABLE problem ADD COLUMN input_hint TEXT',
  'ALTER TABLE exam_session ADD COLUMN subject TEXT', // NULL = 数学（旧数据）
  // 笔试卷（古诗文大会决选）：题型 judge 判断 / self 简答自评；每题分值（NULL = 1 分）；
  // extra = {disp 显示题号, group 共用材料 {id, text}, rubric 简答得分点 [{text, pts}]}；作答得分 got（NULL = 按对错 0/1）
  'ALTER TABLE problem ADD COLUMN kind TEXT',
  'ALTER TABLE problem ADD COLUMN points REAL',
  'ALTER TABLE problem ADD COLUMN extra TEXT',
  'ALTER TABLE attempt_event ADD COLUMN got REAL',
  // 飞花令（语文会员版）：孩子点「我会背了」的诗句，跟着账号走
  // 每日背诗：每篇的背诵进度（stage 0 = 学过没背会，1..5 = 第几轮复习；due_at 下次复习时间）
  `CREATE TABLE IF NOT EXISTS poem_progress (student_id TEXT NOT NULL REFERENCES student(id), poem INTEGER NOT NULL,
     stage INTEGER NOT NULL DEFAULT 0, due_at INTEGER, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
     first_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (student_id, poem))`,
  `CREATE TABLE IF NOT EXISTS feihua_done (student_id TEXT NOT NULL REFERENCES student(id), line TEXT NOT NULL,
     created_at INTEGER NOT NULL, PRIMARY KEY (student_id, line))`,
  `CREATE TABLE IF NOT EXISTS session_problem (session_id TEXT NOT NULL REFERENCES exam_session(id),
     problem_id TEXT NOT NULL REFERENCES problem(id), ord INTEGER NOT NULL, PRIMARY KEY (session_id, problem_id))`,
  // 错题打印链接（微信里不能存文件时，换到浏览器打开；24 小时有效）
  `CREATE TABLE IF NOT EXISTS print_job (token TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES student(id),
     payload TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  ...BILLING_MIGRATIONS,
  ...ENGLISH_MIGRATIONS,
  // 索引：按常用查询条件建，避免每次把整张表扫一遍（D1 按读到的行数计费 / 限额）
  'CREATE INDEX IF NOT EXISTS idx_ae_session ON attempt_event(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_ae_student_problem ON attempt_event(student_id, problem_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_student ON exam_session(student_id, submitted_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_student_exam ON exam_session(student_id, exam_id, submitted_at)',
  'CREATE INDEX IF NOT EXISTS idx_solution_problem ON solution(problem_id, kind)',
  'CREATE INDEX IF NOT EXISTS idx_pk_kp ON problem_kp(kp_id)',
  'CREATE INDEX IF NOT EXISTS idx_student_account ON student(account_id)',
  'CREATE INDEX IF NOT EXISTS idx_entitlement_account ON entitlement(account_id)',
  'CREATE INDEX IF NOT EXISTS idx_order_account ON pay_order(account_id, created_at)',
  // 每套卷的题数（导入时算好，试卷列表不用每次数题）
  'ALTER TABLE exam ADD COLUMN problem_count INTEGER',
  // 考情统计等「所有人都一样、只在导入题目时变」的结果，算一次存起来
  'CREATE TABLE IF NOT EXISTS stat_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL)',
];
// 每次都执行的数据修正（幂等）
const FIXUPS = [
  "UPDATE exam SET published = 0 WHERE id = 'sample-2026'", // 示例卷下线
  'UPDATE exam SET problem_count = (SELECT COUNT(*) FROM problem p WHERE p.exam_id = exam.id) WHERE problem_count IS NULL', // 旧库补题数（之后只扫 exam 表）
  "INSERT OR IGNORE INTO exam (id, title, year, source, duration_sec, published) VALUES ('drill', '知识点突击', NULL, 'system', 0, 0)", // 突击会话挂在这个隐藏试卷下
];

/** 给旧表补列（已存在则跳过）；表还不存在时什么也不做，留给 seed 建表 */
export async function migrate(db) {
  for (const m of MIGRATIONS) {
    try { await db.prepare(m).run(); } catch (e) { if (!/duplicate column|no such table/i.test(String(e.message))) throw e; }
  }
  for (const f of FIXUPS) {
    try { await db.prepare(f).run(); } catch (e) { if (!/no such table/i.test(String(e.message))) throw e; }
  }
}

async function ensureSchema(db, schema) {
  await db.batch(schemaStatements(schema).map((s) => db.prepare(s)));
  await migrate(db);
}

async function writeRows(db, rows) {
  const stmts = rows.map(([t, o]) => db.prepare(upsertSql(t, o)).bind(...Object.values(o)));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
}

const KP_FIELDS = ['parent_id', 'name', 'amc_ext', 'sort', 'tier', 'summary', 'content', 'signals', 'lesson', 'types'];

/** 知识点部分更新：只改 JSON 里出现的字段；不存在的知识点会新建（需要 name） */
async function upsertPoints(db, points) {
  const stmts = [];
  for (const p of points) {
    if (!p.id) throw new Error('知识点缺少 id');
    const row = { id: p.id };
    if ('parent' in p) row.parent_id = p.parent;
    for (const f of KP_FIELDS) if (f in p && f !== 'parent_id') row[f] = p[f];
    if ('amc_ext' in row) row.amc_ext = row.amc_ext ? 1 : 0;
    for (const f of ['signals', 'lesson', 'types']) if (f in row && row[f] !== null && typeof row[f] !== 'string') row[f] = JSON.stringify(row[f]);
    const ins = { name: p.name ?? p.id, ...row };
    const cols = Object.keys(ins);
    const upd = Object.keys(row).filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`);
    stmts.push(db.prepare(
      `INSERT INTO knowledge_point (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (id) DO ` +
      (upd.length ? `UPDATE SET ${upd.join(', ')}` : 'NOTHING')).bind(...Object.values(ins)));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

/** 导入试卷和 / 或知识点（知识点课程等付费内容放私有仓库，从这里导入） */
export async function importContent(db, { schema, exams = [], points = [], edges = null, prune = false }) {
  await ensureSchema(db, schema);
  if (points.length) await upsertPoints(db, points);
  // 前置关系：给了 edges 就整体替换
  if (Array.isArray(edges)) {
    await db.prepare('DELETE FROM kp_edge').run();
    const st = edges.map(([a, b]) => db.prepare('INSERT OR IGNORE INTO kp_edge (from_kp, to_kp) VALUES (?, ?)').bind(a, b));
    for (let i = 0; i < st.length; i += 80) await db.batch(st.slice(i, i + 80));
  }
  // 换知识体系时删掉不在新图谱里的旧知识点（连同引用它们的考点、前置、掌握度；作答记录不受影响）
  let pruned = 0;
  if (prune && points.length) {
    const keep = points.map((p) => p.id);
    const notIn = `NOT IN (${keep.map(() => '?').join(',')})`;
    await db.batch([
      db.prepare(`DELETE FROM problem_kp WHERE kp_id ${notIn}`).bind(...keep),
      db.prepare(`DELETE FROM mastery WHERE kp_id ${notIn}`).bind(...keep),
      db.prepare(`DELETE FROM kp_edge WHERE from_kp ${notIn} OR to_kp ${notIn}`).bind(...keep, ...keep),
    ]);
    for (let round = 0; round < 5; round++) { // 先删叶子再删父节点
      const r = await db.prepare(`DELETE FROM knowledge_point WHERE id ${notIn} AND id NOT IN (SELECT parent_id FROM knowledge_point WHERE parent_id IS NOT NULL)`).bind(...keep).run();
      pruned += r.meta?.changes ?? 0;
      if (!(r.meta?.changes)) break;
    }
  }
  const { results } = await db.prepare('SELECT id FROM knowledge_point').all();
  const knowledge = { points: results.map((r) => ({ id: r.id, name: r.id })), edges: [] }; // 只用来校验题目的考点 id
  const rows = buildRows(knowledge, exams).filter(([t]) => t !== 'knowledge_point' && t !== 'kp_edge');
  // 先清掉这些试卷旧的提示 / 解析 / 考点，避免删掉的条目残留
  for (const ex of exams) {
    await db.batch(['hint', 'solution', 'problem_kp'].map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE problem_id IN (SELECT id FROM problem WHERE exam_id = ?)`).bind(ex.id)));
  }
  await writeRows(db, rows);
  await afterContent(db, exams.map((e) => e.id));
  return { rows: rows.length, points: points.length, edges: Array.isArray(edges) ? edges.length : undefined, pruned, exams: exams.map((e) => `${e.id}（${e.problems.length} 题）`) };
}

/** 在 D1 上建表并写入题库（可重复执行） */
export async function seedDatabase(db, { schema, knowledge, exams }) {
  await ensureSchema(db, schema);
  const rows = buildRows(knowledge, exams);
  await writeRows(db, rows);
  await afterContent(db, exams.map((e) => e.id));
  return { rows: rows.length, exams: exams.map((e) => e.id) };
}

/** 题目变了之后：更新这些卷的题数，清掉考情等统计缓存（下次打开时重算一次） */
async function afterContent(db, examIds) {
  try {
    if (examIds.length) await db.batch(examIds.map((id) => db.prepare('UPDATE exam SET problem_count = (SELECT COUNT(*) FROM problem p WHERE p.exam_id = ?) WHERE id = ?').bind(id, id)));
    await db.prepare('DELETE FROM stat_cache').run();
  } catch (e) { if (!/no such (table|column)/i.test(String(e.message))) throw e; }
}

/** 生成可在 wrangler d1 execute 中执行的 SQL 文本 */
export function rowsToSql(rows) {
  const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  return rows.map(([t, o]) => {
    const parts = upsertSql(t, o).split('?'); // 占位符只出现在 VALUES 里，值本身不参与拆分
    const vals = Object.values(o).map(q);
    return parts.map((part, i) => part + (i < vals.length ? vals[i] : '')).join('') + ';';
  }).join('\n');
}
