// Read-only database observer. Only an isolated sandbox can be measured here.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url)),postgres=require('postgres');
const [input,output]=process.argv.slice(2);
if(!input||!output||!process.env.BRIOFOLD_LOAD_OBSERVER_DATABASE_URL)throw Error('Observed load report, new output and isolated sandbox observer URL required');
const report=JSON.parse(await readFile(input,'utf8'));
if(report.mode!=='executed-synthetic-sandbox'||report.simulation!==true||!Array.isArray(report.samples)||report.samples.length===0||report.samples.length>60000)throw Error('Actual synthetic sandbox load report required');
const ids=[...new Set(report.samples.map(s=>s.observation_id).filter(Boolean))];
if(ids.some(id=>!/^[0-9a-f-]{36}$/.test(id)))throw Error('Invalid observation reference');
const db=postgres(process.env.BRIOFOLD_LOAD_OBSERVER_DATABASE_URL,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
let rows=[];
try{
 rows=await db.begin('read only',async tx=>{
  const [realm]=await tx.unsafe('SELECT environment FROM financial_realm WHERE singleton');if(realm?.environment!=='sandbox')throw Error('Isolated sandbox observer required');
  return ids.length?tx.unsafe("SELECT m.observation_id,m.status,extract(epoch FROM(m.processed_at-i.received_at))*1000 AS elapsed_ms FROM pg07_receipt_results m JOIN financial_receipt_observations o ON o.id=m.observation_id JOIN financial_inbound_events i ON i.id=o.inbound_event_id WHERE m.environment='sandbox' AND m.observation_id=ANY($1::uuid[])",[ids]):[];
 });
}catch{throw Error('Sandbox observation unavailable. No worker timing PASS claimed.')}
finally{await db.end({timeout:3})}
const matched=rows.filter(r=>r.status==='matched'&&r.elapsed_ms!==null&&Number(r.elapsed_ms)>=0),durations=matched.map(r=>Number(r.elapsed_ms)).sort((a,b)=>a-b),p95=durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??null;
const pass=p95!==null&&p95<5000&&matched.length===report.samples.length&&report.samples.every(s=>s.ack)&&report.dropped===0;
await writeFile(output,JSON.stringify({mode:'read-only-sandbox-worker-observer',simulation:true,observed_at:new Date().toISOString(),expected_receipts:report.samples.length,distinct_observations:ids.length,matched_receipts:matched.length,verification_p95_ms:p95,verification_target_pass:pass,unresolved_or_unmatched:report.samples.length-matched.length,real_device_verified:false},null,2)+'\n',{flag:'wx'});
if(!pass)process.exitCode=1;
