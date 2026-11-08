import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openStore, digest } from '../src/store.js';
import { importSnapshot } from '../src/import.js';

// Deliberately has no remote service access. Operates only on the dedicated sponsor database.
const [command, ...args]=process.argv.slice(2);
if(!process.env.SPONSOR_DB_PATH) throw new Error('Set SPONSOR_DB_PATH to the separate sponsor database.');
const store=openStore(process.env.SPONSOR_DB_PATH);
try {
 if(command==='import') {
  if(args.length!==1)throw new Error('Usage: admin.js import snapshot.json');
  const snapshot=JSON.parse(readFileSync(args[0],'utf8'));importSnapshot(store.db,snapshot);console.log('Verified snapshot imported transactionally.');
 } else if(command==='approve') {
  const [id,sponsorId,name,expires]=args;
  if(!/^[\w-]{1,100}$/.test(id??'')||!/^[\w-]{1,100}$/.test(sponsorId??'')||!name||name.length>100||!Number.isFinite(Date.parse(expires))||new Date(expires)<=new Date())throw new Error('Usage: admin.js approve member-id sponsor-id display-name future-ISO-expiry. Use only after independent sponsor verification.');
  const code=randomBytes(32).toString('base64url');
  store.db.prepare('INSERT INTO members VALUES(?,?,?,?,1,?)').run(id,sponsorId,name,digest(code),new Date(expires).toISOString());
  console.log('Approved sponsor invitation (shown once; deliver securely; do not log):\n'+code);
 } else if(command==='revoke') {
  if(args.length!==1)throw new Error('Usage: admin.js revoke member-id');
  store.db.prepare('UPDATE members SET approved=0 WHERE id=?').run(args[0]);console.log('Membership revoked; existing sessions are denied on their next request.');
 } else throw new Error('Commands: import, approve, revoke. No self-service role selection.');
} finally { store.close(); }
