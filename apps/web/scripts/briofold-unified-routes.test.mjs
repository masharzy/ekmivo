import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {readFileSync,existsSync} from "node:fs";
const at=(path)=>new URL("../src/"+path,import.meta.url);
const source=(path)=>readFileSync(at(path),"utf8");

test("all nine canonical merchant entry routes exist independently of /w workspace slugs",()=>{
 assert.ok(existsSync(at("app/[locale]/dashboard/page.tsx")));
 for(const root of ["inbox","orders","payments","sms-data","invoices","customers","reports","settings"])
  assert.ok(existsSync(at(`app/[locale]/${root}/[[...view]]/page.tsx`)),`Missing canonical route: ${root}`);
});
test("navigation has exactly nine clean, prefixed-free merchant entries",()=>{
 const src=source("lib/unified-navigation.ts");
 for(const path of ["/dashboard","/inbox","/orders","/payments","/sms-data","/invoices","/customers","/reports","/settings"])
  assert.ok(src.includes(`href:"${path}"`),`Missing nav href ${path}`);
 assert.equal((src.match(/href:"\/(dashboard|inbox|orders|payments|sms-data|invoices|customers|reports|settings)"/g)||[]).length,9);
 assert.doesNotMatch(src,/href:"\/(?:bn|en|w)\//);
 assert.match(src,/view\.length>1/);
 assert.match(src,/mode==="off"/);
});
test("authorized business context and realm resolution are server-side",()=>{
 const src=source("components/unified-merchant-route.tsx");
 assert.match(src,/requireUser\(locale\)/);
 assert.match(src,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(src,/paymentContextFor\(workspace,user\.id,undefined\)/);
 assert.match(src,/if\(!destination\)notFound\(\)/);
 assert.match(src,/<AppShell unified/);
 const action=source("actions/unified-business.ts");
 assert.match(action,/currentUser\(\)/);
 assert.match(action,/selectDefaultWorkspace\(user\.id,workspaceId\)/);
 assert.doesNotMatch(action,/selectDefaultWorkspace\(.*request\.userId/);
});
test("global marketing header and footer do not render on unified application routes",()=>{
 for(const cssless of ["components/site-header.tsx","components/site-footer.tsx","proxy.ts"]){
  const src=source(cssless);
  assert.match(src,/dashboard\|inbox\|orders\|payments\|sms-data\|invoices\|customers\|reports\|settings/,`Missing route exclusion: ${cssless}`);
 }
});
test("settings uses opt-in CSS module and preserves legacy payment screens",()=>{
 const src=source("components/unified-settings-index.tsx");
 assert.match(src,/unified-settings-index\.module\.css/);
 assert.match(src,/enabledUnifiedService\(mode,item\.service\)/);
 const layout=source("app/[locale]/w/[workspaceId]/[section]/layout.tsx");
 assert.match(layout,/AppShell/);
 const frame=source("components/dashboard-frame.tsx");
 assert.match(frame,/unified\?"/);
 assert.match(frame,/data-service=\{unified\?"payments":service\}/);
 assert.match(frame,/!unified&&service==="payments"/);
});

test("simplified Payments has no request or reconciliation user-facing tab",()=>{
 const nav=source("lib/unified-navigation.ts");
 const tabs=source("components/unified-section-tabs.tsx");
 const links=source("components/payment-documents.tsx");
 assert.doesNotMatch(nav,/requests:\{section:"requests"/);
 assert.doesNotMatch(nav,/reconciliation:\{section:"reconciliation"/);
 const paymentTabs=tabs.split(" payments:[")[1]?.split(" customers:[")[0]??"";
 assert.ok(paymentTabs.includes("/payments/links"));
 assert.doesNotMatch(paymentTabs,/\/payments\/(?:requests|incoming|invoices|reconciliation)/);
 assert.doesNotMatch(links,/className="tabs"><button className="on">\{t\("Payment links"/);
 assert.match(nav,/href:"\/sms-data"/);
 assert.match(nav,/href:"\/invoices"/);
});

const navigation={};
runInNewContext(ts.transpileModule(source("lib/unified-navigation.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:navigation});
test("AI-only device settings use generic pairing while payment devices preserve their existing adapter",()=>{
 const ai=navigation.unifiedDestination("ai","settings",["devices"]);
 assert.equal(ai.kind,"devices");assert.equal(ai.service,"ai");
 const payments=navigation.unifiedDestination("commerce","settings",["devices"]);
 assert.equal(payments.service,"payments");assert.equal(payments.kind,undefined);
 const both=navigation.unifiedDestination("both","settings",["devices"]);
 assert.equal(both.service,"payments");assert.equal(both.kind,"mixed-devices");
 assert.equal(navigation.unifiedDestination("off","settings",["devices"]),null);
 assert.equal(navigation.unifiedDestination("ai","settings",["payment-methods"]),null);
 const device=navigation.unifiedSettings.flatMap(g=>g.items).find(item=>item.slug==="devices");
 assert.equal(navigation.enabledUnifiedService("ai",device.service),true);
});
test("Inbox secondary navigation keeps canonical channel and device URLs",()=>{
 const inbox=source("components/workspace-inbox.tsx");
 assert.match(inbox,/href="\/settings\/channels"/);assert.match(inbox,/href="\/settings\/devices"/);
 assert.doesNotMatch(inbox,/href=\{`\/w\//);
});

test("canonical resolver rejects inherited names and unknown routes for every business mode",()=>{
 const invalid=["constructor","__proto__","prototype","toString","valueOf","hasOwnProperty","missing"];
 for(const mode of ["ai","commerce","both","off"]){
  for(const root of navigation.unifiedNavigation.map(item=>item.key)){
   for(const segment of invalid)assert.equal(navigation.unifiedDestination(mode,root,[segment]),null,mode+"/"+root+"/"+segment);
   assert.equal(navigation.unifiedDestination(mode,root,["devices","extra"]),null);
  }
  for(const root of invalid)assert.equal(navigation.unifiedDestination(mode,root,[]),null);
 }
});
test("canonical product gates cover all roots, settings and valid subroutes",()=>{
 for(const mode of ["ai","commerce","both","off"]){
  for(const item of navigation.unifiedNavigation){
   const result=navigation.unifiedDestination(mode,item.key,[]);
   assert.equal(Boolean(result),navigation.enabledUnifiedService(mode,item.service),mode+"/"+item.key);
   if(result){assert.equal(typeof result.section,"string");assert.ok(["ai","payments"].includes(result.service));}
  }
  for(const group of navigation.unifiedSettings)for(const item of group.items){
   const result=navigation.unifiedDestination(mode,"settings",[item.slug]);
   const enabled=!item.external&&navigation.enabledUnifiedService(mode,item.service);
   assert.equal(Boolean(result),enabled,mode+"/settings/"+item.slug);
  }
 }
 for(const part of ["transactions","links","refunds"]){
  assert.equal(navigation.unifiedDestination("ai","payments",[part]),null);
  for(const mode of ["commerce","both"])assert.equal(navigation.unifiedDestination(mode,"payments",[part]).service,"payments");
 }
 for(const part of ["comments","saved-replies","tickets","agent-desk"]){
  assert.equal(navigation.unifiedDestination("commerce","inbox",[part]),null);
  for(const mode of ["ai","both"])assert.equal(navigation.unifiedDestination(mode,"inbox",[part]).service,"ai");
 }
});
