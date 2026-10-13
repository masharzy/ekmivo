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
   {title:"Evidence is checked",body:"Ekmivo checks the provider, sender, amount and transaction time."},
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
  payStoryBody:"Start with a payment link, invoice or API-powered checkout. When customers pay through a supported wallet, Ekmivo checks the receipt against the payment request. Only a unique valid match becomes verified, with updates available in your dashboard and webhooks.",
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
  promiseText:"Only an eligible receipt that uniquely matches a payment request is verified. Missing or conflicting evidence never becomes an automatic success.",
  promiseItems:["No customer TrxID form in the normal flow","No automatic success from an ambiguous receipt","People remain responsible for exceptions and refunds"],
  pricingEyebrow:"PRICING & AVAILABILITY", pricingTitle:"Plan details are on the way.", pricingNote:"Final pricing and AI launch dates have not been announced.", pricingCTA:"Create your workspace",
  faqEyebrow:"GOOD QUESTIONS", faqTitle:"Before you get started.",
  faqs:[
   ["What can I use Ekmivo for?","Ekmivo offers payment links, invoices, hosted checkout and merchant API/webhooks with evidence-based payment verification. AI tools for customer conversations are being developed separately."],
   ["Do my customers need to install Ekmivo?","No. They open the checkout from a payment link or your integrated website/app and use their payment wallet. An enrolled Android forwarder on the merchant side supplies supported receipt SMS."],
   ["Does Ekmivo automatically verify every payment?","Only when a trusted receipt uniquely matches the payer, method, exact amount and original transaction time within the request window. Otherwise the status remains pending or requires attention."],
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
  heroLine2:"কাজ রাখুন গুছিয়ে।",
  heroLead:"ব্যবসার জন্য পেমেন্ট লিংক, ইনভয়েস ও চেকআউট পরিচালনা করুন। লেনদেনের তথ্য মিলিয়ে পেমেন্ট যাচাইয়ের পাশাপাশি কাস্টমারের মেসেজের জন্য AI সেবাও তৈরি হচ্ছে।",
  explore:"পেমেন্ট সেবা দেখুন",aiAction:"AI সেবা সম্পর্কে জানুন",scroll:"সেবাগুলো দেখুন",
  serviceEyebrow:"০১ / আমাদের সেবা",servicesTitle:"পেমেন্ট ও AI।",servicesMarked:"যেটা দরকার, সেটাই।",
  servicesLead:"পেমেন্টের কাজ এখনই শুরু করুন। কাস্টমার যোগাযোগের AI সেবাটি তৈরি হচ্ছে।",
  payNumber:"০১ / পেমেন্ট",payName:"লিংক, ইনভয়েস কিংবা চেকআউট।",
  payBody:"পেমেন্ট লিংক বা ইনভয়েস তৈরি করুন, কিংবা নিজের ওয়েবসাইট ও অ্যাপের চেকআউটের সঙ্গে Ekmivo যুক্ত করুন। কাস্টমার টাকা পাঠালে লেনদেনের তথ্য মিলিয়ে পেমেন্টের অবস্থা জানতে পারবেন।",
  payBullets:["পেমেন্ট লিংক, ইনভয়েস ও চেকআউট","বিকাশ, নগদ ও রকেট পেমেন্ট অপশন","SMS রসিদ মিলিয়ে স্বয়ংক্রিয় যাচাই","ওয়েবসাইট ও অ্যাপের জন্য API ও ওয়েবহুক"],
  payExplore:"পেমেন্ট কীভাবে কাজ করে",aiNumber:"০২ / AI সেবা",aiName:"কাস্টমারের মেসেজ সামলান এক জায়গায়।",
  aiBody:"মেসেজের উত্তর দেওয়া, আগের কথোপকথন দেখা এবং দরকার হলে টিমের কাউকে যুক্ত করা—এসব কাজ সহজ করার জন্য AI ওয়ার্কস্পেস তৈরি হচ্ছে।",
  aiBullets:["সব মেসেজ এক ইনবক্সে","ব্যবসার তথ্য থেকে AI-এর সাহায্যে উত্তর","দরকার হলে টিম নিজেই উত্তর দেবে","কাস্টমার ও ফলো-আপের তথ্য"],
  aiExplore:"AI সেবার বিস্তারিত",aiStatus:"তৈরি হচ্ছে",payStatus:"পেমেন্ট",
  howEyebrow:"০২ / কীভাবে কাজ করে",howTitle:"চার ধাপে",howMarked:"পুরো প্রক্রিয়া।",
  howLead:"",
  tabPayments:"পেমেন্ট",tabAI:"AI সেবা",demo:"উদাহরণ হিসেবে দেখানো হয়েছে",
  paySteps:[
   {title:"পেমেন্ট রিকোয়েস্ট তৈরি করুন",body:"লিংক, ইনভয়েস, চেকআউট বা API—আপনার সুবিধামতো শুরু করুন।"},
   {title:"কাস্টমার পেমেন্ট করবেন",body:"পছন্দের মাধ্যম বেছে নিয়ে নির্ধারিত অ্যাকাউন্টে টাকা পাঠাবেন।"},
   {title:"লেনদেনের তথ্য মিলবে",body:"কোন মাধ্যম থেকে, কে, কত টাকা এবং কখন পাঠিয়েছেন—এসব তথ্য মিলিয়ে দেখা হবে।"},
   {title:"পেমেন্টের আপডেট পাবেন",body:"সঠিক মিল হলে Verified হবে। ড্যাশবোর্ড বা ওয়েবহুক থেকে অবস্থা জানা যাবে।"}
  ],
  aiSteps:[
   {title:"মেসেজের চ্যানেল যুক্ত করুন",body:"অনুমোদিত চ্যানেলের কাস্টমার মেসেজ এক জায়গায় আনুন।"},
   {title:"ব্যবসার তথ্য যোগ করুন",body:"পণ্য, দাম ও সাধারণ প্রশ্নের উত্তর দিয়ে AI-কে প্রস্তুত করুন।"},
   {title:"উত্তর দিতে সাহায্য নিন",body:"প্রয়োজনে AI উত্তর সাজাতে বা দিতে সাহায্য করবে।"},
   {title:"নিজেই কথা বলুন",body:"যখন দরকার, আপনার টিম সরাসরি কাস্টমারের সঙ্গে কথা বলবে।"}
  ],
  howFoot:"AI সেবা এখনো তৈরি হচ্ছে। কিছু চ্যানেল যুক্ত করতে সংশ্লিষ্ট প্রতিষ্ঠানের অনুমোদন লাগবে।",
  benefitEyebrow:"০৩ / কেন Ekmivo",benefitTitle:"ছোট কাজের ঝামেলা কমুক।",benefitMarked:"সময় বাঁচুক।",
  benefitLead:"",
  benefitCards:[
   {n:"০১",icon:"link",title:"বারবার স্ক্রিনশট নয়",text:"পেমেন্টের তথ্য মিললে আলাদা করে ট্রানজ্যাকশন আইডি বা স্ক্রিনশট চাইতে হবে না।"},
   {n:"০২",icon:"spark",title:"একই কাজ বারবার নয়",text:"কাস্টমারের সাধারণ প্রশ্ন ও নিয়মিত কাজে AI-এর সাহায্য নেওয়ার সুবিধা তৈরি হচ্ছে।"},
   {n:"০৩",icon:"layers",title:"পেমেন্টের অবস্থা স্পষ্ট",text:"কোন পেমেন্ট সফল, কোনটি অপেক্ষমাণ—এক জায়গা থেকে দেখুন।"}
  ],
  payStoryEyebrow:"পেমেন্ট সেবা",payStoryTitle:"চেকআউট থেকে",payStoryMarked:"পেমেন্ট যাচাই পর্যন্ত।",
  payStoryBody:"পেমেন্ট লিংক, ইনভয়েস বা API দিয়ে চেকআউট শুরু করুন। কাস্টমার বিকাশ, নগদ বা রকেটে টাকা পাঠালে Ekmivo রসিদের প্রেরক নম্বর, মাধ্যম, টাকার পরিমাণ ও লেনদেনের সময় মিলিয়ে দেখবে। একটি সঠিক মিল পাওয়া গেলেই পেমেন্ট Verified হবে; ফলাফল ড্যাশবোর্ড ও ওয়েবহুকে পাওয়া যাবে।",
  payStoryButton:"পেমেন্ট শুরু করুন",paymentPreview:"নমুনা পেমেন্ট পেজ",linkLabel:"পেমেন্টের পরিমাণ",sampleMethod:"বিকাশ · নগদ · রকেট",sampleAmount:"৳ ১,২৫০",sampleContinue:"পেমেন্ট করুন",proofMessage:"স্ক্রিনশট পাঠানোর দরকার নেই।",
  aiStoryEyebrow:"AI সেবা · তৈরি হচ্ছে",aiStoryTitle:"প্রশ্নের উত্তর দিন।",aiStoryMarked:"প্রয়োজনে নিজেই সামলান।",
  aiStoryBody:"কাস্টমার আগেও কী জানতে চেয়েছিলেন, কী পণ্য দেখছিলেন—এসব তথ্য সামনে রেখেই উত্তর দেওয়ার ব্যবস্থা তৈরি হচ্ছে। AI সাহায্য করবে, নিয়ন্ত্রণ থাকবে আপনার টিমের হাতে।",
  aiStoryButton:"AI সেবা সম্পর্কে জানুন",aiPreview:"AI সেবার নমুনা · তৈরি হচ্ছে",
  customerPrompt:"নীল রঙেরটা কি আছে?",agentReply:"একটু দেখে জানাচ্ছি। কোন সাইজটি লাগবে?",handoff:"টিমের সঙ্গে কথা বলুন",agentName:"AI সহকারী",customerName:"কাস্টমার",
  audienceEyebrow:"০৪ / যাদের জন্য",audienceTitle:"আপনার ব্যবসায়ও",audienceMarked:"কাজে লাগবে।",
  audienceCards:[
   {n:"০১ / অনলাইন শপ",title:"অনলাইন বিক্রেতা",body:"দোকানের চেকআউট থেকে বা পেমেন্ট লিংক দিয়ে টাকা নিন।",icon:"bag"},
   {n:"০২ / সেবাভিত্তিক কাজ",title:"সেবা প্রদানকারী",body:"ক্লাস, পরামর্শ বা প্রজেক্টের জন্য ইনভয়েস তৈরি করুন, পেমেন্টের অবস্থা দেখুন।",icon:"calendar"},
   {n:"০৩ / সফটওয়্যার",title:"ডেভেলপার ও টিম",body:"নিজের ওয়েবসাইট বা অ্যাপে পেমেন্ট লিংক, স্ট্যাটাস ও ওয়েবহুক যুক্ত করুন।",icon:"code"}
  ],
  promiseEyebrow:"০৫ / পেমেন্ট যাচাই",promiseTitle:"শুধু টাকা পাঠালেই",promiseMarked:"সফল নয়।",
  promiseText:"প্রেরকের নম্বর, পেমেন্টের মাধ্যম, টাকার পরিমাণ ও লেনদেনের সময়—সব তথ্য ঠিকমতো মিললে তবেই পেমেন্ট সফল হবে। না মিললে ভুল করে সফল দেখানো হবে না।",
  promiseItems:["পেমেন্টের সময় কাস্টমারকে TrxID লিখতে হবে না","একাধিক পেমেন্টের সঙ্গে তথ্য মিলে গেলে স্বয়ংক্রিয়ভাবে সফল হবে না","সমস্যা হলে বিক্রেতা পেমেন্ট দেখে প্রয়োজনীয় ব্যবস্থা নিতে পারবেন"],
  pricingEyebrow:"মূল্য ও প্যাকেজ",pricingTitle:"প্যাকেজের বিস্তারিত শিগগিরই।",pricingNote:"চূড়ান্ত মূল্য ও AI সেবা চালুর সময় এখনো ঘোষণা করা হয়নি।",pricingCTA:"অ্যাকাউন্ট তৈরি করুন",
  faqEyebrow:"জানতে চাইতে পারেন",faqTitle:"কিছু সাধারণ প্রশ্ন",
  faqs:[
   ["Ekmivo দিয়ে কী করা যায়?","Ekmivo-তে পেমেন্ট লিংক, ইনভয়েস ও চেকআউট ব্যবহার করা যায়। নিজের ওয়েবসাইট বা অ্যাপের জন্য API ও ওয়েবহুকও রয়েছে। পেমেন্ট যাচাইয়ের পাশাপাশি কাস্টমার যোগাযোগের AI সেবা আলাদাভাবে তৈরি হচ্ছে।"],
   ["আমার কাস্টমারকে কি Ekmivo অ্যাপ ইনস্টল করতে হবে?","না। কাস্টমার পেমেন্ট লিংক বা আপনার ওয়েবসাইটের চেকআউট খুলে নিজের বিকাশ, নগদ বা রকেট ব্যবহার করবেন। SMS দিয়ে যাচাইয়ের জন্য মার্চেন্টের সংযুক্ত Android ফোন প্রয়োজন।"],
   ["পেমেন্ট কি নিজে থেকেই সফল দেখাবে?","প্রেরকের নম্বর, পেমেন্টের মাধ্যম, টাকার পরিমাণ ও লেনদেনের সময় একটি পেমেন্টের সঙ্গে ঠিকমতো মিললে স্বয়ংক্রিয়ভাবে যাচাই হবে। তথ্য না মিললে বা একাধিক পেমেন্টের সঙ্গে মিলে গেলে অপেক্ষমাণ থাকবে।"],
   ["পেমেন্ট নিতে কি AI সেবা ব্যবহার করতেই হবে?","না। পেমেন্ট ও AI আলাদা সেবা। শুধু পেমেন্ট সেবা ব্যবহার করতে পারবেন।"],
   ["AI ও Messenger, WhatsApp-এর মতো সংযোগ কি এখনই পাওয়া যাবে?","না। AI ও বেশ কিছু চ্যানেল সংযোগ এখনো তৈরি হচ্ছে। কিছু সংযোগ চালুর আগে সংশ্লিষ্ট প্ল্যাটফর্মের অনুমোদন প্রয়োজন।"]
  ],
  finalEyebrow:"আপনার ব্যবসার জন্য",finalTitle:"নিজের পেমেন্ট সেটআপ",finalMarked:"শুরু করুন আজই।",
  finalBody:"পেমেন্ট লিংক, ইনভয়েস বা ওয়েবসাইটের চেকআউট—ব্যবসার প্রয়োজন অনুযায়ী বেছে নিন। Ekmivo-তে আপনার ওয়ার্কস্পেস তৈরি করে শুরু করুন।",
  finalButton:"অ্যাকাউন্ট তৈরি করুন",finalSecondary:"কীভাবে কাজ করে",
  footerHint:"পেমেন্ট ও AI—দুটি আলাদা সেবা।"
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
