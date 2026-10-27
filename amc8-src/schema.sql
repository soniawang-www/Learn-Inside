-- AMC 8 模拟考 · D1 (SQLite) 建表
-- 原则：
--   1. attempt_event 记原始作答事件，mastery 是可随时重算的派生数据
--   2. 所有可付费内容带 tier 字段（free / premium），收费只改数据不改代码
--   3. 付费内容由服务端按 entitlement 拦截，不下发到前端

PRAGMA foreign_keys = ON;

-- ───────── 账号 ─────────
-- 家长账号（登录主体），孩子作为 student 挂在下面（未成年人信息由家长管理）
CREATE TABLE IF NOT EXISTS account (
  id           TEXT PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,          -- 试用期简单 token；以后换手机号/微信登录
  invite_code  TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS student (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES account(id),
  nickname    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- 权益：以后接支付，就是往这里写记录
CREATE TABLE IF NOT EXISTS entitlement (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES account(id),
  tier        TEXT NOT NULL,                  -- premium / 以后可扩展 'pack:geometry' 等内容包
  starts_at   INTEGER NOT NULL,
  expires_at  INTEGER,                        -- NULL = 永久
  source      TEXT                            -- 'trial' / 'wechat_pay:xxx' / 'manual'
);

-- ───────── 题库 ─────────
CREATE TABLE IF NOT EXISTS exam (
  id            TEXT PRIMARY KEY,             -- 如 'amc8-2024'
  title         TEXT NOT NULL,
  year          INTEGER,
  source        TEXT NOT NULL,                -- 'official' / 'original'
  duration_sec  INTEGER NOT NULL DEFAULT 2400,
  published     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS problem (
  id           TEXT PRIMARY KEY,              -- 如 'amc8-2024-p07'
  exam_id      TEXT NOT NULL REFERENCES exam(id),
  number       INTEGER NOT NULL,              -- 题号 1..25
  stem         TEXT NOT NULL,                 -- Markdown + $LaTeX$
  figure       TEXT,                          -- 内联 SVG 或 R2 图片 URL
  choices      TEXT NOT NULL,                 -- JSON: {"A":"..","B":"..",...}
  answer       TEXT NOT NULL,                 -- 'A'..'E'
  difficulty   REAL,                          -- 校准后难度；NULL 时按题号推算
  reviewed     INTEGER NOT NULL DEFAULT 0,    -- 人工审核过才上线
  UNIQUE (exam_id, number)
);

CREATE TABLE IF NOT EXISTS hint (
  problem_id  TEXT NOT NULL REFERENCES problem(id),
  level       INTEGER NOT NULL,               -- 1 = 方向，2 = 关键一步，3 = 几乎给出做法
  content     TEXT NOT NULL,
  PRIMARY KEY (problem_id, level)
);

CREATE TABLE IF NOT EXISTS solution (
  id          TEXT PRIMARY KEY,
  problem_id  TEXT NOT NULL REFERENCES problem(id),
  kind        TEXT NOT NULL,                  -- 'basic' 简单思路 / 'advanced' 互动解析
  tier        TEXT NOT NULL DEFAULT 'free',
  content     TEXT,                           -- basic: Markdown；advanced: 步骤 JSON
  url         TEXT                            -- advanced 也可以是独立互动页地址
);

-- ───────── 知识图谱（小奥主干 + AMC 扩展）─────────
CREATE TABLE IF NOT EXISTS knowledge_point (
  id          TEXT PRIMARY KEY,               -- 如 'nt.divisibility'
  parent_id   TEXT REFERENCES knowledge_point(id),
  name        TEXT NOT NULL,
  amc_ext     INTEGER NOT NULL DEFAULT 0,     -- 1 = 小奥覆盖较弱、AMC 特有
  sort        INTEGER NOT NULL DEFAULT 0,
  tier        TEXT NOT NULL DEFAULT 'premium',-- 讲解内容的权限
  summary     TEXT,                           -- 一句话说明（免费可见）
  content     TEXT                            -- 讲解正文 Markdown（受 tier 保护）
);

CREATE TABLE IF NOT EXISTS kp_edge (           -- from 是 to 的前置
  from_kp  TEXT NOT NULL REFERENCES knowledge_point(id),
  to_kp    TEXT NOT NULL REFERENCES knowledge_point(id),
  PRIMARY KEY (from_kp, to_kp)
);

CREATE TABLE IF NOT EXISTS problem_kp (
  problem_id  TEXT NOT NULL REFERENCES problem(id),
  kp_id       TEXT NOT NULL REFERENCES knowledge_point(id),
  weight      REAL NOT NULL DEFAULT 1.0,      -- 主考点 1.0，辅助 0.3~0.5
  PRIMARY KEY (problem_id, kp_id)
);

-- ───────── 作答 ─────────
CREATE TABLE IF NOT EXISTS exam_session (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES student(id),
  exam_id      TEXT NOT NULL REFERENCES exam(id),
  mode         TEXT NOT NULL,                 -- 'exam' 模考（无提示）/ 'practice' 练习
  started_at   INTEGER NOT NULL,
  deadline_at  INTEGER NOT NULL,              -- 服务端计时，前端倒计时只是显示
  submitted_at INTEGER,
  score        INTEGER
);

-- 练习模式下查看提示的记录（服务端为准，交卷时汇总进 attempt_event.hints_used）
CREATE TABLE IF NOT EXISTS session_hint (
  session_id  TEXT NOT NULL REFERENCES exam_session(id),
  problem_id  TEXT NOT NULL REFERENCES problem(id),
  level       INTEGER NOT NULL,
  viewed_at   INTEGER NOT NULL,
  PRIMARY KEY (session_id, problem_id, level)
);

-- 原始事件：画像的唯一数据来源
CREATE TABLE IF NOT EXISTS attempt_event (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES exam_session(id),
  student_id    TEXT NOT NULL REFERENCES student(id),
  problem_id    TEXT NOT NULL REFERENCES problem(id),
  choice        TEXT,                         -- NULL = 未作答
  correct       INTEGER NOT NULL,
  time_sec      INTEGER,                      -- 停留在该题的总时长
  hints_used    INTEGER NOT NULL DEFAULT 0,   -- 用到第几级提示
  flagged       INTEGER NOT NULL DEFAULT 0,
  error_reason  TEXT,                         -- 复盘时标：unknown / careless / no_time / reading
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempt_student ON attempt_event(student_id, created_at);

-- 派生画像：可由 attempt_event 全量重算
CREATE TABLE IF NOT EXISTS mastery (
  student_id  TEXT NOT NULL REFERENCES student(id),
  kp_id       TEXT NOT NULL REFERENCES knowledge_point(id),
  rating      REAL NOT NULL DEFAULT 0,        -- 掌握度（logit 尺度，0 ≈ 中等）
  evidence    REAL NOT NULL DEFAULT 0,        -- 证据量（加权作答次数）
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (student_id, kp_id)
);
