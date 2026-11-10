// 英语 · ESDP 口语 / 写作练习（learn-inside.com/english/）
// 题库沿用 exam / problem / solution 表：每个题库是一套「卷」（esdp-speak-low 等），
//   problem.section = 轮次（口语：1 复赛问答、2 即兴演讲；写作：1）
//   solution basic = 免费的「思路」，advanced = 示范回答 / 范文（会员或用 1 次免费次数解锁，解锁项 adv:<题目 id>）
// 练习记录在 english_practice 表；录音只留在孩子自己的浏览器里，不上传。

export const ENGLISH_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS english_practice (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES student(id),
     problem_id TEXT NOT NULL REFERENCES problem(id), kind TEXT NOT NULL, seconds INTEGER, words INTEGER, text TEXT,
     created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_ep_student ON english_practice(student_id, created_at)',
];

const PREFIX = 'esdp-';
const parseJ = (v, d = null) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

// 打印用：一组题目的题干、思路，和这个账号能看的提纲 / 参考稿（没解锁的只给题目和思路）
export async function englishPrintItems(env, studentId, ids, billing) {
  const st = await env.DB.prepare('SELECT a.* FROM student s JOIN account a ON a.id = s.account_id WHERE s.id = ?').bind(studentId).first();
  if (!st) return [];
  const ctx = await billing.accessCtx(env, st, 'english');
  const ok = ids.filter((x) => typeof x === 'string' && x.startsWith(PREFIX)).slice(0, 60);
  if (!ok.length) return [];
  const qs = ok.map(() => '?').join(',');
  const { results: ps } = await env.DB.prepare(`SELECT p.id, p.exam_id, p.number, p.stem, p.stem_zh, p.section, e.title AS bank_title
      FROM problem p JOIN exam e ON e.id = p.exam_id WHERE e.published = 1 AND p.id IN (${qs})`).bind(...ok).all();
  const { results: sols } = await env.DB.prepare(`SELECT problem_id, kind, tier, content FROM solution WHERE problem_id IN (${qs})`).bind(...ok).all();
  const by = new Map(ps.map((p) => [p.id, p]));
  return ok.filter((id) => by.has(id)).map((id) => {
    const p = by.get(id);
    const basic = sols.find((x) => x.problem_id === id && x.kind === 'basic');
    const adv = sols.find((x) => x.problem_id === id && x.kind === 'advanced');
    const open = !!adv && (adv.tier === 'free' || ctx.can(`adv:${id}`));
    return { id, bank: p.exam_id, bank_title: p.bank_title, number: p.number, section: p.section, stem: p.stem, stem_zh: p.stem_zh,
      tips: basic?.content ?? null, model: adv ? (open ? parseJ(adv.content, {}) : { locked: true }) : null };
  });
}

export function registerEnglish({ route, json, HttpError, body, requireAccount, requireStudent, billing, uid, now }) {
  // 打印链接：选好的题和版式存 24 小时；打印页凭链接取（微信里打不了，换到手机浏览器打开，那边没有登录状态）
  route('POST', '/api/english/print-link', async (req, env) => {
    const acc = await requireAccount(req, env);
    const b = await body(req);
    await requireStudent(env, acc, b.student_id);
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => typeof x === 'string' && x.startsWith(PREFIX)).slice(0, 60);
    if (!ids.length) throw new HttpError(400, '先选几道题');
    const v = ['topics', 'script', 'recite', 'write', 'mock'].includes(b.v) ? b.v : 'topics';
    const payload = { english: true, ids, v, o: String(b.o || '').replace(/[^a-z]/g, '').slice(0, 8), title: String(b.title || '').slice(0, 40) };
    const token = (uid() + uid()).replace(/-/g, ''), t = now();
    await env.DB.prepare('DELETE FROM print_job WHERE expires_at < ?').bind(t).run();
    await env.DB.prepare('INSERT INTO print_job (token, student_id, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(token, b.student_id, JSON.stringify(payload), t, t + 24 * 3600 * 1000).run();
    return json({ token });
  });

  // 打印预览取题：题目、思路，已解锁的题带提纲和参考稿（没解锁的只给 locked）
  route('POST', '/api/english/print', async (req, env) => {
    const acc = await requireAccount(req, env);
    const b = await body(req);
    await requireStudent(env, acc, b.student_id);
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => typeof x === 'string' && x.startsWith(PREFIX)).slice(0, 60);
    if (!ids.length) throw new HttpError(400, '先选几道题');
    return json({ items: await englishPrintItems(env, b.student_id, ids, billing) });
  });

  const bankOk = (id) => typeof id === 'string' && id.startsWith(PREFIX);

  // 所有题库（ESDP 口语 / 写作 × 小低 / 小高）+ 这个孩子各练了几题
  route('GET', '/api/english/banks', async (req, env, _p, url) => {
    const acc = await requireAccount(req, env);
    const sid = url.searchParams.get('student');
    if (sid) await requireStudent(env, acc, sid);
    const { results: banks } = await env.DB.prepare(
      `SELECT id, title, grade, source, origin, sections, problem_count FROM exam WHERE published = 1 AND id LIKE ? ORDER BY id`,
    ).bind(PREFIX + '%').all();
    const { results: done } = sid ? await env.DB.prepare(
      `SELECT p.exam_id AS bank, COUNT(DISTINCT CASE WHEN ep.kind != 'learn' THEN ep.problem_id END) AS n,
              COUNT(DISTINCT CASE WHEN ep.kind = 'learn' THEN ep.problem_id END) AS learned
         FROM english_practice ep JOIN problem p ON p.id = ep.problem_id WHERE ep.student_id = ? GROUP BY p.exam_id`,
    ).bind(sid).all() : { results: [] };
    const { results: recent } = sid ? await env.DB.prepare(
      `SELECT ep.problem_id, ep.kind, ep.seconds, ep.words, ep.created_at, p.stem, p.exam_id AS bank FROM english_practice ep
         JOIN problem p ON p.id = ep.problem_id WHERE ep.student_id = ? AND ep.kind != 'learn' ORDER BY ep.created_at DESC LIMIT 8`,
    ).bind(sid).all() : { results: [] };
    return json({
      banks: banks.map((b) => ({ ...b, sections: parseJ(b.sections, []), practiced: done.find((d) => d.bank === b.id)?.n || 0, learned: done.find((d) => d.bank === b.id)?.learned || 0 })),
      recent,
    });
  });

  // 一个题库的全部题目（题目本身免费）+ 练过几次、示范回答能不能看
  route('GET', '/api/english/banks/:id', async (req, env, p, url) => {
    const acc = await requireAccount(req, env);
    if (!bankOk(p.id)) throw new HttpError(404, '没有这个题库');
    const sid = url.searchParams.get('student');
    if (sid) await requireStudent(env, acc, sid);
    const bank = await env.DB.prepare('SELECT id, title, grade, source, origin, sections FROM exam WHERE id = ? AND published = 1').bind(p.id).first();
    if (!bank) throw new HttpError(404, '没有这个题库');
    const { results: items } = await env.DB.prepare(
      'SELECT id, number, stem, stem_zh, section, types FROM problem WHERE exam_id = ? ORDER BY number',
    ).bind(p.id).all();
    const { results: done } = sid ? await env.DB.prepare(
      `SELECT ep.problem_id, SUM(ep.kind != 'learn') AS n, SUM(ep.kind = 'learn') AS learned, MAX(ep.created_at) AS last
         FROM english_practice ep JOIN problem p ON p.id = ep.problem_id
        WHERE ep.student_id = ? AND p.exam_id = ? GROUP BY ep.problem_id`,
    ).bind(sid, p.id).all() : { results: [] };
    const ctx = await billing.accessCtx(env, acc, 'english');
    const dm = Object.fromEntries(done.map((d) => [d.problem_id, d]));
    return json({
      bank: { ...bank, sections: parseJ(bank.sections, []) },
      member: ctx.member, credits: ctx.credits,
      items: items.map((x) => ({
        id: x.id, number: x.number, stem: x.stem, stem_zh: x.stem_zh, section: x.section, tags: parseJ(x.types, []),
        practiced: dm[x.id]?.n || 0, learned: dm[x.id]?.learned || 0, last: dm[x.id]?.last || null, open: ctx.can(`adv:${x.id}`),
      })),
    });
  });

  // 单题：题目 + 免费思路 + 示范回答（能看就带上，不能看只给 locked）
  route('GET', '/api/english/items/:id', async (req, env, p, url) => {
    const acc = await requireAccount(req, env);
    const sid = url.searchParams.get('student');
    if (sid) await requireStudent(env, acc, sid);
    if (!bankOk(p.id)) throw new HttpError(404, '题目不存在');
    const pr = await env.DB.prepare(
      'SELECT p.id, p.exam_id, p.number, p.stem, p.stem_zh, p.section, p.types, e.title AS bank_title, e.grade FROM problem p JOIN exam e ON e.id = p.exam_id WHERE p.id = ? AND e.published = 1',
    ).bind(p.id).first();
    if (!pr) throw new HttpError(404, '题目不存在');
    const { results: sols } = await env.DB.prepare('SELECT kind, tier, content FROM solution WHERE problem_id = ?').bind(pr.id).all();
    const basic = sols.find((s) => s.kind === 'basic');
    const adv = sols.find((s) => s.kind === 'advanced');
    const ctx = await billing.accessCtx(env, acc, 'english');
    const open = !!adv && (adv.tier === 'free' || ctx.can(`adv:${pr.id}`));
    const mine = sid ? await env.DB.prepare(
      "SELECT SUM(kind != 'learn') AS n, SUM(kind = 'learn') AS learned FROM english_practice WHERE student_id = ? AND problem_id = ?",
    ).bind(sid, pr.id).first() : null;
    return json({
      practiced: mine?.n || 0, learned: mine?.learned || 0,
      id: pr.id, bank: pr.exam_id, bank_title: pr.bank_title, number: pr.number, stem: pr.stem, stem_zh: pr.stem_zh,
      section: pr.section, tags: parseJ(pr.types, []), tips: basic?.content ?? null,
      model: adv ? (open ? { locked: false, ...parseJ(adv.content, {}) } : { locked: true, item: `adv:${pr.id}` }) : null,
      member: ctx.member, credits: ctx.credits,
    });
  });

  // 记一次练习（口语：说了多少秒；写作：字数和文章；learn：学习页点了「背会了」）。游客也记，换设备找不回来
  route('POST', '/api/english/practice', async (req, env) => {
    const acc = await requireAccount(req, env);
    const { student_id, problem_id, kind, seconds, text } = await body(req);
    await requireStudent(env, acc, student_id);
    if (!bankOk(problem_id)) throw new HttpError(400, '题目不对');
    if (!['speak', 'write', 'learn'].includes(kind)) throw new HttpError(400, '练习类型不对');
    const pr = await env.DB.prepare('SELECT id FROM problem WHERE id = ?').bind(problem_id).first();
    if (!pr) throw new HttpError(404, '题目不存在');
    const t = kind === 'write' ? String(text ?? '').slice(0, 6000) : null;
    const words = t ? (t.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).length : null;
    const sec = Number.isFinite(+seconds) ? Math.max(0, Math.min(3600, Math.round(+seconds))) : null;
    // 同一题 10 秒内重复提交只记一次（双击、网络重试）
    const dup = await env.DB.prepare('SELECT id FROM english_practice WHERE student_id = ? AND problem_id = ? AND created_at > ?')
      .bind(student_id, problem_id, now() - 10_000).first();
    if (dup) return json({ ok: true, id: dup.id, words });
    const id = uid();
    await env.DB.prepare('INSERT INTO english_practice (id, student_id, problem_id, kind, seconds, words, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, student_id, problem_id, kind, sec, words, t, now()).run();
    return json({ ok: true, id, words });
  });

  // 写作练习记录（看自己以前写的）
  route('GET', '/api/english/items/:id/mine', async (req, env, p, url) => {
    const acc = await requireAccount(req, env);
    const sid = url.searchParams.get('student');
    await requireStudent(env, acc, sid);
    const { results } = await env.DB.prepare(
      "SELECT id, kind, seconds, words, text, created_at FROM english_practice WHERE student_id = ? AND problem_id = ? AND kind = 'write' ORDER BY created_at DESC LIMIT 10",
    ).bind(sid, p.id).all();
    return json({ records: results });
  });
}
