import {PlanFeatureUpgrade} from "./plan-feature-upgrade";
import {workspacePlanFeatures,sectionPlanFeature} from "../lib/server/plan-access";
import {DashboardInitialData} from "./dashboard-initial-data";
import {dashboardInitialData} from "../lib/server/dashboard-initial-data";
import Link from "next/link";
import { AppShell } from "./app-shell";
import { DashboardIcon as Icon } from "./dashboard-icon";
import { DashboardModule } from "./dashboard-module";
import { DeveloperConsole } from "./developer-console";
import { PaymentRequests } from "./payment-requests";
import { PaymentOperations } from "./payment-operations";
import {PaymentTransactionWorkspace} from "./payment-transaction-workspace";
import { PaymentOverview } from "./payment-overview";
import {BriofoldAiOverview} from "./briofold-ai-overview";
import { PaymentDocuments } from "./payment-documents";
import { PaymentRefunds } from "./payment-refunds";
import { PaymentReports } from "./payment-reports";
import {PaymentNotificationCenter} from "./payment-notification-center";
import {PaymentApps} from "./payment-apps";
import { PaymentIntegrations } from "./payment-integrations";
import {CheckoutThemes} from "./checkout-themes";
import {validCheckoutTheme,type CheckoutThemeConfig} from "../lib/checkout-theme";
import {database} from "../lib/server/db";
import {HelpFeedback} from "./help-feedback";
import { PaymentWorkspaceTools } from "./payment-workspace-tools";
import {StoreProfileEditor} from "./store-profile-editor";
import { PaymentBilling } from "./payment-billing";
import { PaymentReconciliation } from "./payment-reconciliation";
import type { User, Workspace } from "../lib/server/auth";
import { sections, type SectionKey } from "../lib/dashboard-sections";
import { dashboardHref, defaultService, serviceNames, type Locale, type Service } from "../lib/dashboard-navigation";
import { moduleViews } from "../lib/dashboard-views";
import type { WorkspacePaymentContext } from "../lib/server/workspace-context";
export function EmptyState({title,description}:{locale:Locale;title:string;description:string}) {
 return <div className="ds-empty"><h2>{title}</h2><p>{description}</p></div>;
}
export async function DashboardContent({locale,user,workspace,section,service=defaultService(workspace.mode),paymentContext,framed=false,initialQuery={},detailId,canonicalRoutes=false}:{locale:Locale;user:User;workspace:Workspace;section:SectionKey;service?:Service;paymentContext?:WorkspacePaymentContext;framed?:boolean;initialQuery?:Record<string,string|string[]|undefined>;detailId?:string;canonicalRoutes?:boolean}) {
 const bn=locale==="bn",detail=sections[section];
 const commonWorkspaceSection=["team","settings","help"].includes(section);
 const workspaceBilling=section==="billing";
 const steps:SectionKey[]=service==="ai"?["channels","knowledge","ai-agent","inbox"]:["gateways","devices","requests","webhooks"];
 const metrics=service==="ai"?[["Conversations","কথোপকথন"],["Waiting for reply","উত্তরের অপেক্ষায়"],["New leads","নতুন লিড"],["AI usage","AI ব্যবহার"]]:[["Verified volume","যাচাইকৃত পেমেন্ট"],["Pending requests","অপেক্ষমাণ রিকোয়েস্ট"],["Unmatched receipts","না মেলা পেমেন্ট"],["Device health","ডিভাইসের অবস্থা"]];
 const [planFeatures,initialCheckoutTheme]=await Promise.all([
  service==="payments"?workspacePlanFeatures(workspace.id,paymentContext?.environment||"live"):Promise.resolve(undefined),
  service==="payments"&&section==="checkout-themes"?
   (async():Promise<{body:CheckoutThemeConfig;version:number}|null>=>{
    try{
     const rows=await database()`SELECT dashboard_checkout_theme_read(${workspace.id}::uuid,${user.id}::uuid) AS value`;
     const value=rows[0]?.value as {body:unknown;version:unknown}|undefined;
     if(value&&validCheckoutTheme(value.body)&&typeof value.version==="number"&&Number.isSafeInteger(value.version))
      return {body:value.body,version:value.version};
     return null;
    }catch(error){console.error("CHECKOUT_THEME_INITIAL_READ_FAILED",error instanceof Error?error.message:"UNKNOWN");return null}
   })():Promise.resolve(null)
 ]);
 // A one-time request is a distinct, existing financial intent capability, not
 // a paid reusable-link entitlement. Keep both reachable within /payments/links.
 const oneTimeRequests=canonicalRoutes&&service==="payments"&&section==="payment-links"&&
  (initialQuery.view==="requests"||planFeatures?.payment_links!==true);
 const feature=sectionPlanFeature[section];
 if(service==="payments"&&feature&&!oneTimeRequests&&!planFeatures?.[feature]){
  const denied=<PlanFeatureUpgrade feature={feature} locale={locale} workspaceId={workspace.id} unavailable={planFeatures===null}/>;
  return framed?denied:<AppShell locale={locale} user={user} workspace={workspace} section={section} service={service} paymentContext={paymentContext}>{denied}</AppShell>;
 }
 // Canonical financial record links use the same authorized source readers as
 // legacy detail routes. No payment, invoice or refund truth is reconstructed.
 const detailContent=detailId&&service==="payments"&&paymentContext
  ?["customers","invoices","payment-links"].includes(section)
   ?<PaymentDocuments canInvoices={planFeatures?.invoices===true} canExport={planFeatures?.exports}
     userId={user.id} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment}
     kind={section as "customers"|"invoices"|"payment-links"} detailId={detailId} canonicalRoutes={canonicalRoutes}
     canWrite={workspace.role!=="viewer"} canManage={["owner","admin"].includes(workspace.role)}/>
   :section==="refunds"
    ?<PaymentRefunds locale={locale} workspaceId={workspace.id} environment={paymentContext.environment}
      detailId={detailId} canManage={["owner","admin"].includes(workspace.role)}/>
    :["transactions","incoming","gateways","devices","webhooks","events"].includes(section)
     ?<PaymentOperations userId={user.id} locale={locale} workspaceId={workspace.id}
       environment={paymentContext.environment} detailId={detailId} canonicalRoutes={canonicalRoutes}
       resource={(section==="transactions"?"payments":section) as "payments"|"incoming"|"gateways"|"devices"|"webhooks"|"events"}
       canManage={["owner","admin"].includes(workspace.role)}/>
     :null
  :null;
 if(detailContent)return framed?detailContent:<AppShell locale={locale} user={user} workspace={workspace}
  section={section} service={service} paymentContext={paymentContext}>{detailContent}</AppShell>;
 if(oneTimeRequests&&paymentContext){
  const requestReads=await dashboardInitialData(workspace.id,paymentContext.environment,"requests",initialQuery,planFeatures);
  const requestContent=<DashboardInitialData reads={requestReads}>
   <nav className="tabs" aria-label={bn?"পেমেন্ট লিংকের ধরন":"Payment link type"}>
    {planFeatures?.payment_links===true&&<Link href="/payments/links">{bn?"পেমেন্ট লিংক":"Payment links"}</Link>}
    <Link href="/payments/links?view=requests" aria-current="page" className="on">{bn?"একবারের রিকোয়েস্ট":"One-time requests"}</Link>
   </nav>
   <PaymentRequests hideTabs canPaymentLinks={planFeatures?.payment_links===true} canInvoices={planFeatures?.invoices===true}
    key={user.id+workspace.id+paymentContext.environment} canWrite={workspace.role!=="viewer"}
    locale={locale} userId={user.id} workspaceId={workspace.id} environment={paymentContext.environment}/>
  </DashboardInitialData>;
  return framed?requestContent:<AppShell locale={locale} user={user} workspace={workspace}
   section={section} service={service} paymentContext={paymentContext}>{requestContent}</AppShell>;
 }
 const initialReads=service==="payments"&&paymentContext?await dashboardInitialData(workspace.id,paymentContext.environment,section,initialQuery,planFeatures):{};
 const content=<DashboardInitialData reads={initialReads}><>
  {canonicalRoutes&&service==="payments"&&section==="payment-links"&&<nav className="tabs" aria-label={bn?"পেমেন্ট লিংকের ধরন":"Payment link type"}>
   {planFeatures?.payment_links===true&&<Link href="/payments/links" aria-current={oneTimeRequests?undefined:"page"} className={oneTimeRequests?undefined:"on"}>{bn?"পেমেন্ট লিংক":"Payment links"}</Link>}
   <Link href="/payments/links?view=requests">{bn?"একবারের রিকোয়েস্ট":"One-time requests"}</Link>
  </nav>}
  
  {service==="payments"&&section==="requests"&&<div className="ekv3-links-heading"><header className="ekv3-page-header"><div><h1>{planFeatures?.payment_links?(bn?"পেমেন্ট লিংক":"Payment links"):(bn?"একবারের রিকোয়েস্ট":"One-time requests")}</h1><p>{planFeatures?.payment_links?(bn?"পেমেন্ট লিংক ও একবারের অনুরোধ পরিচালনা করুন।":"Manage links and one-time payments."):(bn?"একবারের পেমেন্ট অনুরোধ পরিচালনা করুন।":"Manage one-time payments.")}</p></div>{workspace.role!=="viewer"&&<Link className="ekv3-primary" href={dashboardHref(locale,workspace.id,service,section)+"?create=1"}>{section==="requests"?(bn?"নতুন রিকোয়েস্ট":"New request"):(bn?"নতুন লিংক":"New link")}</Link>}</header></div>}
  {!(service==="ai"&&section==="overview")&&!((service==="payments"&&paymentContext&&["overview","reports","transactions","incoming","requests","refunds","invoices","customers","payment-links","gateways","devices","developers","checkout-themes","store","notifications"].includes(section))||commonWorkspaceSection||workspaceBilling)&&<div className="ds-page-heading"><div><p className="ds-eyebrow">{serviceNames[service][locale]}</p><h1>{section==="overview"?(bn?"আপনার কাজের সারসংক্ষেপ":"Your working overview"):detail[locale]}</h1><p>{section==="overview"?(service==="ai"?(bn?"গ্রাহকের মেসেজ, AI ও বিক্রয়ের অগ্রগতি এক জায়গায়।":"Conversations, your AI and sales progress in one place."):(bn?"পেমেন্ট যাচাই, টাকা গ্রহণের মাধ্যম ও ডিভাইসের অবস্থা।":"Payment verification, receiving accounts and device health.")):detail.detail[locale]}</p></div></div>}
  {section==="overview"&&service==="payments"&&paymentContext?<PaymentOverview canPaymentLinks={planFeatures?.payment_links===true} canReports={planFeatures?.reports===true} key={user.id+workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canManage={workspace.role==="owner"||workspace.role==="admin"}/>:section==="overview"&&service==="ai"?<BriofoldAiOverview workspaceId={workspace.id} userId={user.id} locale={locale}/>:section==="overview"?<>
   <div className="ds-metrics">{metrics.map(([en,bengali])=><article key={en}><span>{bn?bengali:en}</span><strong>—</strong><small>{bn?"ডেটার উৎস সংযুক্ত হয়নি":"Data source not connected"}</small></article>)}</div>
   <section className="ds-panel"><div className="ds-panel-heading"><h2>{bn?"শুরু করার ধাপ":"Set up your workspace"}</h2><span>{bn?"৪টি ধাপ":"4 steps"}</span></div><div className="ds-setup-grid">{steps.map((key,index)=><Link key={key} href={dashboardHref(locale,workspace.id,service,key,paymentContext?.environment??"sandbox")}><span className="ds-step-number">0{index+1}</span><Icon name={key}/><strong>{sections[key][locale]}</strong><p>{sections[key].detail[locale]}</p><span className="ds-text-link">{bn?"দেখুন":"Open"}<Icon name="arrow"/></span></Link>)}</div></section>
   {service==="payments"&&<section className="ds-verification-summary"><Icon name="shield"/><div><h2>{bn?"স্বয়ংক্রিয় পেমেন্ট যাচাই":"Automatic payment verification"}</h2><p>{bn?"প্রকৃত sender number, লেনদেনের সময়, amount, receiving account ও method একসঙ্গে মেলানো হবে। একটিমাত্র বৈধ match হলে confirmation ও merchant webhook পাঠানো হবে।":"Match actual sender number, transaction time, amount, receiving account and method. A single valid match confirms payment and dispatches the merchant webhook."}</p><small>{bn?"Verification engine এখনো সংযুক্ত হয়নি।":"Verification engine is not connected yet."}</small></div></section>}
   <section className="ds-panel"><div className="ds-panel-heading"><h2>{bn?"সাম্প্রতিক কার্যক্রম":"Recent activity"}</h2></div><EmptyState locale={locale} title={bn?"এখনো কার্যক্রম নেই":"No activity yet"} description={bn?"সেবা সংযুক্ত হলে এই dashboard-এর কার্যক্রম এখানে দেখা যাবে।":"Activity for this product appears here after its services are connected."}/></section>
  </>:section==="apps"&&service==="payments"?<PaymentApps locale={locale}/>:section==="store"&&service==="payments"?<StoreProfileEditor locale={locale} workspaceId={workspace.id} canManage={["owner","admin"].includes(workspace.role)}/>:section==="checkout-themes"&&service==="payments"?<CheckoutThemes key={workspace.id} locale={locale} workspaceId={workspace.id} storeName={workspace.name} initialTheme={initialCheckoutTheme} canManage={["owner","admin"].includes(workspace.role)}/>:section==="notifications"&&service==="payments"&&paymentContext?<PaymentNotificationCenter key={workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment}/>:section==="developers"&&service==="payments"&&paymentContext?<DeveloperConsole locale={locale} userId={user.id} workspace={workspace} environment={paymentContext.environment}/>:section==="requests"&&service==="payments"&&paymentContext?<PaymentRequests canPaymentLinks={planFeatures?.payment_links===true} canInvoices={planFeatures?.invoices===true} key={user.id+workspace.id+paymentContext.environment} canWrite={workspace.role!=="viewer"} locale={locale} userId={user.id} workspaceId={workspace.id} environment={paymentContext.environment}/>:service==="payments"&&paymentContext&&["transactions","incoming"].includes(section)?<PaymentTransactionWorkspace key={user.id+workspace.id+paymentContext.environment+section} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canManage={["owner","admin"].includes(workspace.role)} resource={section==="transactions"?"payments":"incoming"}/>:service==="payments"&&paymentContext&&["payments","gateways","devices","webhooks","events"].includes(section)?<PaymentOperations canonicalRoutes={canonicalRoutes} key={user.id+workspace.id+paymentContext.environment+section} userId={user.id} canManage={["owner","admin"].includes(workspace.role)} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} resource={section as "payments"|"incoming"|"gateways"|"devices"|"webhooks"|"events"}/>:service==="payments"&&paymentContext&&["customers","invoices","payment-links"].includes(section)?<PaymentDocuments canonicalRoutes={canonicalRoutes} canInvoices={planFeatures?.invoices===true} canExport={planFeatures?.exports} userId={user.id} key={user.id+workspace.id+paymentContext.environment+section} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canWrite={workspace.role!=="viewer"} canManage={["owner","admin"].includes(workspace.role)} kind={section as "customers"|"invoices"|"payment-links"}/>:service==="payments"&&paymentContext&&section==="refunds"?<PaymentRefunds locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canManage={["owner","admin"].includes(workspace.role)}/>:service==="payments"&&paymentContext&&section==="reports"?<PaymentReports canExport={planFeatures?.exports} key={workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canReveal={workspace.role==="owner"||workspace.role==="admin"}/>:service==="payments"&&paymentContext&&section==="integrations"?<PaymentIntegrations key={workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} canManage={["owner","admin"].includes(workspace.role)}/>:commonWorkspaceSection?section==="help"?<HelpFeedback key={user.id+workspace.id} locale={locale} workspaceId={workspace.id} environment={paymentContext?.environment??"live"}/>:<PaymentWorkspaceTools key={user.id+workspace.id+section} locale={locale} userId={user.id} workspaceId={workspace.id} environment={paymentContext?.environment??"live"} workspaceName={workspace.name} resource={section as "team"|"settings"|"help"} paymentPlanApplies={workspace.mode!=="ai"} canManage={["owner","admin"].includes(workspace.role)} isOwner={workspace.role==="owner"}/>:workspaceBilling?(service==="payments"&&paymentContext?<PaymentBilling key={user.id+workspace.id} locale={locale} workspaceId={workspace.id} canManage={["owner","admin"].includes(workspace.role)}/>:<section className="ds-panel ws-availability" role="status"><h1>{bn?"AI Billing":"AI billing"}</h1><p>{bn?"AI বিলিং সেবা এখনো সংযুক্ত হয়নি। কোনো প্ল্যান, বিল বা খরচের তথ্য দেখানো হচ্ছে না।":"AI billing is not connected yet. No plans, charges or payment history can be shown for this service."}</p><Link href={dashboardHref(locale,workspace.id,service,"help")}>{bn?"সহায়তা নিন":"Get help"}</Link></section>):service==="payments"&&paymentContext&&section==="reconciliation"?<PaymentReconciliation key={user.id+workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} userId={user.id} environment={paymentContext.environment} canManage={["owner","admin"].includes(workspace.role)}/>:moduleViews[section]?<DashboardModule locale={locale} service={service} workspaceId={workspace.id} section={section} view={moduleViews[section]!} environment={paymentContext?.environment}/>:<section className="ds-panel"><EmptyState locale={locale} title={detail[locale]} description={bn?"এই অংশের backend কাজ চলছে। কোনো পরিবর্তন সংরক্ষণ করা হচ্ছে না।":"This module's backend is in development. Changes cannot be saved yet."}/></section>}
 </></DashboardInitialData>;
 return framed?content:<AppShell locale={locale} user={user} workspace={workspace} section={section} service={service} paymentContext={paymentContext}>{content}</AppShell>;
}
