// Historical pre-completion audit: its three NOT_IMPLEMENTED outcomes describe
// the earlier build, not current acceptance. Use pg01-completion-http.mjs for
// implemented write/proxy/recovery/reset lifecycle verification.
import postgres from 'postgres';
import { createRequire } from 'node:module';
const { encodeReply } = createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
import { randomBytes, randomUUID, createHash, createCipheriv, scryptSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { encodeBase32, totpAt } from '../src/lib/mfa-core.js';

if(process.env.PG01_ALLOW_PRODUCTION_FIXTURES!=='true') { console.error('Explicit PG01_ALLOW_PRODUCTION_FIXTURES=true required; no operation performed.'); process.exit(1); }
const api = 'https://api.briofold.tech';
const web = 'https://briofold.tech';
const sql = postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false,connect_timeout:15});
const users = Array.from({length:4},()=>randomUUID());
const workspaces = Array.from({length:3},()=>randomUUID());
const tokens = Array.from({length:4},()=>randomBytes(32).toString('base64url'));
const hash = token=>createHash('sha256').update(token).digest('hex');
const run = randomUUID();
const results=[];
const secret=encodeBase32(randomBytes(20));
let setup=false;
function seal(value){
 const key=Buffer.from(process.env.MFA_ENCRYPTION_KEY||'','base64url');
 if(key.length!==32)return null;
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join(':');
}
async function request(path,index,expected,name,role,dbAssertion='Read-only endpoint; no mutation contract.'){
 const response=await fetch(api+path,{headers:index===null?{}:{Cookie:'briofold-session='+tokens[index]},signal:AbortSignal.timeout(90000),redirect:'manual'});
 let body;try{body=await response.json();}catch{body={};}
 const safe=body.code?{code:body.code,message:body.message}:Object.fromEntries(Object.entries(body).filter(([key])=>['role','capability','environment','status','reason','email_verified'].includes(key)));
 const result={name,endpoint:'GET '+path.replaceAll(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g,'<test-workspace>'),role,expected_status:expected,actual_status:response.status,safe_response:safe,pass:response.status===expected,db_assertion:dbAssertion};
 results.push(result); console.log(name+': '+response.status+' '+(result.pass?'PASS':'FAIL'));
 return response;
}
const access=(workspace=workspaces[0],cap='payments:read',env='sandbox')=>'/v1/workspaces/'+workspace+'/access?environment='+env+'&capability='+encodeURIComponent(cap);
let confirmActionId=null,issuedCode=null;
const decode=value=>value.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
async function formRequest(index,code,name,expectedMessage){
 if(!confirmActionId){
 const page=await fetch(web+'/en/admin/mfa',{headers:{Cookie:'briofold-session='+tokens[index]},redirect:'manual',signal:AbortSignal.timeout(90000)});
 const html=await page.text();
 const form=([...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1])).find(value=>/name="code"/.test(value));
 if(!form){results.push({name,endpoint:'GET /en/admin/mfa',actual_status:page.status,pass:false,safe_response:'MFA form unavailable; no secret response captured.'});return false;}
 const data=new FormData();
 for(const match of form.matchAll(/<input\b[^>]*>/g)){
  const tag=match[0],inputName=tag.match(/name="([^"]*)"/),value=tag.match(/value="([^"]*)"/);
  if(inputName&&inputName[1].startsWith('$ACTION'))data.append(decode(inputName[1]),decode(value?.[1]||''));
 }
 data.append('code',code);
 const metadata=[...data.entries()].find(([key])=>/\$ACTION_\d+:0/.test(key));
 const actionId=metadata?JSON.parse(metadata[1]).id:null;
 if(!actionId)throw Error('ACTION_REFERENCE_MISSING');
 confirmActionId=actionId;
 }
 const fields=new FormData();
 if(expectedMessage==='redirect')issuedCode=totpAt(secret,Math.floor(Date.now()/30000));
 fields.append('code',expectedMessage==='redirect'?issuedCode:(name.includes('replay')?issuedCode:code));
 const payload=await encodeReply(['en',{status:'idle',message:''},fields]);
 const response=await fetch(web+'/en/admin/mfa',{method:'POST',headers:{Cookie:'briofold-session='+tokens[index],Origin:web,'Next-Action':confirmActionId},body:payload,redirect:'manual',signal:AbortSignal.timeout(90000)});
 const text=await response.text();
 const location=response.headers.get('x-action-redirect')||response.headers.get('location');
 const matched=expectedMessage==='redirect'?[200,303].includes(response.status)&&(location?.includes('/en/admin')||(text.includes('NEXT_REDIRECT')&&text.includes('/en/admin'))):text.includes(expectedMessage);
 results.push({name,endpoint:'POST /en/admin/mfa (deployed server action)',role:'dedicated test super_admin',expected:expectedMessage==='redirect'?'Server Action admin redirect (200 RSC or 303)':'Safe business error: '+expectedMessage,actual_status:response.status,safe_response:expectedMessage==='redirect'?(matched?'Admin redirect':(['Invalid, expired or already-used code.','Verification failed. Try again.','Too many attempts. Retry after 15 minutes.'].find(message=>text.includes(message))||'No expected redirect')):(matched?expectedMessage:'Expected business error absent'),pass:!!matched});
 console.log(name+': '+response.status+' '+(matched?'PASS':'FAIL'));
 return !!matched;
}
try{
 await sql.begin(async tx=>{
  for(let i=0;i<users.length;i++){
   const salt=randomBytes(24),password=randomBytes(32).toString('base64url');
   const pw='scrypt-v1:'+salt.toString('hex')+':'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
   await tx`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${users[i]},${'pg01-'+run+'-'+i+'@example.invalid'},'PG01 security verification fixture',${pw},now())`;
   await tx`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES(${users[i]},${hash(tokens[i])},now()+interval '30 minutes')`;
  }
  for(let i=0;i<3;i++){
   await tx`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${workspaces[i]},'PG01 test fixture','both',${users[i]})`;
   await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspaces[i]},${users[i]},'owner')`;
  }
  await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspaces[0]},${users[3]},'viewer')`;
  await tx`INSERT INTO platform_administrators(user_id,role) VALUES(${users[0]},'super_admin')`;
  await tx`INSERT INTO platform_admin_mfa(user_id,secret_ciphertext,confirmed_at) VALUES(${users[0]},${seal(secret)||'unconfigured-test-fixture'},NULL)`;
 });setup=true;
 await request('/healthz',null,200,'Deployed health', 'anonymous');
 await request('/v1/session',null,401,'Missing session','anonymous');
 await request('/v1/session',0,200,'Dedicated valid session','owner');
 for(let i=0;i<3;i++){
  await request(access(workspaces[i]),i,200,'Tenant '+(i+1)+' own workspace','owner');
  await request(access(workspaces[(i+1)%3]),i,403,'Tenant '+(i+1)+' foreign workspace','owner of different workspace');
 }
 await request(access(workspaces[0],'payments:read','live'),0,200,'Explicit live context','owner');
 await request(access(workspaces[0],'payments:read','invalid'),0,403,'Invalid environment','owner');
 await request(access(),3,200,'Viewer read positive control','viewer');
 const before=await sql`SELECT checkout_expiry_minutes,updated_at FROM workspace_environment_settings WHERE workspace_id=${workspaces[0]} ORDER BY environment`;
 for(const capability of ['payments:manage','workspace:settings','members:manage'])await request(access(workspaces[0],capability),3,403,'Viewer denied '+capability,'viewer');
 const after=await sql`SELECT checkout_expiry_minutes,updated_at FROM workspace_environment_settings WHERE workspace_id=${workspaces[0]} ORDER BY environment`;
 results.push({name:'Viewer denials preserve database settings',pass:JSON.stringify(before)===JSON.stringify(after),db_assertion:'Two environment settings unchanged.'});
 const unsupported=await fetch(api+'/v1/workspaces/'+workspaces[0]+'/access',{method:'POST',headers:{Cookie:'briofold-session='+tokens[3]},signal:AbortSignal.timeout(90000)});
 results.push({name:'Actual viewer write endpoint coverage',endpoint:'POST /v1/workspaces/<test-workspace>/access',actual_status:unsupported.status,pass:false,status:'NOT_IMPLEMENTED',safe_response:'No deployed workspace write endpoint; 405 does not prove write authorization.'});
 await sql`DELETE FROM workspace_members WHERE workspace_id=${workspaces[0]} AND user_id=${users[3]}`;
 await request(access(),3,403,'Removed member same-session denial','former viewer','Membership row absent; existing session still active.');
 await sql`UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=${hash(tokens[1])}`;
 await request('/v1/session',1,401,'Expired session','test owner');
 await sql`UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=${hash(tokens[2])}`;
 await request('/v1/session',2,401,'Revoked session','test owner');
 await request('/v1/platform/access',0,403,'MFA bypass blocked','test super_admin, no completed MFA');
 if(seal(secret)){
  const step=Math.floor(Date.now()/30000),code=totpAt(secret,step);
  const succeeded=await formRequest(0,code,'Real deployed TOTP challenge','redirect');
  const session=await sql`SELECT mfa_verified_at FROM auth_sessions WHERE token_hash=${hash(tokens[0])}`;
  results.push({name:'HTTP MFA challenge writes freshness',pass:succeeded&&!!session[0]?.mfa_verified_at,db_assertion:session[0]?.mfa_verified_at?'Dedicated session freshness populated':'Dedicated session freshness absent'});
  if(succeeded){
   await request('/v1/platform/access',0,200,'Verified MFA admin access','test super_admin');
   tokens.push(randomBytes(32).toString('base64url'));
   await sql`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES(${users[0]},${hash(tokens[4])},now()+interval '30 minutes')`;
   await formRequest(4,code,'TOTP replay denied in fresh session','Invalid, expired or already-used code.');
   for(let i=0;i<4;i++)await formRequest(4,totpAt(secret,step-10),'Invalid TOTP attempt '+(i+1),'Invalid, expired or already-used code.');
   await formRequest(4,totpAt(secret,step-10),'MFA persistent rate limit','Too many attempts. Retry after 15 minutes.');
   const attempts=await sql`SELECT attempts,blocked_until>now() AS blocked FROM platform_admin_mfa_attempts WHERE user_id=${users[0]}`;
   results.push({name:'MFA rate limit database assertion',pass:!!attempts[0]?.blocked,db_assertion:'Blocked-until future: '+!!attempts[0]?.blocked});
  }
 }else results.push({name:'Deployed MFA challenge/replay/rate-limit',pass:false,status:'BLOCKED',safe_response:'MFA encryption key unavailable in approved environment.'});
 await sql`UPDATE platform_admin_mfa SET confirmed_at=now() WHERE user_id=${users[0]}`;
 await sql`UPDATE auth_sessions SET mfa_verified_at=now() WHERE token_hash=${hash(tokens[0])}`;
 await request('/v1/platform/access',0,200,'Controlled recent MFA positive control','test super_admin','DB-seeded gate state; not enrollment evidence.');
 await sql`UPDATE platform_admin_mfa SET confirmed_at=NULL WHERE user_id=${users[0]}`;
 await request('/v1/platform/access',0,403,'Revoked enrollment blocks old session','test super_admin','Revocation simulated by dedicated-row update; no revoke UI exists.');
 await sql`DELETE FROM platform_admin_mfa WHERE user_id=${users[0]}`;
 await request('/v1/platform/access',0,403,'Missing enrollment fails safely','test super_admin','Dedicated MFA row removed; expected MFA_REQUIRED rather than dependency failure.');
 results.push({name:'Recovery-code reuse and recovery rate limiting',pass:false,status:'NOT_IMPLEMENTED',safe_response:'No recovery-code schema, issuance or verification endpoint exists at tested commit.'});
 results.push({name:'Approved Next-to-Go session proxy',pass:false,status:'NOT_IMPLEMENTED',safe_response:'No deployed session proxy exists; Go checks use dedicated fixture cookies directly.'});
}catch(error){console.error('Verification interrupted; details suppressed.');results.push({name:'Harness execution',pass:false,safe_response:'Unexpected failure; no credential/raw response logged.',error_type:error?.name||'unknown'});}
finally{
 try{
  if(setup)await sql.begin(async tx=>{
   await tx`DELETE FROM platform_admin_audit WHERE actor_id IN ${sql(users)} OR subject_id IN ${sql(users)}`;
   await tx`DELETE FROM workspaces WHERE id IN ${sql(workspaces)}`;
   await tx`DELETE FROM platform_administrators WHERE user_id IN ${sql(users)}`;
   await tx`DELETE FROM app_users WHERE id IN ${sql(users)}`;
  });
  const left=await sql`SELECT count(*)::int AS count FROM app_users WHERE id IN ${sql(users)}`;
  results.push({name:'Dedicated fixture cleanup',pass:left[0].count===0,db_assertion:'Remaining test users: '+left[0].count});
 }catch{results.push({name:'Dedicated fixture cleanup',pass:false,safe_response:'Cleanup requires operator inspection; fixture run ID '+run});}
 await sql.end({timeout:5});
 await writeFile('../../docs/evidence/PG01/production-http-results.json',JSON.stringify({tested_at:new Date().toISOString(),commit:'912f297',api,web,fixture_method:'Dedicated short-lived control-plane users, workspaces and opaque sessions seeded in database. No existing users or financial records modified. All secrets memory-only.',results},null,2)+'\n');
 console.log('Evidence saved; PG01 '+(results.every(r=>r.pass)?'checks passed':'remains OPEN'));
 process.exitCode=results.every(r=>r.pass)?0:1;
}
