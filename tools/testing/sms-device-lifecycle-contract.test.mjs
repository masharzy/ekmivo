import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const ui=readFileSync(new URL("../../apps/web/src/components/sms-devices.tsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../../backend/internal/checkout/physical_devices.go",import.meta.url),"utf8");
const sql=readFileSync(new URL("../../infra/migrations/0086_phone_reconnect_delete.sql",import.meta.url),"utf8");
test("reconnect is scoped to an existing device ID and never invokes create",()=>{
 assert.match(ui,/command\(\`\/\$\{p\.id\}\/reconnect\`,\{\}\)/);
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
 assert.match(api,/pg06_phone_delete\(/);
 assert.match(sql,/deleted_at=now\(\)/);
 assert.match(sql,/p\.deleted_at IS NULL/);
 assert.doesNotMatch(sql,/DELETE FROM pg06_phone_forwarded|DELETE FROM pg06_phones/);
});
test("pairing expiry uses reissued pairing deadline and existing dashboard button classes",()=>{
 assert.match(ui,/p\.pair_expires_at\?now>=Date\.parse\(p\.pair_expires_at\)/);
 assert.match(sql,/'pair_expires_at',p\.pair_expires_at/);
 assert.match(ui,/className="ib dg"/);
 assert.match(ui,/className="ib pri"/);
});
