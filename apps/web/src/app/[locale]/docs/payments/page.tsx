import Link from "next/link";
import {notFound} from "next/navigation";
export const metadata={title:"Ekmivo Payment API — Developer guide"};
export default async function PaymentDocs({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(locale!=="bn"&&locale!=="en")notFound();
 const bn=locale==="bn";
 return <main className="ek-app-shell" style={{minHeight:"75svh"}}>
  <article style={{width:"min(100% - 32px, 920px)",margin:"40px auto 80px",display:"grid",gap:24,lineHeight:1.75}}>
   <p><Link href={`/${locale}/workspaces`}>← {bn?"ওয়ার্কস্পেসে ফিরুন":"Back to workspaces"}</Link></p>
   <header><p className="ds-eyebrow">PG03 · API CONTRACT</p>
    <h1>{bn?"Payment API developer guide":"Payment API developer guide"}</h1>
    <p>{bn?"বর্তমানে শুধু authenticated merchant credential context probe চালু। Payment/checkout/receipt/webhook API পরবর্তী PG-তে তৈরি হবে।":"Only the authenticated merchant credential context probe is live. Payment, checkout, receipt and webhook APIs will be implemented in later PGs."}</p>
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
