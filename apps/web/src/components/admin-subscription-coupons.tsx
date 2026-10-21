"use client";
import Link from "next/link";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {saveSubscriptionCoupon,transitionSubscriptionCoupon,type CouponAdminState} from "../actions/admin-subscription-coupons";
import {formatBdtMinor,formatPercentBps,type SubscriptionCoupon,type SubscriptionCouponList} from "../lib/subscription-coupons";

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
   <div className="pa-dialog-head"><h2 id="pa-coupon-dialog-title">{coupon?t("Edit draft coupon","ড্রাফট কুপন সম্পাদনা"):t("Create coupon","কুপন তৈরি")}</h2><button aria-label={t("Close","বন্ধ")} type="button" className="pa-icon-button" onClick={onClose}>×</button></div>
   <form action={action}>
    <input type="hidden" name="id" value={coupon?.id||""}/><input type="hidden" name="revision" value={coupon?.revision||""}/>
    <div className="pa-dialog-body pa-admin-fields">
     <label>{t("Coupon code","কুপন কোড")}<input name="code" maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" required defaultValue={coupon?.code_normalized||""} placeholder="WELCOME25"/></label>
     <div className="pa-admin-form-pair"><label>{t("Discount type","ছাড়ের ধরন")}<select name="discount_kind" value={kind} onChange={e=>setKind(e.target.value as "percent"|"fixed")}><option value="percent">Percent</option><option value="fixed">Fixed BDT</option></select></label>
      <label>{kind==="percent"?t("Discount (%)","ছাড় (%)"):t("Amount (BDT)","পরিমাণ (টাকা)")}<input key={kind} name="discount_value" required inputMode="decimal" defaultValue={kind==="percent"?formatPercentBps(coupon?.percent_bps||null):formatBdtMinor(coupon?.fixed_minor||null)} placeholder={kind==="percent"?"10.00":"100.00"}/></label></div>
     <div className="pa-admin-form-pair"><label>{t("Minimum subtotal (BDT)","সর্বনিম্ন সাবটোটাল (টাকা)")}<input name="min_subtotal" inputMode="decimal" defaultValue={formatBdtMinor(coupon?.min_subtotal_minor??0)}/></label><label>{t("Discount cap (BDT, optional)","সর্বোচ্চ ছাড় (ঐচ্ছিক)")}<input name="max_discount" inputMode="decimal" defaultValue={formatBdtMinor(coupon?.max_discount_minor??null)}/></label></div>
     <div className="pa-admin-form-pair"><label>{t("Global redemption limit","সর্বমোট ব্যবহার সীমা")}<input name="max_redemptions" type="number" min={1} step={1} defaultValue={coupon?.max_redemptions??""}/></label><label>{t("Per-store limit","প্রতি স্টোরে সীমা")}<input name="max_per_store" type="number" min={1} step={1} defaultValue={coupon?.max_per_store??""}/></label></div>
     <label>{t("Eligible offer keys (comma-separated; empty = all)","প্রযোজ্য অফার কী (কমা দিয়ে; ফাঁকা = সব)")}<input name="eligible_offers" defaultValue={coupon?.eligible_offer_keys.join(", ")||""} placeholder="payments_monthly, payments_yearly"/></label>
     <div className="pa-admin-form-pair"><label>{t("Starts UTC (optional)","শুরু UTC (ঐচ্ছিক)")}<input name="starts_at" type="datetime-local" defaultValue={isoUtc(coupon?.starts_at||null)}/></label><label>{t("Expires UTC (optional)","শেষ UTC (ঐচ্ছিক)")}<input name="expires_at" type="datetime-local" defaultValue={isoUtc(coupon?.expires_at||null)}/></label></div>
     <div className="pa-admin-switches"><label><span>{t("First paid purchase only","শুধু প্রথম পেইড কেনাকাটা")}</span><input name="first_purchase_only" type="checkbox" defaultChecked={coupon?.first_purchase_only||false}/></label><label><span>{t("Stack with yearly saving","বার্ষিক ছাড়ের সাথে চলবে")}</span><input name="stack_with_annual" type="checkbox" defaultChecked={coupon?.stack_with_annual||false}/></label><label><span>{t("Stack with bundle saving","বান্ডেল ছাড়ের সাথে চলবে")}</span><input name="stack_with_bundle" type="checkbox" defaultChecked={coupon?.stack_with_bundle||false}/></label></div>
     <label>{t("Audit reason (required)","পরিবর্তনের কারণ (বাধ্যতামূলক)")}<textarea name="reason" minLength={10} maxLength={500} required placeholder="Campaign owner, goal and approval reference"/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <p className="pa-subtle">{t("Saving creates/updates a draft. Only the explicit activation action can make a coupon redeemable. Checkout redemption is separately gated.","সংরক্ষণ করলে ড্রাফট থাকে। আলাদা করে চালু করতে হবে; চেকআউটের ব্যবহার আলাদাভাবে নিয়ন্ত্রিত।")}</p>
    </div>
    <div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={onClose}>{t("Cancel","বাতিল")}</button><button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save draft","ড্রাফট সংরক্ষণ")}</button></div>
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

export function AdminSubscriptionCoupons({locale,data,query,status,offset}:{locale:Locale;data:SubscriptionCouponList;query:string;status:string;offset:number}){
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
     <td>{c.eligible_offer_keys.length?c.eligible_offer_keys.join(", "):t("All offers","সব অফার")}{c.first_purchase_only&&<small className="pa-subtle">{t("First purchase only","শুধু প্রথম কেনাকাটা")}</small>}</td>
     <td>{c.redeemed} / {c.max_redemptions??"∞"}<small className="pa-subtle">{c.reserved} {t("reserved","সংরক্ষিত")}</small></td><td><span className="pa-status-text">{c.status}</span></td>
     <td>{c.starts_at?new Date(c.starts_at).toLocaleDateString(locale):"—"}<small className="pa-subtle">{c.expires_at?new Date(c.expires_at).toLocaleDateString(locale):"—"}</small></td>
     <td><div className="pa-admin-coupon-actions">{["draft","paused"].includes(c.status)&&c.redeemed===0&&c.reserved===0&&<button type="button" className="pa-button" onClick={()=>setEditing(c)}>{t("Edit","সম্পাদনা")}</button>}<CouponTransition coupon={c} locale={locale}/></div></td></tr>)}
    {!data.coupons.length&&<tr><td colSpan={7} className="pa-empty-row">{t("No coupons match these filters.","এই ফিল্টারে কোনো কুপন নেই।")}</td></tr>}
   </tbody></table></div>
   <div className="pa-table-footer pa-admin-coupon-pagination"><span>{t("Page","পৃষ্ঠা")} {Math.floor(offset/25)+1} · {Math.min(25,data.coupons.length)} {t("coupons","কুপন")}</span><div>{offset>0&&<Link className="pa-button" href={link(Math.max(0,offset-25))}>← {t("Previous","আগের")}</Link>}{data.next_offset!==null&&<Link className="pa-button" href={link(data.next_offset)}>{t("Next","পরের")} →</Link>}</div></div>
  </section>
  {editing!==undefined&&<CouponForm key={editing?.id||"new"} coupon={editing||null} locale={locale} onClose={()=>setEditing(undefined)}/>}
 </>;
}
