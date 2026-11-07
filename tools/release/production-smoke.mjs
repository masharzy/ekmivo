// Read-only post-release gate. Credentials come from environment and are never
// retained. A signed transaction/device test remains a separate release gate.
import {writeFile} from 'node:fs/promises';
const api=new URL(process.env.BRIOFOLD_SMOKE_API_URL||''),web=new URL(process.env.BRIOFOLD_SMOKE_WEB_URL||'');
const output=process.argv[2],workspace=process.env.BRIOFOLD_SMOKE_WORKSPACE_ID,key=process.env.BRIOFOLD_SMOKE_READ_KEY;
for(const u of [api,web])if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('HTTPS smoke origins required');
if(!output||!workspace||!key)throw Error('Dedicated test workspace and scoped read key required');
const samples=[];
async function probe(origin,path,expected,authenticated=false){const began=performance.now();try{const r=await fetch(new URL(path,origin),{headers:authenticated?{Authorization:`Bearer ${key}`}:{},redirect:'manual',signal:AbortSignal.timeout(10000)});samples.push({path:path.replace(workspace,'{test-workspace}'),status:r.status,expected,pass:expected.includes(r.status),duration_ms:Math.round(performance.now()-began)})}catch{samples.push({path:path.replace(workspace,'{test-workspace}'),status:null,expected,pass:false,duration_ms:Math.round(performance.now()-began)})}}
await probe(api,'/healthz',[200]);await probe(api,'/readyz',[200]);
await probe(api,`/v1/workspaces/${workspace}/payment-intents?environment=live`,[200],true);
await probe(api,`/v1/workspaces/${workspace}/payment-intents?environment=live`,[401]);
// A live key must not cross into sandbox.
await probe(api,`/v1/workspaces/${workspace}/payment-intents?environment=sandbox`,[403],true);
for(const language of ['en','bn'])for(const route of ['/','/login','/register','/docs/payments'])await probe(web,`/${language}${route==='/'?'':route}`,[200]);
await writeFile(output,JSON.stringify({observed_at:new Date().toISOString(),mode:'read-only-production-smoke',source_commit:process.env.BRIOFOLD_SMOKE_COMMIT||null,financial_verification:false,samples},null,2)+'\n',{flag:'wx'});
if(samples.some(s=>!s.pass))process.exitCode=1;
