import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL("../src/"+p,import.meta.url),"utf8");
test("Official step 1: amount box and summary on the left, same in the editor preview",()=>{
 const c=src("components/gateway-checkout.tsx"),p=src("lib/checkout-preview.ts"),css=src("components/gateway-checkout.css");
 for(const s of ["gw-mer","gw-pay","gw-sum","gw-h"]){assert.ok(c.includes('className="'+s),s);assert.ok(p.includes('class=\\"'+s),"preview "+s)}
 assert.match(css,/\.gw-pay\{background:#EAF2FF/);
 assert.ok(p.includes(".gw-pay{background:#EAF2FF"),"preview css");
});
test("request drawer: amount and status first, no backend jargon",()=>{
 const d=src("components/payment-request-detail.tsx");
 assert.ok(!d.includes("payment allocation"));
 assert.match(d,/কাস্টমার নম্বর দিয়েছেন/);
});
test("refunds page says when a refund is needed",()=>{
 assert.match(src("components/payment-refunds.tsx"),/রিফান্ড কখন লাগে\?/);
});
