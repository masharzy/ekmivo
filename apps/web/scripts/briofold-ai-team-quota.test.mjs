import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const migration=readFileSync(new URL("../../../infra/migrations/0101_dashboard_control_plan_limits.sql",import.meta.url),"utf8");

test("Database skips Payment subscription seat quotas for AI-only workspaces",()=>{
 assert.match(migration,/product='payments' AND enabled\) OR platform_billing_system_workspace/);
 assert.match(migration,/CREATE FUNCTION payment_plan_invite_limit/);
});
test("The common Team Settings only runs Payment plan gating for Payments/Both",()=>{
 const dashboard=src("components/dashboard-content.tsx");
 const tools=src("components/payment-workspace-tools.tsx");
 const limit=src("components/plan-resource-status.tsx");
 assert.match(dashboard,/paymentPlanApplies=\{workspace\.mode!=="ai"\}/);
 assert.match(tools,/paymentPlanApplies=true/);
 assert.match(tools,/resource==="team"&&paymentPlanApplies/);
 assert.match(tools,/teamLimit\.blocked/);
 assert.match(limit,/if\(!enabled\)return;/);
 assert.match(limit,/enabled\?data:\{exempt:true,resources:\{\}\}/);
});
test("Existing Payments subscription enforcement and team grant capability stay enabled",()=>{
 const tools=src("components/payment-workspace-tools.tsx");
 assert.match(tools,/members:manage/);
 assert.match(tools,/teamLimit\.refresh/);
 assert.match(tools,/paymentPlanApplies=true/);
});
