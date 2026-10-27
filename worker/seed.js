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
    }]);
  });
  for (const [from, to] of knowledge.edges) rows.push(['kp_edge', { from_kp: from, to_kp: to }]);

  for (const ex of exams) {
    rows.push(['exam', { id: ex.id, title: ex.title, year: ex.year ?? null, source: ex.source, duration_sec: ex.duration_sec ?? 2400, published: ex.published === false ? 0 : 1 }]);
    for (const p of ex.problems) {
      const pid = `${ex.id}-p${String(p.number).padStart(2, '0')}`;
      if (!'ABCDE'.includes(p.answer) || p.answer.length !== 1) throw new Error(`${pid}: 答案必须是 A–E，现在是 ${p.answer}`);
      rows.push(['problem', {
        id: pid, exam_id: ex.id, number: p.number, stem: p.stem, figure: p.figure ?? null,
        choices: JSON.stringify(p.choices), answer: p.answer, difficulty: p.difficulty ?? null,
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

const insertSql = (table, obj) =>
  `INSERT OR REPLACE INTO ${table} (${Object.keys(obj).join(', ')}) VALUES (${Object.keys(obj).map(() => '?').join(', ')})`;

/** 在 D1 上建表并写入题库（可重复执行） */
export async function seedDatabase(db, { schema, knowledge, exams }) {
  await db.batch(schemaStatements(schema).map((s) => db.prepare(s)));
  const rows = buildRows(knowledge, exams);
  const stmts = rows.map(([t, o]) => db.prepare(insertSql(t, o)).bind(...Object.values(o)));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return { rows: rows.length, exams: exams.map((e) => e.id) };
}

/** 生成可在 wrangler d1 execute 中执行的 SQL 文本 */
export function rowsToSql(rows) {
  const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  return rows.map(([t, o]) => `INSERT OR REPLACE INTO ${t} (${Object.keys(o).join(', ')}) VALUES (${Object.values(o).map(q).join(', ')});`).join('\n');
}
