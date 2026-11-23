import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

test("0265: customer proof is stored only; never verifies or completes a payment",()=>{
 const sql=read("infra/migrations/0265_payment_proofs.sql");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS briofold_payment_proofs/);
 assert.match(sql,/jsonb_array_length\(images\)<=5/,"at most 5 photos");
 assert.match(sql,/IF st IN \('completed','cancelled'\) THEN RAISE EXCEPTION 'PROOF_NOT_ALLOWED'/,"expired checkouts still accept proof");
 assert.match(sql,/seen_at=NULL/,"a new submission is new again for the dashboard badge");
 assert.doesNotMatch(sql,/pg05_complete|INSERT INTO pg05_intent_events|amount_minor\s*=/,"no payment state or amount change");
 assert.match(sql,/\^payment-proofs\/\[0-9a-f-\]\{36\}\\\.jpg\$/,"only our own object keys");
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 assert.equal(reg.split('"0265_payment_proofs.sql"').length-1,2,"both financial realms");
});

test("API: flag, re-encoded photos in R2 under payment-proofs/",()=>{
 const go=read("backend/internal/checkout/public_proofs.go");
 assert.match(go,/BRIOFOLD_PAYMENT_PROOFS_ENABLED/);
 assert.match(go,/jpeg\.Encode/);
 assert.match(go,/"payment-proofs\/" \+ id \+ "\.jpg"/);
 const main=read("backend/cmd/api/main.go");
 assert.match(main,/"POST \/v1\/public\/checkout\/\{token\}\/proof\/\{part\}"/);
});

test("checkout: offline notice, one-minute notice, always-on TrxID and photo upload",()=>{
 const panel=read("apps/web/src/components/payment-proof-panel.tsx");
 assert.match(panel,/অটোমেটিক যাচাই এই মুহূর্তে সম্ভব হচ্ছে না/);
 assert.match(panel,/\{!offline&&!expired&&!status\.submitted&&/,"owner: shown at once, no one-minute wait");
 assert.match(panel,/type="file" accept="image\/jpeg,image\/png,image\/\*" multiple/);
 assert.match(panel,/if\(r\.status===404\)\{setAvailable\(false\)/,"hidden while the flag is off");
 const page=read("apps/web/src/components/checkout-experience.tsx");
 assert.equal(page.split("<PaymentProofPanel").length-1,4,"themed and classic, waiting and expired");
 assert.match(read("deploy/vps/set-flag.sh"),/BRIOFOLD_PAYMENT_PROOFS_ENABLED/);
});
