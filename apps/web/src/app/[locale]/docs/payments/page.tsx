import Link from "next/link";
import {notFound} from "next/navigation";
import {DocsNavigation} from "../../../../components/docs-navigation";
import {PaymentDocExamples} from "../../../../components/payment-doc-examples";
import {PaymentAPIReference} from "../../../../components/payment-api-reference";

export default async function PaymentGuide({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en" && locale!=="bn")notFound();
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const fields=[
  ["merchant_reference","string",true,t("Your unique order reference (1–128 characters).","আপনার অর্ডারের নিজস্ব reference (১–১২৮ অক্ষর)।")],
  ["amount_minor","integer",false,t("Required for standalone payment. 12500 paisa = ৳125; linked orders/invoices calculate amounts on the server.","সাধারণ পেমেন্টে আবশ্যক: ১২৫০০ পয়সা = ১২৫ টাকা। Linked order/invoice-এর টাকা সার্ভার হিসাব করবে।")],
  ["currency","string",true,"BDT"],
  ["expires_in_minutes","integer",true,t("Validity window; 5–60 minutes.","মেয়াদ; ৫–৬০ মিনিট।")],
  ["order_id","UUID",false,t("Optional linked order; server calculates its due amount.","ঐচ্ছিক অর্ডার; সার্ভার বকেয়া হিসাব করে।")],
  ["invoice_id","UUID",false,t("Optional linked invoice; not used with order_id.","ঐচ্ছিক ইনভয়েস; order_id-এর সঙ্গে নয়।")]
 ] as const;
 const topics=[
  ["🔑",t("Your own test key","নিজের টেস্ট কী"),t("Create in dashboard","ড্যাশবোর্ড থেকে তৈরি"),"#authentication","blue"],
  ["💳",t("Create a payment","পেমেন্ট তৈরি"),t("One simple endpoint","একটি সহজ endpoint"),"#create-checkout","yellow"],
  ["🧾",t("Checkout & verify","চেকআউট ও যাচাই"),t("Know the real status","আসল অবস্থা জানুন"),"#read-status","peach"],
  ["🧪",t("Try sandbox","স্যান্ডবক্সে পরীক্ষা"),t("No real money involved","আসল টাকা লাগে না"),"#sandbox","mint"]
 ] as const;
 return <main className="ek-payment-docs ek-docs-cute">
  <header className="ek-doc-pagehead">
   <div className="ek-doc-heading-line"><span className="ek-doc-pip">✦</span><span>EKMIVO / DEVELOPERS</span><span className="ek-doc-pill">API v1</span></div>
   <h1>{t("Payment APIs, made friendly.","সহজ করে পেমেন্ট API শিখুন।")}</h1>
   <p>{t("Everything you need to create a checkout, test safely and confirm a payment — one step at a time.","চেকআউট তৈরি, নিরাপদে পরীক্ষা আর পেমেন্ট যাচাই—সবকিছু সহজ কয়েকটি ধাপে।")}</p>
  </header>
  <DocsNavigation locale={locale}/>
  <div className="ek-doc-content">
   <section id="overview" className="ek-doc-intro">
    <div className="ek-doc-topic-grid">{topics.map(([icon,title,desc,href,color])=><a className={"ek-doc-topic ek-doc-tone-"+color} key={href} href={href}><span className="ek-doc-topic-icon" aria-hidden="true">{icon}</span><strong>{title}</strong><small>{desc}</small><span aria-hidden="true" className="ek-doc-topic-arrow">↗</span></a>)}</div>
    <div className="ek-doc-smallflow" aria-label={t("Integration steps","সংযোগের ধাপ")}>
     <span>🔑 {t("Get key","কী নিন")}</span><b aria-hidden="true">→</b><span>💳 {t("Create","তৈরি")}</span><b aria-hidden="true">→</b><span>↗ {t("Checkout","চেকআউট")}</span><b aria-hidden="true">→</b><span>✅ {t("Verify","যাচাই")}</span>
    </div>
   </section>
   <section id="authentication" className="ds-panel">
    <div className="ek-doc-section-label">01 · {t("GET STARTED","শুরু করুন")}</div><h2>🔐 {t("One key. Your workspace.","একটি কী, আপনার Workspace।")}</h2>
    <p>{t("Sign in, choose your payment workspace, then open Payments → API Keys. An owner or admin can create a Sandbox key with payments:write and payments:read scopes. Copy it once and keep it on your backend.","লগইন করে পেমেন্ট Workspace-এর Payments → API Keys খুলুন। Owner বা Admin payments:write ও payments:read অনুমতিসহ Sandbox key তৈরি করতে পারবেন। Secret একবার কপি করে নিজের backend-এ রাখুন।")}</p>
    <div className="ek-doc-context-pair"><div><small>{t("API base URL — Sandbox","API Base URL — Sandbox")}</small><code>EKMIVO_API_ORIGIN</code></div><div><small>{t("API base URL — Live","API Base URL — Live")}</small><code>EKMIVO_API_ORIGIN</code></div></div>
    <p>{t("Both environments use the configured API origin; the key selects the correct workspace and financial database. No workspace ID or environment query is required.","দুটো environment-ই কনফিগার করা API origin ব্যবহার করে। API key দেখে backend সঠিক Workspace ও database বেছে নেয়। URL-এ Workspace ID বা environment query লাগে না।")}</p>
    <Link className="ek-doc-action-link" href={"/"+locale+"/workspaces"}>🔑 {t("Sign in & create Sandbox API key","লগইন করে Sandbox API key তৈরি করুন")} ↗</Link>
    <p className="ek-doc-footnote">{t("Live key creation and live payment acceptance are distinct: a live payment request requires an active paid/grace subscription. Never put merchant secrets in browser code.","Live key তৈরি এবং live payment নেওয়া এক বিষয় নয়: Live request-এর জন্য সক্রিয় subscription/grace প্রয়োজন। Browser code-এ API secret রাখবেন না।")}</p>
   </section>
   <section id="create-checkout" className="ds-panel">
    <div className="ek-doc-section-label">02 · {t("PAYMENT API","পেমেন্ট API")}</div><h2>💳 {t("Create a payment","পেমেন্ট তৈরি করুন")}</h2>
    <p>{t("Send your order details from the server; the backend creates a payment intent and returns a checkout token.","সার্ভার থেকে অর্ডারের তথ্য পাঠান; backend একটি payment intent ও checkout token ফেরত দেয়।")}</p>
    <div className="ek-doc-endpoint"><b>POST</b><code>/v1/payment-intents</code><span>payments:write</span></div>
    <div className="ek-doc-editor-wrap"><PaymentDocExamples locale={locale}/></div>
    <p className="ek-doc-footnote">{t("Run shows an illustrative local response, not a real network call. To execute a real Sandbox API request, use your own scoped key on your backend.","Run বাটনে শুধু local নমুনা response দেখায়—আসল API call করে না। বাস্তব Sandbox API পরীক্ষা করতে নিজের scoped key দিয়ে backend থেকে request পাঠান।")}</p>
   </section>
   <section id="request-fields" className="ds-panel">
    <div className="ek-doc-section-label">03 · {t("INPUT & OUTPUT","ইনপুট ও আউটপুট")}</div><h2>🧩 {t("What should you send?","কী কী তথ্য পাঠাবেন?")}</h2>
    <div className="ek-docs-table"><table><thead><tr><th>{t("Field","ফিল্ড")}</th><th>{t("Type","ধরন")}</th><th>{t("Required?","বাধ্যতামূলক?")}</th><th>{t("Details","বিবরণ")}</th></tr></thead><tbody>{fields.map(([name,kind,required,detail])=><tr key={name}><td><code>{name}</code></td><td>{kind}</td><td><span className={required?"ek-doc-required":"ek-doc-optional"}>{required?t("Required","অবশ্যই"):t("Optional","ঐচ্ছিক")}</span></td><td>{detail}</td></tr>)}</tbody></table></div>
    <div className="ek-doc-mini-note"><strong>↗ {t("Create response","Create Response")}</strong><p>HTTP 201 · {t("An intent ID, status, checkout_token and checkout_url. The token builds your public checkout URL.","Intent ID, status ও সরাসরি checkout_url পাবেন।")}</p></div>
   </section>
   <section id="read-status" className="ds-panel">
    <div className="ek-doc-section-label">04 · {t("CHECKOUT & VERIFY","চেকআউট ও যাচাই")}</div><h2>✅ {t("Open checkout. Then verify.","চেকআউট খুলুন, এরপর যাচাই করুন।")}</h2>
    <div className="ek-doc-smallflow"><span>POST /payment-intents</span><b>→</b><span>checkout_url</span><b>→</b><span>{t("Customer checkout","কাস্টমারের চেকআউট")}</span><b>→</b><span>{t("Server status","সার্ভারের status")}</span></div>
    <p>{t("Open the returned checkout_url directly in the customer's browser. A browser redirect is not proof of payment.","Response-এর checkout_url সরাসরি কাস্টমারের ব্রাউজারে খুলুন। Browser redirect মানেই পেমেন্ট সম্পন্ন নয়।")}</p>
    <div className="ek-doc-endpoint"><b className="ek-doc-get">GET</b><code>/v1/payment-intents/{'{intentID}'}</code><span>payments:read</span></div>
    <p>{t("Query from your backend and inspect the authoritative payment state. Match reference, currency and amount before fulfilling an order; signed payment.verified webhook is the asynchronous notification.","নিজের backend থেকে সত্যিকারের পেমেন্টের অবস্থা জানুন। অর্ডার সম্পন্ন করার আগে reference, currency, amount মিলিয়ে নিন। Signed payment.verified webhook-এ asynchronous update পাবেন।")}</p>
   </section>
   <section id="payment-status" className="ds-panel">
    <h2>🛡️ {t("What does verification mean?","যাচাই বলতে কী বোঝায়?")}</h2>
    <p>{t("An authentic authorized receipt must pass backend matching before a payment becomes verified. No customer-entered TrxID, screenshot or routine manual approval is required. Missing/ambiguous evidence remains unresolved.","অনুমোদিত উৎসের রসিদ backend-এ যাচাই হওয়ার পরই payment verified হয়। Customer-এর TrxID, screenshot বা নিয়মিত manual approval লাগে না। অসম্পূর্ণ বা দ্বিধাযুক্ত তথ্য pending থাকে।")}</p>
   </section>
   <section id="webhooks" className="ds-panel">
    <h2>🔔 {t("Get updates with webhooks","Webhook দিয়ে আপডেট নিন")}</h2>
    <p>{t("Configure an HTTPS endpoint in Payments → Webhooks. Verify HMAC-SHA256 over the untouched raw request body and timestamp. Deduplicate event IDs and fulfil only confirmed payments.","Payments → Webhooks-এ HTTPS endpoint দিন। Raw body ও timestamp-এর HMAC-SHA256 signature যাচাই করুন। একই Event ID দুইবার process করবেন না; শুধু verified payment-এ fulfilment করুন।")}</p>
    <div className="ek-doc-mini-note"><strong>{t("Signature recipe","Signature তৈরি/যাচাই")}</strong><code>v1=HMAC_SHA256(secret, timestamp + "." + raw_body)</code></div>
   </section>
   <section id="sandbox" className="ds-panel">
    <h2>🧪 {t("Test as much as you need","ইচ্ছেমতো Sandbox-এ পরীক্ষা করুন")}</h2>
    <p>{t("Each merchant uses their own dashboard-issued ek_test_ key. Test transactions stay in the separate Sandbox financial database; no bKash, Nagad or Rocket money moves. The API endpoint stays exactly the same.","প্রত্যেক merchant ড্যাশবোর্ড থেকে নিজের ek_test_ key নেবেন। টেস্টের transaction আলাদা Sandbox financial database-এ থাকবে; আসল bKash, Nagad বা Rocket-এর টাকা আসবে না। API endpoint একই থাকবে।")}</p>
    <div className="ek-doc-sandbox-steps"><div>① {t("Create Sandbox key","Sandbox key তৈরি")}</div><div>② {t("POST create intent","POST করে intent তৈরি")}</div><div>③ {t("Open test checkout","টেস্ট চেকআউট খুলুন")}</div><div>④ {t("Simulate receipt in authorized Sandbox tools","Sandbox tools-এ কৃত্রিম রসিদ চালান")}</div><div>⑤ {t("Verify status & webhook","Status ও webhook দেখুন")}</div></div>
    <p className="ek-doc-footnote">{t("The real checkout success/cancel/expiry simulator must be confirmed end-to-end before claiming readiness. The Run button above is deliberately an illustrative response preview.","আসল checkout-এর success/cancel/expiry simulation end-to-end verify না হওয়া পর্যন্ত ready বলা হবে না। উপরের Run শুধু response preview।")}</p>
   </section>
   <section id="refunds" className="ds-panel">
    <h2>↩️ {t("Refund requests aren't automatic payouts","Refund request মানেই টাকা ফেরত নয়")}</h2>
    <p>{t("If a late receipt requires a refund, Ekmivo creates a request with payer details for the seller. The seller returns funds outside Ekmivo; a requested/cancelled refund does not prove any money was returned.","দেরিতে আসা রসিদে refund দরকার হলে Ekmivo seller-এর জন্য যোগাযোগের তথ্যসহ request তৈরি করে। Seller Ekmivo-এর বাইরে টাকা ফেরত দেন। Requested বা Cancelled refund মানেই টাকা ফেরত গেছে—এমন নয়।")}</p>
   </section>
   <section id="errors" className="ds-panel">
    <h2>🧰 {t("Common API responses","সাধারণ API response")}</h2>
    <div className="ek-docs-table"><table><thead><tr><th>HTTP</th><th>{t("What it means","কী বোঝায়")}</th></tr></thead><tbody>{[["201",t("Payment intent created","Payment intent তৈরি")],["200",t("Status request completed; NOT proof of paid","Status query সফল; পেমেন্ট successful বোঝায় না")],["400",t("Invalid scope/query","ভুল query বা scope")],["401",t("Invalid or expired API key","ভুল বা মেয়াদোত্তীর্ণ API key")],["403",t("Missing scope / live subscription","অনুমতি বা Live subscription নেই")],["404",t("Payment ID not found for this key","এই key-এর payment ID পাওয়া যায়নি")],["409",t("Duplicate/conflicting idempotency key","Idempotency key conflict")],["422",t("Invalid input / missing idempotency key","ভুল ইনপুট বা idempotency key নেই")],["429",t("Rate limit; check Retry-After","Rate limit; Retry-After দেখুন")],["503",t("Service unavailable; retry safely","Service unavailable; নিরাপদে retry করুন")]].map(([status,why])=><tr key={status}><td><code>{status}</code></td><td>{why}</td></tr>)}</tbody></table></div>
   </section>
   <section id="api-reference" className="ds-panel"><PaymentAPIReference locale={locale}/></section>
   <footer className="ek-doc-footer"><span>✦ Ekmivo Developers</span><Link href={"/"+locale+"/workspaces"}>{t("Manage API Keys","API Keys পরিচালনা")} ↗</Link><a href="/api/payment-contract">{t("OpenAPI contract","OpenAPI contract")} ↗</a></footer>
  </div>
 </main>;
}
