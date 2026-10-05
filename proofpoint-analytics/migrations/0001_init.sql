-- 0001_init.sql — analytics schema for jchowlabs.dev
--
-- One events table. "site" (teacher / alliances / falcon / blog / home)
-- is derived from the slug's first path segment at query time, so no
-- separate column or catalog table is needed.

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,        -- page_view | session_end | voice_start | voice_end | voice_error
  slug         TEXT NOT NULL,        -- window.location.pathname, e.g. '/teacher/'
  session_id   TEXT,                 -- anonymous per-tab id (sessionStorage), no cookies
  ip_country   TEXT,                 -- from Cloudflare headers; raw IP is never stored
  referrer     TEXT,
  user_agent   TEXT,
  is_bot       INTEGER DEFAULT 0,    -- 1 if detected as bot
  bot_category TEXT,                 -- ai_agent | crawler | headless_browser | null
  device_type  TEXT,                 -- desktop | mobile | tablet
  payload      TEXT,                 -- JSON, e.g. {"duration_ms":123456}
  timestamp    INTEGER NOT NULL,     -- Unix ms, set server-side (never trust client clock)
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type      ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_slug      ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_bot       ON events(is_bot);
