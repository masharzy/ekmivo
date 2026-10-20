import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const root=new URL("../../../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");

test("migration 0131 is installed by real wallet smoke and preserves immutable top-up locator",()=>{
 const path="infra/migrations/0131_briofold_ai_topup_proof_binding.sql";
 assert.ok(existsSync(new URL(path,root)),"MISSING PAYMENT-PROOF MIGRATION: check integration branch history");
 const sql=read(path);
 assert.match(sql,/ADD COLUMN checkout_token_digest text/);
 assert.match(sql,/briofold_ai_topup_bind_proof/);
 assert.match(sql,/briofold_ai_topup_payment_context/);
 assert.match(sql,/checkout_token_digest IS NOT NULL/);
 assert.match(sql,/top-up locator cannot change/);
 assert.match(read("apps/web/scripts/briofold-wallet-smoke.mjs"),/0131_briofold_ai_topup_proof_binding.sql/);
});
test("API binds ORIGINAL financial token digest before financial intent creation",()=>{
 const source=read("backend/internal/checkout/ai_credit_topup.go");
 const binding=source.indexOf("briofold_ai_topup_bind_proof");
 const write=source.indexOf("pg13_platform_checkout_create");
 assert.ok(binding>=0&&write>binding,"proof must be bound before issuing the financial checkout");
 assert.match(source,/briofold_ai_topup_payment_context/);
 assert.match(source,/SELECT pg13_platform_payment\(\$1\),pg05_checkout_view\(\$1\)->>'state'/);
 assert.doesNotMatch(source,/digest\(cap\)\)\.Scan\(&proofRaw/);
});
test("background recovery uses bound payment proof, never current signing key",()=>{
 const source=read("backend/internal/checkout/ai_credit_recovery.go");
 assert.match(source,/purchase\.ProofDigest/);
 assert.match(source,/validAICreditProofDigest\(purchase\.ProofDigest\)/);
 assert.doesNotMatch(source,/digest\(service\.token\(/);
 assert.match(read("backend/internal/checkout/ai_credit_recovery_test.go"),/recoveryDigest/);
});
