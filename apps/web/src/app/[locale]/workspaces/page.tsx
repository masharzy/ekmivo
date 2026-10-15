import {cookies} from "next/headers";
import {requireUser,workspacesFor,preferredWorkspaceFor} from "../../../lib/server/auth";
import {WorkspacesV2} from "../../../components/workspaces-v2";
export const dynamic="force-dynamic";
export default async function WorkspacesPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const [spaces,preferred,jar]=await Promise.all([workspacesFor(user.id),preferredWorkspaceFor(user.id),cookies()]);
 const stored=jar.get("ekmivo-theme")?.value;
 const theme=stored==="light"||stored==="dark"?stored:"system";
 return <WorkspacesV2 locale={locale} user={{id:user.id,name:user.name}} initialWorkspaces={spaces} initialDefault={preferred?.id??null} initialTheme={theme}/>;
}
