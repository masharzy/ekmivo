import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
test("Onboarding preserves the chosen paid plan through the dedicated summary, not a billing hash",()=>{
 const action=read("actions/briofold-onboarding.ts");
 const billing=read("components/payment-billing.tsx");
 const subscribe=read("app/[locale]/subscribe/[plan]/route.ts");
 assert.match(action,/redirect\("\/subscribe\/"\+encodeURIComponent\(plan\)\)/);
 assert.match(subscribe,/\/checkout\/order\/\$\{encodeURIComponent\(plan\)\}/);
 assert.match(subscribe,/onboardingState\(workspace,user\.id\)/);
 assert.match(billing,/searchParams\.get\("plan"\)/);
 assert.match(billing,/selected\.id!==data\.effective\?\.plan_id/);
 assert.match(billing,/setChoice\(\{plan:selected,renew:false\}\)/);
 assert.match(billing,/router\.replace\(pathname\+"\?tab=plans"/);
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
 assert.match(wallet,/FROM workspace_members m JOIN workspace_product_access p/);
 assert.match(wallet,/m\.workspace_id=\$\{workspaceId\}::uuid AND m\.user_id=\$\{actorId\}::uuid/);
 assert.match(wallet,/m\.role IN \('owner','admin'\)/);
 assert.match(wallet,/pg13_capability_override/);
});

test("Bengali setup shows localized errors for every known onboarding failure",()=>{
 const action=read("actions/briofold-onboarding.ts");
 const client=read("components/briofold-onboarding-client.tsx");
 const reasons=[
  "Business unavailable.",
  "Your selected business changed. Refresh setup and try again.",
  "Invalid setup step.",
  "Check your business name and type.",
  "Choose AI, Payments, or Both.",
  "Invalid plan selection.",
  "Store profile unavailable.",
  "Service configuration unavailable.",
  "Business services changed. Refresh setup.",
  "Choose an available plan.",
  "Owner access required.",
  "This setup changed. Refresh and try again.",
  "Could not save setup. Check the details and retry.",
 ];
 for(const message of reasons){
  assert.ok(action.includes(message),`Action error contract changed: ${message}`);
  assert.ok(client.includes(JSON.stringify(message)+":"),`Missing Bengali error translation: ${message}`);
 }
 assert.match(client,/setupErrorBn\[result\.message\]\?\?result\.message/);
 assert.match(client,/role="alert"/);
});
