import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {unifiedDestination,unifiedFinancialDetailPath} from "../src/lib/unified-navigation.ts";

const src=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const id="123e4567-e89b-42d3-a456-426614174000";

test("Phase 9 financial details resolve only through explicit UUID routes",()=>{
 const allowed=[
  ["payments",["transactions",id],"transactions"],
  ["payments",["links",id],"payment-links"],
  ["payments",["refunds",id],"refunds"],
  ["payments",[id],"transactions"],
  ["sms-data",[id],"incoming"],
  ["invoices",[id],"invoices"],
  ["customers",["financial",id],"customers"],
  ["settings",["payment-methods",id],"gateways"],
  ["settings",["devices",id],"devices"],
  ["settings",["webhooks",id],"webhooks"],
  ["settings",["activity",id],"events"],
 ];
 for(const [root,view,section] of allowed){
  for(const mode of ["commerce","both"]){
   assert.deepEqual(unifiedDestination(mode,root,view),{section,service:"payments",detailId:id},`${mode}/${root}/${view.join("/")}`);
  }
  assert.equal(unifiedDestination("ai",root,view),null,`AI-only business leaked ${root}`);
  assert.equal(unifiedDestination("off",root,view),null,`Disabled business leaked ${root}`);
 }
 for(const root of ["payments","sms-data","invoices","customers","settings"]){
  for(const unsafe of ["not-a-uuid","__proto__","constructor","%2e%2e"]){
   assert.equal(unifiedDestination("both",root,["transactions",unsafe]),null);
   assert.equal(unifiedDestination("both",root,[unsafe]),null);
  }
  assert.equal(unifiedDestination("both",root,["transactions",id,"extra"]),null);
 }
});

test("All canonical finance-source detail links round-trip into their authorized route",()=>{
 const destinations={
  payments:"/payments/transactions",incoming:"/sms-data",gateways:"/settings/payment-methods",
  devices:"/settings/devices",webhooks:"/settings/webhooks",events:"/settings/activity",
  deliveries:"/settings/webhooks",customers:"/customers/financial",invoices:"/invoices",
  "payment-links":"/payments/links",refunds:"/payments/refunds",
 };
 for(const [kind,prefix] of Object.entries(destinations)){
  const path=unifiedFinancialDetailPath(kind,id);
  assert.equal(path,`${prefix}/${id}`);
  const [root,...view]=path.slice(1).split("/");
  assert.equal(unifiedDestination("commerce",root,view)?.detailId,id,kind);
 }
 assert.equal(unifiedFinancialDetailPath("payments","not-an-id"),null);
 assert.equal(unifiedFinancialDetailPath("invoices","../private"),null);
 const source=src("components/payment-operations.tsx");
 assert.match(source,/canonicalRoutes\?unifiedFinancialDetailPath\(resource,id\)/);
 assert.match(source,/rowHref\(row\)/);
 const docs=src("components/payment-documents.tsx");
 assert.match(docs,/canonicalRoutes\?unifiedFinancialDetailPath\(kind,selectedDocument\.id\)/);
 const dashboard=src("components/dashboard-content.tsx");
 assert.match(dashboard,/<PaymentOperations canonicalRoutes=\{canonicalRoutes\}/);
 assert.match(dashboard,/<PaymentDocuments canonicalRoutes=\{canonicalRoutes\}/);
});

test("Phase 9 continues to use server-selected tenant and realm, not IDs in the URL",()=>{
 const route=src("components/unified-merchant-route.tsx");
 assert.match(route,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(route,/paymentContextFor\(workspace,user\.id,undefined\)/);
 assert.match(route,/detailId=\{detailId\}/);
 const content=src("components/dashboard-content.tsx");
 assert.match(content,/detailId&&service==="payments"&&paymentContext/);
 assert.match(content,/PaymentOperations[\s\S]*?detailId=\{detailId\}/);
 assert.match(content,/PaymentDocuments[\s\S]*?detailId=\{detailId\}/);
 assert.match(content,/PaymentRefunds[\s\S]*?detailId=\{detailId\}/);
 assert.doesNotMatch(route,/searchParams.*environment/);
});

test("Order finance links navigate to source detail but never assert paid or COD as payment",()=>{
 const commerce=src("components/commerce-workspace.tsx");
 assert.match(commerce,/"\/payments\/transactions"/);
 assert.match(commerce,/"\/invoices"/);
 assert.match(commerce,/"\/payments\/refunds"/);
 assert.match(commerce,/f\.kind==="payment"/);
 assert.match(commerce,/This packing slip is not a financial invoice or payment receipt/);
 const detail=src("components/dashboard-content.tsx");
 assert.match(detail,/section==="transactions"\?"payments":section/);
 assert.doesNotMatch(detail,/markPaid|setPaid|manualVerify/);
});

test("Canonical payment links expose existing one-time intents without requiring reusable-link entitlement",()=>{
 const content=src("components/dashboard-content.tsx");
 const route=readFileSync(new URL("../src/app/[locale]/payments/[[...view]]/page.tsx",import.meta.url),"utf8");
 const unified=src("components/unified-merchant-route.tsx");
 const requests=src("components/payment-requests.tsx");
 assert.equal(unifiedDestination("both","payments",["links"])?.section,"payment-links");
 assert.equal(unifiedDestination("both","payments",["links","requests"]) ,null,"UI mode must not become a second financial detail route");
 assert.match(content,/oneTimeRequests=canonicalRoutes&&service==="payments"&&section==="payment-links"/);
 assert.match(content,/initialQuery\.view==="requests"\|\|planFeatures\?\.payment_links!==true/);
 assert.match(content,/!oneTimeRequests&&!planFeatures\?\.\[feature\]/);
 assert.match(content,/dashboardInitialData\(workspace\.id,paymentContext\.environment,"requests"/);
 assert.match(content,/<PaymentRequests hideTabs/);
 assert.match(content,/href="\/payments\/links\?view=requests"/);
 assert.match(route,/paymentLinksMode=\{query\.view==="requests"\?"requests":undefined\}/);
 assert.match(unified,/initialQuery=\{root==="payments"&&view\[0\]==="links"&&paymentLinksMode==="requests"\?\{view:"requests"\}:\{\}\}/);
 assert.match(requests,/hideTabs=false/);
 assert.match(requests,/!hideTabs&&<div className="tabs">/);
});
