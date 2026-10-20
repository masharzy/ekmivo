import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const moduleBody=ts.transpileModule(read("lib/unified-navigation.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const cjs={exports:{}};
vm.runInNewContext(moduleBody,{module:cjs,exports:cjs.exports});
const {unifiedDestination}=cjs.exports;

test("AI-only Devices opens its existing native Inbox device manager",()=>{
 const d=unifiedDestination("ai","settings",["devices"]);
 assert.equal(d?.kind,"devices");
 assert.equal(d?.service,"ai");
});
test("Payments-only Devices retains the existing financial SMS device manager",()=>{
 const d=unifiedDestination("commerce","settings",["devices"]);
 assert.equal(d?.kind,undefined);
 assert.equal(d?.section,"devices");
 assert.equal(d?.service,"payments");
});
test("Both enabled uses a selector with BOTH original independently authorized backends",()=>{
 const d=unifiedDestination("both","settings",["devices"]);
 assert.equal(d?.kind,"mixed-devices");
 assert.equal(d?.service,"payments");
 const resolver=read("components/unified-merchant-route.tsx");
 const selector=read("components/unified-devices-settings.tsx");
 assert.match(resolver,/kind==="mixed-devices"&&paymentContext/);
 assert.match(resolver,/smsDevices=\{<DashboardContent/);
 assert.match(resolver,/aiDevices=\{<WorkspaceMobileDevices/);
 assert.match(selector,/role="tablist"/);
 assert.match(selector,/role="tabpanel"/);
 assert.match(selector,/aria-selected/);
 assert.match(selector,/aria-controls/);
 assert.match(selector,/document\.getElementById\("device-tab-"/);
});
test("No access from off business or more than one unmatched settings slug",()=>{
 assert.equal(unifiedDestination("off","settings",["devices"]),null);
 assert.equal(unifiedDestination("both","settings",["devices","unexpected"]),null);
});
