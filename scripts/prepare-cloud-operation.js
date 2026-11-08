import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { prepareOperation, connectorRequest } from '../src/operator.js';
const [input,directory='operator-private']=process.argv.slice(2);
if(!input)throw new Error('Usage: node scripts/prepare-cloud-operation.js operation.json [private-output-directory]. This prepares only; execution requires the authorized Cloudflare connector.');
const operation=JSON.parse(readFileSync(input,'utf8'));
// Validate identity/proof before touching any invitation path.
prepareOperation(operation,operation.kind==='provision'?'0'.repeat(64):null);
const config=JSON.parse(readFileSync('cloudflare-deployment.json','utf8'));
const path=resolve(directory);mkdirSync(path,{recursive:true,mode:0o700});
let code=null,hash=null;
if(operation.kind==='provision') {
 const invitePath=resolve(path,operation.id+'.invitation');
 // Avoid a different invitation/hash on retries. Existing private files must be kept securely.
 if(existsSync(invitePath))code=readFileSync(invitePath,'utf8').trim();
 else {code=randomBytes(32).toString('base64url');writeFileSync(invitePath,code+'\n',{mode:0o600,flag:'wx'});}
 hash=createHash('sha256').update(code).digest('hex');
}
const prepared=prepareOperation(operation,hash);
const requestPath=resolve(path,operation.id+'.request.js');
writeFileSync(requestPath,connectorRequest(prepared.sql,'d76f148e5784780255629f67f6d9f4ee',config.database.id),{mode:0o600});
console.log('Prepared authenticated-connector operation: '+requestPath);
if(code)console.log('Invitation saved privately, not printed; deliver only after successful provisioning via an authorized secure channel.');
