// 0272 payment gateways on a fresh database of the disposable CI PostgreSQL only,
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
 const migration=read("infra/migrations/0272_payment_gateways.sql");
 await db.unsafe(migration);
 await db.unsafe(migration);
 const result=await db.unsafe(read("tools/testing/sql/payment-gateways-test.sql"));
 const last=[].concat(result).flat().at(-1);
 if(last?.result!=="payment gateways 0272: all checks passed")throw Error("assertions did not finish");
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 if(reg.split('"0272_payment_gateways.sql"').length-1!==2)throw Error("0272 must be registered for both financial realms");
 console.log("0272 payment gateways OK: applied twice, all assertions passed");
}finally{
 await db.end();
 await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);
 await admin.end();
}
