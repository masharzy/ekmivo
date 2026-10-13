import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{locale:string}> }): Promise<Metadata> {
 const {locale}=await params;
 const bn=locale==="bn";
 const title=bn?"Ekmivo — পেমেন্ট, চেকআউট ও AI সেবা":"Ekmivo — Payments and AI, made clearer";
 const description=bn
  ?"Ekmivo-তে পেমেন্ট লিংক, ইনভয়েস, চেকআউট ও API দিয়ে পেমেন্ট সংগ্রহ করুন। SMS রসিদ মিলিয়ে পেমেন্ট যাচাই করুন। AI সেবাও তৈরি হচ্ছে।"
   :"Create payment links, invoices and checkout experiences with Ekmivo. Verify eligible wallet receipts and explore the upcoming AI customer-conversation workspace.";
 return {title,description,openGraph:{title,description,type:"website",siteName:"Ekmivo"}};
}

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { SiteFooter } from "../../components/site-footer";

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "bn" && locale !== "en") notFound();
  const storedTheme = (await cookies()).get("ekmivo-theme")?.value;
  const initialTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  const isApp = (await headers()).get("x-ekmivo-application") === "1";
  if(isApp) return <>{children}</>;
  return <><SiteHeader locale={locale} initialTheme={initialTheme} />{children}<SiteFooter locale={locale} /></>;
}
