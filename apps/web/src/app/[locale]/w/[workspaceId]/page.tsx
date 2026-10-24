import {redirectLegacyDashboard} from "../../../../lib/server/legacy-dashboard";
export const dynamic="force-dynamic";
export default async function LegacyBusiness({params}:{params:Promise<{locale:string;workspaceId:string}>}){
 const p=await params;return redirectLegacyDashboard(p.locale==="en"?"en":"bn",p.workspaceId);
}
