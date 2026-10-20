import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import postgres from "postgres";

// Called only by the existing disposable Foundation CI database harness.
// Separate connections exercise real advisory locks, not Promise.all on one pool.
export async function runBriofoldWalletChecks(url){
 const target=new URL(url);
 if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname)||/prod/i.test(target.pathname))throw Error("Wallet smoke refuses shared databases");
 const db=postgres(url,{max:12,prepare:false});let count=0;
 const equal=(actual,expected)=>{assert.deepEqual(actual,expected);count++;};
 const reject=async (callback,code)=>{await assert.rejects(callback,error=>error.code===code);count++;};
 try{
  for(const name of ["0123_briofold_business_onboarding.sql","0124_briofold_ai_prepaid_wallet.sql","0125_briofold_ai_verified_topups.sql","0126_briofold_ai_topup_runtime_access.sql","0127_briofold_ai_admin_catalog.sql","0128_briofold_ai_topup_recovery.sql","0129_briofold_ai_execution_meter.sql","0130_briofold_ai_exception_resolution.sql","0131_briofold_ai_topup_proof_binding.sql"]){
   const migration=await readFile(new URL("../../../infra/migrations/"+name,import.meta.url),"utf8");
   await db.begin(tx=>tx.unsafe(migration.replace(/^(BEGIN|COMMIT);\s*$/gm,"")).simple());
  }
  const actor=randomUUID(),otherActor=randomUUID(),workspace=randomUUID(),receiver=randomUUID();
  for(const [u,w] of [[actor,workspace],[otherActor,receiver]]){
   await db`INSERT INTO app_users(id,email,display_name,password_hash) VALUES(${u},${u+"@example.invalid"},'Wallet CI','not-a-password')`;
   await db`INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(${w},'Wallet CI','both',${u})`;
   await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${w},${u},'owner')`;
  }
  const topup=randomUUID(),proof=randomUUID();
  await db`INSERT INTO briofold_ai_topups(id,workspace_id,actor_id,idempotency_key,amount_minor,receiving_workspace_id)
   VALUES(${topup},${workspace},${actor},${randomUUID()},1000,${receiver})`;
  const credit=()=>db`SELECT briofold_ai_topup_apply_verified(${workspace},${actor},${topup},${proof},1000) AS result`;
  const deposits=await Promise.all(Array.from({length:12},credit));
  equal(deposits.filter(x=>x[0].result.credited).length,1);
  const balance=async()=>{
   const [row]=await db`SELECT available_minor,reserved_minor FROM briofold_ai_wallets WHERE workspace_id=${workspace}`;
   return [Number(row.available_minor),Number(row.reserved_minor)];
  };
  equal(await balance(),[1000,0]);
  await reject(()=>db`SELECT briofold_ai_topup_apply_verified(${workspace},${actor},${topup},${randomUUID()},1000)`,"23505");
  await reject(()=>db`SELECT briofold_ai_topup_apply_verified(${workspace},${actor},${topup},${proof},1001)`,"22023");
  const reserve=(key,cost=100)=>db`SELECT briofold_ai_wallet_reserve(${workspace},${actor},${key},${cost}) AS id`;
  const key=randomUUID();
  const reservations=await Promise.all(Array.from({length:12},()=>reserve(key)));
  equal(new Set(reservations.map(x=>x[0].id)).size,1);equal(await balance(),[900,100]);
  await reject(()=>reserve(key,101),"23505");
  const settle=(key,cost)=>db`SELECT briofold_ai_wallet_settle(${workspace},${actor},${key},${cost}) AS result`;
  await Promise.all(Array.from({length:12},()=>settle(key,60)));
  equal(await balance(),[940,0]);
  await reject(()=>settle(key,61),"23505");
  await reject(()=>db`SELECT briofold_ai_wallet_reserve(${workspace},${otherActor},${randomUUID()},1)`,"42501");
  await reject(()=>db`SELECT briofold_ai_wallet_settle(${workspace},${otherActor},${key},60)`,"42501");
  const attempts=await Promise.allSettled(Array.from({length:12},()=>reserve(randomUUID(),100)));
  equal(attempts.filter(x=>x.status==="fulfilled").length,9);
  equal(attempts.filter(x=>x.status==="rejected"&&x.reason.code==="P0001").length,3);
  equal(await balance(),[40,900]);
  const pending=await db`SELECT request_key FROM briofold_ai_reservations WHERE workspace_id=${workspace} AND state='reserved'`;
  const releaseKey=pending[0].request_key;
  await reject(()=>settle(releaseKey,101),"22023");equal(await balance(),[40,900]);
  await Promise.all(pending.map(x=>settle(x.request_key,0)));equal(await balance(),[940,0]);
  await Promise.all(pending.map(x=>settle(x.request_key,0)));equal(await balance(),[940,0]);
  await reject(()=>db`UPDATE briofold_ai_credit_journal SET kind='correction' WHERE workspace_id=${workspace}`,"42501");
  await reject(()=>db`DELETE FROM briofold_ai_credit_journal WHERE workspace_id=${workspace}`,"42501");
  const [journal]=await db`SELECT sum(available_delta_minor)::bigint AS available,sum(reserved_delta_minor)::bigint AS reserved,
   count(*) FILTER(WHERE kind='verified_topup')::int AS deposits,count(*) FILTER(WHERE operation_key=${"settle:"+key})::int AS settlements
   FROM briofold_ai_credit_journal WHERE workspace_id=${workspace}`;
  equal([Number(journal.available),Number(journal.reserved),journal.deposits,journal.settlements],[940,0,1,1]);
  for(const role of ["ekmivo_financial_runtime","ekmivo_financial_projection"]){
   await reject(()=>db.begin(async tx=>{
    await tx.unsafe("SET LOCAL ROLE "+role);
    await tx`SELECT * FROM briofold_ai_wallets`;
   }),"42501");
   if(role==="ekmivo_financial_projection")await reject(()=>db.begin(async tx=>{
    await tx.unsafe("SET LOCAL ROLE "+role);
    await tx`SELECT briofold_ai_topup_apply_verified(${workspace},${actor},${topup},${proof},1000)`;
   }),"42501");
  }
  const context=await db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT * FROM briofold_ai_topup_context(${workspace},${actor},${topup})`;
  });
  equal([context[0].receiving_workspace_id,Number(context[0].amount_minor)],[receiver,1000]);
  await reject(()=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   await tx`SELECT * FROM briofold_ai_topup_context(${workspace},${otherActor},${topup})`;
  }),"42501");
  const failedKey=randomUUID();
  await assert.rejects(()=>db.begin(async tx=>{
   await tx`SELECT briofold_ai_wallet_reserve(${workspace},${actor},${failedKey},100)`;
   throw Error("intentional rollback");
  }));count++;
  equal(await balance(),[940,0]);
  equal((await db`SELECT count(*)::int AS n FROM briofold_ai_reservations WHERE request_key=${failedKey}`)[0].n,0);
  // Admin and merchant now operate on this SAME wallet and append-only journal.
  await db`INSERT INTO platform_administrators(user_id,role) VALUES(${actor},'super_admin'),(${otherActor},'admin')`;
  const adjustmentKey=randomUUID();
  const adjust=()=>db`SELECT briofold_ai_admin_adjust(${actor},${workspace},${adjustmentKey},60,'Synthetic CI wallet grant')`;
  await Promise.all(Array.from({length:12},adjust));equal(await balance(),[1000,0]);
  equal((await db`SELECT count(*)::int AS n FROM briofold_ai_credit_journal WHERE operation_key=${"admin:"+adjustmentKey}`)[0].n,1);
  await reject(()=>db`SELECT briofold_ai_admin_adjust(${otherActor},${workspace},${randomUUID()},1,'Non-super grant denied')`,"42501");
  await reject(()=>db`SELECT briofold_ai_admin_adjust(${actor},${workspace},${adjustmentKey},61,'Synthetic CI wallet grant')`,"23505");
  const heldKey=randomUUID();await reserve(heldKey,100);
  await reject(()=>db`SELECT briofold_ai_admin_adjust(${actor},${workspace},${randomUUID()},-901,'Cannot deduct held funds')`,"22023");
  equal(await balance(),[900,100]);await settle(heldKey,0);
  const model="fixture/model-"+randomUUID(),tariffKey=randomUUID();
  const terms={provider:"openrouter",currency:"BDT",rounding:"ceil_minor",input_minor_per_million:1000,cached_input_minor_per_million:100,
   output_minor_per_million:2000,max_input_tokens:10000,max_output_tokens:2000,max_request_minor:100};
  const publish=(key,expected,body=terms,a=actor)=>db`SELECT briofold_ai_tariff_publish(${a},${key},${model},${expected},${db.json(body)},'Synthetic tariff publish') AS id`;
  const versions=await Promise.all(Array.from({length:12},()=>publish(tariffKey,null)));
  const first=versions[0][0].id;equal(new Set(versions.map(x=>x[0].id)).size,1);
  await reject(()=>publish(randomUUID(),first,terms,otherActor),"42501");
  await reject(()=>publish(tariffKey,null,{...terms,output_minor_per_million:2001}),"23505");
  await reject(()=>publish(randomUUID(),first,{...terms,max_request_minor:1}),"22023");
  await reject(()=>publish(randomUUID(),first,{...terms,cached_input_minor_per_million:1001}),"22023");
  const second=(await publish(randomUUID(),first,{...terms,input_minor_per_million:2000}))[0].id;
  equal((await db`SELECT briofold_ai_tariff_current(${model}) AS value`)[0].value.id,second);
  equal((await db`SELECT terms FROM briofold_ai_tariff_versions WHERE id=${first}`)[0].terms.input_minor_per_million,1000);
  await reject(()=>publish(randomUUID(),first),"40001");
  await reject(()=>db`UPDATE briofold_ai_tariff_versions SET terms='{}' WHERE id=${first}`,"42501");
  await reject(()=>db`DELETE FROM briofold_ai_tariff_versions WHERE id=${first}`,"42501");
  const current=await db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_runtime`;return tx`SELECT briofold_ai_tariff_current(${model}) AS value`;});
  equal(current[0].value.id,second);
  await reject(()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_runtime`;return tx`SELECT briofold_ai_admin_adjust(${actor},${workspace},${randomUUID()},1,'Runtime grant forbidden')`;}),"42501");
  await reject(()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_runtime`;return tx`SELECT * FROM briofold_ai_tariff_versions`;}),"42501");
  // A closed tab/revoked member cannot strand an already verified purchase.
  const recoveryTopup=randomUUID(),recoveryProof=randomUUID();
  await db`INSERT INTO briofold_ai_topups(id,workspace_id,actor_id,idempotency_key,amount_minor,receiving_workspace_id)
   VALUES(${recoveryTopup},${workspace},${actor},${randomUUID()},1000,${receiver})`;
  const stableProofDigest="b".repeat(64);
  // Binding is a one-way, merchant-authorized operation. Rotating signing keys
  // cannot redirect the top-up lookup to a different financial payment.
  const bindProof=(actorId=actor,digest=stableProofDigest)=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT briofold_ai_topup_bind_proof(${workspace},${actorId},${recoveryTopup},${digest}) AS digest`;
  });
  equal((await bindProof())[0].digest,stableProofDigest);
  equal((await bindProof())[0].digest,stableProofDigest);
  await reject(()=>bindProof(actor,"c".repeat(64)),"23505");
  await reject(()=>bindProof(actor,"not-a-sha-256"),"22023");
  await reject(()=>bindProof(otherActor),"42501");
  await reject(()=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_projection`;
   return tx`SELECT briofold_ai_topup_bind_proof(${workspace},${actor},${recoveryTopup},${stableProofDigest})`;
  }),"42501");
  const paymentContext=await db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT * FROM briofold_ai_topup_payment_context(${workspace},${actor},${recoveryTopup})`;
  });
  equal([paymentContext[0].receiving_workspace_id,Number(paymentContext[0].amount_minor),paymentContext[0].checkout_token_digest],
   [receiver,1000,stableProofDigest]);
  const claimBatch=()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_projection`;return tx`SELECT briofold_ai_topup_claim_pending() AS items`;});
  const batches=await Promise.all(Array.from({length:4},claimBatch));
  equal(batches.flatMap(x=>x[0].items).filter(x=>x.id===recoveryTopup).length,1);
  equal(batches.flatMap(x=>x[0].items).find(x=>x.id===recoveryTopup)?.checkout_token_digest,stableProofDigest);
  equal((await claimBatch())[0].items.length,0);
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  const recover=()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_projection`;return tx`SELECT briofold_ai_topup_credit_proof(${workspace},${recoveryTopup},${recoveryProof},1000) AS result`;});
  const recovered=await Promise.all(Array.from({length:12},recover));
  equal(recovered.filter(x=>x[0].result.credited).length,1);equal(await balance(),[2000,0]);
  await reject(()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_runtime`;return tx`SELECT briofold_ai_topup_credit_proof(${workspace},${recoveryTopup},${recoveryProof},1000)`;}),"42501");
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  const executionKey=randomUUID(),fp="a".repeat(64),encryptedFixture=Buffer.alloc(32,7);
  const beginExecution=(key,fingerprint=fp,w=workspace,a=actor,thread=null)=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT briofold_ai_request_begin(${w},${a},${key},${model},${fingerprint},600,${thread}) AS result`;
  });
  const completeExecution=(key,input=1000,cached=0,output=100,ref="fixture-"+key)=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT briofold_ai_request_complete(${workspace},${key},${ref},${input},${cached},${output},${encryptedFixture}) AS result`;
  });
  const failExecution=(key,release,ref="")=>db.begin(async tx=>{
   await tx`SET LOCAL ROLE ekmivo_financial_runtime`;
   return tx`SELECT briofold_ai_request_fail(${workspace},${key},${ref},${release})`;
  });
  const started=await Promise.all(Array.from({length:12},()=>beginExecution(executionKey)));
  equal(started.filter(x=>x[0].result.fresh).length,1);equal(await balance(),[1976,24]);
  equal(started[0][0].result.tariff.id,second);
  await Promise.all(Array.from({length:12},()=>completeExecution(executionKey)));
  equal(await balance(),[1997,0]);
  equal((await beginExecution(executionKey))[0].result.state,"completed");equal(await balance(),[1997,0]);
  const duplicateGeneration=randomUUID();await beginExecution(duplicateGeneration);
  await reject(()=>completeExecution(duplicateGeneration,1000,0,100,"fixture-"+executionKey),"23505");
  await failExecution(duplicateGeneration,false,"fixture-"+executionKey);
  // An authoritative zero-token cache result may complete without a second debit.
  await completeExecution(duplicateGeneration,0,0,0,"fixture-"+executionKey);equal(await balance(),[1997,0]);
  await reject(()=>beginExecution(executionKey,"b".repeat(64)),"23505");
  await reject(()=>beginExecution(randomUUID(),fp,workspace,otherActor),"42501");
  await reject(()=>completeExecution(executionKey,1001),"23505");
  const third=(await publish(randomUUID(),second,{...terms,input_minor_per_million:9000}))[0].id;
  equal((await beginExecution(executionKey))[0].result.tariff.id,second);
  const rejectedKey=randomUUID();await beginExecution(rejectedKey);
  await Promise.all(Array.from({length:8},()=>failExecution(rejectedKey,true)));
  equal((await beginExecution(rejectedKey))[0].result.state,"released");equal(await balance(),[1997,0]);
  const uncertainKey=randomUUID();await beginExecution(uncertainKey);await failExecution(uncertainKey,false,"fixture-uncertain");
  equal((await beginExecution(uncertainKey))[0].result.state,"unknown");equal(await balance(),[1903,94]);
  await reject(()=>failExecution(uncertainKey,true),"23505");
  await reject(()=>completeExecution(uncertainKey,10001,0,100,"fixture-uncertain"),"22023");
  equal(await balance(),[1903,94]);
  await db`DELETE FROM workspace_members WHERE workspace_id=${workspace} AND user_id=${actor}`;
  // Completing accepted work is independent of the initiating user's later access.
  await completeExecution(uncertainKey,1000,0,100,"fixture-uncertain");equal(await balance(),[1987,0]);
  await db`INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(${workspace},${actor},'owner')`;
  const requestKeys=Array.from({length:25},()=>randomUUID());
  const parallel=await Promise.allSettled(requestKeys.map(key=>beginExecution(key)));
  equal(parallel.filter(x=>x.status==="fulfilled").length,20);
  equal(parallel.filter(x=>x.status==="rejected"&&x.reason.code==="54000").length,5);
  await Promise.all(requestKeys.filter((_,i)=>parallel[i].status==="fulfilled").map(key=>failExecution(key,true)));
  equal(await balance(),[1987,0]);
  const [connection]=await db`SELECT inbox_connection(${workspace},'live','ms',${"meter-"+workspace},decode('abcd','hex')) AS id`;
  await db`SELECT inbox_ingest(${connection.id},'meter-incoming','meter-customer','Fictional meter customer','Hello','text',now())`;
  const [thread]=await db`SELECT id FROM inbox_threads WHERE connection_id=${connection.id}`;
  const threadKey=randomUUID();await beginExecution(threadKey,fp,workspace,actor,thread.id);
  await reject(()=>beginExecution(randomUUID(),fp,workspace,actor,thread.id),"54000");
  await reject(()=>beginExecution(randomUUID(),fp,receiver,otherActor,thread.id),"42501");
  await db`UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=${thread.id}`;
  await reject(()=>beginExecution(randomUUID(),fp,workspace,actor,thread.id),"42501");
  await completeExecution(threadKey);equal(await balance(),[1977,0]);
  equal((await db`SELECT count(*)::int AS n FROM inbox_messages WHERE thread_id=${thread.id} AND sender='ai'`)[0].n,0);
  await reject(()=>beginExecution(randomUUID(),fp,receiver,otherActor),"P0001");
  equal((await db`SELECT count(*)::int AS n FROM briofold_ai_executions WHERE workspace_id=${receiver}`)[0].n,0);
  // Zero AI credit must not block permitted HUMAN replies. Queue only: no
  // provider delivery or invented payment/AI completion is asserted here.
  const [manualChannel]=await db`SELECT inbox_connection(${receiver},'live','ms',${"zero-credit-"+receiver},decode('abcd','hex')) AS id`;
  await db`SELECT inbox_ingest(${manualChannel.id},'zero-credit-incoming','zero-credit-contact','Fictional human-only contact','Hello','text',now())`;
  const [manualThread]=await db`SELECT id FROM inbox_threads WHERE connection_id=${manualChannel.id}`;
  const manualKey=randomUUID(),manualBody={text:"Synthetic manual reply",idempotency_key:manualKey,reader_kind:"user"};
  const sendManual=()=>db`SELECT inbox_action(${receiver},'live',${otherActor},${manualThread.id},'send',${db.json(manualBody)}) AS item`;
  const human=await sendManual();equal(human[0].item.state,"queued");equal(human[0].item.sender,"seller");
  equal((await sendManual())[0].item.id,human[0].item.id);
  equal((await db`SELECT count(*)::int AS n FROM inbox_messages WHERE thread_id=${manualThread.id} AND sender='seller'`)[0].n,1);
  equal(Number((await db`SELECT coalesce((SELECT available_minor FROM briofold_ai_wallets WHERE workspace_id=${receiver}),0) AS n`)[0].n),0);
  equal((await db`SELECT count(*)::int AS n FROM briofold_ai_executions WHERE workspace_id=${receiver}`)[0].n,0);
  equal((await db`SELECT enabled FROM workspace_product_access WHERE workspace_id=${receiver} AND product='payments'`)[0].enabled,true);

  equal((await db`SELECT current_version FROM briofold_ai_tariff_catalog WHERE model=${model}`)[0].current_version,third);
  await reject(()=>db.begin(async tx=>{await tx`SET LOCAL ROLE ekmivo_financial_runtime`;return tx`SELECT * FROM briofold_ai_executions`;}),"42501");
  const waiveKey=randomUUID(),waiverOp=randomUUID(),reason="Synthetic unresolved provider timeout credit waiver";
  const waive=(key=waiveKey,op=waiverOp,why=reason,a=actor)=>db`SELECT briofold_ai_admin_waive(${a},${workspace},${key},${op},${why}) AS result`;
  await beginExecution(waiveKey);await failExecution(waiveKey,false,"fixture-waived");
  equal(await balance(),[1883,94]);
  await reject(()=>waive(waiveKey,waiverOp,reason,otherActor),"42501");
  for(const role of ["ekmivo_financial_runtime","ekmivo_financial_projection"]){
   await reject(()=>db.begin(async tx=>{await tx.unsafe("SET LOCAL ROLE "+role);return tx`SELECT briofold_ai_admin_waive(${actor},${workspace},${waiveKey},${waiverOp},${reason})`;}),"42501");
  }
  const waivers=await Promise.all(Array.from({length:12},()=>waive()));
  equal(waivers.filter(x=>!x[0].result.replayed).length,1);equal(await balance(),[1977,0]);
  equal((await beginExecution(waiveKey))[0].result.state,"waived");
  equal((await db`SELECT usage,waiver_reason FROM briofold_ai_executions WHERE workspace_id=${workspace} AND request_key=${waiveKey}`)[0],{usage:null,waiver_reason:reason});
  await reject(()=>completeExecution(waiveKey,1000,0,100,"fixture-waived"),"23505");
  await failExecution(waiveKey,false);equal(await balance(),[1977,0]);
  await reject(()=>waive(waiveKey,randomUUID()),"23505");
  await reject(()=>waive(waiveKey,waiverOp,reason+" changed"),"23505");
  await reject(()=>waive(executionKey,randomUUID()),"23505");
  const staleKey=randomUUID();await beginExecution(staleKey);
  await reject(()=>waive(staleKey,randomUUID()),"23505");
  await db`UPDATE briofold_ai_executions SET created_at=now()-interval '6 minutes' WHERE workspace_id=${workspace} AND request_key=${staleKey}`;
  await waive(staleKey,randomUUID());equal(await balance(),[1977,0]);
  const raceKey=randomUUID();await beginExecution(raceKey);await failExecution(raceKey,false);
  const race=await Promise.allSettled([completeExecution(raceKey),waive(raceKey,randomUUID())]);
  equal(race.filter(x=>x.status==="fulfilled").length,1);
  const outcome=(await beginExecution(raceKey))[0].result;
  equal(["completed","waived"].includes(outcome.state),true);
  equal(await balance(),[outcome.state==="completed"?1967:1977,0]);
  console.log(`Briofold prepaid wallet PASS: ${count} actual PostgreSQL assertions; synthetic fixtures only`);
  return count;
 }finally{await db.end({timeout:3});}
}
