// One bounded probe per invocation, suitable for the operator's scheduler.
// Persistent state directory must survive restarts. This does not deploy.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2],origin=new URL(process.env.BRIOFOLD_MONITOR_API_URL||'');
if(!directory||origin.protocol!=='https:'||origin.username||origin.password)throw Error('Persistent state directory and configured HTTPS API required');
await mkdir(directory,{recursive:true});const filename=path.join(directory,'monitor-state.json');
let prior={failures:0,state:'unknown',incident:null,delivery:null};try{prior=JSON.parse(await readFile(filename,'utf8'))}catch{}
let healthy=false;try{const r=await fetch(new URL('/readyz',origin),{redirect:'error',signal:AbortSignal.timeout(10000)});healthy=r.status===200}catch{}
const failures=healthy?0:prior.failures+1,state=healthy?'operational':failures>=2?'incident':'suspected';
let next={...prior,failures,state,observed_at:new Date().toISOString()};
if(state==='incident'&&prior.state!=='incident')next={...next,incident:randomUUID(),delivery:'pending'};
if(state==='operational'&&prior.state==='incident')next={...next,incident:randomUUID(),delivery:'pending'};
const persist=async()=>{const temporary=filename+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(next,null,2)+'\n',{mode:0o600});await rename(temporary,filename)};
await persist();
if(next.delivery==='pending'){
 const endpoint=process.env.BRIOFOLD_MONITOR_ALERT_URL;if(!endpoint){console.log(JSON.stringify({state,alert:'not_configured'}));process.exitCode=1}else{
  const target=new URL(endpoint);if(target.protocol!=='https:'||target.username||target.password)throw Error('Operator HTTPS alert destination required');
  const payload=JSON.stringify({id:next.incident,type:'payment_readiness',state,observed_at:next.observed_at});
  // Persist unknown BEFORE the external send. Crash or timeout must not claim
  // delivery and must not silently create repeated notifications.
  next.delivery='unknown';await persist();
  try{const r=await fetch(target,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','Idempotency-Key':next.incident,'X-Briofold-Alert-Digest':createHash('sha256').update(payload).digest('hex'),...(process.env.BRIOFOLD_MONITOR_ALERT_TOKEN?{Authorization:`Bearer ${process.env.BRIOFOLD_MONITOR_ALERT_TOKEN}`}:{})},body:payload});if(r.ok)next.delivery='accepted';else next.delivery='rejected'}catch{}
  await persist();console.log(JSON.stringify({state,alert:next.delivery}));if(next.delivery!=='accepted')process.exitCode=1;
 }
}else console.log(JSON.stringify({state,alert:next.delivery}));
