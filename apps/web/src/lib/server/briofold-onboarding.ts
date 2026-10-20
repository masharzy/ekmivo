import "server-only";
import {database} from "./db";
import type {Workspace} from "./auth";
export type OnboardingStep="business"|"services"|"billing"|"complete";
export async function onboardingState(workspace:Workspace,userId:string):Promise<OnboardingStep|null>{
 const db=database();
 // Backward compatible with deployments where the control migration is pending.
 const exists=await db`SELECT to_regclass('public.briofold_business_onboarding') AS table_name`;
 if(!exists[0]?.table_name)return null;
 const rows=await db`SELECT o.step FROM briofold_business_onboarding o
 JOIN workspace_members m ON m.workspace_id=o.workspace_id AND m.user_id=${userId}::uuid
 WHERE o.workspace_id=${workspace.id}::uuid AND o.owner_id=${userId}::uuid
 AND m.role='owner' LIMIT 1`;
 return (rows[0]?.step as OnboardingStep|undefined)??null;
}
