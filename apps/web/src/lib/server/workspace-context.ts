import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { database } from "./db";
import type { Workspace } from "./auth";
import { canonicalEnvironment, type PaymentEnvironment } from "../dashboard-navigation";

export type WorkspacePaymentContext = {
 environment: PaymentEnvironment;
 status: "active" | "suspended";
 availableEnvironments: PaymentEnvironment[];
 liveOperational: false;
};

// React cache is scoped to one server render/request. Never use a process-wide
// memo, CDN cache, or cross-request TTL for membership/environment authorization.
// Both the persistent shell and section page can read these same permitted rows.
const authorizedEnvironments=cache(async (workspaceId:string,userId:string):Promise<PaymentEnvironment[]>=>{
 const result=await database()`
 SELECT env.environment,env.status
 FROM workspace_environments env
 JOIN workspace_members member ON member.workspace_id=env.workspace_id
 JOIN app_users actor ON actor.id=member.user_id
 WHERE env.workspace_id=${workspaceId}::uuid
 AND member.user_id=${userId}::uuid
 AND actor.disabled_at IS NULL
 AND env.environment IN ('sandbox','live')
 ORDER BY env.environment`;
 return result.filter(row=>row.status==="active").map(row=>String(row.environment)) as PaymentEnvironment[];
});

// The URL is a request, NEVER authority. The tenant has already been checked
// by requireWorkspace before this query. Environment status is server-validated.
// "active" here only means the context is provisioned; no payment API exists yet.
export async function paymentContextFor(
 workspace: Workspace,
 userId: string,
 rawEnvironment: string | undefined | null,
 shellOnly=false,
): Promise<WorkspacePaymentContext> {
 const environment=canonicalEnvironment(rawEnvironment);
 if(!environment || (workspace.mode!=="commerce"&&workspace.mode!=="both")) notFound();
 const permitted=await authorizedEnvironments(workspace.id,userId);
 // The merchant UI has no environment switch for now. Never fall back to
 // Sandbox when Live is unavailable: all sensitive actions stay authorized.
 // const selected=shellOnly?(permitted.includes("sandbox")?"sandbox":permitted[0]):environment;
 const selected=shellOnly?"live":environment;
 if(!selected||!permitted.includes(selected)) notFound();
 return {environment:selected,status:"active",availableEnvironments:permitted,liveOperational:false};
}
