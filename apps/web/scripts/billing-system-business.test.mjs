import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

// 0105 refuses every quote for the platform's own business ('invalid activation choice'),
// so its plan modal could only say "current price unavailable". Owner hit this 2026-11-16.
test("system business is told why instead of getting a dead plan modal",()=>{
 const route=read("src/app/[locale]/subscribe/[plan]/route.ts");
 assert.ok(route.includes('platform_billing_system_workspace(${id}::uuid)')&&route.includes("/pricing?purchase=SYSTEM_WORKSPACE"));
 assert.ok(read("src/app/[locale]/pricing/page.tsx").includes('query.purchase==="SYSTEM_WORKSPACE"'));
 const billing=read("src/components/payment-billing.tsx");
 assert.ok(billing.includes("if(data.effective?.platform_billing===true){"));
 assert.ok(billing.includes("code==='SOURCE_NOT_FOUND'"),"quote failures give a reason");
});
test("billing follows the OS dark theme like the rest of the dashboard",()=>{
 const css=read("src/components/billing-reference.css");
 assert.ok(css.includes('@media(prefers-color-scheme:dark){html:not([data-theme="light"]):not([data-theme="dark"]) .ref-billing{'));
});
