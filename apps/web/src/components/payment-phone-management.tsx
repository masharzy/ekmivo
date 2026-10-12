"use client";
import {useCallback,useEffect,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type Phone={id:string;name:string;model?:string;app_version?:string;claimed_at?:string|null;revoked_at?:string|null;heartbeat_at?:string|null;permission_ok:boolean;backlog:number;overflow_count:number;last_queue_error:string;bindings:{id:string;account_id:string;last_receipt_at?:string|null}[]};
type Scope={locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean;detailId?:string};
function phoneState(p:Phone,bn:boolean){
 if(p.revoked_at)return bn?"বাতিল করা হয়েছে":"Revoked";
 if(!p.claimed_at)return bn?"Pair করার অপেক্ষা":"Awaiting pairing";
 if(!p.heartbeat_at)return bn?"প্রথম Sync বাকি":"Waiting for first sync";
 if(!p.permission_ok)return bn?"SMS অনুমতি প্রয়োজন":"SMS permission required";
 const minutes=(Date.now()-Date.parse(p.heartbeat_at))/60000;
 if(!Number.isFinite(minutes)||minutes>15)return bn?"Offline":"Offline";
 if(minutes>5)return bn?"Sync দেরি হচ্ছে":"Sync delayed";
 return bn?"SMS forwarding online":"SMS forwarding online";
}
export function PaymentPhoneManagement({locale,workspaceId,environment,canManage,detailId}:Scope){
 const bn=locale==="bn",t=useCallback((en:string,bg:string)=>bn?bg:en,[bn]);
 const base="/api/go/workspaces/"+workspaceId+"/phones";
 const [phones,setPhones]=useState<Phone[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[selected,setSelected]=useState<string|null>(detailId||null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[token,setToken]=useState("");
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const res=await fetch(base+"?environment="+environment,{cache:"no-store",signal});
   if(res.status===403)throw Error(t("Only an authorized payment owner/admin may view receiving numbers or manage devices.","শুধু অনুমোদিত payment owner/admin নম্বর দেখতে ও ডিভাইস পরিচালনা করতে পারেন।"));
   if(!res.ok)throw Error(t("Phone service is unavailable. Verify the dedicated financial database and server.","ফোন সার্ভিস পাওয়া যাচ্ছে না। Financial database ও server পরীক্ষা করুন।"));
   const data=await res.json();
   if(!signal?.aborted){setPhones(data.items||[]);setAccounts(data.accounts||[])}
  }catch(e){if(!signal?.aborted)setError(String(e))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,t]);
 useEffect(()=>{const ctrl=new AbortController();void Promise.resolve().then(()=>{if(!ctrl.signal.aborted)void refresh(ctrl.signal)});return()=>ctrl.abort()},[refresh]);
 async function send(path:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch(base+path+"?environment="+environment,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const out=await res.json();
   if(!res.ok)throw Error(out.error?.code||out.code||String(res.status));
   await refresh();
   setNotice(t("Saved on server.","সার্ভারে সংরক্ষিত হয়েছে।"));
   return out;
  }catch(e){setError(t("Could not save: ","সংরক্ষণ হয়নি: ")+String(e));return null}
  finally{setBusy(false)}
 }
 async function addPhone(){
  if(!name.trim())return;
  const result=await send("",{name:name.trim()});
  if(result){setSelected(result.id);setToken(result.pairing_token||"");setName("")}
 }
 const current=phones.find(p=>p.id===selected)||null;
 return <section className="pg-phone-panel" aria-busy={loading||busy}>
  <header className="pg-phone-hero"><div><p className="pg-device-kicker">{t("Payment receipts","পেমেন্ট রসিদ")} / {environment.toUpperCase()}</p><h2>{t("Connect an SMS phone","SMS ফোন সংযোগ")}</h2><p>{t("One phone, one pairing. The phone forwards relevant incoming payment SMS. Go verifies payments separately. No parser, SIM ID or account setup is needed here.","একটি ফোন একবার pair করুন। ফোন শুধু প্রাসঙ্গিক incoming payment SMS পাঠাবে। পেমেন্ট যাচাই করবে Go server। এখানে parser, SIM ID বা account setup লাগবে না।")}</p></div><button type="button" disabled={busy||loading} onClick={()=>void refresh()}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<div className="pg-phone-warning" role="alert"><strong>{t("Unable to load devices","ডিভাইস পাওয়া যায়নি")}</strong><p>{error}</p><button onClick={()=>void refresh()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p className="pg-phone-notice" role="status">{notice}</p>}
  {loading?<div className="pg-phone-placeholder" role="status">{t("Loading SMS phones…","SMS ফোন লোড হচ্ছে…")}</div>:<>
   {canManage&&<section className="pg-phone-box"><h3>{t("1. Connect your phone","১. ফোন যুক্ত করুন")}</h3><p>{t("Install the Ekmivo Android app, open the SMS collection setup from its home screen, and enter the one-time pairing code.","Ekmivo Android app-এর Home থেকে SMS collection খুলে একবারের pairing code দিন।")}</p>
     <form className="pg-phone-inline" onSubmit={e=>{e.preventDefault();void addPhone()}}><label>{t("Phone name","ফোনের নাম")}<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder={t("e.g. Shop counter phone","যেমন: দোকানের ফোন")}/></label><button type="submit" disabled={busy||!name.trim()}>{t("Generate code","কোড তৈরি করুন")}</button></form>
     {token&&<div className="pg-phone-pair" role="status"><strong>{t("One-time pairing code · valid for 5 minutes","একবারের pairing code · ৫ মিনিট মেয়াদ")}</strong><code>{token}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(token).then(()=>setNotice(t("Code copied","কোড কপি হয়েছে"))).catch(()=>setError(t("Copy failed","কপি হয়নি")))}>{t("Copy pairing code","কোড কপি করুন")}</button><p>{t("Open Ekmivo Android → SMS receipt collection → paste code → confirm → grant SMS permission. A QR scanner is not installed in this app; use the actual code flow.","Ekmivo Android → SMS receipt collection → কোড দিন → নিশ্চিত করুন → SMS অনুমতি দিন। এই অ্যাপে QR scanner নেই; আসল code flow ব্যবহার করুন।")}</p></div>}
   </section>}
   <div className="pg-phone-grid">
    {phones.map(p=><article key={p.id} className={"pg-phone-card"+(p.id===selected?" is-selected":"")}>
     <div className="pg-phone-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg></div>
     <div className="pg-phone-card-main"><div className="pg-phone-title"><h3>{p.name}</h3><span className="pg-phone-state">{phoneState(p,bn)}</span></div><p>{p.model||t("Android phone","Android ফোন")} {p.app_version?"· v"+p.app_version:""}</p><small>{t("Last sync","শেষ সিঙ্ক")}: {p.heartbeat_at?new Date(p.heartbeat_at).toLocaleString(locale):t("Not yet","এখনো নয়")}</small><small>{t("Encrypted queue on phone","ফোনে অপেক্ষমাণ রসিদ")}: {p.backlog}</small>
     <p className="pg-phone-muted">{t("SMS forwarding is not payment confirmation. Go confirms only valid unique matches.","SMS forward হলেই payment verified নয়। Go শুধু নির্ভরযোগ্য unique match যাচাই করে।")}</p></div>
     <button type="button" disabled={busy} onClick={()=>setSelected(p.id)}>{t("Details","বিস্তারিত")}</button>
    </article>)}
    {!phones.length&&!error&&<div className="pg-phone-empty"><h3>{t("No registered phones","কোনো ফোন নিবন্ধিত নেই")}</h3><p>{t("Add your first phone above. A receiving-account picker is not required.","উপরে প্রথম ফোন যুক্ত করুন। আলাদা receiving-account picker লাগবে না।")}</p></div>}
   </div>
   {current&&<section className="pg-phone-box"><div className="pg-phone-title"><div><h3>{current.name}</h3><p>{phoneState(current,bn)}</p></div><button type="button" onClick={()=>setSelected(null)}>{t("Close","বন্ধ")}</button></div>
    {current.last_queue_error&&<p className="pg-phone-warning" role="alert">{t("Device needs attention","ডিভাইসে সমস্যা")}: {current.last_queue_error}</p>}
    {current.overflow_count>0&&<p role="alert">{t("Some receipts could not be collected because the offline queue was full","Offline queue পূর্ণ থাকায় কিছু রসিদ সংগ্রহ হয়নি")}: {current.overflow_count}</p>}
    <h4>{t("Saved receiving accounts","সংরক্ষিত receiving account")}</h4>
    <p className="pg-phone-muted">{t("These numbers come directly from Payment Methods. They are not editable on the phone and are not automatically verified by SMS sender identity.","নম্বরগুলো Payment Methods থেকে এসেছে। ফোনে আবার লিখতে হবে না; SMS sender দেখে এগুলো verified ধরা হবে না।")}</p>
    <div className="pg-phone-bindings">{accounts.filter(a=>!a.Disabled).map(a=><div className="pg-phone-binding" key={a.ID}><div><strong>{a.Label||a.Method}</strong><p>{a.Number}</p><small>{t("Server verification requires an unambiguous receiving identity and a validated receipt format.","Server verification-এর জন্য নিশ্চিত receiving identity ও validated receipt format দরকার।")}</small></div><button type="button" aria-label={t("Copy receiving number","Receiving number কপি")} onClick={()=>void navigator.clipboard.writeText(a.Number).then(()=>setNotice(t("Number copied","নম্বর কপি হয়েছে"))).catch(()=>setError(t("Copy failed","কপি হয়নি")))}>{t("Copy","কপি")}</button></div>)}</div>
    {!accounts.some(a=>!a.Disabled)&&<p className="pg-phone-muted">{t("No enabled receiving account. Add one in Payment Methods.","কোনো চালু receiving account নেই। Payment Methods-এ যোগ করুন।")}</p>}
    {canManage&&!current.revoked_at&&<div className="pg-phone-actions"><button disabled={busy} onClick={()=>{const n=window.prompt(t("New phone name","ফোনের নতুন নাম"),current.name);if(n?.trim())void send("/"+current.id+"/rename",{name:n.trim()})}}>{t("Rename","নাম বদলান")}</button><button className="is-danger" disabled={busy} onClick={()=>{if(window.confirm(t("Revoke this phone? Its signing key will no longer be accepted.","এই ফোন বাতিল করবেন? এরপর server এর signature গ্রহণ করবে না।")))void send("/"+current.id+"/revoke",{})}}>{t("Revoke phone","ফোন বাতিল")}</button></div>}
   </section>}
  </>}
 </section>;
}
