import Link from "next/link";

type Locale="en"|"bn";
type Pair={en:string;bn:string};
const pair=(en:string,bn:string):Pair=>({en,bn});

function ArrowLink({href,children,secondary=false}:{href:string;children:React.ReactNode;secondary?:boolean}){
 return <Link href={href} className={"ekm-button"+(secondary?" ekm-button-outline":"")}>{children}<span aria-hidden="true">↗</span></Link>;
}
function ProductHeading({kicker,title,body}:{kicker:string;title:string;body?:string}){
 return <header className="ekm-section-heading"><span className="ekm-eyebrow">{kicker}</span><h2>{title}</h2>{body&&<p>{body}</p>}</header>;
}
function ProductFinish({locale,ai=false}:{locale:Locale;ai?:boolean}){
 const bn=locale==="bn";
 return <section className="ekm-product-finish">
  <span className="ekm-eyebrow">ONE STORE · CONNECTED SERVICES</span>
  <h2>{ai?(bn?"স্মার্ট কথোপকথন। সহজ পেমেন্ট।":"Smarter conversations. Smoother payments."):(bn?"যাচাইয়ের ঝামেলা কমুক। বিক্রির সময় বাড়ুক।":"Less time checking. More time selling.")}</h2>
  <p>{ai?(bn?"AI Bot এবং Payments নিয়ে আপনার স্টোরের কাজ এক জায়গায় সামলান।":"Bring AI Bot and Payments together around your Store."):(bn?"প্রকাশিত পেমেন্ট প্ল্যান দেখে আপনার স্টোরের জন্য উপযুক্তটি বেছে নিন।":"Compare published payment plans and choose what your Store needs.")}</p>
  <ArrowLink href={ai?"/pricing?product=ai_credit":"/pricing?product=payments"}>{bn?"প্ল্যান দেখুন":"Explore pricing"}</ArrowLink>
 </section>;
}

const paymentSteps=[
 {title:pair("Connect receiving wallets","পেমেন্ট ওয়ালেট যুক্ত করুন"),body:pair("Set up receiving methods and securely pair the merchant receipt phone.","টাকা পাওয়ার মাধ্যম এবং SMS পাওয়ার মার্চেন্ট ফোন নিরাপদে যুক্ত করুন।")},
 {title:pair("Create a checkout","চেকআউট তৈরি করুন"),body:pair("Send a payment request or invoice, or integrate your own checkout.","পেমেন্ট লিংক বা ইনভয়েস দিন, অথবা নিজের চেকআউট যুক্ত করুন।")},
 {title:pair("Customer pays","কাস্টমার টাকা পাঠাবেন"),body:pair("They use their own bKash, Nagad or Rocket app as usual.","কাস্টমার নিজের বিকাশ, নগদ বা রকেট অ্যাপে টাকা পাঠাবেন।")},
 {title:pair("Evidence is verified","SMS প্রমাণ যাচাই হবে"),body:pair("The backend checks eligible evidence and keeps uncertain payments pending.","সার্ভার প্রাসঙ্গিক প্রমাণ যাচাই করবে; অনিশ্চিত পেমেন্ট Pending থাকবে।")}
];
const paymentFaq=[
 {q:pair("Does the customer install Ekmivo?","কাস্টমারকে কি Ekmivo অ্যাপ ইনস্টল করতে হবে?"),a:pair("No. Customers use web checkout and their normal wallet. The Ekmivo Android receipt device belongs to the merchant.","না। কাস্টমার ওয়েব চেকআউট ও নিজের ওয়ালেট ব্যবহার করবেন। Ekmivo Android SMS ডিভাইসটি মার্চেন্টের।")},
 {q:pair("Does every payment verify instantly?","সব পেমেন্ট কি সঙ্গে সঙ্গে যাচাই হবে?"),a:pair("No. Valid unique evidence must arrive and be checked. Missing or ambiguous evidence keeps the payment pending, never falsely successful.","না। সঠিক ও অনন্য প্রমাণ পেয়ে যাচাই করতে হবে। প্রমাণ অনিশ্চিত হলে পেমেন্ট Pending থাকবে, ভুল করে Success নয়।")},
 {q:pair("What happens if the receipt phone is offline?","SMS পাওয়া ফোন অফলাইনে থাকলে কী হবে?"),a:pair("Captured receipts can queue securely and retry when connected. A powered-off or force-stopped phone cannot capture new SMS during that period.","ইতিমধ্যে পাওয়া SMS নিরাপদে জমা রেখে পরে পাঠানো যাবে। কিন্তু ফোন বন্ধ বা অ্যাপ force-stop থাকলে নতুন SMS ধরা সম্ভব নয়।")},
 {q:pair("Can Ekmivo send an automatic refund?","Ekmivo কি নিজে থেকে টাকা ফেরত পাঠাবে?"),a:pair("No. Refund cases are reviewed and handled by the merchant. Ekmivo does not send money back automatically.","না। মার্চেন্ট রিফান্ডের অনুরোধ দেখে নিজেই টাকা ফেরতের ব্যবস্থা করবেন।")}
];

export function MarketingPaymentPage({locale}:{locale:Locale}){
 const bn=locale==="bn";
 return <main className="ekm-product ekm-payment-page" lang={locale} id="main">
  <div className="ekm-product-wrap"><section className="ekm-product-hero">
   <span className="ekm-pill"><i/>{bn?"পেমেন্ট নেওয়ার আরও সহজ উপায়":"A simpler way to accept payments"}</span>
   <h1>{bn?"কাস্টমার পেমেন্ট করবেন।":"Customers pay."}<span>{bn?"যাচাইয়ের কাজ হবে নিজে থেকেই।":"The proof takes care of itself."}</span></h1>
   <p>{bn?"পেমেন্ট লিংক বা চেকআউট তৈরি করুন। Ekmivo প্রাসঙ্গিক ওয়ালেট SMS যাচাই করে পেমেন্টের অবস্থা জানাবে—স্ক্রিনশট আর TrxID নিয়ে বারবার জিজ্ঞাসা নয়।":"Create payment links or checkout. Ekmivo matches eligible wallet SMS evidence so your team can stop chasing screenshots and transaction IDs."}</p>
   <div className="ekm-hero-actions"><ArrowLink href="/pricing?product=payments">{bn?"প্ল্যান দেখুন":"Explore pricing"}</ArrowLink><a className="ekm-button ekm-button-outline" href="#payment-flow">{bn?"যেভাবে কাজ করে":"See the payment flow"}<span aria-hidden="true">↓</span></a></div>
   <small className="ekm-product-footnote">✓ {bn?"পেমেন্ট আপনার ওয়ালেটেই যাবে · মার্চেন্টের ফোন সংযুক্ত থাকতে হবে":"Your receiving wallet stays yours · Merchant device required"}</small>
  </section>
  <div className="ekm-showcase"><div className="ekm-showcase-head"><span>EKMIVO / PAYMENT FLOW</span><span className="ekm-showcase-label"><i/>{bn?"উদাহরণস্বরূপ দেখানো":"Illustrative experience"}</span></div>
   <div className="ekm-flow-scene">
    <article className="ekm-scene-card"><h3><span>↗</span>{bn?"০১ · পেমেন্ট রিকোয়েস্ট":"01 · Checkout request"}</h3><div className="ekm-demo-field"><small>{bn?"অর্ডার":"ORDER"}</small><strong>#4821 · ৳1,250</strong></div><div className="ekm-demo-field"><small>{bn?"পেমেন্ট মাধ্যম":"PAYMENT METHOD"}</small><strong>bKash / Nagad / Rocket</strong></div><span className="ekm-scene-spacer"/><div className="ekm-demo-chips"><span className="is-on">{bn?"পেমেন্ট তৈরি":"Payment created"}</span></div></article>
    <div className="ekm-scene-connector" aria-hidden="true"/>
    <article className="ekm-scene-card"><h3><span>▤</span>{bn?"০২ · মার্চেন্টের ফোন":"02 · Merchant phone"}</h3><div className="ekm-demo-field"><small>{bn?"প্রাসঙ্গিক SMS এসেছে":"RELEVANT SMS RECEIVED"}</small><strong>৳1,250</strong></div><div className="ekm-demo-chips"><span>{bn?"ওয়ালেট":"Wallet"}</span><span>{bn?"পরিমাণ":"Amount"}</span><span>{bn?"প্রেরক":"Sender"}</span><span>{bn?"সময়":"Time"}</span></div><span className="ekm-scene-spacer"/><div className="ekm-demo-field"><small>{bn?"নিরাপদ যাচাই":"SECURE VERIFICATION"}</small><strong>{bn?"প্রমাণ যাচাই চলছে":"Evidence under review"}</strong></div></article>
    <div className="ekm-scene-connector" aria-hidden="true"/>
    <article className="ekm-scene-card"><h3><span>✓</span>{bn?"০৩ · ড্যাশবোর্ড":"03 · Merchant dashboard"}</h3><div className="ekm-demo-success" aria-hidden="true">✓</div><h4>{bn?"পেমেন্ট যাচাইকৃত":"Payment verified"}</h4><p>{bn?"অনন্য প্রমাণ নিশ্চিত হওয়ার পর":"Only after valid unique evidence is confirmed"}</p><span className="ekm-scene-spacer"/><div className="ekm-demo-line"><span>{bn?"অর্ডার":"Order"}</span><strong>#4821</strong></div><div className="ekm-demo-line"><span>{bn?"অবস্থা":"Status"}</span><strong>{bn?"যাচাইকৃত":"Verified"}</strong></div></article>
   </div><div className="ekm-showcase-bottom"><span>{bn?"ডেমো ডেটা · বাস্তব লেনদেন নয়":"DEMO DATA · NOT A REAL TRANSACTION"}</span><span>{bn?"কাস্টমারের TrxID ইনপুট লাগবে না":"NO CUSTOMER TRXID ENTRY"}</span></div>
  </div>
  <section id="payment-flow" className="ekm-product-section"><ProductHeading kicker={bn?"০১ / যেভাবে কাজ করে":"01 / HOW IT WORKS"} title={bn?"অনুরোধ থেকে নিশ্চিতকরণ—একটি পরিষ্কার প্রক্রিয়া।":"One flow, from request to confirmation."} body={bn?"কাস্টমারের পরিচিত পেমেন্ট পদ্ধতি বদলানোর দরকার নেই।":"Built around the payment behavior your customers already know."}/>
   <div className="ekm-steps">{paymentSteps.map((step,index)=><article key={step.title.en}><span>0{index+1}</span><h3>{step.title[locale]}</h3><p>{step.body[locale]}</p><b aria-hidden="true">↗</b></article>)}</div>
  </section>
  <section className="ekm-forest-banner"><div><span className="ekm-eyebrow">API · CHECKOUT · WEBHOOKS</span><h2>{bn?"আপনার স্টোরফ্রন্ট। আপনার পেমেন্ট ফ্লো।":"Your storefront. Your payment flow."}</h2><p>{bn?"সোশ্যাল কমার্সে লিংক ব্যবহার করুন; নিজের ওয়েবসাইট বা অ্যাপে API ও signed webhook যুক্ত করুন। চূড়ান্ত যাচাই হবে ব্যাকএন্ডে।":"Payment links work for social commerce. APIs and signed webhooks connect your website or app. The backend decides verification, never a browser animation."}</p><ArrowLink href="/developers">{bn?"ইন্টিগ্রেশন দেখুন":"Explore integrations"}</ArrowLink></div><div className="ekm-banner-code"><span className="ekm-code-dots"><i/><i/><i/></span><code>POST /payment-requests{"\n"}{"{"}{"\n"}  &quot;currency&quot;: &quot;BDT&quot;,{"\n"}  &quot;reference&quot;: &quot;ORDER-4821&quot;{"\n"}{"}"}{"\n\n"}→ verified payment event</code><small>ILLUSTRATIVE REQUEST · SERVER VERIFIED</small></div></section>
  <section className="ekm-product-section"><ProductHeading kicker={bn?"০২ / প্রশ্নোত্তর":"02 / FAQ"} title={bn?"শুরু করার আগে জেনে নিন।":"A few things worth knowing."}/><div className="ekm-faq-list">{paymentFaq.map(item=><details key={item.q.en}><summary>{item.q[locale]}<span aria-hidden="true">+</span></summary><p>{item.a[locale]}</p></details>)}</div></section>
  <ProductFinish locale={locale}/></div>
 </main>;
}

const aiFeatures=[
 {title:pair("One shared inbox","এক জায়গায় কথোপকথন"),body:pair("Keep supported customer conversations organized around one Store.","এক স্টোরের সমর্থিত চ্যানেলের কথোপকথন সাজিয়ে রাখুন।")},
 {title:pair("Store-aware answers","স্টোরের তথ্যভিত্তিক উত্তর"),body:pair("Use approved catalog details and Store policies as AI context.","অনুমোদিত ক্যাটালগ ও স্টোরের নীতিমালা থেকে উত্তর দিন।")},
 {title:pair("Human handoff","টিমের কাছে হ্যান্ডঅফ"),body:pair("Bring a teammate into the conversation when a person should step in.","প্রয়োজন হলে টিমের সদস্য সরাসরি কথোপকথন সামলাবেন।")},
 {title:pair("Thoughtful automation","স্মার্ট অটোমেশন"),body:pair("Handle common enquiries, order questions and clear boundaries.","একই প্রশ্ন, অর্ডারের তথ্য ও নিরাপদ সীমা মেনে কাজ করুন।")}
];

export function MarketingAiBotPage({locale}:{locale:Locale}){
 const bn=locale==="bn";
 return <main className="ekm-product ekm-ai-page" lang={locale} id="main">
  <div className="ekm-product-wrap"><section className="ekm-product-hero">
   <span className="ekm-pill"><i/>{bn?"AI Bot · স্মার্ট কাস্টমার কথোপকথন":"AI Bot · Intelligent customer conversations"}</span>
   <h1>{bn?"কাস্টমারের প্রশ্ন থামে না।":"Every customer has a question."}<span>{bn?"প্রতিটি কথোপকথন পাক সঠিক দিশা।":"Give every conversation a direction."}</span></h1>
   <p>{bn?"AI Bot আপনার স্টোরের তথ্য দিয়ে প্রোডাক্টের প্রশ্নের উত্তর দেবে, ক্রেতাকে সাহায্য করবে আর প্রয়োজন হলে টিম কথোপকথনে যুক্ত হতে পারবে।":"Let AI Bot answer product questions with Store knowledge, guide buyers and bring your team in whenever a human touch matters."}</p>
   <div className="ekm-hero-actions"><ArrowLink href="/register">{bn?"শুরু করুন":"Get started"}</ArrowLink><ArrowLink href="/pricing?product=ai_credit" secondary>{bn?"AI প্রাইসিং":"AI pricing"}</ArrowLink></div>
   <small className="ekm-product-footnote">✓ {bn?"স্টোরের তথ্যভিত্তিক উত্তর · শেয়ার্ড ইনবক্স · হিউম্যান হ্যান্ডঅফ":"Store-aware answers · Shared inbox · Human handoff"}</small>
  </section>
  <div className="ekm-showcase"><div className="ekm-showcase-head"><span>EKMIVO / CONVERSATION STUDIO</span><span className="ekm-showcase-label"><i/>{bn?"উদাহরণ কথোপকথন":"Illustrative conversation"}</span></div>
   <div className="ekm-ai-scene">
    <aside className="ekm-ai-panel"><h3>{bn?"শেয়ার্ড ইনবক্স":"SHARED INBOX"}</h3><div className="ekm-ai-contact is-selected"><span>AN</span><div>Arifa N.<small>{bn?"প্রোডাক্ট সম্পর্কে প্রশ্ন":"Product question"}</small></div></div><div className="ekm-ai-contact"><span>RH</span><div>Rahim H.<small>{bn?"অর্ডার সম্পর্কে প্রশ্ন":"Order inquiry"}</small></div></div><div className="ekm-ai-contact"><span>SM</span><div>Sumi M.<small>{bn?"ডেলিভারি সম্পর্কে প্রশ্ন":"Delivery question"}</small></div></div></aside>
    <article className="ekm-ai-panel ekm-ai-chat"><div className="ekm-ai-chat-top"><div className="ekm-ai-contact"><span>AN</span><div>Arifa N.<small>{bn?"কাস্টমার কথোপকথন":"Customer conversation"}</small></div></div><small>● DEMO</small></div><div className="ekm-chat-bubble">{bn?"সবুজ কুর্তিটার M সাইজ আছে?":"Is the green kurti available in medium?"}</div><div className="ekm-chat-bubble is-reply">{bn?"আপনার জন্য প্রোডাক্টের তথ্য দেখছি।":"Let me check the product details for you."}</div><div className="ekm-chat-bubble is-reply">{bn?"ক্যাটালগে M সাইজ আছে। লিংক পাঠাব?":"Medium is listed in the catalog. Would you like the product link?"}</div><div className="ekm-chat-bubble">{bn?"জি, পাঠান!":"Yes, please!"}</div><div className="ekm-chat-draft">{bn?"AI প্রস্তাবিত উত্তর · নমুনা":"AI suggested reply · sample"}<span aria-hidden="true">↗</span></div></article>
    <aside className="ekm-ai-panel ekm-ai-context"><h3>{bn?"ব্যবসার তথ্য":"BUSINESS CONTEXT"}</h3><p>{bn?"আপনার তথ্যভিত্তিক উত্তর":"Answers grounded in your Store"}</p><div><small>CATALOG</small><strong>{bn?"সবুজ কটন কুর্তি":"Green cotton kurti"}</strong><em>{bn?"সাইজ M · উদাহরণ":"Size M · Example"}</em></div><div><small>STORE RULE</small><strong>{bn?"ডেলিভারির তথ্য":"Delivery information"}</strong><em>{bn?"স্টোরের দেওয়া নীতি":"Store-provided policy"}</em></div><div><small>HANDOFF</small><strong>{bn?"টিমের কাছে হস্তান্তর":"Human review when unsure"}</strong><em>AI + TEAM</em></div></aside>
   </div><div className="ekm-showcase-bottom"><span>{bn?"ডেমো কথোপকথন · বাস্তব কাস্টমার নয়":"SAMPLE CONVERSATION · NO LIVE CUSTOMER DATA"}</span><span>STORE KNOWLEDGE → AI → HUMAN</span></div>
  </div>
  <section className="ekm-product-section"><ProductHeading kicker={bn?"০১ / AI BOT":"01 / AI BOT"} title={bn?"AI সাহায্য করবে। নিয়ন্ত্রণ থাকবে আপনার।":"Helpful AI. Clear human control."} body={bn?"একটি স্টোরের গুরুত্বপূর্ণ কথোপকথনগুলো সহজে সামলানোর জায়গা।":"A focused workspace for the conversations that matter to your Store."}/><div className="ekm-ai-features">{aiFeatures.map((feature,index)=><article key={feature.title.en}><span>0{index+1} / AI BOT</span><h3>{feature.title[locale]}</h3><p>{feature.body[locale]}</p></article>)}</div></section>
  <section className="ekm-forest-banner"><div><span className="ekm-eyebrow">ONE STORE · CONNECTED CONVERSATIONS</span><h2>{bn?"প্রশ্ন থেকে পরবর্তী কাজ—এক ফ্লোতে।":"From a question to the next action."}</h2><p>{bn?"ক্যাটালগ, স্টোর পলিসি ও টিমের তথ্য কাজে লাগিয়ে কথোপকথন এগিয়ে নিন। সাধারণ প্রশ্নে AI সাহায্য করবে; প্রয়োজন হলে টিম দায়িত্ব নেবে।":"Use catalog details, Store policies and team knowledge to guide every exchange. AI handles common enquiries while your team remains in control."}</p><ArrowLink href="/pricing?product=ai_credit">{bn?"AI প্ল্যান দেখুন":"Explore AI pricing"}</ArrowLink></div><div className="ekm-banner-quote"><span>EKMIVO AI BOT</span><strong>{bn?"এক কথোপকথন। এক কনটেক্সট।":"One conversation. One context."}</strong><p>{bn?"প্রোডাক্ট তথ্য, ব্যবসার নিয়ম এবং টিমের সাপোর্ট—এক জায়গায়।":"Product information, business rules and human support in one workspace."}</p><small>AI + TEAM · STORE CONNECTED</small></div></section>
  <ProductFinish locale={locale} ai/></div>
 </main>;
}
