import Link from "next/link";
import {notFound} from "next/navigation";
import {PaymentAPIReference} from "../../../../components/payment-api-reference";
import {PaymentDocExamples} from "../../../../components/payment-doc-examples";
import {PaymentEndpointSamples} from "../../../../components/payment-endpoint-samples";
import {DocsNavigation} from "../../../../components/docs-navigation";

export default async function PaymentGuide({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 const bn=locale==="bn",t=(en:string,বাংলা:string)=>bn?বাংলা:en;
 const fields=[
  ["merchant_reference","string","Yes",t("Your unique order reference, 1–128 characters","নিজস্ব order reference, ১–১২৮ অক্ষর")],
  ["amount_minor","integer","Yes*",t("BDT in paisa: 12500 means ৳125","পয়সায় হিসাব: ১২৫০০ মানে ১২৫ টাকা")],
  ["currency","string","Yes","BDT"],
  ["expires_in_minutes","integer","Yes",t("5–60 minutes","৫–৬০ মিনিট")],
  ["order_id","UUID","No",t("Linked order; omit amount_minor or use zero","লিংক করা order; amount_minor শূন্য রাখুন")],
  ["invoice_id","UUID","No",t("Linked invoice; mutually exclusive with order_id","লিংক করা invoice; order_id একসঙ্গে নয়")]
 ];
 return <main className="ek-payment-docs ek-cute-docs">
  <div className="ek-doc-topline">
   <div><span className="ek-doc-kicker">✳ EKMiVO / DEVELOPERS</span><h1>{t("A little easier to build payments.","পেমেন্ট ইন্টিগ্রেশন এখন আরও সহজ।")}</h1>
   <p>{t("Small steps, working examples and clear responses. One API key identifies your workspace and Sandbox or Live automatically.","সহজ ধাপ, কোডের উদাহরণ আর পরিষ্কার response। API key থেকেই workspace ও Sandbox/Live নির্ধারিত হবে।")}</p></div>
   <div className="ek-doc-top-actions"><Link href="/workspaces">{t("My API keys","আমার API keys")} ↗</Link><a href="/api/payment-contract" download="ekmivo-openapi.json">OpenAPI ↓</a></div>
  </div>
  <DocsNavigation locale={locale}/>
  <div className="ek-doc-content">
   <section id="overview" className="ek-doc-intro">
    <div className="ek-doc-color-grid">
     <a href="#authentication" className="ek-cute-tile lavender"><span className="ek-cute-icon">🔑</span><strong>{t("Get a key","API key নিন")}</strong><small>{t("Your workspace. Your environment.","নিজের workspace, নিজের environment")}</small></a>
     <a href="#create-checkout" className="ek-cute-tile peach"><span className="ek-cute-icon">🛍️</span><strong>{t("Create payment","পেমেন্ট তৈরি")}</strong><small>POST /v1/payment-intents</small></a>
     <a href="#checkout-flow" className="ek-cute-tile mint"><span className="ek-cute-icon">✨</span><strong>{t("Open checkout","চেকআউট খুলুন")}</strong><small>{t("Get a URL, then redirect","URL নিন, গ্রাহককে পাঠান")}</small></a>
     <a href="#payment-status" className="ek-cute-tile sky"><span className="ek-cute-icon">💌</span><strong>{t("Verify safely","নিরাপদ যাচাই")}</strong><small>{t("Automatic and server-authoritative","স্বয়ংক্রিয় ও নির্ভরযোগ্য")}</small></a>
    </div>
   </section>
   <section id="authentication" className="ds-panel">
    <span className="ek-doc-step">01 · {t("BEFORE YOU START","শুরু করার আগে")}</span><h2>🔐 {t("One key. Your workspace.","একটি key, আপনার workspace।")}</h2>
    <p>{t("Sign in → Payment workspace → API Keys → Create Sandbox key. Select payments:write and payments:read. Store the secret on your own backend, never inside a browser, public bot or mobile application.","লগইন → Payment workspace → API Keys → Sandbox key তৈরি করুন। payments:write ও payments:read permission দিন। Secret শুধু নিজের backend-এ রাখুন, ব্রাউজার বা অ্যাপে নয়।")}</p>
    <div className="ek-doc-note"><strong>🧪 Sandbox</strong><span>{t("Test credentials work with the isolated test database. No real money moves. A Live key requires an eligible active payment plan.","Sandbox key আলাদা পরীক্ষামূলক database-এ কাজ করে, আসল টাকা লাগে না। Live key পেতে উপযুক্ত সক্রিয় payment plan প্রয়োজন।")}</span></div>
    <p><code>Authorization: Bearer ek_test_…</code> {t("or","অথবা")} <code>ek_live_…</code></p>
    <p>{t("The public API URL has no workspace ID and no environment query. The key's immutable binding decides both.","Public API URL-এ workspace ID বা environment query থাকবে না। Key-এর binding থেকেই দুটো নির্ধারিত হয়।")}</p>
   </section>
   <section id="create-checkout" className="ds-panel">
    <span className="ek-doc-step">02 · {t("CREATE PAYMENT","পেমেন্ট তৈরি")}</span><h2>🧾 {t("Create your first payment","প্রথম পেমেন্ট তৈরি করুন")}</h2>
    <div className="ek-endpoint"><span className="ek-http-method">POST</span><code>/v1/payment-intents</code><span>{t("API key required","API key লাগবে")}</span></div>
    <p>{t("Send a JSON request from your server. Include a stable Idempotency-Key header so retries never create a second payment.","নিজের সার্ভার থেকে JSON পাঠান। একই request retry করলে একই Idempotency-Key ব্যবহার করুন, যেন দ্বিতীয় পেমেন্ট না তৈরি হয়।")}</p>
    <h3 id="request-fields">{t("Request fields","Request-এর তথ্য")}</h3>
    <div className="ek-docs-table"><table><thead><tr><th>Field</th><th>Type</th><th>{t("Required","প্রয়োজন")}</th><th>{t("Details","বিবরণ")}</th></tr></thead><tbody>{fields.map(([field,type,needed,description])=><tr key={field}><td><code>{field}</code></td><td>{type}</td><td>{needed==="Yes"||needed==="Yes*"?(bn?"হ্যাঁ":"Yes"):(bn?"না":"No")}</td><td>{description}</td></tr>)}</tbody></table></div>
    <p className="ek-doc-footnote">{t("* Amount is required for standalone payments. Linked order/invoice amounts are server-calculated. Do not supply both order_id and invoice_id.","* সাধারণ payment-এ amount লাগবে। Linked order/invoice-এ সার্ভার amount নির্ধারণ করে। order_id ও invoice_id একসঙ্গে দেওয়া যাবে না।")}</p>
    <h3>{t("Possible responses","সম্ভাব্য response")}</h3>
    <div className="ek-http-outcomes"><span>201 · {t("Created","তৈরি হয়েছে")}</span><span>401 · {t("Invalid key","ভুল key")}</span><span>403 · {t("Plan / scope","Plan / অনুমতি")}</span><span>409 · {t("Conflict","Conflict")}</span><span>422 · {t("Invalid request","ভুল request")}</span><span>429 · {t("Rate limit","Rate limit")}</span><span>503 · {t("Unavailable","সেবা বন্ধ")}</span></div>
    <p>{t("Use the VS Code-style examples and Run simulation panel on the right (below this guide on mobile). The preview never sends money or executes your supplied code.","পাশের VS Code-style code ও Run simulation দেখুন (মোবাইলে নিচে)। Preview আসল টাকা পাঠায় না বা কোড execute করে না।")}</p>
   </section>
   <section id="checkout-flow" className="ds-panel">
    <span className="ek-doc-step">03 · {t("HOSTED CHECKOUT","হোস্টেড চেকআউট")}</span><h2>🛒 {t("Open the returned checkout URL","পাওয়া Checkout URL খুলুন")}</h2>
    <p>{t("A successful create returns an intent ID, checkout_token and (when the public web origin is configured) checkout_url. Open that URL for the customer. For compatibility, /en/checkout/{token} and /bn/checkout/{token} remain available.","সফল Create response-এ intent ID, checkout_token এবং public web origin configured থাকলে checkout_url আসবে। Customer-কে সেই URL-এ পাঠান। /en/checkout/{token} ও /bn/checkout/{token} আগের মতো থাকবে।")}</p>
    <div className="ek-doc-flow"><span>📩 {t("Create","Create")}</span><b>→</b><span>🛍️ {t("Checkout","Checkout")}</span><b>→</b><span>📱 {t("SMS receipt","SMS receipt")}</span><b>→</b><span>✅ {t("Verify","Verify")}</span></div>
    <p>{t("Sandbox can simulate success/pending/expired/cancelled states; the payment source is simulated, not real bKash/Nagad/Rocket money.","Sandbox-এ success/pending/expired/cancelled পরীক্ষা করা যায়; কোনো আসল bKash/Nagad/Rocket টাকা পাঠানো হয় না।")}</p>
   </section>
   <section id="payment-status" className="ds-panel">
    <span className="ek-doc-step">04 · {t("CHECK STATUS","অবস্থা যাচাই")}</span><h2>🛡️ {t("Trust verified server state","শুধু সার্ভারের যাচাইকৃত অবস্থাকে বিশ্বাস করুন")}</h2>
    <div className="ek-endpoint"><span className="ek-http-method get">GET</span><code>/v1/payment-intents/{'{intentID}'}</code><span>payments:read</span></div>
    <p>{t("Use your own backend and a read-scoped API key. Match intent, amount and reference before granting an order. HTTP 200 confirms a successful lookup, not successful payment.","Read-scoped API key দিয়ে নিজের backend থেকে status দেখুন। Order deliver করার আগে intent, amount ও reference মিলান। HTTP 200 মানে query সফল—টাকা পাওয়া নয়।")}</p>
    <p>{t("Automatic receipt matching uses provider, full payer number, amount and original transaction time. Customers do not enter a TrxID in this hosted flow.","স্বয়ংক্রিয় matching-এ provider, পূর্ণ payer number, amount ও original transaction time লাগে। Hosted flow-তে কাস্টমার TrxID লিখবেন না।")}</p>
    <PaymentEndpointSamples kind="status" locale={locale}/>
   </section>
   <section id="webhooks" className="ds-panel">
    <span className="ek-doc-step">05 · {t("EVENTS","ইভেন্ট")}</span><h2>🔔 {t("Get signed payment updates","স্বাক্ষরযুক্ত পেমেন্ট আপডেট নিন")}</h2>
    <p>{t("Configure Webhooks in your workspace. Verify the HMAC on the original raw body, reject old timestamps, deduplicate event IDs, then query current payment state before fulfilment.","Workspace থেকে Webhook যুক্ত করুন। আসল raw body-তে HMAC যাচাই, পুরনো timestamp ও duplicate event বাদ দিয়ে current payment state query করে order সম্পন্ন করুন।")}</p>
    <code>v1 = HMAC-SHA256(secret, timestamp + &quot;.&quot; + raw_body)</code>
   </section>
   <section id="custom-verification" className="ds-panel ek-custom-verification">
    <span className="ek-doc-step">💫 {t("CUSTOM PAYMENT VERIFICATION","নিজস্ব পেমেন্ট যাচাই")}</span>
    <h2>{t("Your checkout UI, our receipt verification.","চেকআউট আপনার, যাচাই আমাদের।")}</h2>
    <p>{t("Build your own interface. No Ekmivo checkout screen is required for these integration patterns. Both still need an authenticated payment intent and trustworthy server-side receipt evidence.","নিজের checkout UI নিজে তৈরি করুন। এই integration-এ Ekmivo-র checkout UI লাগবে না। তবে API key, payment intent ও আসল server-side receipt evidence প্রয়োজন।")}</p>
    <div className="ek-doc-mode-grid">
     <article className="ek-mode-auto"><span className="ek-cute-icon">✨</span><h3>{t("Automatic verification","Automatic Verification")}</h3><p>{t("No customer TrxID. Create the intent, let the customer pay, then poll status or receive a signed webhook.","কাস্টমারের TrxID লাগবে না। Intent তৈরি করে নিজের UI-তে payment instructions দেখান, API/Webhook থেকে verified status নিন।")}</p><code>GET /v1/payment-intents/{'{intentID}'}</code></article>
     <article className="ek-mode-trx"><span className="ek-cute-icon">🔎</span><h3>{t("TrxID-assisted verification","TrxID দিয়ে যাচাই")}</h3><p>{t("Your UI may collect the provider TrxID. This read-only lookup reports verified only when that receipt is already securely matched to this exact intent; a guessed TrxID cannot mark any payment as paid.","নিজের UI-তে TrxID নিতে পারেন। সেই receipt ইতিমধ্যে নির্দিষ্ট intent-এর সঙ্গে নিরাপদে match হলে তবেই verified দেখাবে; শুধু TrxID লিখে payment verified করা যায় না।")}</p><code>POST /v1/payment-intents/{'{intentID}'}/verify-transaction</code></article>
    </div>
    <h3>{t("Required setup for your own checkout UI","নিজের Checkout UI-এর জন্য প্রয়োজনীয় setup")}</h3>
    <p>{t("After creating the intent, use the returned checkout capability to lock the payer and provider with POST /v1/public/checkout/{token}/lock. Send payer_number and method (bkash/nagad/rocket); show the server-provided receiving instructions, then read authoritative payment status. This binding is mandatory for automatic matching; simply creating an intent does not verify money.","Intent তৈরি করে পাওয়া checkout capability দিয়ে POST /v1/public/checkout/{token}/lock-এ payer_number ও method (bkash/nagad/rocket) পাঠিয়ে attempt lock করুন। Server-এর দেওয়া receiving instructions নিজের UI-তে দেখান, তারপর authoritative payment status নিন। Matching-এর জন্য এই ধাপটি জরুরি; শুধু Intent তৈরি করলেই টাকা যাচাই হয় না।")}</p>
    <pre><code>{JSON.stringify({payer_number:"01XXXXXXXXX",method:"bkash"},null,2)}</code></pre>
    <p className="ek-doc-footnote">{t("Checkout capability is a short-lived, per-intent token; it is not your merchant API key. Do not allow a browser to control amounts or invent verified states.","Checkout capability অল্প সময়ের জন্য নির্দিষ্ট intent-এ কার্যকর; এটি merchant API key নয়। Browser থেকে amount বা verified state বদলানোর সুযোগ দেবেন না।")}</p>
    <h3>{t("TrxID lookup body","TrxID lookup-এর body")}</h3>
    <pre><code>{JSON.stringify({transaction_id:"TXN123456789",provider:"bkash",amount_minor:12500},null,2)}</code></pre>
    <p>{t("Required: transaction_id (4–128 supported characters), provider (bkash/nagad/rocket), amount_minor (positive integer), URL intentID, Bearer API key with payments:read. Returns verified:true plus payment_id/time, or verified:false with pending. No raw sender number or SMS is exposed.","প্রয়োজন: transaction_id, provider (bkash/nagad/rocket), amount_minor, URL-এ intentID এবং payments:read API key। Result-এ verified ও payment ID/time অথবা pending আসবে। Sender-এর পূর্ণ নম্বর বা SMS প্রকাশ করা হবে না।")}</p>
    <p className="ek-doc-footnote">{t("This is not a transaction-consumption/credit-deduction API, and it never triggers a new payment confirmation. A matching verified payment must already exist.","এটি credit কাটা বা নতুন করে payment confirm করার API নয়। আগে থেকেই বিশ্বস্ত receipt দিয়ে payment verified থাকতে হবে।")}</p>
    <PaymentEndpointSamples kind="trx" locale={locale}/>
   </section>
   <section id="sandbox" className="ds-panel">
    <span className="ek-doc-step">🧪 {t("PRACTICE","পরীক্ষা")}</span><h2>{t("Practice as much as you need","নিশ্চিন্তে পরীক্ষা করুন")}</h2>
    <p>{t("Create your own Sandbox key after signing in. The code rail has two separate actions: Run simulation previews an example without network access; Create test payment sends a genuine key-scoped request to the isolated Sandbox database. Existing workspace Sandbox tools run detailed receipt scenarios. Never send real money.","লগইন করে নিজের Sandbox key নিন। পাশের Run simulation শুধু নমুনা দেখায়; Create test payment সত্যিকারের API request দিয়ে আলাদা Sandbox database-এ test record তৈরি করে। বিস্তারিত receipt scenario Workspace-এর Sandbox tools-এ চালানো যায়। আসল টাকা পাঠাবেন না।")}</p>
    <div className="ek-doc-actions"><Link href="/workspaces">{t("Open my workspace →","আমার workspace খুলুন →")}</Link><a href="#create-checkout">{t("Back to Create Payment","Create Payment-এ ফিরুন")}</a></div>
   </section>
   <section id="errors" className="ds-panel">
    <h2>🩹 {t("When something goes wrong","সমস্যা হলে কী করবেন")}</h2>
    <p>{t("401: replace invalid key · 403: check scope or Live subscription · 409: retry with original idempotency key and unchanged body · 422: correct inputs · 429: obey Retry-After · 503: retry safely with backoff.","401: key ঠিক করুন · 403: permission/Live plan দেখুন · 409: আগের একই idempotency key ও body ব্যবহার করুন · 422: input ঠিক করুন · 429: Retry-After মানুন · 503: বিরতি দিয়ে নিরাপদে retry করুন।")}</p>
   </section>
   <section id="api-reference"><PaymentAPIReference locale={locale}/></section>
  </div>
  <aside className="ek-doc-code-rail"><div className="ek-doc-rail-intro"><span>⌘ {t("TRY AN EXAMPLE","কোডের উদাহরণ")}</span><p>{t("Choose a language, copy code, then preview a response.","ভাষা বেছে code কপি করুন, sample response দেখুন।")}</p></div><PaymentDocExamples locale={locale}/></aside>
 </main>;
}