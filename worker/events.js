// 匿名事件计数：只按「北京时间的哪一天 + 事件名」累加次数，不记账号、不记 IP，用来看新用户在哪一步走掉。
// 服务器端事件（建游客、开始做题、交卷、注册）在对应接口里记；页面浏览这类只有浏览器知道的，用 POST /api/ev 记，
// 浏览器那边同一台设备同一天同一个事件只发一次（见各科 app.js 的 track）。

export const EV_MIGRATIONS = [
  'CREATE TABLE IF NOT EXISTS ev_count (day TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, name))',
];

// 浏览器能报的事件（白名单，防止乱写）
export const CLIENT_EVENTS = {
  view_home: '打开网站首页',
  view_math: '打开数学',
  view_chinese: '打开语文',
  view_english: '打开英语',
  view_join: '打开登录 / 注册页',
  scan_fill: '扫卷子二维码回填',
  scan_fill_user: '扫卷子二维码（已注册）',
  scan_fill_guest: '扫卷子二维码（游客）',
  skip_fill: '跳过回填直接看解析',
  quick_start: '点首页「开始做题」',
  reg_prompt: '点注册提示',
  ob_welcome: '看到新手欢迎页',
  ob_start: '欢迎页点「开始」',
  ob_browse: '欢迎页点「先看看真题」',
  remind_prompt: '完成页看到「明天几点提醒」',
  a2hs_prompt: '看到「放到手机桌面」',
  a2hs_done: '从桌面图标打开',
  a2hs_new: '新放到桌面（这台设备第一次从图标打开）',
  inapp_seen: '在微信 / 小红书里打开',
  inapp_tap: '点了「去浏览器打开」',
  xhs_copy: '复制小红书账号名',
};
// 漏斗里依次显示的事件（服务器端的也在这里起名字）
export const EV_NAMES = {
  ...CLIENT_EVENTS,
  guest_new: '自动建游客',
  first_start: '第一次开始做题（按人）',
  first_submit: '第一次交卷（按人）',
  start: '开始做题（次）',
  submit: '交卷（次）',
  register: '注册（新号）',
  register_bind: '游客注册（记录保留）',
  daily_start: '开始当天的打卡题（人次）',
  daily_done: '完成打卡（人次）',
  prep_plan: '新建备战计划',
  team_new: '新建队伍',
  team_join: '加入队伍',
  remind_ics: '加每日提醒到日历（下载）',
  extra_start: '打完卡再练一组',
  points_redeem: '积分换互动解析',
  resume_link: '从提醒链接接上游客记录',
  handoff_ok: '换到浏览器后接上了记录',
};

const day = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京时间

/** 计一次；失败不影响正常请求 */
export async function bump(env, name) {
  try {
    await env.DB.prepare('INSERT INTO ev_count (day, name, n) VALUES (?, ?, 1) ON CONFLICT (day, name) DO UPDATE SET n = n + 1')
      .bind(day(), name).run();
  } catch {}
}

export function registerEvents(route, { json, body, HttpError }) {
  route('POST', '/api/ev', async (req, env) => {
    const { e } = await body(req).catch(() => ({}));
    if (!CLIENT_EVENTS[e]) throw new HttpError(400, '未知事件');
    await bump(env, e);
    return json({ ok: true });
  });
}

/** 后台：最近 days 天每天每个事件的次数 */
export async function evReport(env, days = 14) {
  const since = new Date(Date.now() + 8 * 3600e3 - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT day, name, n FROM ev_count WHERE day >= ? ORDER BY day DESC').bind(since).all();
  return { names: EV_NAMES, rows: results };
}

/**
 * 后台：留存。按「第一次来」那天分组（孩子档案建立的日期，北京时间），看之后哪几天又来做过题（开始答题或打卡都算）
 * d1 = 第二天又来；d2_7 = 第 2–7 天里来过；d7 = 第 7 天及以后还来过
 */
export async function retention(env, days = 14) {
  const DAY = 86400e3;
  const bj = (t) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
  const dn = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
  const since = Date.parse(`${bj(Date.now() - (days - 1) * DAY)}T00:00:00+08:00`);
  const { results: studs } = await env.DB.prepare("SELECT s.id, s.created_at, a.guest FROM student s JOIN account a ON a.id = s.account_id WHERE s.created_at >= ? AND COALESCE(a.note, '') != 'test'").bind(since).all(); // 测试账号不算
  const { results: acts } = await env.DB.prepare(`SELECT es.student_id AS sid, es.started_at AS t FROM exam_session es JOIN student s ON s.id = es.student_id WHERE s.created_at >= ?`).bind(since).all();
  const act = {};
  for (const a of acts) (act[a.sid] ||= new Set()).add(dn(bj(a.t)));
  const today = dn(bj(Date.now()));
  const rows = {};
  for (const s of studs) {
    const d0 = dn(bj(s.created_at)), A = act[s.id] || new Set();
    const r = (rows[bj(s.created_at)] ||= { day: bj(s.created_at), new: 0, did: 0, d1: 0, d1_ok: 0, d2_7: 0, d2_7_ok: 0, d7: 0, d7_ok: 0, reg: 0 });
    r.new++; if (!s.guest) r.reg++;
    if (A.has(d0)) r.did++;
    if (today > d0) { r.d1_ok++; if (A.has(d0 + 1)) r.d1++; }
    if (today >= d0 + 2) { r.d2_7_ok++; if ([...A].some((d) => d >= d0 + 2 && d <= d0 + 7)) r.d2_7++; }
    if (today >= d0 + 7) { r.d7_ok++; if ([...A].some((d) => d >= d0 + 7)) r.d7++; }
  }
  return { rows: Object.values(rows).sort((a, b) => (a.day < b.day ? 1 : -1)) };
}
