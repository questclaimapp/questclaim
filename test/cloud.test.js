import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore,digest} from '../src/store.js';
import {importSnapshot} from '../src/import.js';
import {createWorker} from '../src/cloud-worker.js';
import {cloudStore} from '../src/cloud-store.js';
const code='a'.repeat(43),origin='https://questclaim.com';
const from='2026-11-01T00:00:00.000Z',to='2026-11-07T00:00:00.000Z';
function d1(db){return {prepare(sql){let params=[];const stmt={bind(...values){params=values;return stmt;},async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){return db.prepare(sql).run(...params);}};return stmt;},async batch(statements){db.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());db.exec('COMMIT');return values;}catch(e){db.exec('ROLLBACK');throw e;}}};}
function setup(){const store=openStore();store.db.exec(readFileSync('migrations/0001_sponsor.sql','utf8'));store.db.prepare('INSERT INTO members VALUES(?,?,?,?,1,?)').run('member','sponsor','Verified fixture',digest(code),'2027-01-01T00:00:00.000Z');const events=[['search1','searches','one'],['search2','searches','one'],['search3','searches','two']].map(([sourceId,metric,actor])=>({sourceId,metric,actorHash:digest(actor),occurredAt:'2026-11-03T00:00:00.000Z'}));importSnapshot(store.db,{version:1,hunts:[{id:'hunt',sponsorId:'sponsor',title:'Synthetic fixture only',prizeStatus:'unknown',events,coverage:[{metric:'searches',from,through:to,complete:true,eventCount:3,qualifiedSearches:true,source:'test source'}],cost:{amountMinor:2000,currency:'USD',basis:'Fixture funding and fees',source:'test ledger',verified:true,from,to}},{id:'other',sponsorId:'other',title:'Private other sponsor',prizeStatus:'unknown',events:[],coverage:[]}]});return {store,env:{SPONSOR_DB:d1(store.db),LOGIN_LIMITER:{async limit(){return {success:true};}}}};}
const worker=createWorker({'/sponsors/dashboard/':{body:'<h1>Hunt report test asset</h1>',type:'text/html'}});
function request(path,options={}){return new Request(origin+path,options);}
function post(path,body,headers={}){return request('/sponsors/api/'+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
test('Worker authenticates approved tenant, scopes metrics, rejects tampering, expires/revokes/logs out',async()=>{
 const {store,env}=setup();try{
  let r=await worker.fetch(request('/sponsors/api/overview'),env);assert.equal(r.status,401);
  r=await worker.fetch(post('session',{code,sponsorId:'other',role:'admin'}),env);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(cookie,/^__Host-qc_sponsor=/);assert.ok(r.headers.get('set-cookie').includes('Secure'));
  const query=new URLSearchParams({from,to});r=await worker.fetch(request('/sponsors/api/overview?'+query,{headers:{cookie}}),env);assert.equal(r.status,200);const report=await r.json();assert.equal(report.hunts.length,1);assert.equal(report.hunts[0].id,'hunt');assert.equal(report.hunts[0].activity.searches.count,3);assert.equal(report.hunts[0].activity.searches.uniquePeople,2);assert.equal(report.hunts[0].activity.views.count,null);assert.equal(report.hunts[0].cost.minorPerEngagedPlayer,1000);
  const member=await cloudStore(env.SPONSOR_DB).authenticate(cookie.split('=')[1]);assert.deepEqual(report,await cloudStore(env.SPONSOR_DB).overview(member,from,to));
  r=await worker.fetch(request('/sponsors/api/overview?'+query+'&sponsorId=other',{headers:{cookie}}),env);assert.equal(r.status,400);
  store.db.prepare('UPDATE members SET approved=0').run();r=await worker.fetch(request('/sponsors/api/overview',{headers:{cookie}}),env);assert.equal(r.status,401);
  store.db.prepare('UPDATE members SET approved=1').run();r=await worker.fetch(post('logout',{}, {cookie}),env);assert.equal(r.status,200);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sponsor_sessions').get().n,0);
 }finally{store.close();}
});
test('Worker preserves exact path boundary, validates CSRF/body, fail-closes missing bindings and rate limits',async()=>{
 const {store,env}=setup();try{
  let r=await worker.fetch(request('/sponsors/dashboard/'),env);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-questclaim-service'),'sponsor-metrics');
  for(const path of ['/','/privacy/','/sponsors/','/app','/sponsors/dashboard-other']){r=await worker.fetch(request(path),env);assert.equal(r.status,404);}
  r=await worker.fetch(post('session',{code},{origin:'https://evil.invalid'}),env);assert.equal(r.status,403);
  r=await worker.fetch(post('session',{code:'x'.repeat(2100)}),env);assert.equal(r.status,413);
  r=await worker.fetch(post('session',{code}),{SPONSOR_DB:env.SPONSOR_DB});assert.equal(r.status,503);
  r=await worker.fetch(post('session',{code}),{...env,LOGIN_LIMITER:{async limit(){return {success:false};}}});assert.equal(r.status,429);
  r=await worker.fetch(request('/sponsors/api/overview'),{});assert.equal(r.status,503);
  r=await worker.fetch(new Request('https://evil.invalid/sponsors/dashboard/'),env);assert.equal(r.status,400);
 }finally{store.close();}
});
test('Worker aggregation matches local service contract and expired session fails closed',async()=>{
 const {store,env}=setup();try{const token=await cloudStore(env.SPONSOR_DB).login(code);const member=await cloudStore(env.SPONSOR_DB).authenticate(token);assert.deepEqual(await cloudStore(env.SPONSOR_DB).overview(member,from,to),store.overview(member,from,to));store.db.prepare('UPDATE sponsor_sessions SET expires_at=?').run(from);assert.equal(await cloudStore(env.SPONSOR_DB).authenticate(token),null);}finally{store.close();}
});
