import { metrics } from './store.js';
const id = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const text = value => typeof value==='string' && value.trim().length>0 && value.length<=500;
const iso = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const assert = (condition, message) => { if(!condition) throw new Error(message); };
// Administrator-only offline import. No ingestion endpoint is exposed to browsers/players.
export function importSnapshot(db, snapshot) {
 assert(snapshot?.version===1 && Array.isArray(snapshot.hunts) && snapshot.hunts.length<=1000,'Invalid snapshot.');
 db.exec('BEGIN IMMEDIATE');
 try {
  for(const h of snapshot.hunts) {
   assert(id(h.id)&&id(h.sponsorId)&&text(h.title),'Invalid hunt identity.');
   const existing=db.prepare('SELECT sponsor_id FROM hunts WHERE id=?').get(h.id);
   assert(!existing || existing.sponsor_id===h.sponsorId,'Hunt ownership cannot be reassigned by import.');
   assert(['unknown','available','found_pending','claimed','paused','rolled_over','ended'].includes(h.prizeStatus),'Invalid prize lifecycle.');
   assert(h.prizeStatus==='unknown' || iso(h.statusAsOf)&&text(h.statusSource),'Verified lifecycle requires time and authoritative source.');
   const cost=h.cost;
   assert(!cost || Number.isSafeInteger(cost.amountMinor)&&cost.amountMinor>=0&&cost.currency==='USD'&&text(cost.basis)&&text(cost.source)&&cost.verified===true&&iso(cost.from)&&iso(cost.to)&&cost.from<cost.to,'Invalid verified cost; USD cents only in v1.');
   db.prepare(`INSERT INTO hunts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,prize_status=excluded.prize_status,status_as_of=excluded.status_as_of,status_source=excluded.status_source,
    cost_minor=excluded.cost_minor,currency=excluded.currency,cost_basis=excluded.cost_basis,cost_verified=excluded.cost_verified,
    cost_from=excluded.cost_from,cost_to=excluded.cost_to,cost_source=excluded.cost_source`).run(
    h.id,h.sponsorId,h.title,h.prizeStatus,h.statusAsOf??null,h.statusSource??null,cost?.amountMinor??null,cost?.currency??null,
    cost?.basis??null,cost?1:0,cost?.from??null,cost?.to??null,cost?.source??null);
   assert(Array.isArray(h.events)&&h.events.length<=100000,'Invalid events.');
   for(const e of h.events) {
    assert(id(e.sourceId)&&metrics.includes(e.metric)&&iso(e.occurredAt),'Invalid source event.');
    assert(e.actorHash===null || typeof e.actorHash==='string'&&/^[a-f0-9]{64}$/.test(e.actorHash),'Actor reference must be a source-keyed pseudonymous HMAC, never player identity.');
    const prior=db.prepare('SELECT * FROM events WHERE hunt_id=? AND source_id=?').get(h.id,e.sourceId);
    assert(!prior || prior.metric===e.metric&&prior.occurred_at===e.occurredAt&&prior.actor_hash===e.actorHash,'Conflicting duplicate source event.');
    if(!prior)db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(e.sourceId,h.id,e.metric,e.occurredAt,e.actorHash);
   }
   assert(Array.isArray(h.coverage)&&h.coverage.length<=4,'Invalid coverage.');
   // Replacing coverage is conservative: omitted metrics become unavailable, never stale-complete.
   db.prepare('DELETE FROM coverage WHERE hunt_id=?').run(h.id);
   for(const c of h.coverage) {
    assert(metrics.includes(c.metric)&&iso(c.from)&&iso(c.through)&&c.from<c.through&&text(c.source)&&c.complete===true&&Number.isSafeInteger(c.eventCount)&&c.eventCount>=0,'Coverage requires source-attested completeness and event count.');
    assert(c.metric!=='searches'||c.qualifiedSearches===true,'Search source must attest qualification.');
    assert(c.metric!=='claims'||c.approvedClaimsOnly===true,'Claim source must attest approved claims only.');
    const actual=db.prepare('SELECT COUNT(*) AS count FROM events WHERE hunt_id=? AND metric=? AND occurred_at>=? AND occurred_at<?').get(h.id,c.metric,c.from,c.through).count;
    assert(actual===c.eventCount,'Coverage event count does not reconcile.');
    db.prepare('INSERT INTO coverage VALUES(?,?,?,?,?)').run(h.id,c.metric,c.from,c.through,c.source);
   }
  }
  db.exec('COMMIT');
 } catch(error) {db.exec('ROLLBACK');throw error;}
}
