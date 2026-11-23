import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
test("0266: a minute-precision SMS matches inside the minute the number was entered",()=>{
 const sql=read("infra/migrations/0266_sms_same_minute_match.sql");
 assert.match(sql,/WHEN precision_name='minute' THEN date_trunc\('minute',window_start\)/);
 for(const [sig,n] of [["pg06_phone_candidate(",2],["pg07_candidates(",2],["pg07_match(",8],["pg11_late_phone_receipt_case(",2],["pg61_transaction_lookup(",1],["financial_verify_payment_fields(",2]])
  assert.ok(sql.includes("patch_minute('"+sig)&&sql.includes(")',"+n+");"),sig);
 assert.match(sql,/inspect before applying 0266/,"stops on unexpected function text");
 assert.equal(read("backend/cmd/financial-migrate/dashboard_reference.go").split('"0266_sms_same_minute_match.sql"').length-1,2);
});
