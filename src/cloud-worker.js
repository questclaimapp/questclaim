import { cloudStore, hash } from './cloud-store.js';
const headers={
 'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'permissions-policy':'camera=(), microphone=(), geolocation=()','x-frame-options':'DENY','strict-transport-security':'max-age=31536000',
 'x-questclaim-service':'sponsor-metrics'
};
const origin='https://questclaim.com';
const json=(status,body,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json; charset=utf-8',...extra}});
const canonical=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
async function limitedJson(request) {
 if(Number(request.headers.get('content-length'))>2048)throw new Error('size');
 const reader=request.body?.getReader();let bytes=0;const chunks=[];
 if(!reader)throw new Error('json');
 while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();throw new Error('size');}chunks.push(value);}
 const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(body));}catch{throw new Error('json');}
}
export function createWorker(assets) {return {async fetch(request,env) {
 try {
  const url=new URL(request.url);if(url.origin!==origin)return json(400,{error:'Unexpected origin.'});
  const route=url.pathname;
  if(route==='/sponsors/dashboard'&&request.method==='GET')return new Response(null,{status:308,headers:{...headers,location:'/sponsors/dashboard/'}});
  if(assets[route]&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:assets[route].body,{headers:{...headers,'content-type':assets[route].type}});
  if(!['/sponsors/api/session','/sponsors/api/logout','/sponsors/api/overview'].includes(route))return json(404,{error:'Not found.'});
  if(!env.SPONSOR_DB)return json(503,{error:'Separate sponsor reporting store is not configured.'});
  const store=cloudStore(env.SPONSOR_DB), now=new Date();
  const token=(request.headers.get('cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-qc_sponsor='))?.slice(18);
  if(request.method==='POST') {
   if(request.headers.get('origin')!==origin)return json(403,{error:'Origin not allowed.'});
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'JSON required.'});
  }
  if(route==='/sponsors/api/session'&&request.method==='POST') {
   if(!env.LOGIN_LIMITER)return json(503,{error:'Sponsor sign-in protection is not configured.'});
   // Cloudflare supplies this header; never accept a client-selected forwarding address.
   const key=await hash((request.headers.get('cf-connecting-ip')??'unknown')+now.toISOString().slice(0,10));
   if(!(await env.LOGIN_LIMITER.limit({key})).success)return json(429,{error:'Too many attempts. Try again later.'});
   let body;try{body=await limitedJson(request);}catch(error){return json(error.message==='size'?413:400,{error:'Invalid or oversized request.'});}
   const session=await store.login(body?.code,now);if(!session)return json(401,{error:'Access not approved or invitation expired.'});
   return json(200,{ok:true},{'set-cookie':`__Host-qc_sponsor=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
  }
  if(route==='/sponsors/api/logout'&&request.method==='POST') {
   await store.logout(token);return json(200,{ok:true},{'set-cookie':'__Host-qc_sponsor=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  }
  if(route==='/sponsors/api/overview'&&request.method==='GET') {
   const member=await store.authenticate(token,now);if(!member)return json(401,{error:'Approved sponsor sign-in required.'});
   for(const key of url.searchParams.keys())if(!['from','to'].includes(key))return json(400,{error:'Unsupported filter.'});
   const from=url.searchParams.get('from')??new Date(now.getTime()-30*86400000).toISOString(),to=url.searchParams.get('to')??now.toISOString();
   if(!canonical(from)||!canonical(to)||from>=to||Date.parse(to)>now.getTime()||Date.parse(to)-Date.parse(from)>366*86400000)return json(400,{error:'Use a valid past ISO UTC interval of at most 366 days.'});
   return json(200,await store.overview(member,from,to));
  }
  return json(405,{error:'Method not allowed.'});
 }catch{return json(503,{error:'Sponsor reporting is temporarily unavailable. No activity counts were inferred.'});}
}};}
