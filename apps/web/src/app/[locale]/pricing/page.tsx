import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {PricingExperience} from "../../../components/pricing-experience";
import {publicPaymentPlans} from "../../../lib/server/payment-plans";
import {publicSubscriptionOffers} from "../../../lib/server/public-subscription-offers";
import {pricingPlans} from "../../../lib/pricing-catalog";
import {currentUser} from "../../../lib/server/auth";
import {publicFreeCredit} from "../../../lib/server/ai-free-credit";
export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;
 return {title:locale==="bn"?"মূল্য | Briofold":"Pricing | Briofold"};
}

export default async function Page({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{product?:string;purchase?:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 const query=await searchParams;
 const tab=query.product==="ai_credit"?"ai":query.product==="bundle"?"both":"payments";
 const [{plans,unavailable:plansUnavailable},{offers,unavailable:offersUnavailable}]=await Promise.all([publicPaymentPlans(),publicSubscriptionOffers()]);
 const free=await publicFreeCredit();
 let signedIn=false;
 try{signedIn=!!await currentUser()}catch{signedIn=false}
 const bn=locale==="bn";
 return <main className="bf-pub bf-pricing" lang={locale} id="main">
  <section className="bf-hero bf-w">
   <h1>{bn?"প্ল্যান ও দাম":"Plans and pricing"}</h1>
   <p>{bn?"পেমেন্ট গেটওয়ে মাসিক বা বার্ষিক প্ল্যানে। এআই বট চলে রিচার্জ করা ব্যালেন্সে।":"The payment gateway is a monthly or yearly plan. The AI bot runs on a recharged balance."}</p>
  </section>
  {query.purchase&&<p className="bf-note bf-w" role="alert">{bn?"নির্বাচনটা আর পাওয়া যাচ্ছে না। আবার একটা প্ল্যান বেছে নিন।":"That selection is no longer available. Please choose a plan again."}</p>}
  <div className="bf-w">
   <PricingExperience locale={locale} plans={pricingPlans(offers,plans)} unavailable={plansUnavailable&&offersUnavailable}
    signedIn={signedIn} freeEnabled={free.enabled} freeAmountMinor={free.amountMinor} initialTab={tab}/>
  </div>
 </main>;
}
