import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
test("Briofold onboarded paid plan goes to live billing confirmation, not an inert hash",()=>{
 const action=read("actions/briofold-onboarding.ts");
 const billing=read("components/payment-billing.tsx");
 assert.match(action,/settings\/billing\?tab=plans&plan=/);
 assert.match(billing,/searchParams\.get\("plan"\)/);
 assert.match(billing,/selected\.id!==data\.effective\?\.plan_id/);
 assert.match(billing,/setChoice\(\{plan:selected,renew:false\}\)/);
 assert.match(billing,/router\.replace\("\/settings\/billing\?tab=plans"/);
 assert.doesNotMatch(action,/billing#plan-/);
});
test("AI-only and Both selection preserve the chosen value",()=>{
 const ui=read("components/briofold-onboarding-client.tsx");
 assert.match(ui,/defaultChecked=\{x\.key===mode\}/);
 const submit=read("actions/briofold-onboarding.ts");
 assert.match(submit,/payment_plan_public\(\)/);
 assert.match(submit,/selected\.terms\.kind==="free"/);
 assert.match(submit,/step==="billing"/);
});
test("Prepaid AI must fail closed by default and use server verified money",()=>{
 const summary=read("components/briofold-ai-credit-summary.tsx");
 const wallet=read("lib/server/briofold-ai-wallet.ts");
 assert.match(summary,/BRIOFOLD_AI_TOPUPS_ENABLED/);
 assert.match(summary,/wallet\.status==="unavailable"/);
 assert.match(wallet,/workspace_members WHERE workspace_id/);
});
