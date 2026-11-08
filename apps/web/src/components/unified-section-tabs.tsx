import Link from "next/link";
import {enabledUnifiedService,type BusinessMode,type UnifiedRoot} from "../lib/unified-navigation";
import styles from "./unified-section-tabs.module.css";

type Tab={en:string;bn:string;href:string;service:"ai"|"payments"|"common"|"fulfilment"};
const tabs:Partial<Record<UnifiedRoot,readonly Tab[]>>={
 inbox:[
  {en:"Conversations",bn:"কথোপকথন",href:"/inbox",service:"ai"},
  {en:"Comments",bn:"কমেন্ট",href:"/inbox/comments",service:"ai"},
  {en:"Saved replies",bn:"সেভ করা উত্তর",href:"/inbox/saved-replies",service:"ai"},
  {en:"Agent Desk",bn:"AI এজেন্ট",href:"/inbox/agent-desk",service:"ai"},
  {en:"Tickets",bn:"টিকিট",href:"/inbox/tickets",service:"ai"},
 ],
 orders:[
  {en:"Orders",bn:"অর্ডার",href:"/orders",service:"fulfilment"},
  {en:"To follow up",bn:"ফলোআপের অর্ডার",href:"/orders/to-chase",service:"fulfilment"},
  {en:"Scan & pack",bn:"স্ক্যান ও প্যাক",href:"/orders/scan",service:"fulfilment"},
  {en:"Products",bn:"পণ্য",href:"/orders/products",service:"fulfilment"},
  {en:"Inventory",bn:"স্টক",href:"/orders/inventory",service:"fulfilment"},
  {en:"Delivery",bn:"ডেলিভারি",href:"/orders/delivery",service:"fulfilment"},
  {en:"Returns",bn:"রিটার্ন",href:"/orders/returns",service:"fulfilment"},
  {en:"Coupons",bn:"কুপন",href:"/orders/coupons",service:"fulfilment"},
 ],
 payments:[
  {en:"Transactions",bn:"লেনদেন",href:"/payments",service:"payments"},
  {en:"Payment links",bn:"পেমেন্ট লিংক",href:"/payments/links",service:"payments"},
  {en:"Payment requests",bn:"পেমেন্ট রিকোয়েস্ট",href:"/payments/links?view=requests",service:"payments"},
  {en:"Refunds",bn:"রিফান্ড",href:"/payments/refunds",service:"payments"},
 ],
 customers:[
  {en:"Customers",bn:"গ্রাহক",href:"/customers",service:"common"},
  {en:"Financial records",bn:"আর্থিক রেকর্ড",href:"/customers/financial",service:"payments"},
  {en:"Leads",bn:"লিড",href:"/customers/leads",service:"ai"},
  {en:"Follow-ups",bn:"ফলো-আপ",href:"/customers/follow-ups",service:"ai"},
  {en:"Broadcasts",bn:"ব্রডকাস্ট",href:"/customers/broadcasts",service:"ai"},
  {en:"Bookings",bn:"বুকিং",href:"/customers/bookings",service:"ai"},
  {en:"Posts",bn:"পোস্ট",href:"/customers/posts",service:"ai"},
 ],
 reports:[
  {en:"Business activity",bn:"ব্যবসার কার্যক্রম",href:"/reports",service:"common"},
  {en:"Order reports",bn:"অর্ডার রিপোর্ট",href:"/reports/orders",service:"fulfilment"},
  {en:"Payment reports",bn:"পেমেন্ট রিপোর্ট",href:"/reports/payments",service:"payments"},
  {en:"AI reports",bn:"AI রিপোর্ট",href:"/reports/ai",service:"ai"},
 ]
};

// Settings pages that belong together get one tab row, so "AI assistant", "Knowledge base"
// and the channels do not each look like a separate product.
const aiTabs:readonly Tab[]=[
 {en:"AI assistant",bn:"AI সহকারী",href:"/settings/ai",service:"ai"},
 {en:"Knowledge base",bn:"নলেজ বেস",href:"/settings/knowledge",service:"ai"},
 {en:"Channels",bn:"চ্যানেল",href:"/settings/channels",service:"ai"},
 {en:"Website chat",bn:"ওয়েবসাইট চ্যাট",href:"/settings/channels/website",service:"ai"},
 {en:"Comment automation",bn:"কমেন্ট অটোমেশন",href:"/settings/comment-automation",service:"ai"},
];
const aiViews=["ai","knowledge","channels","website","comment-automation"];
export function UnifiedSectionTabs({root,mode,locale,view,requests=false}:{
 root:UnifiedRoot;mode:BusinessMode;locale:"bn"|"en";view:readonly string[];requests?:boolean;
}){
 const inAi=root==="settings"&&aiViews.includes(view[0]??"")&&!(view[0]==="channels"&&view.length>1&&view[1]!=="website");
 const available=(inAi?aiTabs:tabs[root])?.filter(tab=>enabledUnifiedService(mode,tab.service)&&
   (tab.href!=="/orders/scan"||process.env.BRIOFOLD_COMMERCE_SCAN_ENABLED==="true")&&
   (tab.href!=="/reports/orders"||process.env.BRIOFOLD_COMMERCE_REPORTS_ENABLED==="true"))??[];
 if(!available.length)return null;
 const raw="/"+root+(view.length?"/"+view.join("/"):"");
 const active=raw==="/settings/website"?"/settings/channels/website":raw==="/payments/links"&&requests?"/payments/links?view=requests":raw;
 return <nav className={styles.tabs} aria-label={locale==="bn"?"পৃষ্ঠার বিভাগ":"Page sections"}>
  {available.map(tab=><Link key={tab.href} href={tab.href}
   className={tab.href===active?styles.active:undefined}
   aria-current={tab.href===active?"page":undefined}>{tab[locale]}</Link>)}
 </nav>;
}
