import "server-only";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {paymentContextFor} from "../lib/server/workspace-context";
import {unifiedDestination,type UnifiedRoot} from "../lib/unified-navigation";
import {AppShell} from "./app-shell";
import {DashboardContent} from "./dashboard-content";
import {WorkspaceInbox} from "./workspace-inbox";
import {WorkspaceMobileDevices} from "./workspace-mobile-devices";
import {WorkspaceChannels} from "./workspace-channels";
import {StoreProfileEditor} from "./store-profile-editor";
import {UnifiedSettingsIndex} from "./unified-settings-index";
import {UnifiedSectionTabs} from "./unified-section-tabs";
import {UnifiedDevicesSettings} from "./unified-devices-settings";
import {BriofoldAiCreditSummary} from "./briofold-ai-credit-summary";
import {onboardingState} from "../lib/server/briofold-onboarding";

export const unifiedDynamic="force-dynamic";

export async function UnifiedMerchantRoute({locale:raw,root,view=[]}:{
 locale:string;root:UnifiedRoot;view?:string[];
}){
 const locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 // Preferred business is rechecked against memberships on every server read.
 // No client-provided workspace ID, query, locale or cookie grants financial access.
 const workspace=await preferredWorkspaceFor(user.id);
 if(!workspace||workspace.mode==="off")redirect("/workspaces");
 // Keep previously issued /settings/account deep links working while serving
 // the real session/MFA/account security screen rather than workspace settings.
 if(root==="settings"&&view.length===1&&view[0]==="account")redirect("/account");
 const setup=await onboardingState(workspace,user.id);
 if(setup&&setup!=="complete")redirect("/setup");
 const destination=unifiedDestination(workspace.mode,root,view);
 if(!destination)notFound();
 const {section,service,kind}=destination;
 const paymentContext=service==="payments"
  ?await paymentContextFor(workspace,user.id,undefined)
  :undefined;
 const body=kind==="settings-index"
  ?<UnifiedSettingsIndex locale={locale} mode={workspace.mode}/>
  :kind==="business-profile"
   ?<StoreProfileEditor key={workspace.id} locale={locale} workspaceId={workspace.id} canManage={workspace.role==="owner"||workspace.role==="admin"}/>
  :kind==="inbox"
   ?<WorkspaceInbox key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"} role={workspace.role}/>
   :kind==="channels"
    ?<WorkspaceChannels key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>
    :kind==="devices"
     ?<WorkspaceMobileDevices key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>
    :kind==="mixed-devices"&&paymentContext
     ?<UnifiedDevicesSettings locale={locale}
       smsDevices={<DashboardContent key={workspace.id+":sms"} locale={locale} user={user} workspace={workspace}
        section="devices" service="payments" paymentContext={paymentContext} framed/>}
       aiDevices={<WorkspaceMobileDevices key={workspace.id+":ai"} workspaceId={workspace.id} bn={locale==="bn"}/>}/>
    :root==="settings"&&view[0]==="billing"&&workspace.mode==="ai"
     ?<><h1>{locale==="bn"?"বিলিং ও ব্যবহার":"Billing & usage"}</h1><BriofoldAiCreditSummary workspaceId={workspace.id} actorId={user.id} locale={locale}/></>
    :<DashboardContent locale={locale} user={user} workspace={workspace}
      section={section} service={service} paymentContext={paymentContext} framed/>;
 return <AppShell unified locale={locale} user={user} workspace={workspace}
   service={service} section={section} paymentContext={paymentContext}>
    <UnifiedSectionTabs locale={locale} root={root} mode={workspace.mode} view={view}/>
    {body}
    {root==="settings"&&view[0]==="billing"&&workspace.mode==="both"&&<BriofoldAiCreditSummary workspaceId={workspace.id} actorId={user.id} locale={locale}/>}
   </AppShell>;
}
