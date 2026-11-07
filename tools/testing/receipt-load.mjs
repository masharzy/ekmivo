// Explicitly configured SANDBOX load. Synthetic signed receipts are not device
// evidence. Existing isolated enrolments/requests are supplied by the operator.
import {createHash,createPrivateKey,randomUUID,sign} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
const [fixtureFile,output,mode='plan']=process.argv.slice(2);
if(!fixtureFile||!output||!['plan','run'].includes(mode))throw Error('Usage: receipt-load.mjs private-fixtures.json output.json [plan|run]');
const f=JSON.parse(await readFile(fixtureFile,'utf8'));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const origin=new URL(f.origin);
if((origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||f.environment!=='sandbox'||!Array.isArray(f.devices)||new Set(f.devices.map(d=>d.workspace_id)).size!==25)throw Error('25 dedicated sandbox workspaces and configured origin required');
for(const d of f.devices)if(!uuid.test(d.workspace_id||'')||!uuid.test(d.enrollment_id||'')||!d.private_key_pem||!d.source||!d.binding||!['device_sms','device_notification'].includes(d.kind)||typeof d.evidence_template!=='string'||!d.evidence_template.includes('%REF%')||!d.evidence_template.includes('%TIME%')||!Number.isSafeInteger(d.sequence_start)||d.sequence_start<1)throw Error('Dedicated enrolled source, unique reference/time template and unused sequence range required');
const phases=[{name:'sustained',rate:50,seconds:900},{name:'burst',rate:200,seconds:60}];
if(mode==='plan'){
 await writeFile(output,JSON.stringify({mode:'plan',executed:false,simulation:true,workspace_count:25,phases,targets:{durable_ack_p95_ms:1000,non_provider_api_p95_ms:500,worker_verification_p95_ms:5000},limitations:'ACK does not prove matching. Verification latency requires the SQL/worker observer.'},null,2)+'\n',{flag:'wx'});
}else{
 if(process.env.BRIOFOLD_ALLOW_SANDBOX_LOAD!=='true'||process.env.BRIOFOLD_LOAD_SANDBOX_ORIGIN!==origin.origin)throw Error('Explicit sandbox load destination authorization required');
 const keys=f.devices.map(d=>{const key=createPrivateKey(d.private_key_pem);if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('P-256 fixture key required');return key});
 const sequences=f.devices.map(d=>d.sequence_start),pending=new Set(),samples=[],phasesObserved=[];
 const timeFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const path='/v1/device/events';
 let dropped=0,serial=0;
 async function send(index){
  const d=f.devices[index],event='load_'+randomUUID().replaceAll('-',''),stamp=String(Math.floor(Date.now()/1000));
  const raw=JSON.stringify({environment:'sandbox',enrollment_id:d.enrollment_id,source:d.source,binding:d.binding,kind:d.kind,evidence:d.evidence_template.replaceAll('%REF%',event.toUpperCase()).replaceAll('%TIME%',timeFormatter.format(new Date())),observed_at:new Date().toISOString(),sequence:sequences[index]++});
  const canonical=`POST\n${path}\n${stamp}\n${event}\n${createHash('sha256').update(raw).digest('hex')}`;
  const signature=sign('sha256',Buffer.from(canonical),keys[index]).toString('base64'),start=performance.now();
  let status=null,ack=false,observation=null;
  try{const r=await fetch(new URL(path,origin),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-Briofold-Device-ID':d.enrollment_id,'X-Briofold-Timestamp':stamp,'X-Briofold-Event-ID':event,'X-Briofold-Signature':signature},body:raw});status=r.status;const data=await r.json();ack=r.status===202&&data.ack==='durable';observation=uuid.test(data.observation_id||'')?data.observation_id:null}
  catch{}
  samples.push({event_id:event,workspace_index:index,status,ack,observation_id:observation,duration_ms:performance.now()-start});
 }
 for(const phase of phases){
  const began=performance.now(),before=samples.length,initialDropped=dropped;
  for(let n=0;n<phase.rate*phase.seconds;n++){
   const due=began+n*1000/phase.rate,delay=due-performance.now();if(delay>0)await pause(delay);
   if(pending.size>=500){dropped++;continue}
   const index=serial++%f.devices.length,promise=send(index);pending.add(promise);void promise.finally(()=>pending.delete(promise));
  }
  await Promise.all(pending);phasesObserved.push({...phase,actual_seconds:(performance.now()-began)/1000,sample_count:samples.length-before,dropped:dropped-initialDropped});
 }
 const accepted=samples.filter(s=>s.ack),sorted=accepted.map(s=>s.duration_ms).sort((a,b)=>a-b),p95=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]??null;
 const report={mode:'executed-synthetic-sandbox',simulation:true,observed_at:new Date().toISOString(),phases:phasesObserved,sample_count:samples.length,accepted:accepted.length,dropped,durable_ack_p95_ms:p95,ack_target_pass:p95!==null&&p95<1000&&accepted.length===samples.length&&dropped===0,verification_target_pass:null,non_provider_api_target_pass:null,worker_latency_measured:false,real_device_verified:false,samples};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});if(!report.ack_target_pass)process.exitCode=1;
}
