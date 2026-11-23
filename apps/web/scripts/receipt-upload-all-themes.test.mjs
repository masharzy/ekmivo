import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL("../src/"+p,import.meta.url),"utf8");
test("receipt upload in every theme, above the cancel button; no TrxID box",()=>{
 const gw=src("components/gateway-checkout.tsx");
 assert.ok(gw.indexOf('{p.proof&&<div className="gw-proof ng">{p.proof}</div>}<div className="ng-act">')>0,"nagad: above cancel");
 assert.ok(gw.indexOf('{p.proof&&<div className="gw-proof">{p.proof}</div>}<div className="act">')>0,"bkash/rocket: above cancel");
 assert.match(src("components/checkout-experience.tsx"),/proof=\{themeStep==='waiting'\|\|themeStep==='expired'\?<PaymentProofPanel/);
 const panel=src("components/payment-proof-panel.tsx");
 assert.ok(!panel.includes('aria-label="Transaction ID"'),"no TrxID box");
 assert.match(panel,/type="file"/);
 const page=src("components/checkout-experience.tsx");
 assert.equal(page.split('skin="themed"').length-1,2);
 assert.equal(page.split('skin="gateway"').length-1,1);
});
test("editor preview: upload sample in all waiting screens, 4-minute timer, real desktop width",()=>{
 const pv=src("lib/checkout-preview.ts");
 assert.equal(pv.split('pp-mock pp-').length-1,4);
 assert.ok(pv.includes("remaining:4*60")&&!pv.includes("5*60"));
 assert.match(src("components/checkout-themes.tsx"),/const DESKTOP_W=1280/);
});
test("checkout: after sending, 'sent' and no more uploads unless rejected",()=>{
 const panel=src("components/payment-proof-panel.tsx");
 assert.match(panel,/const sent=status\.submitted&&status\.state!=="rejected"/);
 assert.match(panel,/\{sent&&!picked\.length\?<div className=\{styles\.sent\}/);
});
test("dashboard: separate Receipts tab with a badge, list, photos and reject",()=>{
 assert.match(src("components/unified-section-tabs.tsx"),/href:"\/payments\/receipts"/);
 assert.match(src("components/unified-section-tabs.tsx"),/<ReceiptsBadge/);
 assert.match(src("lib/unified-navigation.ts"),/receipts:\{section:"transactions",service:"payments",kind:"payment-receipts"\}/);
 assert.match(src("app/api/go/[...path]/route.ts"),/payment-proofs\(\?:\\\/\[0-9a-f-\]\{36\}\\\/\(\?:seen\|reject\)\)\?\$/);
 const page=src("components/payment-receipts.tsx");
 assert.match(page,/\/api\/payment-proofs\//);
 assert.ok(!/approve/i.test(page.replace(/Approving|approved|Approved/g,"")),"approve is a later step");
 const mig=readFileSync(new URL("../../../infra/migrations/0270_payment_proof_review.sql",import.meta.url),"utf8");
 assert.ok(!/INSERT INTO financial_(payments|allocations)/.test(mig),"0270 never pays a checkout");
});
