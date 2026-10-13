"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import qrcode from "../lib/qr-generator.mjs";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Phone={
 id:string;name:string;created_at?:string;claimed_at?:string|null;revoked_at?:string|null;
 model?:string;app_version?:string;heartbeat_at?:string|null;permission_ok:boolean;
 backlog:number;last_queue_error:string;
};
type Props={locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean;detailId?:string};
function status(p:Phone,bn:boolean){
 if(!p.claimed_at)return bn?"পেয়ারিংয়ের অপেক্ষা":"Waiting for pairing";
 if(!p.permission_ok)return bn?"SMS অনুমতি প্রয়োজন":"SMS access required";
 if(!p.heartbeat_at||Date.now()-Date.parse(p.heartbeat_at)>20*60*1000)
  return bn?"সিঙ্ক বন্ধ / অফলাইন":"Sync delayed / offline";
 return bn?"সক্রিয়":"Online";
}
function pairingQr(token:string){
 if(!/^[A-Za-z0-9_-]{24,160}$/.test(token))return "";
 const qr=qrcode(0,"M");
 qr.addData("ekmivo://pair?token="+encodeURIComponent(token));qr.make();
 return qr.createSvgTag({cellSize:4,margin:12,scalable:true});
}

export function PaymentPhoneManagement({locale,workspaceId,environment,canManage,detailId}:Props){
 const bn=locale==="bn",t=useCallback((en:string,bg:string)=>bn?bg:en,[bn]);
 const base="/api/go/workspaces/"+workspaceId+"/phones";
 const [phones,setPhones]=useState<Phone[]>([]);
 const [selected,setSelected]=useState<string|null>(detailId||null);
 const [createOpen,setCreateOpen]=useState(false);
 const [name,setName]=useState("");
 const [token,setToken]=useState("");
 const [expiresAt,setExpiresAt]=useState(0);
 const [now,setNow]=useState(0);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const refresh=useCallback(async(silent=false,signal?:AbortSignal)=>{
  if(!silent){setLoading(true);setError("")}
  try{
   const response=await fetch(base+"?environment="+environment,{cache:"no-store",signal});
   if(!response.ok)throw Error(response.status===403?"FORBIDDEN":"SOURCE_UNAVAILABLE");
   const data=await response.json();
   if(!signal?.aborted){
    setPhones((data.items||[]).filter((p:Phone)=>!p.revoked_at&&(p.claimed_at||!p.created_at||Date.now()-Date.parse(p.created_at)<300000)));
    if(!silent)setError("");
   }
  }catch(e){if(!silent&&!signal?.aborted)setError(String(e))}
  finally{if(!silent&&!signal?.aborted)setLoading(false)}
 },[base,environment]);
 useEffect(()=>{const ctrl=new AbortController();void Promise.resolve().then(()=>{if(!ctrl.signal.aborted)void refresh(false,ctrl.signal)});return()=>ctrl.abort()},[refresh]);
 // Real-time without reloading or remounting the checkout/dashboard page.
 useEffect(()=>{
  const timer=window.setInterval(()=>{setNow(Date.now());void refresh(true)},token?2000:10000);
  return()=>window.clearInterval(timer);
 },[refresh,token]);
 const current=phones.find(p=>p.id===selected)||null;
 const paired=phones.filter(p=>!!p.claimed_at);
 const pairDone=!!token&&!!current?.claimed_at;
 const expired=!!token&&now>=expiresAt;
 const showCode=!!token&&!pairDone&&!expired&&expiresAt>0;
 useEffect(()=>{
  if((pairDone||expired)&&token){void Promise.resolve().then(()=>{setToken("");setExpiresAt(0)})}
 },[pairDone,expired,token]);
 const svg=useMemo(()=>showCode?pairingQr(token):"",[showCode,token]);
 const remaining=Math.max(0,Math.ceil((expiresAt-now)/1000));
 async function send(suffix:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(base+suffix+"?environment="+environment,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
   });
   const json=await response.json();
   if(!response.ok)throw Error(json.error?.code||json.code||String(response.status));
   await refresh(true);
   return json;
  }catch(e){setError(t("Could not complete the action: ","কাজটি করা যায়নি: ")+String(e));return null}
  finally{setBusy(false)}
 }
 async function generate(){
  if(!name.trim()||!canManage)return;
  const result=await send("",{name:name.trim()});
  if(result){
   setSelected(result.id);
   setToken(result.pairing_token||"");
   setExpiresAt(Date.parse(result.expires_at)||Date.now()+300000);
   setNow(Date.now());
   setName("");
   setCreateOpen(false);
  }
 }
 async function remove(p:Phone){
  if(!window.confirm(t("Remove this phone? Its pairing will be revoked and it can no longer send receipts.","এই ফোন সরাবেন? Pairing বাতিল হবে এবং আর রসিদ পাঠাতে পারবে না।")))return;
  const result=await send("/"+p.id+"/revoke",{});
  if(result){
   if(selected===p.id)setSelected(null);
   setToken("");setExpiresAt(0);
   setPhones(old=>old.filter(item=>item.id!==p.id));
   setNotice(t("Device removed.","ডিভাইস সরানো হয়েছে।"));
  }
 }
 async function copy(value:string){
  try{await navigator.clipboard.writeText(value);setNotice(t("Copied","কপি হয়েছে"))}
  catch{setError(t("Copy failed","কপি হয়নি"))}
 }
 return <section className="pg-phone-panel" aria-busy={busy||loading}>
  <header className="pg-phone-hero">
   <div><p className="pg-device-kicker">SMS FORWARDER · {environment.toUpperCase()}</p>
    <h2>{paired.length?t("Connected","সংযুক্ত"):t("Connect your phone","ফোন যুক্ত করুন")}</h2>
    <p>{paired.length?t("Your paired phone forwards supported provider receipts, even when no individual SIM account is assigned.","সংযুক্ত ফোন আলাদা SIM বা অ্যাকাউন্ট নির্বাচন ছাড়াই পেমেন্ট SMS পাঠাবে।"):t("Pair one phone using a code or QR scan.","কোড অথবা QR দিয়ে একবার ফোন pair করুন।")}</p>
   </div>
   {canManage&&<button type="button" onClick={()=>setCreateOpen(v=>!v)} disabled={busy}>
    {createOpen?t("Cancel","বাতিল"):t("Add phone","ফোন যোগ করুন")}
   </button>}
  </header>
  {error&&<div className="pg-phone-warning" role="alert">{error}<button onClick={()=>void refresh()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p role="status" className="pg-phone-notice">{notice}</p>}
  {loading?<p role="status">{t("Loading…","লোড হচ্ছে…")}</p>:<>
   {canManage&&(createOpen||(!paired.length&&!showCode))&&<section className="pg-phone-box">
    <h3>{t("Pair a phone","ফোন পেয়ার করুন")}</h3>
    <form className="pg-phone-inline" onSubmit={e=>{e.preventDefault();void generate()}}>
     <label>{t("Phone name","ফোনের নাম")}<input value={name} onChange={e=>setName(e.target.value)}
      placeholder={t("My Android phone","আমার Android ফোন")} maxLength={80} required/></label>
     <button type="submit" disabled={!name.trim()||busy}>{t("Generate code","কোড তৈরি করুন")}</button>
    </form>
   </section>}
   {showCode&&<section className="pg-phone-box pg-phone-pair" role="status" aria-live="polite">
    <h3>{t("Scan QR or enter code","QR স্ক্যান বা কোড দিন")}</h3>
    {svg&&<div style={{maxWidth:220,margin:"14px auto"}} aria-label={t("Pairing QR code","পেয়ারিং QR কোড")}
      dangerouslySetInnerHTML={{__html:svg}}/>}
    <code style={{overflowWrap:"anywhere"}}>{token}</code>
    <button type="button" onClick={()=>void copy(token)}>{t("Copy code","কোড কপি করুন")}</button>
    <p>{t("Expires in","মেয়াদ শেষ হবে")} {String(Math.floor(remaining/60)).padStart(2,"0")}:{String(remaining%60).padStart(2,"0")}</p>
    <small>{t("The code disappears automatically once paired or after 5 minutes.","Pair হলেই অথবা ৫ মিনিট পরে কোড স্বয়ংক্রিয়ভাবে সরে যাবে।")}</small>
   </section>}
   <div className="pg-phone-grid">
    {phones.map(p=>
     <article key={p.id} className={"pg-phone-card"+(selected===p.id?" is-selected":"")}>
      <div className="pg-phone-icon" aria-hidden="true">▣</div>
      <div className="pg-phone-card-main">
       <div className="pg-phone-title"><h3>{p.name}</h3><span className="pg-phone-state">{status(p,bn)}</span></div>
       {p.claimed_at&&<><p>{p.permission_ok?t("SMS access enabled","SMS অনুমতি চালু"):t("SMS permission not confirmed","SMS অনুমতি নিশ্চিত হয়নি")}</p>
        <small>{t("Last sync","শেষ সিঙ্ক")}: {p.heartbeat_at?new Date(p.heartbeat_at).toLocaleString(locale):"—"}</small>
        <small>{t("Pending on phone","ফোনে অপেক্ষমাণ")}: {p.backlog||0}</small>
        {p.last_queue_error&&<small role="alert">{t("Sync attention","সিঙ্কে সমস্যা")}: {p.last_queue_error}</small>}</>}
      </div>
      {canManage&&<button type="button" className="is-danger" disabled={busy}
       onClick={()=>void remove(p)}>{t("Delete","ডিলিট")}</button>}
     </article>
    )}
   </div>
   {!phones.length&&!error&&!showCode&&<p className="pg-phone-empty">{t("No phone connected yet.","এখনো কোনো ফোন যুক্ত হয়নি।")}</p>}
   {current?.claimed_at&&<section className="pg-phone-box">
    <h3>{t("Automatic SMS forwarding","স্বয়ংক্রিয় SMS ফরওয়ার্ডিং")}</h3>
    <p>{t("No SIM selector or per-device receiving-account mapping is required. Once granted SMS permission, this phone forwards supported provider receipts to the server. Only one exact payer, amount, provider and transaction-time match can verify a checkout.","কোনো SIM selector বা ডিভাইসভিত্তিক receiving number mapping লাগবে না। SMS অনুমতি থাকলে ফোন payment SMS সার্ভারে পাঠাবে। সার্ভারে একটিমাত্র sender, amount, provider ও time match হলে payment verify হবে।")}</p>
    <p>{t("Collected receipts stay encrypted while offline and automatically retry when the network returns. Open the Android app to review pending or forwarded SMS.","নেটওয়ার্ক বন্ধ থাকলে সংগ্রহ করা SMS encrypted queue-তে থাকবে। নেট ফিরলে নিজে থেকে পাঠাবে। Pending ও forwarded SMS দেখতে Android app খুলুন।")}</p>
   </section>}
  </>}
 </section>;
}
