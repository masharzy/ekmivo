import {redirectLegacyDashboard} from "../../../../../../lib/server/legacy-dashboard";
import type {LegacyDashboardQuery} from "../../../../../../lib/legacy-dashboard";
export const dynamic="force-dynamic";
export default async function LegacyServicePage({params,searchParams}:{params:Promise<{locale:string;workspaceId:string;section:string;serviceSection:string}>;searchParams:Promise<LegacyDashboardQuery>}){
 const p=await params;
 return redirectLegacyDashboard(p.locale==="en"?"en":"bn",p.workspaceId,p.section,p.serviceSection,undefined,await searchParams);
}
