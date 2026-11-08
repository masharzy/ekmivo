/** Public marketing language catalog. All interface examples are illustrative, not connected to merchant data. */
export type LandingLocale = "bn" | "en";
export const landingCopy = {
  en: {
    eyebrow: "ONE PLATFORM · TWO POWERFUL SERVICES",
    headline: ["From the first", "hello to the", "final handoff."],
    accent: "Business, in motion.",
    intro: "Customer conversations, AI assistance, orders, payments, and delivery — designed to move together. Start with one service. Add the other when you're ready.",
    explore: "Explore the platform", watch: "See it in action", heroNote: "Built around the reality of selling in Bangladesh.", demo: "INTERACTIVE CONCEPT · NOT LIVE DATA", play: "Play sequence", pause: "Pause sequence",
    heroPhases: [
      {stage:"01 · MESSAGE",title:"A customer reaches out",meta:"Unified inbox",message:"Do you have this in navy?",reply:"Yes — the navy variant is available."},
      {stage:"02 · ASSIST",title:"AI helps with context",meta:"Knowledge-guided response",message:"Can I order one?",reply:"Sure. Let's confirm your details."},
      {stage:"03 · ORDER",title:"The order takes shape",meta:"Catalog-backed order",message:"Navy · size M · quantity 1",reply:"Order draft prepared"},
      {stage:"04 · PAYMENT",title:"Evidence meets payment",meta:"Illustrative unique match",message:"Sender · time · amount · account · method",reply:"Automatically verified"},
    ],
    rail:["AI conversations","Unified inbox","Commerce OS","Payment verification","CRM & follow-ups","Courier workflows","Developer APIs"],
    journeyTag:"A NEW WAY TO OPERATE",journeyTitle:"Watch a customer moment become business momentum.",journeyLead:"One connected story, with a record at every step. Select any chapter or scroll through the sequence.",
    journey:[
      {tag:"INCOMING",title:"The message arrives.",body:"A customer asks a question through a connected, authorized channel. The conversation stays in one inbox.",label:"Customer message",signal:"New inquiry",detail:"Can I order the navy shirt?"},
      {tag:"ASSISTANCE",title:"AI understands the context.",body:"Knowledge and catalog information shape the suggested answer. A person can take over whenever needed.",label:"Suggested response",signal:"Agent draft",detail:"The navy size M is available."},
      {tag:"CHECKOUT",title:"The order is built.",body:"Product variants, actual catalog prices, and confirmed customer details form a traceable order.",label:"Order details",signal:"Draft order",detail:"Navy shirt · size M · 1 item"},
      {tag:"EVIDENCE",title:"Payment is verified.",body:"Transaction time, actual sender number, amount, receiving account, and method are compared. Only a unique match verifies.",label:"Payment matching",signal:"Unique match · example",detail:"Five checks passed"},
      {tag:"FULFILMENT",title:"The team moves forward.",body:"With verification recorded, the order can move through inventory, shipping and delivery workflows.",label:"Fulfilment",signal:"Ready to process",detail:"Order → packing → courier"},
      {tag:"HISTORY",title:"The whole story stays together.",body:"Messages, decisions, records, exceptions and updates remain visible in their proper business.",label:"Timeline",signal:"Connected record",detail:"Conversation · order · payment"},
    ],
    servicesTag:"YOUR BUSINESS, YOUR SETUP",servicesTitle:"Two services. Better together. Fully useful apart.",servicesLead:"Choose communication, commerce and payment operations, or the connected experience.",
    serviceOptions:["AI Communication","Commerce & Payments","Use both"],serviceDescriptors:[
      "Bring messages together, use knowledge-guided AI, hand off to people, and track every lead.",
      "Run catalogs, inventory, orders, payment matching, courier flows and records.",
      "Let a customer conversation become a confirmed order with its payment and fulfilment history attached."
    ],
    included:"PLANNED CAPABILITIES", independent:"Independent services · No forced bundle",
    aiTag:"SERVICE ONE / INTELLIGENT COMMUNICATION",aiTitle:"Every conversation deserves context.",aiLead:"More than a bot that replies. Tools for the customer, the team and everything happening between them.",
    commerceTag:"SERVICE TWO / COMMERCE OPERATIONS",commerceTitle:"Run the work behind every sale.",commerceLead:"The details that make an order real: products, payment evidence, stock and delivery.",
    featuresAI:[
      {id:"channels",tag:"01 · CHANNELS",title:"One conversation hub, everywhere.",body:"Bring supported Messenger, Instagram, WhatsApp, Facebook comments, website chat and Telegram interactions into a unified workflow, subject to provider permissions.",points:["Channel-aware replies and consent","Website widget and Telegram options","Comments and private-message handoff"],chips:["Messenger","Instagram","WhatsApp","Website","Telegram"]},
      {id:"inbox",tag:"02 · INBOX",title:"An inbox your team can actually run.",body:"Search, assign and prioritize conversations, then keep customer history, orders and support notes within reach.",points:["Assignments, snooze, reopen and search","Customer timelines and support tickets","Human takeover, with clear control"],chips:["Assigned","Needs attention","Resolved"]},
      {id:"intelligence",tag:"03 · INTELLIGENCE",title:"Natural help, not canned replies.",body:"Planned Bangla, English and Banglish understanding across text, images and voice, supported by product cards and human confirmation.",points:["Image and voice-note understanding","Website voice conversation","Catalog-grounded product suggestions"],chips:["বাংলা","Banglish","Images","Voice"]},
      {id:"knowledge",tag:"04 · KNOWLEDGE",title:"Teach it once. Improve every answer.",body:"Organize product facts and business policies from documents, URLs and answers; draft, test, publish and undo controlled changes.",points:["PDF, Word, URLs and Q&A","Agent Desk with review before publish","Unanswered-question queue"],chips:["Sources","Draft","Test","Publish"]},
      {id:"crm",tag:"05 · GROWTH",title:"Turn interest into a relationship.",body:"Track leads, follow-ups, call outcomes, campaigns, customer history and the moments that need a human response.",points:["Lead pipeline and smart follow-ups","Consent-aware reminders and campaigns","Reports and customer context"],chips:["New","Qualified","Follow-up","Won"]},
      {id:"handover",tag:"06 · HUMAN CONTROL",title:"People stay in charge.",body:"Pause automation, take over a conversation, manage disputes and keep a clear handover and audit trail.",points:["Practice, live and off modes","Takeover and release controls","Moderation, alerts and escalation"],chips:["AI assisted","Human active","Audit trail"]},
    ],
    featuresCommerce:[
      {id:"catalog",tag:"07 · CATALOG & ORDERS",title:"A stronger foundation for every order.",body:"Catalog variants, stock reservations, warehouses, coupons, packing and returns work from the same underlying records.",points:["Variants, stock and multi-warehouse","Order lifecycle and QR invoices","Exchanges, refunds and coupons"],chips:["Catalog","Stock","Orders","Returns"]},
      {id:"payments",tag:"08 · PAYMENT EVIDENCE",title:"Payment status, backed by evidence.",body:"The planned Android bridge and available official merchant integrations provide distinct verified evidence channels, never invented confirmations.",points:["Automatic matching when unique","Pending and collision handling","Partial advance, COD and reconciliation"],chips:["Sender","Time","Amount","Account","Method"]},
      {id:"fulfilment",tag:"09 · FULFILMENT",title:"From order to doorstep.",body:"Coordinate courier booking, tracking, returns and delivery status without losing the payment and order context.",points:["Steadfast, Pathao, RedX, eCourier plans","Packing, booking and order updates","Delivery history and COD reconciliation"],chips:["Packed","Booked","In transit","Delivered"]},
      {id:"integrations",tag:"10 · INTEGRATIONS",title:"Fits the systems you already use.",body:"Bring online stores and files into the same operations flow, or build with merchant APIs and signed webhooks.",points:["Shopify, WooCommerce and import workflows","Sheets/Excel/CSV; Daraz feasibility","Scoped API keys and signed callbacks"],chips:["WooCommerce","Shopify","CSV","API"]},
      {id:"booking",tag:"11 · SERVICES & SUBSCRIPTIONS",title:"Not only for physical products.",body:"Service bookings, reminders and appropriate Telegram digital subscriptions are part of the planned full product.",points:["Resource-aware calendar booking","Advances and cancellation rules","Telegram Stars where applicable"],chips:["Calendar","Booking","Membership"]},
      {id:"devices",tag:"12 · YOUR WORKSPACE",title:"Your business goes wherever you do.",body:"Merchant web, planned iOS/Android apps, PWA and extension with accountable access for teams, brands and agencies.",points:["Multi-brand roles and permissions","Mobile, PWA and Chrome extension","Onboarding and connection status"],chips:["Web","Android","iOS","Extension"]},
      {id:"analytics",tag:"13 · INSIGHTS",title:"Clarity without guesswork.",body:"Bring together operational reporting for conversations, leads, orders, payments, fulfilment, credits and billing.",points:["Cross-workflow reports and exports","Usage and subscription visibility","Auditable actions and recovery"],chips:["Conversations","Orders","Payments","Usage"]},
    ],
    paymentTag:"A DISTINCTLY BETTER PAYMENT FLOW",paymentTitle:"No screenshot chase. No customer transaction-ID form.",paymentLead:"Payment is confirmed automatically only when trustworthy evidence uniquely matches the request. Ambiguous or missing evidence does not turn into a success.",
    scenarios:["Unique match","Missing evidence","Conflicting receipts"], scenarioTitles:["Automatically verified","Pending evidence","Needs investigation"],scenarioBodies:["All five identifying fields match one unclaimed receipt. An automatic confirmation and webhook can follow.","Not enough transaction evidence is available. The request stays pending without a false success.","More than one candidate or conflicting evidence exists. It remains an exception rather than silently confirming."],
    checks:["Sender number","Transaction time","Exact amount","Receiving account","Payment method"],status:["VERIFIED · EXAMPLE","PENDING · EXAMPLE","EXCEPTION · EXAMPLE"],
    operationsTag:"BUILT FOR REAL OPERATIONS",operationsTitle:"More than automation. An operating system.", operationsText:"A practical home for teams, brands, agencies and developers — with consent, ownership and recoverable records.", operations:["Role-based access and audit history","Multi-brand and agency businesses","Developer APIs and webhook replay","Booking, service credits and billing","Data export, retention and backups","Android/iOS, PWA and extension plans"],
    solutionTag:"MADE FOR YOUR BUSINESS",solutionTitle:"Different business. Same clarity.",solutions:[
      {name:"Online stores",title:"From product question to shipped order",body:"Help with product choices, create catalog-backed orders, verify payments and track fulfilment."},
      {name:"Service teams",title:"From first inquiry to confirmed booking",body:"Turn a conversation into a scheduled service, with reminders, handover and clear payment status."},
      {name:"Agencies",title:"Multiple brands, distinct ownership",body:"Manage client businesses, roles, service budgets and records without mixing customer data."},
      {name:"Developers",title:"Your system, connected to Briofold",body:"Use scoped APIs, signed webhooks and merchant payment requests for authorized workflows."}
    ],
    pricingTag:"FLEXIBLE BY DESIGN",pricingTitle:"Start with what your business needs.",pricingLead:"Pricing is not announced yet. Below are product configurations, not purchasable plans.",
    pricing:[
      {name:"AI Communication",desc:"Customer conversations, AI assistance and team collaboration.",items:["Channels and unified inbox","Knowledge and automation","CRM and human takeover"]},
      {name:"Commerce & Payments",desc:"Operations, payment evidence and fulfilment.",items:["Catalog, inventory and orders","Automatic matching when eligible","Shipping, records and developer APIs"]},
      {name:"Connected business",desc:"One operating flow, both independent services together.",items:["Everything in AI Communication","Everything in Commerce","Connected conversation-to-order history"]}
    ], pricingAction:"View release status",
    trustTag:"TRUST IS A PRODUCT FEATURE",trustTitle:"Designed for control, not mystery.",trustItems:[
      {title:"Permission-aware connections",desc:"Only supported, authorized channel capabilities are used."},
      {title:"Human decisions stay human",desc:"Takeovers, exceptions and disputes remain explicit and auditable."},
      {title:"Evidence-led verification",desc:"No unique match means no automatic confirmed payment."},
      {title:"Tenant boundaries",desc:"Businesses and roles are designed to keep merchant data separate."}
    ],
    faqTag:"THE DETAILS MATTER",faqTitle:"Questions worth answering.",faqs:[
      ["Can I use just one of the two services?","Yes. The planned product supports AI Communication, Commerce & Payments or both, with independent entitlements."],
      ["Does the customer submit a TrxID or screenshot?","No. The planned normal verification flow matches evidence using sender number, time, amount, receiving account and payment method without customer TrxID input."],
      ["Which payment methods will work?","The scope includes bKash, Nagad, Rocket and authorized merchant/gateway integrations. Actual availability depends on permissions, partner capabilities and verified device/provider tests."],
      ["What happens when a payment does not match?","It remains pending or in an exception state. Missing or conflicting evidence never becomes a fabricated verification."],
      ["Can a person take over from AI?","Yes, handover and human control are part of the planned platform. Channel-specific behavior depends on permitted integrations."],
      ["Can I use Messenger, Instagram and WhatsApp?","These channels are in scope, subject to official platform access and approval. Unapproved channel functionality is not presented as live."],
      ["Is the platform live right now?","The marketing experience is a product preview. Business integrations, signup and paid subscriptions are being built and are not available yet."],
    ],
    finalTag:"THE NEXT CHAPTER OF YOUR BUSINESS",finalTitle:"Every message matters. Make every step count.",finalText:"One place for conversations and commerce. Two services you control. A product being built for the way real businesses move.",finalAction:"Explore the first release",finalNote:"Development preview — signup and integrations are not live yet.", sampleCaption:"Illustrative interface · no real merchant data", next:"Next",previous:"Previous", step:"Step", view:"Explore capabilities", close:"Close",
  },
  bn: {
    eyebrow:"একটি প্ল্যাটফর্ম · দুটি স্বাধীন সেবা",
    headline:["প্রথম মেসেজ থেকে","অর্ডার, পেমেন্ট","আর ডেলিভারি।"],
    accent:"ব্যবসা চলুক এক ধারায়।",
    intro:"কাস্টমারের কথোপকথন, AI সহায়তা, অর্ডার, পেমেন্ট আর ডেলিভারি—সব কাজ একই ধারায়। প্রথমে একটি সেবা নিন, প্রয়োজন হলে অন্যটি যুক্ত করুন।",
    explore:"প্ল্যাটফর্ম দেখুন",watch:"কীভাবে কাজ করবে",heroNote:"বাংলাদেশের বাস্তব ব্যবসার কাজ মাথায় রেখে পরিকল্পিত।",demo:"ইন্টারঅ্যাকটিভ নমুনা · লাইভ ডেটা নয়",play:"অ্যানিমেশন চালান",pause:"অ্যানিমেশন থামান",
    heroPhases:[
      {stage:"০১ · মেসেজ",title:"কাস্টমার মেসেজ দিলেন",meta:"এক ইনবক্সে কথোপকথন",message:"নেভি রঙটা আছে?",reply:"হ্যাঁ, নেভি রঙের পণ্য আছে।"},
      {stage:"০২ · সহায়তা",title:"AI তথ্য দেখে সহায়তা করে",meta:"জ্ঞানভিত্তিক উত্তর",message:"একটা অর্ডার করতে পারব?",reply:"অবশ্যই। আপনার তথ্য নিশ্চিত করি।"},
      {stage:"০৩ · অর্ডার",title:"অর্ডার তৈরি হচ্ছে",meta:"পণ্যতালিকার তথ্য অনুযায়ী",message:"নেভি · সাইজ M · ১টি",reply:"অর্ডারের খসড়া তৈরি"},
      {stage:"০৪ · পেমেন্ট",title:"পেমেন্টের তথ্য যাচাই",meta:"একটি নির্দিষ্ট মিলের নমুনা",message:"প্রেরক · সময় · টাকা · অ্যাকাউন্ট · মাধ্যম",reply:"স্বয়ংক্রিয়ভাবে যাচাইকৃত"}
    ],
    rail:["AI কথোপকথন","এক ইনবক্স","কমার্স পরিচালনা","পেমেন্ট যাচাই","CRM ও ফলো-আপ","কুরিয়ার পরিচালনা","Developer API"],
    journeyTag:"ব্যবসার নতুন কাজের ধারা",journeyTitle:"একটি মেসেজ থেকেই শুরু হোক পুরো ব্যবসার কাজ।",journeyLead:"প্রতিটি ধাপে থাকবে প্রয়োজনীয় তথ্য ও ইতিহাস। ধাপ নির্বাচন করুন অথবা স্ক্রল করে দেখুন।",
    journey:[
      {tag:"মেসেজ",title:"কাস্টমার কথা শুরু করেন।",body:"অনুমোদিত সংযুক্ত চ্যানেল থেকে প্রশ্ন আসে। কথোপকথন জমা থাকে একই ইনবক্সে।",label:"কাস্টমারের মেসেজ",signal:"নতুন প্রশ্ন",detail:"নেভি শার্টটা অর্ডার করা যাবে?"},
      {tag:"AI সহায়তা",title:"AI প্রাসঙ্গিক তথ্য বোঝে।",body:"ব্যবসার knowledge ও catalog দেখে উত্তরের খসড়া তৈরি হয়। প্রয়োজন হলে মানুষ দায়িত্ব নেন।",label:"উত্তরের নমুনা",signal:"AI খসড়া",detail:"নেভি, M সাইজটি পাওয়া যাবে।"},
      {tag:"অর্ডার",title:"অর্ডার তৈরি হয়।",body:"সঠিক variant, পণ্যতালিকার মূল্য ও নিশ্চিত করা কাস্টমার তথ্য অনুযায়ী অর্ডার তৈরি হয়।",label:"অর্ডারের তথ্য",signal:"খসড়া অর্ডার",detail:"নেভি শার্ট · M সাইজ · ১টি"},
      {tag:"যাচাই",title:"পেমেন্টের প্রমাণ মেলে।",body:"লেনদেনের সময়, আসল প্রেরকের নম্বর, পরিমাণ, গ্রহণকারী অ্যাকাউন্ট ও মাধ্যম মিলিয়ে দেখা হয়। নির্দিষ্ট একটি মিল হলেই যাচাই।",label:"পেমেন্ট যাচাই",signal:"নির্দিষ্ট মিল · নমুনা",detail:"পাঁচটি শর্ত মিলে গেছে"},
      {tag:"ডেলিভারি",title:"পরের কাজ এগিয়ে যায়।",body:"পেমেন্ট যাচাইয়ের রেকর্ড রেখে অর্ডার মজুত, প্যাকিং, কুরিয়ার ও ডেলিভারির ধাপে এগোয়।",label:"ডেলিভারি পরিচালনা",signal:"প্রস্তুতির ধাপে",detail:"অর্ডার → প্যাকিং → কুরিয়ার"},
      {tag:"ইতিহাস",title:"সব তথ্য এক জায়গায় থাকে।",body:"মেসেজ, সিদ্ধান্ত, লেনদেন, ব্যতিক্রম আর আপডেটের ইতিহাস সঠিক ওয়ার্কস্পেসে পাওয়া যায়।",label:"সম্পূর্ণ ইতিহাস",signal:"একসঙ্গে সংযুক্ত",detail:"কথোপকথন · অর্ডার · পেমেন্ট"}
    ],
    servicesTag:"আপনার ব্যবসা, আপনার পছন্দ",servicesTitle:"দুটি সেবা। আলাদা বা একসঙ্গে।",servicesLead:"AI যোগাযোগ, কমার্স ও পেমেন্ট পরিচালনা অথবা দুটিকে যুক্ত করে পূর্ণ কাজের ধারা বেছে নিন।",
    serviceOptions:["AI যোগাযোগ","কমার্স ও পেমেন্ট","দুটিই"],serviceDescriptors:[
      "মেসেজ একসঙ্গে রাখুন, knowledge দিয়ে AI সহায়তা দিন, মানুষ দায়িত্ব নিন এবং lead track করুন।",
      "পণ্য, মজুত, অর্ডার, পেমেন্ট যাচাই, কুরিয়ার ও ব্যবসার রেকর্ড পরিচালনা করুন।",
      "কথোপকথন থেকে অর্ডার, যাচাইকৃত পেমেন্ট ও ডেলিভারি—সব তথ্য একই ধারায় রাখুন।"
    ],
    included:"পরিকল্পিত সুবিধাসমূহ",independent:"স্বাধীন সেবা · বাধ্যতামূলক বান্ডেল নয়",
    aiTag:"প্রথম সেবা / AI যোগাযোগ",aiTitle:"প্রতিটি কথোপকথনের পেছনে থাকুক সঠিক তথ্য।",aiLead:"শুধু মেসেজের উত্তর নয়। কাস্টমার, টিম আর পুরো যোগাযোগের কাজের জন্য একটি ব্যবস্থা।",
    commerceTag:"দ্বিতীয় সেবা / কমার্স পরিচালনা",commerceTitle:"প্রতিটি বিক্রির পেছনের কাজও সহজ হোক।",commerceLead:"পণ্য, অর্ডার, পেমেন্টের প্রমাণ, মজুত ও ডেলিভারি—ব্যবসার প্রয়োজনীয় অংশগুলো।",
    featuresAI:[
      {id:"channels",tag:"০১ · চ্যানেল",title:"বিভিন্ন চ্যানেল, এক যোগাযোগ ব্যবস্থা।",body:"অনুমোদন সাপেক্ষে Messenger, Instagram, WhatsApp, Facebook comments, ওয়েবসাইট চ্যাট ও Telegram-এ যোগাযোগের পরিকল্পনা।",points:["চ্যানেলের নীতিমালা মেনে উত্তর","ওয়েব চ্যাট ও Telegram-এর সুবিধা","কমেন্ট থেকে প্রাইভেট কথোপকথন"],chips:["Messenger","Instagram","WhatsApp","Website","Telegram"]},
      {id:"inbox",tag:"০২ · ইনবক্স",title:"যে ইনবক্স দিয়ে টিম সত্যিই কাজ করতে পারবে।",body:"কথোপকথন খোঁজা, দায়িত্ব দেওয়া, জরুরি বিষয় আলাদা করা এবং কাস্টমারের ইতিহাস, অর্ডার ও নোট একসঙ্গে।",points:["Assign, snooze, reopen ও search","Customer timeline ও support ticket","মানুষের হাতে নিয়ন্ত্রণ"],chips:["Assigned","Needs attention","Resolved"]},
      {id:"intelligence",tag:"০৩ · AI",title:"শুধু মুখস্থ উত্তর নয়, স্বাভাবিক সহায়তা।",body:"বাংলা, ইংরেজি ও Banglish-এ text, ছবি ও voice বোঝা; পণ্যের তথ্য দিয়ে পরামর্শ এবং প্রয়োজনমতো মানুষের অনুমোদন।",points:["ছবি ও voice note বোঝা","ওয়েবসাইটে voice conversation","Catalog-ভিত্তিক পণ্যের পরামর্শ"],chips:["বাংলা","Banglish","Images","Voice"]},
      {id:"knowledge",tag:"০৪ · নলেজ",title:"একবার শেখান, উত্তর উন্নত করুন।",body:"ডকুমেন্ট, URL, Q&A ও ব্যবসার নীতিমালা থেকে তথ্য সাজানো; পরিবর্তন test, publish ও undo করার ব্যবস্থা।",points:["PDF, Word, URL ও Q&A","Agent Desk: প্রকাশের আগে যাচাই","উত্তরহীন প্রশ্নের তালিকা"],chips:["Sources","Draft","Test","Publish"]},
      {id:"crm",tag:"০৫ · CRM",title:"আগ্রহ থেকে কাস্টমার সম্পর্ক।",body:"Lead, follow-up, কল, প্রচারণা, কাস্টমারের ইতিহাস আর মানুষের সহায়তা প্রয়োজন এমন মুহূর্তগুলোর রেকর্ড।",points:["Lead pipeline ও follow-up","অনুমতিসাপেক্ষ reminder ও campaign","কাস্টমার ইতিহাস ও রিপোর্ট"],chips:["New","Qualified","Follow-up","Won"]},
      {id:"handover",tag:"০৬ · নিয়ন্ত্রণ",title:"সিদ্ধান্তে মানুষই থাকবেন।",body:"AI বন্ধ করা, মানুষের দায়িত্ব নেওয়া, সমস্যা আলাদা করা এবং প্রতিটি পরিবর্তনের হিসাব রাখার পরিকল্পনা।",points:["Practice, live ও off mode","Takeover ও release control","Moderation, alert ও escalation"],chips:["AI assisted","Human active","Audit trail"]}
    ],
    featuresCommerce:[
      {id:"catalog",tag:"০৭ · পণ্য ও অর্ডার",title:"প্রতিটি অর্ডারের শক্ত ভিত্তি।",body:"পণ্যের variant, stock reservation, একাধিক warehouse, coupon, packing ও return-এর তথ্য একই জায়গায়।",points:["Variant, মজুত ও warehouse","Order lifecycle ও QR invoice","Exchange, refund ও coupon"],chips:["Catalog","Stock","Orders","Returns"]},
      {id:"payments",tag:"০৮ · পেমেন্ট",title:"অনুমান নয়, প্রমাণ দিয়ে যাচাই।",body:"পরিকল্পিত Android bridge ও অনুমোদিত merchant integration-এর প্রমাণ আলাদাভাবে ব্যবহার হবে। ভুল confirmation দেখানো হবে না।",points:["নির্দিষ্ট মিল হলে automatic verification","Pending ও conflict handling","Advance, COD ও reconciliation"],chips:["Sender","Time","Amount","Account","Method"]},
      {id:"fulfilment",tag:"০৯ · ডেলিভারি",title:"অর্ডার থেকে কাস্টমারের দরজা।",body:"পেমেন্ট ও অর্ডারের তথ্যসহ কুরিয়ার বুকিং, ট্র্যাকিং, return ও delivery status পরিচালনার ব্যবস্থা।",points:["Steadfast, Pathao, RedX, eCourier পরিকল্পনা","Packing, booking ও status update","Delivery history ও COD হিসাব"],chips:["Packed","Booked","In transit","Delivered"]},
      {id:"integrations",tag:"১০ · ইন্টিগ্রেশন",title:"আপনার বিদ্যমান সিস্টেমের সঙ্গেই কাজ।",body:"Online store, file import, merchant API ও signed webhook দিয়ে একসঙ্গে কাজ করার পরিকল্পনা।",points:["Shopify, WooCommerce ও import","Sheets/Excel/CSV; Daraz feasibility","API key ও signed webhook"],chips:["WooCommerce","Shopify","CSV","API"]},
      {id:"booking",tag:"১১ · সেবা ও সাবস্ক্রিপশন",title:"শুধু পণ্য বিক্রির জন্য নয়।",body:"Service booking, reminder এবং প্রযোজ্য ক্ষেত্রে Telegram digital subscription-ও পরিকল্পিত সুবিধার অংশ।",points:["Calendar booking ও resource","Advance, cancellation ও reminder","প্রযোজ্য ক্ষেত্রে Telegram Stars"],chips:["Calendar","Booking","Membership"]},
      {id:"devices",tag:"১২ · ওয়ার্কস্পেস",title:"ব্যবসার কাজ থাকুক আপনার সঙ্গে।",body:"ওয়েব ও পরিকল্পিত Android/iOS app, PWA, extension, একাধিক ব্র্যান্ড ও টিমের access control।",points:["Brand/agency role ও permission","Mobile, PWA ও Chrome extension","Onboarding ও connection status"],chips:["Web","Android","iOS","Extension"]},
      {id:"analytics",tag:"১৩ · রিপোর্ট",title:"ব্যবসার হিসাব হোক পরিষ্কার।",body:"কথোপকথন, lead, order, payment, courier, credit usage ও billing-এর তথ্যভিত্তিক রিপোর্টের পরিকল্পনা।",points:["Workflow report ও export","Usage ও subscription হিসাব","Audit ও recovery"],chips:["Conversations","Orders","Payments","Usage"]}
    ],
    paymentTag:"পেমেন্ট পরিচালনায় আলাদা অভিজ্ঞতা",paymentTitle:"স্ক্রিনশট চাওয়া নয়। কাস্টমারের TrxID ফর্মও নয়।",paymentLead:"বিশ্বস্ত প্রমাণের সঙ্গে একটি নির্দিষ্ট মিল হলেই automatic confirmation হবে। প্রমাণ অসম্পূর্ণ বা একাধিক মিল হলে verified দেখানো হবে না।",
    scenarios:["নির্দিষ্ট মিল","প্রমাণ অসম্পূর্ণ","পরস্পরবিরোধী প্রমাণ"],scenarioTitles:["স্বয়ংক্রিয়ভাবে যাচাইকৃত","প্রমাণের অপেক্ষায়","যাচাই প্রয়োজন"],scenarioBodies:["পাঁচটি শনাক্তকারী তথ্য একই অব্যবহৃত রসিদের সঙ্গে মিলে গেছে। স্বয়ংক্রিয় confirmation ও webhook পাঠানো সম্ভব।","যথেষ্ট লেনদেনের প্রমাণ নেই। ভুলভাবে সফল না দেখিয়ে pending থাকবে।","একাধিক সম্ভাব্য মিল বা বিরোধ থাকলে exception থাকবে, স্বয়ংক্রিয়ভাবে confirmed নয়।"],
    checks:["প্রেরকের নম্বর","লেনদেনের সময়","টাকার পরিমাণ","গ্রহণকারী অ্যাকাউন্ট","পেমেন্ট মাধ্যম"],status:["যাচাইকৃত · নমুনা","অপেক্ষমাণ · নমুনা","ব্যতিক্রম · নমুনা"],
    operationsTag:"বাস্তব ব্যবসার জন্য",operationsTitle:"শুধু অটোমেশন নয়, ব্যবসার ওয়ার্কস্পেস।",operationsText:"টিম, ব্র্যান্ড, এজেন্সি ও ডেভেলপারের কাজ—নিয়ন্ত্রণ, সম্মতি ও নির্ভরযোগ্য রেকর্ডের পরিকল্পনা।",operations:["Role ও audit history","Multi-brand ও agency ব্যবসা","Developer API ও webhook replay","Booking, credit ও billing","Data export, retention ও backup","Android/iOS, PWA ও extension"],
    solutionTag:"যে ধরনের ব্যবসাই হোক",solutionTitle:"ভিন্ন ব্যবসা, একই স্বচ্ছতা।",solutions:[
      {name:"অনলাইন শপ",title:"পণ্যের প্রশ্ন থেকে ডেলিভারি",body:"পণ্য বাছাইয়ে সহায়তা, ক্যাটালগভিত্তিক অর্ডার, পেমেন্ট যাচাই ও কুরিয়ার।"},
      {name:"সেবা প্রদানকারী",title:"প্রথম যোগাযোগ থেকে বুকিং",body:"কথোপকথন থেকে সময় নির্ধারণ, reminder, human handover ও পেমেন্ট status।"},
      {name:"এজেন্সি",title:"অনেক ব্র্যান্ড, আলাদা নিয়ন্ত্রণ",body:"ক্লায়েন্ট ওয়ার্কস্পেস, role, বাজেট ও কাস্টমারের তথ্য আলাদা রাখা।"},
      {name:"ডেভেলপার",title:"আপনার সিস্টেমের সঙ্গে সংযোগ",body:"অনুমোদিত workflow-এর জন্য scoped API, signed webhook ও merchant payment request।"}
    ],
    pricingTag:"পছন্দের স্বাধীনতা",pricingTitle:"ব্যবসার প্রয়োজনের সেবা দিয়েই শুরু করুন।",pricingLead:"চূড়ান্ত মূল্য প্রকাশিত হয়নি। এগুলো product configuration; এখনই কেনার মতো plan নয়।",
    pricing:[
      {name:"AI যোগাযোগ",desc:"কাস্টমারের কথোপকথন, AI সহায়তা ও টিমের কাজ।",items:["চ্যানেল ও এক ইনবক্স","Knowledge ও automation","CRM ও human takeover"]},
      {name:"কমার্স ও পেমেন্ট",desc:"পণ্য, অর্ডার, পেমেন্টের প্রমাণ ও ডেলিভারি।",items:["পণ্যতালিকা, মজুত ও অর্ডার","যোগ্য প্রমাণে automatic matching","কুরিয়ার, রেকর্ড ও Developer API"]},
      {name:"সংযুক্ত ওয়ার্কস্পেস",desc:"দুটি স্বাধীন সেবা, একই কাজের ধারায়।",items:["AI যোগাযোগের সব সুবিধা","কমার্সের সব সুবিধা","মেসেজ থেকে অর্ডারের যুক্ত ইতিহাস"]}
    ],pricingAction:"রিলিজের অবস্থা দেখুন",
    trustTag:"আস্থা গড়তে হয় কাজ দিয়ে",trustTitle:"নিয়ন্ত্রণ থাকবে, অজানা কিছু নয়।",trustItems:[
      {title:"অনুমতি মেনে সংযোগ",desc:"প্রতিটি চ্যানেলের অনুমোদিত capability-ই ব্যবহার হবে।"},
      {title:"মানুষের সিদ্ধান্ত মানুষের",desc:"Takeover, dispute ও exception হবে স্পষ্ট ও audit করা যাবে।"},
      {title:"প্রমাণভিত্তিক পেমেন্ট",desc:"নির্দিষ্ট মিল না থাকলে automatic verification হবে না।"},
      {title:"ওয়ার্কস্পেসের সুরক্ষা",desc:"প্রতিষ্ঠান ও role অনুযায়ী তথ্য আলাদা রাখার পরিকল্পনা।"}
    ],
    faqTag:"প্রশ্ন থাকতেই পারে",faqTitle:"জেনে নিন বিস্তারিত।",faqs:[
      ["দুটি সেবার একটি আলাদাভাবে নেওয়া যাবে?","হ্যাঁ। পরিকল্পিত প্রোডাক্টে AI যোগাযোগ, কমার্স ও পেমেন্ট অথবা দুটোই আলাদাভাবে বেছে নেওয়া যাবে।"],
      ["কাস্টমারকে TrxID বা স্ক্রিনশট দিতে হবে?","না। স্বাভাবিক পেমেন্ট flow-তে প্রেরক, সময়, পরিমাণ, গ্রহণকারী অ্যাকাউন্ট ও মাধ্যমের প্রমাণ মিলিয়ে যাচাই হবে।"],
      ["কোন পেমেন্ট মাধ্যম থাকবে?","bKash, Nagad, Rocket ও অনুমোদিত merchant/gateway integration scope-এ আছে। বাস্তবে সেবা চালু হওয়া অনুমতি, provider ও device test-এর ওপর নির্ভর করবে।"],
      ["পেমেন্টের প্রমাণ না মিললে কী হবে?","Pending অথবা exception থাকবে। ভুল বা পরস্পরবিরোধী প্রমাণে কখনো কৃত্রিম verification দেখানো হবে না।"],
      ["AI-এর বদলে মানুষ উত্তর দিতে পারবেন?","হ্যাঁ, human takeover পরিকল্পনার অংশ। চ্যানেলভেদে প্রযোজ্য অনুমতির সীমা থাকবে।"],
      ["Messenger, Instagram, WhatsApp যুক্ত করা যাবে?","এই চ্যানেলগুলো scope-এ আছে, তবে official platform approval প্রয়োজন। অনুমোদনবিহীন সুবিধাকে live হিসেবে দেখানো হচ্ছে না।"],
      ["Briofold কি এখন ব্যবহার করা যাবে?","এটি product preview। বাস্তব business integration, signup ও paid subscription তৈরি হচ্ছে; এখনো চালু নয়।"]
    ],
    finalTag:"আপনার ব্যবসার পরবর্তী অধ্যায়",finalTitle:"প্রতিটি মেসেজ গুরুত্বপূর্ণ। প্রতিটি ধাপ এগিয়ে নিন।",finalText:"কথোপকথন ও কমার্সের একটি ওয়ার্কস্পেস। নিয়ন্ত্রণ আপনার, সেবা দুটি স্বাধীন। বাস্তব ব্যবসার প্রয়োজনেই তৈরি হচ্ছে।",finalAction:"প্রথম রিলিজ দেখুন",finalNote:"Development preview — signup ও integration এখনো live নয়।",sampleCaption:"শুধু নমুনা · বাস্তব মার্চেন্ট ডেটা নয়",next:"পরের ধাপ",previous:"আগের ধাপ",step:"ধাপ",view:"সুবিধাগুলো দেখুন",close:"বন্ধ করুন",
  }
} as const;
