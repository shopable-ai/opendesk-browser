-- Apply once to the D1 database. No prompt, URL, cookies, file or IP fields.
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS analytics_pending ON analytics_events (status,next_attempt_at,received_at);
CREATE TABLE IF NOT EXISTS analytics_rate (
  bucket TEXT PRIMARY KEY,
  used INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Latest accepted cumulative observation per installation/tool/day/metric.
-- Older/repeated versions cannot replace it; event IDs remain the separate outbox.
CREATE TABLE IF NOT EXISTS analytics_auto_latest (
  install_id TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version>0),
  total INTEGER NOT NULL CHECK(total>0),
  projection_gap INTEGER NOT NULL DEFAULT 0 CHECK(projection_gap IN (0,1)),
  last_event_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (install_id,tool_type,tool_id,utc_day,metric_type)
);
