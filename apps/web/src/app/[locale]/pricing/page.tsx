import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {PublicPricing} from "../../../components/public-pricing";
import type {SubscriptionProduct} from "../../../lib/public-subscription-offers";

export const metadata:Metadata={title:"Payment Gateway Pricing | Ekmivo"};
export default async function Page({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{product?:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 const requested=(await searchParams).product;
 const product:SubscriptionProduct=requested==="ai_credit"||requested==="bundle"?requested:"payments";
 const bn=locale==="bn";
 return <main className="ekm-price-page" lang={locale}>
  <div className="ekm-price-wrap"><header className="ekm-price-hero">
   <span className="ekm-pill"><i/>{bn?"ব্যবসার সঙ্গে বাড়বে যে প্ল্যান":"Plans with room to grow"}</span>
   <h1>{bn?"আপনার উপযুক্ত প্ল্যান বেছে নিন।":"Find the right fit."}<span>{bn?"কী পাচ্ছেন, পরিষ্কারভাবে জানুন।":"Know exactly what you get."}</span></h1>
   <p>{bn?"Payments, AI prepaid credit ও প্রযোজ্য bundle—এক জায়গায় তুলনা করুন। দাম, ব্যবহারসীমা ও ছাড় সরাসরি প্রকাশিত Ekmivo ক্যাটালগ থেকে আসবে।":"Compare Payments, AI prepaid credits and eligible bundles in one place. Prices, limits and approved savings come directly from the published Ekmivo catalog."}</p>
  </header><PublicPricing locale={locale} selectedProduct={product}/></div>
 </main>;
}
