"use client";

import { useState } from "react";
import Link from "next/link";
import type { LandingLocale } from "../../lib/landing-content";

type Locale = LandingLocale;
type WorkflowMode = "payments" | "ai";

const copy = {
 en: {
  eyebrow: "PAYMENTS  /  CUSTOMER CONVERSATIONS",
  heroLine1: "GET PAID.",
  heroLine2: "KEEP MOVING.",
  heroLead: "Manage payment links, invoices and checkout for your business. Ekmivo verifies eligible wallet receipts, while an AI workspace for customer conversations is in development.",
  explore: "Explore payments", aiAction: "Discover AI workspace", scroll: "Explore services",
  serviceEyebrow: "01 / WHAT YOU CAN DO", servicesTitle: "Payments or AI.", servicesMarked: "Your choice.",
  servicesLead: "Use payment tools on their own, or explore what’s coming to customer communication.",
  payNumber: "01 / PAYMENTS", payName: "Links, invoices or checkout.",
  payBody: "Create payment requests through links, invoices, or checkout on your website or app. Keep track of payment status without relying on customer screenshots.",
  payBullets: ["Links, invoices & hosted checkout", "bKash, Nagad & Rocket payment options", "Receipt-based payment verification", "Merchant API, status checks & webhooks"],
  payExplore: "Explore payments", aiNumber: "02 / AI WORKSPACE", aiName: "Make room for better conversations.",
  aiBody: "An upcoming workspace for customer messages, AI-assisted answers and smooth handover to your team.",
  aiBullets: ["Unified customer inbox", "Business-aware AI assistance", "Human handover", "Follow-ups & customer context"],
  aiExplore: "See the AI roadmap", aiStatus: "IN DEVELOPMENT", payStatus: "PAYMENT TOOLS",
  howEyebrow: "02 / HOW IT WORKS", howTitle: "Four steps.", howMarked: "One clear flow.",
  howLead: "",
  tabPayments: "Payments", tabAI: "AI workspace", demo: "ILLUSTRATIVE WORKFLOW",
  paySteps: [
   {title:"Create a payment request",body:"Use a payment link, invoice, hosted checkout or merchant API."},
   {title:"Customer pays",body:"They send money using their selected supported mobile wallet."},
   {title:"Evidence is checked",body:"Eligible merchant payment evidence is securely checked before a request is confirmed."},
   {title:"Receive the result",body:"A unique match verifies the payment. Check its status in the dashboard or via webhook."}
  ],
  aiSteps: [
   {title:"Connect a supported channel",body:"Bring authorized conversations into one workspace."},
   {title:"Add your business context",body:"Give the assistant approved product facts and answers."},
   {title:"Help customers faster",body:"AI suggests or handles supported replies with your controls."},
   {title:"Step in when it matters",body:"Your team takes over and keeps the conversation moving."}
  ],
  howFoot:"AI tools are in development; channel availability depends on approval.",
  benefitEyebrow:"03 / WHY EKMIVO", benefitTitle:"Less chasing.", benefitMarked:"More time for business.",
  benefitLead:"",
  benefitCards:[
   {n:"01",icon:"link",title:"Less chasing",text:"Share one payment request instead of asking again and again for proof."},
   {n:"02",icon:"spark",title:"Less repetition",text:"Let helpful workflows handle routine steps, with people in control."},
   {n:"03",icon:"layers",title:"A clearer picture",text:"Keep payment states, conversations and decisions easier to follow."}
  ],
  payStoryEyebrow:"A CLOSER LOOK / PAYMENTS", payStoryTitle:"From checkout",payStoryMarked:"to verification.",
  payStoryBody:"Start with a payment link, invoice or API-powered checkout. Payment evidence is checked securely before a request is marked verified. Follow the result in your dashboard or receive an update through webhooks.",
  payStoryButton:"Get started with payments", paymentPreview:"SAMPLE CHECKOUT · NOT LIVE DATA", linkLabel:"Your payment request", sampleMethod:"bKash · Nagad · Rocket", sampleAmount:"৳ 1,250", sampleContinue:"Continue to checkout", proofMessage:"Verification checks the receipt, not a screenshot.",
  aiStoryEyebrow:"A CLOSER LOOK / AI", aiStoryTitle:"A good answer matters.", aiStoryMarked:"So does a human.",
  aiStoryBody:"Give your team the context behind each customer question. AI assistance and human handover are being developed for supported channels.",
  aiStoryButton:"Explore the AI roadmap", aiPreview:"ILLUSTRATIVE CONVERSATION · IN DEVELOPMENT",
  customerPrompt:"Is the blue one available?", agentReply:"Let me check the available options for you.", handoff:"Bring in a teammate", agentName:"Your assistant", customerName:"Customer",
  audienceEyebrow:"04 / WHO IT’S FOR", audienceTitle:"Built around", audienceMarked:"your kind of work.",
  audienceCards:[
   {n:"01 / SELL",title:"Online sellers",body:"Take payments through checkout on your store or with a shareable payment link.",icon:"bag"},
   {n:"02 / SERVE",title:"Service businesses",body:"Issue invoices or requests for bookings, projects and services, and check their status.",icon:"calendar"},
   {n:"03 / BUILD",title:"Developers & teams",body:"Connect your own product to payment requests, status checks and merchant webhooks.",icon:"code"}
  ],
  promiseEyebrow:"05 / PAYMENT INTEGRITY", promiseTitle:"A verified payment", promiseMarked:"must earn its check.",
  promiseText:"Every payment is checked against eligible receipt evidence before confirmation. Missing or uncertain proof does not become an automatic success.",
  promiseItems:["No customer TrxID form in the normal flow","No automatic success from an ambiguous receipt","People remain responsible for exceptions and refunds"],
  pricingEyebrow:"PRICING & AVAILABILITY", pricingTitle:"Plan details are on the way.", pricingNote:"Final pricing and AI launch dates have not been announced.", pricingCTA:"Create your workspace",
  faqEyebrow:"GOOD QUESTIONS", faqTitle:"Before you get started.",
  faqs:[
   ["What can I use Ekmivo for?","Ekmivo offers payment links, invoices, hosted checkout and merchant API/webhooks with evidence-based payment verification. AI tools for customer conversations are being developed separately."],
   ["Do my customers need to install Ekmivo?","No. They open the checkout from a payment link or your integrated website/app and use their payment wallet. An enrolled Android forwarder on the merchant side supplies supported receipt SMS."],
   ["Does Ekmivo automatically verify every payment?","Only when eligible payment evidence can be confirmed securely. If confirmation is uncertain or unavailable, the request remains pending or requires merchant attention."],
   ["Can I use payments without AI?","Yes. The services are designed to be independent. You do not need to use the AI workspace to set up payment tools."],
   ["Are all AI and third-party integrations live?","No. Several AI, social-channel and commerce integrations are planned or awaiting the necessary approvals and testing. The relevant product pages will reflect availability."]
  ],
  finalEyebrow:"YOUR BUSINESS, YOUR SETUP", finalTitle:"Build a payment setup",finalMarked:"that fits your business.",
  finalBody:"Choose payment links, invoices or integrated checkout to suit the way your customers pay. Start by setting up your Ekmivo workspace.",
  finalButton:"Create your workspace", finalSecondary:"See how it works",
  footerHint:"Two independent services. One thoughtful direction."
 },
bn: {
 eyebrow:"পেমেন্ট ও AI সেবা",
 heroLine1:"পেমেন্ট নিন সহজে।",
 heroLine2:"ব্যবসা চালান নিশ্চিন্তে।",
 heroLead:"পেমেন্ট লিংক, ইনভয়েস বা ওয়েবসাইটের চেকআউট—যেভাবেই টাকা নিন, পেমেন্টের অবস্থা রাখুন নজরে। কাস্টমারের মেসেজ সামলানোর জন্য AI Bot-ও তৈরি হচ্ছে।",
 explore:"Payment Gateway দেখুন",aiAction:"AI Bot সম্পর্কে জানুন",scroll:"আমাদের সেবাগুলো",
 serviceEyebrow:"০১ / Ekmivo-তে যা পাবেন",servicesTitle:"পেমেন্টের কাজ আলাদা।",servicesMarked:"AI-এর কাজও আলাদা।",
 servicesLead:"আপনার প্রয়োজন অনুযায়ী যে সেবা দরকার, সেটি বেছে নিন।",
 payNumber:"০১ / PAYMENT GATEWAY",payName:"আপনার ব্যবসার জন্য পেমেন্ট গেটওয়ে।",
 payBody:"পেমেন্ট লিংক বা ইনভয়েস তৈরি করুন। নিজের ওয়েবসাইট বা অ্যাপে Ekmivo Checkout যুক্ত করুন। পেমেন্ট হলে প্রয়োজনীয় SMS যাচাই করে ড্যাশবোর্ডে তার অবস্থা জানাবে Ekmivo।",
 payBullets:["পেমেন্ট লিংক, ইনভয়েস ও হোস্টেড চেকআউট","বিকাশ, নগদ ও রকেটের মাধ্যমে পেমেন্ট","পেমেন্টের SMS থেকে স্বয়ংক্রিয় যাচাই","ওয়েবসাইট ও অ্যাপের জন্য API ও ওয়েবহুক"],
 payExplore:"Payment Gateway বিস্তারিত",aiNumber:"০২ / AI BOT",aiName:"কাস্টমারের মেসেজের জন্য AI Bot।",
 aiBody:"কাস্টমারের মেসেজ এক জায়গায় দেখা, সাধারণ প্রশ্নের উত্তর দিতে AI-এর সাহায্য নেওয়া এবং প্রয়োজনে টিমের কারও সরাসরি কথা বলার সুবিধা নিয়ে কাজ শুরু হবে শিগগিরই।",
 aiBullets:["বিভিন্ন চ্যানেলের মেসেজ এক ইনবক্সে","ব্যবসার তথ্য ব্যবহার করে AI-এর সাহায্যে উত্তর","দরকার হলে টিম নিজে কথা বলবে","কাস্টমারের আগের কথোপকথন দেখা"],
 aiExplore:"AI Bot-এর পরিকল্পনা দেখুন",aiStatus:"শিগগিরই কাজ শুরু হবে",payStatus:"পেমেন্ট সেবা",
 howEyebrow:"০২ / যেভাবে কাজ করে",howTitle:"পেমেন্ট নেওয়ার",howMarked:"চারটি সহজ ধাপ।",
 howLead:"",
 tabPayments:"Payment Gateway",tabAI:"AI Bot",demo:"পেমেন্ট প্রক্রিয়ার নমুনা",
 paySteps:[
  {title:"পেমেন্ট তৈরি করুন",body:"লিংক, ইনভয়েস বা ওয়েবসাইটের চেকআউট থেকে পেমেন্টের অনুরোধ তৈরি করুন।"},
  {title:"কাস্টমার টাকা পাঠাবেন",body:"বিকাশ, নগদ বা রকেটের যেকোনো একটি মাধ্যম বেছে নিয়ে টাকা পাঠাবেন।"},
  {title:"SMS যাচাই হবে",body:"মার্চেন্টের সংযুক্ত ফোন থেকে পাওয়া পেমেন্টের SMS নিরাপদে সার্ভারে যাচাই করা হবে।"},
  {title:"পেমেন্টের অবস্থা দেখুন",body:"যাচাই শেষে ড্যাশবোর্ডে আপডেট পাবেন। প্রয়োজনে ওয়েবহুক দিয়ে নিজের সিস্টেমেও জানাতে পারবেন।"}
 ],
 aiSteps:[
  {title:"অনুমোদিত চ্যানেল যুক্ত করুন",body:"যেসব চ্যানেল সমর্থিত হবে, সেগুলোর মেসেজ একটি ইনবক্সে দেখা যাবে।"},
  {title:"ব্যবসার তথ্য দিন",body:"আপনার পণ্য, দাম ও সাধারণ প্রশ্নের উত্তর AI-কে জানাতে পারবেন।"},
  {title:"উত্তর দেওয়ার সময় বাঁচান",body:"সাধারণ প্রশ্নের উত্তর দিতে AI সাহায্য করবে।"},
  {title:"প্রয়োজনে নিজে কথা বলুন",body:"কোনো কাস্টমারের সঙ্গে সরাসরি কথা বলতে চাইলে টিম দায়িত্ব নিতে পারবে।"}
 ],
 howFoot:"AI Bot এখনো চালু হয়নি। চ্যানেলগুলো চালুর আগে পরীক্ষা ও অনুমোদন প্রয়োজন।",
 benefitEyebrow:"০৩ / কেন Ekmivo",benefitTitle:"পেমেন্টের ঝামেলা কমান।",benefitMarked:"সময় বাঁচান।",
 benefitLead:"",
 benefitCards:[
  {n:"০১",icon:"link",title:"স্ক্রিনশটের অপেক্ষা কম",text:"সঠিকভাবে যাচাই হওয়া পেমেন্টের জন্য কাস্টমারের কাছে বারবার স্ক্রিনশট চাইতে হবে না।"},
  {n:"০২",icon:"spark",title:"AI Bot-ও আসছে",text:"কাস্টমারের সাধারণ প্রশ্ন সামলাতে AI-এর সাহায্য নেওয়ার সুবিধা নিয়ে কাজ শুরু হবে।"},
  {n:"০৩",icon:"layers",title:"পেমেন্টের হিসাব এক জায়গায়",text:"কোন পেমেন্ট যাচাই হয়েছে, কোনটি এখনো অপেক্ষমাণ—ড্যাশবোর্ডে দেখুন।"}
 ],
 payStoryEyebrow:"PAYMENT GATEWAY",payStoryTitle:"পেমেন্ট তৈরি করুন।",payStoryMarked:"অবস্থা জেনে নিন।",
 payStoryBody:"পেমেন্ট লিংক, ইনভয়েস বা API দিয়ে চেকআউট শুরু করুন। কাস্টমার টাকা পাঠানোর পর SMS যাচাই করে Ekmivo পেমেন্টের অবস্থা আপডেট করবে। ড্যাশবোর্ডে দেখুন, প্রয়োজনে ওয়েবহুকেও আপডেট নিন।",
 payStoryButton:"Payment Gateway দেখুন",paymentPreview:"চেকআউটের নমুনা",linkLabel:"পেমেন্টের পরিমাণ",sampleMethod:"বিকাশ · নগদ · রকেট",sampleAmount:"৳ ১,২৫০",sampleContinue:"পেমেন্ট করুন",proofMessage:"যাচাই হলে পেমেন্টের অবস্থা আপডেট হবে।",
 aiStoryEyebrow:"AI BOT / তৈরি হচ্ছে",aiStoryTitle:"প্রশ্নের উত্তর দিতে",aiStoryMarked:"AI-এর সাহায্য নিন।",
 aiStoryBody:"কাস্টমার কী জানতে চাইছেন, আগের কথোপকথনে কী হয়েছে—এসব তথ্য দেখে উত্তর দেওয়ার ব্যবস্থা নিয়ে কাজ হবে। দরকার হলে আপনার টিম নিজেই কথা বলবে।",
 aiStoryButton:"AI Bot সম্পর্কে জানুন",aiPreview:"নমুনা কথোপকথন · সেবা চালু হয়নি",
 customerPrompt:"নীল রঙেরটা আছে?",agentReply:"কোন সাইজটি লাগবে জানাবেন?",handoff:"টিমের সঙ্গে কথা বলুন",agentName:"AI সহকারী",customerName:"কাস্টমার",
 audienceEyebrow:"০৪ / যাদের জন্য",audienceTitle:"অনলাইন দোকান হোক",audienceMarked:"বা নিজের অ্যাপ।",
 audienceCards:[
  {n:"০১ / অনলাইন শপ",title:"অনলাইন বিক্রেতা",body:"ওয়েবসাইটে চেকআউট যুক্ত করুন অথবা মেসেজে আসা অর্ডারের জন্য পেমেন্ট লিংক দিন।",icon:"bag"},
  {n:"০২ / সেবাভিত্তিক ব্যবসা",title:"কোর্স ও সেবা প্রদানকারী",body:"কোর্স ফি, বুকিং বা কাজের বিলের জন্য ইনভয়েস পাঠান। পেমেন্ট এসেছে কি না, দেখে নিন।",icon:"calendar"},
  {n:"০৩ / সফটওয়্যার",title:"ডেভেলপার ও টিম",body:"API দিয়ে পেমেন্ট তৈরি করুন। ওয়েবহুক ব্যবহার করে নিজের সিস্টেমে আপডেট নিন।",icon:"code"}
 ],
 promiseEyebrow:"০৫ / পেমেন্ট যাচাই",promiseTitle:"যাচাই না করে",promiseMarked:"পেমেন্ট সফল নয়।",
 promiseText:"কোনো পেমেন্ট নিশ্চিত হওয়ার আগে Ekmivo প্রয়োজনীয় রসিদ যাচাই করে। যাচাই না হলে বা সমস্যা থাকলে সেটি সফল দেখানো হয় না।",
 promiseItems:["সাধারণ পেমেন্টে কাস্টমারের TrxID লেখার প্রয়োজন নেই","যাচাই নিশ্চিত না হলে স্বয়ংক্রিয়ভাবে সফল দেখাবে না","সমস্যা বা টাকা ফেরতের অনুরোধ মার্চেন্ট দেখতে পারবেন"],
 pricingEyebrow:"মূল্য ও প্যাকেজ",pricingTitle:"প্যাকেজের দাম পরে জানানো হবে।",pricingNote:"Payment Gateway ও AI Bot-এর প্যাকেজ এখনো চূড়ান্ত হয়নি।",pricingCTA:"অ্যাকাউন্ট তৈরি করুন",
 faqEyebrow:"সাধারণ কিছু প্রশ্ন",faqTitle:"শুরু করার আগে জেনে নিন",
 faqs:[
  ["Ekmivo কী কাজে ব্যবহার করা যায়?","পেমেন্ট লিংক, ইনভয়েস ও চেকআউট দিয়ে টাকা নেওয়া এবং পেমেন্টের অবস্থা দেখার কাজে Ekmivo ব্যবহার করা যায়। নিজের অ্যাপে API ও ওয়েবহুক যুক্ত করতে পারবেন। AI Bot সেবা এখনো চালু হয়নি।"],
  ["কাস্টমারকে কি Ekmivo অ্যাপ ইনস্টল করতে হবে?","না। কাস্টমার ওয়েব চেকআউট খুলে নিজের বিকাশ, নগদ বা রকেট অ্যাপ ব্যবহার করবেন। SMS পাঠানোর Android অ্যাপটি মার্চেন্টের ফোনে লাগে।"],
  ["সব পেমেন্ট কি সঙ্গে সঙ্গে সফল দেখাবে?","না। পেমেন্টের রসিদ সার্ভারে পৌঁছে যাচাই হতে হবে। যাচাই নিশ্চিত না হওয়া পর্যন্ত পেমেন্ট সফল দেখাবে না।"],
  ["AI Bot ছাড়াই কি পেমেন্ট নেওয়া যাবে?","হ্যাঁ। Payment Gateway ও AI Bot আলাদা সেবা। শুধু পেমেন্ট সেবাও ব্যবহার করতে পারবেন।"],
  ["AI Bot কি এখনই ব্যবহার করতে পারব?","না। AI Bot এখনো চালু হয়নি। সেবাটির মূল কাজ শিগগিরই শুরু হবে।"]
 ],
 finalEyebrow:"আপনার ব্যবসার জন্য",finalTitle:"Ekmivo-তে অ্যাকাউন্ট খুলুন।",finalMarked:"পেমেন্ট নেওয়া শুরু করুন।",
 finalBody:"ব্যবসার পেমেন্ট অ্যাকাউন্ট যুক্ত করে প্রয়োজন অনুযায়ী পেমেন্ট লিংক, ইনভয়েস বা চেকআউট ব্যবহার করুন।",
 finalButton:"অ্যাকাউন্ট তৈরি করুন",finalSecondary:"যেভাবে কাজ করে",
 footerHint:"পেমেন্ট সেবা চালু আছে। AI Bot-এর কাজ শুরু হবে শিগগিরই।"
}

} as const;

function Doodle({type="spark",className=""}:{type?:"spark"|"arrow"|"loop";className?:string}){
 if(type==="arrow")return <svg className={className} viewBox="0 0 116 74" fill="none" aria-hidden="true"><path d="M4 59C42 62 62 17 105 12M82 3l24 8-18 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 66C34 69 62 38 73 32" stroke="currentColor" strokeWidth="1" opacity=".4"/></svg>;
 if(type==="loop")return <svg className={className} viewBox="0 0 174 65" fill="none" aria-hidden="true"><path d="M3 28C26 5 46 7 51 33C57 66 91 43 93 23C93 4 71 9 76 30C87 57 122 12 169 27" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M156 17l15 10-17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
 return <svg className={className} viewBox="0 0 66 66" fill="none" aria-hidden="true"><path d="M33 1l5 19 18-9-10 18 19 4-19 5 10 18-18-10-5 19-5-19-18 10 10-18L1 33l19-4-10-18 18 9 5-19z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}

function LineIcon({name}:{name:string}){
 const common={fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 if(name==="link")return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><rect x="16" y="22" width="42" height="31" rx="6" transform="rotate(-9 37 37)"/><path d="M25 35l12-10M24 47h22M17 57l-6 7m50-46 6-6M11 16l-5-7"/></svg>;
 if(name==="spark")return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><path d="M38 7l6 23 23 7-23 7-6 23-7-23-23-7 23-7 7-23z"/><path d="M60 8l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/></svg>;
 if(name==="layers")return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><path d="m37 8 27 15-27 15L10 23 37 8zm-27 29 27 16 27-16M10 49l27 16 27-16"/></svg>;
 if(name==="bag")return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><path d="M17 27h40l5 35H12l5-35zM26 29v-8a11 11 0 0 1 22 0v8M25 46h24"/></svg>;
 if(name==="calendar")return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><rect x="12" y="19" width="50" height="45" rx="5"/><path d="M23 10v18M51 10v18M12 33h50m-38 12h7m10 0h7m-24 10h7"/></svg>;
 return <svg viewBox="0 0 74 74" aria-hidden="true" {...common}><rect x="9" y="14" width="56" height="46" rx="7"/><path d="M9 26h56M29 37l-9 7 9 7m16-14 9 7-9 7"/></svg>;
}

function SectionHead({eyebrow,title,marked,lead,center=false}:{eyebrow:string;title:string;marked:string;lead?:string;center?:boolean}){
 return <div className={"em-heading"+(center?" em-centered":"")}>
  <span className="em-kicker">{eyebrow}</span>
  <h2>{title} <span className="em-brush em-brush-small">{marked}</span></h2>
  {lead&&<p>{lead}</p>}
 </div>;
}

export function MarketingExperience({locale}:{locale:Locale}){
 const t=copy[locale];
 const [mode,setMode]=useState<WorkflowMode>("payments");
 const steps=mode==="payments"?t.paySteps:t.aiSteps;
 return <main className="em" id="main" lang={locale}>
  <section className="em-hero" id="top" aria-labelledby="em-title">
   <div className="em-hero-grain" aria-hidden="true"/>
   <Doodle type="spark" className="em-scribble em-scribble-a"/>
   <Doodle type="loop" className="em-scribble em-scribble-b"/>
   <Doodle type="arrow" className="em-scribble em-scribble-c"/>
   <div className="em-hero-inner">
    <span className="em-hero-eyebrow"><span className="em-dot"/> {t.eyebrow}</span>
    <h1 id="em-title"><span>{t.heroLine1}</span><span className="em-brush em-hero-highlight">{t.heroLine2}</span></h1>
    <p className="em-hero-lead">{t.heroLead}</p>
    <div className="em-actions"><a href={"/"+locale+"/payment-gateway"} className="em-button em-button-primary">{t.explore}<span aria-hidden="true">↗</span></a><a href={"/"+locale+"/ai-bot"} className="em-button em-button-secondary">{t.aiAction}<span aria-hidden="true">↗</span></a></div>
   </div>
   <a href="#services" className="em-scroll-link"><span>{t.scroll}</span><span className="em-scroll-down" aria-hidden="true">↓</span></a>
  </section>

  <section className="em-section em-services" id="services">
   <div className="em-container">
    <SectionHead eyebrow={t.serviceEyebrow} title={t.servicesTitle} marked={t.servicesMarked} lead={t.servicesLead} center/>
    <div className="em-service-grid">
     <article className="em-service-card em-service-pay" id="commerce">
      <div className="em-service-card-top"><span>{t.payNumber}</span><span className="em-service-status">{t.payStatus}</span></div>
      <div className="em-service-mark em-symbol-wallet" aria-hidden="true"><LineIcon name="link"/><span>৳</span></div>
      <h3>{t.payName}</h3><p>{t.payBody}</p>
      <ul>{t.payBullets.map(item=><li key={item}><span aria-hidden="true">↗</span>{item}</li>)}</ul>
      <Link className="em-card-link" href={"/"+locale+"/payment-gateway"}>{t.payExplore}<span aria-hidden="true">↗</span></Link>
      <Doodle type="arrow" className="em-card-doodle"/>
     </article>
     <article className="em-service-card em-service-ai" id="ai">
      <div className="em-service-card-top"><span>{t.aiNumber}</span><span className="em-service-status">{t.aiStatus}</span></div>
      <div className="em-service-mark em-symbol-ai" aria-hidden="true"><LineIcon name="spark"/><span>AI</span></div>
      <h3>{t.aiName}</h3><p>{t.aiBody}</p>
      <ul>{t.aiBullets.map(item=><li key={item}><span aria-hidden="true">↗</span>{item}</li>)}</ul>
      <Link className="em-card-link" href={"/"+locale+"/ai-bot"}>{t.aiExplore}<span aria-hidden="true">↗</span></Link>
      <Doodle type="loop" className="em-card-doodle"/>
     </article>
    </div>
   </div>
  </section>

  <section className="em-section em-workflow" id="workflow">
   <div className="em-container">
    <SectionHead eyebrow={t.howEyebrow} title={t.howTitle} marked={t.howMarked} lead={t.howLead} center/>
    <div className="em-workflow-switch" role="group" aria-label={t.howTitle}>
     <button type="button" onClick={()=>setMode("payments")} className={mode==="payments"?"is-current":""} aria-pressed={mode==="payments"}>{t.tabPayments}</button>
     <button type="button" onClick={()=>setMode("ai")} className={mode==="ai"?"is-current":""} aria-pressed={mode==="ai"}>{t.tabAI}</button>
    </div>
    <div className="em-workflow-grid" aria-live="polite">
     {steps.map((item,i)=><article className="em-step" key={mode+String(i)}>
      <span className="em-step-number">0{i+1}</span>
      <div className="em-step-line" aria-hidden="true"/><h3>{item.title}</h3><p>{item.body}</p>
     </article>)}
    </div>
    <p className="em-workflow-footnote"><span aria-hidden="true">◌</span> {mode==="ai"?t.howFoot:t.demo}</p>
   </div>
  </section>

  <section className="em-section em-benefits">
   <div className="em-container">
    <SectionHead eyebrow={t.benefitEyebrow} title={t.benefitTitle} marked={t.benefitMarked} lead={t.benefitLead} center/>
    <div className="em-benefits-grid">
     {t.benefitCards.map((item,i)=><article className={"em-benefit-card em-tilt-"+i} key={item.n}>
      <span className="em-benefit-index">{item.n} / EKMIVO</span><div className="em-benefit-icon"><LineIcon name={item.icon}/></div>
      <h3>{item.title}</h3><p>{item.text}</p><span className="em-benefit-squiggle" aria-hidden="true">⌁⌁⌁</span>
     </article>)}
    </div>
    <Doodle type="spark" className="em-benefit-spark"/>
   </div>
  </section>

  <section className="em-section em-product em-product-payment" id="payments">
   <div className="em-container em-product-grid">
    <div className="em-product-copy"><SectionHead eyebrow={t.payStoryEyebrow} title={t.payStoryTitle} marked={t.payStoryMarked}/>
     <p>{t.payStoryBody}</p><Link href={"/"+locale+"/register"} className="em-button em-button-primary">{t.payStoryButton}<span aria-hidden="true">↗</span></Link>
     <Doodle type="arrow" className="em-product-arrow"/>
    </div>
    <div className="em-product-visual em-pay-visual">
     <div className="em-demo-orbit" aria-hidden="true"/>
     <div className="em-payment-demo">
      <div className="em-demo-top"><span className="em-demo-brand">ekmivo<span>.</span></span><span>↗</span></div>
      <span className="em-demo-subtitle">{t.linkLabel}</span><strong>{t.sampleAmount}</strong>
      <div className="em-demo-methods">{t.sampleMethod}</div>
      <div className="em-demo-button">{t.sampleContinue} <span>→</span></div><small>{t.paymentPreview}</small>
     </div>
     <div className="em-receipt-note"><span className="em-note-seal" aria-hidden="true">✓</span><p>{t.proofMessage}</p></div>
     <Doodle type="loop" className="em-pay-doodle"/>
    </div>
   </div>
  </section>

  <section className="em-section em-product em-product-ai" id="ai-story">
   <div className="em-container em-product-grid">
    <div className="em-product-visual em-chat-visual">
     <div className="em-chat-board">
      <div className="em-chat-header"><span className="em-avatar em-avatar-a">C</span><div><strong>{t.customerName}</strong><small>{t.aiPreview}</small></div><span className="em-chat-more" aria-hidden="true">•••</span></div>
      <div className="em-chat-bubble em-from-customer">{t.customerPrompt}</div>
      <div className="em-chat-bubble em-from-agent"><span className="em-chat-spark" aria-hidden="true">✳</span>{t.agentReply}</div>
      <div className="em-chat-handoff"><span className="em-avatar em-avatar-b">E</span><span>{t.handoff}</span><span aria-hidden="true">↗</span></div>
     </div>
     <Doodle type="spark" className="em-chat-doodle"/>
    </div>
    <div className="em-product-copy"><SectionHead eyebrow={t.aiStoryEyebrow} title={t.aiStoryTitle} marked={t.aiStoryMarked}/>
     <p>{t.aiStoryBody}</p><Link className="em-button em-button-secondary" href={"/"+locale+"/ai-bot"}>{t.aiStoryButton}<span aria-hidden="true">↗</span></Link>
    </div>
   </div>
  </section>

  <section className="em-section em-audience" id="solutions">
   <div className="em-container">
    <SectionHead eyebrow={t.audienceEyebrow} title={t.audienceTitle} marked={t.audienceMarked} center/>
    <div className="em-audience-grid">{t.audienceCards.map(item=><article className="em-audience-card" key={item.title}>
     <div className="em-audience-icon"><LineIcon name={item.icon}/></div><span>{item.n}</span><h3>{item.title}</h3><p>{item.body}</p><span className="em-audience-arrow" aria-hidden="true">↗</span>
    </article>)}</div>
   </div>
  </section>

  <section className="em-section em-trust" id="principles">
   <div className="em-container em-trust-layout">
    <div className="em-trust-intro"><SectionHead eyebrow={t.promiseEyebrow} title={t.promiseTitle} marked={t.promiseMarked}/><p>{t.promiseText}</p></div>
    <div className="em-trust-notes">{t.promiseItems.map((item,i)=><div className="em-trust-note" key={item}><span className="em-trust-number">0{i+1}</span><p>{item}</p><span aria-hidden="true" className="em-trust-check">✓</span></div>)}</div>
   </div>
  </section>

  <section className="em-section em-pricing" id="pricing"><div className="em-container em-pricing-band">
   <Doodle type="spark" className="em-pricing-spark"/><div><span className="em-kicker">{t.pricingEyebrow}</span><h2>{t.pricingTitle}</h2><small>{t.pricingNote}</small></div>
   <Link href={"/"+locale+"/register"} className="em-button em-button-primary">{t.pricingCTA}<span aria-hidden="true">↗</span></Link>
  </div></section>

  <section className="em-section em-faq" id="faq"><div className="em-container em-faq-grid"><SectionHead eyebrow={t.faqEyebrow} title={t.faqTitle} marked=""/><div className="em-questions">
   {t.faqs.map(([question,answer],i)=><details key={question}><summary><span className="em-question-index">0{i+1}</span><strong>{question}</strong><span className="em-faq-plus" aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
  </div></div></section>

  <section className="em-ending" id="contact"><div className="em-ending-ink" aria-hidden="true"/><Doodle type="loop" className="em-ending-doodle"/><div className="em-container em-ending-content"><span className="em-kicker">{t.finalEyebrow}</span><h2>{t.finalTitle} <span className="em-brush">{t.finalMarked}</span></h2><p>{t.finalBody}</p><div className="em-actions"><Link href={"/"+locale+"/register"} className="em-button em-button-primary">{t.finalButton}<span aria-hidden="true">↗</span></Link><a href="#workflow" className="em-button em-button-secondary">{t.finalSecondary}<span aria-hidden="true">↓</span></a></div></div></section>
 </main>;
}
