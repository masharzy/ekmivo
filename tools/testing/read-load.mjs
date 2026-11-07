// Authenticated read latency only. Explicit sandbox configuration; no mutations.
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
const [input,output,mode='plan']=process.argv.slice(2);
if(!input||!output||!['plan','run'].includes(mode))throw Error('Usage: read-load.mjs private-fixtures.json output.json [plan|run]');
const fixture=JSON.parse(await readFile(input,'utf8')),origin=new URL(fixture.origin);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
if(origin.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(origin.hostname)&&origin.protocol==='http:')||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||fixture.environment!=='sandbox'||!Array.isArray(fixture.accounts)||new Set(fixture.accounts.map(x=>x.workspace_id)).size!==25)throw Error('25 dedicated sandbox accounts and root API origin required');
for(const item of fixture.accounts)if(!uuid.test(item.workspace_id||'')||typeof item.read_key!=='string'||!item.read_key||/[\r\n]/.test(item.read_key))throw Error('Dedicated read-only key per workspace required');
const paths=['operations/payments','documents/customers','documents/invoices','refunds','reconciliation'];
const rate=50,seconds=60;
if(mode==='plan'){await writeFile(output,JSON.stringify({mode,executed:false,simulation:true,workspace_count:25,rate,seconds,paths,target_p95_ms:500},null,2)+'\n',{flag:'wx',mode:0o600})}
else{
 if(process.env.BRIOFOLD_ALLOW_SANDBOX_LOAD!=='true'||process.env.BRIOFOLD_LOAD_SANDBOX_ORIGIN!==origin.origin)throw Error('Explicit sandbox load authorization required');
 const pending=new Set(),samples=[];let dropped=0;
 async function read(n){const account=fixture.accounts[n%25],route=paths[Math.floor(n/25)%paths.length],started=performance.now();let status=null,valid=false;
  try{const result=await fetch(new URL(`/v1/workspaces/${account.workspace_id}/${route}?environment=sandbox`,origin),{headers:{Authorization:'Bearer '+account.read_key},redirect:'error',signal:AbortSignal.timeout(10000)});status=result.status;const data=await result.json();valid=status===200&&data&&typeof data==='object'&&!data.error;if(route==='reconciliation')valid=valid&&Array.isArray(data.items?.statements);else valid=valid&&Array.isArray(data.items)}catch{}
  samples.push({route,workspace_index:n%25,status,valid,duration_ms:performance.now()-started});
 }
 const start=performance.now();
 for(let n=0;n<rate*seconds;n++){const delay=start+n*1000/rate-performance.now();if(delay>0)await pause(delay);if(pending.size>=500){dropped++;continue}const task=read(n).finally(()=>pending.delete(task));pending.add(task)}await Promise.all(pending);
 const durations=samples.map(s=>s.duration_ms).sort((a,b)=>a-b),p95=durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??null;
 const result={schema_version:1,executed:true,simulation:true,observed_at:new Date().toISOString(),workspace_count:25,requested:rate*seconds,completed:samples.length,dropped,rate,seconds,p95_ms:p95,target_ms:500,target_pass:dropped===0&&samples.length===rate*seconds&&samples.every(s=>s.valid)&&p95!==null&&p95<500,samples};
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({completed:result.completed,dropped,p95_ms:p95,target_pass:result.target_pass}));
}
