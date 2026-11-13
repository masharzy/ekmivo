"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./settings-page.module.css";
import "./dashboard-reference.css";
import "./reference-adapters.css";

type Account={id:string;method:string;number_masked:string;label:string;disabled:boolean};
type Settings={revision?:number;ai_selling_enabled?:boolean;cod_enabled?:boolean;cod_charge_minor?:number;delivery_dhaka_minor?:number;delivery_outside_minor?:number;
 max_discount_pct?:number;negotiation_enabled?:boolean;draft_expiry_hours?:number;wrong_trx_limit?:number;receiving_account_ids?:string[];handover_above_minor?:number;advance_rule?:string;advance_pct?:number};
type Data={settings:Settings;accounts:Account[];accounts_available:boolean};
type Form={ai_selling_enabled:boolean;cod_enabled:boolean;cod_charge:string;dhaka:string;outside:string;negotiation_enabled:boolean;max_discount_pct:string;
 draft_expiry_hours:string;wrong_trx_limit:string;handover_above:string;accounts:string[];advance_rule:string;advance_pct:string};

const methods:Record<string,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
const taka=(minor?:number,fallback=0)=>String(Math.round((minor??fallback))/100);
const minor=(v:string)=>Math.round(Number(v||"0")*100);
function toForm(s:Settings):Form{
 return {ai_selling_enabled:!!s.ai_selling_enabled,cod_enabled:!!s.cod_enabled,cod_charge:taka(s.cod_charge_minor),dhaka:taka(s.delivery_dhaka_minor,7000),outside:taka(s.delivery_outside_minor,13000),
  negotiation_enabled:!!s.negotiation_enabled,max_discount_pct:String(s.max_discount_pct??0),draft_expiry_hours:String(s.draft_expiry_hours??24),wrong_trx_limit:String(s.wrong_trx_limit??5),
  handover_above:taka(s.handover_above_minor),accounts:s.receiving_account_ids??[],advance_rule:s.advance_rule??"none",advance_pct:String(s.advance_pct??50)};
}

export function AiSellingSettings({workspaceId,bn,environment,canManage,mode}:{workspaceId:string;bn:boolean;environment:string;canManage:boolean;mode:string}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState<Data|null>(null),[form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const lock=useRef(false);
 const endpoint=`/api/go/workspaces/${workspaceId}/ai-selling?environment=${environment==="sandbox"?"sandbox":"live"}`;
 const apply=(value:Data)=>{setData(value);setForm(toForm(value.settings??{}));};
 const read=useCallback(async(signal?:AbortSignal)=>{
  try{const r=await fetch(endpoint,{cache:"no-store",signal});if(!r.ok)throw Error(String(r.status));const v:Data=await r.json();if(!signal?.aborted){apply(v);setError("");}}
  catch(e){if(!signal?.aborted)setError(e instanceof Error&&e.message==="403"?t("Only the owner or an admin can open AI selling settings.","শুধু মালিক বা অ্যাডমিন AI বিক্রির সেটিংস খুলতে পারেন।"):t("Unable to load settings. Please retry.","সেটিংস লোড হয়নি। আবার চেষ্টা করুন।"));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[endpoint,bn]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>void read(c.signal),0);return()=>{clearTimeout(timer);c.abort();};},[read]);
 const set=<K extends keyof Form>(k:K,v:Form[K])=>{setForm(f=>f&&{...f,[k]:v});setSaved(false);};
 async function save(){
  if(!data||!form||lock.current)return;
  const nums=[form.cod_charge,form.dhaka,form.outside,form.handover_above,form.max_discount_pct,form.draft_expiry_hours,form.wrong_trx_limit];
  if(nums.some(v=>v===""||!Number.isFinite(Number(v))||Number(v)<0)){setError(t("Use numbers of zero or more.","শূন্য বা তার বেশি সংখ্যা দিন।"));return;}
  lock.current=true;setBusy(true);setError("");setSaved(false);
  const patch={ai_selling_enabled:form.ai_selling_enabled,cod_enabled:form.cod_enabled,cod_charge_minor:minor(form.cod_charge),delivery_dhaka_minor:minor(form.dhaka),
   delivery_outside_minor:minor(form.outside),negotiation_enabled:form.negotiation_enabled,max_discount_pct:Math.round(Number(form.max_discount_pct)),
   draft_expiry_hours:Math.round(Number(form.draft_expiry_hours)),wrong_trx_limit:Math.round(Number(form.wrong_trx_limit)),handover_above_minor:minor(form.handover_above),
   ...(data.settings.advance_rule!==undefined?{advance_rule:form.advance_rule,advance_pct:Math.min(99,Math.max(1,Math.round(Number(form.advance_pct)||50)))}:{}),
   ...(data.accounts_available?{receiving_account_ids:form.accounts}:{})};
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:data.settings.revision??0,patch})});
   if(!r.ok)throw Error(String(r.status));apply(await r.json());setSaved(true);
  }catch(e){const code=e instanceof Error?e.message:"";
   setError(code==="409"?t("Someone else changed these settings. Reload and check before saving.","অন্য কেউ সেটিংস বদলেছেন। রিলোড করে দেখে তারপর সংরক্ষণ করুন।")
    :code==="422"?t("Some values are out of range: discount up to 90%, draft 1–168 hours, wrong TrxID limit 1–20.","কিছু মান সীমার বাইরে: ছাড় সর্বোচ্চ ৯০%, ড্রাফট ১–১৬৮ ঘণ্টা, ভুল TrxID সীমা ১–২০।")
    :t("Save is unconfirmed. Please retry.","সংরক্ষণ নিশ্চিত হয়নি। আবার চেষ্টা করুন।"));}
  finally{setBusy(false);lock.current=false;}
 }
 const locked=!canManage||busy;
 const enabledAccounts=data?.accounts.filter(a=>!a.disabled)??[];
 return <div className="ref-dashboard"><section className={`ref-page ${styles.page}`}>
  <div className="top"><h1>{t("AI selling","AI দিয়ে বিক্রি")}</h1>
   <p>{t("Let your AI assistant show products, quote prices within your limits and take orders in chat. It never marks a payment as received on its own.","AI সহকারী চ্যাটে পণ্য দেখাবে, আপনার সীমার মধ্যে দাম বলবে আর অর্ডার নেবে। নিজে থেকে কখনো পেমেন্ট পাওয়া হয়েছে বলে ধরবে না।")}</p></div>
  {error&&<div className="notice" role="alert">{error}{" "}<button type="button" className="ib" disabled={busy} onClick={()=>void read()}>{t("Reload","রিলোড")}</button></div>}
  {saved&&<div className="notice" role="status">{t("Saved.","সংরক্ষিত হয়েছে।")}</div>}
  {!data&&!error&&<div className="notice" role="status">{t("Loading…","লোড হচ্ছে…")}</div>}
  {data&&form&&<form onSubmit={e=>{e.preventDefault();void save();}} className={styles.page}>
   <div className="card"><div className={styles.body}>
    <label className={styles.toggle}><input type="checkbox" checked={form.ai_selling_enabled} disabled={locked} onChange={e=>set("ai_selling_enabled",e.target.checked)}/>{t("AI can take orders from your catalog","AI আপনার পণ্যতালিকা থেকে অর্ডার নিতে পারবে")}</label>
    <p className={styles.hint}>{t("Needs at least one active product. Turn this off any time; ongoing chats then go back to normal replies.","কমপক্ষে একটা সক্রিয় পণ্য লাগবে। যেকোনো সময় বন্ধ করতে পারেন; তখন চ্যাট আগের মতো সাধারণ উত্তরে ফিরে যাবে।")}</p>
   </div></div>

   <div className="card"><div className={styles.body}>
    <h2>{t("Receiving numbers","টাকা নেওয়ার নম্বর")}</h2>
    {mode==="ai"
     ?<p className={styles.hint}>{t("In AI-only mode, payments the buyer reports go to your Payment review list. You confirm them yourself.","শুধু-AI মোডে ক্রেতার জানানো পেমেন্ট “পেমেন্ট যাচাই” তালিকায় যাবে। আপনি নিজে নিশ্চিত করবেন।")}</p>
     :!data.accounts_available
      ?<p className={styles.hint} role="status">{t("Receiving accounts could not be loaded right now. The saved choice is kept.","এখন টাকা নেওয়ার অ্যাকাউন্ট লোড হয়নি। আগের পছন্দ ঠিক থাকবে।")}</p>
      :enabledAccounts.length===0
       ?<p className={styles.hint}>{t("No receiving account yet. Add one in Settings → Payment methods.","এখনো কোনো অ্যাকাউন্ট নেই। সেটিংস → পেমেন্ট মাধ্যমে যোগ করুন।")}</p>
       :<>{enabledAccounts.map(a=><label key={a.id} className={styles.toggle}>
          <input type="checkbox" disabled={locked} checked={form.accounts.includes(a.id)}
           onChange={e=>set("accounts",e.target.checked?[...form.accounts,a.id]:form.accounts.filter(x=>x!==a.id))}/>
          {methods[a.method]??a.method} {a.number_masked}{a.label?` · ${a.label}`:""}</label>)}
         <p className={styles.hint}>{t("None ticked means every enabled account may be shared with buyers.","কোনোটা টিক না দিলে সব চালু অ্যাকাউন্ট ক্রেতাকে দেওয়া যাবে।")}</p></>}
   </div></div>

   <div className="card"><div className={styles.body}>
    <h2>{t("Delivery and cash on delivery","ডেলিভারি ও ক্যাশ অন ডেলিভারি")}</h2>
    <div className={styles.grid2}>
     <label className={styles.field}>{t("Delivery inside Dhaka (৳)","ঢাকার ভেতরে ডেলিভারি (৳)")}<input inputMode="decimal" value={form.dhaka} disabled={locked} onChange={e=>set("dhaka",e.target.value)}/></label>
     <label className={styles.field}>{t("Delivery outside Dhaka (৳)","ঢাকার বাইরে ডেলিভারি (৳)")}<input inputMode="decimal" value={form.outside} disabled={locked} onChange={e=>set("outside",e.target.value)}/></label>
    </div>
    <label className={styles.toggle}><input type="checkbox" checked={form.cod_enabled} disabled={locked} onChange={e=>set("cod_enabled",e.target.checked)}/>{t("Offer cash on delivery","ক্যাশ অন ডেলিভারি দেওয়া যাবে")}</label>
    {form.cod_enabled&&<label className={styles.field}>{t("COD charge (৳)","COD চার্জ (৳)")}<input inputMode="decimal" value={form.cod_charge} disabled={locked} onChange={e=>set("cod_charge",e.target.value)}/></label>}
    {form.cod_enabled&&data.settings.advance_rule!==undefined&&<label className={styles.field}>{t("Advance for cash on delivery","ক্যাশ অন ডেলিভারিতে অগ্রিম")}
     <select value={form.advance_rule} disabled={locked} onChange={e=>set("advance_rule",e.target.value)}>
      <option value="none">{t("No advance","অগ্রিম লাগবে না")}</option>
      <option value="delivery">{t("Delivery charge in advance","ডেলিভারি চার্জ অগ্রিম")}</option>
      <option value="percent">{t("A percentage in advance","নির্দিষ্ট শতাংশ অগ্রিম")}</option>
      <option value="full">{t("Full payment in advance","পুরো টাকা অগ্রিম")}</option>
     </select></label>}
    {form.cod_enabled&&data.settings.advance_rule!==undefined&&form.advance_rule==="percent"&&<label className={styles.field}>{t("Advance (%)","অগ্রিম (%)")}<input inputMode="numeric" value={form.advance_pct} disabled={locked} onChange={e=>set("advance_pct",e.target.value)}/></label>}
   </div></div>

   <div className="card"><div className={styles.body}>
    <h2>{t("Prices and discounts","দাম ও ছাড়")}</h2>
    <label className={styles.toggle}><input type="checkbox" checked={form.negotiation_enabled} disabled={locked} onChange={e=>set("negotiation_enabled",e.target.checked)}/>{t("Allow bargaining","দরদাম করা যাবে")}</label>
    <label className={styles.field}>{t("Largest discount the AI may give (%)","AI সর্বোচ্চ কত ছাড় দিতে পারবে (%)")}<input inputMode="numeric" value={form.max_discount_pct} disabled={locked} onChange={e=>set("max_discount_pct",e.target.value)}/></label>
    <p className={styles.hint}>{t("The AI never goes below a product's minimum price, whatever this says.","এখানে যা-ই থাকুক, AI কখনো পণ্যের সর্বনিম্ন দামের নিচে যাবে না।")}</p>
   </div></div>

   <div className="card"><div className={styles.body}>
    <h2>{t("Limits","সীমা")}</h2>
    <div className={styles.grid2}>
     <label className={styles.field}>{t("Unpaid order is released after (hours)","অপরিশোধিত অর্ডার কত ঘণ্টা পর ছেড়ে দেবে")}<input inputMode="numeric" value={form.draft_expiry_hours} disabled={locked} onChange={e=>set("draft_expiry_hours",e.target.value)}/></label>
     <label className={styles.field}>{t("Wrong TrxIDs before a person takes over","কতবার ভুল TrxID দিলে মানুষ দেখবে")}<input inputMode="numeric" value={form.wrong_trx_limit} disabled={locked} onChange={e=>set("wrong_trx_limit",e.target.value)}/></label>
    </div>
    <label className={styles.field}>{t("Hand orders above this total to a person (৳, 0 = never)","এর বেশি টাকার অর্ডার মানুষের কাছে দেবে (৳, ০ = কখনো না)")}<input inputMode="decimal" value={form.handover_above} disabled={locked} onChange={e=>set("handover_above",e.target.value)}/></label>
   </div></div>

   <div className={styles.foot}>{canManage
    ?<button type="submit" className="ib pri" disabled={busy}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save","সংরক্ষণ")}</button>
    :<span className={styles.hint}>{t("Only the owner or an admin can change these.","শুধু মালিক বা অ্যাডমিন এগুলো বদলাতে পারেন।")}</span>}</div>
  </form>}
 </section></div>;
}
