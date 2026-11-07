// Owner/operator task after real store execution; this tool never erases data.
import {createHash} from 'node:crypto';
import {readFile,realpath,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {containsCredentials,validObservationTime} from '../release/safe-evidence.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const postgres=require('postgres');
const [input,output,mode='audit']=process.argv.slice(2);
if(!input||!output||!['audit','record'].includes(mode))throw Error('Usage: record-store.mjs reviewed-store.json output.json [audit|record]');
const d=JSON.parse(await readFile(input,'utf8'));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
if(containsCredentials(d)||!uuid.test(d.request_id||'')||!uuid.test(d.workspace_id||'')||!['control','financial_live','financial_sandbox','private_objects','jobs','android_cache','backups'].includes(d.store)||!['blocked','exported','deleted','retained','not_applicable'].includes(d.status)||typeof d.reason!=='string'||d.reason.trim().length<10||d.reason.length>500||!d.operator||!validObservationTime(d.observed_at)||d.simulated||!d.evidence_file)throw Error('Actual reviewed store outcome and safe retained evidence required');
if(d.status==='retained'&&(!validObservationTime(d.observed_at)||!Number.isFinite(Date.parse(d.retained_until))||Date.parse(d.retained_until)<=Date.now()))throw Error('Retained records need a future policy expiry');
const root=await realpath(path.dirname(path.resolve(input))),file=await realpath(path.resolve(root,d.evidence_file));
if(!file.startsWith(root+path.sep))throw Error('Evidence escapes reviewed directory');
const bytes=await readFile(file);if(containsCredentials(bytes.toString('utf8')))throw Error('Evidence may contain credentials');
const hash=createHash('sha256').update(bytes).digest('hex');
let recorded=false;
if(mode==='record'){
 if(process.env.BRIOFOLD_PRIVACY_RECORD_ENABLED!=='true'||!process.env.BRIOFOLD_PRIVACY_CONTROL_DATABASE_URL)throw Error('Explicit operator recording configuration required');
 const db=postgres(process.env.BRIOFOLD_PRIVACY_CONTROL_DATABASE_URL,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 try{
  await db.begin(async tx=>{
   const [boundary]=await tx.unsafe("SELECT current_user=pg_get_userbyid(c.relowner) AS owner,to_regclass('financial_realm') IS NULL AS control FROM pg_class c WHERE c.oid='workspaces'::regclass");
   if(!boundary?.owner||!boundary.control)throw Error('Control owner boundary required');
   const [result]=await tx.unsafe('SELECT pg13_privacy_observe($1::uuid,$2::uuid,$3,$4,$5,$6,$7::timestamptz) AS recorded',[d.request_id,d.workspace_id,d.store,d.status,hash,d.reason,d.retained_until||null]);
   if(!result.recorded)throw Error('Store observation unconfirmed');
  });recorded=true;
 }catch{throw Error('Store observation unavailable; no completion claim. Inspect restricted operator logs.')}
 finally{await db.end({timeout:3})}
}
await writeFile(output,JSON.stringify({schema_version:1,mode,recorded,store:d.store,status:d.status,evidence_sha256:hash,observed_at:d.observed_at,operator:d.operator,recorded_at:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});
