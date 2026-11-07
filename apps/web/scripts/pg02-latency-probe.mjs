// Explicitly authorized disposable control-plane fixture. No merchant money.
import postgres from "postgres";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
if(process.env.PG23_ALLOW_PRODUCTION_FIXTURES!=="true")throw Error("Explicit fixture guard required");
const sql=postgres(process.env.DATABASE_URL,{ssl:"require",max:1,prepare:false});
const uid=randomUUID(),wid=randomUUID(),token=randomBytes(32).toString("base64url");
const web="https://briofold.tech",results=[];
try{
 await sql.begin(async tx=>{
  await tx`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${uid},${uid+"@example.invalid"},'Latency fixture','not-a-login-password',now())`;
  await tx`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${wid},'Latency fixture','both',${uid})`;
  await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${wid},${uid},'owner')`;
  await tx`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES(${uid},${createHash("sha256").update(token).digest("hex")},now()+interval '10 minutes')`;
 });
 for(let round=0;round<3;round++)for(const route of ["overview","developers"]){
  const start=performance.now();
  const response=await fetch(`${web}/en/w/${wid}/payments/${route}?env=sandbox`,{headers:{Cookie:"briofold-session="+token},signal:AbortSignal.timeout(60000)});
  const headersMs=Math.round(performance.now()-start);await response.text();
  const result={round,route,status:response.status,headers_ms:headersMs,complete_ms:Math.round(performance.now()-start),vercel_region_chain:response.headers.get("x-vercel-id")?.split("::").slice(0,-1).join("::")};
  results.push(result);console.log(JSON.stringify(result));
 }
}finally{
 await sql.begin(async tx=>{await tx`DELETE FROM workspaces WHERE id=${wid}`;await tx`DELETE FROM app_users WHERE id=${uid}`;});await sql.end();
 await writeFile("../../docs/evidence/PG02/"+(process.env.PG02_LATENCY_REPORT||"latency-before.json"),JSON.stringify({tested_at:new Date().toISOString(),method:"Dedicated verified identity; real HTTPS SSR requests from owner laptop; complete_ms includes streaming/render/network, headers_ms may precede actual page because of loading boundary. No cached auth or financial operation.",results,fixture_cleanup:true},null,2)+"\n");
}
