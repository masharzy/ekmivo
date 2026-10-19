// Opt-in isolated Neon database verification. Never accepts the production host.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(path.resolve('apps/web/package.json'));
const postgres=require('postgres');
const url=new URL(fs.readFileSync(path.join(os.tmpdir(),'ekmivo-plans-neon-url.txt'),'utf8'));
if(!process.env.PLAN_TEST_BRANCH_HOST||url.hostname!==process.env.PLAN_TEST_BRANCH_HOST)throw Error('Explicit isolated Neon branch host required');
const connection=db=>{let u=new URL(url);u.pathname='/'+db;const realm=db.includes('live')?'live':db.includes('sandbox')?'sandbox':null;if(realm)u=new URL(fs.readFileSync(path.join(os.tmpdir(),`ekmivo-plans-${realm}-url.txt`),'utf8'));if(u.hostname!==url.hostname)throw Error('Cross-branch connection denied');return postgres(u.href,{ssl:'require',prepare:false,max:16,onnotice:()=>{}})};
const control=connection('ekmivo'),live=connection('ekmivo_live_financial'),sandbox=connection('ekmivo_sandbox_financial');
const readerUrl=new URL(fs.readFileSync(path.join(os.tmpdir(),'ekmivo-plans-reader-url.txt'),'utf8'));if(readerUrl.hostname!==url.hostname)throw Error('Reader must use the same isolated branch');
const reader=postgres(readerUrl.href,{ssl:'require',prepare:false,max:16,onnotice:()=>{}});
try{
 if(process.argv.includes('--inspect')){for(const [name,sql] of [['control',control],['live',live],['sandbox',sandbox]])console.log(name,await sql.unsafe("SELECT rolname FROM pg_roles WHERE rolcanlogin AND pg_has_role(oid,'ekmivo_finance_reader','member')"));}
 else {
 for(const [name,sql,file] of [['control',control,'0067_managed_payment_plans.sql'],['live',live,'0068_payment_allowance.sql'],['sandbox',sandbox,'0068_payment_allowance.sql']]){
  const marker=name==='control'?'payment_plan_versions':'payment_allowance_slots';
  const [state]=await sql`SELECT to_regclass(${marker}) IS NOT NULL AS installed`;
  if(!state.installed){const body=fs.readFileSync('infra/migrations/'+file,'utf8').replace(/^BEGIN;$/m,'').replace(/COMMIT;\s*$/,'');await sql.begin(tx=>tx.unsafe(body));}
  else if(process.argv.includes('--refresh-functions')){const body=fs.readFileSync('infra/migrations/'+file,'utf8');for(const m of body.matchAll(/CREATE(?: OR REPLACE)? FUNCTION[\s\S]+?\$\$;/g))await sql.unsafe(m[0].replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION'));for(const m of body.matchAll(/CREATE TRIGGER ([a-z_]+)[\s\S]+?;/g)){const [existing]=await sql`SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=${m[1]} AND NOT tgisinternal) AS installed`;if(!existing.installed)await sql.unsafe(m[0]);}}
  console.log(name+' schema ready');
  if(name!=='control')await sql`CREATE INDEX IF NOT EXISTS payment_allowance_open ON payment_allowance_slots(workspace_id,environment,expires_at) WHERE state='reserved'`;
 }
 if(!process.argv.includes('--schema-only')){
  const uid=randomUUID(),outsider=randomUUID(),workspaces=[randomUUID(),randomUUID(),randomUUID()],suffix=randomUUID().replaceAll('-','').slice(0,10),pid='test-'+suffix;
  const hash=x=>createHash('sha256').update(x).digest('hex');
  await control`INSERT INTO app_users(id,email,display_name,password_hash) VALUES(${uid},${'plans-'+suffix+'@example.invalid'},'Plan test operator','invalid-test-only'),(${outsider},${'outsider-'+suffix+'@example.invalid'},'Plan test outsider','invalid-test-only')`;
  await control`INSERT INTO platform_administrators(user_id,role) VALUES(${uid},'super_admin')`;
  for(const w of workspaces){await control`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${w},${'Plan fixture '+suffix},'commerce',${uid})`;await control`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${w},${uid},'owner')`;}
  const terms={name:'Test free',name_bn:'পরীক্ষার ফ্রি প্ল্যান',description:'Synthetic test only',description_bn:'',kind:'free',amount_minor:0,period_days:30,grace_days:0,free_days:14,payment_limit:3,quota_period:'calendar',active_checkout_limit:20,create_per_minute:120,features:{invoices:true,payment_links:false,reports:true,exports:false},limits:{api_keys:1,team_members:1,devices:2,payment_methods:2},badge:'',badge_bn:'',contact_url:''};
  const admin=async(op,b,actor=uid)=>{try{return (await control`SELECT payment_plan_admin(${actor},${op},${control.json(b)}::jsonb) AS result`)[0].result}catch(e){console.log('admin operation',op,e.code);throw e}};
  const save=async(id,t,visibility='public',expected_version)=>admin('save',{id,terms:t,status:'published',visibility,expected_version,reason:'Synthetic plan verification'});
  const rejected=async(fn,code)=>{try{await fn();assert.fail('Expected rejection '+code)}catch(e){assert.equal(e.code,code)}};
  await rejected(()=>admin('read',{},outsider),'42501');
  await rejected(()=>save(pid,{...terms,payment_limit:0}),'22023');
  await save(pid,terms);let catalog=(await admin('read',{})).plans;let plan=catalog.find(p=>p.plan_id===pid);assert.equal(plan.terms.kind,'free');
  await control`SELECT payment_plan_claim_free(${workspaces[0]},${uid},${pid})`;
  const initial=(await control`SELECT payment_plan_effective(${workspaces[0]}) AS p`)[0].p;
  await control`SELECT payment_plan_claim_free(${workspaces[0]},${uid},${pid})`;
  assert.equal((await control`SELECT payment_plan_effective(${workspaces[0]}) AS p`)[0].p.access_until,initial.access_until);
  await rejected(()=>control`SELECT payment_plan_claim_free(${workspaces[1]},${outsider},${pid})`,'42501');
  await save(pid,{...terms,payment_limit:7},'public',plan.current_version);
  const raised=(await control`SELECT payment_plan_effective(${workspaces[0]}) AS p`)[0].p;
  assert.equal(raised.terms.payment_limit,7);
  assert.equal(raised.access_until,initial.access_until);
  // Paid plan and other paid/pricing changes remain version-pinned.
  // Restore this test fixture's original three-payment limit explicitly to
  // keep its existing final-slot concurrency assertions meaningful.
  await admin('assign',{workspace_id:workspaces[0],version_id:plan.current_version,until_at:initial.access_until,reason:'Restore original quota for synthetic race tests'});
  const pinned=(await control`SELECT payment_plan_effective(${workspaces[0]}) AS p`)[0].p;
  assert.equal(pinned.terms.payment_limit,3);
  await rejected(()=>save(pid,terms,'public',plan.current_version),'40001');
  await rejected(()=>control`UPDATE payment_plan_versions SET terms='{}' WHERE id=${plan.current_version}`,'42501');
  await rejected(()=>control`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspaces[0]},${outsider},'viewer')`,'P6806');
  await control`INSERT INTO workspace_environments(workspace_id,environment) VALUES(${workspaces[0]},'live') ON CONFLICT DO NOTHING`;
  const key=()=>control`INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at) VALUES(${workspaces[0]},'live',${hash(randomUUID()).slice(0,16)},${hash(randomUUID())},'Plan fixture key',ARRAY['payments:write'],${uid},now()+interval '1 day')`;
  await key();await rejected(key,'P6806');
  await save('private-'+suffix,{...terms,kind:'custom',name:'Negotiated',payment_limit:2,free_days:null,contact_url:'https://example.invalid/contact'},'private');
  const [publicCatalog]=await control`SELECT payment_plan_public() AS plans`;assert(!publicCatalog.plans.some(p=>p.id==='private-'+suffix));
  catalog=(await admin('read',{})).plans;const custom=catalog.find(p=>p.plan_id==='private-'+suffix);
  await admin('assign',{workspace_id:workspaces[1],version_id:custom.current_version,until_at:new Date(Date.now()+86400000).toISOString(),reason:'Explicit synthetic negotiated grant'});
  const snapshot=async w=>({...((await control`SELECT payment_plan_effective(${w}) AS p`)[0].p),workspace_id:w,fetched_at:new Date().toISOString()});
  const scoped=async(w,p,fn,role)=>(role?reader:live).begin(async tx=>{await tx`SELECT set_config('ekmivo.workspace_id',${w},true),set_config('ekmivo.environment','live',true),set_config('ekmivo.payment_plan',${JSON.stringify(p)},true)`;return fn(tx)});
  const accounts={};
  for(const w of workspaces.slice(0,2)){
   await live`SELECT financial_sync_workspace(${w},'live',1,true)`;const p=await snapshot(w);
   accounts[w]=await scoped(w,p,async tx=>{const [a]=await tx`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES(${w},'live','bkash',${hash(w)},'1234') RETURNING id`;await tx`INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES(${w},'live',${a.id},${Buffer.alloc(40)})`;await tx`INSERT INTO pg06_phones(workspace_id,environment,name,public_key,claimed_at,permission_ok,heartbeat_at) VALUES(${w},'live','Synthetic test phone',${Buffer.alloc(40)},now(),true,now())`;return a.id});
  }
  const create=async(w,key,p)=>scoped(w,p??await snapshot(w),async tx=>(await tx`SELECT pg10_intent(${w},'live',${key},10000,30,${key},${hash('cap'+key)},${hash('body'+key)}) AS result`)[0].result,'ekmivo_finance_reader');
  const w=workspaces[0],p=await snapshot(w);
  const cp=await snapshot(workspaces[1]);
  await rejected(()=>create(workspaces[1],'boundary-'+suffix,{...cp,period_end:new Date(Date.now()-1000).toISOString()}),'P6801');
  await create(workspaces[1],'safety-'+suffix,{...cp,terms:{...cp.terms,active_checkout_limit:1}});
  await rejected(()=>create(workspaces[1],'active-cap-'+suffix,{...cp,terms:{...cp.terms,active_checkout_limit:1}}),'P6804');
  await rejected(()=>create(workspaces[1],'rate-cap-'+suffix,{...cp,terms:{...cp.terms,create_per_minute:1}}),'P6805');
  const phone=()=>scoped(w,p,tx=>tx`INSERT INTO pg06_phones(workspace_id,environment,name,public_key,claimed_at,permission_ok,heartbeat_at) VALUES(${w},'live','Second fixture phone',${Buffer.alloc(40)},now(),true,now())`);
  await phone();await rejected(phone,'P6806');
  const method=()=>scoped(w,p,async tx=>{const [a]=await tx`INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES(${w},'live','bkash',${hash(randomUUID())},'1234') RETURNING id`;await tx`INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES(${w},'live',${a.id},${Buffer.alloc(40)})`;return a.id});
  await method();await rejected(method,'P6806');
  await scoped(w,p,tx=>tx`UPDATE pg06_account_configuration SET disabled_at=now() WHERE account_id=${accounts[w]}`);const third=await method();
  await rejected(()=>scoped(w,p,tx=>tx`UPDATE pg06_account_configuration SET disabled_at=NULL WHERE account_id=${accounts[w]}`),'P6806');
  await scoped(w,p,tx=>tx`UPDATE pg06_account_configuration SET disabled_at=now() WHERE account_id=${third}`);
  await scoped(w,p,tx=>tx`UPDATE pg06_account_configuration SET disabled_at=NULL WHERE account_id=${accounts[w]}`);
  const race=await Promise.allSettled(Array.from({length:12},(_,i)=>create(w,'race-'+suffix+'-'+i,p)));
  const winners=race.filter(r=>r.status==='fulfilled').map(r=>r.value);if(winners.length!==3)console.log('race errors',race.filter(r=>r.status==='rejected').map(r=>({code:r.reason.code,message:r.reason.message})));assert.equal(winners.length,3);assert(race.filter(r=>r.status==='rejected').every(r=>r.reason.code==='P6803'));
  const first=winners[0];const replay=await create(w,first.merchant_reference,p);assert.equal(replay.id,first.id);
  await scoped(w,p,tx=>tx`INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type) VALUES(${w},'live',${winners[1].id},'cancelled')`);
  const replacement=await create(w,'replacement-'+suffix,p);assert(replacement.id);
  // Expiry releases an unpaid reservation in accounting without rewriting the immutable intent.
  await live`UPDATE payment_allowance_slots SET expires_at=now()-interval '1 second' WHERE intent_id=${winners[2].id}`;
  const afterExpiry=await create(w,'after-expiry-'+suffix,p);assert(afterExpiry.id);
  // A genuine financial allocation, built from synthetic but complete matching
  // evidence, must consume exactly once even when the subscription has expired.
  await control`UPDATE pg13_subscriptions SET paid_until=now()-interval '1 day',grace_until=now()-interval '1 day' WHERE workspace_id=${w}`;
  await rejected(()=>create(w,'expired-'+suffix),'P6802');
  await live.begin(async tx=>{
   const [intent]=await tx`SELECT * FROM payment_intents WHERE id=${first.id}`;
   const [attempt]=await tx`INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,currency,method,window_start,window_end,policy_version) VALUES(${w},'live',${first.id},${accounts[w]},${hash('payer'+w)},'5678',10000,'BDT','bkash',now(),${intent.expires_at},1) RETURNING id,window_start`;
   const [inbound]=await tx`INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence) VALUES(${w},'live','device_sms',${suffix},${hash(suffix)},${Buffer.alloc(40)}) RETURNING id`;
   const [obs]=await tx`INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,amount_minor,currency,method,direction,original_transaction_at,time_precision,parser_version) VALUES(${w},'live',${inbound.id},${accounts[w]},${hash('payer'+w)},10000,'BDT','bkash','incoming',(SELECT window_start FROM payment_attempts WHERE id=${attempt.id}),'second',1) RETURNING id`;
   const [payment]=await tx`INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,currency,verification_method,policy_version) VALUES(${w},'live',${attempt.id},${obs.id},10000,'BDT','sms_match',1) RETURNING id`;
   await tx`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor) VALUES(${w},'live',${payment.id},${first.id},10000)`;
   const [slot]=await tx`SELECT state FROM payment_allowance_slots WHERE intent_id=${first.id}`;assert.equal(slot.state,'consumed');
   await rejected(()=>tx.savepoint(inner=>inner`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor) VALUES(${w},'live',${payment.id},${first.id},10000)`),'23514');
  });
  const usage=await scoped(w,p,async tx=>(await tx`SELECT payment_allowance_usage(${w},'live',${p.period_start},${p.period_end}) AS result`)[0].result,'ekmivo_finance_reader');assert.equal(usage.used,1);assert.equal(usage.reserved,2);
  await rejected(()=>scoped(workspaces[1],p,tx=>tx`INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at) VALUES(${workspaces[1]},'live',${'wrong-tenant-'+suffix},10000,now()+interval '1 hour')`),'P6801');
  await admin('override',{workspace_id:workspaces[1],extra_payments:10,until_at:new Date(Date.now()+86400000).toISOString(),reason:'Temporary synthetic quota override'});
  assert.equal((await snapshot(workspaces[1])).extra_payments,10);
  // Paid invoices freeze the version/price that was accepted; changing the
  // catalog cannot rewrite a pending invoice or an existing subscription.
  const paid='paid-'+suffix;
  await save(paid,{...terms,kind:'paid',amount_minor:10000,free_days:null,payment_limit:500});
  const billingKey='billing-test-'+suffix;
  const [issued]=await control`SELECT pg13_billing_issue(${workspaces[2]},${uid},${paid},${billingKey}) AS invoice`;
  const invoice=issued.invoice;
  const paidVersion=(await admin('read',{})).plans.find(p=>p.plan_id===paid);
  await save(paid,{...paidVersion.terms,amount_minor:25000,payment_limit:2000},'public',paidVersion.current_version);
  const [retried]=await control`SELECT pg13_billing_issue(${workspaces[2]},${uid},${paid},${billingKey}) AS invoice`;
  assert.equal(retried.invoice.id,invoice.id);assert.equal(retried.invoice.amount_minor,10000);
  const proof=randomUUID();
  await rejected(()=>control`SELECT pg13_billing_verified(${workspaces[2]},${invoice.id},${proof},9999,now())`,'23514');
  await control`SELECT pg13_billing_verified(${workspaces[2]},${invoice.id},${proof},10000,now())`;
  const accepted=(await control`SELECT payment_plan_effective(${workspaces[2]}) AS p`)[0].p;
  assert.equal(accepted.terms.amount_minor,10000);assert.equal(accepted.terms.payment_limit,500);
  await control`SELECT pg13_billing_verified(${workspaces[2]},${invoice.id},${proof},10000,now())`;
  assert.equal((await control`SELECT payment_plan_effective(${workspaces[2]}) AS p`)[0].p.access_until,accepted.access_until);
  const newPaid=(await admin('read',{})).plans.find(p=>p.plan_id===paid);
  await admin('schedule',{workspace_id:workspaces[2],version_id:newPaid.current_version,reason:'Synthetic next renewal scheduling'});
  assert.equal((await control`SELECT payment_plan_effective(${workspaces[2]}) AS p`)[0].p.version_id,accepted.version_id);
  await admin('clear_schedule',{workspace_id:workspaces[2],reason:'Cancel scheduled synthetic change'});
  assert.equal((await snapshot(workspaces[2])).next_version_id,null);
  await admin('schedule',{workspace_id:workspaces[2],version_id:newPaid.current_version,reason:'Schedule again for verified renewal'});
  const [renewal]=await control`SELECT pg13_billing_issue(${workspaces[2]},${uid},${paid},${'renewal-'+suffix}) AS invoice`;
  assert.equal(renewal.invoice.amount_minor,25000);
  await control`SELECT pg13_billing_verified(${workspaces[2]},${renewal.invoice.id},${randomUUID()},25000,now())`;
  assert.equal((await control`SELECT payment_plan_effective(${workspaces[2]}) AS p`)[0].p.version_id,newPaid.current_version);
  await admin('expire',{workspace_id:workspaces[2],reason:'Explicit audited subscription expiry'});
  assert.equal((await snapshot(workspaces[2])).active,false);
  const noPrice={...terms};delete noPrice.amount_minor;assert.equal((await control`SELECT payment_plan_validate(${control.json(noPrice)}::jsonb) AS terms`)[0].terms.kind,'free');
  await reader.begin(async tx=>{await tx`SELECT set_config('ekmivo.workspace_id',${workspaces[1]},true),set_config('ekmivo.environment','live',true)`;await rejected(()=>tx.savepoint(t=>t`SELECT payment_allowance_usage(${w},'live',${p.period_start},${p.period_end})`),'42501');});
  await rejected(()=>reader`SELECT * FROM payment_allowance_slots`,'42501');
  await rejected(async()=>create(workspaces[1],'stale-'+suffix,{...(await snapshot(workspaces[1])),fetched_at:new Date(Date.now()-60000).toISOString()}),'P6801');
  await admin('archive',{id:pid,reason:'Archive synthetic plan with subscribers'});assert(!(await control`SELECT payment_plan_public() AS plans`)[0].plans.some(x=>x.id===pid));
  console.log('PASS: admin authorization, validation, free activation/retry, immutable versions, optimistic edit conflict, private plans, resource cap, 12-way final-slot race, idempotent creation, cancellation, expiry release, verification after subscription expiry, consumption once, tenant isolation, override, paid price snapshots, proof mismatch, duplicate renewal, scheduled paid changes, restricted-role grants, stale snapshot rejection and archival');
 }
 }
}finally{await Promise.all([control.end(),live.end(),sandbox.end(),reader.end()])}
