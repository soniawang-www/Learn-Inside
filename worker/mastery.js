// 知识点掌握度：简化 Elo / 一参数 logistic 模型
//
// 预期答对概率  P = sigmoid(rating − difficulty)
// 每次作答      rating += K × weight × (y − P)
//
// 修正项：
//   - 用了提示还答对：y 打折（每级提示 −0.25）
//   - 错因 = careless（粗心）：扣分减半
//   - 错因 = no_time（没时间做）且未作答：不计入，避免把“慢”当成“不会”
//   - K 随证据量增大而减小，早期变化快、后期稳定
//
// 画像永远由 attempt_event 全量重算（recompute），所以以后换算法（BKT/IRT）只需改这个文件。

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** 题目难度（logit 尺度）。没有校准值时按题号线性推算：第 1 题 −1.5，最后一题 +2.5 */
export function problemDifficulty(difficulty, number, total) {
  if (difficulty !== null && difficulty !== undefined) return difficulty;
  const n = Math.max(total, 2);
  return -1.5 + (4 * (number - 1)) / (n - 1);
}

/** 对单个知识点应用一条作答记录，返回新的 {rating, evidence}，跳过时返回 null */
export function applyAttempt(state, { weight, correct, answered, hintsUsed, errorReason, difficulty }) {
  if (!answered && errorReason === 'no_time') return null;
  const K = 0.8 / (1 + 0.15 * state.evidence);
  const P = sigmoid(state.rating - difficulty);
  let y = correct ? 1 : 0;
  if (correct && hintsUsed > 0) y = Math.max(0.25, 1 - 0.25 * hintsUsed);
  let delta = K * weight * (y - P);
  if (!correct && errorReason === 'careless') delta *= 0.5;
  return { rating: state.rating + delta, evidence: state.evidence + weight };
}

/** 用某个学生的全部作答事件重算画像，写回 mastery 表 */
export async function recomputeMastery(db, studentId) {
  const { results: events } = await db
    .prepare(
      `SELECT ae.problem_id, ae.choice, ae.correct, ae.hints_used, ae.error_reason,
              p.number, p.difficulty,
              (SELECT COUNT(*) FROM problem p2 WHERE p2.exam_id = p.exam_id) AS total
         FROM attempt_event ae JOIN problem p ON p.id = ae.problem_id
        WHERE ae.student_id = ?
        ORDER BY ae.created_at, ae.id`
    )
    .bind(studentId)
    .all();

  const { results: tags } = await db.prepare('SELECT problem_id, kp_id, weight FROM problem_kp').all();
  const tagMap = new Map();
  for (const t of tags) {
    if (!tagMap.has(t.problem_id)) tagMap.set(t.problem_id, []);
    tagMap.get(t.problem_id).push(t);
  }

  const state = new Map(); // kp_id → {rating, evidence}
  for (const e of events) {
    const difficulty = problemDifficulty(e.difficulty, e.number, e.total);
    for (const t of tagMap.get(e.problem_id) ?? []) {
      const cur = state.get(t.kp_id) ?? { rating: 0, evidence: 0 };
      const next = applyAttempt(cur, {
        weight: t.weight,
        correct: !!e.correct,
        answered: e.choice !== null,
        hintsUsed: e.hints_used,
        errorReason: e.error_reason,
        difficulty,
      });
      if (next) state.set(t.kp_id, next);
    }
  }

  const now = Date.now();
  const stmts = [db.prepare('DELETE FROM mastery WHERE student_id = ?').bind(studentId)];
  for (const [kp, s] of state) {
    stmts.push(
      db
        .prepare('INSERT INTO mastery (student_id, kp_id, rating, evidence, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(studentId, kp, s.rating, s.evidence, now)
    );
  }
  await db.batch(stmts);
  return state;
}

/** 把 logit 掌握度换成 0~100 的展示分，并给出等级 */
export function displayMastery(rating, evidence) {
  const score = Math.round(sigmoid(rating) * 100);
  if (evidence < 1.5) return { score, level: 'insufficient', label: '数据不足' };
  if (score >= 70) return { score, level: 'strong', label: '掌握较好' };
  if (score >= 45) return { score, level: 'ok', label: '基本掌握' };
  return { score, level: 'weak', label: '薄弱' };
}
