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
  for(const name of ["0123_briofold_business_onboarding.sql","0124_briofold_ai_prepaid_wallet.sql","0125_briofold_ai_verified_topups.sql","0126_briofold_ai_topup_runtime_access.sql"]){
   await db.unsafe(await readFile(new URL("../../../infra/migrations/"+name,import.meta.url),"utf8")).simple();
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
  console.log(`Briofold prepaid wallet PASS: ${count} actual PostgreSQL assertions; synthetic fixtures only`);
  return count;
 }finally{await db.end({timeout:3});}
}
