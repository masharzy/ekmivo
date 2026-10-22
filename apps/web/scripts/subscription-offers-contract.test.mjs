import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(`../src/${path}`,import.meta.url),"utf8");
const migration=readFileSync(new URL("../../../infra/migrations/0143_platform_subscription_offer_admin.sql",import.meta.url),"utf8");

test("versioned offers cannot silently rewrite a published price or grant access",()=>{
 assert.match(migration,/CREATE FUNCTION platform_subscription_offer_admin\(/);
 assert.match(migration,/a\.role='super_admin'/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/INSERT INTO platform_subscription_offer_versions/);
 assert.match(migration,/current_version_id IS DISTINCT FROM prior_version/);
 assert.match(migration,/payment_plan_catalog c/);
 assert.match(migration,/platform_admin_audit\(actor_id,action,description\)/);
 assert.doesNotMatch(migration,/\b(?:UPDATE|DELETE)\s+pg13_(?:subscriptions|platform_invoices)/i);
 assert.doesNotMatch(migration,/INSERT INTO platform_subscription_offers\s+VALUES/i);
});

test("Admin offer drafts validate minor-unit BDT and describe AI credits without charging",()=>{
 const actions=read("actions/admin-subscription-offers.ts"),view=read("components/admin-subscription-offers.tsx"),shell=read("components/platform-admin-console.tsx");
 assert.match(actions,/parseBdtMinor\(field\(form,"price_bdt"\)\)/);
 assert.match(actions,/requireSuperAdmin\(\)/);
 assert.match(actions,/platform_subscription_offer_admin/);
 assert.match(view,/included_ai_credits/);
 assert.match(view,/payment_plan_version_id/);
 assert.match(view,/One-time prepaid/);
 assert.match(shell,/key==="billing"&&sub==="offers"/);
});

test("subscription offer catalog never auto-enables pending checkout",()=>{
 const route=read("app/[locale]/checkout/order/[intent]/page.tsx");
 assert.match(route,/intentId=\{intent\}/);
 assert.doesNotMatch(migration,/\b(?:UPDATE|INSERT INTO)\s+(?:platform_billing_settings|pg13_platform_invoices|pg13_subscriptions)/i);
});
