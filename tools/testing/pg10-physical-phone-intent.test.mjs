import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
test("0049 live intent supports physical phone but not unpaired/revoked/unhealthy phones",()=>{
 const sql=readFileSync(new URL("../../infra/migrations/0049_pg10_physical_phone_intent.sql",import.meta.url),"utf8");
 assert.match(sql,/pg10_intent\(/);
 assert.match(sql,/pg06_phones p/);
 assert.match(sql,/p\.workspace_id=a\.workspace_id AND p\.environment=a\.environment/);
 assert.match(sql,/p\.claimed_at IS NOT NULL AND p\.revoked_at IS NULL/);
 assert.match(sql,/p\.permission_ok AND p\.heartbeat_at>now\(\)-interval '20 minutes'/);
 assert.match(sql,/c\.disabled_at IS NULL/);
 assert.match(sql,/pg06_devices d/);
 assert.match(sql,/pg06_phone_forwarded/);
 assert.match(sql,/pg10_checkout_view\(text\)/);
 assert.match(sql,/financial_idempotency/);
 assert.match(sql,/PERFORM pg06_scope\(w,e\)/);
 assert.doesNotMatch(sql,/UPDATE payment_intents|DELETE FROM payment_/);
});
