"use client";
import {usePathname} from "next/navigation";
import Link from "next/link";
import {siteCopy,type Locale} from "../lib/site-copy";

export function SiteFooter({locale}:{locale:Locale}){
 const pathname=usePathname();
 const path=(pathname||"/").replace(/^\/(bn|en)(?=\/|$)/,"")||"/";
 if(/^\/(?:workspaces|w|account|admin|login|register|forgot-password|verify-email)(?:\/|$)/.test(path))return null;
 const t=siteCopy[locale];
 return <footer className="site-footer ek-public-footer">
  <div className="footer-inner">
   <div className="footer-main"><Link className="footer-brand" href={`/${locale}`}>ekmivo<span>.</span></Link><p>{t.footerLine}</p></div>
   <nav aria-label={locale==="bn"?"ফুটার মেনু":"Footer navigation"}>
    <Link href={`/${locale}/payment-gateway`}>Payment Gateway</Link>
    <Link href={`/${locale}/ai-bot`}>AI Bot</Link>
    <Link href={`/${locale}/pricing`}>Pricing</Link>
    <Link href={`/${locale}/developers`}>Developers</Link>
    <Link href={`/${locale}/login`}>{t.login}</Link>
    <Link href={`/${locale}/register`}>{t.register}</Link>
   </nav>
   <div className="footer-bottom"><span>© {new Date().getFullYear()} Ekmivo. {t.rights}</span><Link href={`/${locale}/status`}>{locale==="bn"?"সেবার অবস্থা":"Service status"}</Link></div>
  </div>
 </footer>;
}
