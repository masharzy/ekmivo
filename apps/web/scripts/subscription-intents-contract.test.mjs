import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newPurchaseSecret,derivePurchaseToken,purchaseCreationKey,purchaseDigest,validPurchaseCapability} from "../src/lib/purchase-capability.ts";
const source=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
test("random guest secrets and derived capabilities are high entropy and URL-safe",()=>{
 const g1=newPurchaseSecret(),g2=newPurchaseSecret(),key="e6Ky_"+"7f".repeat(20);
 assert.equal(g1.length,43);
 assert.notEqual(g1,g2);
 const token=derivePurchaseToken(g1,key);
 assert.equal(token.length,43);
 assert.ok(validPurchaseCapability(token));
 assert.match(purchaseDigest(token),/^[a-f0-9]{64}$/);
});
test("lost response and concurrent retry derive the same token only for same guest and key",()=>{
 const guest=newPurchaseSecret(),otherGuest=newPurchaseSecret(),key="purchase_key_20261022_001";
 const first=derivePurchaseToken(guest,key);
 assert.equal(first,derivePurchaseToken(guest,key));
 assert.equal(purchaseCreationKey(guest,key),purchaseCreationKey(guest,key));
 assert.notEqual(first,derivePurchaseToken(otherGuest,key));
 assert.notEqual(first,derivePurchaseToken(guest,key+"x"));
 assert.notEqual(purchaseCreationKey(guest,key),purchaseCreationKey(otherGuest,key));
});
test("short, malformed and forged guest secrets cannot generate purchase capabilities",()=>{
 for(const invalid of ["", "fake", "a".repeat(128),"🙂".repeat(43)]){
  assert.throws(()=>derivePurchaseToken(invalid,"purchase_key_20261022_001"));
  assert.equal(validPurchaseCapability(invalid),false);
 }
 assert.throws(()=>derivePurchaseToken(newPurchaseSecret(),"short"));
});
test("checkout preview cannot issue an unverified paid invoice",()=>{
 const summary=source("app/[locale]/checkout/order/[plan]/page.tsx");
 const module=source("lib/server/purchase-intents.ts");
 const migration=readFileSync(new URL("../../infra/migrations/0148_phase4_durable_purchase_intents.sql",import.meta.url),"utf8");
 assert.match(summary,/purchaseEnabled=\{false\}/);
 assert.match(module,/status='selected'/);
 assert.match(module,/payment_plan_claim_free/);
 assert.doesNotMatch(module,/dashboard_billing_issue|checkout_token|pg10_intent\(/);
 assert.match(migration,/public_token_sha256/);
 assert.match(migration,/guest_session_sha256/);
 assert.match(migration,/claimed_free/);
});
test("OAuth/login and Store setup have one continuation point",()=>{
 const sourceCode=source("app/[locale]/workspaces/open/page.tsx");
 assert.match(sourceCode,/activePurchase\(\)/);
 assert.match(sourceCode,/subscribe\/resume/);
 const route=source("app/[locale]/subscribe/resume/[token]/route.ts");
 assert.match(route,/resumePurchase/);
 assert.doesNotMatch(route,/returnUrl|callbackUrl|redirect_uri/);
});
