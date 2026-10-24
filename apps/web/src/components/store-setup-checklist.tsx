import "server-only";
import Link from "next/link";
import {database} from "../lib/server/db";
import type {Workspace} from "../lib/server/auth";
import styles from "./store-setup-checklist.module.css";

type Readiness={business:boolean;channels:boolean|null;products:boolean;courier:boolean;team:boolean|null};
async function readiness(workspace:Workspace,actor:string):Promise<Readiness|"forbidden"|null>{
 try{
  const db=database();
  // Read one current snapshot; a role cached in the shell is never authority.
  // Only existence leaves this query: no contacts, credentials or member names.
  const [row]=await db`
   SELECT length(trim(coalesce(s.body->>'name','')))>0 AS business,
    CASE WHEN EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=m.workspace_id AND p.product='ai' AND p.enabled)
     AND pg13_capability_override(m.workspace_id,m.user_id,'inbox:read') IS DISTINCT FROM false
     AND pg13_capability_override(m.workspace_id,m.user_id,'product:ai') IS DISTINCT FROM false
    THEN EXISTS(SELECT 1 FROM inbox_connections c WHERE c.workspace_id=m.workspace_id AND c.environment='live' AND c.enabled) END AS channels,
    EXISTS(SELECT 1 FROM commerce_products p JOIN commerce_variants v ON v.workspace_id=p.workspace_id AND v.environment=p.environment AND v.product_id=p.id AND v.active
      WHERE p.workspace_id=m.workspace_id AND p.environment='live' AND p.active) AS products,
    EXISTS(SELECT 1 FROM commerce_integrations i WHERE i.workspace_id=m.workspace_id AND i.environment='live' AND i.provider IN ('steadfast','pathao') AND i.enabled) AS courier,
    CASE WHEN pg13_capability_override(m.workspace_id,m.user_id,'members:manage') IS DISTINCT FROM false
      THEN (SELECT count(*)>1 FROM workspace_members team WHERE team.workspace_id=m.workspace_id) END AS team
   FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL
    JOIN workspaces w ON w.id=m.workspace_id AND w.service_mode<>'off'
    LEFT JOIN dashboard_store_profiles s ON s.workspace_id=m.workspace_id
   WHERE m.workspace_id=${workspace.id}::uuid AND m.user_id=${actor}::uuid AND m.role IN ('owner','admin')
    AND pg13_capability_override(m.workspace_id,m.user_id,'workspace:settings') IS DISTINCT FROM false`;
  if(!row)return "forbidden";
  return {business:row.business===true,channels:typeof row.channels==="boolean"?row.channels:null,products:row.products===true,courier:row.courier===true,team:typeof row.team==="boolean"?row.team:null};
 }catch{return null;}
}
export async function StoreSetupChecklist({workspace,actorId,bn}:{workspace:Workspace;actorId:string;bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en,data=await readiness(workspace,actorId);
 if(data==="forbidden")return <section className={styles.root}><h1>{t("Business setup guide","ব্যবসা সেটআপ গাইড")}</h1><p role="alert">{t("Only an owner or permitted administrator can review Business setup.","মালিক বা অনুমতিপ্রাপ্ত অ্যাডমিন ব্যবসা সেটআপ দেখতে পারবেন।")}</p></section>;
 if(!data)return <section className={styles.root}><h1>{t("Business setup guide","ব্যবসা সেটআপ গাইড")}</h1><p role="alert">{t("Setup sources are unavailable. Refresh to check again.","সেটআপের তথ্য পাওয়া যাচ্ছে না। আবার রিফ্রেশ করুন।")}</p><Link href="/setup/checklist">{t("Retry setup check","আবার সেটআপ দেখুন")}</Link></section>;
 const configured=t("Configuration saved","সেটিংস সংরক্ষিত"),review=t("Review setup","সেটআপ দেখুন"),manual=t("Check on this device","এই ডিভাইসে দেখুন");
 const steps=[
  {id:"business",title:t("Business profile","ব্যবসার পরিচিতি"),state:data.business?configured:review,href:"/settings/business",copy:t("Review your Business name, business details and contact information.","ব্যবসার নাম, ব্যবসার তথ্য ও যোগাযোগের ঠিকানা দেখুন।")},
  ...(workspace.mode!=="commerce"?[{id:"channels",title:t("Facebook & messaging channels","Facebook ও মেসেজিং চ্যানেল"),state:data.channels===null?t("Access unavailable","অনুমতি নেই"):data.channels?configured:review,href:data.channels===null?null:"/settings/channels",copy:t("Connect the correct Facebook Page, Instagram or WhatsApp account. Send and receive a permitted test message from that account before relying on delivery.","সঠিক Facebook Page, Instagram বা WhatsApp অ্যাকাউন্ট যুক্ত করুন। মেসেজ পৌঁছানো যাচাই করতে ওই অ্যাকাউন্ট থেকে অনুমোদিত পরীক্ষামূলক মেসেজ আদান-প্রদান করুন।")}]:[]),
  {id:"products",title:t("Products & stock","পণ্য ও স্টক"),state:data.products?configured:review,href:"/orders/products",copy:t("Review active products, variants, prices, photos and stock. An active variant is configuration evidence, not a stock or photo quality check.","সক্রিয় পণ্য, ভ্যারিয়েন্ট, দাম, ছবি ও স্টক দেখুন। সক্রিয় ভ্যারিয়েন্ট থাকলেই স্টক বা ছবির মান যাচাই হয় না।")},
  {id:"notifications",title:t("Browser notifications","ব্রাউজার নোটিফিকেশন"),state:manual,href:"/settings/account/devices",copy:t("Choose sound and browser permissions on each device, then review the notification feed. Server setup cannot grant browser permission.","প্রতিটি ডিভাইসে সাউন্ড ও ব্রাউজারের অনুমতি বেছে নিয়ে নোটিফিকেশন দেখুন। সার্ভার ব্রাউজারের অনুমতি দিতে পারে না।")},
  {id:"courier",title:t("Courier & handover","কুরিয়ার ও হস্তান্তর"),state:data.courier?configured:review,href:process.env.BRIOFOLD_COURIER_SETTINGS_ENABLED==="true"?"/settings/integrations/courier":"/orders/courier",copy:t("Review courier credentials and shipment handover. Saved credentials do not prove booking, delivery or cash settlement. Provider booking must be enabled and tested separately.","Steadfast-এর সংযোগ ও শিপমেন্ট হস্তান্তর দেখুন। তথ্য সংরক্ষণ মানেই বুকিং, ডেলিভারি বা নগদ জমা যাচাই নয়। প্রোভাইডারের বুকিং আলাদাভাবে চালু ও পরীক্ষা করতে হবে।")},
  {id:"team",title:t("Team & access","টিম ও অনুমতি"),state:data.team===null?t("Access unavailable","অনুমতি নেই"):data.team?configured:t("Optional for a solo Business","একা পরিচালিত ব্যবসায় ঐচ্ছিক"),href:data.team===null?null:"/settings/team",copy:t("Invite colleagues if needed, check their roles and restrictions, and keep owner access with the Business owner.","প্রয়োজন হলে সহকর্মী আমন্ত্রণ করুন, ভূমিকা ও সীমাবদ্ধতা দেখুন এবং মালিকের অনুমতি মালিকের কাছেই রাখুন।")},
  ...(workspace.mode!=="ai"?[{id:"payments",title:t("Payment receiving setup","পেমেন্ট গ্রহণের সেটআপ"),state:review,href:"/settings/payment-methods",copy:t("Review receiving methods and linked phones. A configured account or server acknowledgement does not verify a customer payment.","পেমেন্ট মাধ্যম ও যুক্ত ফোন দেখুন। অ্যাকাউন্ট সেটআপ বা সার্ভারের ACK গ্রাহকের পেমেন্ট যাচাই নয়।")}]:[])
 ];
 return <section className={styles.root}>
  <header><div><h1>{t("Business setup guide","ব্যবসা সেটআপ গাইড")}</h1><p>{t("Current saved configuration and the next checks for this Business.","এই ব্যবসার সংরক্ষিত সেটআপ ও পরবর্তী করণীয়।")}</p></div><Link href="/setup/checklist">{t("Refresh setup status","সেটআপের অবস্থা রিফ্রেশ")}</Link></header>
  <ol className={styles.steps}>{steps.map((step,index)=><li key={step.id} data-setup-step={step.id}><span className={styles.number} aria-hidden="true">{index+1}</span><div><h2>{step.title}</h2><span className={styles.status}>{step.state}</span><p>{step.copy}</p>{step.href&&<Link href={step.href}>{t("Open settings","সেটিংস খুলুন")} · {step.title}</Link>}</div></li>)}</ol>
  <section className={styles.launch} aria-labelledby="setup-launch"><h2 id="setup-launch">{t("Before you go live","চালু করার আগে")}</h2><p>{t("Review channel delivery, team access, order totals and the payment or courier flow you will use. Run provider checks only with the accounts and recipients you are authorized to use. This guide never sends a message, books a shipment or activates billing.","চ্যানেলে মেসেজ পৌঁছানো, টিমের অনুমতি, অর্ডারের হিসাব এবং ব্যবহৃত পেমেন্ট বা কুরিয়ার প্রক্রিয়া যাচাই করুন। নিজের অনুমোদিত অ্যাকাউন্ট ও প্রাপকের সঙ্গেই প্রোভাইডার পরীক্ষা করুন। এই গাইড মেসেজ পাঠায় না, শিপমেন্ট বুক করে না বা বিলিং চালু করে না।")}</p><div className={styles.links}><Link href="/dashboard">{t("Open dashboard","ড্যাশবোর্ড খুলুন")}</Link><Link href="/settings/help">{t("Setup help","সেটআপ সহায়তা")}</Link></div></section>
 </section>;
}
