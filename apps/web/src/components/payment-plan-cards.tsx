import Link from "next/link";
import {featureLabels,limitLabels,planName,planPrice,type PaymentPlan} from "../lib/payment-plans";
export function PaymentPlanCards({plans,locale,preview=false,variant="default"}:{plans:PaymentPlan[];locale:"en"|"bn";preview?:boolean;variant?:"default"|"landing"}){
 const bn=locale==="bn",t=(en:string,b:string)=>bn?b:en;
 if(variant==="landing")return <div className="p4">
 {plans.map(plan=>{
   const x=plan.terms, custom=x.kind==="custom", featured=!!x.badge||!!x.badge_bn;
   const href=custom?(x.contact_url||`/${locale}/#contact`):`/${locale}/subscribe/${encodeURIComponent(plan.id)}`;
   return <article className={`pcard${featured?" rec":""}`} key={plan.id}>
     <div className="pt"><h3 title={planName(x,bn)}>{planName(x,bn)}</h3>{featured&&<span className="bd">{bn&&x.badge_bn?x.badge_bn:x.badge}</span>}</div>
     <div className="amt">{custom?t("Let's talk","কথা বলুন"):planPrice(x,bn)}{x.kind==="paid"&&<small>{t(` / ${x.period_days} days`,` / ${x.period_days} দিন`)}</small>}</div>
     <ul>
       <li>{x.payment_limit===null?t("Custom volume and terms","নিজের ভলিউম ও শর্ত অনুযায়ী") : t(`${x.payment_limit.toLocaleString("en-US")} successful payments`,`${x.payment_limit.toLocaleString("en-US")}টি সফল পেমেন্ট`)}</li>
       {Object.entries(featureLabels).filter(([key])=>x.features[key as keyof typeof x.features]).slice(0,5).map(([key,labels])=><li key={key}>{labels[bn?1:0]}</li>)}
     </ul>
     {preview?<span className="btn out">{t("Plan preview","প্ল্যান প্রিভিউ")}</span>:<Link prefetch={false} className={`btn${featured?" lime":" out"}`} href={href}>{custom?t("Contact us","যোগাযোগ করুন"):x.kind==="free"?t("Start free","ফ্রি শুরু করুন"):t("Choose plan","প্ল্যান বেছে নিন")}</Link>}
   </article>;
 })}
 </div>;
 return <div className="mp-price-grid">{plans.map(p=>{const x=p.terms;const href=x.kind==="custom"?(x.contact_url||`/${locale}/#contact`):`/${locale}/subscribe/${encodeURIComponent(p.id)}`;
 return <article className={"mp-price-card"+(x.badge?" mp-highlight":"")} key={p.id}>
  {(x.badge||x.badge_bn)&&<span className="mp-badge">{bn&&x.badge_bn?x.badge_bn:x.badge}</span>}
  <h3>{planName(x,bn)}</h3><p>{bn&&x.description_bn?x.description_bn:x.description}</p>
  <div className="mp-price">{planPrice(x,bn)}</div><small>{x.kind==="paid"?t(`every ${x.period_days} days`,`প্রতি ${x.period_days} দিন`):x.kind==="custom"?t("Terms agreed with your business","আপনার ব্যবসা অনুযায়ী শর্ত"):x.free_days?t(`Free for ${x.free_days} days from activation`,`চালু করার পর ${x.free_days} দিন ফ্রি`):t("Always free","সবসময় ফ্রি")}</small>
  <strong>{x.payment_limit===null?t("Unlimited successful payments","আনলিমিটেড সফল পেমেন্ট"):t(`${x.payment_limit.toLocaleString()} successful payments`,`${x.payment_limit.toLocaleString("bn-BD")}টি সফল পেমেন্ট`)}</strong>
  <small>{x.quota_period==="calendar"?t("Each calendar month · Dhaka time","প্রতি ক্যালেন্ডার মাস · ঢাকা সময়"):x.quota_period==="term"?t("For the subscription term","পুরো সাবস্ক্রিপশন মেয়াদে"):t(`Each ${x.period_days}-day allowance period`,`প্রতি ${x.period_days} দিনের ব্যবহার মেয়াদে`)}</small>
  <ul><li>{t("Unlimited website, app & bot integrations","ইচ্ছেমতো website, app ও bot integration")}</li>{Object.entries(featureLabels).map(([key,labels])=><li key={key} className={!x.features[key as keyof typeof x.features]?"mp-excluded":""}>{x.features[key as keyof typeof x.features]?"✓":"—"} {labels[bn?1:0]}</li>)}</ul>
  <dl className="mp-resources">{Object.entries(limitLabels).map(([key,label])=><div key={key}><dt>{label[bn?1:0]}</dt><dd>{x.limits[key as keyof typeof x.limits]??t("Unlimited","আনলিমিটেড")}</dd></div>)}</dl>
  {preview?<span className="mp-cta">{t("Plan preview","প্ল্যান প্রিভিউ")}</span>:<Link prefetch={false} className="mp-cta" href={href}>{x.kind==="custom"?t("Contact sales","যোগাযোগ করুন"):x.kind==="free"?t("Start free","ফ্রি শুরু করুন"):t("Choose plan","প্ল্যান বেছে নিন")} ↗</Link>}
 </article>})}</div>
}
