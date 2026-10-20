import "server-only";
import {notFound,redirect} from "next/navigation";
import {requireUser,preferredWorkspaceFor} from "../lib/server/auth";
import {paymentContextFor} from "../lib/server/workspace-context";
import {unifiedDestination,type UnifiedRoot} from "../lib/unified-navigation";
import {AppShell} from "./app-shell";
import {DashboardContent} from "./dashboard-content";
import {WorkspaceInbox} from "./workspace-inbox";
import {WorkspaceChannels} from "./workspace-channels";
import {UnifiedSettingsIndex} from "./unified-settings-index";
import {UnifiedSectionTabs} from "./unified-section-tabs";

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
 const destination=unifiedDestination(workspace.mode,root,view);
 if(!destination)notFound();
 const {section,service,kind}=destination;
 const paymentContext=service==="payments"
  ?await paymentContextFor(workspace,user.id,undefined)
  :undefined;
 const body=kind==="settings-index"
  ?<UnifiedSettingsIndex locale={locale} mode={workspace.mode}/>
  :kind==="inbox"
   ?<WorkspaceInbox key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>
   :kind==="channels"
    ?<WorkspaceChannels key={workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>
    :<DashboardContent locale={locale} user={user} workspace={workspace}
      section={section} service={service} paymentContext={paymentContext} framed/>;
 return <AppShell unified locale={locale} user={user} workspace={workspace}
   service={service} section={section} paymentContext={paymentContext}>
    <UnifiedSectionTabs locale={locale} root={root} mode={workspace.mode} view={view}/>
    {body}
   </AppShell>;
}
