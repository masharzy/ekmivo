import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {requireUser,workspacesFor,preferredWorkspaceFor} from "../../../lib/server/auth";
import {WorkspacesV2} from "../../../components/workspaces-v2";
export const dynamic="force-dynamic";
export default async function WorkspacesPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const [spaces,preferred,jar]=await Promise.all([workspacesFor(user.id),preferredWorkspaceFor(user.id),cookies()]);
 // New one-Store accounts go straight to setup/dashboard; the old picker is
 // retained only for legacy multi-membership accounts until an approved migration.
 if(spaces.length===1)redirect("/workspaces/open");
 const stored=jar.get("ekmivo-theme")?.value;
 const theme=stored==="light"||stored==="dark"?stored:"system";
 const chosen=jar.get("ekmivo-selected-plan")?.value??"";
 return <WorkspacesV2 locale={locale} user={{id:user.id,name:user.name}} initialWorkspaces={spaces} initialDefault={preferred?.id??null} initialTheme={theme} selectedPlan={/^[a-z][a-z0-9_-]{1,39}$/.test(chosen)?chosen:""}/>;
}
