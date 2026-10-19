import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=(path)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
test("public /pay uses workspace brand, configured provider choices and single idempotent checkout",()=>{
 const s=source("apps/web/src/components/public-document.tsx");
 assert.match(s,/doc\.merchant_name/);
 assert.match(s,/doc\?\.brand\?\.support_url/);
 assert.match(s,/doc\?\.configured_methods/);
 assert.match(s,/readyMethods\.includes\(m\)/);
 assert.match(s,/data-ready=\{readyMethods\.includes\(m\)\}/);
 assert.match(s,/ProviderMark method=\{m\}/);
 assert.match(s,/Idempotency-Key/);
 assert.match(s,/router\.push\("\/checkout\/"\+d\.checkout_token\+"\?method="\+selected\)/);
 assert.doesNotMatch(s,/SiteHeader|SiteFooter/);
 assert.match(s,/disabled=\{locked\|\|terminal\}/);
 assert.match(s,/disabled=\{locked\|\|terminal\|\|!selectedReady\|\|payable<=0\}/);
 assert.match(s,/disabled=\{busy\|\|terminal\|\|!selectedReady\|\|payable<=0\}/);
 assert.match(s,/if\(busy\|\|!doc\|\|!selected\|\|!doc\.methods\?\.includes\(selected\)/);
 assert.doesNotMatch(s,/View order details|customer-pay-details/);
});
test("public /checkout has payer lock, actual receiver and auto verification but no email consent",()=>{
 const s=source("apps/web/src/components/checkout-experience.tsx");
 assert.match(s,/ProviderMark method=\{selectedMethod\}/);
 assert.match(s,/const canonical=normalizeBangladeshPayer\(payer\)/);
 assert.match(s,/if\(!canonical\)/);
 assert.match(s,/payer_number:canonical,method/);
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
 // Public /pay and /checkout are locale-rewritten without application chrome.
 assert.match(proxy,/target\.pathname="\/"\+locale\+path/);
 assert.match(proxy,/if\(\/\^\\\/\(\?:workspaces\|w\|account\|admin\)/);
 const checkout=source("apps/web/src/components/checkout-experience.tsx");
 const document=source("apps/web/src/components/public-document.tsx");
 assert.match(checkout,/pg05-standalone/);
 assert.match(document,/data-customer-checkout="true"/);
 assert.doesNotMatch(document,/SiteHeader|SiteFooter/);
});

test("dashboard does not declare every live workspace unready from an environment string",()=>{
 const s=source("apps/web/src/components/dashboard-frame.tsx");
 assert.match(s,/service==="payments"&&environment==="sandbox"/);
 assert.doesNotMatch(s,/Live payments are not enabled|Receiving sources, devices, APIs and security checks are pending/);
});

test("public provider discovery shows all supported wallets without making unready methods payable",()=>{
 const doc=source("apps/web/src/components/public-document.tsx");
 const checkout=source("apps/web/src/components/checkout-experience.tsx");
 assert.match(doc,/const methods=payMethods;/);
 assert.match(doc,/!configured.includes\(m\)/);
 assert.match(doc,/!selectedReady\|\|payable<=0/);
 assert.match(checkout,/const tiles=payMethods.flatMap/);
 assert.match(checkout,/\!info.methods.includes\(tile.method\)/);
 assert.match(checkout,/methodChosen&&!availableSelected/);
 assert.match(checkout,/const showPayer=.*availableSelected/);
});
