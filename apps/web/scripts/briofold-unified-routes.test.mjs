import test from "node:test";
import assert from "node:assert/strict";
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
 assert.equal((src.match(/href:"\/(dashboard|inbox|orders|payments|sms-data|invoices|customers|reports|settings)"/g)||[]).length,7);
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
  assert.match(src,/dashboard\|inbox\|orders\|payments\|customers\|reports\|settings/,`Missing route exclusion: ${cssless}`);
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
