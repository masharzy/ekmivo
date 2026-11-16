import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {ServiceStatus} from "../../../components/service-status";

export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;
 return {title:locale==="bn"?"সেবার অবস্থা | Briofold":"Service status | Briofold"};
}

// The locale layout already renders the public header and footer.
export default async function Status({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 const bn=locale==="bn";
 return <main className="bf-pub" lang={locale} id="main">
  <section className="bf-hero bf-w">
   <h1>{bn?"সেবার অবস্থা":"Service status"}</h1>
   <p>{bn?"Briofold-এর প্রতিটা সার্ভিস এখন চালু আছে কি না।":"Whether each Briofold service is working right now."}</p>
  </section>
  <div className="bf-w">
   <ServiceStatus locale={locale}/>
   <p className="bf-status-note">{bn?"আপনার নিজের ফোন সংযুক্ত আছে কি না, বা কোনো নির্দিষ্ট লেনদেন সফল হয়েছে কি না, তা ড্যাশবোর্ডে দেখুন।":"To see whether your own phone is connected, or whether a specific transaction succeeded, check your dashboard."}</p>
  </div>
 </main>;
}
