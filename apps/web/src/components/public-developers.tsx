import Link from "next/link";

export function PublicDevelopers({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn",t=(en:string,bangla:string)=>bn?bangla:en;
 const cards=[
  {icon:"🔑",title:t("Personal API keys","নিজের API keys"),body:t("Create a test key in your workspace; it automatically selects your Sandbox.","নিজের Workspace থেকে test key নিন, Sandbox স্বয়ংক্রিয়ভাবে নির্ধারিত হবে।"),color:"lilac",anchor:"authentication"},
  {icon:"🛍️",title:t("One payment endpoint","একটি Payment endpoint"),body:t("No workspace ID and no environment query in your request URL.","Request URL-এ workspace ID বা environment query লাগবে না।"),color:"apricot",anchor:"create-checkout"},
  {icon:"💌",title:t("Verified updates","যাচাই করা আপডেট"),body:t("Read payment status or safely receive signed webhook events.","API দিয়ে status দেখুন অথবা signed webhook-এর আপডেট নিন।"),color:"seaglass",anchor:"webhooks"},
  {icon:"🧪",title:t("Practice first","আগে পরীক্ষা করুন"),body:t("Use the separate Sandbox database, without sending real money.","আলাদা Sandbox database-এ আসল টাকা ছাড়াই পরীক্ষা করুন।"),color:"blueberry",anchor:"sandbox"}
 ];
 return <main className="ek-dev-public ek-dev-cozy">
  <div className="ek-dev-mini-header">
   <div><span className="ek-doc-kicker">✳ EKMiVO · DEVELOPERS</span><h1>{t("Payments, made simple to build.","পেমেন্ট ইন্টিগ্রেশন, এবার সহজ।")}</h1><p>{t("Easy examples, cheerful docs and a checkout you can trust. No complicated workspace URLs.","সহজ উদাহরণ, সুন্দর ডকুমেন্টেশন আর নির্ভরযোগ্য checkout। জটিল workspace URL-এর দরকার নেই।")}</p></div>
   <Link className="ek-dev-primary" href={"/"+locale+"/docs/payments"}>{t("Read the docs","API Docs খুলুন")} ↗</Link>
  </div>
  <div className="ek-dev-friendly-grid">{cards.map(card=><Link href={"/"+locale+"/docs/payments#"+card.anchor} className={"ek-dev-friendly-card "+card.color} key={card.title}><span aria-hidden="true">{card.icon}</span><strong>{card.title}</strong><small>{card.body}</small><span className="ek-dev-card-arrow" aria-hidden="true">↗</span></Link>)}</div>
  <section className="ek-dev-howto">
   <div className="ek-dev-howto-heading"><span className="ek-doc-kicker">{t("QUICK START","দ্রুত শুরু")}</span><h2>{t("Just three little steps.","মাত্র তিনটি ধাপ।")}</h2></div>
   <div className="ek-dev-howto-list">
    <article><span>01</span><div><h3>{t("Get your Sandbox key","Sandbox key নিন")}</h3><p>{t("Sign in → Payment workspace → API Keys. Enable payments:write and payments:read.","লগইন → Payment workspace → API Keys। payments:write ও payments:read permission দিন।")}</p></div></article>
    <article><span>02</span><div><h3>{t("Create a payment","Payment তৈরি করুন")}</h3><p>{t("POST /v1/payment-intents with Bearer key and an idempotency key. The backend resolves the workspace for you.","Bearer API key ও idempotency key দিয়ে POST /v1/payment-intents পাঠান। Backend নিজেই workspace শনাক্ত করবে।")}</p></div></article>
    <article><span>03</span><div><h3>{t("Show checkout and verify","Checkout ও Verification")}</h3><p>{t("Open the checkout URL, then trust only server-verified state or signed webhook events.","Checkout URL খুলুন। শুধু server-verified status অথবা signed webhook দেখে পেমেন্ট নিশ্চিত করুন।")}</p></div></article>
   </div>
  </section>
  <section className="ek-dev-custom-box"><span aria-hidden="true">🌈</span><div><span className="ek-doc-kicker">{t("MORE FLEXIBILITY","আরও স্বাধীনতা")}</span><h2>{t("Want your own checkout design?","নিজের Checkout UI রাখতে চান?")}</h2><p>{t("Explore Custom Payment Verification: automatic (no TrxID) or TrxID-assisted. Your UI stays yours; Ekmivo verifies trusted receipt evidence.","Custom Payment Verification দেখুন—TrxID ছাড়াই Automatic, অথবা TrxID-assisted। UI আপনার, বিশ্বস্ত receipt যাচাই Ekmivo-র।")}</p><Link href={"/"+locale+"/docs/payments#custom-verification"}>{t("Explore both options","দুইটি পদ্ধতি দেখুন")} →</Link></div></section>
  <section className="ek-dev-bottom-links"><Link href="/workspaces">{t("Manage API keys","API keys পরিচালনা")} →</Link><Link href={"/"+locale+"/docs/payments#sandbox"}>{t("Try Sandbox","Sandbox পরীক্ষা করুন")} →</Link><a href="/api/payment-contract" download="ekmivo-openapi.json">OpenAPI ↓</a></section>
 </main>;
}