import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const metrics = ['views', 'searches', 'finds', 'claims'];
export const schema = `
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
`;
export function openStore(path = ':memory:') {
 const db = new DatabaseSync(path); db.exec(schema);
 const sessions = new Map();
 return {
  db,
  close() { db.close(); },
  login(code, now = new Date()) {
   if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
   const member = db.prepare('SELECT * FROM members WHERE code_hash=?').get(digest(code));
   if (!member || !member.approved || member.expires_at <= now.toISOString()) return null;
   if (!timingSafeEqual(Buffer.from(member.code_hash), Buffer.from(digest(code)))) return null;
   const token = randomBytes(32).toString('base64url');
   // Bound memory. Sessions are opaque, never logged or persisted, and expire after 8 hours.
   for (const [key, value] of sessions) if (value.expires <= now.getTime()) sessions.delete(key);
   if (sessions.size >= 10000) return null;
   sessions.set(digest(token), { memberId: member.id, expires: now.getTime() + 8*3600*1000 });
   return token;
  },
  authenticate(token, now = new Date()) {
   if (typeof token !== 'string' || token.length !== 43) return null;
   const session = sessions.get(digest(token));
   if (!session || session.expires <= now.getTime()) return null;
   const member = db.prepare('SELECT id,sponsor_id,name,approved,expires_at FROM members WHERE id=?').get(session.memberId);
   return member?.approved && member.expires_at > now.toISOString() ? member : null;
  },
  logout(token) { if (token) sessions.delete(digest(token)); },
  overview(member, from, to) {
   const hunts = db.prepare('SELECT * FROM hunts WHERE sponsor_id=? ORDER BY title,id').all(member.sponsor_id);
   return { sponsorName: member.name, period: { from, to }, hunts: hunts.map(hunt => {
    const activity = {};
    for (const metric of metrics) {
     const coverage = db.prepare('SELECT * FROM coverage WHERE hunt_id=? AND metric=?').get(hunt.id, metric);
     if (!coverage || coverage.from_at > from || coverage.through_at < to) {
      activity[metric] = { available: false, count: null, uniquePeople: null, reason: 'Verified source coverage does not cover this whole period.', coverage: coverage ?? null };
      continue;
     }
     const row = db.prepare(`SELECT COUNT(*) AS count, COUNT(DISTINCT actor_hash) AS people,
      SUM(CASE WHEN actor_hash IS NULL THEN 1 ELSE 0 END) AS unidentified
      FROM events WHERE hunt_id=? AND metric=? AND occurred_at>=? AND occurred_at<?`).get(hunt.id, metric, from, to);
     activity[metric] = { available: true, count: row.count,
      uniquePeople: row.unidentified > 0 ? null : row.people,
      source: coverage.source, through: coverage.through_at };
    }
    const engaged = activity.searches.uniquePeople;
    const verifiedCost = Boolean(hunt.cost_verified && Number.isSafeInteger(hunt.cost_minor) &&
     hunt.currency === 'USD' && hunt.cost_basis && hunt.cost_source && hunt.cost_from === from && hunt.cost_to === to);
    const costAvailable = verifiedCost && activity.searches.available && engaged !== null && engaged > 0;
    return { id: hunt.id, title: hunt.title,
     prize: { status: hunt.prize_status, asOf: hunt.status_as_of, source: hunt.status_source }, activity,
     cost: { available: costAvailable, minorPerEngagedPlayer: costAvailable ? hunt.cost_minor / engaged : null,
      amountMinor: verifiedCost ? hunt.cost_minor : null, currency: verifiedCost ? hunt.currency : null,
      basis: verifiedCost ? hunt.cost_basis : null, source: verifiedCost ? hunt.cost_source : null,
      denominator: 'Unique source-pseudonymized players with at least one qualified hunt search in this exact period.',
      reason: costAvailable ? null : 'Needs verified cost for this exact period and a nonzero, fully identified qualified search audience.' }
    };
   }) };
  }
 };
}
