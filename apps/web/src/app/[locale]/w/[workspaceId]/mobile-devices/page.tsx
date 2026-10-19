import {requireWorkspace} from "../../../../../lib/server/auth";
import {WorkspaceMobileDevices} from "../../../../../components/workspace-mobile-devices";
export const dynamic="force-dynamic";
export default async function Devices({params}:{params:Promise<{locale:string;workspaceId:string}>}){
 const p=await params,locale=p.locale==="en"?"en":"bn";
 const {workspace}=await requireWorkspace(locale,p.workspaceId);
 return <WorkspaceMobileDevices key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>;
}
