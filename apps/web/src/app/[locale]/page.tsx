import { notFound } from "next/navigation";
import { MarketingExperience } from "../../components/landing/marketing-experience";
import {PublicPricing} from "../../components/public-pricing";
import {PublicSubscriptionOfferSlot} from "../../components/public-subscription-offer-slot";
import {Suspense} from "react";

export function generateStaticParams() { return [{ locale: "bn" }, { locale: "en" }]; }

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
 const {locale} = await params;
 if (locale !== "bn" && locale !== "en") notFound();
 return <>
  <a className="skip-link" href="#main">{locale === "bn" ? "মূল অংশে যান" : "Skip to content"}</a>
  <MarketingExperience locale={locale} pricing={<Suspense fallback={<div className="ekm-plan-skeleton" role="status" aria-label={locale==="bn"?"প্ল্যানের তথ্য লোড হচ্ছে":"Loading plans"}><span/><span/><span/><span/></div>}><PublicPricing locale={locale} compact/></Suspense>}
    aiPricing={<Suspense fallback={null}><PublicSubscriptionOfferSlot locale={locale} product="ai_credit"/></Suspense>}
    bundlePricing={<Suspense fallback={null}><PublicSubscriptionOfferSlot locale={locale} product="bundle"/></Suspense>}/>
 </>;
}
