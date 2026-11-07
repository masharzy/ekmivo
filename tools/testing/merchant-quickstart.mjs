// Real HTTP quickstart for dedicated Sandbox accounts; never marks a payment paid.
import {randomUUID,createHash} from 'node:crypto';import {writeFile} from 'node:fs/promises';
const [output,mode='plan']=process.argv.slice(2),rawOrigin=process.env.BRIOFOLD_QUICKSTART_SANDBOX_ORIGIN,workspace=process.env.BRIOFOLD_QUICKSTART_WORKSPACE_ID,key=process.env.BRIOFOLD_QUICKSTART_READ_WRITE_KEY;
if(!output||!['plan','run'].includes(mode)||!rawOrigin||!workspace||!key)throw Error('Dedicated Sandbox origin/workspace/server read-write key and output required');
const origin=new URL(rawOrigin),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
if(!uuid.test(workspace)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(origin.hostname)&&origin.protocol==='http:'))throw Error('Explicit root Sandbox API origin required');
const cases=['Live realm denied','wrong tenant denied','server intent created','same-key same-body returns same intent','same-key different-body rejected','public checkout matches server total','browser cannot supply verified status'];
if(mode==='plan'){await writeFile(output,JSON.stringify({mode,executed:false,cases,receipt_confirmation_verified:false,merchant_webhook_verified:false},null,2)+'\n',{flag:'wx',mode:0o600})}
else{
 if(process.env.BRIOFOLD_QUICKSTART_RUN_ENABLED!=='true')throw Error('Explicit dedicated Sandbox test execution authorization required');
 const results=[],reference='quickstart-'+randomUUID(),requestKey=createHash('sha256').update(reference).digest('hex'),body={merchant_reference:reference,amount_minor:100,currency:'BDT',expires_in_minutes:15};
 async function request(path,{method='GET',payload,idempotency,authenticated=true}={}){const h={'Content-Type':'application/json'};if(authenticated)h.Authorization='Bearer '+key;if(idempotency)h['Idempotency-Key']=idempotency;const r=await fetch(new URL(path,origin),{method,headers:h,body:payload===undefined?undefined:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});let data;try{data=await r.json()}catch{data=null}return {status:r.status,data}}
 function check(name,actual,pass){results.push({case:name,http_status:actual.status,pass});if(!pass)throw Error('Quickstart case failed; inspect dedicated account without recording credentials')}
 try{
  let r=await request(`/v1/workspaces/${workspace}/operations/payments?environment=live`);check(cases[0],r,[403,404].includes(r.status));
  r=await request(`/v1/workspaces/${randomUUID()}/operations/payments?environment=sandbox`);check(cases[1],r,[403,404].includes(r.status));
  const path=`/v1/workspaces/${workspace}/payment-intents?environment=sandbox`;
  r=await request(path,{method:'POST',payload:body,idempotency:requestKey});check(cases[2],r,[200,201].includes(r.status)&&uuid.test(r.data?.id||'')&&r.data?.amount_minor===100&&r.data?.environment==='sandbox'&&/^[A-Za-z0-9_-]{43}$/.test(r.data?.checkout_token||''));const created=r.data;
  r=await request(path,{method:'POST',payload:body,idempotency:requestKey});check(cases[3],r,[200,201].includes(r.status)&&r.data?.id===created.id&&r.data?.checkout_token===created.checkout_token);
  r=await request(path,{method:'POST',payload:{...body,amount_minor:101},idempotency:requestKey});check(cases[4],r,r.status===409);
  r=await request(`/v1/public/checkout/${created.checkout_token}`,{authenticated:false});check(cases[5],r,r.status===200&&r.data?.amount_minor===100&&r.data?.environment==='sandbox'&&r.data?.state!=='completed');
  r=await request(path,{method:'POST',payload:{...body,verification_status:'verified'},idempotency:createHash('sha256').update(reference+'-invalid').digest('hex')});check(cases[6],r,[400,422].includes(r.status));
 }finally{await writeFile(output,JSON.stringify({schema_version:1,mode,executed:true,observed_at:new Date().toISOString(),environment:'sandbox',cases:results,complete:results.length===cases.length&&results.every(r=>r.pass),receipt_confirmation_verified:false,merchant_webhook_verified:false,limitations:'Actual HTTP issuance/idempotency/authorization only. No provider/device/fulfilment acceptance.'},null,2)+'\n',{flag:'wx',mode:0o600})}
}
