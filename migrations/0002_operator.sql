
CREATE TABLE IF NOT EXISTS reporting_revision (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
INSERT OR IGNORE INTO reporting_revision VALUES(1,0);
CREATE TABLE IF NOT EXISTS verified_sponsors (
 sponsor_id TEXT PRIMARY KEY, source_owner_ref TEXT NOT NULL, verification_ref TEXT NOT NULL,
 verified_by TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operator_runs (
 id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','complete')), completed_at TEXT
);
CREATE TABLE IF NOT EXISTS reporting_locks (hunt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operator_checks (run_id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TRIGGER IF NOT EXISTS sponsor_hunt_owner_immutable BEFORE UPDATE OF sponsor_id ON hunts
WHEN old.sponsor_id<>new.sponsor_id BEGIN SELECT RAISE(ABORT,'hunt ownership cannot change'); END;
CREATE TRIGGER IF NOT EXISTS sponsor_event_immutable BEFORE INSERT ON events
WHEN EXISTS(SELECT 1 FROM events e WHERE e.hunt_id=new.hunt_id AND e.source_id=new.source_id
 AND (e.metric<>new.metric OR e.occurred_at<>new.occurred_at OR e.actor_hash IS NOT new.actor_hash))
BEGIN SELECT RAISE(ABORT,'conflicting source event'); END;
