import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root = new URL("../../",import.meta.url);
async function source(path){return readFile(new URL(path,root),"utf8")}

test("physical phone registration is distinct from stable source enrollments",async()=>{
 const migration=await source("infra/migrations/0045_pg06_physical_phone_multi_account.sql");
 assert.match(migration,/CREATE TABLE pg06_phones/);
 assert.match(migration,/physical_phone_id uuid/);
 assert.match(migration,/pg06_phone_claim/);
 assert.match(migration,/pg06_phone_attach/);
 assert.match(migration,/pg06_phone_detach/);
 assert.match(migration,/UPDATE pg06_devices SET physical_phone_id=id/);
 assert.match(migration,/WHERE physical_phone_id=phone_id/);
 assert.match(migration,/FORCE ROW LEVEL SECURITY/);
});
test("scoped full receiving number is decrypted only after workspace management check",async()=>{
 const handler=await source("backend/internal/checkout/physical_devices.go");
 assert.match(handler,/pipelineSession\(r,ws,realm,true\)/);
 assert.match(handler,/pg06_phone_account_cipher/);
 assert.match(handler,/merchantwebhook.Decrypt/);
 assert.match(handler,/account_label/);
});
test("checkout displays canonical server destination in full with accessible copy",async()=>{
 const publicGo=await source("backend/internal/checkout/public_realm.go");
 const checkout=await source("apps/web/src/components/checkout-experience.tsx");
 assert.match(publicGo,/data\["destination"\] = number/);
 assert.match(checkout,/data-testid="checkout-receiving-number"/);
 assert.match(checkout,/navigator\.clipboard\.writeText\(info\.destination\)/);
 assert.match(checkout,/if\(!info\?\.destination\)return/);
 assert.doesNotMatch(checkout,/destination\.slice\(-4\)/);
});
test("signed receipt events cannot be rerouted to a new account while queued",async()=>{
 const android=await source("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/ReceiptSyncWorker.kt");
 assert.match(android,/val boundID=queued.optString\("enrollment_id"\)/);
 assert.match(android,/ReceiptTransport\.post\(applicationContext,action,boundID,next\.first,next\.second\)/);
 assert.match(android,/store\.nextEligible\(\)/);
 assert.match(android,/store\.ownsEnrollment\(boundID\)/);
 assert.match(android,/queued\.optBoolean\("physical_forward"\)/);
 assert.match(android,/QUEUED_ASSOCIATION_REVOKED/);
 const store=await source("apps/mobile/app/src/main/java/com/ekmivo/mobile/receipt/ReceiptStore.kt");
 assert.match(store,/if\(count\(\)>0\s*\|\|\s*stagingCount>0\)/);
 assert.match(store,/PENDING_RECEIPTS_BLOCK_DISCONNECT/);
 assert.match(store,/fun revokeCredentials\(id:String\)/);
 assert.match(store,/fun adoptLegacyPhone/);
});
test("one physical phone card pairs once without merchant parser or SIM binding fields",async()=>{
 const wrapper=await source("apps/web/src/components/payment-phone-management.tsx");
 assert.match(wrapper,/export \{PaymentPhoneManagement\} from "\.\/sms-devices"/);
 const page=await source("apps/web/src/components/sms-devices.tsx");
 assert.match(page,/active\.map\(p=>/);
 assert.match(page,/phones\.filter\(p=>!p\.revoked_at\)/);
 assert.doesNotMatch(page,/p\.account_count|account_count\??:/);
 assert.match(page,/Create pairing QR|একটি ফোন একবারই পেয়ার করুন/);
 assert.doesNotMatch(page,/accounts\.filter\(permitted\)|parser_id|sms:1 \/ package|Save selected account bindings/);
 const forwarder=await source("backend/internal/checkout/phone_forward.go");
 assert.match(forwarder,/handlePhoneForward/);
 assert.match(forwarder,/SELECT pg06_phone_candidate\(\$1::uuid/);
 assert.match(forwarder,/Multiple matching attempts intentionally yield no receiving attribution/);
 const candidateMigration=await source("infra/migrations/0047_pg06_phone_forwarder.sql");
 assert.match(candidateMigration,/CREATE FUNCTION pg06_phone_candidate_accounts/);
 const migration=await source("infra/migrations/0047_pg06_phone_forwarder.sql");
 assert.match(migration,/CREATE TABLE pg06_phone_forwarded/);
 assert.match(migration,/captured_version<>p.config_version/);
 assert.match(migration,/verification_pending/);
});
