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
  quick_start: '点首页「开始做题」',
  reg_prompt: '点注册提示',
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
