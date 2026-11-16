import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

test("0261: Recheck finds SMS from the phone forwarder as well as legacy devices",()=>{
 const sql=read("infra/migrations/0261_sms_recheck_phone_forwarder.sql");
 assert.ok(sql.includes("FROM pg06_transport WHERE workspace_id=w AND environment=e AND id=resource_id),(SELECT observation_id FROM pg06_phone_forwarded WHERE workspace_id=w AND environment=e AND id=resource_id))"));
 assert.ok(sql.includes("IF position(new_lookup IN d)>0 THEN RETURN; END IF;"),"safe to run twice");
 assert.ok(sql.includes("RAISE EXCEPTION 'Unknown pg09_action reprocess branch"),"stops if the function is not the expected one");
 const list=read("infra/migrations/0056_phone_incoming_and_late_refund_reports.sql");
 assert.ok(list.includes("FROM pg06_phone_forwarded f"),"the SMS list includes phone-forwarded ids");
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 assert.equal(reg.split('"0261_sms_recheck_phone_forwarder.sql"').length-1,2,"both financial realms");
});

test("link editor shows a sentence for every known refusal, not a raw code",()=>{
 const go=read("backend/internal/checkout/service.go");
 for(const c of ["PAYMENT_LINK_DELETED","RETURN_URL_NOT_REGISTERED","PAYMENT_IN_PROGRESS"])assert.ok(go.includes(`"${c}"`),c);
 assert.ok(go.includes('log.Printf("Financial check refused: %q", pg.Message)'));
 const ui=read("apps/web/src/components/payment-documents.tsx");
 for(const c of ["LOCKED_OR_EXPIRED","PAYMENT_LINK_DELETED","RETURN_URL_NOT_REGISTERED","PAYMENT_IN_PROGRESS"])assert.ok(ui.includes(c+":["),c);
 assert.ok(ui.includes("documentErrorMessage(code,bn)"));
});
