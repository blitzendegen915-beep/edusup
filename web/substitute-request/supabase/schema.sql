-- 自習監督依頼システム スキーマ
-- Supabase の SQL Editor で実行してください

-- 教員マスタ
CREATE TABLE teachers (
  id      TEXT PRIMARY KEY,          -- 例: T001, T002
  name    TEXT NOT NULL,
  email   TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL DEFAULT ''
);

-- 時間割（その教員がその時限に授業がある = 空きではない）
CREATE TABLE timetable (
  id          SERIAL PRIMARY KEY,
  day_of_week TEXT    NOT NULL CHECK (day_of_week IN ('月', '火', '水', '木', '金')),
  period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 6),
  teacher_id  TEXT    NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  UNIQUE (day_of_week, period, teacher_id)
);

-- 依頼
CREATE TABLE requests (
  id           TEXT        PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_date  DATE        NOT NULL,
  period       INTEGER     NOT NULL CHECK (period BETWEEN 1 AND 6),
  requester_id TEXT        NOT NULL CONSTRAINT requests_requester_id_fkey REFERENCES teachers(id),
  reason       TEXT        NOT NULL,
  note         TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT '募集中' CHECK (status IN ('募集中', '確定', '期限切れ')),
  acceptor_id  TEXT        CONSTRAINT requests_acceptor_id_fkey REFERENCES teachers(id),
  accepted_at  TIMESTAMPTZ,
  deadline     TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_requests_status     ON requests(status);
CREATE INDEX idx_requests_created_at ON requests(created_at DESC);

-- メールリンク用トークン
CREATE TABLE tokens (
  id         TEXT        PRIMARY KEY,   -- UUID
  request_id TEXT        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  teacher_id TEXT        NOT NULL REFERENCES teachers(id),
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_request_id ON tokens(request_id);

-- ========== サンプルデータ（テスト用、実際はコメントアウトを外して使用） ==========

-- INSERT INTO teachers (id, name, email, subject) VALUES
--   ('T001', '山田 太郎', 'yamada@school.example', '英語'),
--   ('T002', '鈴木 花子', 'suzuki@school.example', '数学'),
--   ('T003', '佐藤 一郎', 'sato@school.example',   '国語'),
--   ('T004', '田中 恵子', 'tanaka@school.example',  '理科'),
--   ('T005', '伊藤 次郎', 'ito@school.example',     '社会');

-- INSERT INTO timetable (day_of_week, period, teacher_id) VALUES
--   ('月', 1, 'T001'), ('月', 3, 'T002'), ('月', 5, 'T003'),
--   ('火', 2, 'T001'), ('火', 4, 'T004'), ('火', 6, 'T005'),
--   ('水', 1, 'T002'), ('水', 3, 'T003'), ('水', 5, 'T001'),
--   ('木', 2, 'T004'), ('木', 4, 'T005'), ('木', 6, 'T002'),
--   ('金', 1, 'T003'), ('金', 3, 'T001'), ('金', 5, 'T004');
