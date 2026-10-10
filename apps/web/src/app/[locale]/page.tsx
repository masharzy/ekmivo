import Link from "next/link";
import { LandingHero } from "../../components/landing-hero";
import { notFound } from "next/navigation";

const content = {
  en: {
    skip: "Skip to content", eyebrow: "THE NEW WORKSPACE FOR GROWING BUSINESSES",
    heroFirst: "Every conversation.", heroSecond: "Every order.", heroAccent: "One clear place.",
    heroText: "Customer messages, AI assistance, orders and payment records finally work together. Choose the communication service, the commerce service, or both.",
    heroPrimary: "Explore the platform", heroSecondary: "See how it works", heroFoot: "Two independent services. One connected experience.",
    scroll: "SCROLL TO EXPLORE", section01: "01 / THE IDEA", ideaKicker: "Less switching. More clarity.",
    ideaTitle: "Your customer does not see separate tools. Your team should not have to, either.",
    ideaText: "A product question can become an order. An order can become a payment. Ekmivo keeps the context together, while each service remains useful on its own.",
    aLabel: "SERVICE 01", aName: "AI Communication", aDesc: "A shared place for conversations, helpful answers and the moments when a person needs to step in.",
    aPoints: ["Unified inbox and channel conversations", "Knowledge-guided answers and human takeover", "Leads, follow-ups and customer context"],
    bLabel: "SERVICE 02", bName: "Commerce Operations", bDesc: "The operational side of selling, from product information to orders, payments and delivery.",
    bPoints: ["Catalog, orders and inventory", "Automatic payment verification", "Shipping and business records"],
    combined: "Use either service independently. Connect them when your business needs the complete flow.",
    section02: "02 / THE FLOW", flowTitle: "From first question to finished order.", flowText: "A simple path for the customer. A complete trail for the business.",
    flowSteps: [
      ["01", "A conversation starts", "A customer asks about a product in a connected channel."],
      ["02", "An order takes shape", "The customer confirms the details; the price comes from the catalog."],
      ["03", "Payment is matched", "Merchant device evidence is checked against the sender, time, amount and receiving account."],
      ["04", "The team moves forward", "A verified order can continue to fulfilment with its history attached."],
    ],
    sample: "ILLUSTRATIVE WORKFLOW · NOT LIVE DATA", previewInbox: "Conversation", previewName: "Customer conversation", previewMessage: "Is the charcoal notebook available?", previewReply: "Yes, the charcoal variant is available. Would you like to place an order?", previewOrder: "Order draft", previewItem: "Charcoal notebook", previewQty: "1 item · catalog price", previewPayment: "Payment verification", previewMatch: "One receipt matched", previewDetail: "Sender · time · amount · receiving account", previewVerified: "Verified automatically",
    section03: "03 / PAYMENTS", paymentTitle: "Payment status should come from evidence.", paymentText: "The planned phone bridge reads a merchant’s payment notification or SMS with consent. A unique match across sender number, transaction time, amount and receiving account verifies the payment automatically. Missing or ambiguous evidence stays pending.",
    paymentNoId: "The customer does not need to enter a transaction ID or upload a screenshot.", paymentDiagram: ["Sender number", "Time window", "Amount", "Receiving account"], paymentResult: "Unique match → verified",
    section04: "04 / BUILT FOR REAL WORK", principlesTitle: "The useful details stay visible.", principles: [
      ["One history", "The team can follow a customer’s question through the order and payment steps."],
      ["Human control", "People can take over a conversation when judgment, care or an exception is needed."],
      ["Clear status", "Pending, verified and exception states have different meanings and visible evidence."],
    ],
    ctaEyebrow: "EKMIVO IS TAKING SHAPE", ctaTitle: "A calmer way to run the busy parts of business.", ctaText: "The full first release is being built now. Explore the two services and follow the work as it becomes available.", ctaButton: "Create an account", ctaSmall: "Account access is not open yet; the registration page shows the current status.",
  },
  bn: {
    skip: "মূল অংশে যান", eyebrow: "বাড়তে থাকা ব্যবসার জন্য নতুন ওয়ার্কস্পেস",
    heroFirst: "প্রতিটি কথোপকথন।", heroSecond: "প্রতিটি অর্ডার।", heroAccent: "এক জায়গায়।",
    heroText: "কাস্টমারের মেসেজ, AI সহায়তা, অর্ডার ও পেমেন্টের তথ্য একসঙ্গে রাখুন। যোগাযোগ সেবা, কমার্স সেবা অথবা দুটিই বেছে নিন।",
    heroPrimary: "প্ল্যাটফর্ম দেখুন", heroSecondary: "যেভাবে কাজ করে", heroFoot: "দুটি স্বাধীন সেবা। একটি সংযুক্ত অভিজ্ঞতা।",
    scroll: "নিচে দেখুন", section01: "০১ / মূল ভাবনা", ideaKicker: "কম ঘোরাঘুরি। পরিষ্কার কাজ।",
    ideaTitle: "কাস্টমারের কাছে সবই একটি ব্যবসা। আপনার দলের কাছেও কাজটা একসঙ্গে থাকুক।",
    ideaText: "পণ্যের প্রশ্ন থেকে অর্ডার হয়। অর্ডারের পরে আসে পেমেন্ট। Ekmivo প্রতিটি ধাপের প্রাসঙ্গিক তথ্য এক জায়গায় রাখবে। চাইলে দুটি সেবাই আলাদাভাবে ব্যবহার করা যাবে।",
    aLabel: "সেবা ০১", aName: "AI যোগাযোগ", aDesc: "কথোপকথন, তথ্যভিত্তিক উত্তর এবং প্রয়োজনের সময় মানুষের দায়িত্ব নেওয়ার জায়গা।",
    aPoints: ["এক ইনবক্সে চ্যানেলের কথোপকথন", "জ্ঞানভিত্তিক উত্তর ও মানুষের হাতে দায়িত্ব", "লিড, ফলো-আপ ও কাস্টমারের তথ্য"],
    bLabel: "সেবা ০২", bName: "কমার্স পরিচালনা", bDesc: "পণ্যের তথ্য থেকে অর্ডার, পেমেন্ট ও ডেলিভারি পর্যন্ত ব্যবসার কাজ।",
    bPoints: ["পণ্যতালিকা, অর্ডার ও মজুত", "স্বয়ংক্রিয় পেমেন্ট যাচাই", "ডেলিভারি ও ব্যবসার রেকর্ড"],
    combined: "যেকোনো একটি সেবা ব্যবহার করুন। পুরো কাজের ধারা চাইলে দুটিকে যুক্ত করুন।",
    section02: "০২ / কাজের ধারা", flowTitle: "প্রথম প্রশ্ন থেকে অর্ডার সম্পন্ন হওয়া পর্যন্ত।", flowText: "কাস্টমারের জন্য সহজ পথ। ব্যবসার জন্য প্রতিটি ধাপের রেকর্ড।",
    flowSteps: [
      ["০১", "কথোপকথন শুরু", "কাস্টমার সংযুক্ত চ্যানেলে পণ্য সম্পর্কে জানতে চান।"],
      ["০২", "অর্ডার তৈরি", "কাস্টমার তথ্য নিশ্চিত করেন; দাম আসে পণ্যতালিকা থেকে।"],
      ["০৩", "পেমেন্ট মেলে", "প্রেরকের নম্বর, সময়, পরিমাণ ও গ্রহণকারী অ্যাকাউন্টের সঙ্গে মার্চেন্টের ডিভাইসের প্রমাণ মেলে।"],
      ["০৪", "পরের কাজ এগোয়", "যাচাই হওয়া অর্ডার আগের সব তথ্যসহ ডেলিভারির ধাপে যায়।"],
    ],
    sample: "কাজের নমুনা · বাস্তব তথ্য নয়", previewInbox: "কথোপকথন", previewName: "কাস্টমারের মেসেজ", previewMessage: "চারকোল নোটবুকটা কি আছে?", previewReply: "হ্যাঁ, চারকোল রংটি আছে। আপনি কি অর্ডার করতে চান?", previewOrder: "অর্ডারের খসড়া", previewItem: "চারকোল নোটবুক", previewQty: "১টি পণ্য · তালিকার দাম", previewPayment: "পেমেন্ট যাচাই", previewMatch: "একটি রসিদ মিলেছে", previewDetail: "প্রেরক · সময় · পরিমাণ · গ্রহণকারী অ্যাকাউন্ট", previewVerified: "স্বয়ংক্রিয়ভাবে যাচাই হয়েছে",
    section03: "০৩ / পেমেন্ট", paymentTitle: "পেমেন্টের অবস্থা প্রমাণ থেকেই আসুক।", paymentText: "পরিকল্পিত ফোন ব্রিজ মার্চেন্টের সম্মতিতে পেমেন্টের SMS বা notification পড়বে। প্রেরকের নম্বর, লেনদেনের সময়, পরিমাণ ও গ্রহণকারী অ্যাকাউন্টে একটি নির্দিষ্ট মিল পাওয়া গেলে পেমেন্ট স্বয়ংক্রিয়ভাবে যাচাই হবে। প্রমাণ না পাওয়া গেলে বা একাধিক সম্ভাব্য মিল থাকলে অপেক্ষমাণ থাকবে।",
    paymentNoId: "কাস্টমারকে ট্রানজ্যাকশন আইডি লিখতে বা স্ক্রিনশট দিতে হবে না।", paymentDiagram: ["প্রেরকের নম্বর", "সময়ের সীমা", "পরিমাণ", "গ্রহণকারী অ্যাকাউন্ট"], paymentResult: "একটি নির্দিষ্ট মিল → যাচাই হয়েছে",
    section04: "০৪ / বাস্তব কাজের জন্য", principlesTitle: "জরুরি তথ্য চোখের সামনেই থাকবে।", principles: [
      ["এক ধারাবাহিকতা", "কাস্টমারের প্রশ্ন থেকে অর্ডার ও পেমেন্ট পর্যন্ত দল একই ইতিহাস দেখবে।"],
      ["মানুষের নিয়ন্ত্রণ", "বিচারবুদ্ধি, যত্ন বা ব্যতিক্রম দরকার হলে মানুষ কথোপকথনের দায়িত্ব নেবেন।"],
      ["স্পষ্ট অবস্থা", "অপেক্ষমাণ, যাচাইকৃত ও ব্যতিক্রম—প্রতিটি অবস্থার অর্থ ও প্রমাণ আলাদা থাকবে।"],
    ],
    ctaEyebrow: "EKMIVO তৈরি হচ্ছে", ctaTitle: "ব্যবসার ব্যস্ত কাজগুলো চালানোর শান্ত একটি উপায়।", ctaText: "পূর্ণ প্রথম রিলিজ তৈরি হচ্ছে। দুটি সেবা দেখুন এবং নতুন অংশ চালু হলে জানতে পারবেন।", ctaButton: "অ্যাকাউন্ট তৈরি করুন", ctaSmall: "অ্যাকাউন্ট চালু হয়নি; রেজিস্ট্রেশন পেজে বর্তমান অবস্থা দেখানো আছে।",
  },
} as const;

export function generateStaticParams() { return [{ locale: "bn" }, { locale: "en" }]; }

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "bn" && locale !== "en") notFound();
  const t = content[locale];
  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <main id="main">
      <LandingHero locale={locale} />

      <section className="idea-section section-shell" id="services"><div className="section-head"><span className="section-index">{t.section01}</span><span className="section-rule" /></div><div className="idea-grid"><div><p className="small-kicker">{t.ideaKicker}</p><h2>{t.ideaTitle}</h2></div><p className="section-lead">{t.ideaText}</p></div>
        <div className="service-rows"><article className="service-row"><div className="service-meta"><span>{t.aLabel}</span><span className="service-symbol" aria-hidden="true">✳</span></div><div><h3>{t.aName}</h3><p>{t.aDesc}</p></div><ul>{t.aPoints.map(item => <li key={item}>{item}</li>)}</ul><span className="service-arrow" aria-hidden="true">↗</span></article><article className="service-row"><div className="service-meta"><span>{t.bLabel}</span><span className="service-symbol commerce-symbol" aria-hidden="true">▦</span></div><div><h3>{t.bName}</h3><p>{t.bDesc}</p></div><ul>{t.bPoints.map(item => <li key={item}>{item}</li>)}</ul><span className="service-arrow" aria-hidden="true">↗</span></article></div><div className="combined-line"><span className="combined-icon" aria-hidden="true">↔</span><p>{t.combined}</p></div>
      </section>

      <section className="workflow-section" id="workflow"><div className="section-shell"><div className="section-head"><span className="section-index">{t.section02}</span><span className="section-rule" /></div><div className="workflow-heading"><h2>{t.flowTitle}</h2><p>{t.flowText}</p></div><div className="workflow-grid"><ol className="workflow-list">{t.flowSteps.map(([number, title, desc]) => <li key={number}><span className="step-number">{number}</span><div><h3>{title}</h3><p>{desc}</p></div></li>)}</ol><div className="workflow-preview"><div className="preview-caption"><span>{t.sample}</span><span className="preview-caption-dot" /></div><div className="preview-message"><div className="preview-label"><span className="preview-avatar">C</span>{t.previewInbox}</div><p className="message-customer">{t.previewMessage}</p><p className="message-reply">{t.previewReply}</p></div><div className="preview-order"><div><span className="preview-label">{t.previewOrder}</span><strong>{t.previewItem}</strong><small>{t.previewQty}</small></div><span className="preview-square" aria-hidden="true">▧</span></div><div className="preview-payment"><span className="preview-label">{t.previewPayment}</span><strong>{t.previewMatch}</strong><small>{t.previewDetail}</small><span className="verified-pill"><i aria-hidden="true" />{t.previewVerified}</span></div></div></div></div></section>

      <section className="payment-section section-shell"><div className="section-head"><span className="section-index">{t.section03}</span><span className="section-rule" /></div><div className="payment-grid"><div><h2>{t.paymentTitle}</h2><p className="section-lead">{t.paymentText}</p><p className="payment-emphasis">{t.paymentNoId}</p></div><div className="payment-visual" aria-label={t.paymentResult}><div className="payment-checks">{t.paymentDiagram.map((label, index) => <div className="payment-check" key={label}><span>0{index + 1}</span><strong>{label}</strong><span aria-hidden="true">✓</span></div>)}</div><div className="payment-result"><span className="result-icon" aria-hidden="true">✓</span><strong>{t.paymentResult}</strong></div></div></div></section>

      <section className="principles-section section-shell" id="principles"><div className="section-head"><span className="section-index">{t.section04}</span><span className="section-rule" /></div><h2>{t.principlesTitle}</h2><div className="principles-list">{t.principles.map(([title, desc], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{desc}</p></article>)}</div></section>

      <section className="final-cta"><div className="cta-atmosphere" aria-hidden="true" /><div className="section-shell cta-inner"><p className="eyebrow">{t.ctaEyebrow}</p><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p><Link className="button-primary button-light" href={`/${locale}/register`}>{t.ctaButton}<span aria-hidden="true">↗</span></Link><small>{t.ctaSmall}</small></div></section>
    </main>
  </>;
}
