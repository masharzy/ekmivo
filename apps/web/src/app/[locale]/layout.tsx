import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{locale:string}> }): Promise<Metadata> {
 const {locale}=await params;
 const bn=locale==="bn";
 const title=bn?"Ekmivo — Payment Gateway ও AI Bot":"Ekmivo — Payments and AI, made clearer";
 const description=bn
  ?"Ekmivo দিয়ে পেমেন্ট লিংক, ইনভয়েস ও চেকআউট পরিচালনা করুন। AI Bot দিয়ে কাস্টমার কথোপকথন ও স্টোরের তথ্য একসঙ্গে সামলান।"
   :"Create payment links, invoices and checkout experiences with Ekmivo. Connect customer conversations, Store knowledge and payments with AI Bot.";
 return {title,description,openGraph:{title,description,type:"website",siteName:"Ekmivo"}};
}

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { SiteFooter } from "../../components/site-footer";
import { currentUser } from "../../lib/server/auth";

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "bn" && locale !== "en") notFound();
  const jar=await cookies();
  const storedTheme = jar.get("ekmivo-theme")?.value;
  const initialTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  // Always retain the chrome components. They decide visibility from the current
  // client pathname; a retained layout must not omit the header after navigation.
  // A temporary auth-store outage must not take down the public marketing site.
  let user:Awaited<ReturnType<typeof currentUser>>=null;
  if(jar.has("ekmivo-session")){
   try{user=await currentUser();}catch(error){
    console.error("[ekmivo/public] session lookup unavailable",error instanceof Error?error.message:"unknown error");
   }
  }
  return <><SiteHeader locale={locale} initialTheme={initialTheme} authenticated={!!user} />{children}<SiteFooter locale={locale} /></>;
}
