import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Phase 1A: preserve the existing, owner-approved visual behavior.
// This is deliberately read-only: no import moves, selector rewrites,
// palette edits or cross-route layout changes in this checkpoint.
// Actual physical stylesheet separation requires a separate visual-regression PR.
const file=(path)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const globalCss=file("app/globals.css");
const paymentCss=file("app/dashboard-v2.css");
const marketingCss=file("styles/brand/brand-tokens.css");
const homeDarkCss=file("styles/brand/home-dark.css");
const adminCss=file("styles/admin/admin-tokens.css");
const rootLayout=file("app/layout.tsx");

test("current CSS cascade order is frozen until a screenshot-approved migration",()=>{
 const imports=[...globalCss.matchAll(/^@import\s+"([^"]+)";/gm)].map(match=>match[1]);
 const index=(part)=>imports.findIndex(path=>path.endsWith(part));
 const ordered=[
  "landing-v3.css","landing-ink-bone.css","brand-tokens.css",
  "dashboard-refinement.css","dashboard-v2.css",
  "dashboard-shell-v3.css","dashboard-pass2.css",
  "admin-tokens.css","admin-theme.css","admin-components.css",
 ];
 for(const name of ordered)assert.ok(index(name)>=0,`Missing current CSS layer: ${name}`);
 for(let i=1;i<ordered.length;i++)assert.ok(index(ordered[i-1])<index(ordered[i]),`Unexpected CSS cascade order: ${ordered[i]}`);
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
 const scope=marketingCss.match(/:where\(([^{}]+)\)\s*\{/)?.[1];
 assert.ok(scope,"Missing opt-in marketing token scope");
 const selectors=scope.split(",").map(selector=>selector.trim());
 for(const required of [".ek-brand",".em","body:has(main.em)"])assert.ok(selectors.includes(required),`Missing marketing scope: ${required}`);
 for(const selector of selectors)assert.ok([".ek-brand",".em",".ekm-landing","body:has(main.em)","body:has(main.ekm-landing)"].includes(selector),`Unscoped marketing tokens: ${selector}`);
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
 // Explicit known technical debt: root globals is still loaded for all routes;
 // this guard does NOT claim physical route-level CSS isolation is complete.
});
