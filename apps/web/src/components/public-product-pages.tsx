import Link from "next/link";
import type {Locale} from "../lib/site-copy";

type TextPair={en:string;bn:string};
type Step={title:TextPair;body:TextPair};
const bilingual=(en:string,bn:string):TextPair=>({en,bn});
const flow:Step[]=[
 {title:bilingual("Set up your business","ব্যবসার পেমেন্ট সেটআপ করুন"),body:bilingual("Choose your receiving payment options and connect your merchant receipt device securely.","ব্যবসার পেমেন্ট অ্যাকাউন্ট ও রসিদ পাঠানোর জন্য মার্চেন্টের ফোন যুক্ত করুন।")},
 {title:bilingual("Create a payment request","পেমেন্ট রিকোয়েস্ট তৈরি করুন"),body:bilingual("Generate a link or invoice, use hosted checkout, or integrate the merchant API in your own site or app.","লিংক বা ইনভয়েস তৈরি করুন। চাইলে নিজের ওয়েবসাইট বা অ্যাপের চেকআউটেও API ব্যবহার করুন।")},
 {title:bilingual("Let customers pay","কাস্টমার পেমেন্ট করবেন"),body:bilingual("Your customer sees the amount and available wallet options on a simple checkout. They pay using their own wallet app.","কাস্টমার চেকআউটে টাকার পরিমাণ ও পেমেন্টের মাধ্যম দেখে নিজের মোবাইল ওয়ালেট অ্যাপ দিয়ে টাকা পাঠাবেন।")},
 {title:bilingual("We check the payment evidence","লেনদেনের রসিদ যাচাই হবে"),body:bilingual("The connected merchant device securely forwards relevant payment notifications. Ekmivo reviews eligible evidence on its server before confirming a payment.","মার্চেন্টের সংযুক্ত ফোন থেকে পেমেন্টের প্রয়োজনীয় রসিদ নিরাপদে সার্ভারে আসে। যাচাই শেষ হলেই পেমেন্টের অবস্থা বদলায়।")},
 {title:bilingual("Follow the outcome","পেমেন্টের অবস্থা জানুন"),body:bilingual("Verified payments appear in the dashboard and can trigger signed merchant webhooks. Incomplete or uncertain payments stay visibly pending.","সফল পেমেন্ট ড্যাশবোর্ডে দেখা যাবে এবং ওয়েবহুকের মাধ্যমে নিজের সিস্টেমেও আপডেট নেওয়া যাবে। অনিশ্চিত পেমেন্ট অপেক্ষমাণ থাকবে।")}
];
const benefits=[
 {index:"01",label:bilingual("More than a payment link","শুধু পেমেন্ট লিংক নয়"),body:bilingual("Use payment requests, invoices, hosted checkout and developer APIs based on where your customers buy.","লিংক, ইনভয়েস, চেকআউট অথবা API—কাস্টমার যেভাবে কেনাকাটা করেন, সেভাবেই পেমেন্ট নিন।"),tag:"↗"},
 {index:"02",label:bilingual("A clear payment state","পেমেন্টের অবস্থা স্পষ্ট"),body:bilingual("Payment requests keep a clear status. A confirmation screen alone does not count as payment evidence.","প্রতিটি পেমেন্টের অবস্থা আলাদা করে দেখুন। শুধু চেকআউট পেজে Success লেখা মানেই টাকা পাওয়ার প্রমাণ নয়।"),tag:"✓"},
 {index:"03",label:bilingual("Built for integrations","নিজের সফটওয়্যারের সঙ্গেও যুক্ত করুন"),body:bilingual("Use sandbox and live environments, scoped API keys, status lookups and signed merchant webhooks.","Sandbox ও Live আলাদা রেখে API key, status check এবং signed webhook ব্যবহার করুন।"),tag:"⌘"},
 {index:"04",label:bilingual("You remain in control","সিদ্ধান্ত আপনার হাতেই"),body:bilingual("Exceptions and refunds remain visible for merchants to review and handle. Ekmivo does not automatically send refund money.","যাচাইয়ের সমস্যা বা টাকা ফেরতের অনুরোধ মার্চেন্ট দেখতে পারবেন। Ekmivo নিজে থেকে কারও অ্যাকাউন্টে টাকা ফেরত পাঠায় না।"),tag:"◎"}
];
const audiences=[
 {title:bilingual("Online shops","অনলাইন শপ"),body:bilingual("Add checkout to your store or create a payment link for a direct order.","ওয়েবসাইটে চেকআউট যুক্ত করুন, অথবা সরাসরি অর্ডারের জন্য পেমেন্ট লিংক দিন।")},
 {title:bilingual("Courses & services","কোর্স ও সেবাভিত্তিক ব্যবসা"),body:bilingual("Collect course fees, bookings and project payments with clear request records.","কোর্স ফি, বুকিং বা কাজের পেমেন্টের জন্য রিকোয়েস্ট তৈরি করুন এবং হিসাব রাখুন।")},
 {title:bilingual("Developers & platforms","ডেভেলপার ও অনলাইন প্ল্যাটফর্ম"),body:bilingual("Create payment requests from your application and receive server-side status updates.","নিজের অ্যাপ থেকে পেমেন্ট রিকোয়েস্ট তৈরি করুন এবং সার্ভারে পেমেন্টের আপডেট নিন।")}
];
const faqs=[
 {q:bilingual("Do customers install Ekmivo?","কাস্টমারকে কি Ekmivo অ্যাপ ইনস্টল করতে হবে?"),a:bilingual("No. Customers use web checkout and their usual wallet apps. The separate Ekmivo Android receipt bridge belongs to the merchant.","না। কাস্টমার ওয়েব চেকআউট ও নিজের পেমেন্ট অ্যাপ ব্যবহার করবেন। রসিদ পাঠানোর Android অ্যাপটি মার্চেন্টের জন্য।")},
 {q:bilingual("Does every payment verify immediately?","সব পেমেন্ট কি সঙ্গে সঙ্গে যাচাই হয়?"),a:bilingual("No. Verification depends on eligible payment evidence reaching the service and being confirmed. Uncertain cases remain pending rather than showing a false success.","না। প্রয়োজনীয় রসিদ পৌঁছানো ও যাচাই হওয়ার ওপর নির্ভর করে। নিশ্চিত হওয়া না গেলে পেমেন্ট অপেক্ষমাণ থাকবে; ভুল করে সফল দেখাবে না।")},
 {q:bilingual("What if the merchant phone loses internet?","মার্চেন্টের ফোনে ইন্টারনেট না থাকলে কী হবে?"),a:bilingual("Receipts captured by the installed bridge can be queued securely and forwarded when connectivity returns. A powered-off or force-stopped phone cannot collect new receipts during that time.","সংযুক্ত ফোনে ধরা পড়া রসিদ নিরাপদে জমা থাকবে এবং ইন্টারনেট ফিরলে পাঠানোর চেষ্টা করবে। ফোন বন্ধ বা অ্যাপ force-stop থাকলে সেই সময়ে নতুন SMS ধরা সম্ভব নয়।")},
 {q:bilingual("Can I integrate Ekmivo with my own website?","নিজের ওয়েবসাইটে কি Ekmivo ব্যবহার করা যাবে?"),a:bilingual("Yes. Merchant APIs, hosted checkout and signed webhooks support integrations. Test in sandbox before enabling a live payment workflow.","হ্যাঁ। Merchant API, Hosted Checkout ও Webhook দিয়ে যুক্ত করতে পারবেন। Live ব্যবহারের আগে Sandbox-এ পরীক্ষা করুন।")}
];
const paymentCopy={
 en:{kicker:"PAYMENT GATEWAY / EKMIVO",title:"Payments that fit",marked:"the way you work.",intro:"Accept mobile-wallet payments through checkout, invoices or links. Track every request, verify eligible receipts and keep your own business systems informed.",primary:"Create your account",secondary:"Explore the workflow",strip:["PAYMENT LINKS","INVOICES","HOSTED CHECKOUT","API & WEBHOOKS"],sectionLabel:"01 / THE COMPLETE JOURNEY",flowTitle:"From your request",flowMarked:"to a clear result.",flowDesc:"A familiar experience for customers. A traceable process for your business.",verifyLabel:"02 / PAYMENT CONFIRMATION",verifyTitle:"Verification happens",verifyMarked:"behind the scenes.",verifyDescription:"Ekmivo uses evidence received through authorized merchant sources to determine the payment status. The verification logic runs securely on our backend; customers do not need to manually enter a transaction ID or upload a screenshot as part of the normal flow.",phoneTitle:"Your merchant phone plays a part.",phoneBody:"The companion Android app relays relevant wallet receipts to your Ekmivo workspace. It keeps captured receipts in a secure offline queue when the connection drops, then retries automatically when internet returns. A device that is powered off or force-stopped cannot receive new messages.",proofTitle:"When a payment needs attention",proofBody:"Missing or uncertain evidence is not treated as success. The merchant can review the request, and refund cases are handled by the seller outside Ekmivo.",backendKicker:"03 / WHY EKMIVO",backendTitle:"Built for real",backendMarked:"business workflows.",forLabel:"04 / WHO IT’S FOR",forTitle:"One payment service.",forMarked:"Different ways to use it.",faqKicker:"FREQUENT QUESTIONS",faqTitle:"Worth knowing",faqMarked:"before you begin.",endKicker:"START WITH PAYMENTS",endTitle:"Make payment collection",endMarked:"part of your workflow.",endBody:"Set up your workspace, connect your merchant receiving options and choose the checkout approach that suits your business.",endButton:"Get started",note:"Product capabilities depend on configuration and available payment methods. Ekmivo is not the wallet provider."},
 bn:{kicker:"পেমেন্ট গেটওয়ে / EKMIVO",title:"আপনার ব্যবসার জন্য",marked:"সহজ পেমেন্ট ব্যবস্থা।",intro:"পেমেন্ট লিংক, ইনভয়েস বা নিজের ওয়েবসাইটের চেকআউট দিয়ে টাকা নিন। প্রতিটি রিকোয়েস্টের অবস্থা দেখুন, যোগ্য রসিদ যাচাই করুন এবং নিজের সিস্টেমে আপডেট পান।",primary:"অ্যাকাউন্ট তৈরি করুন",secondary:"কীভাবে কাজ করে",strip:["পেমেন্ট লিংক","ইনভয়েস","চেকআউট","API ও ওয়েবহুক"],sectionLabel:"০১ / শুরু থেকে শেষ",flowTitle:"পেমেন্ট নেওয়া থেকে",flowMarked:"নিশ্চিত হওয়া পর্যন্ত।",flowDesc:"কাস্টমারের জন্য সহজ চেকআউট, ব্যবসার জন্য প্রতিটি পেমেন্টের স্পষ্ট অবস্থা।",verifyLabel:"০২ / পেমেন্ট যাচাই",verifyTitle:"যাচাইয়ের কাজটা হবে",verifyMarked:"আড়ালেই।",verifyDescription:"মার্চেন্টের অনুমোদিত উৎস থেকে পাওয়া পেমেন্টের রসিদ Ekmivo-এর সার্ভারে যাচাই করা হয়। সাধারণ পেমেন্টে কাস্টমারকে আলাদা করে TrxID লিখতে বা স্ক্রিনশট জমা দিতে হয় না।",phoneTitle:"মার্চেন্টের ফোন কীভাবে কাজে লাগে?",phoneBody:"Ekmivo-এর Android অ্যাপ সংযুক্ত ফোনে আসা প্রয়োজনীয় পেমেন্ট রসিদ সার্ভারে পাঠায়। ইন্টারনেট না থাকলে ধরা পড়া রসিদ নিরাপদে জমা থাকে, সংযোগ ফিরলে আবার পাঠানোর চেষ্টা করে। ফোন বন্ধ বা অ্যাপ force-stop থাকলে নতুন SMS ধরা যায় না।",proofTitle:"যাচাই নিয়ে সমস্যা হলে?",proofBody:"যথেষ্ট প্রমাণ না পাওয়া গেলে পেমেন্ট সফল দেখানো হয় না। মার্চেন্ট রিকোয়েস্টটি দেখে ব্যবস্থা নিতে পারবেন। টাকা ফেরতের প্রয়োজন হলে বিক্রেতাই Ekmivo-এর বাইরে তা সম্পন্ন করবেন।",backendKicker:"০৩ / কেন Ekmivo",backendTitle:"শুধু চেকআউট নয়,",backendMarked:"ব্যবসার পুরো প্রক্রিয়ার কথা ভেবে।",forLabel:"০৪ / যাদের কাজে লাগবে",forTitle:"ব্যবসা আলাদা হলেও",forMarked:"পেমেন্টের প্রয়োজন একই।",faqKicker:"সাধারণ কিছু প্রশ্ন",faqTitle:"শুরু করার আগে",faqMarked:"জেনে নিন।",endKicker:"পেমেন্ট সেবা দিয়ে শুরু করুন",endTitle:"আপনার পেমেন্ট ব্যবস্থা",endMarked:"গুছিয়ে নিন।",endBody:"ওয়ার্কস্পেস তৈরি করুন, মার্চেন্ট পেমেন্ট অ্যাকাউন্ট যুক্ত করুন এবং ব্যবসার উপযোগী চেকআউট বেছে নিন।",endButton:"অ্যাকাউন্ট তৈরি করুন",note:"পেমেন্টের সুবিধাগুলো সংশ্লিষ্ট সেটআপ ও উপলব্ধ মাধ্যমের ওপর নির্ভর করে। Ekmivo কোনো মোবাইল ওয়ালেট প্রতিষ্ঠান নয়।"}
} as const;
function EmSectionTitle({eyebrow,title,marked}:{eyebrow:string;title:string;marked:string}){
 return <div className="ek-product-heading"><span className="ek-public-kicker">{eyebrow}</span><h2>{title} <span className="ek-public-brush">{marked}</span></h2></div>;
}
export function PaymentGatewayPage({locale}:{locale:Locale}){
 const t=paymentCopy[locale],bn=locale==="bn";
 return <main className="ek-product-page ek-pg-detail" lang={locale}>
  <div className="ek-pg-mast"><div className="ek-public-wrap">
   <div className="ek-pg-crumb"><Link href={"/"+locale}>ekmivo</Link><span aria-hidden="true">/</span><strong>Payment Gateway</strong><span className="ek-pg-status">{bn?"পেমেন্ট সেবা":"PAYMENTS"}</span></div>
   <div className="ek-pg-mast-grid">
    <div className="ek-pg-intro">
     <h1>{bn?"আপনার ব্যবসার পেমেন্ট ব্যবস্থা":"Payments for your business"}</h1>
     <p>{t.intro}</p>
     <div className="ek-pg-mast-actions">
      <Link href={"/"+locale+"/register"} className="ek-public-action">{t.primary}<span aria-hidden="true">↗</span></Link>
      <a href="#payment-workflow" className="ek-pg-text-link">{t.secondary} <span aria-hidden="true">↓</span></a>
     </div>
    </div>
    <div className="ek-pg-route-panel" aria-label={bn?"পেমেন্ট প্রক্রিয়ার সংক্ষিপ্ত বিবরণ":"Payment process overview"}>
     <div className="ek-pg-route-header"><span>{bn?"পেমেন্টের ধাপ":"PAYMENT PATH"}</span><span>01—03</span></div>
     <div className="ek-pg-route-node"><span className="ek-pg-route-icon">↗</span><div><strong>{bn?"পেমেন্ট রিকোয়েস্ট":"Payment request"}</strong><small>{bn?"লিংক · ইনভয়েস · API":"Link · Invoice · API"}</small></div></div>
     <div className="ek-pg-route-connector" aria-hidden="true"/>
     <div className="ek-pg-route-node"><span className="ek-pg-route-icon">⌁</span><div><strong>{bn?"কাস্টমার পেমেন্ট":"Customer checkout"}</strong><small>{bn?"নিজের মোবাইল ওয়ালেট ব্যবহার":"Pay with a supported wallet"}</small></div></div>
     <div className="ek-pg-route-connector" aria-hidden="true"/>
     <div className="ek-pg-route-node"><span className="ek-pg-route-icon">✓</span><div><strong>{bn?"রসিদ যাচাই ও ফলাফল":"Receipt review and status"}</strong><small>{bn?"ড্যাশবোর্ড · ওয়েবহুক":"Dashboard · Webhook"}</small></div></div>
     <span className="ek-pg-route-note">{bn?"ধাপগুলোর নমুনা · লাইভ পেমেন্ট নয়":"Illustrative process · Not a live transaction"}</span>
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
   <div className="ek-flow-grid">{flow.map((step,i)=><article key={step.title.en} className="ek-flow-card"><div className="ek-flow-counter">{String(i+1).padStart(2,"0")} <span aria-hidden="true">↗</span></div><h3>{step.title[locale]}</h3><p>{step.body[locale]}</p></article>)}</div>
  </div></section>
  <section id="payment-receipts" className="ek-public-section ek-evidence-section"><div className="ek-public-wrap ek-evidence-layout">
   <div className="ek-evidence-copy"><EmSectionTitle eyebrow={t.verifyLabel} title={t.verifyTitle} marked={t.verifyMarked}/><p>{t.verifyDescription}</p></div>
   <div className="ek-evidence-stack">
    <article className="ek-sketch-panel"><span className="ek-sketch-icon" aria-hidden="true">↗</span><h3>{t.phoneTitle}</h3><p>{t.phoneBody}</p></article>
    <article className="ek-sketch-panel"><span className="ek-sketch-icon" aria-hidden="true">✓</span><h3>{t.proofTitle}</h3><p>{t.proofBody}</p></article>
   </div>
  </div></section>
  <section id="payment-features" className="ek-public-section ek-benefits-section"><div className="ek-public-wrap"><EmSectionTitle eyebrow={t.backendKicker} title={t.backendTitle} marked={t.backendMarked}/>
   <div className="ek-public-benefits">{benefits.map((card,i)=><article key={card.index} className={"ek-public-benefit benefit-"+i}><div className="ek-benefit-symbol">{card.tag}</div><span className="ek-benefit-count">{card.index}</span><h3>{card.label[locale]}</h3><p>{card.body[locale]}</p></article>)}</div>
  </div></section>
  <section id="payment-audiences" className="ek-public-section ek-audience-section"><div className="ek-public-wrap"><EmSectionTitle eyebrow={t.forLabel} title={t.forTitle} marked={t.forMarked}/>
   <div className="ek-public-audiences">{audiences.map((item,i)=><article key={item.title.en}><span>0{i+1} — EKMIVO</span><h3>{item.title[locale]}</h3><p>{item.body[locale]}</p></article>)}</div>
  </div></section>
  <section id="payment-questions" className="ek-public-section ek-public-faq"><div className="ek-public-wrap ek-faq-layout"><EmSectionTitle eyebrow={t.faqKicker} title={t.faqTitle} marked={t.faqMarked}/>
   <div className="ek-public-questions">{faqs.map((item,i)=><details key={i}><summary><span>0{i+1}</span>{item.q[locale]}<b aria-hidden="true">+</b></summary><p>{item.a[locale]}</p></details>)}</div>
  </div></section>
  <section className="ek-pg-finish"><div className="ek-public-wrap"><div><span className="ek-public-kicker">{t.endKicker}</span><h2>{bn?"Ekmivo দিয়ে পেমেন্ট নেওয়া শুরু করুন":"Bring payments into your workflow"}</h2><p>{t.endBody}</p></div><Link href={"/"+locale+"/register"} className="ek-public-action">{t.endButton}<span aria-hidden="true">↗</span></Link></div></section>
 </main>;
}

type ComingSlug="ai-bot"|"pricing"|"developers";
const upcoming={
 "ai-bot":{
  en:{kicker:"AI BOT / COMING SOON",title:"Conversations, with",mark:"room to grow.",body:"Our AI Bot service is not ready yet. Full development will begin soon. This page will be updated as the product takes shape.",label:"WHAT WE'RE PLANNING",items:[["Customer conversations","A shared inbox for supported channels and your team."],["AI assistance","Help with common questions using approved business information."],["Human control","A straightforward way for a teammate to step in when needed."]],availability:"Development has not been completed. Features and supported channels are not available for general use yet.",back:"Back to homepage"},
  bn:{kicker:"AI BOT / শিগগিরই",title:"কাস্টমারের সঙ্গে কথোপকথন,",mark:"আরও সহজ করার পথে।",body:"AI Bot সেবার কাজ এখনো শেষ হয়নি। পূর্ণাঙ্গ ডেভেলপমেন্ট শিগগিরই শুরু হবে। কাজ এগোলে এখানেই বিস্তারিত জানানো হবে।",label:"যেসব সুবিধা নিয়ে কাজ করার পরিকল্পনা",items:[["কাস্টমারের সব মেসেজ","অনুমোদিত চ্যানেলের মেসেজ ও টিমের কাজ এক জায়গা থেকে সামলানো।"],["AI-এর সহায়তায় উত্তর","ব্যবসার তথ্য ব্যবহার করে সাধারণ প্রশ্নের উত্তর দিতে সহায়তা।"],["টিমের হাতে নিয়ন্ত্রণ","প্রয়োজন হলে AI থেকে সরাসরি টিমের কাছে কথোপকথন নেওয়া।"]],availability:"সেবাটি এখনো চালু হয়নি। কোন ফিচার ও চ্যানেল পাওয়া যাবে, তা ডেভেলপমেন্ট ও অনুমোদনের পর নিশ্চিত করা হবে।",back:"হোমপেজে ফিরুন"}
 },
 "pricing":{
  en:{kicker:"PRICING / IN PREPARATION",title:"The right plan,",mark:"on your terms.",body:"We're preparing clear plans for Payments and AI Bot. Final prices, limits and billing details have not been announced.",label:"WHAT YOU'LL FIND HERE",items:[["Payments plans","Pricing and service limits once they are finalized."],["AI Bot plans","Availability and usage options when development is complete."],["Plan comparison","An easy way to choose what fits your business."]],availability:"There are no public paid plans to select on this page yet.",back:"Back to homepage"},
  bn:{kicker:"প্যাকেজ / তৈরি হচ্ছে",title:"আপনার ব্যবসার জন্য",mark:"সঠিক প্যাকেজ।",body:"Payment Gateway ও AI Bot-এর প্যাকেজ সাজানোর কাজ চলছে। দাম, ব্যবহারের সীমা ও বিলিংয়ের বিস্তারিত এখনো চূড়ান্ত হয়নি।",label:"এখানে পরে যা পাবেন",items:[["পেমেন্ট সেবার প্যাকেজ","চূড়ান্ত হলে দাম ও ব্যবহারের সীমা প্রকাশ করা হবে।"],["AI Bot প্যাকেজ","সেবাটি প্রস্তুত হলে ব্যবহার ও খরচের বিস্তারিত পাওয়া যাবে।"],["প্যাকেজ তুলনা","ব্যবসার প্রয়োজন অনুযায়ী প্যাকেজ বেছে নেওয়ার সুবিধা।"]],availability:"এই পেজে এখনো কোনো paid plan চালু করা হয়নি।",back:"হোমপেজে ফিরুন"}
 },
 "developers":{
  en:{kicker:"DEVELOPERS / IN PREPARATION",title:"Build with Ekmivo.",mark:"Docs are on their way.",body:"We're preparing a dedicated developer hub for integrating Ekmivo Payments. Documentation, integration guides and sandbox demos will be organized here.",label:"THE DEVELOPER HUB WILL INCLUDE",items:[["Documentation","Authentication, payment requests, statuses and webhook references."],["Integration guides","Practical examples for websites, apps and other supported platforms."],["Demo sandbox","A safe environment to test your integration without moving real money."]],availability:"The public developer hub is still being built. Its examples and tools will appear here once ready.",back:"Back to homepage"},
  bn:{kicker:"ডেভেলপারস / তৈরি হচ্ছে",title:"Ekmivo যুক্ত করুন",mark:"নিজের প্রজেক্টে।",body:"Payment Gateway-এর জন্য ডেভেলপার পোর্টাল তৈরি হচ্ছে। API ডকুমেন্টেশন, ইন্টিগ্রেশন গাইড আর ডেমো Sandbox—সব এক জায়গায় পাওয়া যাবে।",label:"এই পেজে পরে যা থাকবে",items:[["ডকুমেন্টেশন","অথেনটিকেশন, পেমেন্ট রিকোয়েস্ট, স্ট্যাটাস ও ওয়েবহুকের বিস্তারিত।"],["ইন্টিগ্রেশন গাইড","ওয়েবসাইট, অ্যাপ ও অন্যান্য প্ল্যাটফর্মে যুক্ত করার উদাহরণ।"],["ডেমো Sandbox","আসল টাকা ব্যবহার না করে ইন্টিগ্রেশন পরীক্ষা করার ব্যবস্থা।"]],availability:"ডেভেলপার পোর্টাল এখনো প্রস্তুত নয়। ডকুমেন্টেশন ও টুলস তৈরি হলে এখানেই পাওয়া যাবে।",back:"হোমপেজে ফিরুন"}
 }
} as const;

export function ComingSoonPage({locale,kind}:{locale:Locale;kind:ComingSlug}){
 const t=upcoming[kind][locale],bn=locale==="bn";
 if(kind==="ai-bot")return <main className="ek-product-page ek-public-interior ek-ai-interior" lang={locale}>
  <div className="ek-interior-wrap">
   <div className="ek-interior-topline"><Link href={"/"+locale}>ekmivo</Link><span>/</span><strong>AI Bot</strong><span className="ek-interior-label">{bn?"তৈরি হচ্ছে":"IN DEVELOPMENT"}</span></div>
   <div className="ek-ai-layout">
    <aside className="ek-ai-aside" aria-label={bn?"বর্তমান অবস্থা":"Current status"}>
     <div className="ek-ai-aside-index">02 / EKMIVO</div>
     <div className="ek-ai-aside-symbol" aria-hidden="true"><span>✳</span><span>⌁</span></div>
     <span className="ek-ai-aside-status"><i/>{bn?"সেবা চালু হয়নি":"NOT AVAILABLE YET"}</span>
    </aside>
    <div className="ek-ai-content">
     <span className="ek-interior-overline">AI BOT / WORK IN PROGRESS</span>
     <h1>{bn?"AI Bot-এর কাজ শিগগিরই শুরু হচ্ছে।":"AI Bot development starts soon."}</h1>
     <p className="ek-ai-lead">{t.body}</p>
     <div className="ek-ai-roadmap">
      <div className="ek-ai-roadmap-label">{bn?"পরিকল্পিত সুবিধা":"ON THE ROADMAP"}<span>03</span></div>
      {t.items.map(([title,body],i)=><article key={title} className="ek-ai-roadmap-row"><span className="ek-ai-roadmap-number">0{i+1}</span><div><h2>{title}</h2><p>{body}</p></div><span className="ek-ai-roadmap-icon" aria-hidden="true">↗</span></article>)}
     </div>
     <p className="ek-ai-status-note">{t.availability}</p>
     <Link href={"/"+locale} className="ek-ai-back">← {t.back}</Link>
    </div>
   </div>
  </div>
 </main>;
 if(kind==="pricing")return <main className="ek-product-page ek-public-interior ek-price-interior" lang={locale}>
  <div className="ek-interior-wrap">
   <div className="ek-interior-topline"><Link href={"/"+locale}>ekmivo</Link><span>/</span><strong>Pricing</strong></div>
   <div className="ek-price-heading"><div><span className="ek-interior-overline">{bn?"মূল্য ও প্যাকেজ":"PLANS & BILLING"}</span><h1>{bn?"প্যাকেজের তথ্য প্রস্তুত হচ্ছে।":"Pricing is being prepared."}</h1><p>{t.body}</p></div><span className="ek-price-badge">{bn?"প্রস্তুতির পর্যায়ে":"COMING LATER"}</span></div>
   <div className="ek-price-panel-grid">
    <section className="ek-price-plan"><div className="ek-price-plan-head"><span>01</span><strong>Payment Gateway</strong></div><div className="ek-price-unavailable">—<small>{bn?"এখনো নির্ধারিত হয়নি":"NOT ANNOUNCED"}</small></div><p>{bn?"পেমেন্ট রিকোয়েস্ট, চেকআউট ও ইন্টিগ্রেশনের প্যাকেজের বিস্তারিত পরে প্রকাশ করা হবে।":"Pricing for checkout, payment requests and integrations will be announced here."}</p><span className="ek-price-plan-foot">{bn?"দাম ও সীমা চূড়ান্ত হয়নি":"PRICES & LIMITS PENDING"}</span></section>
    <section className="ek-price-plan"><div className="ek-price-plan-head"><span>02</span><strong>AI Bot</strong></div><div className="ek-price-unavailable">—<small>{bn?"এখনো নির্ধারিত হয়নি":"NOT ANNOUNCED"}</small></div><p>{bn?"AI Bot-এর কাজ শুরু হলে সেবার ধরন ও প্যাকেজ সম্পর্কে জানানো হবে।":"AI Bot plans will be introduced when its scope and availability are confirmed."}</p><span className="ek-price-plan-foot">{bn?"সেবাটি তৈরি হচ্ছে":"SERVICE IN DEVELOPMENT"}</span></section>
   </div>
   <div className="ek-price-note"><span aria-hidden="true">ⓘ</span><p>{t.availability} {bn?"এখন কোনো দাম বা ফিচার লিমিট নিশ্চিত করা হয়নি।":"No pricing tiers or usage limits are being represented as final."}</p></div>
   <Link className="ek-ai-back" href={"/"+locale+"/payment-gateway"}>{bn?"পেমেন্ট সেবা সম্পর্কে জানুন":"Explore Payment Gateway"} ↗</Link>
  </div>
 </main>;
 return <main className="ek-product-page ek-public-interior ek-dev-interior" lang={locale}>
  <div className="ek-dev-layout">
   <aside className="ek-dev-sidebar">
    <Link className="ek-dev-home" href={"/"+locale}>← ekmivo</Link>
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
    <div className="ek-dev-breadcrumb"><Link href={"/"+locale}>Ekmivo</Link><span>/</span>Developers <span>/</span> Overview</div>
    <header id="dev-overview" className="ek-dev-article-head">
     <div className="ek-dev-doc-icon" aria-hidden="true">&lt;/&gt;</div>
     <span className="ek-interior-overline">DEVELOPER HUB · PREVIEW</span>
     <h1>{bn?"ডেভেলপার পোর্টাল তৈরি হচ্ছে":"Developer hub is under construction"}</h1>
     <p>{t.body}</p>
     <div className="ek-dev-notice"><span>ⓘ</span><p>{t.availability}</p></div>
    </header>
    <section className="ek-dev-resources" id="dev-resources">
     <h2>{bn?"এখানে যা পাবেন":"Planned resources"}</h2>
     <div className="ek-dev-resource-list">{t.items.map(([title,body],i)=><article key={title}><span className="ek-dev-resource-symbol">{["{ }","↗","⌘"][i]}</span><div><h3>{title}</h3><p>{body}</p></div><span className="ek-dev-resource-state">{bn?"শিগগিরই":"SOON"}</span></article>)}</div>
    </section>
    <section className="ek-dev-availability" id="dev-availability"><h2>{bn?"বর্তমান অবস্থা":"Current status"}</h2><p>{bn?"এই পেজে এখনো API reference, integration guide বা demo sandbox চালু করা হয়নি। প্রস্তুত হলে এখানে পাওয়া যাবে।":"API reference, integration guides and the public demo sandbox are not yet available from this hub. Updates will appear here as development progresses."}</p></section>
   </div>
  </div>
 </main>;
}
