// No network or credentials. Generates requests for execution through the authenticated
// Cloudflare connector; there is deliberately no public operator HTTP endpoint.
import { createHash } from 'node:crypto';
import { openStore } from './store.js';
import { importSnapshot } from './import.js';
export const controlSchema = `
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
`;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=500;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const quote=value=>value===null?'NULL':typeof value==='number'?(check(Number.isSafeInteger(value),'Unsafe number'),String(value)):"'"+String(value).replaceAll("'","''")+"'";
function sql(statement,params=[]) {let i=0;const result=statement.replace(/\?/g,()=>quote(params[i++]));check(i===params.length,'Parameter mismatch');return result+';';}
function assertion(run,condition){return `INSERT OR REPLACE INTO operator_checks VALUES(${quote(run)},CASE WHEN (${condition}) THEN 1 ELSE 0 END);`;}
export function prepareOperation(operation, invitationHash=null) {
 check(operation?.version===1&&identifier(operation.id),'Version and unique operation id required');
 check(['provision','revoke','sync'].includes(operation.kind),'Unsupported operator command');
 const fingerprint=createHash('sha256').update(JSON.stringify({operation,invitationHash})).digest('hex');
 const run=quote(operation.id), statements=[assertion(operation.id,`NOT EXISTS(SELECT 1 FROM operator_runs WHERE id=${run} AND payload_hash<>${quote(fingerprint)})`),
  'UPDATE reporting_revision SET value=value+1 WHERE id=1;',
  `INSERT INTO operator_runs VALUES(${run},${quote(fingerprint)},${quote(operation.kind)},${quote(operation.source??'operator')},'running',NULL) ON CONFLICT(id) DO UPDATE SET status='running',completed_at=NULL;`];
 if(operation.kind==='provision') {
  const m=operation.member,v=operation.verification;
  check(identifier(m?.id)&&identifier(m?.sponsorId)&&text(m?.name)&&iso(m?.expiresAt)&&Date.parse(m.expiresAt)>Date.now(),'Invalid member or expiry');
  check(v?.independentlyVerified===true&&text(v?.reference)&&identifier(v?.verifiedBy)&&iso(v?.verifiedAt)&&Date.parse(v.verifiedAt)<=Date.now()&&text(v?.sourceOwnerRef),'Independent business ownership verification evidence required; email/legacy role is insufficient');
  check(typeof invitationHash==='string'&&/^[a-f0-9]{64}$/.test(invitationHash),'Invitation digest required');
  statements.push(assertion(operation.id,`NOT EXISTS(SELECT 1 FROM verified_sponsors WHERE sponsor_id=${quote(m.sponsorId)} AND source_owner_ref<>${quote(v.sourceOwnerRef)})`));
  statements.push(sql('INSERT INTO verified_sponsors VALUES(?,?,?,?,?) ON CONFLICT(sponsor_id) DO UPDATE SET verification_ref=excluded.verification_ref,verified_by=excluded.verified_by,verified_at=excluded.verified_at',[m.sponsorId,v.sourceOwnerRef,v.reference,v.verifiedBy,v.verifiedAt]));
  // Existing identities cannot silently move to another sponsor or rotate credentials on retry.
  statements.push(assertion(operation.id,`NOT EXISTS(SELECT 1 FROM members WHERE id=${quote(m.id)} AND (sponsor_id<>${quote(m.sponsorId)} OR code_hash<>${quote(invitationHash)}))`));
  statements.push(sql('INSERT INTO members VALUES(?,?,?,?,1,?) ON CONFLICT(id) DO NOTHING',[m.id,m.sponsorId,m.name,invitationHash,m.expiresAt]));
 } else if(operation.kind==='revoke') {
  check(identifier(operation.memberId),'Member id required');
  statements.push(sql('UPDATE members SET approved=0 WHERE id=?',[operation.memberId]),sql('DELETE FROM sponsor_sessions WHERE member_id=?',[operation.memberId]));
 } else {
  check(text(operation.source)&&Array.isArray(operation.verifiedScope)&&operation.verifiedScope.every(identifier),'Source and verified sponsor scope required');
  const snapshot=operation.snapshot;
  check(snapshot?.version===1&&Array.isArray(snapshot.hunts),'Normalized authoritative snapshot required');
  check(snapshot.hunts.every(h=>operation.verifiedScope.includes(h.sponsorId)),'Cross-sponsor snapshot outside authorized scope');
  check(snapshot.hunts.reduce((n,h)=>n+(h.events?.length??0),0)<=2000&&snapshot.hunts.length<=100,'Split large source windows into bounded operations');
  // Run the SAME importer validator against an isolated empty SQLite model, capturing
  // parameterized writes only. Never open or inspect a real application database here.
  const model=openStore();const writes=[];
  try {
   const adapter={exec:statement=>model.db.exec(statement),prepare(statement){const prepared=model.db.prepare(statement);return {get:(...params)=>prepared.get(...params),run(...params){const result=prepared.run(...params);writes.push({statement,params});return result;}};}};
   importSnapshot(adapter,snapshot);
  } finally {model.close();}
  for(const sponsor of operation.verifiedScope)statements.push(assertion(operation.id,`EXISTS(SELECT 1 FROM verified_sponsors WHERE sponsor_id=${quote(sponsor)})`));
  for(const h of snapshot.hunts) {
   statements.push(assertion(operation.id,`NOT EXISTS(SELECT 1 FROM hunts WHERE id=${quote(h.id)} AND sponsor_id<>${quote(h.sponsorId)})`));
   statements.push(assertion(operation.id,`NOT EXISTS(SELECT 1 FROM reporting_locks WHERE hunt_id=${quote(h.id)} AND run_id<>${run})`));
   statements.push(sql('INSERT INTO reporting_locks VALUES(?,?) ON CONFLICT(hunt_id) DO NOTHING',[h.id,operation.id]));
  }
  for(const write of writes) {
   // Immutable triggers reject conflicting duplicates; identical retries are no-ops.
   const statement=write.statement.startsWith('INSERT INTO events VALUES')?write.statement+' ON CONFLICT(hunt_id,source_id) DO NOTHING':write.statement;
   statements.push(sql(statement,write.params));
  }
  for(const h of snapshot.hunts)for(const c of h.coverage)statements.push(assertion(operation.id,`(SELECT count(*) FROM events WHERE hunt_id=${quote(h.id)} AND metric=${quote(c.metric)} AND occurred_at>=${quote(c.from)} AND occurred_at<${quote(c.through)})=${quote(c.eventCount)}`));
 }
 statements.push(`UPDATE operator_runs SET status='complete',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${run};`);
 statements.push('UPDATE reporting_revision SET value=value+1 WHERE id=1;');
 statements.push(`DELETE FROM reporting_locks WHERE run_id=${run};`);
 return {sql:statements.join('\n'),fingerprint};
}
export function connectorRequest(sqlText,accountId,databaseId) {
 check(/^[a-f0-9]{32}$/.test(accountId)&&/^[a-f0-9-]{36}$/.test(databaseId),'Invalid target');
 return `async () => { const r=await cloudflare.request({method:'POST',path:${JSON.stringify('/accounts/'+accountId+'/d1/database/'+databaseId+'/query')},body:{sql:${JSON.stringify(sqlText)}}});if(!r.success||!Array.isArray(r.result)||r.result.some(x=>x.success===false))throw new Error('Sponsor D1 operation did not complete; inspect account-authorized operation logs.');return {success:true,statements:r.result.length}; }`;
}
