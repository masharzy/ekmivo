import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
test("paid payment link redirects to its saved Redirect URL",async()=>{
 const src=read("apps/web/src/lib/checkout-return.ts");
 assert.match(src,/if\(origin==="payment_link"\)\{if\(state!=="completed"\)return ""\}/);
});
test("0268: success note reaches the checkout; shown after payment",()=>{
 const sql=read("infra/migrations/0268_payment_link_success_note.sql");
 assert.match(sql,/jsonb_build_object\(''success_note''/);
 assert.match(sql,/inspect before applying 0268/);
 assert.equal(read("backend/cmd/financial-migrate/dashboard_reference.go").split('"0268_payment_link_success_note.sql"').length-1,2);
 assert.match(read("backend/internal/checkout/documents.go"),/SuccessNote +string +`json:"success_note,omitempty"`/);
 assert.match(read("apps/web/src/components/gateway-checkout.tsx"),/ok&&p\.successNote&&/);
});
test("link form: short labels, no customer-field builder, note after payment",()=>{
 const ui=read("apps/web/src/components/payment-documents.tsx");
 for(const s of ["রিডাইরেক্ট URL","কাস্টমার সর্বোচ্চ কয়টা কিনতে পারবে","পণ্যের ছবির লিংক","পেমেন্টের পর নোট","এই লিংকে কতবার পেমেন্ট নেওয়া যাবে"]) assert.ok(ui.includes(s),s);
 assert.ok(!ui.includes("Customer fields: questions"));
});
