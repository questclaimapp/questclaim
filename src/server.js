import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const files = { '/sponsors/dashboard/': ['index.html','text/html; charset=utf-8'], '/sponsors/dashboard/dashboard.js': ['dashboard.js','text/javascript; charset=utf-8'], '/sponsors/dashboard/style.css': ['style.css','text/css; charset=utf-8'] };
const securityHeaders = {
 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer',
 'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'permissions-policy':'camera=(), microphone=(), geolocation=()', 'x-frame-options':'DENY'
};
export function createApp({ store, origin = 'http://127.0.0.1:8788', secureCookies = true, now = () => new Date() }) {
 const expectedOrigin = new URL(origin).origin;
 const attempts = new Map();
 const cookieName = secureCookies ? '__Host-qc_sponsor' : 'qc_sponsor_local';
 return http.createServer(async (req,res) => {
  for (const [key,value] of Object.entries(securityHeaders)) res.setHeader(key,value);
  if(expectedOrigin.startsWith('https:')) res.setHeader('strict-transport-security','max-age=31536000');
  const send = (status, body) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };
  try {
   const url = new URL(req.url,expectedOrigin);
   if (url.origin !== expectedOrigin) return send(400,{error:'Invalid request.'});
   if (req.headers.host !== new URL(expectedOrigin).host) return send(400,{error:'Unexpected host.'});
   const route = url.pathname;
   const isApi = route.startsWith('/sponsors/api/');
   const token = (req.headers.cookie ?? '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   if (req.method === 'POST' && isApi) {
    if (req.headers.origin !== expectedOrigin) return send(403,{error:'Origin not allowed.'});
    if (!String(req.headers['content-type']).startsWith('application/json')) return send(415,{error:'JSON required.'});
   }
   if (route === '/sponsors/api/session' && req.method === 'POST') {
    // Never trust X-Forwarded-For; deployment must apply edge rate limits as well.
    const ip = req.socket.remoteAddress ?? 'unknown'; const time=now().getTime();
    for (const [key,value] of attempts) if(value.reset <= time) attempts.delete(key);
    const rate=attempts.get(ip) ?? {count:0,reset:time+60000};
    if(rate.count >= 10 || attempts.size >= 10000) return send(429,{error:'Too many attempts. Try again later.'});
    rate.count++; attempts.set(ip,rate);
    let body=''; for await (const chunk of req) { body+=chunk; if(Buffer.byteLength(body)>2048) return send(413,{error:'Request too large.'}); }
    let parsed; try{parsed=JSON.parse(body);}catch{return send(400,{error:'Invalid request.'});}
    const session=store.login(parsed?.code,now());
    if(!session) return send(401,{error:'Access not approved or invitation expired.'});
    res.setHeader('set-cookie',`${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secureCookies?'; Secure':''}`);
    return send(200,{ok:true});
   }
   if (route === '/sponsors/api/logout' && req.method === 'POST') {
    store.logout(token); res.setHeader('set-cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies?'; Secure':''}`);
    return send(200,{ok:true});
   }
   if (route === '/sponsors/api/overview' && req.method === 'GET') {
    const member=store.authenticate(token,now()); if(!member) return send(401,{error:'Approved sponsor sign-in required.'});
    // No sponsor/role parameter accepted. Tenant scope comes exclusively from stored membership.
    for(const key of url.searchParams.keys()) if(!['from','to'].includes(key)) return send(400,{error:'Unsupported filter.'});
    const end=now().toISOString(); const start=new Date(now().getTime()-30*86400000).toISOString();
    const from=url.searchParams.get('from') ?? start, to=url.searchParams.get('to') ?? end;
    const canonical = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===s;
    if(!canonical(from)||!canonical(to)||from>=to||Date.parse(to)>now().getTime()||Date.parse(to)-Date.parse(from)>366*86400000) return send(400,{error:'Use a valid past ISO UTC interval of at most 366 days.'});
    return send(200,store.overview(member,from,to));
   }
   if(route==='/healthz' && req.method==='GET') return send(200,{ok:true,service:'questclaim-sponsor'});
   if(route==='/sponsors/dashboard' && req.method==='GET') {res.writeHead(308,{location:'/sponsors/dashboard/'});return res.end();}
   if(files[route] && ['GET','HEAD'].includes(req.method)) {
    const [file,type]=files[route];const body=await readFile(resolve(publicDir,file));res.writeHead(200,{'content-type':type});return res.end(req.method==='HEAD'?undefined:body);
   }
   return send(404,{error:'Not found.'});
  } catch { if(!res.headersSent) send(500,{error:'The sponsor service could not complete this request.'}); else res.end(); }
 });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const origin=process.env.SPONSOR_ORIGIN ?? 'http://127.0.0.1:8788';
 const local=new URL(origin);const isLoopback=['127.0.0.1','localhost','[::1]'].includes(local.hostname);
 if(local.protocol!=='https:' && !isLoopback) throw new Error('HTTPS is required outside loopback.');
 const path=process.env.SPONSOR_DB_PATH ?? './data/sponsor.sqlite';mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});
 const store=openStore(path);const app=createApp({store,origin,secureCookies:local.protocol==='https:'});
 app.requestTimeout=10000; app.headersTimeout=10000;
 app.listen(Number(process.env.PORT ?? local.port ?? 8788)||8788,process.env.HOST ?? '127.0.0.1',()=>console.log(`Sponsor service listening at ${origin}/sponsors/dashboard/`));
 const shutdown=()=>app.close(()=>{store.close();process.exit(0);});process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
