import Link from "next/link";
import type {Locale} from "../lib/site-copy";
import {PublicMotion} from "./public-motion";
import {PaymentScrollJourney} from "./payment-scroll-journey";
import {PaymentEditorialArt,PaymentEditorialIcon} from "./payment-editorial-art";

type TextPair={en:string;bn:string};
type Step={title:TextPair;body:TextPair};
const bilingual=(en:string,bn:string):TextPair=>({en,bn});
const flow:Step[]=[
 {title:bilingual("Set up your business","পেমেন্ট নেওয়ার ব্যবস্থা করুন"),body:bilingual("Choose your receiving payment options and connect your merchant receipt device securely.","টাকা পাওয়ার জন্য আপনার বিকাশ, নগদ বা রকেট অ্যাকাউন্ট যোগ করুন। পেমেন্টের SMS পাওয়ার ফোনটিও Ekmivo-এর সঙ্গে যুক্ত করুন।")},
 {title:bilingual("Create a payment request","পেমেন্টের অনুরোধ তৈরি করুন"),body:bilingual("Generate a link or invoice, use hosted checkout, or integrate the merchant API in your own site or app.","পেমেন্ট লিংক বা ইনভয়েস তৈরি করুন। নিজের ওয়েবসাইট বা অ্যাপ থাকলে API দিয়ে চেকআউটও যুক্ত করতে পারবেন।")},
 {title:bilingual("Let customers pay","কাস্টমার টাকা পাঠাবেন"),body:bilingual("Your customer sees the amount and available wallet options on a simple checkout. They pay using their own wallet app.","চেকআউটে টাকার পরিমাণ ও পেমেন্টের মাধ্যম দেখে কাস্টমার নিজের বিকাশ, নগদ বা রকেট অ্যাপ দিয়ে টাকা পাঠাবেন।")},
 {title:bilingual("We check the payment evidence","পেমেন্টের SMS যাচাই হবে"),body:bilingual("The connected merchant device securely forwards relevant payment notifications. Ekmivo reviews eligible evidence on its server before confirming a payment.","মার্চেন্টের ফোনে আসা পেমেন্টের SMS নিরাপদে Ekmivo-তে পৌঁছাবে। সার্ভারে যাচাই শেষে পেমেন্টের অবস্থা আপডেট হবে।")},
 {title:bilingual("Follow the outcome","পেমেন্টের ফলাফল দেখুন"),body:bilingual("Verified payments appear in the dashboard and can trigger signed merchant webhooks. Incomplete or uncertain payments stay visibly pending.","যাচাই করা পেমেন্ট ড্যাশবোর্ডে দেখা যাবে। ওয়েবহুক দিয়েও নিজের সিস্টেমে আপডেট নিতে পারবেন। যাচাই করা না গেলে পেমেন্ট অপেক্ষমাণ থাকবে।")}
];
const benefits=[
 {index:"01",label:bilingual("More than a payment link","পেমেন্ট নেওয়ার একাধিক উপায়"),body:bilingual("Use payment requests, invoices, hosted checkout and developer APIs based on where your customers buy.","পেমেন্ট লিংক, ইনভয়েস কিংবা ওয়েবসাইটের চেকআউট—আপনার ব্যবসায় যেটা সুবিধাজনক, সেটাই ব্যবহার করুন।"),tag:"↗"},
 {index:"02",label:bilingual("A clear payment state","কোন পেমেন্ট কোথায় আছে, দেখুন"),body:bilingual("Payment requests keep a clear status. A confirmation screen alone does not count as payment evidence.","কোন পেমেন্ট যাচাই হয়েছে, কোনটি এখনো অপেক্ষমাণ—ড্যাশবোর্ড থেকেই দেখুন। শুধু কাস্টমারের দেওয়া স্ক্রিনশট দেখে পেমেন্ট সফল ধরা হয় না।"),tag:"✓"},
 {index:"03",label:bilingual("Built for integrations","ওয়েবসাইট বা অ্যাপেও ব্যবহার করুন"),body:bilingual("Use sandbox and live environments, scoped API keys, status lookups and signed merchant webhooks.","API দিয়ে পেমেন্ট তৈরি করুন, অবস্থা দেখুন এবং ওয়েবহুকের মাধ্যমে আপডেট পান। Live করার আগে Sandbox-এ পরীক্ষা করতে পারবেন।"),tag:"⌘"},
 {index:"04",label:bilingual("You remain in control","সমস্যা হলে নিয়ন্ত্রণ আপনার"),body:bilingual("Exceptions and refunds remain visible for merchants to review and handle. Ekmivo does not automatically send refund money.","কোনো পেমেন্ট যাচাই না হলে বা টাকা ফেরতের অনুরোধ এলে মার্চেন্ট বিষয়টি দেখে ব্যবস্থা নিতে পারবেন। টাকা ফেরত পাঠানোর কাজ Ekmivo নিজে করে না।"),tag:"◎"}
];
const audiences=[
 {title:bilingual("Online shops","অনলাইন শপ"),body:bilingual("Add checkout to your business or create a payment link for a direct order.","নিজের দোকানের ওয়েবসাইটে চেকআউট যুক্ত করুন। ফেসবুক বা মেসেজে অর্ডার পেলেও পেমেন্ট লিংক দিতে পারবেন।")},
 {title:bilingual("Courses & services","কোর্স ও সেবাভিত্তিক ব্যবসা"),body:bilingual("Collect course fees, bookings and project payments with clear request records.","কোর্স ফি, বুকিং বা কাজের বিলের জন্য ইনভয়েস পাঠান। পেমেন্ট এসেছে কি না, তা দেখুন।")},
 {title:bilingual("Developers & platforms","ডেভেলপার ও অনলাইন প্ল্যাটফর্ম"),body:bilingual("Create payment requests from your application and receive server-side status updates.","API দিয়ে নিজের অ্যাপ থেকে পেমেন্ট তৈরি করুন। পেমেন্টের অবস্থা জানতে ওয়েবহুক ব্যবহার করুন।")}
];
const faqs=[
 {q:bilingual("Do customers install Ekmivo?","কাস্টমারকে কি Ekmivo অ্যাপ ইনস্টল করতে হবে?"),a:bilingual("No. Customers use web checkout and their usual wallet apps. The separate Ekmivo Android receipt bridge belongs to the merchant.","না। কাস্টমার ওয়েবসাইটে চেকআউট খুলে নিজের বিকাশ, নগদ বা রকেট ব্যবহার করবেন। Ekmivo-এর Android অ্যাপ শুধু মার্চেন্টের ফোনে লাগে।")},
 {q:bilingual("Does every payment verify immediately?","সব পেমেন্ট কি সঙ্গে সঙ্গে যাচাই হয়?"),a:bilingual("No. Verification depends on eligible payment evidence reaching the service and being confirmed. Uncertain cases remain pending rather than showing a false success.","সব পেমেন্ট সঙ্গে সঙ্গে যাচাই নাও হতে পারে। ফোন থেকে রসিদ পৌঁছে যাচাই হতে হবে। নিশ্চিত না হওয়া পর্যন্ত পেমেন্ট সফল দেখাবে না।")},
 {q:bilingual("What if the merchant phone loses internet?","মার্চেন্টের ফোনে ইন্টারনেট না থাকলে কী হবে?"),a:bilingual("Receipts captured by the installed bridge can be queued securely and forwarded when connectivity returns. A powered-off or force-stopped phone cannot collect new receipts during that time.","ফোনে পাওয়া SMS ইন্টারনেট না থাকলেও নিরাপদে জমা রাখা যায়। সংযোগ ফিরলে অ্যাপ সেগুলো পাঠানোর চেষ্টা করবে। তবে ফোন বন্ধ থাকলে বা অ্যাপ force-stop করলে নতুন SMS ধরা যাবে না।")},
 {q:bilingual("Can I integrate Ekmivo with my own website?","নিজের ওয়েবসাইটে কি Ekmivo ব্যবহার করা যাবে?"),a:bilingual("Yes. Merchant APIs, hosted checkout and signed webhooks support integrations. Test in sandbox before enabling a live payment workflow.","হ্যাঁ। API ও Hosted Checkout ব্যবহার করে নিজের ওয়েবসাইট বা অ্যাপে Ekmivo যুক্ত করতে পারবেন। প্রথমে Sandbox-এ পরীক্ষা করে নিন।")}
];
const paymentCopy={
 en:{kicker:"PAYMENT GATEWAY / EKMIVO",title:"Payments that fit",marked:"the way you work.",intro:"Accept mobile-wallet payments through checkout, invoices or links. Track every request, verify eligible receipts and keep your own business systems informed.",primary:"Create your account",secondary:"Explore the workflow",strip:["PAYMENT LINKS","INVOICES","HOSTED CHECKOUT","API & WEBHOOKS"],sectionLabel:"01 / THE COMPLETE JOURNEY",flowTitle:"From your request",flowMarked:"to a clear result.",flowDesc:"A familiar experience for customers. A traceable process for your business.",verifyLabel:"02 / PAYMENT CONFIRMATION",verifyTitle:"Verification happens",verifyMarked:"behind the scenes.",verifyDescription:"Ekmivo uses evidence received through authorized merchant sources to determine the payment status. The verification logic runs securely on our backend; customers do not need to manually enter a transaction ID or upload a screenshot as part of the normal flow.",phoneTitle:"Connect the phone that receives payments.",phoneBody:"The companion Android app relays relevant wallet receipts to your Ekmivo business. It keeps captured receipts in a secure offline queue when the connection drops, then retries automatically when internet returns. A device that is powered off or force-stopped cannot receive new messages.",proofTitle:"When a payment needs attention",proofBody:"Missing or uncertain evidence is not treated as success. The merchant can review the request, and refund cases are handled by the seller outside Ekmivo.",backendKicker:"03 / WHY EKMIVO",backendTitle:"Built for real",backendMarked:"business workflows.",forLabel:"04 / WHO IT’S FOR",forTitle:"One payment service.",forMarked:"Different ways to use it.",faqKicker:"FREQUENT QUESTIONS",faqTitle:"Worth knowing",faqMarked:"before you begin.",endKicker:"START WITH PAYMENTS",endTitle:"Make payment collection",endMarked:"part of your workflow.",endBody:"Set up your business, connect your merchant receiving options and choose the checkout approach that suits your business.",endButton:"Get started",note:"Product capabilities depend on configuration and available payment methods. Ekmivo is not the wallet provider."},
 bn:{
  kicker:"পেমেন্ট গেটওয়ে",title:"ব্যবসার পেমেন্ট",marked:"এক জায়গা থেকে সামলান।",
  intro:"পেমেন্ট লিংক ও ইনভয়েস তৈরি করুন, অথবা ওয়েবসাইটে চেকআউট যুক্ত করুন। কাস্টমার টাকা পাঠানোর পর পেমেন্ট যাচাই ও আপডেট দেখুন একই ড্যাশবোর্ডে।",
  primary:"অ্যাকাউন্ট তৈরি করুন",secondary:"ধাপগুলো দেখুন",
  strip:["পেমেন্ট লিংক","ইনভয়েস","চেকআউট","API ও ওয়েবহুক"],
  sectionLabel:"কীভাবে কাজ করে",flowTitle:"পেমেন্ট নেওয়ার",flowMarked:"পুরো প্রক্রিয়া।",
  flowDesc:"আপনার পেমেন্ট অ্যাকাউন্ট যুক্ত করা থেকে শুরু করে কাস্টমারের পেমেন্ট যাচাই—প্রতিটি ধাপ দেখুন।",
  verifyLabel:"পেমেন্ট যাচাই",verifyTitle:"রসিদ যাচাই হবে",verifyMarked:"স্বয়ংক্রিয়ভাবে।",
  verifyDescription:"মার্চেন্টের অনুমোদিত ফোন থেকে পাওয়া পেমেন্টের SMS Ekmivo-এর সার্ভারে যাচাই করা হয়। স্বাভাবিক অবস্থায় কাস্টমারকে আলাদা করে TrxID লিখতে বা স্ক্রিনশট দিতে হয় না।",
  phoneTitle:"পেমেন্টের SMS পাওয়া ফোনটি যুক্ত করুন।",
  phoneBody:"যে ফোনে পেমেন্টের SMS আসে, সেখানে Ekmivo অ্যাপ যুক্ত করতে হবে। অ্যাপটি প্রয়োজনীয় SMS নিরাপদে সার্ভারে পাঠায়। ইন্টারনেট না থাকলে ইতিমধ্যে পাওয়া SMS জমা থাকে এবং সংযোগ ফিরলে পাঠানোর চেষ্টা করে। ফোন বন্ধ বা অ্যাপ force-stop থাকলে নতুন SMS ধরা যাবে না।",
  proofTitle:"পেমেন্ট যাচাই না হলে কী হবে?",
  proofBody:"যাচাই নিশ্চিত না হওয়া পর্যন্ত পেমেন্ট সফল দেখাবে না। মার্চেন্ট ড্যাশবোর্ড থেকে অবস্থা দেখতে পারবেন। টাকা ফেরতের প্রয়োজন হলে বিক্রেতা নিজেই ব্যবস্থা নেবেন।",
  backendKicker:"Ekmivo কেন ব্যবহার করবেন",backendTitle:"পেমেন্ট নেওয়া থেকে",backendMarked:"হিসাব রাখা পর্যন্ত।",
  forLabel:"কারা ব্যবহার করতে পারবেন",forTitle:"ছোট দোকান থেকে",forMarked:"নিজস্ব অনলাইন প্ল্যাটফর্ম।",
  faqKicker:"সাধারণ প্রশ্ন",faqTitle:"শুরু করার আগে",faqMarked:"জেনে নিন।",
  endKicker:"পেমেন্ট নেওয়া শুরু করুন",endTitle:"আপনার ব্যবসাকে",endMarked:"Ekmivo-তে যুক্ত করুন।",
  endBody:"পেমেন্ট অ্যাকাউন্ট যুক্ত করুন। তারপর প্রয়োজন অনুযায়ী লিংক, ইনভয়েস বা চেকআউট ব্যবহার করুন।",
  endButton:"অ্যাকাউন্ট তৈরি করুন",
  note:"পেমেন্ট পদ্ধতি ও সুবিধা আপনার সেটআপের ওপর নির্ভর করবে। Ekmivo বিকাশ, নগদ বা রকেটের বিকল্প নয়।"
}
} as const;
function EmSectionTitle({eyebrow,title,marked}:{eyebrow:string;title:string;marked:string}){
 return <div className="ek-product-heading"><span className="ek-public-kicker">{eyebrow.replace(/^[0-9০-৯]+\s*\/\s*/, "")}</span><h2>{title} <span className="ek-public-brush">{marked}</span></h2></div>;
}
export function PaymentGatewayPage({locale}:{locale:Locale}){
 const t=paymentCopy[locale],bn=locale==="bn";
 return <PublicMotion><main className="ek-product-page ek-pg-detail pg-editorial pg-compact-product" lang={locale}>
  <div className="ek-pg-mast"><div className="ek-public-wrap">
   <div className="pg-hero-kicker"><span aria-hidden="true">↗</span> Payment Gateway</div>
   <div className="ek-pg-mast-grid">
    <div className="ek-pg-intro">
     <h1>{bn?"ব্যবসার পেমেন্ট এক জায়গায়":"Your business payments, in one place."}</h1>
     <p>{t.intro}</p>
     <div className="ek-pg-mast-actions">
      <Link href={`/${locale}/register`} className="ek-public-action">{t.primary}<span aria-hidden="true">↗</span></Link>
      <a href="#payment-workflow" className="ek-pg-text-link">{t.secondary} <span aria-hidden="true">↓</span></a>
     </div>
    </div>
   </div>
  </div></div>
  <nav className="ek-pg-section-nav" aria-label={bn?"এই পেজে":"On this page"}><div className="ek-public-wrap">
   <a href="#payment-workflow">{bn?"কীভাবে কাজ করে":"How it works"}</a>
   <a href="#payment-receipts">{bn?"পেমেন্ট যাচাই":"Payment confirmation"}</a>
   <a href="#payment-features">{bn?"সুবিধা":"Capabilities"}</a>
   <a href="#payment-audiences">{bn?"যাদের জন্য":"Use cases"}</a>
   <a href="#payment-questions">{bn?"প্রশ্ন ও উত্তর":"FAQs"}</a>
  </div></nav>
  <section id="payment-workflow" className="ek-public-section ek-flow-section"><div className="ek-public-wrap">
   <EmSectionTitle eyebrow={t.sectionLabel} title={t.flowTitle} marked={t.flowMarked}/><p className="ek-product-section-lead">{t.flowDesc}</p>
   <PaymentEditorialArt locale={locale}/>
   <PaymentScrollJourney locale={locale} steps={flow.map(step=>({title:step.title[locale],body:step.body[locale]}))}/>
  </div></section>
  <section id="payment-receipts" className="ek-public-section ek-evidence-section"><div className="ek-public-wrap ek-evidence-layout">
   <div className="ek-evidence-copy"><EmSectionTitle eyebrow={t.verifyLabel} title={t.verifyTitle} marked={t.verifyMarked}/><p>{t.verifyDescription}</p></div>
   <div className="ek-evidence-stack">
    <article className="ek-sketch-panel"><span className="ek-sketch-icon"><PaymentEditorialIcon kind="phone"/></span><h3>{t.phoneTitle}</h3><p>{t.phoneBody}</p></article>
    <article className="ek-sketch-panel"><span className="ek-sketch-icon"><PaymentEditorialIcon kind="check"/></span><h3>{t.proofTitle}</h3><p>{t.proofBody}</p></article>
   </div>
  </div></section>
  <section id="payment-features" className="ek-public-section ek-benefits-section"><div className="ek-public-wrap"><EmSectionTitle eyebrow={t.backendKicker} title={t.backendTitle} marked={t.backendMarked}/>
   <div className="ek-public-benefits">{benefits.map((card,i)=><article key={card.index} className={"ek-public-benefit benefit-"+i}><div className="ek-benefit-symbol"><PaymentEditorialIcon kind={(["link","check","code","phone"] as const)[i%4]}/></div><h3>{card.label[locale]}</h3><p>{card.body[locale]}</p></article>)}</div>
  </div></section>
  <section id="payment-audiences" className="ek-public-section ek-audience-section"><div className="ek-public-wrap"><EmSectionTitle eyebrow={t.forLabel} title={t.forTitle} marked={t.forMarked}/>
   <div className="ek-public-audiences">{audiences.map(item=><article key={item.title.en}><span>EKMIVO</span><h3>{item.title[locale]}</h3><p>{item.body[locale]}</p></article>)}</div>
  </div></section>
  <section id="payment-questions" className="ek-public-section ek-public-faq"><div className="ek-public-wrap ek-faq-layout"><EmSectionTitle eyebrow={t.faqKicker} title={t.faqTitle} marked={t.faqMarked}/>
   <div className="ek-public-questions">{faqs.map((item,i)=><details key={i}><summary>{item.q[locale]}<b aria-hidden="true">+</b></summary><p>{item.a[locale]}</p></details>)}</div>
  </div></section>
  <section className="ek-pg-finish"><div className="ek-public-wrap"><div><span className="ek-public-kicker">{t.endKicker}</span><h2>{bn?"পেমেন্টের ব্যবস্থা করুন।":"Less payment busywork."}<br/><span className="pg-hero-brush">{bn?"এবার ব্যবসায় মন দিন।":"More room for business."}</span></h2><p>{t.endBody}</p></div><Link href={`/${locale}/register`} className="ek-public-action">{t.endButton}<span aria-hidden="true">↗</span></Link></div></section>
 </main></PublicMotion>;
}

type ComingSlug="ai-bot"|"pricing"|"developers";
const upcoming={
 "ai-bot":{
  en:{kicker:"AI BOT / COMING SOON",title:"Conversations, with",mark:"room to grow.",body:"Our AI Bot service is not ready yet. Full development will begin soon. This page will be updated as the product takes shape.",label:"WHAT WE'RE PLANNING",items:[["Customer conversations","A shared inbox for supported channels and your team."],["AI assistance","Help with common questions using approved business information."],["Human control","A straightforward way for a teammate to step in when needed."]],availability:"Development has not been completed. Features and supported channels are not available for general use yet.",back:"Back to homepage"},
  bn:{kicker:"AI Bot / কাজ চলছে",title:"AI Bot",mark:"শিগগিরই আসছে।",
 body:"Ekmivo AI Bot এখনো চালু হয়নি। সেবাটির মূল কাজ শিগগিরই শুরু হবে। কোন কোন সুবিধা পাওয়া যাবে, সে বিষয়ে আপডেট এখানেই জানানো হবে।",
 label:"যে সুবিধাগুলো নিয়ে পরিকল্পনা চলছে",
 items:[["সব মেসেজ এক জায়গায়","যেসব চ্যানেল সমর্থিত হবে, সেখানকার কাস্টমার মেসেজ এক ইনবক্সে দেখা যাবে।"],["AI-এর সাহায্যে উত্তর","ব্যবসার তথ্য ব্যবহার করে সাধারণ প্রশ্নের উত্তর দিতে AI সাহায্য করবে।"],["প্রয়োজনে নিজেই উত্তর দিন","AI-এর বদলে আপনার টিম যেন সহজে কাস্টমারের সঙ্গে কথা বলতে পারে, সেই ব্যবস্থা থাকবে।"]],
 availability:"AI Bot এখনো ব্যবহার করা যাচ্ছে না। চ্যানেল ও ফিচার চালুর আগে প্রয়োজনীয় পরীক্ষা ও অনুমোদন শেষ করতে হবে।",back:"হোমপেজে ফিরুন"}
 },
 "pricing":{
  en:{kicker:"PRICING / IN PREPARATION",title:"The right plan,",mark:"on your terms.",body:"We're preparing clear plans for Payments and AI Bot. Final prices, limits and billing details have not been announced.",label:"WHAT YOU'LL FIND HERE",items:[["Payments plans","Pricing and service limits once they are finalized."],["AI Bot plans","Availability and usage options when development is complete."],["Plan comparison","An easy way to choose what fits your business."]],availability:"There are no public paid plans to select on this page yet.",back:"Back to homepage"},
  bn:{kicker:"মূল্য ও প্যাকেজ",title:"প্যাকেজের বিস্তারিত",mark:"শিগগিরই জানানো হবে।",
 body:"Payment Gateway ও AI Bot-এর দাম এবং প্যাকেজ এখনো চূড়ান্ত করা হয়নি। সব তথ্য ঠিক হলে এই পেজে প্রকাশ করা হবে।",
 label:"এখানে যা জানা যাবে",
 items:[["Payment Gateway","পেমেন্ট সেবার দাম ও ব্যবহারসীমা।"],["AI Bot","সেবা চালু হলে তার প্যাকেজ ও খরচ।"],["প্যাকেজ তুলনা","কোন প্যাকেজে কী সুবিধা আছে, তার বিস্তারিত।"]],
 availability:"এই মুহূর্তে এখানে কোনো প্যাকেজ কেনার সুযোগ নেই।",back:"হোমপেজে ফিরুন"}
 },
 "developers":{
  en:{kicker:"DEVELOPERS / IN PREPARATION",title:"Build with Ekmivo.",mark:"Docs are on their way.",body:"We're preparing a dedicated developer hub for integrating Ekmivo Payments. Documentation, integration guides and sandbox demos will be organized here.",label:"THE DEVELOPER HUB WILL INCLUDE",items:[["Documentation","Authentication, payment requests, statuses and webhook references."],["Integration guides","Practical examples for websites, apps and other supported platforms."],["Demo sandbox","A safe environment to test your integration without moving real money."]],availability:"The public developer hub is still being built. Its examples and tools will appear here once ready.",back:"Back to homepage"},
  bn:{kicker:"ডেভেলপার পোর্টাল",title:"Ekmivo ইন্টিগ্রেশন",mark:"সহজ করার কাজ চলছে।",
 body:"API ডকুমেন্টেশন, ইন্টিগ্রেশন গাইড এবং ডেমো Sandbox নিয়ে আলাদা ডেভেলপার পোর্টাল তৈরি হচ্ছে।",
 label:"যে রিসোর্সগুলো এখানে পাবেন",
 items:[["API ডকুমেন্টেশন","পেমেন্ট তৈরি, স্ট্যাটাস দেখা, অথেনটিকেশন ও ওয়েবহুকের নির্দেশনা।"],["ইন্টিগ্রেশন গাইড","নিজের ওয়েবসাইট বা অ্যাপে Ekmivo যুক্ত করার উদাহরণ।"],["ডেমো Sandbox","আসল টাকা লেনদেন ছাড়াই ইন্টিগ্রেশন পরীক্ষা করার ব্যবস্থা।"]],
 availability:"ডেভেলপার পোর্টালের ডকুমেন্টেশন ও ডেমো Sandbox এখনো প্রকাশ করা হয়নি।",back:"হোমপেজে ফিরুন"}
 }
} as const;

export function ComingSoonPage({locale,kind}:{locale:Locale;kind:ComingSlug}){
 const t=upcoming[kind][locale],bn=locale==="bn";
 if(kind==="ai-bot")return <main className="ek-product-page ek-public-interior ek-ai-interior" lang={locale}>
  <div className="ek-interior-wrap">
   <div className="ek-interior-topline"><Link href="/">ekmivo</Link><span>/</span><strong>AI Bot</strong><span className="ek-interior-label">{bn?"তৈরি হচ্ছে":"IN DEVELOPMENT"}</span></div>
   <div className="ek-ai-layout">
    <aside className="ek-ai-aside" aria-label={bn?"বর্তমান অবস্থা":"Current status"}>
     <div className="ek-ai-aside-index">02 / EKMIVO</div>
     <div className="ek-ai-aside-symbol" aria-hidden="true"><span>✳</span><span>⌁</span></div>
     <span className="ek-ai-aside-status"><i/>{bn?"সেবা চালু হয়নি":"NOT AVAILABLE YET"}</span>
    </aside>
    <div className="ek-ai-content">
     <span className="ek-interior-overline">AI BOT / WORK IN PROGRESS</span>
     <h1>{bn?"AI Bot এখনো চালু হয়নি":"AI Bot development starts soon."}</h1>
     <p className="ek-ai-lead">{t.body}</p>
     <div className="ek-ai-roadmap">
      <div className="ek-ai-roadmap-label">{bn?"যে সুবিধাগুলো আসতে পারে":"ON THE ROADMAP"}<span>03</span></div>
      {t.items.map(([title,body],i)=><article key={title} className="ek-ai-roadmap-row"><span className="ek-ai-roadmap-number">0{i+1}</span><div><h2>{title}</h2><p>{body}</p></div><span className="ek-ai-roadmap-icon" aria-hidden="true">↗</span></article>)}
     </div>
     <p className="ek-ai-status-note">{t.availability}</p>
     <Link href="/" className="ek-ai-back">← {t.back}</Link>
    </div>
   </div>
  </div>
 </main>;
 if(kind==="pricing")return <main className="ek-product-page ek-public-interior ek-price-interior" lang={locale}>
  <div className="ek-interior-wrap">
   <div className="ek-interior-topline"><Link href="/">ekmivo</Link><span>/</span><strong>Pricing</strong></div>
   <div className="ek-price-heading"><div><span className="ek-interior-overline">{bn?"মূল্য ও প্যাকেজ":"PLANS & BILLING"}</span><h1>{bn?"প্যাকেজের দাম এখনো চূড়ান্ত হয়নি":"Pricing is being prepared."}</h1><p>{t.body}</p></div><span className="ek-price-badge">{bn?"এখনো প্রকাশ করা হয়নি":"COMING LATER"}</span></div>
   <div className="ek-price-panel-grid">
    <section className="ek-price-plan"><div className="ek-price-plan-head"><span>01</span><strong>Payment Gateway</strong></div><div className="ek-price-unavailable">—<small>{bn?"দাম ঘোষণা হয়নি":"NOT ANNOUNCED"}</small></div><p>{bn?"পেমেন্ট লিংক, ইনভয়েস ও চেকআউটের দাম এবং প্যাকেজ পরে জানানো হবে।":"Pricing for checkout, payment requests and integrations will be announced here."}</p><span className="ek-price-plan-foot">{bn?"দাম পরে জানানো হবে":"PRICES & LIMITS PENDING"}</span></section>
    <section className="ek-price-plan"><div className="ek-price-plan-head"><span>02</span><strong>AI Bot</strong></div><div className="ek-price-unavailable">—<small>{bn?"এখনো নির্ধারিত হয়নি":"NOT ANNOUNCED"}</small></div><p>{bn?"AI Bot চালু হওয়ার আগে এর প্যাকেজ ঘোষণা করা হবে না।":"AI Bot plans will be introduced when its scope and availability are confirmed."}</p><span className="ek-price-plan-foot">{bn?"AI Bot এখনো চালু হয়নি":"SERVICE IN DEVELOPMENT"}</span></section>
   </div>
   <div className="ek-price-note"><span aria-hidden="true">ⓘ</span><p>{t.availability} {bn?"দাম বা ব্যবহারের সীমা সম্পর্কে এখনো কোনো ঘোষণা দেওয়া হয়নি।":"No pricing tiers or usage limits are being represented as final."}</p></div>
   <Link className="ek-ai-back" href="/payment-gateway">{bn?"Payment Gateway সম্পর্কে জানুন":"Explore Payment Gateway"} ↗</Link>
  </div>
 </main>;
 return <main className="ek-product-page ek-public-interior ek-dev-interior" lang={locale}>
  <div className="ek-dev-layout">
   <aside className="ek-dev-sidebar">
    <Link className="ek-dev-home" href="/">← ekmivo</Link>
    <div className="ek-dev-sidebar-title">DEVELOPERS <span>↗</span></div>
    <nav aria-label={bn?"ডেভেলপার পোর্টাল":"Developer navigation"}>
     <span>{bn?"শুরু করুন":"GETTING STARTED"}</span>
     <a href="#dev-overview">{bn?"ওভারভিউ":"Overview"}</a>
     <a href="#dev-resources">{bn?"রিসোর্স":"Resources"}</a>
     <a href="#dev-availability">{bn?"প্রাপ্যতা":"Availability"}</a>
    </nav>
    <div className="ek-dev-sidebar-foot">{bn?"ডকুমেন্টেশন তৈরি হচ্ছে":"DOCUMENTATION IN PREPARATION"}</div>
   </aside>
   <div className="ek-dev-main">
    <div className="ek-dev-breadcrumb"><Link href="/">Ekmivo</Link><span>/</span>Developers <span>/</span> Overview</div>
    <header id="dev-overview" className="ek-dev-article-head">
     <div className="ek-dev-doc-icon" aria-hidden="true">&lt;/&gt;</div>
     <span className="ek-interior-overline">DEVELOPER HUB · PREVIEW</span>
     <h1>{bn?"ডেভেলপার পোর্টালের কাজ চলছে":"Developer hub is under construction"}</h1>
     <p>{t.body}</p>
     <div className="ek-dev-notice"><span>ⓘ</span><p>{t.availability}</p></div>
    </header>
    <section className="ek-dev-resources" id="dev-resources">
     <h2>{bn?"যে রিসোর্সগুলো আসবে":"Planned resources"}</h2>
     <div className="ek-dev-resource-list">{t.items.map(([title,body],i)=><article key={title}><span className="ek-dev-resource-symbol">{["{ }","↗","⌘"][i]}</span><div><h3>{title}</h3><p>{body}</p></div><span className="ek-dev-resource-state">{bn?"শিগগিরই":"SOON"}</span></article>)}</div>
    </section>
    <section className="ek-dev-availability" id="dev-availability"><h2>{bn?"বর্তমান অবস্থা":"Current status"}</h2><p>{bn?"API ডকুমেন্টেশন, ইন্টিগ্রেশন গাইড ও Sandbox এখনো প্রকাশ করা হয়নি। প্রস্তুত হলে এই পেজ থেকেই পাওয়া যাবে।":"API reference, integration guides and the public demo sandbox are not yet available from this hub. Updates will appear here as development progresses."}</p></section>
   </div>
  </div>
 </main>;
}
