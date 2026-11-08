import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStore,digest} from '../src/store.js';
import {controlSchema,prepareOperation} from '../src/operator.js';
import {sourceExportSql} from '../src/source-export.js';
const provision={version:1,id:'fixture-provision',kind:'provision',member:{id:'m1',sponsorId:'s1',name:'Local synthetic fixture',expiresAt:'2099-01-01T00:00:00.000Z'},verification:{independentlyVerified:true,reference:'LOCAL-TEST-NOT-REAL-VERIFICATION',verifiedBy:'test-operator',verifiedAt:'2026-01-01T00:00:00.000Z',sourceOwnerRef:'local-fixture-owner'}};
const from='2026-11-01T00:00:00.000Z',to='2026-11-03T00:00:00.000Z';
function fixture(){const s=openStore();s.db.exec(controlSchema);s.db.exec('CREATE TABLE IF NOT EXISTS sponsor_sessions(token_hash TEXT PRIMARY KEY, member_id TEXT, expires_at TEXT)');return s;}
function sync(){return {version:1,id:'fixture-sync',kind:'sync',source:'local synthetic source only',verifiedScope:['s1'],snapshot:{version:1,hunts:[{id:'h1',sponsorId:'s1',title:'Local fixture',prizeStatus:'unknown',events:[{sourceId:'e1',metric:'views',occurredAt:from,actorHash:null}],coverage:[{metric:'views',from,through:to,source:'test completeness attestation',complete:true,eventCount:1}]}]}};}
test('provision requires independent proof, is idempotent, never reassigns identity, revoke denies session',()=>{
 const s=fixture();try{
  assert.throws(()=>prepareOperation({...provision,verification:{independentlyVerified:false}},digest('x')),/verification/);
  const p=prepareOperation(provision,digest('a'.repeat(43)));s.db.exec(p.sql);s.db.exec(p.sql);
  assert.equal(s.db.prepare('SELECT count(*) n FROM members').get().n,1);
  const token=s.login('a'.repeat(43));assert.ok(s.authenticate(token));
  assert.throws(()=>s.db.exec(prepareOperation({...provision,id:'other',member:{...provision.member,sponsorId:'s2'}},digest('a'.repeat(43))).sql),/CHECK/);
  s.db.exec(prepareOperation({version:1,id:'revoke',kind:'revoke',memberId:'m1'}).sql);assert.equal(s.authenticate(token),null);
 }finally{s.close();}
});
test('source import requires verified scope, preserves immutable ownership/events and reconciles coverage',()=>{
 const s=fixture();try{
  const op=sync();assert.throws(()=>s.db.exec(prepareOperation(op).sql),/CHECK/);assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,0);
  s.db.exec(prepareOperation(provision,digest('a'.repeat(43))).sql);
  const plan=prepareOperation(op);s.db.exec(plan.sql);s.db.exec(plan.sql);
  assert.equal(s.db.prepare('SELECT count(*) n FROM events').get().n,1);
  assert.equal(s.db.prepare('SELECT count(*) n FROM reporting_locks').get().n,0);
  assert.throws(()=>prepareOperation({...op,verifiedScope:['other']}),/Cross-sponsor/);
  const changed=structuredClone(op);changed.id='conflict';changed.snapshot.hunts[0].events[0].occurredAt='2026-11-02T00:00:00.000Z';
  assert.throws(()=>s.db.exec(prepareOperation(changed).sql),/conflicting/);
  const member=s.authenticate(s.login('a'.repeat(43)));assert.equal(s.overview(member,from,to).hunts[0].activity.views.count,null);
  assert.equal(s.db.prepare('SELECT status FROM operator_runs WHERE id=?').get('conflict').status,'running');
 }finally{s.close();}
});
test('empty real sync logs completion but creates no synthetic memberships, hunts or coverage',()=>{
 const s=fixture();try{s.db.exec(prepareOperation({version:1,id:'empty',kind:'sync',source:'test empty source',verifiedScope:[],snapshot:{version:1,hunts:[]}}).sql);assert.equal(s.db.prepare('SELECT count(*) n FROM members').get().n,0);assert.equal(s.db.prepare('SELECT count(*) n FROM hunts').get().n,0);assert.equal(s.db.prepare('SELECT status FROM operator_runs').get().status,'complete');}finally{s.close();}
});
test('source exporter validates scope/window, uses both owner links and never exports raw actors/GPS or invented coverage',()=>{
 const query=sourceExportSql([{sponsorId:'11111111-1111-1111-1111-111111111111',sourceOwnerRef:'22222222-2222-2222-2222-222222222222'}],from,to);
 assert.match(query,/JOIN public.sponsor_hunts/);assert.match(query,/a.owner_id=s.owner_user_id/);assert.match(query,/c.status='approved'/);
 assert.match(query,/'\[\]'::jsonb AS coverage/);assert.ok(!query.includes('c.user_id'));assert.ok(!query.includes('gps_lat'));assert.ok(!query.includes("'searches'"));
 assert.throws(()=>sourceExportSql([{sponsorId:"';DROP TABLE hunts",sourceOwnerRef:'bad'}],from,to),/Verified/);
 assert.match(sourceExportSql([],from,to),/NULL::uuid/);
});
test('coverage cannot silently ignore already-imported events in its declared window',()=>{
 const s=fixture();try{
  s.db.exec(prepareOperation(provision,digest('a'.repeat(43))).sql);s.db.exec(prepareOperation(sync()).sql);
  const additional=sync();additional.id='second-batch';additional.snapshot.hunts[0].events[0].sourceId='e2';
  assert.throws(()=>s.db.exec(prepareOperation(additional).sql),/CHECK/);
  assert.equal(s.db.prepare('SELECT count(*) n FROM reporting_locks').get().n,1);
  const member=s.authenticate(s.login('a'.repeat(43)));assert.equal(s.overview(member,from,to).hunts[0].activity.views.available,false);
 }finally{s.close();}
});
