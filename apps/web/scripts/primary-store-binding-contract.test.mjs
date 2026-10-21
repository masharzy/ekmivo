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
 assert.match(auth,/error\.code==="42P01"/);
});
