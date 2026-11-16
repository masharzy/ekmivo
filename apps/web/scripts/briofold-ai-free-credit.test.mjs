import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../../../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");

test("free AI credit: ৳30 fixed in SQL, once per business and once per user, journaled",()=>{
 const sql=read("infra/migrations/0259_briofold_ai_free_credit.sql");
 assert.ok(sql.includes("amount constant bigint := 3000;"),"৳30 in paisa, decided by the database");
 assert.ok(sql.includes("operation_key='free-credit:'||w::text"),"one per business");
 assert.ok(sql.includes("kind='free_grant' AND actor_id=a"),"one per user");
 assert.ok(sql.includes("m.role IN('owner','admin')")&&sql.includes("product='ai' AND enabled"),"owner/admin of an AI-enabled business");
 assert.ok(sql.includes("pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0))"),"same wallet lock as top-ups");
 assert.ok(sql.includes("IF position('free_grant' IN def)>0 THEN RETURN;"),"safe to run twice");
 assert.ok(read("backend/cmd/financial-migrate/dashboard_reference.go").includes('"0259_briofold_ai_free_credit.sql"'));
});

test("free claim and ৳20 minimum are enforced on the server, behind their own flag",()=>{
 const go=read("backend/internal/checkout/ai_credit_topup.go");
 assert.ok(go.includes('os.Getenv("BRIOFOLD_AI_FREE_CREDIT_ENABLED") != "true"'));
 assert.ok(go.includes("const aiTopupMinimumMinor = 2000"));
 assert.ok(go.includes("req.Amount < aiTopupMinimumMinor"));
 assert.ok(!/\$3|amount_minor.*free_credit_claim/.test(go.match(/briofold_ai_free_credit_claim\([^)]*\)/)[0]),"client sends no amount for free credit");
 const proxy=read("apps/web/src/app/api/go/[...path]/route.ts");
 assert.ok(proxy.includes("ai-credits\\/(?:purchase|free|"));
});

test("dashboard shows Free once and uses the ৳20 minimum",()=>{
 const ui=read("apps/web/src/components/briofold-ai-topup-controls.tsx");
 assert.ok(ui.includes("export const AI_TOPUP_MIN_TAKA=20;"));
 assert.ok(ui.includes("min={AI_TOPUP_MIN_TAKA}")&&!ui.includes('min="10"'));
 assert.ok(ui.includes("/ai-credits/free")&&ui.includes("r.status===409"));
 const summary=read("apps/web/src/components/briofold-ai-credit-summary.tsx");
 assert.ok(summary.includes('freeEnabled={free.enabled&&!wallet.entries.some(e=>e.kind==="free_grant")} freeAmountMinor={free.amountMinor}'));
 const lib=read("apps/web/src/lib/server/ai-free-credit.ts");
 assert.ok(lib.includes('process.env.BRIOFOLD_AI_FREE_CREDIT_ENABLED!=="true"')&&lib.includes("enabled:s.amountMinor>0"),"flag and a non-zero amount are both required");
 assert.ok(read("apps/web/src/components/briofold-ai-statement.tsx").includes('free_grant:["Free credit","ফ্রি ক্রেডিট"]'));
});

test("admin yearly discount only fills an exact price; the saved price stays the admin's number",async()=>{
 const src=read("apps/web/src/components/admin-subscription-offers.tsx");
 const body=src.match(/export function yearlyFromDiscount[\s\S]*?\n}\n/)[0]
  .replace("export ","").replace("(monthlyBdt:string,percent:string):string|null","(monthlyBdt,percent)");
 const yearlyFromDiscount=new Function(body+"return yearlyFromDiscount;")();
 assert.equal(yearlyFromDiscount("399","16.7"),"3988.40");
 assert.equal(yearlyFromDiscount("399","0"),"4788.00");
 assert.equal(yearlyFromDiscount("999.50","10"),"10794.60");
 assert.equal(yearlyFromDiscount("399","95"),null);
 assert.equal(yearlyFromDiscount("abc","10"),null);
 assert.ok(src.includes('name="price_bdt"')&&src.includes("value={price}"),"the exact price field is still what is submitted");
 assert.ok(src.includes("yearlyDiscountPercent(offers,v)"),"each yearly version shows its discount against the published monthly price");
});

test("0260: Super Admin sets the free amount; claim reads it; 0 means off; audited",()=>{
 const sql=read("infra/migrations/0260_briofold_ai_free_credit_setting.sql");
 assert.ok(sql.includes("CHECK (amount_minor BETWEEN 0 AND 50000)"),"৳0 to ৳500");
 assert.ok(sql.includes("p.role='super_admin'")&&sql.includes("ERRCODE='42501'"));
 assert.ok(sql.includes("ERRCODE='40001'"),"stale edits are rejected");
 assert.ok(sql.includes("INSERT INTO platform_admin_audit")&&sql.includes("'ai_free_credit.change'"));
 assert.ok(sql.includes("amount := briofold_ai_free_credit_amount();")&&sql.includes("'reason','DISABLED'"));
 assert.ok(sql.includes("coalesce((SELECT amount_minor FROM briofold_ai_free_credit_versions ORDER BY revision DESC LIMIT 1),3000)"),"no row keeps the 0259 amount");
 assert.ok(read("backend/cmd/financial-migrate/dashboard_reference.go").includes('"0260_briofold_ai_free_credit_setting.sql"'));
 const route=read("apps/web/src/app/api/admin/ai-free-credit/route.ts");
 assert.ok(route.includes("requireFreshSuperAdmin")&&route.includes("Number(taka) * 100")&&route.includes("Number(taka) > 500"));
 assert.ok(read("backend/internal/checkout/ai_credit_topup.go").includes('"AI_FREE_CREDIT_DISABLED"'));
 const page=read("apps/web/src/components/admin-catalog-page.tsx");
 assert.ok(page.includes("<AdminAiFreeCredit ")&&page.includes('migration="0260_briofold_ai_free_credit_setting.sql"'));
 const admin=read("apps/web/src/components/admin-ai-free-credit.tsx");
 assert.ok(admin.includes('className="pa-surface pa-admin-credit-form"')&&!/style=\{/.test(admin),"existing admin classes only");
});
