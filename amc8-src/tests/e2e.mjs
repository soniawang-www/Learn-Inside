// 端到端冒烟测试：先 wrangler dev 并打开 /amc8/api/admin/seed，再 node amc8-src/tests/e2e.mjs [baseURL]
const BASE = process.argv[2] || "http://127.0.0.1:8787";
let token = null;
const call = async (path, method = 'GET', body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};
const ok = (cond, msg) => { if (!cond) { console.error('✗', msg); process.exit(1); } console.log('✓', msg); };

for (let i = 0; i < 60; i++) {
  try { await fetch(BASE + '/'); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}

// 示例卷线上已下线；本地测试时用管理员密钥重新发布一份（wrangler dev --var ADMIN_KEY:localtest）
{
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync(new URL('../data/exams/sample-2026.json', import.meta.url), 'utf8'));
  sample.published = true;
  const r = await fetch(BASE + '/amc8/api/admin/import', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.ADMIN_KEY || 'localtest' }, body: JSON.stringify({ exams: [sample] }) });
  ok(r.status === 200, '本地重新发布示例卷用于测试');
}
ok((await call('/amc8/api/auth/join', 'POST', { invite_code: 'wrong', nickname: 'x' })).status === 403, '错误邀请码被拒绝');
const join = await call('/amc8/api/auth/join', 'POST', { invite_code: 'AMC2026', nickname: '测试' });
ok(join.status === 200 && join.data.token, '加入试用');
token = join.data.token;
const sid = join.data.student.id;

const me = await call('/amc8/api/me');
ok(me.data.premium === true && me.data.free_mode === true, '试用期 premium 全开');

const exams = await call(`/amc8/api/exams?student=${sid}`);
ok(exams.data.length >= 1, `试卷列表 ${exams.data.length} 套`);
const examId = 'sample-2026';

// 模考模式不能看提示
const ex = await call('/amc8/api/sessions', 'POST', { exam_id: examId, student_id: sid, mode: 'exam' });
ok(ex.data.problems.every((p) => p.hint_count === 0 && !('answer' in p)), '模考：题目不含答案、不给提示');
const p1 = ex.data.problems[0].id;
ok((await call(`/amc8/api/sessions/${ex.data.session.id}/hint`, 'POST', { problem_id: p1, level: 1 })).status === 403, '模考拒绝提示');
ok((await call(`/amc8/api/problems/${p1}/advanced`)).status === 403, '做题前不能看解析');

// 练习模式
const pr = await call('/amc8/api/sessions', 'POST', { exam_id: examId, student_id: sid, mode: 'practice' });
const S = pr.data.session.id;
const probs = pr.data.problems;
ok((await call(`/amc8/api/sessions/${S}/hint`, 'POST', { problem_id: probs[0].id, level: 2 })).status === 400, '提示必须逐级解锁');
const h1 = await call(`/amc8/api/sessions/${S}/hint`, 'POST', { problem_id: probs[0].id, level: 1 });
ok(h1.status === 200 && h1.data.content, '拿到 1 级提示');

// 交卷：前 5 题答对（从 review 无法事先拿答案，这里按示例卷已知答案）
const known = { 1: 'C', 2: 'D', 3: 'D', 4: 'C', 5: 'D', 6: 'C' /* 错 */, 7: 'E' /* 错 */ };
const answers = {}; const times = {};
for (const p of probs) { if (known[p.number]) answers[p.id] = known[p.number]; times[p.id] = 30 + p.number * 5; }
const sub = await call(`/amc8/api/sessions/${S}/submit`, 'POST', { answers, times, flags: { [probs[3].id]: true } });
ok(sub.status === 200 && sub.data.session.score === 5, `交卷得分 ${sub.data.session.score}`);
ok(sub.data.items[0].hints_used === 1, '提示使用被记录');
ok((await call(`/amc8/api/sessions/${S}/hint`, 'POST', { problem_id: probs[1].id, level: 1 })).status === 409, '交卷后不能再拿提示');

const wrongItem = sub.data.items.find((i) => i.number === 7);
const before = await call(`/amc8/api/students/${sid}/profile`);
ok(before.data.points.length > 0, `画像生成 ${before.data.points.length} 个知识点`);
const permBefore = before.data.points.find((p) => p.id === 'cnt.perm').score;
await call(`/amc8/api/attempts/${wrongItem.attempt_id}`, 'PATCH', { error_reason: 'careless' });
const after = await call(`/amc8/api/students/${sid}/profile`);
const permAfter = after.data.points.find((p) => p.id === 'cnt.perm').score;
ok(permAfter > permBefore, `标“粗心”后排列组合掌握度上调 ${permBefore} → ${permAfter}`);

const adv = await call(`/amc8/api/problems/${probs[0].id}/advanced`);
ok(adv.status === 200 && adv.data.steps.length > 0, '高级解析可看（试用期）');
const kp = await call(`/amc8/api/kp/nt.prime?student=${sid}`);
ok(kp.data.content && !kp.data.locked && kp.data.problems.length > 0, '知识点讲解可看');

console.log('\n画像（薄弱 → 擅长）：');
for (const p of after.data.points) console.log(`  ${p.label.padEnd(5, '　')} ${String(p.score).padStart(3)}  ${p.name}  (证据 ${p.evidence})`);
