import {requireWorkspace} from "../../../../../lib/server/auth";
import {WorkspaceChannels} from "../../../../../components/workspace-channels";
export const dynamic="force-dynamic";
export default async function Channels({params}:{params:Promise<{locale:string;workspaceId:string}>}){
 const p=await params,locale=p.locale==="en"?"en":"bn";
 const {workspace}=await requireWorkspace(locale,p.workspaceId);
 return <WorkspaceChannels key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>;
}
