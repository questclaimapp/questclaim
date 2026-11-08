import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { openStore, digest } from '../src/store.js';
import { importSnapshot } from '../src/import.js';
import { createApp } from '../src/server.js';
const from='2026-11-01T00:00:00.000Z', to='2026-11-07T00:00:00.000Z';
const now=()=>new Date('2026-11-08T00:00:00.000Z');
const code='a'.repeat(43), otherCode='b'.repeat(43);
function fixture(){
 const store=openStore();
 for(const [id,sponsor,name,secret] of [['one','s1','Sponsor A',code],['two','s2','Sponsor B',otherCode]])store.db.prepare('INSERT INTO members VALUES(?,?,?,?,1,?)').run(id,sponsor,name,digest(secret),'2027-01-01T00:00:00.000Z');
 const events=[['v1','views','x'],['v2','views','x'],['s1','searches','x'],['s2','searches','x'],['s3','searches','y'],['f1','finds','y'],['c1','claims','y']].map(([sourceId,metric,actor])=>({sourceId,metric,actorHash:digest(actor),occurredAt:'2026-11-03T00:00:00.000Z'}));
 const hunt={id:'h1',sponsorId:'s1',title:'Fixture hunt — not production data',prizeStatus:'found_pending',statusAsOf:to,statusSource:'test lifecycle',events,coverage:['views','searches','finds','claims'].map(metric=>({metric,from,through:to,source:'test source',complete:true,eventCount:events.filter(e=>e.metric===metric).length,qualifiedSearches:true,approvedClaimsOnly:true})),cost:{amountMinor:10000,currency:'USD',basis:'Prize funding plus platform fees',source:'test ledger',verified:true,from,to}};
 importSnapshot(store.db,{version:1,hunts:[hunt,{id:'h2',sponsorId:'s2',title:'Other sponsor private hunt',prizeStatus:'unknown',events:[],coverage:[]}]});
 return {store,hunt};
}
test('metrics distinguish attempts from people, finds from approved claims, cost basis, and tenant',()=>{
 const {store}=fixture();try{const member=store.authenticate(store.login(code,now()),now());const result=store.overview(member,from,to);assert.equal(result.hunts.length,1);const h=result.hunts[0];assert.equal(h.activity.views.count,2);assert.equal(h.activity.views.uniquePeople,1);assert.equal(h.activity.searches.count,3);assert.equal(h.activity.searches.uniquePeople,2);assert.equal(h.activity.finds.count,1);assert.equal(h.activity.claims.count,1);assert.equal(h.prize.status,'found_pending');assert.equal(h.cost.minorPerEngagedPlayer,5000);assert.equal(h.cost.basis,'Prize funding plus platform fees');}finally{store.close();}
});
test('missing coverage is unavailable, covered zero is real zero, missing identities disable cost',()=>{
 const {store}=fixture();try{const member=store.authenticate(store.login(code,now()),now());let h=store.overview(member,'2026-10-01T00:00:00.000Z',to).hunts[0];assert.equal(h.activity.views.count,null);assert.equal(h.cost.available,false);store.db.prepare("UPDATE events SET actor_hash=NULL WHERE metric='searches'").run();h=store.overview(member,from,to).hunts[0];assert.equal(h.activity.searches.uniquePeople,null);assert.equal(h.cost.available,false);store.db.prepare("DELETE FROM events WHERE metric='claims'").run();assert.equal(store.overview(member,from,to).hunts[0].activity.claims.count,0);}finally{store.close();}
});
test('cost requires matching exact period, positive denominator, verified record',()=>{
 const {store}=fixture();try{const member=store.authenticate(store.login(code,now()),now());assert.equal(store.overview(member,'2026-11-02T00:00:00.000Z',to).hunts[0].cost.available,false);store.db.prepare("DELETE FROM events WHERE metric='searches'").run();assert.equal(store.overview(member,from,to).hunts[0].cost.available,false);store.db.prepare('UPDATE hunts SET cost_verified=0').run();assert.equal(store.overview(member,from,to).hunts[0].cost.amountMinor,null);}finally{store.close();}
});
test('membership approval, expiry, logout, and revocation enforced server-side',()=>{
 const {store}=fixture();try{assert.equal(store.login('bad',now()),null);const token=store.login(code,now());assert.ok(store.authenticate(token,now()));store.db.prepare('UPDATE members SET approved=0 WHERE id=?').run('one');assert.equal(store.authenticate(token,now()),null);assert.equal(store.login(code,now()),null);const other=store.login(otherCode,now());store.logout(other);assert.equal(store.authenticate(other,now()),null);assert.equal(store.login(otherCode,new Date('2028-01-01')),null);}finally{store.close();}
});
test('source imports idempotent; conflicting duplicate, reassignment, and incomplete evidence roll back',()=>{
 const {store,hunt}=fixture();try{importSnapshot(store.db,{version:1,hunts:[hunt]});assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,7);const changed=structuredClone(hunt);changed.events[0].metric='claims';assert.throws(()=>importSnapshot(store.db,{version:1,hunts:[changed]}),/Conflicting/);assert.throws(()=>importSnapshot(store.db,{version:1,hunts:[{...hunt,sponsorId:'s2'}]}),/ownership/);const incomplete=structuredClone(hunt);incomplete.coverage[0].eventCount=999;assert.throws(()=>importSnapshot(store.db,{version:1,hunts:[incomplete]}),/reconcile/);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM coverage').get().n,4);const unqualified=structuredClone(hunt);unqualified.coverage[1].qualifiedSearches=false;assert.throws(()=>importSnapshot(store.db,{version:1,hunts:[unqualified]}),/qualification/);}finally{store.close();}
});
test('HTTP sign-in, private overview, scope tampering, CSRF, logout, headers and assets',async()=>{
 const {store}=fixture();let origin;const app=createApp({store,origin:'http://127.0.0.1:18971',secureCookies:false,now});app.listen(18971,'127.0.0.1');await once(app,'listening');origin='http://127.0.0.1:18971';
 try{
  let r=await fetch(origin+'/sponsors/api/overview');assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');
  r=await fetch(origin+'/sponsors/dashboard/');assert.equal(r.status,200);assert.ok((await r.text()).includes('Your prize started a story'));assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  const post=(path,body,extra={})=>fetch(origin+'/sponsors/api/'+path,{method:'POST',headers:{'content-type':'application/json',origin,...extra},body:JSON.stringify(body)});
  r=await post('session',{code},{origin:'https://evil.invalid'});assert.equal(r.status,403);
  r=await post('session',{code,role:'admin',sponsorId:'s2'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));assert.ok(r.headers.get('set-cookie').includes('SameSite=Strict'));
  const query=new URLSearchParams({from,to});r=await fetch(origin+'/sponsors/api/overview?'+query,{headers:{cookie}});assert.equal(r.status,200);let body=await r.json();assert.equal(body.hunts.length,1);assert.equal(body.hunts[0].id,'h1');assert.ok(!JSON.stringify(body).includes('Other sponsor'));
  r=await fetch(origin+'/sponsors/api/overview?'+query+'&sponsorId=s2',{headers:{cookie}});assert.equal(r.status,400);
  r=await fetch(origin+'/sponsors/api/overview?from=bad&to=bad',{headers:{cookie}});assert.equal(r.status,400);
  for(const asset of ['dashboard.js','style.css']){r=await fetch(origin+'/sponsors/dashboard/'+asset);assert.equal(r.status,200);}
  r=await post('logout',{}, {cookie});assert.equal(r.status,200);r=await fetch(origin+'/sponsors/api/overview',{headers:{cookie}});assert.equal(r.status,401);
 } finally {app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();}
});
test('secure deployment uses host-only secure cookies and rate limits repeated logins',async()=>{
 const {store}=fixture();const app=createApp({store,origin:'http://127.0.0.1:18972',now});app.listen(18972,'127.0.0.1');await once(app,'listening');
 try{let r;for(let i=0;i<11;i++){r=await fetch('http://127.0.0.1:18972/sponsors/api/session',{method:'POST',headers:{origin:'http://127.0.0.1:18972','content-type':'application/json'},body:JSON.stringify({code})});if(i===0){assert.match(r.headers.get('set-cookie'),/^__Host-qc_sponsor=/);assert.ok(r.headers.get('set-cookie').includes('; Secure'));}}assert.equal(r.status,429);
 const status=await new Promise((resolve,reject)=>{const req=http.get('http://127.0.0.1:18972/healthz',{headers:{host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(status,400);
 }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();}
});

test('daily report remains tenant-scoped, deduplicated and distinct from period totals',()=>{
 const {store,hunt}=fixture();try{
  importSnapshot(store.db,{version:1,hunts:[hunt]});
  const member=store.authenticate(store.login(code,now()),now());
  const result=store.overview(member,from,to);assert.equal(result.hunts.length,1);
  const timeline=result.hunts[0].timeline;
  assert.equal(timeline.timeZone,'UTC');assert.equal(timeline.aggregation,'noncumulative_event_count');
  assert.equal(timeline.buckets.length,6);
  assert.deepEqual(timeline.series.searches.points.map(point=>point.count),[0,0,3,0,0,0]);
  assert.deepEqual(timeline.series.finds.points.map(point=>point.count),[0,0,1,0,0,0]);
  assert.deepEqual(timeline.series.claims.points.map(point=>point.count),[0,0,1,0,0,0]);
  assert.equal(result.hunts[0].activity.searches.uniquePeople,2);
  // Whole-period total is unavailable, but genuinely covered individual days may still plot.
  store.db.prepare("UPDATE coverage SET from_at=?,through_at=? WHERE hunt_id='h1' AND metric='searches'").run('2026-11-02T00:00:00.000Z','2026-11-05T00:00:00.000Z');
  const partial=store.overview(member,from,to).hunts[0];
  assert.equal(partial.activity.searches.count,null);
  assert.deepEqual(partial.timeline.series.searches.points.map(point=>point.count),[null,0,3,0,null,null]);
 }finally{store.close();}
});
