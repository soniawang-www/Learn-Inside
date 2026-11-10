// 标准测试集合：功能清单 + 每个功能的测试用例，以及游客 / 注册用户 / 会员三种身份各自的预期。
//
// 每个用例：
//   id      用例编号（功能编号-序号）
//   name    测什么
//   run     (ctx) => 观察值（通常是 HTTP 状态码，或 'open' / 'locked' 这类短字符串、数字、true/false）
//   expect  { guest, user, member }：三种身份的预期观察值；'skip' 表示该身份不适用
// 同一身份按清单顺序执行，后面的用例可以依赖前面的状态（例如先解锁再看）。
// 用例只用公开接口（和测试服务的管理员密钥），不改数据库。

export const ROLES = { guest: '游客', user: '注册用户', member: '会员' };

const P25 = (n) => `amc8-2025-p${String(n).padStart(2, '0')}`;
const SAMPLE = 'amc8-2026-p01'; // 免费样板（2026 年互动解析）
const SAMPLE_KP = 'geo.area'; // 免费样板知识项突击
const KP = 'cnt.perm'; // 普通知识项
const HOPE = 'hope-2019w-g4'; // 希望数学试点卷
const EN_BANK = 'esdp-speak-low'; // 英语 ESDP 小低口语题库
const GSW_JX = 'gsw-2016-jx-g4'; // 古诗文大会决选真卷（有简答自评题）
const EN_ITEM = `${EN_BANK}-p05`; // 普通题（不是免费样题）
const same = (v) => ({ guest: v, user: v, member: v });
const st = (r) => r.status;

export const FEATURES = [
  // ───────── A 账号 ─────────
  { id: 'A1', area: '账号', name: '身份与账号信息', cases: [
    { id: 'A1-1', name: '/me 能取到孩子和账号信息', run: async (c) => st(await c.get('/math/api/me')), expect: same(200) },
    { id: 'A1-2', name: '是不是游客', run: async (c) => (await c.get('/math/api/me')).data.guest, expect: { guest: true, user: false, member: false } },
    { id: 'A1-3', name: '有没有绑定手机号', run: async (c) => (await c.get('/math/api/me')).data.has_phone, expect: { guest: false, user: true, member: true } },
    { id: 'A1-4', name: '账号页接口', run: async (c) => st(await c.get('/api/account')), expect: same(200) },
    { id: 'A1-5', name: '不带登录凭证访问受保护接口', run: async (c) => st(await c.anon('/math/api/me')), expect: same(401) },
    { id: 'A1-6', name: '伪造的登录凭证', run: async (c) => st(await c.req('/math/api/me', 'GET', null, 'fake-token')), expect: same(401) },
  ] },
  { id: 'A2', area: '账号', name: '注册 / 登录 / 密码', cases: [
    { id: 'A2-1', name: '用手机号和密码登录', run: async (c) => (await c.anon('/api/auth/login', 'POST', { phone: c.phone, password: c.password })).data.token === c.T, expect: { guest: 'skip', user: true, member: true } },
    { id: 'A2-2', name: '密码错误不能登录', run: async (c) => st(await c.anon('/api/auth/login', 'POST', { phone: c.phone, password: 'wrong-pw' })), expect: { guest: 'skip', user: 403, member: 403 } },
    { id: 'A2-3', name: '已注册的手机号不能再注册', run: async (c) => st(await c.anon('/api/auth/register', 'POST', { phone: c.phone, password: 'abc123', nickname: 'x' })), expect: { guest: 'skip', user: 409, member: 409 } },
    { id: 'A2-4', name: '修改密码（原密码正确）', run: async (c) => st(await c.post('/api/account/password', { old_password: c.password, password: c.password })), expect: { guest: 403, user: 200, member: 200 } },
    { id: 'A2-5', name: '修改密码（原密码错误）', run: async (c) => st(await c.post('/api/account/password', { old_password: 'nope00', password: 'abc123' })), expect: same(403) },
    { id: 'A2-6', name: '已绑定的账号不能再绑定手机号', run: async (c) => st(await c.post('/api/account/bind', { phone: c.newPhone(), password: 'abc123' })), expect: { guest: 'skip', user: 409, member: 409 } },
    { id: 'A2-7', name: '手机号格式校验', run: async (c) => st(await c.anon('/api/auth/register', 'POST', { phone: '123', password: 'abc123', nickname: 'x' })), expect: same(400) },
  ] },
  { id: 'A3', area: '账号', name: '孩子管理', cases: [
    { id: 'A3-1', name: '添加第二个孩子', run: async (c) => { const r = await c.post('/math/api/students', { nickname: '老二' }); c.kid2 = r.data.id; return st(r); }, expect: same(200) },
    { id: 'A3-2', name: '昵称不能为空', run: async (c) => st(await c.post('/math/api/students', { nickname: ' ' })), expect: same(400) },
    { id: 'A3-3', name: '看不到别人家孩子的画像', run: async (c) => st(await c.get(`/math/api/students/${c.outsider.sid}/profile`)), expect: same(404) },
  ] },

  // ───────── B 考试与做题 ─────────
  { id: 'B1', area: '考试', name: '考试与试卷列表', cases: [
    { id: 'B1-1', name: '考试种类（AMC 8、思维 100、希望数学）', run: async (c) => (await c.get(`/math/api/families?student=${c.sid}`)).data.map?.((f) => f.id).join(','), expect: same('amc8,swb100,hope') },
    { id: 'B1-2', name: 'AMC 8 试卷数', run: async (c) => (await c.get(`/math/api/exams?student=${c.sid}&family=amc8`)).data.length, expect: same(26) },
    { id: 'B1-3', name: 'AMC 8 考情（大类占比、知识项）', run: async (c) => { const d = (await c.get(`/math/api/families/amc8?student=${c.sid}`)).data; return d.stats.exams === 26 && d.stats.units.length === 30; }, expect: same(true) },
    { id: 'B1-4', name: '思维 100 有真题', run: async (c) => (await c.get(`/math/api/families/swb100?student=${c.sid}`)).data.stats.exams > 0, expect: same(true) },
  ] },
  { id: 'B2', area: '考试', name: '模考', cases: [
    { id: 'B2-1', name: '开始模考，题目不含答案、不给提示', run: async (c) => { const r = await c.post('/math/api/sessions', { exam_id: 'amc8-2024', student_id: c.sid, mode: 'exam' }); c.examS = r.data; return r.data.problems.length === 25 && r.data.problems.every((p) => !('answer' in p) && p.hint_count === 0); }, expect: same(true) },
    { id: 'B2-2', name: '模考拒绝提示', run: async (c) => st(await c.post(`/math/api/sessions/${c.examS.session.id}/hint`, { problem_id: c.examS.problems[0].id, level: 1 })), expect: same(403) },
    { id: 'B2-3', name: '交卷得分', run: async (c) => { const r = await c.post(`/math/api/sessions/${c.examS.session.id}/submit`, { answers: {}, times: {}, flags: {} }); return r.data.session?.score; }, expect: same(0) },
    { id: 'B2-4', name: '重复交卷（网络重试）：不改答案，返回原成绩', run: async (c) => { const first = c.examS.problems[0].id; const r = await c.post(`/math/api/sessions/${c.examS.session.id}/submit`, { answers: { [first]: 'A' }, times: {}, flags: {} }); return `${r.data.already}/${r.data.session?.score}/${r.data.items?.[0]?.choice}`; }, expect: same('true/0/null') },
  ] },
  { id: 'B3', area: '考试', name: '练习模式与提示', cases: [
    { id: 'B3-1', name: '开始练习', run: async (c) => { const r = await c.post('/math/api/sessions', { exam_id: 'amc8-2023', student_id: c.sid, mode: 'practice' }); c.prS = r.data; return st(r); }, expect: same(200) },
    { id: 'B3-2', name: '提示必须逐级解锁（直接要 2 级）', run: async (c) => st(await c.post(`/math/api/sessions/${c.prS.session.id}/hint`, { problem_id: c.prS.problems[0].id, level: 2 })), expect: same(400) },
    { id: 'B3-3', name: '拿到 1 级提示', run: async (c) => !!(await c.post(`/math/api/sessions/${c.prS.session.id}/hint`, { problem_id: c.prS.problems[0].id, level: 1 })).data.content, expect: same(true) },
    { id: 'B3-4', name: '交卷后用到的提示被记录', run: async (c) => { const r = await c.post(`/math/api/sessions/${c.prS.session.id}/submit`, { answers: {}, times: {}, flags: {} }); c.prReview = r.data; return r.data.items[0].hints_used; }, expect: same(1) },
    { id: 'B3-5', name: '交卷后不能再拿提示', run: async (c) => st(await c.post(`/math/api/sessions/${c.prS.session.id}/hint`, { problem_id: c.prS.problems[1].id, level: 1 })), expect: same(409) },
    { id: 'B3-6', name: '看不了别人的考试', run: async (c) => st(await c.req(`/math/api/sessions/${c.prS.session.id}/review`, 'GET', null, c.outsider.T)), expect: same(404) },
  ] },
  { id: 'B4', area: '考试', name: '复盘与错因', cases: [
    { id: 'B4-1', name: '复盘有答案和解题思路', run: async (c) => { const r = await c.get(`/math/api/sessions/${c.prS.session.id}/review`); return !!(r.data.items[0].answer && r.data.items[0].basic); }, expect: same(true) },
    { id: 'B4-2', name: '标错因', run: async (c) => st(await c.req(`/math/api/attempts/${c.prReview.items[1].attempt_id}`, 'PATCH', { error_reason: 'careless' }, c.T)), expect: { guest: 403, user: 200, member: 200 } },
    { id: 'B4-3', name: '错因不合法', run: async (c) => st(await c.req(`/math/api/attempts/${c.prReview.items[1].attempt_id}`, 'PATCH', { error_reason: 'lazy' }, c.T)), expect: { guest: 403, user: 400, member: 400 } },
    { id: 'B4-4', name: '复盘页互动解析的锁（2023 年，非样板、没解锁）', run: async (c) => (c.prReview.items[2].advanced?.locked ? 'locked' : 'open'), expect: { guest: 'locked', user: 'locked', member: 'open' } },
  ] },
  { id: 'B5', area: '考试', name: '希望数学：分年级、填空题', cases: [
    { id: 'B5-1', name: '试卷带年级（2019 冬令营四年级，40 题，120 分钟）', run: async (c) => { const e = (await c.get(`/math/api/exams?student=${c.sid}&family=hope`)).data.find((x) => x.id === HOPE); return e ? `${e.grade}/${e.problem_count}/${e.duration_sec / 60}` : 'none'; }, expect: same('4/40/120') },
    { id: 'B5-2', name: '开始模考：填空题没有选项，选择题有 A–D', run: async (c) => { const r = await c.post('/math/api/sessions', { exam_id: HOPE, student_id: c.sid, mode: 'exam' }); c.hopeS = r.data; const ps = r.data.problems; return `${Object.keys(ps[0].choices).length}/${Object.keys(ps[5].choices).join('')}/${ps.some((p) => 'answer' in p)}`; }, expect: same('0/ABCD/false') },
    { id: 'B5-3', name: '交卷判分：填空题容许空格、单位、全角数字，选择题比字母', run: async (c) => { const id = (n) => `${HOPE}-p${String(n).padStart(2, '0')}`;
      const r = await c.post(`/math/api/sessions/${c.hopeS.session.id}/submit`, { answers: { [id(1)]: '4', [id(2)]: '3', [id(3)]: '14 ', [id(4)]: '１９', [id(6)]: 'B', [id(7)]: 'A', [id(13)]: '40个', [id(14)]: '2,039,190' }, times: {}, flags: {} });
      c.hopeRev = r.data; return r.data.session?.score; }, expect: same(6) },
    { id: 'B5-4', name: '复盘：存的是孩子填的内容，给出正确答案', run: async (c) => { const it = c.hopeRev.items; return `${it[1].choice}/${it[1].answer}/${it[1].correct}/${it[2].choice}/${it[4].choice}`; }, expect: same('3/2/false/14/null') },
    { id: 'B5-5', name: '填错的填空题进错题本', run: async (c) => (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes.some((m) => m.problem_id === `${HOPE}-p02`), expect: { guest: false, user: true, member: true } },
    { id: 'B5-6', name: '打印错题：填空题没有选项，答案是要填的数', run: async (c) => { const r = await c.post(`/math/api/students/${c.sid}/mistakes/print`, { problem_ids: [`${HOPE}-p02`] }); const x = r.data.items?.[0]; return r.status === 200 ? `${Object.keys(x.choices).length}/${x.answer}` : r.status; }, expect: { guest: 403, user: '0/2', member: '0/2' } },
  ] },

  // ───────── C 题目与互动解析 ─────────
  { id: 'C1', area: '互动解析', name: '单题页', cases: [
    { id: 'C1-1', name: '没做过的题不给答案', run: async (c) => 'answer' in (await c.get(`/math/api/problems/amc8-2022-p20?student=${c.sid}`)).data, expect: same(false) },
    { id: 'C1-2', name: '做过的题给答案和解题思路', run: async (c) => { const d = (await c.get(`/math/api/problems/${P25(1)}?student=${c.sid}`)).data; return !!(d.answer && d.basic); }, expect: same(true) },
    { id: 'C1-3', name: '没做过的题不能看互动解析（防止考前偷看）', run: async (c) => st(await c.get('/math/api/problems/amc8-2022-p20/advanced')), expect: same(403) },
  ] },
  { id: 'C2', area: '互动解析', name: '免费样板', cases: [
    { id: 'C2-1', name: '2026 年互动解析不用次数也能看', run: async (c) => st(await c.get(`/math/api/problems/${SAMPLE}/advanced`)), expect: same(200) },
    { id: 'C2-2', name: '看样板不扣次数', run: async (c) => (await c.post('/api/unlock', { item: `adv:${SAMPLE}` })).data.charged, expect: same(false) },
  ] },
  { id: 'C3', area: '互动解析', name: '非样板互动解析的权限', cases: [
    { id: 'C3-1', name: '没解锁时看 2025 第 1 题', run: async (c) => st(await c.get(`/math/api/problems/${P25(1)}/advanced`)), expect: { guest: 402, user: 402, member: 200 } },
    { id: 'C3-2', name: '用 1 次解锁', run: async (c) => { const r = await c.post('/api/unlock', { item: `adv:${P25(1)}` }); return r.status === 200 ? (r.data.charged ? 'charged' : 'free') : r.status; }, expect: { guest: 402, user: 'charged', member: 'free' } },
    { id: 'C3-3', name: '解锁后剩余次数', run: async (c) => (await c.get('/api/account')).data.credits, expect: { guest: 0, user: 9, member: 10 } },
    { id: 'C3-4', name: '解锁后能看', run: async (c) => st(await c.get(`/math/api/problems/${P25(1)}/advanced`)), expect: { guest: 402, user: 200, member: 200 } },
    { id: 'C3-5', name: '同一题再解锁不扣', run: async (c) => { const r = await c.post('/api/unlock', { item: `adv:${P25(1)}` }); return r.status === 200 ? r.data.charged : r.status; }, expect: { guest: 402, user: false, member: false } },
    { id: 'C3-6', name: '单题页锁标记（解锁过的题）', run: async (c) => ((await c.get(`/math/api/problems/${P25(1)}?student=${c.sid}`)).data.advanced?.locked ? 'locked' : 'open'), expect: { guest: 'locked', user: 'open', member: 'open' } },
    { id: 'C3-7', name: '单题页锁标记（没解锁的题）', run: async (c) => ((await c.get(`/math/api/problems/${P25(2)}?student=${c.sid}`)).data.advanced?.locked ? 'locked' : 'open'), expect: { guest: 'locked', user: 'locked', member: 'open' } },
    { id: 'C3-8', name: '第二个孩子也能看账号已解锁的题', run: async (c) => { await c.doProblems(c.kid2, [P25(1)]); return st(await c.get(`/math/api/problems/${P25(1)}/advanced`)); }, expect: { guest: 402, user: 200, member: 200 } },
    { id: 'C3-9', name: '解锁项校验（不存在的题 / 不认识的类型）', run: async (c) => `${st(await c.post('/api/unlock', { item: 'adv:nope' }))}/${st(await c.post('/api/unlock', { item: 'x:y' }))}`, expect: same('404/400') },
  ] },

  // ───────── D 知识项与真题突击 ─────────
  { id: 'D1', area: '知识项', name: '知识项页', cases: [
    { id: 'D1-1', name: '知识项页（前置、题型、相关真题）', run: async (c) => { const r = await c.get(`/math/api/kp/${KP}?student=${c.sid}`); if (r.status !== 200) return r.status; const d = r.data; return d.prerequisites?.length > 0 && d.types?.length > 0 && d.problems?.length > 0; }, expect: { guest: 403, user: true, member: true } },
    { id: 'D1-2', name: '突击的锁标记（普通知识项）', run: async (c) => { const r = await c.get(`/math/api/kp/${KP}?student=${c.sid}`); return r.status !== 200 ? r.status : r.data.drill.locked ? 'locked' : 'open'; }, expect: { guest: 403, user: 'locked', member: 'open' } },
    { id: 'D1-3', name: '样板知识项不锁', run: async (c) => { const r = await c.get(`/math/api/kp/${SAMPLE_KP}?student=${c.sid}`); return r.status !== 200 ? r.status : r.data.drill.locked; }, expect: { guest: 403, user: false, member: false } },
    { id: 'D1-4', name: '按考试切换考情（思维 100）', run: async (c) => { const r = await c.get(`/math/api/kp/${KP}?student=${c.sid}&family=swb100`); return r.status !== 200 ? r.status : !!r.data.stats; }, expect: { guest: 403, user: true, member: true } },
    { id: 'D1-5', name: '不存在的知识项', run: async (c) => st(await c.get(`/math/api/kp/nope?student=${c.sid}`)), expect: { guest: 403, user: 404, member: 404 } },
  ] },
  { id: 'D2', area: '知识项', name: '真题突击', cases: [
    { id: 'D2-1', name: '样板知识项突击', run: async (c) => st(await c.post('/math/api/sessions', { kp_id: SAMPLE_KP, student_id: c.sid })), expect: { guest: 403, user: 200, member: 200 } },
    { id: 'D2-2', name: '普通知识项突击（没解锁）', run: async (c) => st(await c.post('/math/api/sessions', { kp_id: KP, student_id: c.sid })), expect: { guest: 403, user: 402, member: 200 } },
    { id: 'D2-3', name: '用 1 次解锁突击', run: async (c) => { const r = await c.post('/api/unlock', { item: `drill:${KP}` }); return r.status === 200 ? (r.data.charged ? 'charged' : 'free') : r.status; }, expect: { guest: 402, user: 'charged', member: 'free' } },
    { id: 'D2-4', name: '解锁后能反复开突击', run: async (c) => `${st(await c.post('/math/api/sessions', { kp_id: KP, student_id: c.sid }))}/${st(await c.post('/math/api/sessions', { kp_id: KP, student_id: c.sid }))}`, expect: { guest: '403/403', user: '200/200', member: '200/200' } },
  ] },

  // ───────── E 知识图谱 ─────────
  { id: 'E1', area: '知识图谱', name: '个人知识图谱', cases: [
    { id: 'E1-1', name: '30 个知识项、前置关系、掌握度', run: async (c) => { const r = await c.get(`/math/api/students/${c.sid}/graph`); if (r.status !== 200) return r.status; const d = r.data; return d.nodes.length === 30 && d.edges.length > 20 && d.nodes.some((n) => n.mastery); }, expect: { guest: 403, user: true, member: true } },
    { id: 'E1-2', name: '错过的题挂在知识项上', run: async (c) => { const r = await c.get(`/math/api/students/${c.sid}/graph`); return r.status !== 200 ? r.status : r.data.nodes.some((n) => n.wrong?.total > 0); }, expect: { guest: 403, user: true, member: true } },
    { id: 'E1-3', name: '看不到别人家孩子的图谱', run: async (c) => st(await c.get(`/math/api/students/${c.outsider.sid}/graph`)), expect: { guest: 403, user: 404, member: 404 } },
  ] },

  // ───────── F 错题本 ─────────
  { id: 'F1', area: '错题本', name: '错题收集与订正', cases: [
    { id: 'F1-1', name: '做错 / 没做的题自动收进错题本（游客的错题本是空的，注册后才有）', run: async (c) => (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes.length > 0, expect: { guest: false, user: true, member: true } },
    { id: 'F1-2', name: '新错题是「待订正」', run: async (c) => (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes.find((m) => m.problem_id === P25(3))?.status ?? 'none', expect: { guest: 'none', user: 'pending', member: 'pending' } },
    { id: 'F1-3', name: '订正会话', run: async (c) => { const r = await c.post('/math/api/sessions', { problem_ids: [P25(3)], student_id: c.sid, purpose: 'pending' }); c.fixS = r.data; return r.data.exam?.title ?? r.status; }, expect: { guest: 403, user: '错题订正', member: '错题订正' } },
    { id: 'F1-4', name: '订正做对 → 已订正，7 天后复习', run: async (c) => { const ans = (await c.get(`/math/api/problems/${P25(3)}?student=${c.sid}`)).data.answer; await c.post(`/math/api/sessions/${c.fixS.session.id}/submit`, { answers: { [P25(3)]: ans }, times: {}, flags: {} }); const m = (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes.find((x) => x.problem_id === P25(3)); return `${m.status}/${Math.round((m.review_at - Date.now()) / 86400000)}`; }, expect: { guest: 'skip', user: 'fixed/7', member: 'fixed/7' } },
  ] },
  { id: 'F2', area: '错题本', name: '打印错题', cases: [
    { id: 'F2-1', name: '取错题本里全部题的打印内容：题数和错题本一致', run: async (c) => { const ms = (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes; const r = await c.post(`/math/api/students/${c.sid}/mistakes/print`, { problem_ids: ms.length ? ms.slice(0, 60).map((m) => m.problem_id) : [P25(3)] }); return r.status === 200 ? r.data.items.length === Math.min(ms.length, 60) && ms.length > 0 : r.status; }, expect: { guest: 403, user: true, member: true } },
    { id: 'F2-2', name: '打印内容带题干、选项、答案和解题思路', run: async (c) => { const r = await c.post(`/math/api/students/${c.sid}/mistakes/print`, { problem_ids: [P25(3)] }); const x = r.data.items?.[0]; return r.status === 200 ? !!(x && x.stem && Object.keys(x.choices).length === 5 && /^[A-E]$/.test(x.answer) && x.basic) : r.status; }, expect: { guest: 403, user: true, member: true } },
    { id: 'F2-3', name: '不在错题本里的题（没做过）不给，防止先看答案', run: async (c) => { const r = await c.post(`/math/api/students/${c.sid}/mistakes/print`, { problem_ids: ['amc8-2010-p01', 'amc8-2010-p02'] }); return r.status === 200 ? r.data.items.length : r.status; }, expect: { guest: 403, user: 0, member: 0 } },
    { id: 'F2-4', name: '打印别人家孩子的错题', run: async (c) => st(await c.post(`/math/api/students/${c.outsider.sid}/mistakes/print`, { problem_ids: [P25(3)] })), expect: { guest: 403, user: 404, member: 404 } },
    { id: 'F2-5', name: '一次超过 60 题', run: async (c) => st(await c.post(`/math/api/students/${c.sid}/mistakes/print`, { problem_ids: Array.from({ length: 61 }, (_, i) => `x-${i}`) })), expect: { guest: 403, user: 400, member: 400 } },
    { id: 'F2-6', name: '生成打印链接（安卓微信里换到浏览器用）', run: async (c) => { const r = await c.post(`/math/api/students/${c.sid}/mistakes/print-link`, { problem_ids: [P25(3)], title: 't', sub: 's', with_ans: true, space: true, lang: 'zh' }); c.printTok = r.data.token; return r.status === 200 ? /^[0-9a-f]{64}$/.test(r.data.token) && Math.round((r.data.expires_at - Date.now()) / 3600000) === 24 : r.status; }, expect: { guest: 403, user: true, member: true } },
    { id: 'F2-7', name: '不登录用打印链接取题：题、答案和打印选项都在', run: async (c) => { if (!c.printTok) return 'skip'; const r = await c.anon(`/math/api/print/${c.printTok}`); const x = r.data.items?.[0]; return r.status === 200 && r.data.items.length === 1 && x.problem_id === P25(3) && !!x.answer && r.data.lang === 'zh' && r.data.with_ans === true && r.data.problem_ids === undefined; }, expect: { guest: 'skip', user: true, member: true } },
    { id: 'F2-8', name: '乱写的打印链接', run: async (c) => st(await c.anon('/math/api/print/' + '0'.repeat(64))), expect: same(404) },
    { id: 'F2-9', name: '给别人家孩子生成打印链接', run: async (c) => st(await c.post(`/math/api/students/${c.outsider.sid}/mistakes/print-link`, { problem_ids: [P25(3)] })), expect: { guest: 403, user: 404, member: 404 } },
    { id: 'F2-10', name: '打印链接只收错题本里的题', run: async (c) => st(await c.post(`/math/api/students/${c.sid}/mistakes/print-link`, { problem_ids: ['amc8-2010-p01'] })), expect: { guest: 403, user: 400, member: 400 } },
  ] },

  // ───────── G 免费次数 ─────────
  { id: 'G1', area: '免费次数', name: '10 次额度', cases: [
    { id: 'G1-1', name: '当前剩余次数（用过 2 次后）', run: async (c) => (await c.get('/api/account')).data.credits, expect: { guest: 0, user: 8, member: 10 } },
    { id: 'G1-2', name: '把次数用完（逐题解锁到 0）', run: async (c) => { let n = 0; for (let i = 2; i <= 12; i++) { const r = await c.post('/api/unlock', { item: `adv:${P25(i)}` }); if (r.status !== 200) break; if (r.data.charged) n++; } return `${n}/${(await c.get('/api/account')).data.credits}`; }, expect: { guest: '0/0', user: '8/0', member: '0/10' } },
    { id: 'G1-3', name: '次数用完后再解锁', run: async (c) => { const r = await c.post('/api/unlock', { item: `adv:${P25(12)}` }); return r.status === 200 ? 200 : `${r.status}:${r.data.need || ''}`; }, expect: { guest: '402:member', user: '402:member', member: 200 } },
    { id: 'G1-4', name: '次数用完，解锁过的还能看', run: async (c) => st(await c.get(`/math/api/problems/${P25(5)}/advanced`)), expect: { guest: 402, user: 200, member: 200 } },
    { id: 'G1-5', name: '次数用完，免费样板还能看', run: async (c) => st(await c.get(`/math/api/problems/${SAMPLE}/advanced`)), expect: same(200) },
  ] },

  // ───────── H 会员 ─────────
  { id: 'H1', area: '会员', name: '会员状态', cases: [
    { id: 'H1-1', name: '/me 是否会员', run: async (c) => (await c.get('/math/api/me')).data.premium, expect: { guest: false, user: false, member: true } },
    { id: 'H1-2', name: '账号页会员种类', run: async (c) => Object.keys((await c.get('/api/account')).data.memberships).join(',') || '无', expect: { guest: '无', user: '无', member: 'math' } },
    { id: 'H1-3', name: '套餐列表（数学、语文、英语、全科各 3 档）', run: async (c) => (await c.get('/api/account')).data.plans.map((p) => p.id).join(','), expect: same('math.month,math.quarter,math.year,chinese.month,chinese.quarter,chinese.year,english.month,english.quarter,english.year,all.month,all.quarter,all.year') },
  ] },
  { id: 'H2', area: '会员', name: '激活码', cases: [
    { id: 'H2-1', name: '兑换 31 天数学会员激活码', run: async (c) => { const code = await c.makeCode('days', 31, 'math'); const r = await c.post('/api/redeem', { code }); c.lastCode = code; return st(r); }, expect: { guest: 403, user: 200, member: 200 } },
    { id: 'H2-2', name: '兑换后数学会员天数', run: async (c) => { const u = (await c.get('/api/account')).data.memberships.math; return u ? Math.round((u - Date.now()) / 86400000) : 0; }, expect: { guest: 0, user: 31, member: 62 } },
    { id: 'H2-3', name: '同一激活码不能用两次', run: async (c) => st(await c.post('/api/redeem', { code: c.lastCode })), expect: { guest: 403, user: 409, member: 409 } },
    { id: 'H2-4', name: '不存在的激活码', run: async (c) => st(await c.post('/api/redeem', { code: 'NOTEXIST00' })), expect: { guest: 403, user: 404, member: 404 } },
    { id: 'H2-5', name: '兑换次数激活码 +5', run: async (c) => { const code = await c.makeCode('credits', 5); const before = (await c.get('/api/account')).data.credits; await c.post('/api/redeem', { code }); return (await c.get('/api/account')).data.credits - before; }, expect: { guest: 0, user: 5, member: 5 } },
  ] },
  { id: 'H3', area: '会员', name: '在线支付', cases: [
    { id: 'H3-1', name: '下单数学月卡', run: async (c) => { const r = await c.post('/api/pay/create', { plan: 'math.month' }); c.order = r.data; return st(r); }, expect: { guest: 403, user: 200, member: 200 } },
    { id: 'H3-2', name: '收银台用 page.pay，金额按套餐算', run: async (c) => { if (!c.order?.url) return 'none'; const q = new URL(c.order.url).searchParams; return `${q.get('method')}/${JSON.parse(q.get('biz_content')).total_amount}`; }, expect: { guest: 'none', user: 'alipay.trade.page.pay/39.00', member: 'alipay.trade.page.pay/39.00' } },
    { id: 'H3-3', name: '超过上限的套餐（数学年卡 ¥299）', run: async (c) => st(await c.post('/api/pay/create', { plan: 'math.year' })), expect: { guest: 403, user: 400, member: 400 } },
    { id: 'H3-4', name: '付款通知 → 加 31 天', run: async (c) => { if (!c.order?.order_id) return 'none'; const before = (await c.get('/api/account')).data.memberships.math || Date.now(); const t = await c.notify(c.order.order_id, '39.00'); const after = (await c.get('/api/account')).data.memberships.math; return `${t}/${Math.round((after - before) / 86400000)}`; }, expect: { guest: 'none', user: 'success/31', member: 'success/31' } },
    { id: 'H3-5', name: '看自己的订单', run: async (c) => (c.order?.order_id ? (await c.get(`/api/pay/orders/${c.order.order_id}`)).data.status : 'none'), expect: { guest: 'none', user: 'paid', member: 'paid' } },
    { id: 'H3-6', name: '看不到别人的订单', run: async (c) => (c.order?.order_id ? st(await c.req(`/api/pay/orders/${c.order.order_id}`, 'GET', null, c.outsider.T)) : 'none'), expect: { guest: 'none', user: 404, member: 404 } },
  ] },
  { id: 'H4', area: '会员', name: '会员到期', cases: [
    { id: 'H4-1', name: '会员期间看没解锁的题（2025 第 15 题）', run: async (c) => { await c.doProblems(c.sid, [P25(15)]); return st(await c.get(`/math/api/problems/${P25(15)}/advanced`)); }, expect: { guest: 402, user: 200, member: 200 } },
    { id: 'H4-2', name: '后台取消会员后，没解锁的又锁上', run: async (c) => { await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'revoke', tier: 'math' }); return st(await c.get(`/math/api/problems/${P25(15)}/advanced`)); }, expect: { guest: 'skip', user: 402, member: 402 } },
    { id: 'H4-3', name: '会员没了：用次数解锁过的还能看（会员期间看的不算解锁）', run: async (c) => st(await c.get(`/math/api/problems/${P25(1)}/advanced`)), expect: { guest: 'skip', user: 200, member: 402 } },
  ] },

  // ───────── I 客服 / 后台权限 ─────────
  { id: 'H5', area: '会员', name: '活动价', cases: [
    { id: 'H5-1', name: '后台设活动价（数学月卡 ¥19.9），账号页显示原价和活动价', run: async (c) => { await c.admin('/api/admin/promo', 'POST', { title: '测试活动', until: Date.now() + 3 * 86400000, prices: { 'math.month': 19.9, 'math.quarter': 120 } }); const a = (await c.get('/api/account')).data; const p = a.plans.find((x) => x.id === 'math.month'); return `${p.price}/${p.orig_price}/${a.promo?.title}`; }, expect: same('19.9/39/测试活动') },
    { id: 'H5-2', name: '不低于原价的活动价不生效（季卡填 ¥120）', run: async (c) => { const p = (await c.get('/api/account')).data.plans.find((x) => x.id === 'math.quarter'); return `${p.price}/${p.orig_price ?? '无'}`; }, expect: same('99/无') },
    { id: 'H5-3', name: '下单按活动价收钱', run: async (c) => { const r = await c.post('/api/pay/create', { plan: 'math.month' }); return r.data.url ? JSON.parse(new URL(r.data.url).searchParams.get('biz_content')).total_amount : st(r); }, expect: { guest: 403, user: '19.90', member: '19.90' } },
    { id: 'H5-4', name: '普通登录凭证不能改活动价', run: async (c) => `${st(await c.post('/api/admin/promo', { until: Date.now() + 86400000, prices: { 'math.month': 0.01 } }))}/${st(await c.req('/api/admin/promo', 'DELETE'))}`, expect: same('403/403') },
    { id: 'H5-5', name: '结束活动后恢复原价', run: async (c) => { await c.admin('/api/admin/promo', 'DELETE'); const a = (await c.get('/api/account')).data; return `${a.plans.find((x) => x.id === 'math.month').price}/${a.promo}`; }, expect: same('39/null') },
  ] },
  { id: 'I1', area: '其他', name: '客服与后台权限', cases: [
    { id: 'I1-1', name: '客服二维码信息', run: async (c) => st(await c.get('/api/support')), expect: same(200) },
    { id: 'I1-2', name: '普通登录凭证进不了后台', run: async (c) => `${st(await c.get('/api/admin/accounts'))}/${st(await c.post('/api/admin/codes', { kind: 'days', amount: 31 }))}/${st(await c.post(`/api/admin/accounts/${c.aid}`, { action: 'add_days', value: 999 }))}`, expect: same('403/403/403') },
    { id: 'I1-4', name: '后台账号分类：会员 / 注册 / 未注册加起来等于全部，自己的账号分在对的类里', run: async (c) => {
      const all = (await c.admin('/api/admin/accounts')).data, n = all.counts;
      if (n.member + n.user + n.guest !== all.total) return `合计不符 ${JSON.stringify(n)} ≠ ${all.total}`;
      if (!c.phone) return 'ok';
      const me = (await c.admin(`/api/admin/accounts?q=${c.phone}`)).data.accounts[0];
      const want = Object.keys(me.memberships).length ? 'member' : 'user';
      const got = [];
      for (const t of ['member', 'user', 'guest']) if ((await c.admin(`/api/admin/accounts?type=${t}&q=${c.phone}`)).data.accounts.some((a) => a.id === me.id)) got.push(t);
      return got.join(',') === want ? 'ok' : `应在 ${want}，实际在 ${got.join(',') || '无'}`;
    }, expect: same('ok') },
    { id: 'I1-3', name: '不能自己改价格（下单只认套餐 id）', run: async (c) => st(await c.post('/api/pay/create', { plan: 'math.month', amount: '0.01', price: 0.01 })), expect: { guest: 403, user: 200, member: 200 } },
  ] },

  // ───────── E 英语 · ESDP（题目和思路免费；提纲、参考句子、背诵按英语会员 / 次数解锁；数学会员不含英语） ─────────
  { id: 'E1', area: '英语', name: 'ESDP 题库与练习记录', cases: [
    { id: 'E1-1', name: '题库列表有小低、小高两个口语题库', run: async (c) => (await c.get(`/api/english/banks?student=${c.sid}`)).data.banks.filter((b) => b.id.startsWith('esdp-speak-')).length, expect: same(2) },
    { id: 'E1-2', name: '小低口语题库有题，分复赛问答 / 即兴演讲两类', run: async (c) => { const d = (await c.get(`/api/english/banks/${EN_BANK}?student=${c.sid}`)).data; return d.items.length > 50 && [1, 2].every((s) => d.items.some((x) => x.section === s)); }, expect: same(true) },
    { id: 'E1-3', name: '题目和思路免费', run: async (c) => { const d = (await c.get(`/api/english/items/${EN_ITEM}`)).data; return !!(d.stem && d.stem_zh && d.tips); }, expect: same(true) },
    { id: 'E1-4', name: '样题（第 1 题）的提纲和参考句子免费', run: async (c) => { const m = (await c.get(`/api/english/items/${EN_BANK}-p01`)).data.model; return m.locked ? 'locked' : m.paras?.length ? 'open' : 'empty'; }, expect: same('open') },
    { id: 'E1-5', name: '普通题的提纲和参考句子锁着（数学会员也不含英语）', run: async (c) => (await c.get(`/api/english/items/${EN_ITEM}`)).data.model.locked ? 'locked' : 'open', expect: same('locked') },
    { id: 'E1-6', name: '英语题库不能当试卷开考', run: async (c) => st(await c.post('/math/api/sessions', { exam_id: EN_BANK, student_id: c.sid, mode: 'exam' })), expect: same(400) },
    { id: 'E1-7', name: '记一次口语练习，题库里显示练过', run: async (c) => { await c.post('/api/english/practice', { student_id: c.sid, problem_id: EN_ITEM, kind: 'speak', seconds: 75 }); const d = (await c.get(`/api/english/banks/${EN_BANK}?student=${c.sid}`)).data; return d.items.find((x) => x.id === EN_ITEM).practiced; }, expect: same(1) },
    { id: 'E1-8', name: '10 秒内重复提交只记一次', run: async (c) => { await c.post('/api/english/practice', { student_id: c.sid, problem_id: EN_ITEM, kind: 'speak', seconds: 75 }); return (await c.get(`/api/english/items/${EN_ITEM}?student=${c.sid}`)).data.practiced; }, expect: same(1) },
    { id: 'E1-9', name: '「背会了」单独计数', run: async (c) => { await c.post('/api/english/practice', { student_id: c.sid, problem_id: `${EN_BANK}-p03`, kind: 'learn' }); const d = (await c.get(`/api/english/banks?student=${c.sid}`)).data; return d.banks.find((b) => b.id === EN_BANK).learned; }, expect: same(1) },
    { id: 'E1-10', name: '写作按英文单词计字数', run: async (c) => (await c.post('/api/english/practice', { student_id: c.sid, problem_id: `${EN_BANK}-p04`, kind: 'write', text: "I like my school. It's big!" })).data.words, expect: same(6) },
    { id: 'E1-11', name: '不能给别人家的孩子记练习', run: async (c) => st(await c.post('/api/english/practice', { student_id: c.outsider.sid, problem_id: EN_ITEM, kind: 'speak', seconds: 10 })), expect: same(404) },
    { id: 'E1-12', name: '练习类型和题目校验', run: async (c) => `${st(await c.post('/api/english/practice', { student_id: c.sid, problem_id: EN_ITEM, kind: 'hack' }))}/${st(await c.post('/api/english/practice', { student_id: c.sid, problem_id: 'amc8-2024-p01', kind: 'speak' }))}`, expect: same('400/400') },
  ] },
  { id: 'E2', area: '英语', name: 'ESDP 示范回答解锁', cases: [
    { id: 'E2-1', name: '用 1 次免费次数解锁一道英语题', run: async (c) => { if (c.role !== 'guest') await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_credits', value: 1, reason: '标准测试：英语解锁' }); return st(await c.post('/api/unlock', { item: `adv:${EN_ITEM}` })); }, expect: { guest: 402, user: 200, member: 200 } },
    { id: 'E2-2', name: '解锁后能看提纲和参考句子', run: async (c) => { const m = (await c.get(`/api/english/items/${EN_ITEM}`)).data.model; return m.locked ? 'locked' : m.paras?.length ? 'open' : 'empty'; }, expect: { guest: 'locked', user: 'open', member: 'open' } },
    { id: 'E2-3', name: '英语会员能看所有题', run: async (c) => { if (c.role === 'member') await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_days', value: 31, tier: 'english', reason: '标准测试：英语会员' }); return (await c.get(`/api/english/items/${EN_BANK}-p40`)).data.model.locked ? 'locked' : 'open'; }, expect: { guest: 'locked', user: 'locked', member: 'open' } },
    { id: 'E2-4', name: '账号页有英语会员套餐', run: async (c) => (await c.get('/api/account')).data.plans.some((p) => p.scope === 'english'), expect: same(true) },
  ] },

  // ───────── G 语文 · 古诗文大会（初选 / 复选线上卷；决选笔试卷：分值不同，简答交卷后自评） ─────────
  { id: 'GS1', area: '语文', name: '古诗文大会决选笔试卷', cases: [
    { id: 'GS1-1', name: '古诗文大会有初选、复选、决选三种卷子', run: async (c) => { const ex = (await c.get(`/api/exams?student=${c.sid}&family=gushiwen`)).data; return ['-cx-', '-fx-', '-jx-'].every((k) => ex.some((e) => e.id.includes(k))); }, expect: same(true) },
    { id: 'GS1-2', name: '开考：题目带题型和分值，不带答案和简答得分点', run: async (c) => {
      const s = await c.post('/api/sessions', { exam_id: GSW_JX, student_id: c.sid, mode: 'exam' }); c.gswSid = s.data.session.id;
      const P = (await c.get(`/api/sessions/${c.gswSid}`)).data.problems;
      const self = P.filter((p) => p.kind === 'self');
      return `${self.length > 0}/${P.every((p) => p.points > 0)}/${P.some((p) => 'answer' in p || p.extra?.rubric)}`;
    }, expect: same('true/true/false') },
    { id: 'GS1-3', name: '交卷前不能自评', run: async (c) => { const P = (await c.get(`/api/sessions/${c.gswSid}`)).data.problems; c.gswSelf = P.find((p) => p.kind === 'self'); return st(await c.post(`/api/sessions/${c.gswSid}/selfscore`, { problem_id: c.gswSelf.id, got: 1 })); }, expect: same(409) },
    { id: 'GS1-4', name: '空卷交卷 0 分，满分按分值合计是 100', run: async (c) => { const r = (await c.post(`/api/sessions/${c.gswSid}/submit`, { answers: { [c.gswSelf.id]: '我的回答' }, times: {} })).data; return `${r.items.reduce((a, x) => a + x.got, 0)}/${r.items.reduce((a, x) => a + x.points, 0)}`; }, expect: same('0/100') },
    { id: 'GS1-5', name: '简答自评超过分值按满分记，总分跟着变', run: async (c) => { const r = (await c.post(`/api/sessions/${c.gswSid}/selfscore`, { problem_id: c.gswSelf.id, got: 999 })).data; return r.got === c.gswSelf.points && r.score === c.gswSelf.points; }, expect: same(true) },
    { id: 'GS1-6', name: '自评按 0.5 分取整，负数按 0', run: async (c) => `${(await c.post(`/api/sessions/${c.gswSid}/selfscore`, { problem_id: c.gswSelf.id, got: 1.3 })).data.got}/${(await c.post(`/api/sessions/${c.gswSid}/selfscore`, { problem_id: c.gswSelf.id, got: -2 })).data.got}`, expect: same('1.5/0') },
    { id: 'GS1-7', name: '不是简答的题不能自评', run: async (c) => { const it = (await c.get(`/api/sessions/${c.gswSid}/review`)).data.items.find((x) => x.kind !== 'self'); return st(await c.post(`/api/sessions/${c.gswSid}/selfscore`, { problem_id: it.problem_id, got: 2 })); }, expect: same(400) },
    { id: 'GS1-8', name: '不能给别人的卷子自评', run: async (c) => st(await c.req(`/api/sessions/${c.gswSid}/selfscore`, 'POST', { problem_id: c.gswSelf.id, got: 1 }, c.outsider.T)), expect: same(404) },
    { id: 'GS1-9', name: '成绩页带参考答案和得分点', run: async (c) => { const it = (await c.get(`/api/sessions/${c.gswSid}/review`)).data.items.find((x) => x.kind === 'self'); return !!(it.answer && it.extra?.rubric?.length); }, expect: same(true) },
  ] },

  { id: 'FH1', area: '语文', name: '飞花令（语文会员专享）', cases: [
    { id: 'FH1-1', name: '不是语文会员：只给「花」一个字试用；语文会员：整个诗库（数学会员不含语文）', run: async (c) => { const d = (await c.get('/api/chinese/feihua')).data; return `${d.member}/${d.data.chars.length}`; }, expect: { guest: 'false/1', user: 'false/1', member: 'false/1' } },
    { id: 'FH1-2', name: '试用的诗句都带「花」字', run: async (c) => { const d = (await c.get('/api/chinese/feihua')).data.data; return d.lines.length > 50 && d.lines.every((l) => l[0].includes('花') && d.poems[l[1]]); }, expect: same(true) },
    { id: 'FH1-3', name: '开通语文会员后能拿到全部 83 个字（含总决选用字「无」）', run: async (c) => { if (c.role !== 'member') return 'skip'; await c.admin(`/api/admin/accounts/${c.aid}`, 'POST', { action: 'add_days', value: 31, tier: 'chinese', reason: '标准测试：语文会员' }); const d = (await c.get('/api/chinese/feihua')).data; return `${d.member}/${d.data.chars.length}`; }, expect: { guest: 'skip', user: 'skip', member: 'true/83' } },
    { id: 'FH1-4', name: '没登录拿不到', run: async (c) => st(await c.anon('/api/chinese/feihua', 'GET')), expect: same(401) },
    { id: 'FH1-6', name: '会背记录跟账号：加两句、删一句，再读出来是一句', run: async (c) => {
      await c.post('/api/chinese/feihua/done', { student_id: c.sid, add: ['春眠不觉晓，处处闻啼鸟。', '花落知多少'] });
      await c.post('/api/chinese/feihua/done', { student_id: c.sid, remove: ['花落知多少'] });
      return (await c.get(`/api/chinese/feihua/done?student=${c.sid}`)).data.lines.join('|');
    }, expect: same('春眠不觉晓，处处闻啼鸟。') },
    { id: 'FH1-7', name: '不能读写别人家孩子的会背记录', run: async (c) => `${st(await c.get(`/api/chinese/feihua/done?student=${c.outsider.sid}`))}/${st(await c.post('/api/chinese/feihua/done', { student_id: c.outsider.sid, add: ['x'] }))}`, expect: same('404/404') },
    { id: 'FH1-5', name: '账号页有语文会员套餐', run: async (c) => (await c.get('/api/account')).data.plans.some((p) => p.scope === 'chinese'), expect: same(true) },
  ] },

  { id: 'GS2', area: '语文', name: '古诗文大会练习（速答 / 按考点专项练，免费）', cases: [
    { id: 'GS2-1', name: '考点列表：四年级有名句补全、诗人常识等考点，每个都有题', run: async (c) => { const d = (await c.get('/api/chinese/gsw/topics?grade=4')).data; return d.total > 200 && ['mingju', 'shiren'].every((t) => d.topics.some((x) => x.id === t && x.n > 10)); }, expect: same(true) },
    { id: 'GS2-2', name: '速答：20 道不重复的古诗文单选，限时 2 分钟左右，交卷后才出答案', run: async (c) => { const d = (await c.post('/api/chinese/gsw/drill', { student_id: c.sid, kind: 'speed', grade: 4 })).data; c.gsSpeed = d.session.id; const sec = (d.session.deadline_at - d.session.server_now) / 1000; return `${d.problems.length}/${new Set(d.problems.map((p) => p.id)).size}/${d.problems.every((p) => p.id.startsWith('gsw-') && !('answer' in p))}/${sec > 100 && sec < 130}/${d.session.drill}`; }, expect: same('20/20/true/true/true') },
    { id: 'GS2-3', name: '速答交卷后能看成绩', run: async (c) => (await c.post(`/api/sessions/${c.gsSpeed}/submit`, { answers: {}, times: {} })).data.items.length, expect: same(20) },
    { id: 'GS2-4', name: '专项练：15 道同一考点的题，每题能马上判对错', run: async (c) => { const d = (await c.post('/api/chinese/gsw/drill', { student_id: c.sid, kind: 'topic', topic: 'shiren', grade: 4 })).data; const p = d.problems[0]; const k = (await c.post(`/api/sessions/${d.session.id}/check`, { problem_id: p.id, answer: 'A' })).data; return `${d.problems.length}/${d.session.mode}/${typeof k.correct}`; }, expect: same('15/practice/boolean') },
    { id: 'GS2-5', name: '练习类型、考点校验；不能给别人家孩子开练习', run: async (c) => `${st(await c.post('/api/chinese/gsw/drill', { student_id: c.sid, kind: 'x' }))}/${st(await c.post('/api/chinese/gsw/drill', { student_id: c.sid, kind: 'topic', topic: 'x' }))}/${st(await c.post('/api/chinese/gsw/drill', { student_id: c.outsider.sid, kind: 'speed' }))}`, expect: same('400/400/404') },
  ] },
  { id: 'BS1', area: '语文', name: '每日背诗（免费）', cases: [
    { id: 'BS1-1', name: '能拿到必背篇目（原文和白话行数一致）', run: async (c) => { const it = (await c.get('/api/chinese/poems')).data.items; return it.length > 100 && it.every((p) => p.text.length === p.plain.length); }, expect: same(true) },
    { id: 'BS1-2', name: '背会一篇：1 天后复习', run: async (c) => { const r = (await c.post('/api/chinese/poems/progress', { student_id: c.sid, poem: 1, result: 'learned' })).data; return `${r.stage}/${Math.round((r.due_at - Date.now()) / 86400000)}`; }, expect: same('1/1') },
    { id: 'BS1-3', name: '复习背出来：间隔变成 3 天', run: async (c) => { const r = (await c.post('/api/chinese/poems/progress', { student_id: c.sid, poem: 1, result: 'good' })).data; return `${r.stage}/${Math.round((r.due_at - Date.now()) / 86400000)}`; }, expect: same('2/3') },
    { id: 'BS1-4', name: '复习没背出：回到第 0 轮，明天再来', run: async (c) => { const r = (await c.post('/api/chinese/poems/progress', { student_id: c.sid, poem: 1, result: 'again' })).data; return `${r.stage}/${Math.round((r.due_at - Date.now()) / 86400000)}`; }, expect: same('0/1') },
    { id: 'BS1-5', name: '进度能读回来', run: async (c) => (await c.get(`/api/chinese/poems/progress?student=${c.sid}`)).data.progress.find((x) => x.poem === 1)?.reps, expect: same(3) },
    { id: 'BS1-6', name: '篇目和结果校验；不能改别人家孩子的进度', run: async (c) => `${st(await c.post('/api/chinese/poems/progress', { student_id: c.sid, poem: 9999, result: 'learned' }))}/${st(await c.post('/api/chinese/poems/progress', { student_id: c.sid, poem: 1, result: 'hack' }))}/${st(await c.post('/api/chinese/poems/progress', { student_id: c.outsider.sid, poem: 1, result: 'learned' }))}`, expect: same('400/400/404') },
  ] },

  // ───────── J 游客转正（只对游客，最后执行） ─────────
  { id: 'J1', area: '账号', name: '游客注册', cases: [
    { id: 'J1-1', name: '游客注册送 10 次', run: async (c) => (await c.post('/api/account/bind', { phone: c.newPhone(), password: 'abc123', nickname: '转正' })).data.credits_added, expect: { guest: 10, user: 'skip', member: 'skip' } },
    { id: 'J1-2', name: '注册后游客时的错题还在', run: async (c) => (await c.get(`/math/api/students/${c.sid}/profile`)).data.mistakes.length > 0, expect: { guest: true, user: 'skip', member: 'skip' } },
    { id: 'J1-4', name: '注册后知识图谱和知识项能用了', run: async (c) => `${st(await c.get(`/math/api/students/${c.sid}/graph`))}/${st(await c.get(`/math/api/kp/${KP}?student=${c.sid}`))}`, expect: { guest: '200/200', user: 'skip', member: 'skip' } },
    { id: 'J1-3', name: '注册后可以用次数解锁', run: async (c) => (await c.post('/api/unlock', { item: `adv:${P25(2)}` })).data.charged, expect: { guest: true, user: 'skip', member: 'skip' } },
  ] },
];

export const caseCount = () => FEATURES.reduce((n, f) => n + f.cases.length, 0);
