import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../src/",import.meta.url));
// The current DashboardFrame retains the authorized server content during a
// client navigation and uses a progress indicator. The old standalone
// dashboard-page-skeleton.tsx was removed when this UI behavior was approved.
// Verify today's behavior rather than importing an obsolete component.
const frameSource=readFileSync(resolve(root,"components/dashboard-frame.tsx"),"utf8");
assert.match(frameSource,/<main id="dashboard-content"[^>]*aria-busy=\{isNavigating\}>\{children\}<\/main>/,
 "Dashboard must preserve authorized content and announce pending navigation");
assert.match(frameSource,/isNavigating&&<div className="ds-navigation-progress"/,
 "Pending navigation uses the shared non-blocking progress indicator");
assert.doesNotMatch(frameSource,/isNavigating\s*\?\s*<DashboardPageSkeleton/,
 "Client transition must not replace the entire content with an immediate skeleton");
const paymentContextSource=readFileSync(resolve(root,"lib/server/workspace-context.ts"),"utf8");
assert.match(paymentContextSource,/const authorizedEnvironments=cache\(async \(workspaceId:string,userId:string\)/,
 "Product shell and page should share one request-scoped lookup");
assert.match(paymentContextSource,/const permitted=await authorizedEnvironments\(workspace.id,userId\)/,
 "Both code paths must consult the request-scoped authorized result");
for(const guard of ["JOIN workspace_members member","JOIN app_users actor","actor.disabled_at IS NULL","member.user_id=","env.workspace_id="]){
 assert.ok(paymentContextSource.includes(guard),"Authorization guard absent from environment query: "+guard);
}
console.log("PG02 PASS: persistent dashboard content and non-blocking pending navigation, with request-scoped authorization");
