import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { sourceExportSql } from '../src/source-export.js';
const [input,out='operator-private/source-export.sql']=process.argv.slice(2);
if(!input)throw new Error('Usage: prepare-source-export.js verified-scope-window.json [output.sql]');
const config=JSON.parse(readFileSync(input,'utf8'));
const query=sourceExportSql(config.scopes,config.from,config.to);
mkdirSync('operator-private',{recursive:true,mode:0o700});writeFileSync(out,query,{mode:0o600});
console.log('Read-only source query prepared. Execute via the sanctioned Supabase connector, then wrap the returned snapshot in a sync operation with the same verified scope.');
