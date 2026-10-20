import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../../../",import.meta.url);
const source=(path)=>readFileSync(new URL(path,root),"utf8");

// A stacked PR merge must never silently drop a *previously approved*
// financial migration or its matching Go purchase/recovery implementation.
test("Immutable AI payment proof binding survives every future integration merge",()=>{
 const sql=source("infra/migrations/0131_briofold_ai_topup_proof_binding.sql");
 const purchase=source("backend/internal/checkout/ai_credit_topup.go");
 const recovery=source("backend/internal/checkout/ai_credit_recovery.go");
 const walletSmoke=source("apps/web/scripts/briofold-wallet-smoke.mjs");
 const recoveryTests=source("backend/internal/checkout/ai_credit_recovery_test.go");
 const purchaseTests=source("backend/internal/checkout/ai_credit_topup_test.go");
 assert.match(sql,/ALTER TABLE briofold_ai_topups ADD COLUMN checkout_token_digest/);
 assert.match(sql,/CREATE FUNCTION briofold_ai_topup_bind_proof/);
 assert.match(sql,/CREATE FUNCTION briofold_ai_topup_payment_context/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION briofold_ai_topup_claim_pending/);
 assert.match(sql,/checkout_token_digest IS NOT NULL/);
 assert.match(purchase,/briofold_ai_topup_bind_proof/);
 assert.match(purchase,/briofold_ai_topup_payment_context/);
 assert.match(purchase,/proofDigest\)\.Scan\(&proofRaw/);
 assert.match(recovery,/purchase\.ProofDigest/);
 assert.doesNotMatch(recovery,/service\.token\(purchase\.Receiver/);
 assert.match(walletSmoke,/0131_briofold_ai_topup_proof_binding\.sql/);
 assert.match(walletSmoke,/briofold_ai_topup_bind_proof/);
 assert.match(recoveryTests,/recoveryDigest/);
 assert.match(purchaseTests,/TestAICreditProofDigestValidation/);
});
