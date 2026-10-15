import {PublicIcon} from "../../../components/public-icon";
import Link from "next/link";
import {notFound} from "next/navigation";
import {goOrigin} from "../../../lib/server/go-origin";
import {DocsNavigation} from "../../../components/docs-navigation";
import {PaymentDocExamples} from "../../../components/payment-doc-examples";
import {PaymentEndpointSamples} from "../../../components/payment-endpoint-samples";

export const metadata={title:"Payment API Docs — Ekmivo",description:"Create and verify payments with a simple, documented API."};

export default async function PaymentGuide({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=="en"&&locale!=="bn")notFound();
 const bn=locale==="bn",t=(en:string,বাংলা:string)=>bn?বাংলা:en;
 const fields=[
  ["amount","number","Yes",t("Amount in BDT: 150 or 150.50. Not paisa.","টাকায় amount: 150 অথবা 150.50; পয়সায় নয়।")],
  ["redirect_url","URL","Yes",t("HTTPS page to open after a verified payment.","Verified payment-এর পর খোলার HTTPS URL।")],
  ["cancel_url","URL","No",t("HTTPS URL after cancellation.","Payment বাতিল হলে HTTPS URL।")],
  ["webhook_url","URL","No",t("Active HTTPS webhook already registered in your workspace.","Workspace-এ আগে registered active HTTPS webhook।")],
  ["customer_name","string","No",t("Customer name.","Customer-এর নাম।")],
  ["customer_email","string","No",t("Customer email.","Customer-এর ইমেইল।")],
  ["customer_phone","string","No",t("Customer contact number, not payment proof.","Customer contact number, payment proof নয়।")],
  ["metadata","object","No",t("Extra order details (no secrets).","Extra order details (secret নয়)।")],
  ["reference","string","No",t("Your order reference; auto-generated when omitted.","Order reference; না দিলে নিজে তৈরি হবে।")],
  ["expires_in_minutes","integer","No",t("Default 30; choose from 5 to 60.","Default 30; ৫ থেকে ৬০ মিনিট।")]
 ];
 return <main className="ek-payment-docs ek-cute-docs ek-unified-guide">
  <div className="ek-doc-topline">
   <div><span className="ek-doc-kicker"><PublicIcon name="code"/> EKMIVO / DEVELOPERS</span><h1>{t("Payment API documentation","পেমেন্ট API ডকুমেন্টেশন")}</h1><p>{t("Create a payment, verify it and receive signed updates. Simple steps and working examples.","পেমেন্ট তৈরি, যাচাই এবং signed updates—সহজ ধাপে, কাজের উদাহরণে।")}</p></div>
   <div className="ek-doc-base-url"><strong>{t("API Base URL","API Base URL")}</strong><code>{goOrigin()?.origin||t("Not configured","কনফিগার করা নেই")}</code><small>{t("Sandbox and Live use the same URL. Your key selects the environment.","একই URL; API key থেকেই Sandbox/Live নির্ধারিত হয়।")}</small></div>
   <div className="ek-doc-top-actions"><Link href="/workspaces">{t("Get API keys","API keys নিন")} ↗</Link><a href="/api/payment-contract" download="ekmivo-openapi.json">OpenAPI ↓</a></div>
  </div>
  <DocsNavigation locale={locale}/>
  <div className="ek-doc-content">
   <section id="create-checkout" className="ds-panel">
    <span className="ek-doc-step">01 · {t("CREATE PAYMENT","পেমেন্ট তৈরি")}</span>
    <h2><PublicIcon name="cart"/> {t("Create a payment","পেমেন্ট তৈরি করুন")}</h2>
    <p>{t("Call this endpoint from your backend. Only amount and redirect_url are required for a new payment.","নিজের backend থেকে request পাঠান। নতুন payment-এর জন্য শুধু amount ও redirect_url required।")}</p>
    <div className="ek-endpoint"><span className="ek-http-method">POST</span><code>/v1/payment-intents</code><span>payments:write</span></div>
    <h3>{t("Headers","Headers")}</h3>
    <div className="ek-docs-table"><table><thead><tr><th>Header</th><th>Required</th><th>{t("Value","Value")}</th></tr></thead><tbody>
     <tr><td><code>Authorization</code></td><td>Yes</td><td><code>Bearer YOUR_API_KEY</code></td></tr>
     <tr><td><code>Content-Type</code></td><td>Yes</td><td><code>application/json</code></td></tr>
     <tr><td><code>Idempotency-Key</code></td><td>No</td><td>{t("Recommended. Keep the same value for safe retries.","Recommended। Retry করলে একই value দিন।")}</td></tr>
    </tbody></table></div>
    <h3 id="request-fields">{t("Request body","Request body")}</h3>
    <div className="ek-docs-table"><table><thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>{t("Description","Description")}</th></tr></thead><tbody>
     {fields.map(([name,type,required,desc])=><tr key={name}><td><code>{name}</code></td><td>{type}</td><td><strong>{required==="Yes"?(bn?"হ্যাঁ":"Yes"):(bn?"না":"No")}</strong></td><td>{desc}</td></tr>)}
    </tbody></table></div>
    <h3>{t("Smallest possible request","সবচেয়ে ছোট request")}</h3>
    <pre><code>{JSON.stringify({amount:150,redirect_url:"https://merchant.example/success"},null,2)}</code></pre>
    <h3>{t("With optional details","Optional তথ্যসহ উদাহরণ")}</h3>
    <pre><code>{JSON.stringify({
      amount:150.50,
      redirect_url:"https://merchant.example/success",
      cancel_url:"https://merchant.example/cancel",
      webhook_url:"https://merchant.example/webhook",
      customer_name:"Alex",
      customer_email:"alex@example.com",
      customer_phone:"01700000000",
      reference:"ORDER-123",
      metadata:{order_id:"123"}
    },null,2)}</code></pre>
    <p className="ek-doc-footnote">{t("Register webhook_url in Workspace → Webhooks first. A supplied webhook URL routes this payment's events to that registered endpoint.","webhook_url আগে Workspace → Webhooks-এ registered থাকতে হবে। দিলে এই payment-এর event সেই endpoint-এ যাবে।")}</p>
    <p className="ek-doc-footnote">{t("Old integrations can continue using amount_minor and merchant_reference. New integrations should use amount in BDT. Order/invoice-linked requests still use their original source IDs.","পুরোনো integration-এর amount_minor ও merchant_reference চলবে। নতুন integration-এ amount ব্যবহার করুন।")}</p>
    <div className="ek-guide-examples" id="integration-examples"><h3>{t("Copy a working example or try Sandbox","কোড কপি অথবা Sandbox test করুন")}</h3><PaymentDocExamples locale={locale}/></div>
    <h3>{t("Example response · 201 Created","Response উদাহরণ · 201 Created")}</h3>
    <pre><code>{JSON.stringify({id:"550e8400-e29b-41d4-a716-446655440000",state:"requires_payer",merchant_reference:"EK-123456",amount_minor:15000,currency:"BDT",checkout_url:"https://checkout.example/en/checkout/TOKEN"},null,2)}</code></pre>
    <p className="ek-doc-footnote">{t("Example values only. checkout_url is included when the public origin is configured. Created does NOT mean paid.","এটি নমুনা response। Public origin configured থাকলে checkout_url পাওয়া যায়। Created মানে paid নয়।")}</p>
   </section>
   <section id="payment-status" className="ds-panel">
    <span className="ek-doc-step">02 · {t("VERIFY PAYMENT","পেমেন্ট যাচাই")}</span>
    <h2><PublicIcon name="shield"/> {t("Verify payment status","পেমেন্টের অবস্থা যাচাই করুন")}</h2>
    <div className="ek-endpoint"><span className="ek-http-method get">GET</span><code>/v1/payment-intents/{'{intentID}'}</code><span>payments:read</span></div>
    <p>{t("Ekmivo matches trusted transaction receipts automatically. Call GET from your backend and check data.state. HTTP 200 means the lookup worked, not that money was received.","Ekmivo নিজে receipt match করে। Backend থেকে GET করে data.state দেখুন। HTTP 200 মানে payment success নয়।")}</p>
    <div className="ek-doc-flow"><span><PublicIcon name="cart"/> Create</span><b>→</b><span><PublicIcon name="phone"/> {t("Customer pays","Customer pays")}</span><b>→</b><span><PublicIcon name="shield"/> Verify</span><b>→</b><span><PublicIcon name="check"/> {t("Complete order","Order complete")}</span></div>
    <p>{t("For the payment intent details, GET also returns your stored optional customer fields and metadata in data.options. Public checkout never exposes those details.","Payment details-এর GET response-এ customer fields ও metadata data.options-এ পাবেন। Public checkout-এ এগুলো দেখা যাবে না।")}</p>
    <p><strong>{t("Only fulfil the order when","Order deliver করবেন শুধু যখন")} <code>data.state === &quot;completed&quot;</code>.</strong> {t("Match the intent ID and amount against your order.","Intent ID ও amount নিজের order-এর সঙ্গে মিলিয়ে নিন।")}</p>
    <PaymentEndpointSamples kind="status" locale={locale}/>
   </section>
   <section id="authentication" className="ds-panel">
    <span className="ek-doc-step">03 · PREFERRED AUTHENTICATION</span>
    <h2><PublicIcon name="key"/> {t("Use a Bearer key","Bearer key ব্যবহার করুন")}</h2>
    <p>{t("Send the secret key in the Authorization header, from your backend only. The key automatically identifies both your workspace and Sandbox/Live environment.","Authorization header-এ API key দিন। Secret শুধু backend-এ থাকবে। Key থেকেই workspace ও Sandbox/Live নির্ধারিত হয়।")}</p>
    <pre><code>{'Authorization: Bearer ek_test_YOUR_SANDBOX_KEY\nContent-Type: application/json'}</code></pre>
    <p>{t("Never expose your API key in browser JavaScript, a mobile app or a public repository. No workspace ID or environment query is required.","Browser, mobile app বা public repo-তে API key রাখবেন না। Workspace ID বা environment query লাগবে না।")}</p>
   </section>
   <section id="api-keys" className="ds-panel">
    <span className="ek-doc-step">04 · GET API KEYS</span>
    <h2><PublicIcon name="key"/> {t("Get Sandbox and Live keys","Sandbox ও Live API key সংগ্রহ")}</h2>
    <h3>{t("Sandbox key","Sandbox key")}</h3>
    <p>{t("Sign in → Payment workspace → API Keys → Create key → Sandbox → Select payments:write and payments:read → Copy the key. It starts with ek_test_.","লগইন → Payment workspace → API Keys → Create key → Sandbox → payments:write এবং payments:read → Key copy করুন। ek_test_ দিয়ে শুরু হবে।")}</p>
    <div className="ek-doc-note"><strong><PublicIcon name="flask"/> Sandbox</strong><span>{t("This is a real isolated test API, not a demo payment. No real funds move.","এটি isolated test API, আসল টাকা লেনদেন নয়।")}</span></div>
    <h3>{t("Live key","Live key")}</h3>
    <p>{t("Activate an eligible payment plan → Return to API Keys → Select Live → Create key and grant the needed scopes. Live keys start with ek_live_.","যোগ্য payment plan চালু করুন → API Keys → Live → Create key। Live key ek_live_ দিয়ে শুরু হবে।")}</p>
    <p>{t("The full secret is displayed once. Keep it secure; rotate or revoke in your workspace.","Secret একবারই দেখানো হয়। নিরাপদে রাখুন; Workspace থেকে rotate/revoke করুন।")}</p>
    <div className="ek-doc-actions"><Link href="/workspaces">{t("Open workspace →","Workspace খুলুন →")}</Link></div>
   </section>
   <section id="webhooks" className="ds-panel">
    <span className="ek-doc-step">05 · WEBHOOKS</span>
    <h2><PublicIcon name="bell"/> {t("Receive signed payment updates","Signed payment updates পান")}</h2>
    <p>{t("Workspace → Webhooks → Add an HTTPS endpoint. Save its signing secret. The optional webhook_url in Create Payment must match an active registered endpoint. When supplied, this payment's events go to that endpoint; otherwise all configured active endpoints receive events.","Workspace → Webhooks থেকে HTTPS endpoint যোগ করুন ও signing secret রাখুন। Create Payment-এর optional webhook_url অবশ্যই registered active endpoint হতে হবে। সেটি দিলে এই payment-এর events সেই endpoint-এ যাবে; না দিলে সব active endpoint-এ যাবে।")}</p>
    <div className="ek-doc-flow"><span><PublicIcon name="phone"/> Receipt</span><b>→</b><span><PublicIcon name="shield"/> Verified</span><b>→</b><span><PublicIcon name="bell"/> Webhook</span><b>→</b><span><PublicIcon name="check"/> GET status</span></div>
    <h3>{t("Example event","Webhook event উদাহরণ")}</h3>
    <pre><code>{JSON.stringify({id:"EVENT_UUID",type:"payment.verified",environment:"sandbox",data:{payment_intent_id:"INTENT_UUID",amount_minor:15000,verification_status:"verified"}},null,2)}</code></pre>
    <h3>{t("Verify the signature","Signature যাচাই")}</h3>
    <p>{t("Read the exact raw body. Calculate HMAC-SHA256(secret, timestamp + '.' + rawBody) and compare with X-Ekmivo-Signature (v1=hex) using a timing-safe comparison. Reject timestamps beyond five minutes; deduplicate event IDs; respond 2xx quickly.","Exact raw body-তে HMAC-SHA256 যাচাই করুন। ৫ মিনিটের পুরোনো timestamp ও duplicate event reject করুন। দ্রুত 2xx response দিন।")}</p>
    <pre><code>{`import {createHmac, timingSafeEqual} from "node:crypto";
const rawBody = await request.text();
const timestamp = request.headers.get("x-ekmivo-timestamp") ?? "";
const signature = (request.headers.get("x-ekmivo-signature") ?? "").replace(/^v1=/, "");
const expected = createHmac("sha256", process.env.EKMIVO_WEBHOOK_SECRET!)
  .update(timestamp + "." + rawBody).digest("hex");
const eventTime = Number(timestamp);
const fresh = Number.isSafeInteger(eventTime) &&
  Math.abs(Date.now() / 1000 - eventTime) <= 300;
const valid = fresh && /^[a-f0-9]{64}$/.test(signature) &&
  timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
if (!valid) return new Response("Invalid signature", {status: 401});
const event = JSON.parse(rawBody);
// Deduplicate event.id in durable storage, then GET the current intent status.
// Only fulfil from verified server state and reply HTTP 200 quickly.`}</code></pre>
    <p className="ek-doc-footnote">{t("Webhook deliveries can retry or arrive out of order. Neither a redirect nor a checkout page proves payment.","Webhook retry/out-of-order হতে পারে। শুধু redirect বা success screen payment proof নয়।")}</p>
   </section>
   <section id="custom-verification" className="ds-panel">
    <span className="ek-doc-step">06 · CUSTOM CHECKOUT</span>
    <h2><PublicIcon name="code"/> {t("Use your own checkout","নিজের Checkout UI ব্যবহার করুন")}</h2>
    <p>{t("Create an intent on your server. Use its checkout capability to lock the full payer number and provider. Show receiving instructions from Ekmivo; read verified status or signed events. Your UI cannot mark an intent paid.","Backend থেকে intent তৈরি করে checkout capability দিয়ে payer number ও provider lock করুন। Ekmivo-র receiving details দেখান এবং verified status নিন।")}</p>
    <div className="ek-endpoint"><span className="ek-http-method">POST</span><code>/v1/public/checkout/{'{token}'}/lock</code></div>
    <pre><code>{JSON.stringify({payer_number:"01XXXXXXXXX",method:"bkash"},null,2)}</code></pre>
    <p>{t("Optional TrxID lookup only finds already verified receipts; it cannot confirm a new payment. It is not needed for hosted checkout.","Optional TrxID lookup শুধু আগের verified receipt খুঁজতে পারে; নতুন payment confirm করে না।")}</p>
   </section>
   <section id="sandbox" className="ds-panel">
    <span className="ek-doc-step">07 · SANDBOX</span><h2><PublicIcon name="flask"/> {t("Try the real Sandbox API","Sandbox API পরীক্ষা করুন")}</h2>
    <p>{t("Use your own ek_test_ key in the Create Payment tester above. Open the returned checkout_url and run approved receipt scenarios from your workspace. Never send real money.","Create Payment tester-এ নিজের ek_test_ key দিন। checkout_url খুলে workspace থেকে receipt scenarios চালান। আসল টাকা পাঠাবেন না।")}</p>
    <div className="ek-doc-actions"><a href="#integration-examples">{t("Go to test form ↑","Test form দেখুন ↑")}</a><Link href="/workspaces">{t("Open workspace","Workspace খুলুন")}</Link></div>
   </section>
   <section id="errors" className="ds-panel">
    <h2><PublicIcon name="shield"/> {t("Common errors","সাধারণ errors")}</h2>
    <div className="ek-docs-table"><table><thead><tr><th>HTTP</th><th>{t("Meaning","কারণ")}</th><th>{t("Fix","সমাধান")}</th></tr></thead><tbody>
    {[
     ["401",t("Invalid key","ভুল key"),t("Use a valid Bearer key.","সঠিক key দিন।")],
     ["403",t("Plan or permissions","Plan/permission"),t("Check scopes and Live subscription.","Scope ও plan দেখুন।")],
     ["409",t("Request conflict","Request conflict"),t("Retry using the same key and body.","একই key ও body দিয়ে retry করুন।")],
     ["422",t("Invalid field","ভুল field"),t("Check amount, HTTPS URLs and registered webhooks.","Amount, HTTPS URL ও webhook দেখুন।")],
     ["429",t("Rate limited","Rate limit"),t("Follow Retry-After.","Retry-After মানুন।")],
     ["503",t("Service unavailable","সেবা বন্ধ"),t("Check status and retry safely.","Status দেখে retry করুন।")]
    ].map(([code,meaning,fix])=><tr key={code}><td>{code}</td><td>{meaning}</td><td>{fix}</td></tr>)}
    </tbody></table></div>
   </section>
  </div>
 </main>;
}