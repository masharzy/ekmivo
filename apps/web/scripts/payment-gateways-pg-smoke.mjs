// 0272 payment gateways and 0273 gateway accounts on a fresh database of the disposable CI PostgreSQL only,
// never production or a shared Neon branch. Stand-in financial tables, the real
// migration applied twice (it must be safe to re-run), then the SQL assertions.
import {readFileSync} from "node:fs";
import postgres from "postgres";
const urlText=process.env.PG00_TEST_DATABASE_URL;
if(!urlText)throw Error("Missing isolated CI PostgreSQL URL");
const u=new URL(urlText);
if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||u.pathname!=="/ekmivo_pg00")
 throw Error("Refusing non-ephemeral or remote database");
const opts={ssl:false,max:1,prepare:false,connect_timeout:8,onnotice:()=>{}};
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
const name="ekmivo_gateways_smoke";
const admin=postgres(urlText,opts);
await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
await admin.unsafe(`CREATE DATABASE ${name}`);
const db=postgres(new URL("/"+name,u).toString(),opts);
try{
 await db.unsafe(read("tools/testing/sql/payment-gateways-stub.sql"));
 const files=["0272_payment_gateways.sql","0273_gateway_accounts.sql","0274_payment_review_cases.sql"];
 for(let run=0;run<2;run++)for(const f of files)await db.unsafe(read("infra/migrations/"+f));
 for(const [test,done] of [["payment-gateways-test.sql","payment gateways 0272: all checks passed"],
  ["gateway-accounts-test.sql","gateway accounts 0273: all checks passed"],
  ["payment-review-test.sql","payment review 0274: all checks passed"]]){
  const result=await db.unsafe(read("tools/testing/sql/"+test));
  if([].concat(result).flat().at(-1)?.result!==done)throw Error(test+": assertions did not finish");
 }
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 for(const f of files)if(reg.split('"'+f+'"').length-1!==2)throw Error(f+" must be registered for both financial realms");
 console.log("0272-0274 payment gateways OK: applied twice, all assertions passed");
}finally{
 await db.end();
 await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
 await admin.end();
}
