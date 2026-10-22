"use client";
import Link from "next/link";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {saveSubscriptionCoupon,saveSubscriptionTaxPolicy,transitionSubscriptionCoupon,subscriptionCouponHistory,type CouponAdminState} from "../actions/admin-subscription-coupons";
import {formatBdtMinor,formatPercentBps,type SubscriptionCoupon,type SubscriptionCouponList,type SubscriptionTaxPolicy} from "../lib/subscription-coupons";

const idle:CouponAdminState={status:"idle",message:""};
type Locale="bn"|"en";
// Campaign scheduling is explicitly UTC; do not reinterpret dates in the admin's device zone.
const isoUtc=(value:string|null)=>value?new Date(value).toISOString().slice(0,16):"";

function CouponForm({coupon,locale,onClose}:{coupon:SubscriptionCoupon|null;locale:Locale;onClose:()=>void}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const router=useRouter();const [state,action,pending]=useActionState(saveSubscriptionCoupon,idle);
 const [kind,setKind]=useState(coupon?.discount_kind||"percent");
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 return <div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div role="dialog" aria-modal="true" aria-labelledby="pa-coupon-dialog-title" className="pa-dialog pa-admin-modal">
   <div className="pa-dialog-head"><h2 id="pa-coupon-dialog-title">{coupon?t("Edit coupon · new revision","কুপন সম্পাদনা · নতুন সংস্করণ"):t("Create coupon","কুপন তৈরি")}</h2><button aria-label={t("Close","বন্ধ")} type="button" className="pa-icon-button" onClick={onClose}>×</button></div>
   <form action={action}>
    <input type="hidden" name="id" value={coupon?.id||""}/><input type="hidden" name="revision" value={coupon?.revision||""}/>
    <div className="pa-dialog-body pa-admin-fields">
     <label>{t("Coupon code","কুপন কোড")}<input name="code" maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" required defaultValue={coupon?.code_normalized||""} placeholder="WELCOME25"/></label>
     <div className="pa-admin-form-pair"><label>{t("Discount type","ছাড়ের ধরন")}<select name="discount_kind" value={kind} onChange={e=>setKind(e.target.value as "percent"|"fixed")}><option value="percent">Percent</option><option value="fixed">Fixed BDT</option></select></label>
      <label>{kind==="percent"?t("Discount (%)","ছাড় (%)"):t("Amount (BDT)","পরিমাণ (টাকা)")}<input key={kind} name="discount_value" required inputMode="decimal" defaultValue={kind==="percent"?formatPercentBps(coupon?.percent_bps||null):formatBdtMinor(coupon?.fixed_minor||null)} placeholder={kind==="percent"?"10.00":"100.00"}/></label></div>
     <div className="pa-admin-form-pair"><label>{t("Minimum subtotal (BDT)","সর্বনিম্ন সাবটোটাল (টাকা)")}<input name="min_subtotal" inputMode="decimal" defaultValue={formatBdtMinor(coupon?.min_subtotal_minor??0)}/></label><label>{t("Discount cap (BDT, optional)","সর্বোচ্চ ছাড় (ঐচ্ছিক)")}<input name="max_discount" inputMode="decimal" defaultValue={formatBdtMinor(coupon?.max_discount_minor??null)}/></label></div>
     <div className="pa-admin-form-pair"><label>{t("Global redemption limit","সর্বমোট ব্যবহার সীমা")}<input name="max_redemptions" type="number" min={1} step={1} defaultValue={coupon?.max_redemptions??""}/></label><label>{t("Per-store limit","প্রতি স্টোরে সীমা")}<input name="max_per_store" type="number" min={1} step={1} defaultValue={coupon?.max_per_store??""}/></label></div>
     <label>{t("Eligible offer keys (comma-separated; empty = all)","প্রযোজ্য অফার কী (কমা দিয়ে; ফাঁকা = সব)")}<input name="eligible_offers" defaultValue={coupon?.eligible_offer_keys.join(", ")||""} placeholder="payments_monthly, payments_yearly"/></label>
     <fieldset className="pa-admin-coupon-restrictions"><legend>{t("Eligible products (none selected = all)","প্রযোজ্য পণ্য (কোনোটি না হলে সব)")}</legend><div className="pa-admin-switches">{([['payments','Payments','পেমেন্টস'],['ai_credit','AI prepaid','এআই প্রিপেইড'],['bundle','Bundle','বান্ডেল']] as const).map(([value,en,bn])=><label key={value}><span>{t(en,bn)}</span><input type="checkbox" name="eligible_products" value={value} defaultChecked={coupon?.eligible_products?.includes(value)||false}/></label>)}</div></fieldset>
     <fieldset className="pa-admin-coupon-restrictions"><legend>{t("Eligible terms (none selected = all)","প্রযোজ্য মেয়াদ (কোনোটি না হলে সব)")}</legend><div className="pa-admin-switches">{([['monthly','Monthly','মাসিক'],['yearly','Yearly','বার্ষিক'],['one_time','One-time','এককালীন']] as const).map(([value,en,bn])=><label key={value}><span>{t(en,bn)}</span><input type="checkbox" name="eligible_terms" value={value} defaultChecked={coupon?.eligible_terms?.includes(value)||false}/></label>)}</div></fieldset>
     <div className="pa-admin-form-pair"><label>{t("Starts UTC (optional)","শুরু UTC (ঐচ্ছিক)")}<input name="starts_at" type="datetime-local" defaultValue={isoUtc(coupon?.starts_at||null)}/></label><label>{t("Expires UTC (optional)","শেষ UTC (ঐচ্ছিক)")}<input name="expires_at" type="datetime-local" defaultValue={isoUtc(coupon?.expires_at||null)}/></label></div>
     <div className="pa-admin-switches"><label><span>{t("First paid purchase only","শুধু প্রথম পেইড কেনাকাটা")}</span><input name="first_purchase_only" type="checkbox" defaultChecked={coupon?.first_purchase_only||false}/></label><label><span>{t("Stack with yearly saving","বার্ষিক ছাড়ের সাথে চলবে")}</span><input name="stack_with_annual" type="checkbox" defaultChecked={coupon?.stack_with_annual||false}/></label><label><span>{t("Stack with bundle saving","বান্ডেল ছাড়ের সাথে চলবে")}</span><input name="stack_with_bundle" type="checkbox" defaultChecked={coupon?.stack_with_bundle||false}/></label></div>
     <label>{t("Audit reason (required)","পরিবর্তনের কারণ (বাধ্যতামূলক)")}<textarea name="reason" minLength={10} maxLength={500} required placeholder="Campaign owner, goal and approval reference"/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <p className="pa-subtle">{t("Pause an active campaign before editing. Each edit appends an immutable version; already reserved invoices keep their original quote. Activate separately when ready.","সক্রিয় কুপন বদলাতে আগে Pause করুন। প্রতিটি সম্পাদনায় অপরিবর্তনীয় সংস্করণ যোগ হয়; সংরক্ষিত ইনভয়েসের হিসাব অপরিবর্তিত থাকে।")}</p>
    </div>
    <div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={onClose}>{t("Cancel","বাতিল")}</button><button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save revision","সংস্করণ সংরক্ষণ")}</button></div>
   </form>
  </div>
 </div>;
}

function CouponTransition({coupon,locale}:{coupon:SubscriptionCoupon;locale:Locale}){
 const router=useRouter();const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [state,action,pending]=useActionState(transitionSubscriptionCoupon,idle);
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 const allowed=coupon.status==="archived"?[]:coupon.status==="draft"?["active","scheduled","archived"]:coupon.status==="paused"?["active","scheduled","archived"]:coupon.status==="scheduled"?["active","paused","archived"]:["paused","archived"];
 return <form action={action} className="pa-admin-coupon-transition"><input type="hidden" name="id" value={coupon.id}/><input type="hidden" name="revision" value={coupon.revision}/>
  <label className="pa-sr-only" htmlFor={`coupon-status-${coupon.id}`}>{t("New status","নতুন অবস্থা")}</label><select name="status" id={`coupon-status-${coupon.id}`} disabled={!allowed.length} required defaultValue=""><option value="" disabled>{t("Change status","অবস্থা বদলান")}</option>{allowed.map(v=><option key={v} value={v}>{v}</option>)}</select>
  <label className="pa-sr-only" htmlFor={`coupon-reason-${coupon.id}`}>{t("Audit reason","কারণ")}</label><input name="reason" id={`coupon-reason-${coupon.id}`} minLength={10} maxLength={500} required placeholder={t("Reason (10+ chars)","কারণ (১০+ অক্ষর)")} disabled={!allowed.length}/>
  <button type="submit" className="pa-button" disabled={pending||!allowed.length}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Update","আপডেট")}</button>
  {state.status!=="idle"&&<span className={state.status==="error"?"pa-action-error":"pa-action-success"} role="status">{state.message}</span>}
 </form>;
}


function CouponHistory({id,locale}:{id:string;locale:Locale}){
 const [result,setResult]=useState<Awaited<ReturnType<typeof subscriptionCouponHistory>>|null>(null);
 const [busy,setBusy]=useState(false);const [offset,setOffset]=useState(0);
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 async function load(page:number){setBusy(true);try{setResult(await subscriptionCouponHistory(id,page));setOffset(page);}finally{setBusy(false);}}
 return <div><button type="button" className="pa-button" disabled={busy} onClick={()=>void load(offset)}>{busy?t("Loading…","লোড হচ্ছে…"):t("History / refresh","ইতিহাস / রিফ্রেশ")}</button>
 {result?.error&&<p role="alert">{t("History unavailable. Retry.","ইতিহাস পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।")}</p>}
 {result?.data&&<div className="pa-description"><h3>{t("Saved revisions","সংরক্ষিত সংস্করণ")}</h3>
 {!result.data.versions.length&&<p>{t("No revisions on this page.","এই পৃষ্ঠায় কোনো সংস্করণ নেই।")}</p>}
 {result.data.versions.slice(0,25).map(v=><details key={v.revision}><summary>v{v.revision} · {new Date(v.recorded_at).toLocaleString(locale)}</summary><div className="pa-table-wrap"><pre>{JSON.stringify(v.snapshot,null,2)}</pre></div></details>)}
 <h3>{t("Verified redemptions","যাচাইকৃত ব্যবহার")}</h3>
 {!result.data.redemptions.length&&<p>{t("No verified redemptions on this page.","এই পৃষ্ঠায় কোনো যাচাইকৃত ব্যবহার নেই।")}</p>}
 {result.data.redemptions.slice(0,25).map(r=><p key={r.id}>{r.invoice_id} · {formatBdtMinor(Number(r.discount_minor))} BDT · {new Date(r.redeemed_at).toLocaleString(locale)}</p>)}
 {offset>0&&<button type="button" className="pa-button" disabled={busy} onClick={()=>void load(Math.max(0,offset-25))}>{t("Previous","আগের")}</button>}
 {(result.data.versions.length>25||result.data.redemptions.length>25)&&<button type="button" className="pa-button" disabled={busy} onClick={()=>void load(offset+25)}>{t("Next","পরের")}</button>}</div>}</div>;
}

function TaxPolicyEditor({locale,rules}:{locale:Locale;rules:SubscriptionTaxPolicy[]|null}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const router=useRouter();const [state,action,pending]=useActionState(saveSubscriptionTaxPolicy,idle);
 const [product,setProduct]=useState("payments"),[term,setTerm]=useState("monthly");
 const active=rules?.find(r=>r.product===product&&r.term===term);
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 return <section className="pa-surface pa-table-card" aria-labelledby="pa-tax-rule-title">
  <div className="pa-section-heading"><h2 id="pa-tax-rule-title">{t("Approved tax rules for coupon requotes","কুপন পুনর্হিসাবের অনুমোদিত করনীতি")}</h2></div>
  <div className="pa-dialog-body pa-admin-fields">
   <p className="pa-subtle">{t("No implicit VAT, exemption or tax rate is assumed. The Super Admin must record the approved rate per product and term. Tax uses half-up rounding on the amount after all discounts. If legal treatment differs, keep checkout disabled.","কোনো করহার বা ছাড় অনুমান করা হয় না। প্রতি পণ্য ও মেয়াদের অনুমোদিত হার সুপার অ্যাডমিন দেবেন। সব ছাড়ের পর কর গণনা হয়। আইনগত ভিত্তি আলাদা হলে চেকআউট বন্ধ রাখুন।")}</p>
   {rules===null?<p role="alert" className="pa-action-error">{t("Tax configuration unavailable (migration 0148 pending).","কর কনফিগারেশন পাওয়া যায়নি (মাইগ্রেশন ০১৪৮ বাকি)।")}</p>:<>
    <form action={action} className="pa-admin-fields">
     <div className="pa-admin-form-pair"><label>{t("Product","পণ্য")}<select name="product" value={product} onChange={e=>setProduct(e.target.value)}><option value="payments">Payments</option><option value="ai_credit">AI prepaid</option><option value="bundle">Bundle</option></select></label><label>{t("Term","মেয়াদ")}<select name="term" value={term} onChange={e=>setTerm(e.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one_time">One-time</option></select></label></div>
     <input type="hidden" name="revision" value={active?.revision??0}/>
     <label>{t("Approved tax rate (%)","অনুমোদিত করহার (%)")}<input key={`${product}/${term}/${active?.revision??0}`} name="tax_percent" required inputMode="decimal" defaultValue={active?formatPercentBps(active.rate_bps):""} placeholder="0.00"/></label>
     <label>{t("Approval reference and reason","অনুমোদনের সূত্র ও কারণ")}<textarea name="reason" minLength={10} maxLength={500} required placeholder={t("Approved tax treatment and reviewer reference","অনুমোদিত করনীতি ও পর্যালোচকের সূত্র")}/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save approved revision","অনুমোদিত সংস্করণ সংরক্ষণ")}</button>
    </form>
    <div className="pa-table-wrap"><table><thead><tr><th>{t("Product","পণ্য")}</th><th>{t("Term","মেয়াদ")}</th><th>{t("Tax rate","করহার")}</th><th>{t("Revision","সংস্করণ")}</th></tr></thead><tbody>{rules.map(r=><tr key={r.id}><td>{r.product}</td><td>{r.term}</td><td>{formatPercentBps(r.rate_bps)}%</td><td>{r.revision}</td></tr>)}{rules.length===0&&<tr><td colSpan={4}>{t("No approved policy. Coupon requotes are unavailable.","অনুমোদিত নীতি নেই। কুপন পুনর্হিসাব বন্ধ।")}</td></tr>}</tbody></table></div>
   </>}
  </div>
 </section>;
}

export function AdminSubscriptionCoupons({locale,data,query,status,offset,taxRules}:{locale:Locale;data:SubscriptionCouponList;query:string;status:string;offset:number;taxRules:SubscriptionTaxPolicy[]|null}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [editing,setEditing]=useState<SubscriptionCoupon|null|undefined>(undefined);
 const base=`/${locale}/admin/billing/coupons`;
 const link=(page:number)=>base+"?"+new URLSearchParams({q:query,coupon_status:status,after:String(page)});
 const money=(v:number|null)=>v===null?"—":"৳"+formatBdtMinor(v);
 return <>
  <div className="pa-page-head"><div><h1>{t("Subscription coupons","সাবস্ক্রিপশন কুপন")}</h1><p>{t("Ekmivo SaaS promotions only — merchant store order coupons are separate.","শুধু Ekmivo SaaS প্রচারণার জন্য — স্টোরের অর্ডার কুপন আলাদা।")}</p></div><button className="pa-button pa-button-primary" type="button" onClick={()=>setEditing(null)}>{t("Create coupon","কুপন তৈরি")}</button></div>
  <section className="pa-surface pa-table-card">
   <form method="get" className="pa-filter-bar"><label className="pa-sr-only" htmlFor="coupon-query">{t("Coupon code","কুপন কোড")}</label><input id="coupon-query" type="search" maxLength={80} name="q" defaultValue={query} placeholder={t("Search coupon code","কুপন কোড খুঁজুন")}/><label className="pa-sr-only" htmlFor="coupon-filter">{t("Status","অবস্থা")}</label><select id="coupon-filter" name="coupon_status" defaultValue={status}>{["all","draft","scheduled","active","paused","expired","archived"].map(s=><option key={s} value={s}>{s}</option>)}</select><button className="pa-button" type="submit">{t("Filter","ফিল্টার")}</button></form>
   <div className="pa-table-wrap"><table><thead><tr><th>{t("Code","কোড")}</th><th>{t("Discount","ছাড়")}</th><th>{t("Eligibility","প্রযোজ্য")}</th><th>{t("Usage","ব্যবহার")}</th><th>{t("Status","অবস্থা")}</th><th>{t("Schedule","সময়সীমা")}</th><th>{t("Actions","অ্যাকশন")}</th></tr></thead><tbody>
    {data.coupons.slice(0,25).map(c=><tr key={c.id}><td className="pa-primary-cell"><strong>{c.code_normalized}</strong><small className="pa-subtle">v{c.revision}</small></td>
     <td>{c.discount_kind==="percent"?formatPercentBps(c.percent_bps)+"%":money(c.fixed_minor)}{c.max_discount_minor!==null&&<small className="pa-subtle">{t("Cap","সীমা")}: {money(c.max_discount_minor)}</small>}</td>
     <td>{c.eligible_offer_keys.length?c.eligible_offer_keys.join(", "):t("All offers","সব অফার")}{c.eligible_products.length>0&&<small className="pa-subtle">{c.eligible_products.join(", ")}</small>}{c.eligible_terms.length>0&&<small className="pa-subtle">{c.eligible_terms.join(", ")}</small>}{c.first_purchase_only&&<small className="pa-subtle">{t("First purchase only","শুধু প্রথম কেনাকাটা")}</small>}</td>
     <td>{c.redeemed} / {c.max_redemptions??"∞"}<small className="pa-subtle">{c.reserved} {t("reserved","সংরক্ষিত")}</small></td><td><span className="pa-status-text">{c.status}</span></td>
     <td>{c.starts_at?new Date(c.starts_at).toLocaleDateString(locale):"—"}<small className="pa-subtle">{c.expires_at?new Date(c.expires_at).toLocaleDateString(locale):"—"}</small></td>
     <td><div className="pa-admin-coupon-actions">{["draft","paused"].includes(c.status)&&<button type="button" className="pa-button" onClick={()=>setEditing(c)}>{t("Edit","সম্পাদনা")}</button>}<CouponTransition coupon={c} locale={locale}/><CouponHistory id={c.id} locale={locale}/></div></td></tr>)}
    {!data.coupons.length&&<tr><td colSpan={7} className="pa-empty-row">{t("No coupons match these filters.","এই ফিল্টারে কোনো কুপন নেই।")}</td></tr>}
   </tbody></table></div>
   <div className="pa-table-footer pa-admin-coupon-pagination"><span>{t("Page","পৃষ্ঠা")} {Math.floor(offset/25)+1} · {Math.min(25,data.coupons.length)} {t("coupons","কুপন")}</span><div>{offset>0&&<Link className="pa-button" href={link(Math.max(0,offset-25))}>← {t("Previous","আগের")}</Link>}{data.next_offset!==null&&<Link className="pa-button" href={link(data.next_offset)}>{t("Next","পরের")} →</Link>}</div></div>
  </section>
  <TaxPolicyEditor locale={locale} rules={taxRules}/>
  {editing!==undefined&&<CouponForm key={editing?.id||"new"} coupon={editing||null} locale={locale} onClose={()=>setEditing(undefined)}/>}
 </>;
}
