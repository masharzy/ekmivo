import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Phase 1B: isolate merchant-specific visual layers without changing token
// values or approved layer ordering. The shared app/auth stylesheet debt remains
// separately tracked; do not claim the entire CSS isolation is complete.
const file=(path)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const globalCss=file("app/globals.css");
const paymentCss=file("app/dashboard-v2.css");
const marketingCss=file("styles/brand/brand-tokens.css");
const homeDarkCss=file("styles/brand/home-dark.css");
const adminCss=file("styles/admin/admin-tokens.css");
const rootLayout=file("app/layout.tsx");
const merchantBundle=file("components/merchant-payment-styles.css");
const merchantFrame=file("components/dashboard-frame.tsx");

test("public/Admin root excludes payment dashboard CSS; merchant bundle preserves its cascade",()=>{
 const rootImports=[...globalCss.matchAll(/^@import\s+"([^"]+)";/gm)].map(match=>match[1]);
 const rootIndex=name=>rootImports.findIndex(path=>path.endsWith(name));
 const remaining=[
  "landing-v3.css","landing-ink-bone.css","brand-tokens.css",
  "dashboard-refinement.css","admin-tokens.css","admin-theme.css","admin-components.css"
 ];
 for(const name of remaining)assert.ok(rootIndex(name)>=0,`Missing shared public layer: ${name}`);
 for(let i=1;i<remaining.length;i++)assert.ok(rootIndex(remaining[i-1])<rootIndex(remaining[i]),`Public cascade changed: ${remaining[i]}`);
 for(const name of ["dashboard-v2.css","dashboard-shell-v3.css","dashboard-pass2.css"])
  assert.equal(rootIndex(name),-1,`Merchant payment stylesheet leaked into public root: ${name}`);
 const merchantImports=[...merchantBundle.matchAll(/^@import\s+"([^"]+)";/gm)].map(match=>match[1]);
 assert.deepEqual(merchantImports.map(x=>x.split("/").pop()),["dashboard-v2.css","dashboard-shell-v3.css","dashboard-pass2.css"]);
 assert.match(merchantFrame,/import "\.\/merchant-payment-styles\.css";/);
 assert.match(rootLayout,/import "\.\/globals\.css";/);
});

test("the approved payment dashboard remains a locally scoped visual authority",()=>{
 const light=paymentCss.match(/\.ds-app\[data-service="payments"\]\s*\{([^}]+)\}/)?.[1];
 const dark=paymentCss.match(/:root\[data-theme="dark"\]\s+\.ds-app\[data-service="payments"\]\s*\{([^}]+)\}/)?.[1];
 assert.ok(light&&dark,"Missing service-scoped payment dashboard tokens");
 for(const [token,value] of [
  ["--color-canvas","#fafafa"],["--color-surface","#fff"],
  ["--color-border","#e9e9ed"],["--color-text","#15161a"],
  ["--color-primary","#4f46e5"],["--sidebar-width","232px"],
 ])assert.ok(light.includes(`${token}:${value}`),`Payment reference token changed: ${token}`);
 for(const [token,value] of [
  ["--color-canvas","#0a0b0e"],["--color-surface","#131418"],
  ["--color-text","#ececf0"],["--color-primary","#8b87ff"],
 ])assert.ok(dark.includes(`${token}:${value}`),`Payment dark token changed: ${token}`);
 assert.match(paymentCss,/\.ds-app\[data-service="payments"\]\s+\.ds-sidebar\s*\{/);
});

test("marketing tokens remain opt-in, not the payment dashboard palette",()=>{
 assert.match(marketingCss,/:where\(\.ek-brand,\.em,body:has\(main\.em\)\)/);
 assert.doesNotMatch(marketingCss,/(?:^|\n)\s*:root\s*\{\s*--brand-/);
 assert.match(homeDarkCss,/:root\[data-theme="dark"\]\s+\.em/);
 assert.match(paymentCss,/--color-canvas:#fafafa/);
});

test("admin keeps its own locked token scope",()=>{
 assert.match(adminCss,/:root body \.pa-root\.pa-admin-design/);
 assert.match(adminCss,/:root body \.pa-root\.pa-admin-design\[data-admin-theme="dark"\]/);
 assert.match(adminCss,/--admin-sidebar-width:212px/);
 assert.match(adminCss,/--admin-header-height:48px/);
});

test("public homepage and dashboard are not to share product-specific CSS directly",()=>{
 const source=["components/app-shell.tsx","components/dashboard-frame.tsx"]
  .map(p=>file(p)).join("\n");
 assert.doesNotMatch(source,/import\s+["'][^"']*(?:landing-|home-dark|brand-tokens|globals\.css)/);
 assert.match(rootLayout,/import "\.\/globals\.css";/);
 // Remaining debt: app/globals.css still contains shared auth/workspace CSS;
 // only payment visual layers are physically component-owned in this pass.
});
