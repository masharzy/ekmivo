// Explicitly authorized PG01 control-plane fixtures only; no financial data.
import postgres from 'postgres';
import {randomBytes,randomUUID,createHash,scryptSync,createCipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {encodeBase32,totpAt,matchTotp} from '../src/lib/mfa-core.js';
const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
if(process.env.PG01_ALLOW_PRODUCTION_FIXTURES!=='true')throw Error('Explicit fixture authorization required');
const web=process.env.PG01_WEB_BASE||'https://briofold.tech';
if(!['https://briofold.tech','http://127.0.0.1:3001'].includes(web))throw Error('Unapproved web target');
const api='https://api.briofold.tech';
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false});
const user=randomUUID(),viewer=randomUUID(),foreign=randomUUID();
const workspace=randomUUID(),otherWorkspace=randomUUID();
const password=randomBytes(30).toString('base64url'),tokens=[];
const hash=value=>createHash('sha256').update(value).digest('hex');
const results=[],references=new Map(),roles=new Map();
let seeded=false;
let secret=encodeBase32(randomBytes(20));
function record(name,pass,detail){results.push({name,pass,...detail});console.log(name+': '+(pass?'PASS':'FAIL'));}
function encrypted(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.MFA_ENCRYPTION_KEY,'base64url'),iv);const bytes=Buffer.concat([cipher.update(value),cipher.final()]);return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join(':');}
async function session(userId=user){const token=randomBytes(32).toString('base64url');tokens.push(token);roles.set(token,userId===viewer?'workspace viewer':'dedicated Super Admin / workspace owner');await sql`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES(${userId},${hash(token)},now()+interval '1 hour')`;return token;}
const headers=token=>token?{Cookie:'briofold-session='+token}:{};
async function http(base,path,token,expected,name,method='GET',body,extra={}){
 const response=await fetch(base+path,{method,headers:{...headers(token),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(30000)});
 let payload;try{payload=await response.json();}catch{payload={};}
 const safe=Object.fromEntries(Object.entries(payload).filter(([key])=>['code','message','checkout_expiry_minutes','role','environment','capability'].includes(key)));
 const expectedCode=name==='Proxy viewer write denied'?'ACCESS_DENIED':null;
 record(name,response.status===expected&&(!expectedCode||payload.code===expectedCode),{role:token?roles.get(token):'anonymous',endpoint:method+' '+path.replaceAll(workspace,'<test-workspace>').replaceAll(otherWorkspace,'<foreign-workspace>'),expected_status:expected,actual_status:response.status,safe_response:safe});
 return payload;
}
function decode(value){return value.replaceAll('&quot;','"').replaceAll('&#x27;',"'").replaceAll('&amp;','&');}
async function actionRef(path,token,index){
 const key=path+':'+index;if(references.has(key))return references.get(key);
 const page=await fetch(web+path,{headers:headers(token),redirect:'manual',signal:AbortSignal.timeout(30000)});
 const html=await page.text();
 if(page.status!==200)throw Error('ACTION_PAGE_UNAVAILABLE');
 const forms=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(match=>match[1]);
 const form=forms[index];if(!form)throw Error('ACTION_FORM_UNAVAILABLE');
 let id;
 for(const match of form.matchAll(/<input\b[^>]*>/g)){
  const name=match[0].match(/name="([^"]*)"/),value=match[0].match(/value="([^"]*)"/);
  if(name&&/\$ACTION_\d+:0/.test(name[1]))id=JSON.parse(decode(value[1])).id;
 }
 if(!id)throw Error('ACTION_ID_MISSING');references.set(key,id);return id;
}
async function action(path,token,index,fields,name,expect){
 const id=await actionRef(path,token,index),data=new FormData();
 for(const [key,value] of Object.entries(fields))data.append(key,typeof value==='function'?value():value);
 const body=await encodeReply(['en',{status:'idle',message:''},data]);
 const response=await fetch(web+path,{method:'POST',headers:{...headers(token),Origin:web,'Next-Action':id},body,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const text=await response.text(),redirect=response.headers.get('x-action-redirect')||response.headers.get('location');
 const codesMatch=text.match(/"codes":(\[[^\]]+\])/),seedMatch=text.match(/"setupKey":"([A-Z2-7]+)"/);
 const codes=codesMatch?JSON.parse(codesMatch[1]):undefined;
 const pass=expect==='redirect'?!!redirect||text.includes('NEXT_REDIRECT'):expect==='codes'?codes?.length===8:expect==='seed'?!!seedMatch:text.includes(expect);
 record(name,!!pass,{endpoint:'POST '+path+' (Server Action)',expected:expect==='codes'?'Eight once-visible recovery codes':expect==='seed'?'Once-visible authenticator setup':expect==='redirect'?'Authenticated redirect':expect,actual_status:response.status,safe_response:pass?(expect==='codes'?'Eight codes returned; values suppressed':expect==='seed'?'Setup returned; value suppressed':expect==='redirect'?'Expected redirect':expect):'Expected outcome absent'});
 return {codes,seed:seedMatch?.[1],pass};
}
try{
 await sql.begin(async tx=>{
  for(const [id,role] of [[user,'owner'],[viewer,'viewer'],[foreign,'owner']]){
   const salt=randomBytes(24),pw='scrypt-v1:'+salt.toString('hex')+':'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
   await tx`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${id},${id+'@example.invalid'},'PG01 lifecycle fixture',${pw},now())`;
   if(role==='owner'){const idWorkspace=id===user?workspace:otherWorkspace;await tx`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${idWorkspace},'PG01 lifecycle test','both',${id})`;await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${idWorkspace},${id},${role})`;}
   else await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${id},${role})`;
  }
  await tx`INSERT INTO platform_administrators(user_id,role) VALUES(${user},'super_admin')`;
  await tx`INSERT INTO platform_admin_mfa(user_id,secret_ciphertext) VALUES(${user},${encrypted(secret)})`;
 });seeded=true;
 let ownerToken=await session(),viewerToken=await session(viewer);
 const settings='/v1/workspaces/'+workspace+'/settings?environment=sandbox';
 const body={checkout_expiry_minutes:20};
 await http(api,'/v1/session',null,401,'Anonymous session denied');
 const expired=await session();
 await sql`UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=${hash(expired)}`;
 await http(api,'/v1/session',expired,401,'Expired session denied');
 const revoked=await session();
 await sql`UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=${hash(revoked)}`;
 await http(api,'/v1/session',revoked,401,'Revoked session denied');
 await http(api,'/v1/platform/access',ownerToken,403,'MFA bypass denied');
 await sql`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${viewer}`;
 await http(api,settings,viewerToken,403,'Removed membership actual write denied','PATCH',body);
 await sql`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${viewer},'viewer')`;
 await http(api,settings,ownerToken,200,'Owner actual settings write','PATCH',body);
 await http(api,settings,viewerToken,403,'Viewer actual settings write denied','PATCH',{checkout_expiry_minutes:25});
 let stored=await sql`SELECT environment,checkout_expiry_minutes FROM workspace_environment_settings WHERE workspace_id=${workspace} ORDER BY environment`;
 record('Actual write isolation',stored.find(row=>row.environment==='sandbox')?.checkout_expiry_minutes===20&&stored.find(row=>row.environment==='live')?.checkout_expiry_minutes===15,{db_assertion:'Sandbox changed to 20; live remains 15; denied viewer did not write.'});
 await http(api,'/v1/workspaces/'+otherWorkspace+'/settings?environment=sandbox',ownerToken,403,'Wrong-tenant actual write denied','PATCH',body);
 await http(web,'/api/go/session',ownerToken,200,'Authenticated Next-to-Go proxy');
 await http(web,'/api/go/session',null,401,'Proxy missing session denied');
 await http(web,'/api/go/workspaces/'+workspace+'/settings?environment=sandbox',ownerToken,200,'Real proxy settings write','PATCH',{checkout_expiry_minutes:22},{Origin:web});
 await http(web,'/api/go/workspaces/'+workspace+'/settings?environment=sandbox',viewerToken,403,'Proxy viewer write denied','PATCH',body,{Origin:web,'X-User-Id':user,'X-Role':'owner'});
 await http(web,'/api/go/workspaces/'+workspace+'/settings?environment=sandbox',ownerToken,403,'Cross-origin proxy write denied','PATCH',body,{Origin:'https://attacker.invalid'});
 await http(web,'/api/go/https:attacker.invalid',ownerToken,404,'Proxy destination injection denied');
 await action('/en/admin/mfa',ownerToken,1,{code:()=>totpAt(secret,Math.floor(Date.now()/30000))},'Real authenticator challenge','redirect');
 const oldSession=await sql`SELECT mfa_verified_at FROM auth_sessions WHERE token_hash=${hash(ownerToken)}`;
 const generationStamp=oldSession[0].mfa_verified_at;
 await http(api,'/v1/platform/access',ownerToken,200,'Verified MFA Go access');
 for(const locale of ['en','bn'])for(const theme of ['light','dark']){
  const page=await fetch(web+'/'+locale+'/admin/security',{headers:{Cookie:'briofold-session='+ownerToken+'; briofold-theme='+theme},signal:AbortSignal.timeout(30000)});
  const html=await page.text();
  record('Security SSR '+locale+' '+theme,page.status===200&&html.includes('lang="'+locale+'"')&&html.includes('data-theme="'+theme+'"')&&html.includes(locale==='bn'?'প্রতিটি কোড একবার চলবে':'Each code works once'),{endpoint:'GET /'+locale+'/admin/security',actual_status:page.status,safe_response:'Locale/theme markup and localized security copy checked; no visual claim.'});
 }
 const first=await action('/en/admin/security',ownerToken,0,{password},'Generate once-visible recovery codes','codes');
 if(!first.codes)throw Error('CODES_UNAVAILABLE');
 const hashes=await sql`SELECT code_hash FROM platform_admin_recovery_codes WHERE user_id=${user}`;
 record('Only recovery hashes stored',hashes.length===8&&first.codes.every(code=>hashes.some(row=>row.code_hash===hash(user+':'+code))),{db_assertion:'Eight user-bound hashes; no raw codes stored.'});
 const second=await action('/en/admin/security',ownerToken,0,{password},'Recovery code rotation','codes');
 if(!second.codes)throw Error('ROTATED_CODES_UNAVAILABLE');
 let fresh=await session();
 await action('/en/admin/mfa',fresh,2,{password,recoveryCode:first.codes[0]},'Old rotated code denied','Password or recovery code is invalid or already used.');
 await action('/en/admin/mfa',fresh,2,{password:'wrong-password',recoveryCode:second.codes[0]},'Recovery requires correct password','Password or recovery code is invalid or already used.');
 await action('/en/admin/mfa',fresh,2,{password,recoveryCode:second.codes[0]},'Real recovery factor verification','redirect');
 await http(api,'/v1/platform/access',fresh,200,'Recovered session Go access');
 await http(api,'/v1/session',ownerToken,401,'Recovery revokes old sessions');
 await http(web,'/api/go/session',ownerToken,401,'Proxy rejects revoked session');
 ownerToken=fresh;
 fresh=await session();
 await action('/en/admin/mfa',fresh,2,{password,recoveryCode:second.codes[0]},'Consumed recovery code reuse denied','Password or recovery code is invalid or already used.');
 const consumed=await sql`SELECT consumed_at IS NOT NULL AS consumed FROM platform_admin_recovery_codes WHERE user_id=${user} AND code_hash=${hash(user+':'+second.codes[0])}`;
 record('Recovery consume database assertion',consumed[0]?.consumed===true,{db_assertion:'Used code consumed atomically.'});
 await action('/en/admin/security',ownerToken,1,{password},'Real authenticator revoke/reset','redirect');
 await http(api,'/v1/platform/access',ownerToken,403,'Reset blocks current admin privilege');
 await http(api,'/v1/session',fresh,401,'Reset revokes other sessions');
 const resetState=await sql`SELECT (SELECT count(*)::int FROM platform_admin_mfa WHERE user_id=${user}) AS enrollments,(SELECT count(*)::int FROM platform_admin_recovery_codes WHERE user_id=${user}) AS codes,(SELECT count(*)::int FROM auth_sessions WHERE user_id=${user} AND mfa_verified_at IS NOT NULL) AS stamps`;
 record('Reset lifecycle database assertions',Object.values(resetState[0]).every(value=>value===0),{db_assertion:'Enrollment/codes/all MFA stamps removed; ordinary current session remains.'});
 references.delete('/en/admin/mfa:0');
 const setup=await action('/en/admin/mfa',ownerToken,0,{password},'Password-confirmed authenticator re-enrollment','seed');
 if(!setup.seed)throw Error('NEW_SEED_UNAVAILABLE');
 let oldCode=totpAt(secret,Math.floor(Date.now()/30000));
 if(matchTotp(setup.seed,oldCode,-1)!==null)oldCode='not-six-digits';
 await action('/en/admin/mfa',ownerToken,1,{code:oldCode},'Old authenticator rejected','Invalid, expired or already-used code.');
 secret=setup.seed;
 await action('/en/admin/mfa',ownerToken,1,{code:()=>totpAt(secret,Math.floor(Date.now()/30000))},'New authenticator confirmation','redirect');
 await http(api,'/v1/platform/access',ownerToken,200,'Re-enrolled current session works');
 const stale=await session();
 await sql`UPDATE auth_sessions SET mfa_verified_at=${generationStamp} WHERE token_hash=${hash(stale)}`;
 await http(api,'/v1/platform/access',stale,403,'Old MFA generation cannot regain access');
 const last=await action('/en/admin/security',ownerToken,0,{password},'Prepare recovery lockout test','codes');
 if(!last.codes)throw Error('LOCKOUT_CODES_UNAVAILABLE');
 const attacker=await session();
 for(let i=0;i<5;i++)await action('/en/admin/mfa',attacker,2,{password,recoveryCode:randomBytes(24).toString('base64url')},'Wrong recovery code '+(i+1),'Password or recovery code is invalid or already used.');
 const attacker2=await session();
 await action('/en/admin/mfa',attacker2,2,{password,recoveryCode:last.codes[0]},'Recovery limit persists across sessions','Too many attempts. Retry after 15 minutes.');
 const lock=await sql`SELECT blocked_until>now() AS blocked FROM platform_admin_mfa_attempts WHERE user_id=${user}`;
 const unused=await sql`SELECT consumed_at IS NULL AS unused FROM platform_admin_recovery_codes WHERE user_id=${user} AND code_hash=${hash(user+':'+last.codes[0])}`;
 record('Recovery lockout DB assertions',lock[0]?.blocked&&unused[0]?.unused,{db_assertion:'Persistent lock active; valid code not consumed while locked.'});
 const audit=await sql`SELECT action FROM platform_admin_audit WHERE actor_id=${user}`;
 record('Security lifecycle audited',['admin.mfa_rotate','admin.mfa_recover','admin.mfa_reset','admin.mfa_enrolled'].every(action=>audit.some(row=>row.action===action)),{db_assertion:'Generate/rotate, recover, reset and re-enrollment have audit records.'});
}catch(error){record('Lifecycle harness execution',false,{safe_response:'Unexpected failure; secret details suppressed.',error_type:error?.name||'unknown'});}
finally {
 try{
  if(seeded)await sql.begin(async tx=>{
   await tx`DELETE FROM platform_admin_audit WHERE actor_id IN ${sql([user,viewer,foreign])}`;
   await tx`DELETE FROM workspaces WHERE id IN ${sql([workspace,otherWorkspace])}`;
   await tx`DELETE FROM platform_administrators WHERE user_id=${user}`;
   await tx`DELETE FROM app_users WHERE id IN ${sql([user,viewer,foreign])}`;
  });
  const left=await sql`SELECT count(*)::int AS count FROM app_users WHERE id IN ${sql([user,viewer,foreign])}`;
  record('Lifecycle fixture cleanup',left[0].count===0,{db_assertion:'No test users remain.'});
 }catch{record('Lifecycle fixture cleanup',false,{safe_response:'Operator cleanup required for dedicated fixture '+user});}
 await sql.end();
 await writeFile('../../docs/evidence/PG01/completion-http-results.json',JSON.stringify({tested_at:new Date().toISOString(),api,web,web_evidence:web.startsWith('http:')?'Local production Next build against deployed Go/Neon; NOT deployed Vercel parity':'Deployed Vercel web',results},null,2)+'\n');
 process.exitCode=results.every(result=>result.pass)?0:1;
}
