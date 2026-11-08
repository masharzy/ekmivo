import Link from "next/link";
import {unifiedSettings,enabledUnifiedService,type BusinessMode} from "../lib/unified-navigation";
import styles from "./unified-settings-index.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";

// One short line per setting so people can tell where to go without opening it.
const hints:Record<string,{en:string;bn:string}>={
 business:{en:"Name, logo, contact and address",bn:"নাম, লোগো, যোগাযোগ ও ঠিকানা"},
 preferences:{en:"Language, currency and defaults",bn:"ভাষা, মুদ্রা ও ডিফল্ট"},
 account:{en:"Password, sessions and two-step login",bn:"পাসওয়ার্ড, সেশন ও টু-স্টেপ লগইন"},
 "account/devices":{en:"Notifications on this browser",bn:"এই ব্রাউজারের নোটিফিকেশন"},
 "payment-methods":{en:"bKash, Nagad, Rocket and bank accounts you receive on",bn:"যেসব বিকাশ, নগদ, রকেট ও ব্যাংকে টাকা নেন"},
 devices:{en:"Phones that forward your payment SMS",bn:"যেসব ফোন পেমেন্ট SMS ফরওয়ার্ড করে"},
 checkout:{en:"How your payment page looks",bn:"পেমেন্ট পেজ দেখতে কেমন হবে"},
 ai:{en:"How your AI assistant replies",bn:"AI সহকারী কীভাবে উত্তর দেবে"},
 knowledge:{en:"Facts your AI can use",bn:"AI যেসব তথ্য ব্যবহার করবে"},
 channels:{en:"Facebook, Instagram, WhatsApp",bn:"ফেসবুক, ইনস্টাগ্রাম, হোয়াটসঅ্যাপ"},
 website:{en:"Chat widget for your website",bn:"আপনার ওয়েবসাইটের চ্যাট উইজেট"},
 "comment-automation":{en:"Auto-reply to post comments",bn:"পোস্টের কমেন্টে অটো-রিপ্লাই"},
 team:{en:"Invite people and set roles",bn:"মানুষ যোগ করুন ও ভূমিকা দিন"},
 "team/groups":{en:"Reusable permission sets",bn:"পুনর্ব্যবহারযোগ্য অনুমতির সেট"},
 "api-keys":{en:"Keys for your website or app",bn:"আপনার ওয়েবসাইট বা অ্যাপের জন্য কী"},
 webhooks:{en:"Get notified when payments change",bn:"পেমেন্ট বদলালে নোটিফিকেশন"},
 integrations:{en:"WooCommerce and other connections",bn:"WooCommerce ও অন্যান্য সংযোগ"},
 "integrations/courier":{en:"Courier account credentials",bn:"কুরিয়ার অ্যাকাউন্টের তথ্য"},
 activity:{en:"Who changed what, and when",bn:"কে কী বদলেছে, কখন"},
 "api-docs":{en:"Developer guide (opens in a new tab)",bn:"ডেভেলপার গাইড (নতুন ট্যাবে)"},
 billing:{en:"Plan, invoices and usage",bn:"প্ল্যান, ইনভয়েস ও ব্যবহার"},
 help:{en:"Guides and support",bn:"গাইড ও সহায়তা"},
 "help/videos":{en:"Short how-to videos",bn:"ছোট ভিডিও টিউটোরিয়াল"},
 "help/feedback":{en:"Tell us what to improve",bn:"কী ঠিক করব জানান"},
};

// Account & security and this-browser notifications live in the profile menu (top right);
// business preferences were only a stub. They are intentionally not listed here.
const hidden=["preferences","account","account/devices","help/videos","help/feedback","billing"];
export function UnifiedSettingsIndex({locale,mode}:{locale:"en"|"bn";mode:BusinessMode}){
 const bn=locale==="bn";
 return <div className="ref-dashboard"><section className={"ref-page "+styles.root} aria-labelledby="unified-settings-title">
  <div className="top"><h1 id="unified-settings-title">{bn?"সেটিংস":"Settings"}</h1><div className="acts"><Link className="ib" href="/setup/checklist">{bn?"সেটআপ গাইড":"Setup guide"}</Link></div><p>{bn?"ব্যবসা, পেমেন্ট, টিম ও ইন্টিগ্রেশন এক জায়গা থেকে।":"Business, payments, team and integrations in one place."}</p></div>
  <div className={styles.groups}>{unifiedSettings.map(group=>{
   const items=group.items.filter(item=>enabledUnifiedService(mode,item.service)&&!hidden.includes(item.slug)&&
    (item.slug!=="activity"||mode!=="ai"||process.env.BRIOFOLD_ACTIVITY_UNIFIED_ENABLED==="true")&&
    (item.slug!=="integrations/courier"||process.env.BRIOFOLD_COURIER_SETTINGS_ENABLED==="true")&&
    (item.slug!=="team/groups"||process.env.BRIOFOLD_TEAM_GROUPS_ENABLED==="true"));
   if(!items.length)return null;
   return <section className={styles.group} key={group.slug} aria-labelledby={"set-"+group.slug}>
    <h2 id={"set-"+group.slug}>{group.slug==="payment"&&mode==="ai"?(bn?"ডিভাইস":"Devices"):group[locale]}</h2>
    <div className={"card "+styles.entries}>{items.map(item=><Link key={item.slug} href={item.external?"/developers":item.slug==="website"?"/settings/channels/website":"/settings/"+item.slug} prefetch={!item.external} target={item.external?"_blank":undefined} rel={item.external?"noopener noreferrer":undefined}>
     <span className={styles.text}><strong>{item[locale]}</strong>{hints[item.slug]&&<small>{hints[item.slug][locale]}</small>}</span>
     <span className={styles.arrow} aria-hidden="true">{item.external?"↗":"›"}</span>
    </Link>)}</div>
   </section>;
  })}</div>
 </section></div>;
}
