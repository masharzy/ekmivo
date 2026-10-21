"use client";
import {useActionState,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {draftSubscriptionOffer,transitionSubscriptionOffer,type OfferActionState} from "../actions/admin-subscription-offers";
import {formatBdtMinor} from "../lib/subscription-coupons";

type Version={id:string;revision:number;term:"monthly"|"yearly"|"one_time";amount_minor:number;currency:"BDT";payment_plan_version_id:string|null;terms:{name:string;name_bn:string;description:string;description_bn:string;included_ai_credits?:string};created_at:string};
type Offer={key:string;product:"payments"|"ai_credit"|"bundle";status:"draft"|"published"|"archived";current_version_id:string|null;updated_at:string;versions:Version[]};
type Plan={id:string;version_id:string;name:string};
const idle:OfferActionState={status:"idle",message:""};
const t=(locale:"bn"|"en",en:string,bn:string)=>locale==="bn"?bn:en;

function Editor({locale,plans,onClose}:{locale:"bn"|"en";plans:Plan[];onClose:()=>void}){
 const router=useRouter(),[status,action,pending]=useActionState(draftSubscriptionOffer,idle);
 const [product,setProduct]=useState<Offer["product"]>("payments");
 useEffect(()=>{if(status.status==="success")router.refresh()},[router,status.status]);
 return <div className="pa-admin-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
  <div className="pa-dialog pa-admin-modal" role="dialog" aria-modal="true" aria-labelledby="pa-offer-editor-title">
   <div className="pa-dialog-head"><h2 id="pa-offer-editor-title">{t(locale,"Draft versioned offer","অফারের নতুন সংস্করণ")}</h2><button className="pa-icon-button" aria-label="Close" type="button" onClick={onClose}>×</button></div>
   <form action={action}><div className="pa-dialog-body pa-admin-fields">
    <label>{t(locale,"Offer key (fixed identity)","অফার কী (অপরিবর্তনীয়)")}<input name="offer_key" pattern="[a-z][a-z0-9_-]{2,63}" required placeholder="payments_yearly" maxLength={64}/></label>
    <label>{t(locale,"Product","পণ্য")}<select name="product" value={product} onChange={event=>setProduct(event.target.value as Offer["product"])}><option value="payments">Payments</option><option value="ai_credit">AI prepaid credits</option><option value="bundle">AI + Payments bundle</option></select></label>
    <label>{t(locale,"Billing term","মেয়াদ")}<select key={product} name="term" defaultValue={product==="ai_credit"?"one_time":"monthly"}>{product==="ai_credit"?<option value="one_time">One-time prepaid</option>:<><option value="monthly">Monthly</option><option value="yearly">Yearly</option></>}</select></label>
    <label>{t(locale,"Price in BDT","মূল্য (টাকা)")}<input type="text" inputMode="decimal" name="price_bdt" required pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="1200.00"/></label>
    {product!=="ai_credit"&&<label>{t(locale,"Published Gateway plan (version pinned)","প্রকাশিত গেটওয়ে প্ল্যান (নির্দিষ্ট সংস্করণ)")}<select name="payment_plan_version_id" required defaultValue=""><option value="">Select published Gateway plan</option>{plans.map(p=><option key={p.version_id} value={p.version_id}>{p.name} · {p.id}</option>)}</select></label>}
    {product!=="payments"&&<label>{t(locale,"Included prepaid AI credits (exact count)","অন্তর্ভুক্ত প্রিপেইড এআই ক্রেডিট সংখ্যা")}<input name="included_ai_credits" inputMode="numeric" pattern="[1-9][0-9]{0,11}" required/></label>}
    <label>{t(locale,"Display name","নাম")}<input name="name" required minLength={2} maxLength={100}/></label>
    <label>{t(locale,"Bangla name","বাংলা নাম")}<input name="name_bn" maxLength={120}/></label>
    <label>{t(locale,"Description","বিবরণ")}<textarea name="description" maxLength={500}/></label>
    <label>{t(locale,"Bangla description","বাংলা বিবরণ")}<textarea name="description_bn" maxLength={500}/></label>
    <label>{t(locale,"Audit reason","পরিবর্তনের কারণ")}<textarea name="reason" required minLength={10} maxLength={500}/></label>
    {status.status!=="idle"&&<p role="status" className={status.status==="error"?"pa-action-error":"pa-action-success"}>{status.message}</p>}
    <p className="pa-subtle">{t(locale,"This saves immutable catalog terms. It does not charge customers or enable an unverified recurring AI payment mandate.","এটি অপরিবর্তনীয় অফার সংরক্ষণ করে। গ্রাহকের টাকা কাটে না বা অযাচাইকৃত AI recurring payment চালু করে না।")}</p>
   </div><div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={onClose}>{t(locale,"Cancel","বাতিল")}</button><button disabled={pending} type="submit" className="pa-button pa-button-primary">{pending?t(locale,"Saving…","সংরক্ষণ হচ্ছে…"):t(locale,"Save draft","ড্রাফট সংরক্ষণ")}</button></div></form>
  </div>
 </div>;
}

function OfferTransition({locale,offer}:{locale:"bn"|"en";offer:Offer}){
 const router=useRouter(),[state,action,pending]=useActionState(transitionSubscriptionOffer,idle);
 const [operation,setOperation]=useState<"publish"|"archive">("publish");
 useEffect(()=>{if(state.status==="success")router.refresh()},[router,state.status]);
 if(offer.status==="archived")return <span className="pa-subtle">{t(locale,"Archived","আর্কাইভ")}</span>;
 return <form action={action} className="pa-admin-coupon-transition">
  <input name="offer_key" type="hidden" value={offer.key}/>
  <input name="expected_current_version_id" type="hidden" value={offer.current_version_id||""}/>
  <label className="pa-sr-only" htmlFor={`pa-offer-operation-${offer.key}`}>Action</label>
  <select name="operation" id={`pa-offer-operation-${offer.key}`} value={operation} onChange={event=>setOperation(event.target.value as "publish"|"archive")}><option value="publish">Publish version</option><option value="archive">Archive offer</option></select>
  {operation==="publish"&&<><label className="pa-sr-only" htmlFor={`pa-offer-version-${offer.key}`}>Version</label><select name="version_id" id={`pa-offer-version-${offer.key}`} defaultValue={offer.versions[0]?.id||""}>{offer.versions.map(v=><option key={v.id} value={v.id}>v{v.revision} · {v.term} · ৳{formatBdtMinor(v.amount_minor)}</option>)}</select></>}
  <label className="pa-sr-only" htmlFor={`pa-offer-reason-${offer.key}`}>Audit reason</label><input id={`pa-offer-reason-${offer.key}`} name="reason" placeholder="Approval / audit reason" minLength={10} maxLength={500} required/>
  <button type="submit" className="pa-button" disabled={pending}>{t(locale,"Apply","প্রয়োগ")}</button>
  {state.status!=="idle"&&<span role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</span>}
 </form>;
}

export function AdminSubscriptionOffers({locale,offers,plans}:{locale:"bn"|"en";offers:Offer[];plans:Plan[]}){
 const [open,setOpen]=useState(false);
 return <>
  <div className="pa-page-head"><div><h1>{t(locale,"Subscription offers & prices","সাবস্ক্রিপশন অফার ও মূল্য")}</h1><p>{t(locale,"Monthly, yearly and AI + Pay combinations use immutable admin-approved price versions.","মাসিক, বার্ষিক ও AI + Pay অফারের মূল্য অ্যাডমিনের অনুমোদিত অপরিবর্তনীয় সংস্করণে থাকে।")}</p></div><button type="button" className="pa-button pa-button-primary" onClick={()=>setOpen(true)}>{t(locale,"New draft price","নতুন ড্রাফট মূল্য")}</button></div>
  <section className="pa-surface pa-description"><h2>{t(locale,"Payment release boundary","পেমেন্ট চালুর সীমা")}</h2><p className="pa-subtle">{t(locale,"Publishing a catalog offer does not enable checkout. Order confirmation, coupon application, consent receipts and verified wallet settlement must pass their separate release gates.","ক্যাটালগ অফার প্রকাশ করলেই চেকআউট চালু হয় না। অর্ডার কনফার্মেশন, কুপন, সম্মতির রসিদ এবং যাচাইকৃত পেমেন্টের আলাদা টেস্ট পাস করতে হবে।")}</p></section>
  <section className="pa-surface pa-table-card"><div className="pa-table-wrap"><table><thead><tr><th>{t(locale,"Offer","অফার")}</th><th>{t(locale,"Versions","সংস্করণ")}</th><th>{t(locale,"Published","প্রকাশিত")}</th><th>{t(locale,"Manage","পরিচালনা")}</th></tr></thead><tbody>
   {offers.map(o=><tr key={o.key}><td className="pa-primary-cell">{o.key}<small className="pa-subtle">{o.product} · {o.status}</small></td><td>{o.versions.map(v=><div key={v.id} className="pa-admin-offer-version"><span>v{v.revision} · {v.term} · ৳{formatBdtMinor(v.amount_minor)}</span><small>{v.terms.name}</small></div>)}</td><td>{o.current_version_id?`v${o.versions.find(v=>v.id===o.current_version_id)?.revision||"?"}`:"—"}</td><td><OfferTransition locale={locale} offer={o}/></td></tr>)}
   {!offers.length&&<tr><td colSpan={4} className="pa-empty-row">{t(locale,"No subscription offers configured yet. Create an approved draft.","এখনো কোনো অফার তৈরি হয়নি। অনুমোদিত ড্রাফট যোগ করুন।")}</td></tr>}
  </tbody></table></div></section>
  {open&&<Editor locale={locale} plans={plans} onClose={()=>setOpen(false)}/>} </>;
}
