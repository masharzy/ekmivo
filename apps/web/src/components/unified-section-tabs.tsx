import Link from "next/link";
import {enabledUnifiedService,type BusinessMode,type UnifiedRoot} from "../lib/unified-navigation";
import styles from "./unified-section-tabs.module.css";

type Tab={en:string;bn:string;href:string;service:"ai"|"payments"|"common"};
const tabs:Partial<Record<UnifiedRoot,readonly Tab[]>>={
 inbox:[
  {en:"Conversations",bn:"কথোপকথন",href:"/inbox",service:"ai"},
  {en:"Comments",bn:"কমেন্ট",href:"/inbox/comments",service:"ai"},
  {en:"Saved replies",bn:"সেভ করা উত্তর",href:"/inbox/saved-replies",service:"ai"},
  {en:"Agent Desk",bn:"AI এজেন্ট",href:"/inbox/agent-desk",service:"ai"},
  {en:"Tickets",bn:"টিকিট",href:"/inbox/tickets",service:"ai"},
 ],
 orders:[
  {en:"Orders",bn:"অর্ডার",href:"/orders",service:"common"},
  {en:"Products",bn:"পণ্য",href:"/orders/products",service:"common"},
  {en:"Inventory",bn:"স্টক",href:"/orders/inventory",service:"payments"},
  {en:"Delivery",bn:"ডেলিভারি",href:"/orders/delivery",service:"payments"},
  {en:"Returns",bn:"রিটার্ন",href:"/orders/returns",service:"payments"},
  {en:"Coupons",bn:"কুপন",href:"/orders/coupons",service:"payments"},
 ],
 payments:[
  {en:"Transactions",bn:"লেনদেন",href:"/payments",service:"payments"},
  {en:"Payment links",bn:"পেমেন্ট লিংক",href:"/payments/links",service:"payments"},
  {en:"Refunds",bn:"রিফান্ড",href:"/payments/refunds",service:"payments"},
 ],
 customers:[
  {en:"Financial records",bn:"আর্থিক রেকর্ড",href:"/customers/financial",service:"payments"},
  {en:"Customers",bn:"গ্রাহক",href:"/customers",service:"common"},
  {en:"Leads",bn:"লিড",href:"/customers/leads",service:"common"},
  {en:"Follow-ups",bn:"ফলো-আপ",href:"/customers/follow-ups",service:"common"},
  {en:"Broadcasts",bn:"ব্রডকাস্ট",href:"/customers/broadcasts",service:"ai"},
  {en:"Bookings",bn:"বুকিং",href:"/customers/bookings",service:"ai"},
  {en:"Posts",bn:"পোস্ট",href:"/customers/posts",service:"ai"},
 ],
 reports:[
  {en:"Overview",bn:"সারসংক্ষেপ",href:"/reports",service:"common"},
  {en:"Payment reports",bn:"পেমেন্ট রিপোর্ট",href:"/reports/payments",service:"payments"},
  {en:"AI reports",bn:"AI রিপোর্ট",href:"/reports/ai",service:"ai"},
 ]
};

export function UnifiedSectionTabs({root,mode,locale,view}:{
 root:UnifiedRoot;mode:BusinessMode;locale:"bn"|"en";view:readonly string[];
}){
 const available=tabs[root]?.filter(tab=>enabledUnifiedService(mode,tab.service))??[];
 if(!available.length)return null;
 const active="/"+root+(view.length?"/"+view.join("/"):"");
 return <nav className={styles.tabs} aria-label={locale==="bn"?"পৃষ্ঠার বিভাগ":"Page sections"}>
  {available.map(tab=><Link key={tab.href} href={tab.href}
   className={tab.href===active?styles.active:undefined}
   aria-current={tab.href===active?"page":undefined}>{tab[locale]}</Link>)}
 </nav>;
}
