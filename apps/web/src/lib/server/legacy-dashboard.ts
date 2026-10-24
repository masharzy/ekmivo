import {notFound,redirect} from "next/navigation";
import {preferredWorkspaceFor,requireWorkspace} from "./auth";
import {legacyDashboardPath,type LegacyDashboardQuery} from "../legacy-dashboard";

export async function redirectLegacyDashboard(locale:"en"|"bn",workspaceId:string,service?:string,section="overview",resourceID?:string,query:LegacyDashboardQuery={}):Promise<never>{
 const {user,workspace}=await requireWorkspace(locale,workspaceId);
 const selected=await preferredWorkspaceFor(user.id);
 // An old UUID link cannot silently change or impersonate the selected business.
 if(!selected||selected.id!==workspace.id)notFound();
 if(workspace.mode==="off"&&!service&&section==="overview")redirect("/dashboard");
 const product=service??(workspace.mode==="ai"?"ai":"payments");
 const target=legacyDashboardPath(workspace.mode,product,section,resourceID,query);
 if(!target)notFound();
 redirect(target);
}
export async function redirectLegacyAiSettings(locale:"en"|"bn",workspaceId:string,section:"channels"|"devices"):Promise<never>{
 const {user,workspace}=await requireWorkspace(locale,workspaceId);
 const selected=await preferredWorkspaceFor(user.id);
 if(!selected||selected.id!==workspace.id||!['ai','both'].includes(workspace.mode))notFound();
 redirect(section==="channels"?"/settings/channels":"/settings/devices");
}
