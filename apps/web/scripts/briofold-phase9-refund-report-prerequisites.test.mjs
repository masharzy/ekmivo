import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../../../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");

test("refund report's late receipt source must exist before 0056 is installed in a financial realm",()=>{
 const migration=read("infra/migrations/0056_phone_incoming_and_late_refund_reports.sql");
 const prior=read("infra/migrations/0051_pg06_late_sms_refund.sql");
 assert.match(migration,/r\.source_intent_id/);
 assert.match(prior,/ALTER TABLE pg11_refunds ADD COLUMN source_intent_id uuid;/);
 assert.match(prior,/ALTER TABLE pg11_refunds ADD COLUMN source_observation_id uuid;/);
 const smoke=read("apps/web/scripts/pg04-financial-smoke.mjs");
 const publicMethod=smoke.indexOf('"../../../infra/migrations/0050_pg10_public_methods.sql"');
 const earlier=smoke.indexOf('"../../../infra/migrations/0051_pg06_late_sms_refund.sql"');
 const later=smoke.indexOf('"0056_phone_incoming_and_late_refund_reports.sql"');
 assert.ok(publicMethod>=0&&earlier>publicMethod&&later>earlier,
  "disposable financial fixture must install 0050 → 0051 → 0056 in order");
 assert.match(smoke,/const migrationDB=postgres\(ds\(`ekmivo_pg04_\$\{realm\}`,`ekmivo_pg04_migrate_\$\{realm\}`/);
 const phoneSetup=smoke.slice(smoke.indexOf("// PG06 additive physical identity migration"),smoke.indexOf("// Reference phases 2–4"));
 for(const [file,variable] of [["0045_pg06_physical_phone_multi_account.sql","sql"],
  ["0047_pg06_phone_forwarder.sql","forwardSQL"],
  ["0086_phone_reconnect_delete.sql","lifecycleSQL"],
  ["0088_financial_phone_forward_column.sql","forwardRepair"]]){
  assert.match(phoneSetup,new RegExp(`await migrationDB\\.unsafe\\(${variable}\\)\\.simple\\(\\)`));
  assert.ok(phoneSetup.includes(file),`${file} missing from migration-owner setup`);
 }
 assert.match(phoneSetup,/phoneOwnership\.installed&&phoneOwnership\.migration_owned/);
 assert.match(smoke,/if\(!lateRefundColumn\)await migrationDB\.unsafe/);
 assert.match(smoke,/if\(!installed\)await migrationDB\.unsafe/);
 assert.match(smoke,/finally\{await migrationDB\.end/);
 assert.match(smoke,/Phase9 late-SMS refund source missing in disposable/);
});

test("operator-gated 0056 migrator fails closed on a financial realm without 0051 columns",()=>{
 const source=read("backend/cmd/financial-migrate/phone_incoming_reports.go");
 assert.match(source,/attname IN \('source_intent_id','source_observation_id'\)/);
 assert.match(source,/count\(\*\)=2/);
 assert.match(source,/if err!=nil\|\|actual!=realm\|\|!prerequisites\|\|!owner/);
 assert.match(source,/if installed\{return nil\}/);
 assert.ok(source.indexOf("if err!=nil||actual!=realm||!prerequisites||!owner")<source.indexOf("if installed{return nil}"),
  "an installed but invalid 0056 was accepted before prerequisites were checked");
});
