import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const ui=readFileSync(new URL("../../apps/web/src/components/sms-devices.tsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../../backend/internal/checkout/physical_devices.go",import.meta.url),"utf8");
const proxy=readFileSync(new URL("../../apps/web/src/app/api/go/[...path]/route.ts",import.meta.url),"utf8");
const sql=readFileSync(new URL("../../infra/migrations/0086_phone_reconnect_delete.sql",import.meta.url),"utf8");
test("reconnect is scoped to an existing device ID and never invokes create",()=>{
 assert.match(ui,/command\(\`\/\$\{p\.id\}\/reconnect\`,\{phone_id:p\.id\}\)/);
 assert.match(ui,/openPairing\(data,p\.id\)/);
 assert.doesNotMatch(ui,/setName\(current\.name\);setSelected\(null\);setCreateOpen\(true\)/);
 assert.match(api,/pg06_phone_reconnect\(/);
 assert.match(sql,/WHERE p\.id=phone_id AND p\.workspace_id=w AND p\.environment=e AND p\.deleted_at IS NULL FOR UPDATE/);
 assert.match(sql,/UPDATE pg06_phones SET public_key=NULL,claimed_at=NULL,revoked_at=NULL/);
 assert.match(sql,/RETURN jsonb_build_object\('id',phone\.id/);
});
test("delete revokes access, hides device, and preserves historical receipts",()=>{
 assert.match(ui,/setPendingDelete\(current\)/);
 assert.match(ui,/deleteConfirmed\(pendingDelete\)/);
 assert.match(ui,/command\(\`\/\$\{p\.id\}\/delete\`,\{phone_id:p\.id\}\)/);
 assert.match(api,/pg06_phone_delete\(/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.match(sql,/p\.deleted_at IS NULL/);
 assert.doesNotMatch(sql,/DELETE FROM pg06_phone_forwarded|DELETE FROM pg06_phones/);
});
test("pairing expiry uses reissued pairing deadline and existing dashboard button classes",()=>{
 assert.match(ui,/p\.pair_expires_at\?now>=Date\.parse\(p\.pair_expires_at\)/);
 // The migration embeds its pg_get_functiondef replacement in a SQL literal;
 // the quotes are doubled in source before PostgreSQL evaluates it.
 assert.ok(sql.includes("''pair_expires_at'',p.pair_expires_at"));
 assert.match(ui,/className="ib dg"/);
 assert.match(ui,/className="ib pri"/);
});

test("Next API proxy admits delete and reconnect, but no arbitrary phone action",()=>{
 const pattern=proxy.split("\n").find(line=>line.startsWith("const phonePath="));
 assert.ok(pattern,"phone allowlist exists");
 const parsed=/^const phonePath=\/(.+)\/i;$/.exec(pattern);
 assert.ok(parsed,"phone allowlist expression parsed");
 const allow=new RegExp(parsed[1],"i");
 const ws="11111111-1111-4111-8111-111111111111";
 const id="22222222-2222-4222-8222-222222222222";
 for(const action of ["delete","reconnect","revoke","rename"]){
  assert.equal(allow.test(`workspaces/${ws}/phones/${id}/${action}`),true,`${action} must reach Go`);
 }
 assert.equal(allow.test(`workspaces/${ws}/phones/${id}/remove-all`),false);
 assert.equal(allow.test(`workspaces/${ws}/phones/${id}/delete/extra`),false);
});
test("Go must validate requested phone ID matches the targeted route before mutation",()=>{
 assert.match(api,/PhoneID\s+string\s+`json:"phone_id"`/);
 assert.match(api,/\(action\s*==\s*"reconnect"\s*\|\|\s*action\s*==\s*"delete"\)\s*&&\s*body.PhoneID\s*!=\s*id/);
 assert.match(api,/fail\(w,\s*422,\s*"PHONE_ID_MISMATCH"\)/);
});
