import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {webcrypto} from "node:crypto";
import ts from "typescript";
const code=ts.transpileModule(readFileSync(new URL("../src/app/api/go/[...path]/route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const workspace="10000000-0000-4000-8000-000000000001",topup="10000000-0000-4000-8000-000000000002";
function fixture({signedIn=true,selected=workspace,authUnavailable=false}={}){
 const exports={},calls=[];
 runInNewContext(code,{exports,URL,Request,Response,Headers,AbortSignal,crypto:webcrypto,console,process:{env:{GO_WEB_ORIGIN:"https://web.example"}},
  fetch:async(url,options)=>{calls.push({url:String(url),...options});return Response.json({payment_status:"pending"},{status:201});},
  require:name=>name==="next/headers"?{cookies:async()=>({get:()=>signedIn?{value:"fixture-session"}:undefined})}:
   name.endsWith("bounded-body")?{boundedBody:async(request,limit)=>{const body=await request.text();return Buffer.byteLength(body)>limit?null:body;}}:
   name.endsWith("/auth")?{currentUser:async()=>{if(authUnavailable)throw Error("unavailable");return signedIn?{id:workspace}:null;},preferredWorkspaceFor:async()=>({id:selected})}:
   name.endsWith("go-origin")?{goOrigin:()=>"https://api.example"}:undefined,
 });
 return {calls,call:async(action="purchase",method="POST",origin="https://web.example",body="{}",namespace="ai-credits",query="")=>{
  const path=`workspaces/${workspace}/${namespace}${action?"/"+action:""}`;
  const request=new Request("https://web.example/api/go/"+path+query,{method,headers:{host:"web.example",origin,"Idempotency-Key":"fixture-key-00000001"},...(method==="GET"?{}:{body})});
  return exports[method](request,{params:Promise.resolve({path:path.split("/")})});
 }};
}
for(const action of ["purchase",`${topup}/reconcile`])test(`POST ${action} forwards the authenticated top-up request`,async()=>{
 const f=fixture();const response=await f.call(action,"POST","https://web.example",'{"amount_minor":1000}');
 assert.equal(response.status,201);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,`https://api.example/v1/workspaces/${workspace}/ai-credits/${action}`);
 assert.equal(f.calls[0].headers["Idempotency-Key"],"fixture-key-00000001");
 assert.equal(f.calls[0].headers.Cookie,"ekmivo-session=fixture-session");
 assert.equal(f.calls[0].body,'{"amount_minor":1000}');
});
test("metered AI test has its own bounded authenticated POST route",async()=>{
 const f=fixture();assert.equal((await f.call("test","POST","https://web.example",JSON.stringify({prompt:"x".repeat(5000)}),"ai")).status,201);
 assert.equal(f.calls[0].url,`https://api.example/v1/workspaces/${workspace}/ai/test`);
 const large=fixture();assert.equal((await large.call("test","POST","https://web.example","x".repeat(16385),"ai")).status,413);assert.equal(large.calls.length,0);
 const read=fixture();assert.equal((await read.call("test","GET","https://web.example","","ai")).status,405);assert.equal(read.calls.length,0);
 const unknown=fixture();assert.equal((await unknown.call("complete","POST","https://web.example","{}","ai")).status,404);assert.equal(unknown.calls.length,0);
});
test("top-up mutations reject bad origin, missing session and oversize body",async()=>{
 const origin=fixture();assert.equal((await origin.call("purchase","POST","https://other.example")).status,403);assert.equal(origin.calls.length,0);
 const unsigned=fixture({signedIn:false});assert.equal((await unsigned.call()).status,401);assert.equal(unsigned.calls.length,0);
 const large=fixture();assert.equal((await large.call("purchase","POST","https://web.example","x".repeat(4097))).status,413);assert.equal(large.calls.length,0);
});
test("proxy exposes only the two top-up POST commands, never a credit/grant API",async()=>{
 for(const action of ["grant","credit",`${topup}/credit`,"anything/reconcile"]){const f=fixture();assert.equal((await f.call(action)).status,404);assert.equal(f.calls.length,0);}
 for(const method of ["GET","PATCH"]){const f=fixture();assert.equal((await f.call("purchase",method)).status,405);assert.equal(f.calls.length,0);}
});

test("paid Studio proxy rejects stale business and unavailable authority before provider forwarding",async()=>{
 const stale=fixture({selected:topup});assert.equal((await stale.call("studio-test","POST","https://web.example","{}","ai")).status,409);assert.equal(stale.calls.length,0);
 const unavailable=fixture({authUnavailable:true});assert.equal((await unavailable.call("studio-test","POST","https://web.example","{}","ai")).status,503);assert.equal(unavailable.calls.length,0);
 const current=fixture();assert.equal((await current.call("studio-test","POST","https://web.example","{}","ai")).status,201);assert.equal(current.calls.length,1);
});

// Proxy boundary checks, not a substitute for SQL or browser authorization.
test("CRM priority and assignee filters reach Go together with tenant-selected scope",async()=>{
 const f=fixture();const response=await f.call("","GET","https://web.example","","crm",`?source=api&priority=hot&assignee=${topup}&filter=qualified`);
 assert.equal(response.status,201);assert.equal(f.calls.length,1);
 const target=new URL(f.calls[0].url);
 assert.equal(target.pathname,`/v1/workspaces/${workspace}/crm`);
 assert.equal(target.searchParams.get('priority'),'hot');assert.equal(target.searchParams.get('assignee'),topup);
 assert.equal(target.searchParams.get('source'),'api');assert.equal(target.searchParams.get('filter'),'qualified');
 for(const query of [`?priority=hot&priority=cold`,`?assignee=${workspace}&assignee=${topup}`]){
  const duplicate=fixture();assert.equal((await duplicate.call("","GET","https://web.example","","crm",query)).status,400);assert.equal(duplicate.calls.length,0);
 }
 const stale=fixture({selected:topup});assert.equal((await stale.call("","GET","https://web.example","","crm",'?priority=hot')).status,409);assert.equal(stale.calls.length,0);
});
