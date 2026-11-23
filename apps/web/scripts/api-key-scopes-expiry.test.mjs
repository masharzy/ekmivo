import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL("../src/"+p,import.meta.url),"utf8");
test("API key: all 13 offered scopes can be chosen (DB allows 13 since 0229)",()=>{
 const action=src("actions/merchant-keys.ts");
 assert.match(action,/scopes\.length<1\|\|scopes\.length>13\|\|/);
 const offered=[...src("components/api-key-manager.tsx").matchAll(/"((?:payments|customers|invoices|refunds|webhooks|orders|products):[a-z]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(offered).size,13);
});
test("API key: expiry warning 7 days before and 30 days after",()=>{
 const ui=src("components/api-key-manager.tsx");
 assert.match(ui,/x\.left<=7\*day&&x\.left>-30\*day/);
 assert.match(ui,/data-testid="api-key-expiry-warning"/);
});
