import {redirectLegacyAiSettings} from "../../../../../lib/server/legacy-dashboard";
export const dynamic="force-dynamic";
export default async function LegacySettings({params}:{params:Promise<{locale:string;workspaceId:string}>}){
 const p=await params;return redirectLegacyAiSettings(p.locale==="en"?"en":"bn",p.workspaceId,"devices");
}
