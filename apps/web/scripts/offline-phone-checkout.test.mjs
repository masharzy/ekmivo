import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

test("0264: checkout is not refused only because the SMS phone is offline (flag)",()=>{
 const sql=read("infra/migrations/0264_offline_phone_checkout.sql");
 assert.ok(sql.includes("current_setting('briofold.offline_checkout',true)"),"reads the per-connection setting");
 assert.ok(sql.includes("IF position('briofold_offline_checkout()' IN d)>0 THEN RETURN; END IF;"),"safe to run twice");
 assert.ok(sql.includes("inspect before applying 0264"),"stops if a function is not the expected one");
 for(const sig of ["briofold_payment_intent_insert(","pg10_lock_route(","pg98_lock_account(","pg10_public_payment_sources(","pg10_checkout_view("])
  assert.ok(sql.includes("patch_offline('"+sig),sig);
 assert.ok(sql.includes("INTO online;'"),"the real online state stays honest");
 assert.ok(!sql.includes("pg110_public_workspace_accounts'"),"source_online is not changed");
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 assert.equal(reg.split('"0264_offline_phone_checkout.sql"').length-1,2,"both financial realms");
 const go=read("backend/internal/checkout/receipt_pipeline.go");
 assert.ok(go.includes('os.Getenv("BRIOFOLD_OFFLINE_CHECKOUT_ENABLED") == "true"'));
 assert.ok(go.includes('config.ConnConfig.RuntimeParams["briofold.offline_checkout"] = "on"'));
});
