import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

// Production 2026-11-16: "[google login] failed stage=account 42501". FOR UPDATE needs UPDATE
// privilege, and the least-privilege web role (0156) only has SELECT,INSERT on auth_google_identities.
test("Google login only row-locks tables the web role may UPDATE",()=>{
 const src=read("apps/web/src/lib/server/google-auth.ts");
 const sql=read("infra/migrations/0156_web_runtime_least_privilege.sql");
 const updatable=new Set(sql.slice(sql.indexOf("updated_relations"),sql.indexOf("deleted_relations")).match(/'([a-z_0-9]+)'/g).map(x=>x.slice(1,-1)));
 assert.ok(!updatable.has("auth_google_identities"),"premise: no UPDATE on auth_google_identities");
 for(const m of src.matchAll(/FROM ([a-z_]+) ([a-z]+)(?: JOIN ([a-z_]+) ([a-z]+))?[^`]*FOR UPDATE OF ([a-z,]+)/g)){
  const alias={[m[2]]:m[1]};if(m[3])alias[m[4]]=m[3];
  for(const a of m[5].split(","))assert.ok(updatable.has(alias[a]),`FOR UPDATE OF ${a} (${alias[a]}) needs UPDATE privilege`);
 }
 assert.ok(src.includes("FOR UPDATE OF u`"));
});
