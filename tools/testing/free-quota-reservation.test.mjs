import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");

test("Free limit increases are the only plan edits auto-applied to subscribers",()=>{
 const sql=file("infra/migrations/0112_free_plan_quota_increase_subscriber_upgrade.sql");
 assert.match(sql,/before_terms->>'kind'<>'free'/);
 assert.match(sql,/after_terms->>'kind'<>'free'/);
 assert.match(sql,/after_terms - 'payment_limit'/);
 assert.match(sql,/after_terms->>'payment_limit'\)::bigint > \(before_terms->>'payment_limit'\)::bigint/);
 assert.match(sql,/WHERE sub.plan_id=NEW.plan_id AND sub.plan_version_id=OLD.current_version/);
 assert.match(sql,/revision=sub.revision\+1/);
 assert.doesNotMatch(sql,/UPDATE payment_allowance_slots/i);
});

test("Expired reservations release without changing monetary evidence",()=>{
 const sql=file("infra/migrations/0113_expired_payment_allowance_release.sql");
 const worker=file("backend/internal/checkout/maintenance_worker.go");
 assert.match(sql,/state='reserved' AND s.expires_at<=now\(\)/);
 assert.match(sql,/FOR UPDATE OF s SKIP LOCKED/);
 assert.match(sql,/state='released'/);
 assert.match(sql,/batch_size>500/);
 assert.match(worker,/payment_allowance_reconcile_expired\(200\)/);
 assert.doesNotMatch(sql,/(DELETE FROM|TRUNCATE|UPDATE financial_allocations|UPDATE financial_payments)/i);
});

test("Money parsing stays integer-paisa and legacy amount_minor stays supported",()=>{
 const service=file("backend/internal/checkout/service.go");
 const tests=file("backend/internal/checkout/simple_create_test.go");
 assert.match(service,/minor := whole \* 100/);
 assert.match(service,/body.Amount = minor/);
 assert.match(service,/json:"amount_minor"/);
 assert.match(tests,/TestSimpleCreateDefaultsAndLegacyCompatibility/);
 assert.match(tests,/TestMerchantShopRejectsConflictingAliases/);
});
