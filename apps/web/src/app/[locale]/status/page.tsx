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
   <span className="bf-pill"><i aria-hidden="true"/>{bn?"লাইভ অবস্থা":"Live status"}</span>
   <h1>{bn?"সেবার অবস্থা":"Service status"}<span>{bn?"Briofold এখন কেমন চলছে":"How Briofold is running right now"}</span></h1>
   <p>{bn?"পেমেন্ট, এআই বট, চ্যাট আর ড্যাশবোর্ড, সব সার্ভিসের অবস্থা এক জায়গায়।":"Payments, the AI bot, chat and the dashboard: every service in one place."}</p>
  </section>
  <div className="bf-w">
   <ServiceStatus locale={locale}/>
   <p className="bf-status-note">{bn?"আপনার নিজের ফোন সংযুক্ত আছে কি না, বা কোনো নির্দিষ্ট লেনদেন সফল হয়েছে কি না, তা ড্যাশবোর্ডে দেখুন।":"To see whether your own phone is connected, or whether a specific transaction succeeded, check your dashboard."}</p>
  </div>
 </main>;
}
