"use client";

import { useState } from "react";
import Link from "next/link";
import type { LandingLocale } from "../../lib/landing-content";

type Locale = LandingLocale;
type WorkflowMode = "payments" | "ai";

const copy = {
 en: {
  eyebrow: "PAYMENTS  /  AI  /  LESS BUSYWORK",
  heroLine1: "GET PAID.",
  heroLine2: "KEEP MOVING.",
  heroLead: "Payment links, automatic receipt matching, and a home for customer conversations. Two independent services built around the way you do business.",
  explore: "Explore payments", aiAction: "Discover AI workspace", scroll: "A better way to work",
  note: "Start with the service you need. Add the other when you're ready.",
  marquee: ["PAYMENT LINKS","EVIDENCE-BASED VERIFICATION","CUSTOMER CONVERSATIONS","ONE BUSINESS, TWO SERVICES"],
  serviceEyebrow: "01 / FIND YOUR FIT", servicesTitle: "One business. Two ways", servicesMarked: "to move forward.",
  servicesLead: "Don't change how you work overnight. Start with the tools that matter today.",
  payNumber: "01 / PAYMENTS", payName: "Get paid without the back-and-forth.",
  payBody: "Share a payment link, let customers pay through their familiar wallet, and track the result without chasing transaction screenshots.",
  payBullets: ["Shareable payment links", "bKash, Nagad & Rocket checkout options", "Automatic verification for unique eligible receipts", "Merchant API & webhooks"],
  payExplore: "Explore payments", aiNumber: "02 / AI WORKSPACE", aiName: "Make room for better conversations.",
  aiBody: "Bring customer questions, helpful AI, and your team into the same conversation. Built for the moments that need a quick answer—and the ones that need a person.",
  aiBullets: ["Unified customer inbox", "Business-aware AI assistance", "Human handover", "Follow-ups & customer context"],
  aiExplore: "See the AI roadmap", aiStatus: "IN DEVELOPMENT", payStatus: "PAYMENT TOOLS",
  linkBoth: "Need both? They're designed to work together as Ekmivo grows.",
  howEyebrow: "02 / HOW IT WORKS", howTitle: "From request to result.", howMarked: "Without the chase.",
  howLead: "See the steps that replace the everyday back-and-forth.",
  tabPayments: "Payments", tabAI: "AI workspace", demo: "ILLUSTRATIVE WORKFLOW",
  paySteps: [
   {title:"Create a request",body:"Set an amount and share a checkout link."},
   {title:"Customer sends money",body:"They use their own bKash, Nagad or Rocket account."},
   {title:"Evidence is checked",body:"Ekmivo checks the provider, sender, amount and transaction time."},
   {title:"Know where it stands",body:"A unique match verifies. Missing or conflicting proof stays pending."}
  ],
  aiSteps: [
   {title:"Connect a supported channel",body:"Bring authorized conversations into one workspace."},
   {title:"Add your business context",body:"Give the assistant approved product facts and answers."},
   {title:"Help customers faster",body:"AI suggests or handles supported replies with your controls."},
   {title:"Step in when it matters",body:"Your team takes over and keeps the conversation moving."}
  ],
  howFoot:"AI features and channel connections are being prepared. Availability depends on platform approval.",
  benefitEyebrow:"03 / THE LITTLE THINGS MATTER", benefitTitle:"Less noise.", benefitMarked:"More breathing room.",
  benefitLead:"A few thoughtful tools can change the way a whole day feels.",
  benefitCards:[
   {n:"01",icon:"link",title:"Less chasing",text:"Share one payment request instead of asking again and again for proof."},
   {n:"02",icon:"spark",title:"Less repetition",text:"Let helpful workflows handle routine steps, with people in control."},
   {n:"03",icon:"layers",title:"A clearer picture",text:"Keep payment states, conversations and decisions easier to follow."}
  ],
  payStoryEyebrow:"A CLOSER LOOK / PAYMENTS", payStoryTitle:"Send a link.",payStoryMarked:"Know what happened.",
  payStoryBody:"A checkout your customer understands. A payment record your business can follow. Eligible receipts are matched automatically; uncertain ones never become a false success.",
  payStoryButton:"Get started with payments", paymentPreview:"SAMPLE CHECKOUT · NOT LIVE DATA", linkLabel:"Your payment request", sampleMethod:"bKash · Nagad · Rocket", sampleAmount:"৳ 1,250", sampleContinue:"Continue to checkout", proofMessage:"Verification checks the receipt, not a screenshot.",
  aiStoryEyebrow:"A CLOSER LOOK / AI", aiStoryTitle:"A good answer matters.", aiStoryMarked:"So does a human.",
  aiStoryBody:"Plan a customer experience where conversations have context, routine questions get help, and your team can take over without losing the thread.",
  aiStoryButton:"Explore the AI roadmap", aiPreview:"ILLUSTRATIVE CONVERSATION · IN DEVELOPMENT",
  customerPrompt:"Is the blue one available?", agentReply:"Let me check the available options for you.", handoff:"Bring in a teammate", agentName:"Your assistant", customerName:"Customer",
  audienceEyebrow:"04 / MADE FOR YOUR KIND OF WORK", audienceTitle:"Different businesses.", audienceMarked:"Same need for clarity.",
  audienceCards:[
   {n:"01 / SELL",title:"Online sellers",body:"Keep payment requests, customer questions and the next step less complicated.",icon:"bag"},
   {n:"02 / SERVE",title:"Service businesses",body:"Request payment for a session, project or service—with a clear status to follow.",icon:"calendar"},
   {n:"03 / BUILD",title:"Developers & teams",body:"Connect your own product to payment requests, status checks and merchant webhooks.",icon:"code"}
  ],
  promiseEyebrow:"05 / TRUST IS BUILT INTO THE DETAILS", promiseTitle:"The right result.", promiseMarked:"Not just a green tick.",
  promiseText:"Money matters. So do the details. A payment is only marked verified when its eligible evidence uniquely matches the request. When it doesn't, the status stays honest.",
  promiseItems:["No customer TrxID form in the normal flow","No automatic success from an ambiguous receipt","People remain responsible for exceptions and refunds"],
  pricingEyebrow:"YOUR SETUP, YOUR CALL", pricingTitle:"Start with what fits.", pricingBody:"Payments and AI are separate services. Choose the one your business needs, or bring them together when both are ready.", pricingNote:"Final public pricing and AI service availability are being prepared.", pricingCTA:"Create your workspace",
  faqEyebrow:"GOOD QUESTIONS", faqTitle:"Before you get started.",
  faqs:[
   ["Is Ekmivo a payment gateway or an AI tool?","Both are separate service areas. Payments focuses on checkout and evidence-based verification. The AI workspace for conversations and automation is in development."],
   ["Do my customers need to install Ekmivo?","No. Customers use a web checkout and their usual payment app. An enrolled Android forwarder is used on the merchant side for the supported SMS verification flow."],
   ["Does Ekmivo automatically verify every payment?","Only when a trusted receipt uniquely matches the payer, method, exact amount and original transaction time within the request window. Otherwise the status remains pending or requires attention."],
   ["Can I use payments without AI?","Yes. The services are designed to be independent. You do not need to use the AI workspace to set up payment tools."],
   ["Are all AI and third-party integrations live?","No. Several AI, social-channel and commerce integrations are planned or awaiting the necessary approvals and testing. The relevant product pages will reflect availability."]
  ],
  finalEyebrow:"YOUR NEXT CHAPTER", finalTitle:"Less admin. More",finalMarked:"room to grow.",
  finalBody:"Start with clearer payments. Explore the future of AI-assisted conversations. Build your own way forward.",
  finalButton:"Create your workspace", finalSecondary:"See how it works",
  footerHint:"Two independent services. One thoughtful direction."
 },
 bn: {
  eyebrow:"পেমেন্ট  /  AI  /  কম ঝামেলা",
  heroLine1:"পেমেন্ট হোক সহজ।",
  heroLine2:"কাজ এগিয়ে যাক।",
  heroLead:"পেমেন্ট লিংক, স্বয়ংক্রিয় রসিদ যাচাই আর কাস্টমারের কথোপকথন—ব্যবসার জন্য দুটি স্বাধীন সেবা, একটি সুন্দর অভিজ্ঞতা।",
  explore:"পেমেন্ট দেখুন", aiAction:"AI ওয়ার্কস্পেস",scroll:"কাজের নতুন ছন্দ",
  note:"যে সেবাটি দরকার, সেটি দিয়েই শুরু করুন।",
  marquee:["পেমেন্ট লিংক","প্রমাণভিত্তিক যাচাই","কাস্টমার কথোপকথন","দুটি স্বাধীন সেবা"],
  serviceEyebrow:"০১ / শুরু করুন নিজের মতো",servicesTitle:"দুটি সেবা।",servicesMarked:"একটি সহজ পথ।",
  servicesLead:"সবকিছু একদিনে বদলাতে হবে না। আপনার ব্যবসার প্রয়োজনটাই আগে।",
  payNumber:"০১ / পেমেন্ট",payName:"টাকা নেওয়া হোক ঝামেলাহীন।",
  payBody:"পেমেন্ট লিংক শেয়ার করুন। কাস্টমার নিজের পরিচিত মাধ্যমে টাকা পাঠাক। বারবার স্ক্রিনশট চাওয়া ছাড়াই পেমেন্টের অবস্থা জানুন।",
  payBullets:["শেয়ার করা যায় এমন পেমেন্ট লিংক","বিকাশ, নগদ ও রকেট চেকআউট","যোগ্য রসিদ অনন্যভাবে মিললে স্বয়ংক্রিয় যাচাই","মার্চেন্ট API ও ওয়েবহুক"],
  payExplore:"পেমেন্ট সম্পর্কে জানুন",aiNumber:"০২ / AI ওয়ার্কস্পেস",aiName:"প্রতিটি কথোপকথন হোক গুছানো।",
  aiBody:"কাস্টমারের প্রশ্ন, AI-এর সহায়তা আর আপনার টিম—একই কথোপকথনে। দ্রুত উত্তরের পাশাপাশি মানুষকে নিয়ন্ত্রণে রাখার জন্য তৈরি হচ্ছে।",
  aiBullets:["কাস্টমারের সব মেসেজ এক ইনবক্সে","ব্যবসার তথ্য বুঝে AI-এর সহায়তা","মানুষের কাছে কথোপকথন হস্তান্তর","ফলো-আপ ও কাস্টমার তথ্য"],
  aiExplore:"AI পরিকল্পনা দেখুন",aiStatus:"তৈরি হচ্ছে",payStatus:"পেমেন্ট সেবা",
  linkBoth:"দুটিই দরকার? ভবিষ্যতে একসঙ্গে কাজ করার জন্যই তৈরি হচ্ছে Ekmivo।",
  howEyebrow:"০২ / যেভাবে কাজ করে",howTitle:"অনুরোধ থেকে ফলাফল।",howMarked:"কম অপেক্ষা, কম ঝামেলা।",
  howLead:"প্রতিদিনের ছোট কাজগুলো কীভাবে সহজ হতে পারে, দেখে নিন।",
  tabPayments:"পেমেন্ট",tabAI:"AI ওয়ার্কস্পেস",demo:"শুধু উদাহরণ",
  paySteps:[
   {title:"পেমেন্ট অনুরোধ তৈরি",body:"টাকার পরিমাণ দিন, চেকআউট লিংক শেয়ার করুন।"},
   {title:"কাস্টমার টাকা পাঠায়",body:"বিকাশ, নগদ বা রকেটের পরিচিত অ্যাপ থেকেই।"},
   {title:"রসিদের তথ্য মেলে",body:"মাধ্যম, প্রেরক, পরিমাণ এবং মূল লেনদেনের সময় যাচাই হয়।"},
   {title:"পেমেন্টের অবস্থা জানুন",body:"একটিমাত্র সঠিক মিল হলে Verified; অনিশ্চিত হলে Pending থাকে।"}
  ],
  aiSteps:[
   {title:"অনুমোদিত চ্যানেল যুক্ত করুন",body:"কাস্টমারের কথোপকথন একটি ওয়ার্কস্পেসে আনুন।"},
   {title:"ব্যবসার তথ্য দিন",body:"পণ্য ও প্রয়োজনীয় তথ্য দিয়ে সহকারীকে প্রস্তুত করুন।"},
   {title:"প্রশ্ন সামলান দ্রুত",body:"প্রয়োজন অনুযায়ী AI সহায়তা ও নিয়ন্ত্রিত উত্তর।"},
   {title:"প্রয়োজনে মানুষ এগিয়ে আসুক",body:"টিম কথোপকথন বুঝে দায়িত্ব নিতে পারবে।"}
  ],
  howFoot:"AI ও চ্যানেল সংযোগের সুবিধাগুলো তৈরি হচ্ছে; অনুমোদন ও পরীক্ষা সম্পন্ন হলে পাওয়া যাবে।",
  benefitEyebrow:"০৩ / ছোট বদল, বড় স্বস্তি",benefitTitle:"কম জটিলতা।",benefitMarked:"আরও সময়।",
  benefitLead:"প্রতিদিনের কাজে ছোট কিছু পরিবর্তনই অনেক পার্থক্য গড়ে দেয়।",
  benefitCards:[
   {n:"০১",icon:"link",title:"বারবার খোঁজ নয়",text:"স্ক্রিনশট চেয়ে বসে না থেকে স্পষ্ট পেমেন্ট অনুরোধ পাঠান।"},
   {n:"০২",icon:"spark",title:"এক কাজ বারবার নয়",text:"নিয়ন্ত্রণ রেখে নিয়মিত কাজগুলো সহজ করার পরিকল্পনা।"},
   {n:"০৩",icon:"layers",title:"সবকিছু পরিষ্কার",text:"পেমেন্টের অবস্থা, কথোপকথন ও সিদ্ধান্ত গুছিয়ে রাখুন।"}
  ],
  payStoryEyebrow:"একটু ভেতরে / পেমেন্ট",payStoryTitle:"লিংক পাঠান।",payStoryMarked:"নিশ্চিত অবস্থা জানুন।",
  payStoryBody:"কাস্টমারের জন্য সহজ চেকআউট, ব্যবসার জন্য স্পষ্ট রেকর্ড। রসিদের তথ্য অনন্যভাবে মিললেই পেমেন্ট যাচাই হয়; সন্দেহ থাকলে ভুল Success দেখাবে না।",
  payStoryButton:"পেমেন্ট দিয়ে শুরু করুন",paymentPreview:"নমুনা চেকআউট · লাইভ ডেটা নয়",linkLabel:"আপনার পেমেন্ট অনুরোধ",sampleMethod:"বিকাশ · নগদ · রকেট",sampleAmount:"৳ ১,২৫০",sampleContinue:"পেমেন্ট পেজে যান",proofMessage:"স্ক্রিনশট নয়, রসিদের প্রমাণ মিলিয়েই যাচাই।",
  aiStoryEyebrow:"একটু ভেতরে / AI",aiStoryTitle:"ভালো উত্তর জরুরি।",aiStoryMarked:"মানুষও।",
  aiStoryBody:"কাস্টমারের কথার প্রেক্ষাপট থাকবে, নিয়মিত প্রশ্নে সহায়তা আসবে এবং টিম প্রয়োজনমতো দায়িত্ব নেবে—এই অভিজ্ঞতাটি তৈরি হচ্ছে।",
  aiStoryButton:"AI পরিকল্পনা দেখুন",aiPreview:"নমুনা কথোপকথন · তৈরি হচ্ছে",
  customerPrompt:"নীল রঙেরটা আছে?",agentReply:"চলুন, আপনার জন্য পাওয়া যাচ্ছে কি না দেখি।",handoff:"টিমের সাহায্য নিন",agentName:"সহকারী",customerName:"কাস্টমার",
  audienceEyebrow:"০৪ / আপনার কাজের জন্য",audienceTitle:"কাজ আলাদা।",audienceMarked:"পরিষ্কার থাকাটা সবার দরকার।",
  audienceCards:[
   {n:"০১ / বিক্রয়",title:"অনলাইন বিক্রেতা",body:"পেমেন্ট অনুরোধ আর কাস্টমারের কথোপকথন সহজ রাখুন।",icon:"bag"},
   {n:"০২ / সেবা",title:"সেবাভিত্তিক ব্যবসা",body:"সেশন, প্রজেক্ট বা সেবার জন্য লিংকে পেমেন্ট নিন, অবস্থা জানুন।",icon:"calendar"},
   {n:"০৩ / ডেভেলপার",title:"ডেভেলপার ও টিম",body:"নিজের সিস্টেমে পেমেন্ট অনুরোধ, স্ট্যাটাস ও ওয়েবহুক যুক্ত করুন।",icon:"code"}
  ],
  promiseEyebrow:"০৫ / আস্থা গড়ে ওঠে কাজে",promiseTitle:"শুধু সবুজ টিক নয়।",promiseMarked:"সঠিক ফলাফল।",
  promiseText:"টাকার হিসাব গুরুত্বপূর্ণ। প্রমাণ ঠিকমতো না মিললে Ekmivo কখনো ভুল করে Verified দেখানোর কথা নয়। অনিশ্চিত পেমেন্টের অবস্থা স্পষ্ট থাকবে।",
  promiseItems:["সাধারণ পেমেন্টে কাস্টমারকে TrxID লিখতে হবে না","একাধিক সম্ভাব্য মিল হলে অটো Success নয়","ব্যতিক্রম ও টাকা ফেরতের দায়িত্বে মানুষ থাকবে"],
  pricingEyebrow:"পছন্দ আপনার",pricingTitle:"যেটুকু দরকার, সেটুকু দিয়েই শুরু।",pricingBody:"পেমেন্ট ও AI দুটি আলাদা সেবা। একটি বা দুটোই—ব্যবসার প্রয়োজন অনুযায়ী বেছে নেওয়ার সুবিধা।",pricingNote:"চূড়ান্ত মূল্য ও AI সেবার উন্মুক্ত হওয়ার সময় এখনো প্রকাশিত হয়নি।",pricingCTA:"ওয়ার্কস্পেস তৈরি করুন",
  faqEyebrow:"সাধারণ কিছু প্রশ্ন",faqTitle:"শুরুর আগে জেনে নিন।",
  faqs:[
   ["Ekmivo কি পেমেন্ট সেবা, নাকি AI?","দুটি আলাদা সেবাই রয়েছে। পেমেন্টে চেকআউট ও প্রমাণভিত্তিক যাচাই, আর AI কথোপকথন ও অটোমেশন সেবা তৈরি হচ্ছে।"],
   ["পেমেন্ট করতে কাস্টমারকে Ekmivo অ্যাপ ইনস্টল করতে হয়?","না। কাস্টমার ওয়েব চেকআউট থেকে নিজের পেমেন্ট অ্যাপ ব্যবহার করেন। SMS যাচাইয়ের জন্য মার্চেন্টের সংযুক্ত Android ফোন ব্যবহৃত হয়।"],
   ["সব পেমেন্ট কি স্বয়ংক্রিয়ভাবে Verified হয়?","না। যোগ্য রসিদে মাধ্যম, পূর্ণ প্রেরক নম্বর, সঠিক পরিমাণ ও মূল লেনদেনের সময় অনন্যভাবে মিললেই যাচাই হয়। অন্যথায় Pending বা বিশেষ নজরদারিতে থাকে।"],
   ["AI ছাড়াই কি পেমেন্ট ব্যবহার করা যাবে?","হ্যাঁ। পেমেন্ট ও AI আলাদা সেবা হিসেবেই তৈরি হচ্ছে।"],
   ["সব AI ও থার্ড-পার্টি সংযোগ কি চালু?","না। একাধিক AI, সামাজিক মাধ্যম ও কমার্স সংযোগ তৈরি বা অনুমোদনের অপেক্ষায় আছে। সংশ্লিষ্ট পণ্যের পেজে প্রাপ্যতার অবস্থা জানানো হবে।"]
  ],
  finalEyebrow:"পরের অধ্যায়",finalTitle:"কাজের ঝামেলা কমুক।",finalMarked:"সম্ভাবনা বাড়ুক।",
  finalBody:"পেমেন্টকে আরও পরিষ্কার করুন। AI-এর ভবিষ্যৎ সম্ভাবনা দেখুন। ব্যবসাকে এগিয়ে নিন নিজের মতো।",
  finalButton:"ওয়ার্কস্পেস তৈরি করুন",finalSecondary:"যেভাবে কাজ করে",
  footerHint:"দুটি স্বাধীন সেবা। এগোনোর একটি সুন্দর পথ।"
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
    <div className="em-actions"><a href="#payments" className="em-button em-button-primary">{t.explore}<span aria-hidden="true">↗</span></a><a href="#ai" className="em-button em-button-secondary">{t.aiAction}<span aria-hidden="true">↗</span></a></div>
    <span className="em-hero-note">{t.note}</span>
   </div>
   <a href="#services" className="em-scroll-link"><span>{t.scroll}</span><span className="em-scroll-down" aria-hidden="true">↓</span></a>
   <div className="em-hero-index" aria-hidden="true">EK — 001</div>
  </section>

  <div className="em-ticker" aria-label={t.marquee.join(" · ")}><div className="em-ticker-track">{[...t.marquee,...t.marquee].map((item,i)=><span key={i}><span className="em-ticker-star" aria-hidden="true">✳</span>{item}</span>)}</div></div>

  <section className="em-section em-services" id="services">
   <div className="em-container">
    <SectionHead eyebrow={t.serviceEyebrow} title={t.servicesTitle} marked={t.servicesMarked} lead={t.servicesLead} center/>
    <div className="em-service-grid">
     <article className="em-service-card em-service-pay" id="commerce">
      <div className="em-service-card-top"><span>{t.payNumber}</span><span className="em-service-status">{t.payStatus}</span></div>
      <div className="em-service-mark em-symbol-wallet" aria-hidden="true"><LineIcon name="link"/><span>৳</span></div>
      <h3>{t.payName}</h3><p>{t.payBody}</p>
      <ul>{t.payBullets.map(item=><li key={item}><span aria-hidden="true">↗</span>{item}</li>)}</ul>
      <a className="em-card-link" href="#payments">{t.payExplore}<span aria-hidden="true">↗</span></a>
      <Doodle type="arrow" className="em-card-doodle"/>
     </article>
     <article className="em-service-card em-service-ai" id="ai">
      <div className="em-service-card-top"><span>{t.aiNumber}</span><span className="em-service-status">{t.aiStatus}</span></div>
      <div className="em-service-mark em-symbol-ai" aria-hidden="true"><LineIcon name="spark"/><span>AI</span></div>
      <h3>{t.aiName}</h3><p>{t.aiBody}</p>
      <ul>{t.aiBullets.map(item=><li key={item}><span aria-hidden="true">↗</span>{item}</li>)}</ul>
      <a className="em-card-link" href="#ai-story">{t.aiExplore}<span aria-hidden="true">↗</span></a>
      <Doodle type="loop" className="em-card-doodle"/>
     </article>
    </div>
    <p className="em-service-footnote">{t.linkBoth}</p>
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
     <p>{t.aiStoryBody}</p><a className="em-button em-button-secondary" href="#services">{t.aiStoryButton}<span aria-hidden="true">↗</span></a>
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
   <Doodle type="spark" className="em-pricing-spark"/><div><span className="em-kicker">{t.pricingEyebrow}</span><h2>{t.pricingTitle}</h2><p>{t.pricingBody}</p><small>{t.pricingNote}</small></div>
   <Link href={"/"+locale+"/register"} className="em-button em-button-primary">{t.pricingCTA}<span aria-hidden="true">↗</span></Link>
  </div></section>

  <section className="em-section em-faq" id="faq"><div className="em-container em-faq-grid"><SectionHead eyebrow={t.faqEyebrow} title={t.faqTitle} marked=""/><div className="em-questions">
   {t.faqs.map(([question,answer],i)=><details key={question}><summary><span className="em-question-index">0{i+1}</span><strong>{question}</strong><span className="em-faq-plus" aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
  </div></div></section>

  <section className="em-ending" id="contact"><div className="em-ending-ink" aria-hidden="true"/><Doodle type="loop" className="em-ending-doodle"/><div className="em-container em-ending-content"><span className="em-kicker">{t.finalEyebrow}</span><h2>{t.finalTitle} <span className="em-brush">{t.finalMarked}</span></h2><p>{t.finalBody}</p><div className="em-actions"><Link href={"/"+locale+"/register"} className="em-button em-button-primary">{t.finalButton}<span aria-hidden="true">↗</span></Link><a href="#workflow" className="em-button em-button-secondary">{t.finalSecondary}<span aria-hidden="true">↓</span></a></div></div></section>
 </main>;
}
