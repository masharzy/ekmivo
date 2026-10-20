import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
test("Account & security opens the existing fully implemented account view",()=>{
 const index=source("components/unified-settings-index.tsx");
 const resolver=source("components/unified-merchant-route.tsx");
 const account=source("app/[locale]/account/page.tsx");
 assert.match(index,/item\.slug==="account"\?"\/account"/);
 assert.match(resolver,/root==="settings"&&view\.length===1&&view\[0\]==="account"\)redirect\("\/account"\)/);
 assert.match(account,/AccountSecurityView/);
 assert.match(account,/auth_sessions/);
 assert.match(account,/platform_admin_mfa/);
 assert.match(account,/auth_google_identities/);
 assert.doesNotMatch(index,/href=\{["']\/settings\/account/);
});
