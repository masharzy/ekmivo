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
import {InboxLibrary} from "./inbox-library";
import {AiStudioPage} from "./ai-studio-page";
import {WebsiteChatSettings} from "./website-chat-settings";
import {CommercePage} from "./commerce-page";
import {CustomerCRMPage} from "./customer-crm-page";
import {CommentAutomation} from "./comment-automation";
import {BriofoldGrowthReports} from "./briofold-growth-reports";
import {GrowthOperationsPage} from "./growth-operations-page";
import {BriofoldOrderReport} from "./briofold-order-report";
import {BriofoldUnifiedActivity} from "./briofold-unified-activity";
import {HelpVideos} from "./help-videos";
import {TeamGroups} from "./team-groups";
import {BrowserDevicePreferences} from "./browser-device-preferences";

export const unifiedDynamic="force-dynamic";

export async function UnifiedMerchantRoute({locale:raw,root,view=[],thread,paymentLinksMode,reportFilters,activityFilters}:{
 locale:string;root:UnifiedRoot;view?:string[];thread?:string;paymentLinksMode?:"requests";
 reportFilters?:Record<string,string|string[]|undefined>;
 activityFilters?:Record<string,string|string[]|undefined>;
}){
 if(thread&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(thread))notFound();
 const locale=raw==="en"?"en":"bn";
 // Documentation is publicly available and must never become a dead merchant
 // settings module. Resolve both historical deep links before Store DB reads.
 if(root==="settings"&&((view.length===1&&view[0]==="api-docs")||
  (view.length===2&&view[0]==="developers"&&view[1]==="docs")))redirect("/developers");
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
 const campaignPostRoute=root==="customers"&&view.length===2&&view[0]==="campaigns"&&view[1]==="posts";
 if(root==="reports"&&view[0]==="orders"&&process.env.BRIOFOLD_COMMERCE_REPORTS_ENABLED!=="true")notFound();
 if(root==="settings"&&view[0]==="activity"&&workspace.mode==="ai"&&process.env.BRIOFOLD_ACTIVITY_UNIFIED_ENABLED!=="true")notFound();
 if(root==="settings"&&view[0]==="team"&&view[1]==="groups"&&process.env.BRIOFOLD_TEAM_GROUPS_ENABLED!=="true")notFound();
 const {section,service,kind,detailId}=destination;
 const paymentContext=service==="payments"
  ?await paymentContextFor(workspace,user.id,undefined)
  :undefined;
 const body=kind==="settings-index"
  ?<UnifiedSettingsIndex locale={locale} mode={workspace.mode}/>
  :kind==="account-devices"
   ?<BrowserDevicePreferences bn={locale==="bn"}/>
  :kind==="help-videos"
   ?<HelpVideos key={workspace.id+":"+user.id} workspaceId={workspace.id} bn={locale==="bn"}/>
  :kind==="team-groups"
   ?<TeamGroups key={workspace.id+":"+user.id} workspaceId={workspace.id} bn={locale==="bn"}/>
  :root==="settings"&&view[0]==="activity"&&process.env.BRIOFOLD_ACTIVITY_UNIFIED_ENABLED==="true"
   ?<><BriofoldUnifiedActivity workspaceId={workspace.id} actorId={user.id} locale={locale}
       environment={paymentContext?.environment??"live"} filters={activityFilters}/>
     {paymentContext&&<DashboardContent locale={locale} user={user} workspace={workspace}
       section="events" service="payments" paymentContext={paymentContext} canonicalRoutes framed/>}</>
  :root==="reports"&&view[0]==="orders"
   ?<BriofoldOrderReport workspaceId={workspace.id} actorId={user.id} locale={locale}
     environment={paymentContext?.environment??"live"} filters={reportFilters}/>
  :root==="reports"&&view[0]!=="payments"&&process.env.BRIOFOLD_GROWTH_REPORTS_ENABLED==="true"
   ?<><BriofoldGrowthReports workspaceId={workspace.id} actorId={user.id} locale={locale}
      environment={paymentContext?.environment??"live"} mode={workspace.mode} focus={view[0]==="ai"?"ai":"all"}
      canExport={workspace.role==="owner"||workspace.role==="admin"}/>
     {view[0]==="ai"&&<BriofoldAiCreditSummary workspaceId={workspace.id} actorId={user.id} locale={locale}/>}</>
  :service==="ai"&&(section==="ai-agent"||section==="knowledge")
   ?<AiStudioPage workspaceId={workspace.id} actorId={user.id} locale={locale} view={section==="knowledge"?"knowledge":"assistant"}/>
  :service==="ai"&&section==="website"
   ?<WebsiteChatSettings key={user.id+":"+workspace.id} workspaceId={workspace.id} bn={locale==="bn"}/>
  :service==="ai"&&section==="comments"
   ?<CommentAutomation key={user.id+":"+workspace.id} workspaceId={workspace.id} actorId={user.id} bn={locale==="bn"}/>
  :root==="orders"
   ?<CommercePage key={user.id+":"+workspace.id+":"+view.join("/")+":"+(paymentContext?.environment??"live")} workspaceId={workspace.id} actorId={user.id} bn={locale==="bn"} financeEnabled={workspace.mode!=="ai"} view={view.length===2&&view[0]==="products"?"products-sync":view[0]??""} environment={paymentContext?.environment??"live"}/>
  :root==="customers"&&["","leads","follow-ups"].includes(view[0]??"")
   ?<CustomerCRMPage key={user.id+":"+workspace.id+":"+view.join("/")+":"+(paymentContext?.environment??"live")} workspaceId={workspace.id} actorId={user.id} bn={locale==="bn"} view={view[0]??""} financeEnabled={workspace.mode!=="ai"} environment={paymentContext?.environment??"live"}/>
  :root==="customers"&&(["broadcasts","bookings","posts"].includes(view[0]??"")||campaignPostRoute)&&process.env.BRIOFOLD_GROWTH_OPERATIONS_ENABLED==="true"
   ?<GrowthOperationsPage workspaceId={workspace.id} actorId={user.id} bn={locale==="bn"}
     environment={paymentContext?.environment??"live"} commerceEnabled={workspace.mode!=="ai"&&["owner","admin"].includes(workspace.role)}
     kind={view[0]==="bookings"?"booking":view[0]==="posts"||campaignPostRoute?"post":"broadcast"}/>
  :kind==="business-profile"
   ?<StoreProfileEditor key={workspace.id} locale={locale} workspaceId={workspace.id} canManage={workspace.role==="owner"||workspace.role==="admin"}/>
  :service==="ai"&&(section==="saved-replies"||section==="tickets")
   ?<InboxLibrary key={user.id+":"+workspace.id+":"+section} workspaceId={workspace.id} actorId={user.id} bn={locale==="bn"} kind={section==="tickets"?"tickets":"replies"}/>
  :kind==="inbox"
   ?<WorkspaceInbox key={user.id+":"+workspace.id} actorId={user.id} workspaceId={workspace.id} initialThread={thread} bn={locale==="bn"} role={workspace.role}/>
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
      section={section} service={service} paymentContext={paymentContext} detailId={detailId}
      initialQuery={root==="payments"&&view[0]==="links"&&paymentLinksMode==="requests"?{view:"requests"}:{}}
      canonicalRoutes framed/>;
 return <AppShell unified locale={locale} user={user} workspace={workspace}
   service={service} section={section} paymentContext={paymentContext}>
    <UnifiedSectionTabs locale={locale} root={root} mode={workspace.mode} view={view}/>
    {body}
    {root==="settings"&&view[0]==="billing"&&workspace.mode==="both"&&<BriofoldAiCreditSummary workspaceId={workspace.id} actorId={user.id} locale={locale}/>}
   </AppShell>;
}
