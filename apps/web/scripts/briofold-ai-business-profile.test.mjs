import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const js=ts.transpileModule(read("lib/unified-navigation.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports});
const {unifiedDestination,unifiedSettings,enabledUnifiedService}=mod.exports;

test("AI-only merchants retain a real editable business profile destination",()=>{
 const item=unifiedSettings.flatMap(x=>x.items).find(x=>x.slug==="business");
 assert.equal(item?.service,"common");
 assert.ok(enabledUnifiedService("ai",item.service));
 const dest=unifiedDestination("ai","settings",["business"]);
 assert.equal(dest?.kind,"business-profile");
 assert.equal(dest?.section,"store");
 assert.equal(dest?.service,"ai");
});
test("Payments and Both keep their existing authorized store editor",()=>{
 for(const mode of ["commerce","both"]){
  const dest=unifiedDestination(mode,"settings",["business"]);
  assert.equal(dest?.section,"store");
  assert.equal(dest?.service,"payments");
  assert.equal(dest?.kind,undefined);
 }
 assert.equal(unifiedDestination("off","settings",["business"]),null);
});
test("AI-only business profile reuses backend-authorized persistent store API",()=>{
 const route=read("components/unified-merchant-route.tsx");
 const editor=read("components/store-profile-editor.tsx");
 const endpoint=read("app/api/workspaces/[id]/store/route.ts");
 assert.match(route,/kind==="business-profile"/);
 assert.match(route,/StoreProfileEditor/);
 assert.match(route,/canManage=\{workspace\.role==="owner"\|\|workspace\.role==="admin"\}/);
 assert.match(editor,/\/api\/workspaces\//);
 assert.match(editor,/method:"PUT"/);
 assert.match(editor,/version/);
 assert.match(endpoint,/dashboard_store_read/);
 assert.match(endpoint,/dashboard_store_write/);
 assert.match(endpoint,/currentUser\(\)/);
 assert.match(endpoint,/ORIGIN_DENIED/);
});
