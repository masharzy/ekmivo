// Authorized disposable identity/workspace fixtures; never mutate real merchants.
import postgres from 'postgres';
import {randomBytes,randomUUID,createHash,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
const {encodeReply}=createRequire(import.meta.url)('next/dist/compiled/react-server-dom-webpack/client.node');
if(process.env.PG23_ALLOW_PRODUCTION_FIXTURES!=='true')throw Error('Explicit fixture guard required');
const web=process.env.PG23_WEB_BASE||'https://briofold.tech',api='https://api.briofold.tech';
if(!['https://briofold.tech','http://127.0.0.1:3001'].includes(web))throw Error('Unapproved web target');
const sql=postgres(process.env.DATABASE_URL,{ssl:'require',max:1,prepare:false});
const ids=Array.from({length:5},()=>randomUUID()),workspaces=Array.from({length:3},()=>randomUUID());
const [owner,admin,editor,viewer,foreign]=ids,[ws,second,other]=workspaces;
const password=randomBytes(30).toString('base64url'),hash=v=>createHash('sha256').update(v).digest('hex');
const records=[],actions=new Map(),roles=new Map(),path='/en/w/'+ws+'/payments/developers?env=sandbox';
const headers=token=>({Cookie:'briofold-session='+token});
function record(pg,name,pass,details={}){records.push({pg,name,pass,...details});console.log(pg+' '+name+': '+(pass?'PASS':'FAIL'));}
async function session(id){const token=randomBytes(32).toString('base64url');roles.set(token,['owner','admin','editor','viewer','foreign owner'][ids.indexOf(id)]);await sql`INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES(${id},${hash(token)},now()+interval '1 hour')`;return token;}
async function page(url,token,extra={}){const r=await fetch(web+url,{headers:{...headers(token),...extra},redirect:'manual',signal:AbortSignal.timeout(30000)});return {status:r.status,html:await r.text(),location:r.headers.get('location')};}
async function discover(token){
 const pages=await Promise.all([page(path,token),page('/en/workspaces',token),page('/en/account',token)]);
 const scripts=new Set(pages.flatMap(p=>[...p.html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1])));
 for(const src of scripts){
  const text=await (await fetch(new URL(src,web))).text();
  for(const name of ['createMerchantKey','rotateMerchantKey','revokeMerchantKey','setWorkspaceProduct','saveDisplayName','revokeOtherSessions']){
   const rx=new RegExp('createServerReference\\)?\\)\\(\\"([a-f0-9]+)\\"[^)]{0,260}?\\"'+name+'\\"\\)','g');
   const match=rx.exec(text);
   if(match)actions.set(name,match[1]);
  }
 }
 if(actions.size<6){
  // SSR forms supply IDs for the product/profile actions even if chunk syntax differs.
  for(const [index,name] of [[1,'setWorkspaceProduct'],[2,'saveDisplayName']]){
   const hidden=[...pages[index].html.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
   for(const input of hidden){const n=input.match(/name="([^"]*)"/),v=input.match(/value="([^"]*)"/);if(n&&v&&/\$ACTION_\d+:0/.test(n[1])){actions.set(name,JSON.parse(v[1].replaceAll('&quot;','"').replaceAll('&amp;','&')).id);break;}}
  }
 }
 if(!actions.has('createMerchantKey'))throw Error('DEPLOYED_ACTION_REFERENCE_MISSING');
}
async function action(pg,name,token,fields,expected,label,url=path){
 const id=actions.get(name);if(!id)throw Error('ACTION_REFERENCE_MISSING');
 const form=new FormData();for(const [k,v] of Object.entries(fields))for(const item of Array.isArray(v)?v:[v])form.append(k,String(item));
 const body=await encodeReply(['en',{status:'idle',message:''},form]);
 const r=await fetch(web+url,{method:'POST',headers:{...headers(token),Origin:web,'Next-Action':id},body,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const text=await r.text();
 const secret=text.match(/"rawSecret":"([^"]+)"/)?.[1],keyId=text.match(/"keyId":"([^"]+)"/)?.[1];
 const pass=text.includes(expected)&&(!expected.includes('success')||r.status===200);
 const message=text.match(/"message":"([^"\n]+)"/)?.[1];
 record(pg,label,pass,{action:name,role:roles.get(token),expected,actual_status:r.status,safe_response:pass?'Expected action outcome; credentials suppressed':message||'Expected outcome absent'});
 return {secret,keyId,pass};
}
async function merchant(secret,environment,status,label,query=''){
 const r=await fetch(api+'/v1/merchant/context?environment='+environment+query,{headers:secret?{Authorization:'Bearer '+secret}:{},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const payload=await r.json();
 record('PG03',label,r.status===status,{endpoint:'GET /v1/merchant/context',role:'dedicated merchant credential',expected_status:status,actual_status:r.status,safe_response:Object.fromEntries(Object.entries(payload.error||payload).filter(([k])=>['code','message','environment','financial_api_ready','retryable'].includes(k)))});
 return payload;
}
let seeded=false;
try{
 await sql.begin(async tx=>{
  for(const id of ids){const salt=randomBytes(24),pw='scrypt-v1:'+salt.toString('hex')+':'+scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');await tx`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at) VALUES(${id},${id+'@example.invalid'},'PG23 audit fixture',${pw},now())`;}
  for(const [w,u] of [[ws,owner],[second,owner],[other,foreign]]){await tx`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${w},'PG23 audit business','both',${u})`;await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${w},${u},'owner')`;}
  for(const [u,r] of [[admin,'admin'],[editor,'editor'],[viewer,'viewer']])await tx`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${ws},${u},${r})`;
 });seeded=true;
 const tokens=await Promise.all(ids.map(session)),[o,a,e,v]=tokens;
 await discover(o);
 record('PG03','Actual deployed action references found',actions.size===6,{db_assertion:'References read from deployed client chunks/SSR, no mock actions.'});
 const ddl=await sql`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('merchant_api_keys','merchant_api_key_audit')`;
 record('PG03','Production key and audit FORCE RLS',ddl.length===2&&ddl.every(x=>x.relrowsecurity&&x.relforcerowsecurity));
 const permission=await sql`SELECT has_table_privilege('ekmivo_financial_runtime','merchant_api_keys','SELECT') AS readable,has_function_privilege('ekmivo_financial_runtime','resolve_merchant_api_key(text)','EXECUTE') AS resolver`;
 record('PG03','Restricted role table/resolver grants',!permission[0].readable&&permission[0].resolver);
 for(const locale of ['en','bn'])for(const theme of ['light','dark']){
  const p=await page('/'+locale+path.slice(3),o,{Cookie:'briofold-session='+o+'; briofold-theme='+theme});
  record('PG02','Authenticated shell '+locale+' '+theme,p.status===200&&p.html.includes('lang="'+locale+'"')&&p.html.includes('data-theme="'+theme+'"'),{endpoint:'GET locale/theme Developers',actual_status:p.status,safe_response:'SSR locale/theme only; not visual/browser claim.'});
 }
 const foreignPage=await page('/en/w/'+other+'/payments/developers?env=sandbox',o);
 const redirectDenied=foreignPage.html.includes('NEXT_REDIRECT')&&foreignPage.html.includes('/en/workspaces')&&!foreignPage.html.includes('ds-api-key-manager');
 record('PG02','Foreign business page denied',foreignPage.status===404||foreignPage.status===403||redirectDenied||([303,307].includes(foreignPage.status)&&foreignPage.location==='/en/workspaces'),{actual_status:foreignPage.status,safe_response:redirectDenied?'Streaming redirect to workspaces; no key manager':foreignPage.location});
 const badEnv=await page(path.replace('sandbox','invalid'),o);
 const notFoundDenied=/This page or environment is unavailable|This page could not be found|NEXT_HTTP_ERROR_FALLBACK;404/.test(badEnv.html)&&!badEnv.html.includes('ds-api-key-manager');
 record('PG02','Malformed environment denied',badEnv.status===404||badEnv.status===400||badEnv.status===403||notFoundDenied||([303,307].includes(badEnv.status)&&badEnv.location==='/en/workspaces'),{actual_status:badEnv.status,safe_response:notFoundDenied?'Streaming unavailable page; no key manager':badEnv.location});
 await action('PG02','saveDisplayName',o,{name:'PG23 saved profile'},'Display name saved.','Real profile name save','/en/account');
 const profile=await sql`SELECT display_name FROM app_users WHERE id=${owner}`;record('PG02','Profile save database assertion',profile[0].display_name==='PG23 saved profile');
 const old=await session(owner);
 await action('PG02','revokeOtherSessions',o,{},'other active sessions.','Real revoke other sessions','/en/account');
 const revoked=await sql`SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE token_hash=${hash(old)}`;
 const kept=await sql`SELECT revoked_at IS NULL AS active FROM auth_sessions WHERE token_hash=${hash(o)}`;
 record('PG02','Session revoke preserves current',revoked[0].revoked&&kept[0].active);
 const toggle={workspaceId:ws,product:'ai',enabled:'false'};
 await action('PG02','setWorkspaceProduct',v,toggle,'Only an owner or admin','Viewer product mutation denied','/en/workspaces');
 await action('PG02','setWorkspaceProduct',a,toggle,'Product disabled.','Admin real product toggle','/en/workspaces');
 const aud=await sql`SELECT count(*)::int AS n FROM workspace_product_access_audit WHERE workspace_id=${ws}`;record('PG02','Product mutation audited',aud[0].n===1);
 await action('PG02','setWorkspaceProduct',o,toggle,'No change was required.','Idempotent product toggle','/en/workspaces');
 const paymentOnly=await page(path,o);
 record('PG02','Payment-only workspace Developers works',paymentOnly.status===200&&paymentOnly.html.includes('ds-api-key-manager'));
 await action('PG02','setWorkspaceProduct',o,{workspaceId:ws,product:'payments',enabled:'false'},'Product disabled.','Disable second product for both-off test','/en/workspaces');
 const off=await page('/en/w/'+ws+'/dashboard',o);
 record('PG02','Both-off workspace honest disabled state',off.status===200&&off.html.includes('No enabled products for this business')&&!off.html.includes('ds-api-key-manager'));
 await action('PG02','setWorkspaceProduct',o,{...toggle,enabled:'true'},'Product enabled.','Owner restores AI product','/en/workspaces');
 const ai=await page('/en/w/'+ws+'/ai/overview',o);
 record('PG02','AI-only workspace navigation works',ai.status===200&&ai.html.includes('AI workspace navigation')&&!ai.html.includes('ds-api-key-manager'));
 await action('PG02','setWorkspaceProduct',o,{workspaceId:ws,product:'payments',enabled:'true'},'Product enabled.','Owner restores both products','/en/workspaces');
 const fields={workspaceId:ws,environment:'sandbox',password,name:'PG23 test key',expiresDays:7,scopes:['payments:read']};
 await action('PG03','createMerchantKey',v,fields,'Only an authorized owner or admin','Viewer key creation denied');
 await action('PG03','createMerchantKey',e,fields,'Only an authorized owner or admin','Editor key creation denied');
 await action('PG03','createMerchantKey',o,{...fields,workspaceId:other},'Only an authorized owner or admin','Foreign business key creation denied');
 await action('PG03','createMerchantKey',o,{...fields,password:'incorrect-test-password'},'Confirm your current password','Wrong password key creation denied');
 await action('PG03','createMerchantKey',o,{...fields,scopes:['admin:all']},'Check the name','Unsupported key scope denied');
 const issued=await action('PG03','createMerchantKey',o,fields,'"status":"success"','Password-confirmed real sandbox key issuance');
 if(!issued.secret||!issued.keyId)throw Error('ISSUED_SECRET_MISSING');
 const stored=await sql`SELECT secret_digest,scopes,expires_at,last_used_at FROM merchant_api_keys WHERE id=${issued.keyId}`;
 record('PG03','Full secret only hash persisted',String(stored[0].secret_digest).trim()===hash(issued.secret),{db_assertion:'Full SHA-256 digest matches, raw secret suppressed.'});
 const refresh=await page(path,o);record('PG03','Secret not recoverable on fresh GET',refresh.status===200&&!refresh.html.includes(issued.secret));
 const context=await merchant(issued.secret,'sandbox',200,'Valid key real Go authentication','&workspace_id='+other);
 record('PG03','Client tenant override ignored',context.workspace_id===ws&&context.financial_api_ready===false);
 await merchant(issued.secret,'live',403,'Wrong environment key denied');
 await merchant(issued.secret.slice(0,-2)+'AA','sandbox',401,'Tampered full secret denied');
 await merchant(null,'sandbox',401,'Missing bearer denied');
 await merchant(issued.secret,'invalid',400,'Invalid API environment denied');
 await merchant(issued.secret,'sandbox',400,'Repeated API environment denied','&environment=live');
 const last=await sql`SELECT last_used_at IS NOT NULL AS used FROM merchant_api_keys WHERE id=${issued.keyId}`;record('PG03','Successful use timestamp persisted',last[0].used);
 const rotated=await action('PG03','rotateMerchantKey',a,{workspaceId:ws,environment:'sandbox',password,keyId:issued.keyId},'"status":"success"','Admin actual key rotation');
 if(!rotated.secret||!rotated.keyId)throw Error('ROTATED_SECRET_MISSING');
 await merchant(issued.secret,'sandbox',401,'Rotated old key denied');
 await merchant(rotated.secret,'sandbox',200,'Rotated replacement works');
 const rotateDb=await sql`SELECT scopes,expires_at FROM merchant_api_keys WHERE id=${rotated.keyId}`;
 record('PG03','Rotation preserves scopes and expiry',JSON.stringify(rotateDb[0].scopes)===JSON.stringify(stored[0].scopes)&&new Date(rotateDb[0].expires_at).getTime()===new Date(stored[0].expires_at).getTime());
 await sql`UPDATE workspace_product_access SET enabled=false WHERE workspace_id=${ws} AND product='payments'`;
 await merchant(rotated.secret,'sandbox',401,'Disabled payments product key denied');
 await action('PG03','createMerchantKey',o,fields,'Only an authorized owner or admin','Disabled product prevents key issuance');
 await sql`UPDATE workspace_product_access SET enabled=true WHERE workspace_id=${ws} AND product='payments'`;
 await sql`UPDATE workspace_environments SET status='suspended' WHERE workspace_id=${ws} AND environment='sandbox'`;
 await merchant(rotated.secret,'sandbox',401,'Suspended environment key denied');
 await sql`UPDATE workspace_environments SET status='active' WHERE workspace_id=${ws} AND environment='sandbox'`;
 await action('PG03','revokeMerchantKey',o,{workspaceId:ws,environment:'sandbox',password,keyId:rotated.keyId},'API key revoked.','Actual owner key revoke');
 await merchant(rotated.secret,'sandbox',401,'Revoked replacement denied');
 const writeOnly=await action('PG03','createMerchantKey',o,{...fields,name:'PG23 write only',scopes:['payments:write']},'"status":"success"','Issue restricted write-only key');
 await merchant(writeOnly.secret,'sandbox',403,'Missing required read scope denied');
 await sql`UPDATE merchant_api_keys SET expires_at=now()-interval '1 minute',created_at=now()-interval '1 day' WHERE id=${writeOnly.keyId}`;
 await merchant(writeOnly.secret,'sandbox',401,'Expired key denied');
 const live=await action('PG03','createMerchantKey',o,{...fields,name:'PG23 live context test',environment:'live'},'"status":"success"','Issue separate live-realm credential');
 await merchant(live.secret,'live',200,'Live-realm context authentication');
 await merchant(live.secret,'sandbox',403,'Live key cannot access sandbox');
 const audit=await sql`SELECT action FROM merchant_api_key_audit WHERE workspace_id=${ws}`;
 record('PG03','Create rotation revoke audited',['created','rotated','revoked'].every(x=>audit.some(r=>r.action===x)));
 const contract=await readFile('../../contracts/openapi.yaml','utf8');
 record('PG03','OpenAPI unique components responses key',[...contract.matchAll(/^  responses:/gm)].length===1,{safe_response:'Duplicate component mapping keys invalidate strict YAML parsers.'});
}catch(err){record('PG23','Harness execution',false,{safe_response:'Unexpected test failure; sensitive details suppressed.',error_type:err?.name});}
finally{
 if(seeded)try{await sql.begin(async tx=>{for(const w of workspaces)await tx`DELETE FROM workspaces WHERE id=${w}`;for(const id of ids)await tx`DELETE FROM app_users WHERE id=${id}`;});const left=await sql`SELECT count(*)::int AS n FROM app_users WHERE id=ANY(${ids}::uuid[])`;record('PG23','Disposable fixture cleanup',left[0].n===0);}catch{record('PG23','Disposable fixture cleanup',false,{safe_response:'Operator cleanup required; fixture identifiers suppressed.'});}
 await sql.end();
 for(const pg of ['PG02','PG03'])await writeFile('../../docs/evidence/'+pg+'/'+(process.env.PG23_REPORT_NAME||'independent-production-audit.json'),JSON.stringify({tested_at:new Date().toISOString(),source:process.env.PG23_SOURCE_SHA||'4f1c4d6',deployed_web_sha:process.env.PG23_WEB_SHA||'c441dca',deployed_api_sha:process.env.PG23_API_SHA||'4f1c4d6',web,api,method:(web.startsWith('http://127.0.0.1')?'Local Next production build against real Neon and deployed Go HTTP; dedicated disposable fixtures; not deployed web parity.':'Dedicated disposable fixtures; actual deployed RSC actions and Go HTTP; secrets memory-only. UI interactions tracked separately.'),results:records.filter(r=>r.pg===pg||r.pg==='PG23')},null,2)+'\n');
 if(records.some(r=>!r.pass))process.exitCode=1;
}
