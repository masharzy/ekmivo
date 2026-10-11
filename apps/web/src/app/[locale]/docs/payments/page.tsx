import Link from "next/link";
import {notFound} from "next/navigation";
export const metadata={title:"Ekmivo Payment API — Developer guide"};
export default async function PaymentDocs({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(locale!=="bn"&&locale!=="en")notFound();
 const bn=locale==="bn";
 return <main className="ek-app-shell" style={{minHeight:"75svh"}}>
  <article style={{width:"min(100% - 32px, 920px)",margin:"40px auto 80px",display:"grid",gap:24,lineHeight:1.75}}>
   <p><Link href={`/${locale}/workspaces`}>← {bn?"ওয়ার্কস্পেসে ফিরুন":"Back to workspaces"}</Link></p>
   <header><p className="ds-eyebrow">PAYMENT API · SANDBOX GUIDE</p>
    <h1>{bn?"Payment API developer guide":"Payment API developer guide"}</h1>
    <p>{bn?"PG05 source-এ sandbox request, issued order/invoice ও payer-locked checkout রয়েছে। অনুমোদিত isolated sandbox-এ database ও service প্রস্তুত হলে ব্যবহার করুন। Live receipt matching ও webhook এখনও আলাদা gate।":"PG05 source provides sandbox requests, issued order/invoice sources and payer-locked checkout. Use an explicitly provisioned isolated sandbox. Deployment parity, receipt matching and signed payment webhooks remain separate gates."}</p>
   </header>
   <section className="ds-panel" style={{display:"grid",gap:14}}>
    <h2>{bn?"১. Sandbox key তৈরি করুন":"1. Create a sandbox key"}</h2>
    <p>{bn?"বাম মেনু থেকে Payments → Developers খুলুন, Sandbox নির্বাচন করুন এবং ব্যবসার owner/admin অ্যাকাউন্ট দিয়ে key তৈরি করুন। আপনার বর্তমান পাসওয়ার্ড নিশ্চিত করতে হবে।":"Open Payments → Developers, select Sandbox and issue a key as workspace owner/admin. Confirm your current password."}</p>
    <p>{bn?"Raw secret শুধু একবার দেখানো হয়; server-only secret manager-এ রাখুন। key browser বা mobile APK-তে embed করবেন না।":"The raw secret is shown only once. Store it in a server-side secret manager; never embed it in a browser bundle or mobile APK."}</p>
    <p>Sandbox: <code>ek_test_…</code> · Live: <code>ek_live_…</code></p>
    <p>{bn?"Key-এর environment, business, scope ও মেয়াদ সার্ভারে যাচাই হয়। শুধু prefix দিয়ে কোনো অনুমতি পাওয়া যায় না।":"Environment, business, scopes and expiry are checked on the server; a prefix alone grants no permissions."}</p>
   </section>
   <section className="ds-panel" style={{display:"grid",gap:12}}>
    <h2>{bn?"২. Auth probe পরীক্ষা করুন":"2. Test the authentication probe"}</h2>
    <p><code>GET https://ekmivo-go-api.onrender.com/v1/merchant/context?environment=sandbox</code></p>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",background:"var(--color-canvas)",padding:18,borderRadius:8}}>{'curl -H "Authorization: Bearer $EKMIVO_SECRET" \\\n  "https://ekmivo-go-api.onrender.com/v1/merchant/context?environment=sandbox"'}</pre>
    <p>{bn?"payments:read scope ছাড়া probe 403; ভুল/বাতিল/মেয়াদোত্তীর্ণ key 401; Live key দিয়ে Sandbox 403।":"The probe returns 403 without payments:read; an invalid, revoked or expired key returns 401; live keys cannot be used in sandbox (403)."}</p>
    <p>{bn?"সফল উত্তরে workspace_id, environment, key_id, scopes ও financial_api_ready:false থাকবে। এটি কোনো পেমেন্ট যাচাইয়ের প্রমাণ নয়।":"A valid response includes workspace_id, environment, key_id, scopes and financial_api_ready:false. It is not evidence of payment processing."}</p>
   </section>
   <section className="ds-panel" style={{display:"grid",gap:12}}>
    <h2>{bn?"Sandbox request ও hosted checkout":"Sandbox requests and hosted checkout"}</h2>
    <p>{bn?"payments:write scope-সহ server-only key ব্যবহার করুন। GO_API_URL আপনার অনুমোদিত sandbox API; WORKSPACE_ID কীটির একই business। এই উদাহরণ production deploy-এর প্রমাণ নয়।":"Use a server-only key with payments:write. GO_API_URL is your provisioned sandbox API and WORKSPACE_ID is the key's business. This example does not establish production deployment."}</p>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{`POST /v1/workspaces/{workspaceID}/payment-intents?environment=sandbox
Authorization: Bearer <server-only sandbox key>
Idempotency-Key: <persist one unique key for this request>
Content-Type: application/json

{"merchant_reference":"SANDBOX-REQUEST-001","amount_minor":50050,"currency":"BDT","expires_in_minutes":15}`}</pre>
    <p>{bn?"201 উত্তরে id ও checkout_token পাওয়া যায়। /bn/checkout/{checkout_token} বা /en/checkout/{checkout_token} খুলুন। একই key ও body retry করলে একই request আসে; body বদলালে 409।":"201 returns id and checkout_token. Open /bn/checkout/{checkout_token} or /en/checkout/{checkout_token}. Retry the same key and body for the same request; changed body returns 409."}</p>
    <p>{bn?"প্রকৃত প্রেরক নম্বর ও মাধ্যম নিশ্চিত করলে শুধু payer lock হয়। Sandbox-এ আসল টাকা পাঠাবেন না। Redirect, query বা customer দাবি payment verified করে না।":"Confirming the actual sending number and method creates a payer lock. Do not send real money in sandbox. A redirect, query parameter or customer assertion cannot verify funds."}</p>
   </section>
   <section className="ds-panel" style={{display:"grid",gap:12}}>
    <h2>{bn?"Order / Invoice-এর authoritative source":"Authoritative order and invoice sources"}</h2>
    <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{`POST /v1/workspaces/{workspaceID}/linked-sources?environment=sandbox
{"source_kind":"invoice","source_reference":"SANDBOX-INVOICE-001","items":[{"title":"Service","quantity":2,"unit_amount_minor":2500},{"title":"Delivery","quantity":1,"unit_amount_minor":1735}]}

POST /v1/workspaces/{workspaceID}/payment-intents?environment=sandbox
Idempotency-Key: <persist a separate request key>
{"merchant_reference":"SANDBOX-INVOICE-001-PAY","invoice_id":"<issued source id>","currency":"BDT","expires_in_minutes":15}`}</pre>
    <p>{bn?"প্রথম POST-এ সার্ভার 6735 paisa হিসাব করে immutable নথি ইস্যু করে। দ্বিতীয় POST-এ amount পাঠাবেন না; একই business/environment-এর source থেকে সার্ভার amount নেয়। একসঙ্গে একই source-এর একাধিক active request 409।":"The first POST issues an immutable document with a database-calculated 6735-paisa total. Omit amount in the second POST; the server reads the same business/environment source. Competing active full-amount requests for one source return 409."}</p>
    <p>{bn?"GET payment-intents/{id}?environment=sandbox দিয়ে original terms, masked payer/window, issued lines ও history পড়ুন। POST payment-intents/{id}/cancel?environment=sandbox unpaid/unexpired request বাতিল করে; এটি refund নয়। Viewer শুধু পড়তে পারে।":"GET payment-intents/{id}?environment=sandbox reads original terms, masked payer/window, issued lines and history. POST payment-intents/{id}/cancel?environment=sandbox cancels an unpaid, unexpired request; cancellation is not a refund. Viewers have read access."}</p>
    <p>{bn?"Minimal issued snapshot রয়েছে; পূর্ণ invoice drafting/correction/tax/discount, paid receipt ও verified webhook পরবর্তী PG-তে। 429 এ Retry-After অনুসরণ করুন; service বা Live source না থাকলে 503।":"The minimal issued snapshot is available in source. Full invoice lifecycle, paid receipts and verified webhooks belong to later gates. Respect Retry-After on 429; unavailable services/live sources return 503."}</p>
   </section>
   <section className="ds-panel" style={{display:"grid",gap:12}}>
    <h2>{bn?"৩. Rotation ও security":"3. Rotation and security"}</h2>
    <p>{bn?"Rotate পুরোনো কী তাৎক্ষণিক বাতিল করে একই scopes/expiry-সহ নতুন গোপন কী তৈরি করে। Revoke করলে আর ব্যবহার করা যাবে না। দুটো কাজই password-confirmed এবং audited।":"Rotate revokes the old key immediately and issues a new key with the same scopes and expiry. Revoke permanently disables a key. Both operations require password confirmation and are audited."}</p>
    <p>{bn?"API token কখনো query string, webhook payload, client-side localStorage বা browser analytics-এ পাঠাবেন না।":"Never put API tokens in query strings, webhook payloads, client localStorage or browser analytics."}</p>
   </section>
   <section className="ds-panel" style={{display:"grid",gap:12}}>
    <h2>{bn?"৪. Scope ও error contract":"4. Scope and error contract"}</h2>
    <p><code>payments:read · payments:write · customers:read/write · invoices:read/write · refunds:read/write · webhooks:manage</code></p>
    <p>{bn?"400 invalid env; 401 invalid key; 403 wrong scope/env; 503 unavailable service। OpenAPI source repository-তে রক্ষিত।":"400 invalid environment; 401 invalid credential; 403 wrong scope or environment; 503 unavailable dependency. OpenAPI source is versioned in the repository."}</p>
    <p><a href="https://github.com/masharzy/ekmivo/blob/main/contracts/openapi.yaml" rel="noopener noreferrer" target="_blank">OpenAPI contract ↗</a></p>
   </section>
  </article>
 </main>;
}
