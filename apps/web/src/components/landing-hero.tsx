import Link from "next/link";

const copy = {
  en: {
    eyebrow: "BUILT FOR THE WAY COMMERCE ACTUALLY MOVES",
    first: "Messages become",
    second: "orders.",
    third: "Orders move",
    accent: "forward.",
    lead: "From a first customer question to an automatically matched payment, keep the whole story connected. Use the AI communication service, commerce operations, or both.",
    primary: "Explore both services",
    secondary: "See the workflow",
    note: "Two independent services. Connected when you need them.",
    sample: "PRODUCT CONCEPT / ILLUSTRATIVE DATA",
    preview: "Illustrative AI conversation, order and payment workflow — not a live product demonstration.",
    desk: "The Ekmivo workspace",
    deskStatus: "Proposed experience",
    stream: "ONE CONNECTED CUSTOMER JOURNEY",
    message: "01 / INBOX",
    customer: "Customer",
    question: "Hi! Is the charcoal notebook available?",
    response: "Yes. Would you like to order one?",
    generated: "Knowledge-guided response · example",
    order: "02 / COMMERCE",
    orderTitle: "Order created",
    item: "Charcoal notebook",
    orderDetail: "Quantity: 1 · price from catalog",
    payment: "03 / PAYMENT",
    paymentTitle: "Payment evidence matched",
    paymentDetails: "Sender · time · amount · receiving account",
    verified: "Automatically verified",
    services: "AI COMMUNICATION",
    commerce: "COMMERCE + PAYMENTS",
    together: "One flow, no lost context",
    footerLeft: "FROM FIRST MESSAGE",
    footerRight: "TO VERIFIED PAYMENT",
  },
  bn: {
    eyebrow: "ব্যবসার আসল কাজের ধারাকে কেন্দ্র করে",
    first: "মেসেজ থেকে",
    second: "অর্ডার।",
    third: "অর্ডার থেকে",
    accent: "পরের ধাপ।",
    lead: "কাস্টমারের প্রথম প্রশ্ন থেকে স্বয়ংক্রিয় পেমেন্ট যাচাই পর্যন্ত পুরো কাজের তথ্য একসঙ্গে থাকবে। AI যোগাযোগ, কমার্স পরিচালনা অথবা দুটো সেবাই ব্যবহার করুন।",
    primary: "দুটি সেবা দেখুন",
    secondary: "কাজের ধারা দেখুন",
    note: "দুটি আলাদা সেবা। প্রয়োজন হলে একই ধারায় যুক্ত।",
    sample: "প্রোডাক্টের নমুনা / বাস্তব তথ্য নয়",
    preview: "AI কথোপকথন, অর্ডার ও পেমেন্টের কাল্পনিক উদাহরণ — চালু থাকা প্রোডাক্টের ডেমো নয়।",
    desk: "Ekmivo ওয়ার্কস্পেস",
    deskStatus: "পরিকল্পিত অভিজ্ঞতা",
    stream: "একই ধারায় কাস্টমারের প্রতিটি ধাপ",
    message: "০১ / ইনবক্স",
    customer: "কাস্টমার",
    question: "চারকোল নোটবুকটা কি পাওয়া যাবে?",
    response: "হ্যাঁ, পাওয়া যাবে। একটি অর্ডার করবেন?",
    generated: "তথ্যভিত্তিক উত্তর · নমুনা",
    order: "০২ / কমার্স",
    orderTitle: "অর্ডার তৈরি",
    item: "চারকোল নোটবুক",
    orderDetail: "পরিমাণ: ১টি · পণ্যতালিকার দাম",
    payment: "০৩ / পেমেন্ট",
    paymentTitle: "পেমেন্টের তথ্য মিলেছে",
    paymentDetails: "প্রেরক · সময় · পরিমাণ · গ্রহণকারী অ্যাকাউন্ট",
    verified: "স্বয়ংক্রিয়ভাবে যাচাইকৃত",
    services: "AI যোগাযোগ",
    commerce: "কমার্স + পেমেন্ট",
    together: "এক ধারায়, তথ্য হারাবে না",
    footerLeft: "প্রথম মেসেজ থেকে",
    footerRight: "যাচাইকৃত পেমেন্ট পর্যন্ত",
  },
} as const;

export function LandingHero({ locale }: { locale: "bn" | "en" }) {
  const t = copy[locale];
  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="landing-hero-inner">
        <div className="landing-intro">
          <p className="landing-kicker"><span aria-hidden="true" />{t.eyebrow}</p>
          <h1 id="hero-title">
            <span>{t.first}</span>
            <span>{t.second}</span>
            <span>{t.third}</span>
            <em>{t.accent}</em>
          </h1>
          <p className="landing-lead">{t.lead}</p>
          <div className="landing-actions">
            <Link className="button-primary landing-primary" href={`/${locale}#services`}>{t.primary}<span aria-hidden="true">↗</span></Link>
            <Link className="button-text landing-secondary" href={`/${locale}#workflow`}>{t.secondary}<span aria-hidden="true">→</span></Link>
          </div>
          <div className="landing-independence">
            <span className="landing-independence-mark" aria-hidden="true"><i /><i /></span>
            <p>{t.note}</p>
          </div>
        </div>

        <div className="landing-stage" aria-label={t.preview}>
          <div className="landing-stage-top"><span className="stage-folio">EK / 001</span><span>{t.sample}</span></div>
          <div className="signal-window">
            <div className="signal-window-top">
              <div className="signal-window-identity"><span className="signal-monogram" aria-hidden="true">e<span>.</span></span><span>{t.desk}</span></div>
              <span className="signal-workspace-status"><i aria-hidden="true" />{t.deskStatus}</span>
            </div>
            <div className="signal-window-body">
              <p className="signal-stream-label">{t.stream}</p>
              <div className="signal-timeline">
                <article className="signal-event signal-chat">
                  <div className="signal-step"><span className="signal-step-dot" />{t.message}</div>
                  <div className="signal-chat-body">
                    <p className="signal-chat-person"><span aria-hidden="true">C</span>{t.customer}</p>
                    <p className="signal-customer-message">{t.question}</p>
                    <p className="signal-assistant-message">{t.response}</p>
                    <small>{t.generated}</small>
                  </div>
                </article>
                <article className="signal-event signal-order">
                  <div className="signal-step"><span className="signal-step-dot" />{t.order}</div>
                  <div className="signal-record">
                    <span className="signal-record-icon" aria-hidden="true">▤</span>
                    <div><strong>{t.orderTitle}</strong><p>{t.item}</p><small>{t.orderDetail}</small></div>
                    <span className="signal-record-arrow" aria-hidden="true">↗</span>
                  </div>
                </article>
                <article className="signal-event signal-payment">
                  <div className="signal-step"><span className="signal-step-dot" />{t.payment}</div>
                  <div className="signal-record signal-payment-record">
                    <span className="signal-check" aria-hidden="true">✓</span>
                    <div><strong>{t.paymentTitle}</strong><small>{t.paymentDetails}</small></div>
                    <span className="signal-verified">{t.verified}</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
          <div className="landing-stage-bottom">
            <span>{t.services}</span><span className="stage-connector" aria-hidden="true">↔</span><span>{t.commerce}</span>
          </div>
        </div>
      </div>
      <div className="landing-stripe" aria-hidden="true"><span>{t.footerLeft}</span><span className="landing-stripe-line" /><span>{t.footerRight}</span></div>
    </section>
  );
}
