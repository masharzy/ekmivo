import {redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../../../../lib/server/auth";
import {onboardingState} from "../../../../lib/server/briofold-onboarding";
import {AppShell} from "../../../../components/app-shell";
import {StoreSetupChecklist} from "../../../../components/store-setup-checklist";
export const dynamic="force-dynamic";
export default async function SetupChecklistPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale),workspace=await preferredWorkspaceFor(user.id);
 if(!workspace||workspace.mode==="off")redirect("/workspaces");
 const step=await onboardingState(workspace,user.id);if(step&&step!=="complete")redirect("/setup");
 return <AppShell unified locale={locale} user={user} workspace={workspace} section="settings"><StoreSetupChecklist key={user.id+":"+workspace.id} workspace={workspace} actorId={user.id} bn={locale==="bn"}/></AppShell>;
}
