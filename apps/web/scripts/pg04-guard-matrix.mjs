// Called only from PG04's loopback-only disposable PostgreSQL CI harness.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import postgres from 'postgres';

export async function verifyPG04Guards({ds,dbs,controls}) {
 let assertions=0;
 const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++;};
 const digest=()=>randomBytes(32).toString('hex');
 const rollback=Symbol('guard fixture rollback');
 const request=async (db,workspace,realm)=> (await db`INSERT INTO payment_intents
  (workspace_id,environment,merchant_reference,amount_minor,expires_at)
  VALUES(${workspace}::uuid,${realm},${randomUUID()},7500,now()+interval '1 hour') RETURNING id`)[0].id;

 // Populate both tenants BEFORE querying through restricted runtime roles.
 for(const realm of ['sandbox','live']) {
  const db=dbs[realm],tenants=[randomUUID(),randomUUID()];
  for(const workspace of tenants) {
   await db`SELECT financial_sync_workspace(${workspace}::uuid,${realm},1,true)`;
   await request(db,workspace,realm);
  }
  const reader=postgres(ds('ekmivo_pg04_'+realm,'ekmivo_finance_reader_'+realm,'pg04-'+realm+'-reader-only'),{max:1,prepare:false});
  try {
   check((await reader`SELECT count(*)::int n FROM payment_intents`)[0].n,0,'populated missing-context read leaked');
   for(const workspace of tenants) {
    await reader.begin(async tx=>{
     await tx`SELECT set_config('ekmivo.workspace_id',${workspace},true),set_config('ekmivo.environment',${realm},true)`;
     const rows=await tx`SELECT workspace_id::text FROM payment_intents`;
     check(rows.map(row=>row.workspace_id),[workspace],'authorized tenant cannot read exactly own populated rows');
     const other=tenants.find(id=>id!==workspace);
     check((await tx`SELECT count(*)::int n FROM payment_intents WHERE workspace_id=${other}::uuid`)[0].n,0,'foreign tenant read leaked');
    });
   }
   check((await reader`SELECT count(*)::int n FROM payment_intents`)[0].n,0,'transaction-local tenant context leaked into reused connection');
   await reader.begin(async tx=>{
    await tx`SELECT set_config('ekmivo.workspace_id',${tenants[0]},true),set_config('ekmivo.environment',${realm==='live'?'sandbox':'live'},true)`;
    check((await tx`SELECT count(*)::int n FROM payment_intents`)[0].n,0,'wrong realm read leaked');
   });
  } finally {await reader.end({timeout:3});}
 }

 const db=dbs.sandbox,workspace=controls.find(([realm])=>realm==='sandbox')[1];
 const balances=async tx=>(await tx`SELECT
  (SELECT count(*)::int FROM financial_payments WHERE workspace_id=${workspace}::uuid) payments,
  (SELECT count(*)::int FROM financial_allocations WHERE workspace_id=${workspace}::uuid) allocations,
  (SELECT count(*)::int FROM financial_outbox WHERE workspace_id=${workspace}::uuid) outbox,
  (SELECT count(*)::int FROM river_job) jobs`)[0];

 // Each bad receipt is a complete, attempted transaction, not a check of text.
 try {await db.begin(async tx=>{
  const receiving=(await tx`INSERT INTO financial_receiving_accounts
   (workspace_id,environment,method,identity_hmac,display_suffix)
   VALUES(${workspace}::uuid,'sandbox','bkash',${digest()},'1234') RETURNING id`)[0].id;
  const alternate=(await tx`INSERT INTO financial_receiving_accounts
   (workspace_id,environment,method,identity_hmac,display_suffix)
   VALUES(${workspace}::uuid,'sandbox','bkash',${digest()},'4321') RETURNING id`)[0].id;
  const intent=await request(tx,workspace,'sandbox'),payer=digest();
  const attempt=(await tx`INSERT INTO payment_attempts
   (workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
   VALUES(${workspace}::uuid,'sandbox',${intent}::uuid,${receiving}::uuid,${payer},'5678',7500,'bkash',now(),now()+interval '15 minutes',1) RETURNING id`)[0].id;
  const baseline=await balances(tx);
  const cases=[
   ['wrong payer',{payer:digest()}],['missing payer',{payer:null}],
   ['wrong account',{account:alternate}],['wrong amount',{amount:7501}],
   ['wrong method',{method:'nagad'}],['outgoing',{direction:'outgoing'}],
   ['unknown direction',{direction:'unknown'}],['missing time',{offset:null}],
   ['unknown precision',{precision:'unknown'}],['before window',{offset:-1}],
   ['after window',{offset:901}],['wrong source',{source:'provider_api'}],
   ['wrong verification method',{verification:'provider_api'}],['wrong policy',{policy:2}],
   ['wrong claimed funds',{funds:7501}],['wrong currency',{currency:'USD'}],
  ];
  async function insertReceipt(b,overrides) {
   const c={payer,account:receiving,amount:7500,method:'bkash',direction:'incoming',offset:1,precision:'second',source:'sandbox_fixture',verification:'sandbox_fixture',policy:1,funds:7500,currency:'BDT',...overrides};
   const inbound=(await b`INSERT INTO financial_inbound_events
    (workspace_id,environment,source_kind,source_event_id,event_digest,encrypted_evidence)
    VALUES(${workspace}::uuid,'sandbox',${c.source},${randomUUID()},${digest()},${randomBytes(40)}) RETURNING id`)[0].id;
   const observation=(await b`INSERT INTO financial_receipt_observations
    (workspace_id,environment,inbound_event_id,receiving_account_id,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
    SELECT ${workspace}::uuid,'sandbox',${inbound}::uuid,${c.account}::uuid,${c.payer},${c.amount},${c.method},${c.direction},
     CASE WHEN ${c.offset}::double precision IS NULL THEN NULL ELSE window_start + ${c.offset}::double precision * interval '1 second' END,${c.precision},1
    FROM payment_attempts WHERE id=${attempt}::uuid RETURNING id`)[0].id;
   return b`INSERT INTO financial_payments
    (workspace_id,environment,attempt_id,observation_id,verified_amount_minor,currency,verification_method,policy_version)
    VALUES(${workspace}::uuid,'sandbox',${attempt}::uuid,${observation}::uuid,${c.funds},${c.currency},${c.verification},${c.policy}) RETURNING id`;
  }
  // Positive case prevents a permanently failing insert from passing negatives.
  try {await tx.savepoint(async b=>{check((await insertReceipt(b,{})).length,1,'valid five-field receipt rejected');throw rollback;});}
  catch(e){if(e!==rollback)throw e;}
  for(const [name,overrides] of cases) {
   let code;
   try {await tx.savepoint(async b=>{await insertReceipt(b,overrides);});}
   catch(e){code=e.code;}
   check(code,'23514','invalid receipt accepted: '+name);
   check(await balances(tx),baseline,'failed receipt left financial effects: '+name);
  }
  // Actual cross-tenant composite FK, with an existing foreign parent.
  const foreign=randomUUID();await tx`SELECT financial_sync_workspace(${foreign}::uuid,'sandbox',1,true)`;
  const foreignIntent=await request(tx,foreign,'sandbox');
  let crossCode;
  try {await tx.savepoint(async b=>{await b`INSERT INTO financial_outbox
   (workspace_id,environment,event_key,event_kind,payload,river_job_id)
   VALUES(${foreign}::uuid,'sandbox',${randomUUID()},'pg04_audit','{}',-1)`;
   await b`SET CONSTRAINTS financial_outbox_river_commit IMMEDIATE`;
  });}catch(e){crossCode=e.code;}
  check(crossCode,'23514','outbox without corresponding job accepted');
  // Allocation parent cannot be borrowed from another workspace.
  try {await tx.savepoint(async b=>{
   const payment=(await insertReceipt(b,{}))[0].id;
   await b`INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor)
    VALUES(${foreign}::uuid,'sandbox',${payment}::uuid,${foreignIntent}::uuid,1)`;
  });assert.fail('cross-tenant allocation accepted');}catch(e){check(e.code,'23514','cross-tenant allocation guard failed');}
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 console.log('PG04 populated RLS + invalid receipt matrix PASS: '+assertions+' assertions');
 return assertions;
}
