// 题库 → 数据库行。Worker 的 /amc8/api/admin/seed 和命令行脚本 build-seed.mjs 共用。

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
    }]);
  });
  for (const [from, to] of knowledge.edges) rows.push(['kp_edge', { from_kp: from, to_kp: to }]);

  for (const ex of exams) {
    rows.push(['exam', { id: ex.id, title: ex.title, year: ex.year ?? null, source: ex.source, duration_sec: ex.duration_sec ?? 2400, published: ex.published === false ? 0 : 1 }]);
    for (const p of ex.problems) {
      const pid = `${ex.id}-p${String(p.number).padStart(2, '0')}`;
      if (!'ABCDE'.includes(p.answer) || p.answer.length !== 1) throw new Error(`${pid}: 答案必须是 A–E，现在是 ${p.answer}`);
      rows.push(['problem', {
        id: pid, exam_id: ex.id, number: p.number, stem: p.stem, stem_zh: p.stem_zh ?? null, figure: p.figure ?? null,
        choices: JSON.stringify(p.choices), choices_zh: p.choices_zh ? JSON.stringify(p.choices_zh) : null, answer: p.answer, difficulty: p.difficulty ?? null,
        reviewed: p.reviewed === false ? 0 : 1,
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
const MIGRATIONS = [
  'ALTER TABLE problem ADD COLUMN stem_zh TEXT', 'ALTER TABLE problem ADD COLUMN choices_zh TEXT',
  'ALTER TABLE knowledge_point ADD COLUMN signals TEXT', 'ALTER TABLE knowledge_point ADD COLUMN lesson TEXT',
  'ALTER TABLE exam_session ADD COLUMN title TEXT', 'ALTER TABLE exam_session ADD COLUMN kp_id TEXT',
  `CREATE TABLE IF NOT EXISTS session_problem (session_id TEXT NOT NULL REFERENCES exam_session(id),
     problem_id TEXT NOT NULL REFERENCES problem(id), ord INTEGER NOT NULL, PRIMARY KEY (session_id, problem_id))`,
];
// 每次都执行的数据修正（幂等）
const FIXUPS = [
  "UPDATE exam SET published = 0 WHERE id = 'sample-2026'", // 示例卷下线
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

const KP_FIELDS = ['parent_id', 'name', 'amc_ext', 'sort', 'tier', 'summary', 'content', 'signals', 'lesson'];

/** 知识点部分更新：只改 JSON 里出现的字段；不存在的知识点会新建（需要 name） */
async function upsertPoints(db, points) {
  const stmts = [];
  for (const p of points) {
    if (!p.id) throw new Error('知识点缺少 id');
    const row = { id: p.id };
    if ('parent' in p) row.parent_id = p.parent;
    for (const f of KP_FIELDS) if (f in p && f !== 'parent_id') row[f] = p[f];
    if ('amc_ext' in row) row.amc_ext = row.amc_ext ? 1 : 0;
    for (const f of ['signals', 'lesson']) if (f in row && row[f] !== null && typeof row[f] !== 'string') row[f] = JSON.stringify(row[f]);
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
export async function importContent(db, { schema, exams = [], points = [] }) {
  await ensureSchema(db, schema);
  if (points.length) await upsertPoints(db, points);
  const { results } = await db.prepare('SELECT id FROM knowledge_point').all();
  const knowledge = { points: results.map((r) => ({ id: r.id, name: r.id })), edges: [] }; // 只用来校验题目的考点 id
  const rows = buildRows(knowledge, exams).filter(([t]) => t !== 'knowledge_point' && t !== 'kp_edge');
  // 先清掉这些试卷旧的提示 / 解析 / 考点，避免删掉的条目残留
  for (const ex of exams) {
    await db.batch(['hint', 'solution', 'problem_kp'].map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE problem_id IN (SELECT id FROM problem WHERE exam_id = ?)`).bind(ex.id)));
  }
  await writeRows(db, rows);
  return { rows: rows.length, points: points.length, exams: exams.map((e) => `${e.id}（${e.problems.length} 题）`) };
}

/** 在 D1 上建表并写入题库（可重复执行） */
export async function seedDatabase(db, { schema, knowledge, exams }) {
  await ensureSchema(db, schema);
  const rows = buildRows(knowledge, exams);
  await writeRows(db, rows);
  return { rows: rows.length, exams: exams.map((e) => e.id) };
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
