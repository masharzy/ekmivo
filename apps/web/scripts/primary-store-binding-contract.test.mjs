import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
test("password and OAuth signups bind the first (primary) Store transactionally",()=>{
 const password=read("actions/account.ts"),oauth=read("lib/server/google-auth.ts");
 for(const source of [password,oauth]){
  assert.match(source,/INSERT INTO platform_primary_stores\(user_id,workspace_id,bound_by\)/);
  assert.match(source,/to_regclass\('public.platform_primary_stores'\)/);
 }
 assert.match(password,/pg_advisory_xact_lock\(hashtextextended/);
 assert.match(password,/STORE_LIMIT/);
 assert.match(password,/MAX_OWNED_STORES=5/);
 assert.match(password,/ON CONFLICT \(user_id\) DO NOTHING/);
 assert.match(oauth,/return database\(\)\.begin\(async tx=>/);
});
test("multi-store: any member store can be selected and the picker is not bypassed",()=>{
 const auth=read("lib/server/auth.ts"),list=read("app/[locale]/workspaces/page.tsx");
 assert.doesNotMatch(auth,/if\(bound && workspaceId!==bound\)return false/);
 assert.match(auth,/SELECT 1 FROM workspace_members WHERE user_id=\$\{userId\}::uuid AND workspace_id=\$\{workspaceId\}::uuid/);
 assert.match(auth,/spaces\.find\(w=>w\.id===chosen\)\?\?spaces\.find\(w=>w\.id===bound\)\?\?spaces\[0\]/);
 assert.doesNotMatch(list,/redirect\("\/workspaces\/open"\)/);
 assert.match(auth,/to_regclass\(\x27public.platform_primary_stores\x27\)/);
 assert.match(auth,/if\(!schema\?\.ready\)return null/);
});

test("dashboard always shows the store switcher with Create new store; membership guards direct links",()=>{
 const shell=read("components/app-shell.tsx"),frame=read("components/dashboard-frame.tsx"),auth=read("lib/server/auth.ts");
 assert.match(shell,/const spaces=memberships/);
 assert.doesNotMatch(frame,/spaces\.length<=1\?/);
 assert.match(frame,/ds-business-picker/);
 assert.match(frame,/\/workspaces\?create=1/);
 assert.doesNotMatch(auth,/if\(bound&&bound!==id\)redirect/);
 assert.match(auth,/if\(!rows\.length\)redirect\("\/workspaces"\)/);
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
