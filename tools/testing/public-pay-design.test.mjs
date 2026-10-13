import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=(path)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
test("public /pay uses workspace brand, configured provider choices and single idempotent checkout",()=>{
 const s=source("apps/web/src/components/public-document.tsx");
 assert.match(s,/doc\.merchant_name/);
 assert.match(s,/doc\.brand\?\.support_url/);
 assert.match(s,/doc\.configured_methods/);
 assert.match(s,/doc\.methods\?\.includes\(m\)/);
 assert.match(s,/ProviderMark method=\{m\}/);
 assert.match(s,/Idempotency-Key/);
 assert.match(s,/checkout\/"\+d\.checkout_token\+"\\?method=/);
 assert.doesNotMatch(s,/SiteHeader|SiteFooter/);
});
test("public /checkout has payer lock, actual receiver and auto verification but no email consent",()=>{
 const s=source("apps/web/src/components/checkout-experience.tsx");
 assert.match(s,/ProviderMark method=\{selectedMethod\}/);
 assert.match(s,/payer_number:payer,method/);
 assert.match(s,/info\.destination/);
 assert.match(s,/checkout-receiving-number/);
 assert.match(s,/setInterval/);
 assert.match(s,/CustomerRefundRequest/);
 assert.doesNotMatch(s,/ReceiptNotice|Receipt by email|notice_available&&/);
});
test("document method discovery never sends receiving numbers and requires finance realm scope",()=>{
 const go=source("backend/internal/checkout/documents.go");
 const sql=source("infra/migrations/0050_pg10_public_methods.sql");
 assert.match(go,/pg10_public_payment_sources\(\$1::uuid,\$2\)/);
 assert.match(go,/s\.pipelineScoped/);
 assert.match(go,/s\.liveMethods\(sourceBytes\)/);
 assert.match(sql,/PERFORM pg06_scope\(w,e\)/);
 assert.match(sql,/c\.disabled_at IS NULL/);
 assert.match(sql,/p\.claimed_at IS NOT NULL AND p\.revoked_at IS NULL AND p\.permission_ok/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.pg10_public_payment_sources/);
 assert.doesNotMatch(sql,/number_cipher|plain_number|payer_hmac|encrypted_evidence/);
});
test("provider colors and no marketing header in standalone routes",()=>{
 const css=source("apps/web/src/app/customer-pay.css");
 const proxy=source("apps/web/src/proxy.ts");
 assert.match(css,/--provider-accent:#e60d6c/);
 assert.match(css,/--provider-accent:#cd1223/);
 assert.match(css,/--provider-accent:#81218a/);
 assert.match(proxy,/pay\|checkout/);
});
