import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
const sql=readFileSync(new URL("../../../infra/migrations/0140_platform_subscription_policy_catalog.sql",import.meta.url),"utf8");
const fixLock=readFileSync(new URL("../../../infra/migrations/0141_platform_subscription_policy_lock_concat_fix.sql",import.meta.url),"utf8");
const fixKind=readFileSync(new URL("../../../infra/migrations/0142_platform_subscription_policy_kind_qualification.sql",import.meta.url),"utf8");

test("immutable legal versions require super admin, audit and published singleton",()=>{
 assert.match(sql,/p\.role='super_admin'/);
 assert.match(sql,/status='published'/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/SET status='archived'/);
 assert.match(sql,/platform_admin_audit\(actor_id,action,description\)/);
 assert.match(sql,/version_label,url,content_sha256,status,created_by/);
 assert.match(sql,/platform_subscription_policy_public\(\)/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM platform_subscription_policy_acceptances/);
 assert.match(fixLock,/''\|\|policy.kind/);
 assert.match(fixKind,/platform_subscription_policy_versions\.kind=policy.kind/);
});

test("checkout binds three versioned published links, with server gate for confirmation",()=>{
 const page=read("app/[locale]/checkout/order/[intent]/page.tsx");
 const loader=read("lib/server/subscription-policies.ts");
 const ui=read("components/subscription-order-summary.tsx");
 assert.match(page,/intentId=\{intent\}/);
 assert.match(loader,/platform_subscription_policy_public\(\)/);
 assert.doesNotMatch(loader,/process\.env\.EKMIVO_TERMS_URL/);
 assert.match(ui,/doc\?\.version/);
 assert.match(ui,/policyConsent\("terms"/);
 assert.match(ui,/policyConsent\("privacy"/);
 assert.match(ui,/policyConsent\("refund"/);
});

test("Legal & contact Admin tab uses actual server-backed control data",()=>{
 const shell=read("components/platform-admin-console.tsx");
 const action=read("actions/admin-subscription-policies.ts");
 assert.match(shell,/key==="settings"&&sub==="legal-contact"/);
 assert.match(action,/requireSuperAdmin\(\)/);
 assert.match(action,/platform_subscription_policy_admin/);
 assert.match(action,/content_sha256/);
});
