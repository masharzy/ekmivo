import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
test("password and OAuth signups bind one primary Store transactionally",()=>{
 const password=read("actions/account.ts"),oauth=read("lib/server/google-auth.ts");
 for(const source of [password,oauth]){
  assert.match(source,/INSERT INTO platform_primary_stores\(user_id,workspace_id,bound_by\)/);
  assert.match(source,/to_regclass\('public.platform_primary_stores'\)/);
 }
 assert.match(password,/pg_advisory_xact_lock\(hashtextextended/);
 assert.match(password,/if\(existing.length\)throw new Error\("STORE_ALREADY_EXISTS"\)/);
 assert.match(oauth,/return database\(\)\.begin\(async tx=>/);
});
test("bound accounts cannot switch Stores or be redirected to legacy picker",()=>{
 const auth=read("lib/server/auth.ts"),list=read("app/[locale]/workspaces/page.tsx");
 assert.match(auth,/if\(bound && workspaceId!==bound\)return false/);
 assert.match(auth,/if\(bound\)return spaces\.find/);
 assert.match(list,/if\(bound\|\|spaces\.length===1\)redirect/);
 assert.match(auth,/to_regclass\(\x27public.platform_primary_stores\x27\)/);
 assert.match(auth,/if\(!schema\?\.ready\)return null/);
});

test("bound dashboard hides switch controls and enforces direct-link Store isolation",()=>{
 const shell=read("components/app-shell.tsx"),frame=read("components/dashboard-frame.tsx"),auth=read("lib/server/auth.ts");
 assert.match(shell,/primaryStoreFor\(user\.id\)/);
 assert.match(shell,/primaryStoreId\?memberships\.filter/);
 assert.match(frame,/spaces\.length<=1\?/);
 assert.match(frame,/ds-business-static/);
 assert.match(auth,/if\(bound&&bound!==id\)redirect\("\/dashboard"\)/);
});

// Legacy multi-Store owners remain unbound until explicitly migrated.

test("single-Store routes stay canonical without locale path segments",()=>{
 const view=read("components/workspaces-v2.tsx"),actions=read("actions/account.ts");
 assert.doesNotMatch(view,/href=\{`\/\$\{locale\}\/workspaces/);
 assert.match(view,/href="\/workspaces"/);
 assert.match(actions,/redirect\("\/login"\)/);
 assert.match(actions,/"\/admin\/verify"/);
 assert.match(actions,/"\/workspaces\/open"/);
 const frame=read("components/dashboard-frame.tsx");
 assert.match(frame,/spaces\.length>1\?searchableBusinesses/);
});

// All new Store purchase redirects use canonical, locale-neutral URLs.

// CSS loaded through the existing dashboard cascade avoids VM harness imports.

test("Bengali UI uses Hind Siliguri even within independently themed Payments dashboard",()=>{
 const css=readFileSync(new URL("../src/app/dashboard-v2.css",import.meta.url),"utf8");
 const tokens=readFileSync(new URL("../../../docs/design/tokens.css",import.meta.url),"utf8");
 assert.match(css,/html:lang\(bn\) \.ds-app\[data-service="payments"\]/);
 assert.match(css,/--font-ui:var\(--font-hind-siliguri\)/);
 assert.match(tokens,/:root:lang\(bn\)/);
 assert.ok(read("lib/server/auth.ts").includes("(?:[0-9a-f]{4}-){3}"),"full UUID format must not reject authorized Store deep links");
});

// Phase 1 CI includes this check before deployment or seal.
