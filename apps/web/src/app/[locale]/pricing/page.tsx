import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {PricingExperience} from "../../../components/pricing-experience";
import {publicPaymentPlans} from "../../../lib/server/payment-plans";
import {publicSubscriptionOffers} from "../../../lib/server/public-subscription-offers";
import {pricingPlans} from "../../../lib/pricing-catalog";
import {currentUser} from "../../../lib/server/auth";
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
 let signedIn=false;
 try{signedIn=!!await currentUser()}catch{signedIn=false}
 const bn=locale==="bn";
 return <main className="bf-pub bf-pricing" lang={locale} id="main">
  <section className="bf-hero bf-w">
   <span className="bf-pill"><i aria-hidden="true"/>{bn?"প্ল্যান ও দাম":"Plans and pricing"}</span>
   <h1>{bn?"যা লাগবে, শুধু সেটাই নিন।":"Pay only for what you use."}<span>{bn?"লুকানো চার্জ নেই।":"No hidden charges."}</span></h1>
   <p>{bn?"পেমেন্ট গেটওয়ে মাসিক বা বার্ষিক। এআই বট চলে প্রিপেইড ক্রেডিটে, যতটুকু ব্যবহার ততটুকু।":"The payment gateway is monthly or yearly. The AI bot runs on prepaid credit: you pay for what it uses."}</p>
  </section>
  {query.purchase&&<p className="bf-note bf-w" role="alert">{bn?"নির্বাচনটা আর পাওয়া যাচ্ছে না। আবার একটা প্ল্যান বেছে নিন।":"That selection is no longer available. Please choose a plan again."}</p>}
  <div className="bf-w">
   <PricingExperience locale={locale} plans={pricingPlans(offers,plans)} unavailable={plansUnavailable&&offersUnavailable}
    signedIn={signedIn} freeEnabled={process.env.BRIOFOLD_AI_FREE_CREDIT_ENABLED==="true"} initialTab={tab}/>
  </div>
 </main>;
}
