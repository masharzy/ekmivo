import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{locale:string}> }): Promise<Metadata> {
 const {locale}=await params;
 const bn=locale==="bn";
 const title=bn?"Ekmivo — পেমেন্ট লিংক ও AI সেবা":"Ekmivo — Payments and AI, made clearer";
 const description=bn
  ?"Ekmivo-তে পেমেন্ট লিংক তৈরি করুন এবং লেনদেনের অবস্থা দেখুন। কাস্টমারের মেসেজ ও AI সহায়তার সেবাও তৈরি হচ্ছে।"
   :"Create payment links and verify eligible mobile-wallet payments with Ekmivo. Explore the upcoming AI workspace for customer conversations and automation.";
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
