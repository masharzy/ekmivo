import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
test("0267: editing an active payment link refreshes what customers see",()=>{
 const sql=read("infra/migrations/0267_payment_link_edit_snapshot.sql");
 assert.match(sql,/action=''correct'' OR \(res=''payment-links'' AND d\.status=''active''\)/);
 assert.match(sql,/inspect before applying 0267/);
 assert.equal(read("backend/cmd/financial-migrate/dashboard_reference.go").split('"0267_payment_link_edit_snapshot.sql"').length-1,2);
});
test("payment link options say what they do",()=>{
 const ui=read("apps/web/src/components/payment-documents.tsx");
 for(const s of ["পেমেন্টের পর কাস্টমারকে যেখানে পাঠানো হবে","১ হলে পরিমাণের ঘর দেখাবে না","কাস্টমার পেমেন্ট পেজে দেখবে","শুধু আপনি আর আপনার টিম দেখবে","লিংকটা মোট কতবার পরিশোধ করা যাবে"]) assert.ok(ui.includes(s),s);
});
