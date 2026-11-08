import {cookies} from "next/headers";
import {requireUser,workspacesFor,preferredWorkspaceFor} from "../../../lib/server/auth";
import {AppShell} from "../../../components/app-shell";
import {WorkspacesV2} from "../../../components/workspaces-v2";
export const dynamic="force-dynamic";
export default async function WorkspacesPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const [spaces,preferred,jar]=await Promise.all([workspacesFor(user.id),preferredWorkspaceFor(user.id),cookies()]);
 const stored=jar.get("briofold-theme")?.value;
 const theme=stored==="light"||stored==="dark"?stored:"system";
 const chosen=jar.get("briofold-selected-plan")?.value??"";
 const list=<WorkspacesV2 embedded={Boolean(preferred&&preferred.mode!=="off")} locale={locale} user={{id:user.id,name:user.name}} initialWorkspaces={spaces} initialDefault={preferred?.id??null} initialTheme={theme} selectedPlan={/^[a-z][a-z0-9_-]{1,39}$/.test(chosen)?chosen:""}/>;
 if(preferred&&preferred.mode!=="off")return <AppShell unified locale={locale} user={user} workspace={preferred} section="settings">{list}</AppShell>;
 return list;
}
