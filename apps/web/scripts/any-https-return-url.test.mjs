import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");

test("0262: any https Redirect URL only behind the flag; old rule otherwise",()=>{
 const sql=read("infra/migrations/0262_payment_link_any_https_return.sql");
 assert.ok(sql.includes("coalesce(current_setting('ekmivo.any_return_url',true),'')='on'"),"no setting must mean false, not NULL");
 assert.ok(sql.includes("'^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]?#]*)?$'"),"https only, no query or fragment");
 assert.ok(sql.includes("FROM pg12_integrations"),"registered websites still allowed");
 const docs=read("backend/internal/checkout/documents.go");
 assert.ok(docs.includes('os.Getenv("BRIOFOLD_ANY_RETURN_URL_ENABLED") == "true"'));
 assert.ok(docs.includes("set_config('ekmivo.any_return_url','on',true)"),"transaction-local only");
 assert.ok(read("backend/internal/checkout/public_realm.go").includes("set_config('ekmivo.any_return_url',$2,true)"),"checkout shows the same link");
 assert.ok(read("deploy/vps/set-flag.sh").includes("BRIOFOLD_ANY_RETURN_URL_ENABLED"));
 const reg=read("backend/cmd/financial-migrate/dashboard_reference.go");
 assert.equal(reg.split('"0262_payment_link_any_https_return.sql"').length-1,2,"both financial realms");
});
