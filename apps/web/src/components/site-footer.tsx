"use client";
import {usePathname,useSelectedLayoutSegment} from "next/navigation";
import Link from "next/link";
import {siteCopy,type Locale} from "../lib/site-copy";

export function SiteFooter({locale}:{locale:Locale}){
 const pathname=usePathname();
 const segment=useSelectedLayoutSegment();
 const path=(pathname||"/").replace(/^\/(bn|en)(?=\/|$)/,"")||"/";
 if(["dashboard","inbox","orders","payments","customers","reports","settings","pay","checkout","receipt","invoice"].includes(segment||"")||/^\/(?:dashboard|inbox|orders|payments|customers|reports|settings|workspaces|w|account|admin|login|register|forgot-password|verify-email|pay|checkout|receipt|invoice)(?:\/|$)/.test(path))return null;
 const t=siteCopy[locale];
 return <footer className="site-footer ek-public-footer">
  <div className="footer-inner">
   <div className="footer-main"><Link className="footer-brand" href="/">ekmivo<span>.</span></Link><p>{t.footerLine}</p></div>
   <nav aria-label={locale==="bn"?"ফুটার মেনু":"Footer navigation"}>
    <Link href="/payment-gateway">Payment Gateway</Link>
    <Link href="/ai-bot">AI Bot</Link>
    <Link href="/pricing">Pricing</Link>
    <Link href="/developers">Developers</Link>
    <Link href="/login">{t.login}</Link>
    <Link href="/register">{t.register}</Link>
   </nav>
   <div className="footer-bottom"><span>© {new Date().getFullYear()} Ekmivo. {t.rights}</span><Link href="/status">{locale==="bn"?"সেবার অবস্থা":"Service status"}</Link></div>
  </div>
 </footer>;
}
