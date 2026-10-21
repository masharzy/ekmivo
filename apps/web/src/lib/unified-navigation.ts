import type {SectionKey} from "./dashboard-sections";
import type {Service} from "./dashboard-navigation";

export type BusinessMode="ai"|"commerce"|"both"|"off";
export type UnifiedRoot="dashboard"|"inbox"|"orders"|"payments"|"sms-data"|"invoices"|"customers"|"reports"|"settings";
export type UnifiedNavItem={key:UnifiedRoot;en:string;bn:string;icon:SectionKey;href:string;service:"ai"|"payments"|"common"};
export const unifiedNavigation:readonly UnifiedNavItem[]=[
 {key:"dashboard",en:"Overview",bn:"ওভারভিউ",icon:"overview",href:"/dashboard",service:"common"},
 {key:"inbox",en:"Inbox",bn:"ইনবক্স",icon:"inbox",href:"/inbox",service:"ai"},
 {key:"orders",en:"Orders",bn:"অর্ডার",icon:"orders",href:"/orders",service:"common"},
 {key:"payments",en:"Payments",bn:"পেমেন্ট",icon:"transactions",href:"/payments",service:"payments"},
 {key:"sms-data",en:"SMS Data",bn:"SMS ডাটা",icon:"incoming",href:"/sms-data",service:"payments"},
 {key:"invoices",en:"Invoices",bn:"ইনভয়েস",icon:"invoices",href:"/invoices",service:"payments"},
 {key:"customers",en:"Customers",bn:"গ্রাহক",icon:"customers",href:"/customers",service:"common"},
 {key:"reports",en:"Reports",bn:"রিপোর্ট",icon:"reports",href:"/reports",service:"common"},
 {key:"settings",en:"Settings",bn:"সেটিংস",icon:"settings",href:"/settings",service:"common"},
];
export type UnifiedSetting={slug:string;en:string;bn:string;section:SectionKey;service:"ai"|"payments"|"common";external?:boolean};
export const unifiedSettings:readonly {slug:string;en:string;bn:string;items:readonly UnifiedSetting[]}[]=[
 {slug:"business",en:"Business & verification",bn:"ব্যবসা ও যাচাই",items:[
  {slug:"business",en:"Business profile",bn:"ব্যবসার পরিচিতি",section:"store",service:"common"},
  {slug:"account",en:"Account & security",bn:"অ্যাকাউন্ট ও নিরাপত্তা",section:"settings",service:"common"},
  {slug:"preferences",en:"Business preferences",bn:"ব্যবসার পছন্দ",section:"settings",service:"common"},
  {slug:"checkout",en:"Checkout appearance",bn:"চেকআউট ডিজাইন",section:"checkout-themes",service:"payments"},
 ]},
 {slug:"ai",en:"AI & channels",bn:"AI ও চ্যানেল",items:[
  {slug:"ai",en:"AI assistant",bn:"AI সহকারী",section:"ai-agent",service:"ai"},
  {slug:"knowledge",en:"Knowledge base",bn:"নলেজ বেস",section:"knowledge",service:"ai"},
  {slug:"channels",en:"Connected channels",bn:"সংযুক্ত চ্যানেল",section:"channels",service:"ai"},
  {slug:"website",en:"Website chat",bn:"ওয়েবসাইট চ্যাট",section:"website",service:"ai"},
  {slug:"comment-automation",en:"Comment automation",bn:"কমেন্ট অটোমেশন",section:"comments",service:"ai"},
 ]},
 {slug:"payment",en:"Payment setup",bn:"পেমেন্ট সেটআপ",items:[
  {slug:"payment-methods",en:"Payment methods",bn:"পেমেন্ট মাধ্যম",section:"gateways",service:"payments"},
  {slug:"devices",en:"Devices",bn:"ডিভাইস",section:"devices",service:"common"},
 ]},
 {slug:"developers",en:"Developers & integrations",bn:"ডেভেলপার ও ইন্টিগ্রেশন",items:[
  {slug:"api-keys",en:"API keys",bn:"API Keys",section:"developers",service:"payments"},
  {slug:"webhooks",en:"Webhooks & alerts",bn:"ওয়েবহুক ও অ্যালার্ট",section:"webhooks",service:"payments"},
  {slug:"integrations",en:"Integrations",bn:"ইন্টিগ্রেশন",section:"integrations",service:"payments"},
  {slug:"api-docs",en:"API documentation",bn:"API নির্দেশনা",section:"api-docs",service:"payments",external:true},
  {slug:"activity",en:"Activity logs",bn:"কার্যক্রমের ইতিহাস",section:"events",service:"payments"},
 ]},
 {slug:"team",en:"Team & permissions",bn:"টিম ও অনুমতি",items:[
  {slug:"team",en:"Team management",bn:"টিম পরিচালনা",section:"team",service:"common"},
 ]},
 {slug:"billing",en:"Billing & help",bn:"বিলিং ও সহায়তা",items:[
  {slug:"billing",en:"Billing & usage",bn:"বিলিং ও ব্যবহার",section:"billing",service:"common"},
  {slug:"help",en:"Help & feedback",bn:"সহায়তা ও মতামত",section:"help",service:"common"},
 ]},
];
export type UnifiedDestination={section:SectionKey;service:Service;kind?:"inbox"|"channels"|"devices"|"mixed-devices"|"business-profile"|"settings-index"};
export const unifiedSectionPaths:Partial<Record<SectionKey,string>>={
 overview:"/dashboard",inbox:"/inbox",comments:"/inbox/comments","saved-replies":"/inbox/saved-replies",tickets:"/inbox/tickets",
 orders:"/orders",products:"/orders/products",inventory:"/orders/inventory",shipping:"/orders/delivery",returns:"/orders/returns",coupons:"/orders/coupons",
 transactions:"/payments", "payment-links":"/payments/links",requests:"/payments/links",invoices:"/invoices",refunds:"/payments/refunds",incoming:"/sms-data",reconciliation:"/reports",
 customers:"/customers",contacts:"/customers",leads:"/customers/leads","follow-ups":"/customers/follow-ups",broadcasts:"/customers/broadcasts",bookings:"/customers/bookings",posts:"/customers/posts",
 reports:"/reports",settings:"/settings",gateways:"/settings/payment-methods",devices:"/settings/devices",
 store:"/settings/business","checkout-themes":"/settings/checkout",developers:"/settings/api-keys",webhooks:"/settings/webhooks",
 integrations:"/settings/integrations",events:"/settings/activity",team:"/settings/team",billing:"/settings/billing",
 help:"/settings/help",channels:"/settings/channels",website:"/settings/website",
 "ai-agent":"/settings/ai",knowledge:"/settings/knowledge",
};
export function unifiedSectionHref(section:SectionKey,service:Service):string|null{
 if(section==="overview")return "/dashboard";
 if(section==="customers"||section==="contacts")return "/customers";
 if(section==="reports")return "/reports";
 if(section==="settings")return "/settings";
 if(section==="billing")return "/settings/billing";
 if(section==="comments"&&service==="ai")return "/inbox/comments";
 return unifiedSectionPaths[section]??null;
}
export function enabledUnifiedService(mode:BusinessMode,service:"ai"|"payments"|"common"){
 return mode!=="off"&&(service==="common"||mode==="both"||(service==="ai"?mode==="ai":mode==="commerce"));
}
export function unifiedDestination(mode:BusinessMode,root:UnifiedRoot,view:readonly string[]):UnifiedDestination|null{
 if(mode==="off"||view.length>1)return null;
 const part=view[0]??"";
 const payments=mode!=="ai";
 const defaultService:Service=payments?"payments":"ai";
 const main:Record<Exclude<UnifiedRoot,"settings">,Record<string,UnifiedDestination>>={
  dashboard:{"":{section:"overview",service:defaultService}},
  inbox:{"":{section:"inbox",service:"ai",kind:"inbox"},comments:{section:"comments",service:"ai"},"saved-replies":{section:"saved-replies",service:"ai"},tickets:{section:"tickets",service:"ai"},"agent-desk":{section:"ai-agent",service:"ai"}},
  orders:{"":{section:"orders",service:payments?"payments":"ai"},products:{section:"products",service:payments?"payments":"ai"},inventory:{section:"inventory",service:defaultService},delivery:{section:"shipping",service:defaultService},returns:{section:"returns",service:defaultService},coupons:{section:"coupons",service:defaultService}},
  payments:{"":{section:"transactions",service:"payments"},transactions:{section:"transactions",service:"payments"},links:{section:"payment-links",service:"payments"},refunds:{section:"refunds",service:"payments"}},
  "sms-data":{"":{section:"incoming",service:"payments"}},
  invoices:{"":{section:"invoices",service:"payments"}},
  customers:{financial:{section:"customers",service:"payments"},"":{section:payments?"customers":"contacts",service:defaultService},leads:{section:"leads",service:defaultService},"follow-ups":{section:"follow-ups",service:defaultService},broadcasts:{section:"broadcasts",service:"ai"},bookings:{section:"bookings",service:"ai"},posts:{section:"posts",service:"ai"}},
  reports:{"":{section:"reports",service:defaultService},payments:{section:"reports",service:"payments"},ai:{section:"reports",service:"ai"}},
 };
 let destination:UnifiedDestination|undefined;
 if(root==="settings"){
  if(!part)return {section:"settings",service:defaultService,kind:"settings-index"};
  const setting=unifiedSettings.flatMap(g=>g.items).find(item=>item.slug===part);
  if(!setting||setting.external)return null;
  destination={section:setting.section,service:setting.service==="common"?defaultService:setting.service};
  if(part==="business"&&mode==="ai")destination.kind="business-profile";
  if(part==="channels")destination.kind="channels";
  if(part==="devices"&&mode==="ai")destination.kind="devices";
  if(part==="devices"&&mode==="both")destination.kind="mixed-devices";
 }else{
  // URL segments are untrusted keys. Inherited Object properties are not routes.
  if(!Object.hasOwn(main,root)||!Object.hasOwn(main[root],part))return null;
  destination=main[root][part];
 }
 if(!destination)return null;
 if(destination.service==="payments"&&!payments)return null;
 if(destination.service==="ai"&&mode==="commerce")return null;
 return destination;
}
