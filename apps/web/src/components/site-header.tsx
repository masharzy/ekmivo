"use client";

import Link from "next/link";
import {usePathname,useSelectedLayoutSegment} from "next/navigation";
import {SiteControls} from "./site-controls";
import type {Locale} from "../lib/site-copy";

type Theme="system"|"light"|"dark";
const publicLinks=[
 {href:"/",en:"Home",bn:"হোম"},
 {href:"/payment-gateway",en:"Payments",bn:"পেমেন্টস"},
 {href:"/ai-bot",en:"AI Bot",bn:"এআই বট"},
 {href:"/pricing",en:"Pricing",bn:"মূল্য"},
 {href:"/developers",en:"Developers",bn:"ডেভেলপারস"}
] as const;

/** One homepage-style public header. Authentication comes from the server layout. */
export function SiteHeader({locale,initialTheme,authenticated=false}:{locale:Locale;initialTheme:Theme;authenticated?:boolean}){
 const pathname=usePathname();
 const segment=useSelectedLayoutSegment();
 const visiblePath=(pathname||"/").replace(/^\/(bn|en)(?=\/|$)/,"")||"/";
 if(["setup","dashboard","inbox","orders","payments","sms-data","invoices","customers","reports","settings","workspaces","w","account","admin","pay","checkout","receipt","invoice"].includes(segment||"")||/^\/(?:setup|dashboard|inbox|orders|payments|sms-data|invoices|customers|reports|settings|workspaces|w|account|admin|pay|checkout|receipt|invoice)(?:\/|$)/.test(visiblePath))return null;
 const actionHref=authenticated?"/dashboard":visiblePath==="/login"?"/register":"/login";
 const actionLabel=authenticated?(locale==="bn"?"ড্যাশবোর্ড":"Dashboard"):visiblePath==="/login"?(locale==="bn"?"অ্যাকাউন্ট খুলুন":"Create account"):(locale==="bn"?"লগইন":"Sign in");
 return <header className="ekm-nav" lang={locale} aria-label={locale==="bn"?"প্রধান নেভিগেশন":"Main navigation"}>
  <Link className="ekm-nav-logo" href="/" aria-label="Ekmivo home">ekmivo<b>.</b></Link>
  <nav className="ekm-nav-links" aria-label={locale==="bn"?"পাবলিক পেজ":"Public pages"}>
   {publicLinks.map(link=><Link key={link.href} href={link.href} aria-current={visiblePath===link.href?"page":undefined}>{link[locale]}</Link>)}
  </nav>
  <SiteControls locale={locale} initialTheme={initialTheme} marketing/>
  <Link className="ekm-nav-signin" href={actionHref}>{actionLabel}</Link>
 </header>;
}
