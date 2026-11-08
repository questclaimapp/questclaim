import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const assets={};
for(const [route,file,type] of [['/sponsors/dashboard/','index.html','text/html; charset=utf-8'],['/sponsors/dashboard/dashboard.js','dashboard.js','text/javascript; charset=utf-8'],['/sponsors/dashboard/style.css','style.css','text/css; charset=utf-8']]) assets[route]={body:readFileSync('public/'+file,'utf8'),type};
const modules={'worker.js':"import {createWorker} from './cloud-worker.js';\nimport assets from './assets.js';\nexport default createWorker(assets);\n",'cloud-worker.js':readFileSync('src/cloud-worker.js','utf8'),'cloud-store.js':readFileSync('src/cloud-store.js','utf8'),'assets.js':'export default '+JSON.stringify(assets)+';\n'};
mkdirSync('.build',{recursive:true});writeFileSync('.build/modules.json',JSON.stringify(modules));console.log('Cloudflare modules built; no deployment performed.');
