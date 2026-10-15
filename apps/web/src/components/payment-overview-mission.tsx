"use client";
import Link from "next/link";
import {DashboardIcon} from "./dashboard-icon";
import {useCallback,useEffect,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Read<T>={value:T|null;error:string|null};
type Phone={claimed_at?:string|null;revoked_at?:string|null;permission_ok?:boolean;heartbeat_at?:string|null};
type Account={ID?:string;Disabled?:boolean;id?:string;disabled_at?:string|null};
type Billing={subscription?:{state?:string;paid_until?:string;grace_until?:string}|null};
type Settings={body?:{name?:string;support_email?:string;timezone?:string}};
type ReceiptDay={date:string;verified_minor:number};
type Overview={verified_minor:number;pending_requests:number;unmatched_receipts:number;failed_deliveries:number;daily_volume:ReceiptDay[]};
type Payment={id:string;merchant_reference:string;verified_amount_minor:number;verified_at:string;method?:string;webhook_status?:string};
type LinkRow={id:string;status:string};
type Intent={id:string;state:string};
type Refund={id:string;status:string};
type Page<T>={items:T[];next_cursor?:string|null};
type Snapshot={
 billing:Read<Billing>;settings:Read<Settings>;
 phones:Read<{items:Phone[];accounts:Account[]}>;
 gateways:Read<Page<Account>>;
 links:Read<Page<LinkRow>>;
 intents:Read<{data:Intent[]}>;
 overview:Read<Page<Overview>>;
 payments:Read<Page<Payment>>;
 refunds:Read<Page<Refund>>;
};
type StepKey="plan"|"profile"|"account"|"phone"|"entry"|"verify";
type Step={id:StepKey;en:string;bn:string;detailEn:string;detailBn:string;target:string;icon:string;ok:boolean|null};
const blank=<T,>():Read<T>=>({value:null,error:null});
function object(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value)}
function loaded<T>(value:Read<T>):value is {value:T;error:null}{return value.value!==null}
function amount(minor:number,locale:Locale){
 return new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(minor/100);
}
function isValidPayment(item:unknown):item is Payment{
 return object(item)&&typeof item.id==="string"&&typeof item.merchant_reference==="string"&&typeof item.verified_amount_minor==="number"&&typeof item.verified_at==="string";
}
async function read<T>(path:string,signal:AbortSignal):Promise<Read<T>>{
 try{
  const response=await fetch(path,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error(String(response.status));
  const data:unknown=await response.json();
  if(!object(data))throw Error("INVALID_DATA");
  return {value:data as T,error:null};
 }catch(error){
  return {value:null,error:signal.aborted?"ABORTED":error instanceof Error?error.message:"UNAVAILABLE"};
 }
}
export function PaymentOverviewMission({locale,workspaceId,environment,canManage}:{locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean}){
 const bn=locale==="bn";
 const t=(en:string,bnText:string)=>bn?bnText:en;
 const root="/w/"+workspaceId+"/payments/";
 const go=(section:string)=>root+section;
 const api="/api/go/workspaces/"+workspaceId;
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [refresh,setRefresh]=useState(0);
 const [focused,setFocused]=useState<StepKey|null>(null);
 const [showSteps,setShowSteps]=useState(false);
 const [now,setNow]=useState(0);
 const update=useCallback(()=>setRefresh(n=>n+1),[]);
 useEffect(()=>{
  const abort=new AbortController();
  void Promise.resolve().then(()=>{if(!abort.signal.aborted)setLoading(true)});
  const qs="?environment="+encodeURIComponent(environment);
  const load=async()=>{
   const [billing,settings,phones,gateways,links,intents,overview,payments,refunds]=await Promise.all([
    read<Billing>(api+"/billing",abort.signal),
    read<Settings>(api+"/workspace-tools/settings"+qs,abort.signal),
    read<{items:Phone[];accounts:Account[]}>(api+"/phones"+qs,abort.signal),
    read<Page<Account>>(api+"/operations/gateways"+qs,abort.signal),
    read<Page<LinkRow>>(api+"/documents/payment-links"+qs,abort.signal),
    read<{data:Intent[]}>(api+"/payment-intents"+qs,abort.signal),
    read<Page<Overview>>(api+"/operations/overview"+qs,abort.signal),
    read<Page<Payment>>(api+"/operations/payments"+qs,abort.signal),
    read<Page<Refund>>(api+"/refunds"+qs,abort.signal)
   ]);
   if(abort.signal.aborted)return;
   setSnapshot({billing,settings,phones,gateways,links,intents,overview,payments,refunds});
   setNow(Date.now());
   setLoading(false);
  };
  void load();
  return()=>abort.abort();
 },[api,environment,refresh]);
 useEffect(()=>{
  const refreshOnFocus=()=>{if(document.visibilityState==="visible")update()};
  window.addEventListener("focus",refreshOnFocus);
  return()=>window.removeEventListener("focus",refreshOnFocus);
 },[update]);

 const b=snapshot?.billing??blank<Billing>();
 const setting=snapshot?.settings??blank<Settings>();
 const phone=snapshot?.phones??blank<{items:Phone[];accounts:Account[]}>();
 const gateway=snapshot?.gateways??blank<Page<Account>>();
 const links=snapshot?.links??blank<Page<LinkRow>>();
 const intents=snapshot?.intents??blank<{data:Intent[]}>();
 const summary=snapshot?.overview??blank<Page<Overview>>();
 const payments=snapshot?.payments??blank<Page<Payment>>();
 const refunds=snapshot?.refunds??blank<Page<Refund>>();
 const sub=loaded(b)?b.value.subscription:null;
 const planOk=loaded(b)?sub?.state==="active"||sub?.state==="grace":null;
 const business=loaded(setting)?setting.value.body:null;
 const profileOk=loaded(setting)?Boolean(business&&business.name?.trim()&&business.support_email?.trim()):null;
 const phoneItems=loaded(phone)&&Array.isArray(phone.value.items)?phone.value.items:null;
 const configured=loaded(phone)&&Array.isArray(phone.value.accounts)?phone.value.accounts:null;
 const fallback=loaded(gateway)&&Array.isArray(gateway.value.items)?gateway.value.items:null;
 const accountOk=configured?configured.some(a=>Boolean(a.ID||a.id)&&!a.Disabled):fallback?fallback.some(a=>Boolean(a.id||a.ID)&&!a.disabled_at&&!a.Disabled):null;
 // One successful heartbeat completes the initial setup milestone.
 // Going temporarily offline must not erase onboarding history.
 const phoneOk=phoneItems?phoneItems.some(p=>Boolean(p.claimed_at&&!p.revoked_at&&p.heartbeat_at&&p.permission_ok)):null;
 const online=phoneItems?phoneItems.filter(p=>p.claimed_at&&!p.revoked_at&&p.permission_ok&&p.heartbeat_at&&now-Date.parse(p.heartbeat_at)<20*60*1000).length:null;
 const existingLinks=loaded(links)&&Array.isArray(links.value.items)?links.value.items:null;
 const existingIntents=loaded(intents)&&Array.isArray(intents.value.data)?intents.value.data:null;
 const hasEntry=existingLinks?.some(a=>["active","published","issued"].includes(a.status))||existingIntents?.some(a=>Boolean(a.id));
 const entryOk=existingLinks||existingIntents?Boolean(hasEntry):null;
 const verified=loaded(payments)&&Array.isArray(payments.value.items)?payments.value.items.filter(isValidPayment):null;
 const verifyOk=verified?verified.length>0:null;
 const tasks:Step[]=[
  {id:"plan",en:"Activate a plan",bn:"প্ল্যান সক্রিয় করুন",detailEn:"Choose and pay from Billing",detailBn:"Billing-এ গিয়ে প্ল্যান কিনুন",target:"billing",icon:"credit-card",ok:planOk},
  {id:"profile",en:"Business profile",bn:"ব্যবসার প্রোফাইল",detailEn:"Business name and support contact",detailBn:"নাম ও যোগাযোগের তথ্য",target:"settings",icon:"store",ok:profileOk},
  {id:"account",en:"Receiving account",bn:"টাকা গ্রহণের অ্যাকাউন্ট",detailEn:"Add an enabled payment account",detailBn:"সক্রিয় bKash/Nagad/Rocket অ্যাকাউন্ট",target:"gateways",icon:"wallet",ok:accountOk},
  {id:"phone",en:"SMS Forwarder",bn:"SMS Forwarder",detailEn:"Pair phone and complete first sync",detailBn:"ফোন pair করে প্রথম sync করুন",target:"devices",icon:"smartphone",ok:phoneOk},
  {id:"entry",en:"First payment entry",bn:"প্রথম Payment Link/Request",detailEn:"Publish a link or issue a request",detailBn:"একটি Link publish বা Request তৈরি করুন",target:"payment-links",icon:"link-2",ok:entryOk},
  {id:"verify",en:"First verified payment",bn:"প্রথম verified payment",detailEn:"Confirmed by the real payment backend",detailBn:"সার্ভারে যাচাইকৃত প্রথম পেমেন্ট",target:"requests",icon:"shield-check",ok:verifyOk}
 ];
 const completed=tasks.filter(s=>s.ok===true).length;
 const unknown=tasks.some(s=>s.ok===null);
 const ready=completed===tasks.length;
 // Existing merchants retain access to financial records even if a plan expires
 // or the handset goes offline. Setup and accounting visibility are independent.
 const operational=ready||verifyOk===true;
 const chosen=tasks.find(s=>s.id===focused)||tasks.find(s=>s.ok!==true)||tasks[0];
 const raw=loaded(summary)&&Array.isArray(summary.value.items)?summary.value.items[0]:undefined;
 const overview=raw&&typeof raw.verified_minor==="number"&&Array.isArray(raw.daily_volume)?raw:null;
 const recent=verified?.slice(0,4)??[];
 const refundItems=loaded(refunds)&&Array.isArray(refunds.value.items)?refunds.value.items:null;
 const pendingRefunds=refundItems?refundItems.filter(r=>["requested","reviewing","approved"].includes(r.status)).length:null;
 const pendingRefundsLabel=pendingRefunds===null?"—":new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(pendingRefunds)+(refunds.value?.next_cursor?"+":"");
 const count=(value:number|null|undefined)=>typeof value==="number"&&Number.isFinite(value)?new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(value):"—";
 const moneyOrDash=(value:number|null|undefined)=>typeof value==="number"&&Number.isFinite(value)?amount(value,locale):"—";
 const incompleteSource=unknown||!overview||verified===null||refundItems===null;
 return <div className="em-overview" aria-busy={loading}>
  <header className="em-heading">
   <div className="em-heading-copy">
    <div className="em-heading-title"><h1>{t("Overview","সারসংক্ষেপ")}</h1></div>
    <p>{operational?t("Your payment operations, without the clutter.","পেমেন্টের গুরুত্বপূর্ণ সব তথ্য এক জায়গায়।"):t("A clear view of your payments.","আপনার পেমেন্ট, সংযোগ ও প্রয়োজনীয় কাজ এক নজরে।")}</p>
   </div>
   <div className="em-actions"><Link className="em-primary" href={go("payment-links")}>{t("Create payment link","পেমেন্ট লিংক তৈরি")} <span aria-hidden="true">+</span></Link><button type="button" onClick={update} disabled={loading}>{t("Refresh","আপডেট")}</button></div>
  </header>
  {loading&&!snapshot?<section className="em-panel em-loading" role="status"><span className="em-shimmer"/><span className="em-shimmer"/><span className="em-shimmer"/>{t("Checking setup and payments…","সেটআপ ও পেমেন্ট যাচাই হচ্ছে…")}</section>:null}
  {snapshot&&!operational&&showSteps&&<div className="em-activation">
   <section className="em-launch">
    <div className="em-launch-copy"><span className="em-eyebrow">{t("ACTIVATION HUB","শুরু করার কেন্দ্র")}</span><h2>{completed===0?t("Let's get your business ready","পেমেন্ট গ্রহণের প্রস্তুতি নিন"):t("Your workspace is taking shape","আপনার ওয়ার্কস্পেস এগিয়ে যাচ্ছে")}</h2>
     <p>{t("Complete each milestone to activate your operational overview. No manual checkmarks.","প্রতিটি ধাপ সার্ভার থেকে যাচাই হয়ে সম্পূর্ণ হবে। টিক ম্যানুয়ালি দেওয়া যাবে না।")}</p>
    </div>
    <div className="em-progress" role="progressbar" aria-label={t("Setup progress","সেটআপ অগ্রগতি")} aria-valuemin={0} aria-valuemax={6} aria-valuenow={completed}>
     <svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="44" fill="none" stroke="currentColor" opacity=".13" strokeWidth="8"/><circle cx="55" cy="55" r="44" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={String(completed/6*276.5)+" 276.5"} transform="rotate(-90 55 55)"/><text x="55" y="54" textAnchor="middle" fontSize="24" fontWeight="700" fill="currentColor">{Math.round(completed/6*100)}%</text><text x="55" y="71" textAnchor="middle" fontSize="10" fill="currentColor">{completed}/6</text></svg>
    </div>
   </section>
   {unknown&&<p className="em-source-warning" role="status">{t("Some setup sources could not be checked. Unavailable is not incomplete; refresh to try again.","কিছু সেটআপ তথ্য পাওয়া যায়নি। সার্ভার unavailable মানেই ধাপ অসম্পূর্ণ নয়—আবার Refresh করুন।")}</p>}
   <div className="em-section-label"><h2>{t("Activation hub","শুরু করার ধাপ")}</h2><span>{count(completed)}/6 {t("completed","সম্পূর্ণ")}</span></div>
   <div className="em-task-grid">
    {tasks.map((step,i)=><button key={step.id} type="button" className={"em-task"+(chosen.id===step.id?" is-focused":"")} onClick={()=>setFocused(step.id)} aria-pressed={chosen.id===step.id}>
     <span className="em-task-index"><DashboardIcon name={step.target} width={17} height={17}/>{String(i+1).padStart(2,"0")}</span><span className={"em-task-status "+(step.ok===true?"is-done":"")} aria-label={step.ok===true?t("Completed","সম্পূর্ণ"):step.ok===false?t("To do","বাকি"):t("Could not check","যাচাই করা যায়নি")}>{step.ok===true?"✓":step.ok===false?"○":"—"}</span>
     <strong>{t(step.en,step.bn)}</strong><small>{t(step.detailEn,step.detailBn)}</small>
    </button>)}
   </div>
   <section className="em-next-panel" aria-label={t("Selected setup action","সেটআপের নির্বাচিত কাজ")}>
    <div><span className="em-eyebrow">{chosen.ok===true?t("COMPLETED","সম্পূর্ণ"):chosen.ok===null?t("CHECK UNAVAILABLE","যাচাই করা যায়নি"):t("NEXT ACTION","পরবর্তী কাজ")}</span><h3>{t(chosen.en,chosen.bn)}</h3>
     <p>{chosen.id==="plan"?(canManage?t("Plans and pricing are managed on the Billing page; no plan selection here.","সব প্ল্যান, মূল্য ও কেনার ব্যবস্থা Billing পেজে থাকবে—Overview-তে নয়।"):t("Ask your workspace owner or admin to activate a plan from Billing.","প্ল্যান কিনতে ও সক্রিয় করতে owner বা admin-এর সহায়তা প্রয়োজন।")):t(chosen.detailEn,chosen.detailBn)}</p></div>
    <Link className="em-primary" href={go(chosen.target)}>{chosen.id==="plan"?t("Go to Billing","Billing-এ যান"):chosen.ok===true?t("View details","বিস্তারিত দেখুন"):t("Open setup","সেটআপ খুলুন")} <span aria-hidden="true">↗</span></Link>
   </section>
   <div className="em-activation-foot">
    <span>{t("Progress updates from actual account, phone and payment records.","অ্যাকাউন্ট, ফোন ও পেমেন্টের প্রকৃত তথ্য অনুযায়ী অগ্রগতি বদলাবে।")}</span>
    <Link href={go("help")}>{t("Need help?","সহায়তা প্রয়োজন?")} ↗</Link>
   </div>
  </div>}
  {snapshot&&<div className="em-live">
   <div className="em-live-strip"><div><span className="em-live-mark">✓</span><span>{ready?t("Workspace configured","ওয়ার্কস্পেস প্রস্তুত"):t("Payment activity available","পেমেন্ট কার্যক্রম পাওয়া যাচ্ছে")}</span>{!ready&&<span className="em-muted">{t("Some setup checks remain","কিছু সেটআপ ধাপ বাকি")}</span>}</div><button type="button" onClick={()=>setShowSteps(v=>!v)} aria-expanded={showSteps}>{showSteps?t("Hide setup","সেটআপ বন্ধ"):t("Setup details","সেটআপ দেখুন")}</button></div>
   {showSteps&&<div className="em-completed-steps">{tasks.map(step=><Link key={step.id} href={go(step.target)}><span aria-hidden="true">{step.ok===true?"✓":step.ok===false?"○":"—"}</span>{t(step.en,step.bn)}</Link>)}</div>}
   {incompleteSource&&<p className="em-source-warning" role="status">{t("Some figures are unavailable. A dash means no verified source, not zero.","কিছু তথ্য পাওয়া যাচ্ছে না। ড্যাশ (—) মানে অজানা, শূন্য নয়।")}</p>}
   <div className="em-kpis">
    <Link href={go("transactions")} className="em-kpi"><span>{t("Verified volume","যাচাইকৃত পেমেন্ট")}</span><strong>{moneyOrDash(overview?.verified_minor)}</strong><small>{t("Server-verified · not settlement","সার্ভারে যাচাইকৃত · settlement নয়")}</small></Link>
    <Link href={go("transactions")} className="em-kpi"><span>{t("Verified payments","যাচাইকৃত পেমেন্ট")}</span><strong>{verified===null?"—":count(verified.length)+(payments.value?.next_cursor?"+":"")}</strong><small>{t("Recent records, not lifetime total","সাম্প্রতিক রেকর্ড, মোট সংখ্যা নয়")}</small></Link>
    <Link href={go("payment-links") } className="em-kpi"><span>{t("Pending","অপেক্ষমাণ")}</span><strong>{count(overview?.pending_requests)}</strong><small>{t("Awaiting payer or verification","গ্রাহক বা যাচাইয়ের অপেক্ষায়")}</small></Link>
    <Link href={go("incoming")} className="em-kpi"><span>{t("Needs review","পর্যালোচনা প্রয়োজন")}</span><strong>{count(overview?.unmatched_receipts)}</strong><small>{t("Needs review","যাচাই করা প্রয়োজন")}</small></Link>
   </div>
   <div className="em-main-grid">
    <section className="em-panel em-volume">
     <div className="em-panel-top"><h2>{t("Volume","লেনদেনের পরিমাণ")}</h2><span>{t("Last 7 days","শেষ ৭ দিন")}</span></div>
     <PaymentVolumeChart data={overview?.daily_volume??[]} locale={locale}/>
    </section>
    <section className="em-panel em-attention">
     <div className="em-panel-top"><h2>{t("Action center","জরুরি কাজ")}</h2><span>{t("Live issues","সক্রিয় সমস্যা")}</span></div>
     <Link href={go("refunds")}><span>{t("Refund requests","রিফান্ড অনুরোধ")}</span><strong>{pendingRefundsLabel}</strong></Link>
     <Link href={go("developers")}><span>{t("Failed payment alerts","ব্যর্থ পেমেন্ট নোটিফিকেশন")}</span><strong>{count(overview?.failed_deliveries)}</strong></Link>
     <Link href={go("incoming")}><span>{t("Needs review","পর্যালোচনা প্রয়োজন")}</span><strong>{count(overview?.unmatched_receipts)}</strong></Link>
    </section>
    {(online===0||accountOk===false)&&<section className="em-panel em-connections">
     <div className="em-panel-top"><h2>{t("Connections","সংযুক্ত সেবা")}</h2><Link href={go("devices")}>{t("Devices","ডিভাইস")} ↗</Link></div>
     <div><span>{t("Online phones","সক্রিয় ফোন")}</span><strong>{count(online)}</strong></div>
     <div><span>{t("Receiving accounts","টাকা গ্রহণের অ্যাকাউন্ট")}</span><strong>{configured?count(configured.filter(a=>!a.Disabled).length):fallback?count(fallback.filter(a=>!a.disabled_at&&!a.Disabled).length):"—"}</strong></div>
     <div><span>{t("Active payment links","সক্রিয় পেমেন্ট লিংক")}</span><strong>{existingLinks?count(existingLinks.filter(a=>a.status==="active").length)+(links.value?.next_cursor?"+":""):"—"}</strong></div>
    </section>}
   </div>
   <div className="em-bottom-grid">
    <section className="em-panel em-recent"><div className="em-panel-top"><h2>{t("Recent payments","সাম্প্রতিক পেমেন্ট")}</h2><Link href={go("transactions")}>{t("View all","সব দেখুন")} ↗</Link></div>
     {verified===null?<p className="em-inline-empty">{t("Transaction source unavailable","লেনদেনের তথ্য পাওয়া যাচ্ছে না")}</p>:recent.length===0?<p className="em-inline-empty">{t("No verified payments yet","এখনো যাচাইকৃত পেমেন্ট নেই")}</p>:
      <div className="em-transaction-list">{recent.map(row=><Link href={go("transactions/"+row.id)} key={row.id} className="em-transaction"><span className="em-transaction-id">{row.merchant_reference}</span><strong>{moneyOrDash(row.verified_amount_minor)}</strong><time>{Number.isNaN(Date.parse(row.verified_at))?"—":new Intl.DateTimeFormat(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"short",timeStyle:"short"}).format(new Date(row.verified_at))}</time></Link>)}</div>}
    </section>
    <section className="em-panel em-shortcuts"><div className="em-panel-top"><h2>{t("Quick actions","দ্রুত কাজ")}</h2></div>
     <Link href={go("payment-links")}>{t("Create payment link","পেমেন্ট লিংক তৈরি")} <span>↗</span></Link>
      <Link href={go("reports")}>{t("View reports","রিপোর্ট দেখুন")} <span>↗</span></Link>
    </section>
   </div>
  </div>}
 </div>;
}

function PaymentVolumeChart({data,locale}:{data:ReceiptDay[];locale:Locale}){
 const [hover,setHover]=useState<number|null>(null);
 const bn=locale==="bn";
 const number=new Intl.NumberFormat(bn?"bn-BD":"en-BD",{maximumFractionDigits:0});
 const currency=(minor:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(minor/100);
 const days=data.filter(row=>row&&typeof row.date==="string"&&typeof row.verified_minor==="number"&&Number.isFinite(row.verified_minor)).slice(-7);
 const hasValue=days.some(row=>row.verified_minor>0);
 if(!days.length||!hasValue)return <div className="ekv2-chart-empty">{bn?"এই সময়ে কোনো পেমেন্ট নেই":"No payments in this period"}</div>;
 const max=Math.max(...days.map(row=>row.verified_minor),100);
 const step=Math.pow(10,Math.floor(Math.log10(max/4||1)));
 const increment=Math.ceil(max/4/step)*step;
 const top=Math.max(increment*4,max),w=610,h=210,left=50,right=8,bottom=32,plotH=h-bottom-16,plotW=w-left-right;
 const ticks=[0,1,2,3,4].map(i=>Math.round(i*top/4));
 const slot=plotW/days.length,barWidth=Math.min(42,slot*.53);
 const label=(date:string)=>{const parsed=new Date(date+"T12:00:00Z");return Number.isNaN(parsed.getTime())?date.slice(-5):new Intl.DateTimeFormat(bn?"bn-BD":"en-BD",{month:"short",day:"numeric",timeZone:"UTC"}).format(parsed)};
 const short=(minor:number)=>{const value=minor/100;return number.format(value>=1000000?value/1000000:value>=1000?value/1000:value)+(value>=1000000?"M":value>=1000?"K":"")};
 return <div className="ekv2-chart">
  <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={bn?"সাম্প্রতিক পেমেন্টের বার চার্ট":"Payment volume by day"}>
   {ticks.map(tick=>{const y=16+plotH*(1-tick/top);return <g key={tick}><line x1={left} x2={w-right} y1={y} y2={y} stroke="var(--color-border)" strokeDasharray="3 5"/><text x={left-8} y={y+4} textAnchor="end" fill="var(--color-text-muted)" fontSize="11">{short(tick)}</text></g>})}
   {days.map((day,index)=>{const value=Math.max(0,day.verified_minor),barHeight=value/top*plotH,x=left+index*slot+(slot-barWidth)/2,y=16+plotH-barHeight;return <g key={day.date}>
    <rect tabIndex={0} aria-label={`${label(day.date)}: ${currency(value)}`} x={x} y={y} width={barWidth} height={Math.max(1,barHeight)} rx="4" fill="var(--color-primary)" onMouseEnter={()=>setHover(index)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(index)} onBlur={()=>setHover(null)}/>
    <text x={left+index*slot+slot/2} y={h-7} textAnchor="middle" fill="var(--color-text-muted)" fontSize="11">{label(day.date)}</text>
   </g>})}
  </svg>
  {hover!==null&&days[hover]&&<div className="ekv2-chart-tip" role="status">{label(days[hover].date)} · {currency(days[hover].verified_minor)}</div>}
 </div>;
}
