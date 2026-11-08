
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, name TEXT NOT NULL,
 code_hash TEXT NOT NULL UNIQUE, approved INTEGER NOT NULL DEFAULT 0,
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hunts (
 id TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL, title TEXT NOT NULL,
 prize_status TEXT NOT NULL CHECK(prize_status IN ('unknown','available','found_pending','claimed','paused','rolled_over','ended')),
 status_as_of TEXT, status_source TEXT,
 cost_minor INTEGER CHECK(cost_minor IS NULL OR cost_minor>=0), currency TEXT,
 cost_basis TEXT, cost_verified INTEGER NOT NULL DEFAULT 0,
 cost_from TEXT, cost_to TEXT, cost_source TEXT
);
CREATE TABLE IF NOT EXISTS coverage (
 hunt_id TEXT NOT NULL REFERENCES hunts(id), metric TEXT NOT NULL CHECK(metric IN ('views','searches','finds','claims')),
 from_at TEXT NOT NULL, through_at TEXT NOT NULL, source TEXT NOT NULL,
 PRIMARY KEY(hunt_id,metric)
);
CREATE TABLE IF NOT EXISTS events (
 source_id TEXT NOT NULL, hunt_id TEXT NOT NULL REFERENCES hunts(id),
 metric TEXT NOT NULL CHECK(metric IN ('views','searches','finds','claims')),
 occurred_at TEXT NOT NULL, actor_hash TEXT,
 PRIMARY KEY(hunt_id,source_id)
);
CREATE INDEX IF NOT EXISTS events_hunt_time ON events(hunt_id,metric,occurred_at);
CREATE INDEX IF NOT EXISTS hunts_sponsor ON hunts(sponsor_id);

CREATE TABLE IF NOT EXISTS sponsor_sessions (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sponsor_sessions_expiry ON sponsor_sessions(expires_at);
