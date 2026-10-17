// PG02 navigation/locale/environment invariants run with actual TS modules
// transpiled in memory: no mock merchant/financial records or network access.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(relative,dependencies={}){
 const source=await readFile(new URL(relative,import.meta.url),"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 vm.runInNewContext(js,{exports,require:(id)=>{
  if(!Object.hasOwn(dependencies,id))throw Error("Unexpected dependency "+id);
  return dependencies[id];
 }},{filename:relative,timeout:5000});
 return exports;
}
const sections=await load("../src/lib/dashboard-sections.ts");
const nav=await load("../src/lib/dashboard-navigation.ts",{"./dashboard-sections":sections});
const id="11111111-1111-4111-a111-111111111111";
assert.equal(nav.defaultService("both"),"payments","Both-enabled merchants must enter Payment first");
assert.equal(nav.defaultService("commerce"),"payments");
assert.equal(nav.defaultService("ai"),"ai");
assert.equal(nav.serviceEnabled("payments","ai"),false);
assert.equal(nav.serviceEnabled("ai","commerce"),false);
assert.equal(nav.serviceEnabled("payments","both"),true);
assert.equal(nav.dashboardHref("bn",id,"payments"),`/w/${id}/payments/overview`);
assert.equal(nav.dashboardHref("en",id,"payments","incoming","live"),`/w/${id}/payments/incoming`);
assert.equal(nav.dashboardHref("bn",id,"ai","inbox","live"),`/w/${id}/ai/inbox`);
for(const candidate of ["production","LIVE","Sandbox","..","live&foo=1","sandbox%2Flive"]){
 assert.equal(nav.canonicalEnvironment(candidate),null,"Untrusted environment query must reject "+candidate);
}
assert.equal(nav.canonicalEnvironment(null),"live");
assert.equal(nav.canonicalEnvironment(""),"live");
assert.equal(nav.canonicalEnvironment("live"),"live");
assert.equal(nav.canonicalEnvironment("sandbox"),"sandbox");
assert.equal(nav.sectionInService("ai","inbox"),true);
assert.equal(nav.sectionInService("payments","inbox"),false);
assert.equal(nav.sectionInService("payments","requests"),true);
for(const product of ["ai","payments"]){
 for(const group of nav.navigation[product]){
  for(const key of group.items){
   assert.ok(sections.sections[key]?.en && sections.sections[key]?.bn,`Missing EN/BN menu key: ${product}/${key}`);
  }
 }
 const all=new Set(nav.navigation[product].flatMap(group=>group.items));
 for(const key of nav.searchableNavigation(product,"")){
  for(const item of key.items)assert.ok(all.has(item));
 }
}
assert.ok(nav.searchableNavigation("payments","receipts").length>0);
assert.ok(nav.searchableNavigation("payments","আসা").length>0);
assert.equal(nav.searchableNavigation("payments","inbox").length,0,"Record/product search must not escape active product");

const memberships=[
 {id:"allowed-workspace-1",name:"অগ্রযাত্রা Shop",mode:"both",role:"owner"},
 {id:"allowed-workspace-2",name:"North Studio",mode:"ai",role:"viewer"}
];
assert.equal(nav.searchableBusinesses(memberships,"").length,0,"Blank global query must not enumerate all businesses");
assert.equal(nav.searchableBusinesses(memberships,"north")[0].id,memberships[1].id,"Search is constrained to supplied memberships");
assert.equal(nav.searchableBusinesses(memberships,"অগ্র")[0].id,memberships[0].id,"Bengali authorized business names must be searchable");
assert.equal(nav.searchableBusinesses(memberships,"outside-tenant").length,0,"No unauthorized business can be inferred");
console.log("PG02 PASS: payment-first default, authorized products, locale-neutral URL and server-controlled live default, invalid query denial, EN/BN navigation and product-limited search");
import "./pg02-loading-smoke.mjs";
