"use client";
import {useCallback,useEffect,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type Account={ID:string;Method:string;Number:string;Label:string;Disabled:boolean};
type Binding={id:string;account_id:string;source:string;binding:string;parser_id:string;last_receipt_at?:string|null};
type Phone={id:string;name:string;model?:string;app_version?:string;claimed_at?:string|null;revoked_at?:string|null;heartbeat_at?:string|null;permission_ok:boolean;backlog:number;overflow_count:number;last_queue_error:string;bindings:Binding[]};
type Parser={id:string;source:string;method:string};
type Scope={locale:Locale;workspaceId:string;environment:PaymentEnvironment;canManage:boolean;detailId?:string};
const age=(raw?:string|null)=>raw?Math.round((Date.now()-Date.parse(raw))/60000):Infinity;
function health(p:Phone,bn:boolean){
 if(p.revoked_at)return bn?"বাতিল":"Revoked";
 if(!p.claimed_at)return bn?"Pairing বাকি":"Awaiting pairing";
 if(!p.permission_ok)return bn?"Permission প্রয়োজন":"Permission required";
 if(age(p.heartbeat_at)>15)return bn?"Offline":"Offline";
 if(age(p.heartbeat_at)>5)return bn?"Sync delayed":"Sync delayed";
 return bn?"Online":"Online";
}
export function PaymentPhoneManagement({locale,workspaceId,environment,canManage,detailId}:Scope){
 const bn=locale==="bn",t=(a:string,b:string)=>bn?b:a;
 const base="/api/go/workspaces/"+workspaceId+"/phones",op="/api/go/workspaces/"+workspaceId+"/operations/parsers?environment="+environment;
 const [phones,setPhones]=useState<Phone[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[parsers,setParsers]=useState<Parser[]>([]);
 const [selected,setSelected]=useState<string|null>(detailId||null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [name,setName]=useState(""),[token,setToken]=useState(""),[chosen,setChosen]=useState<string[]>([]);
 const [routes,setRoutes]=useState<Record<string,{parser_id:string;binding:string}>>({});
 const [pairStep,setPairStep]=useState(false);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const responses=await Promise.all([fetch(base+"?environment="+environment,{cache:"no-store",signal}),
    fetch(op,{cache:"no-store",signal})]);
   if(responses.some(r=>!r.ok))throw Error(t("Device source is not configured. Set up the financial database and approved parsers, then retry.","ডিভাইসের উৎস প্রস্তুত নয়। Financial database ও approved parser সেটআপ করে আবার চেষ্টা করুন।"));
   const [data,approved]=await Promise.all(responses.map(r=>r.json()));
   if(!signal?.aborted){setPhones(data.items||[]);setAccounts(data.accounts||[]);setParsers(approved.items||[])}
  }catch(e){if(!signal?.aborted)setError(String(e))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,environment,op,bn]);
 useEffect(()=>{const c=new AbortController();void refresh(c.signal);return()=>c.abort()},[refresh]);
 async function command(path:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(base+path+"?environment="+environment,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const data=await response.json();
   if(!response.ok)throw Error(data.error?.code||data.code||String(response.status));
   await refresh();setNotice(t("Saved on server. New or changed sources require confirmation in the Android app.","সার্ভারে সংরক্ষিত। নতুন উৎস Android app-এ নিশ্চিত করতে হবে।"));
   return data;
  }catch(e){setError(t("Not saved: ","সংরক্ষণ হয়নি: ")+String(e));return null}
  finally{setBusy(false)}
 }
 async function createPhone(){
  if(!name.trim())return;
  const data=await command("",{name:name.trim()});
  if(data){setToken(data.pairing_token||"");setSelected(data.id);setPairStep(true);setName("")}
 }
 async function attachMany(phoneId:string){
  if(!chosen.length)return;
  for(const id of chosen){
   const entry=routes[id],parser=parsers.find(p=>p.id===entry?.parser_id);
   if(!parser||!entry?.binding){setError(t("Choose an approved source and exact SIM/package for each account.","প্রতি অ্যাকাউন্টের জন্য approved source এবং সঠিক SIM/package বেছে নিন।"));return}
   const duplicate=(phones.find(p=>p.id===phoneId)?.bindings||[]).some(b=>b.source===parser.source&&b.binding===entry.binding&&b.account_id!==id);
   if(duplicate){setError(t("This source/SIM already maps to a different account. Fix the mapping first.","এই source/SIM অন্য অ্যাকাউন্টের সঙ্গে যুক্ত। আগে mapping ঠিক করুন।"));return}
  }
  for(const id of chosen){
   const entry=routes[id],parser=parsers.find(p=>p.id===entry.parser_id)!;
   const result=await command("/"+phoneId+"/attach",{account_id:id,source:parser.source,parser_id:parser.id,binding:entry.binding,name:accounts.find(a=>a.ID===id)?.Label||parser.method});
   if(!result)return;
  }
  setChosen([]);
 }
 const current=phones.find(p=>p.id===selected)||null;
 const permitted=(account:Account)=>!account.Disabled;
 return <section className="pg-phone-panel" aria-busy={loading||busy}>
  <div className="pg-phone-hero"><div><p className="pg-device-kicker">{t("Receiving & verification","টাকা গ্রহণ ও যাচাই")} / {environment.toUpperCase()}</p><h2>{t("SMS devices","SMS ডিভাইস")}</h2><p>{t("Pair each physical phone once. Link as many approved receiving accounts as its SIMs and notification sources can safely identify.","একটি ফোন একবার pair করুন। ফোনের SIM ও অনুমোদিত notification source অনুযায়ী একাধিক receiving account যুক্ত করুন।")}</p></div><button type="button" onClick={()=>void refresh()} disabled={busy||loading}>{t("Refresh","Refresh")}</button></div>
  {error&&<div role="alert" className="pg-phone-warning"><strong>{t("Source unavailable or action failed","উৎস পাওয়া যাচ্ছে না অথবা কাজ ব্যর্থ")}</strong><p>{error}</p><button onClick={()=>void refresh()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p role="status" className="pg-phone-notice">{notice}</p>}
  {loading?<div role="status" className="pg-phone-placeholder">{t("Loading registered phones…","ফোনের তালিকা লোড হচ্ছে…")}</div>:<>
   <div className="pg-phone-grid">
    {phones.map(p=><article key={p.id} className={"pg-phone-card"+(p.id===selected?" is-selected":"")}>
     <div className="pg-phone-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg></div>
     <div className="pg-phone-card-main"><div className="pg-phone-title"><h3>{p.name}</h3><span className="pg-phone-state">{health(p,bn)}</span></div><p>{p.model||t("Android phone","Android ফোন")} {p.app_version?"· v"+p.app_version:""}</p><div className="pg-phone-chips">{p.bindings.map(b=>{const a=accounts.find(x=>x.ID===b.account_id);return <span key={b.id}>{a?.Method||"Account"} · {a?.Number||"—"}</span>})}</div><small>{t("Last sync","শেষ সিঙ্ক")}: {p.heartbeat_at?new Date(p.heartbeat_at).toLocaleString(locale):t("Never","এখনো নয়")} · {t("Queued","অপেক্ষমাণ")}: {p.backlog}</small></div>
     <button type="button" disabled={busy} onClick={()=>setSelected(p.id)}>{t("Manage","Manage")}</button>
    </article>)}
    {phones.length===0&&!error&&<div className="pg-phone-empty"><h3>{t("No phone connected yet","এখনো কোনো ফোন যুক্ত হয়নি")}</h3><p>{t("Register your phone once. You can link several receiving accounts afterward.","একবার ফোন নিবন্ধন করেই পরে একাধিক receiving account যুক্ত করতে পারবেন।")}</p></div>}
   </div>
   {canManage&&<section className="pg-phone-box"><h3>{t("Connect a phone","নতুন ফোন যুক্ত করুন")}</h3><ol className="pg-phone-steps"><li>{t("Give the physical phone a name","ফোনের নাম দিন")}</li><li>{t("Enter the one-use code inside the Ekmivo Android app","Ekmivo Android app-এ একবারের কোড দিন")}</li><li>{t("Select accounts and approved sources below","নিচে account ও অনুমোদিত source নির্বাচন করুন")}</li></ol><form onSubmit={e=>{e.preventDefault();void createPhone()}} className="pg-phone-inline"><label>{t("Phone name","ফোনের নাম")}<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder={t("e.g. Counter phone","যেমন: কাউন্টার ফোন")}/></label><button type="submit" disabled={busy||!name.trim()}>{t("Generate pairing code","Pairing code তৈরি")}</button></form>
    {pairStep&&token&&<div role="status" className="pg-phone-pair"><strong>{t("One-time pairing code · expires after 5 minutes","একবারের pairing code · ৫ মিনিট মেয়াদ")}</strong><code>{token}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(token)}>{t("Copy code","কোড কপি")}</button><p>{t("Open Ekmivo → Receipt collection setup → paste code → confirm. Keep this code private.","Ekmivo → Receipt collection setup → কোড দিন → নিশ্চিত করুন। কোডটি গোপন রাখুন।")}</p></div>}
   </section>}
   {current&&<section className="pg-phone-box"><div className="pg-phone-title"><div><h3>{current.name}</h3><p>{health(current,bn)} · {current.bindings.length} {t("linked sources","সংযুক্ত উৎস")}</p></div><button type="button" onClick={()=>setSelected(null)}>{t("Close","বন্ধ")}</button></div>
    {current.last_queue_error&&<p role="alert" className="pg-phone-warning">{t("Device diagnostic","ডিভাইস সমস্যা")}: {current.last_queue_error}</p>}
    {current.overflow_count>0&&<p role="alert">{t("Uncollected receipts reported","সংগ্রহ হয়নি এমন receipt")}: {current.overflow_count}</p>}
    <div className="pg-phone-bindings">{current.bindings.map(b=>{const a=accounts.find(x=>x.ID===b.account_id);return <div key={b.id} className="pg-phone-binding"><div><strong>{a?.Label||a?.Method||t("Account","অ্যাকাউন্ট")}</strong><p>{a?.Number||"—"} · {b.source} · {b.binding}</p><small>{t("Last receipt","শেষ রসিদ")}: {b.last_receipt_at?new Date(b.last_receipt_at).toLocaleString(locale):t("Not observed","পাওয়া যায়নি")}</small></div>{canManage&&!current.revoked_at&&<button disabled={busy} onClick={()=>{if(window.confirm(t("Detach this account? Queued receipts will be held, not reassigned.","অ্যাকাউন্ট বিচ্ছিন্ন করবেন? Pending receipt অন্য account-এ যাবে না।")))void command("/"+current.id+"/detach",{binding_id:b.id})}}>{t("Detach","বিচ্ছিন্ন")}</button>}</div>})}</div>
    {canManage&&!current.revoked_at&&<>
     <h4>{t("Link receiving accounts","Receiving accounts যুক্ত করুন")}</h4>
     <p className="pg-phone-muted">{t("Choose accounts and configure the approved sender/package + exact SIM ID. The app must approve collection. Ambiguous sources are not accepted.","অ্যাকাউন্ট নির্বাচন করে approved sender/package ও সঠিক SIM ID দিন। App-এ collection অনুমোদন করতে হবে। অস্পষ্ট source গ্রহণ করা হবে না।")}</p>
     <div className="pg-phone-bindings">{accounts.filter(permitted).filter(a=>!current.bindings.some(b=>b.account_id===a.ID)).map(a=><div key={a.ID} className="pg-phone-choice"><label className="pg-phone-check"><input type="checkbox" checked={chosen.includes(a.ID)} onChange={e=>setChosen(p=>e.target.checked?[...p,a.ID]:p.filter(x=>x!==a.ID))}/><span>{a.Label||a.Method} · {a.Number}</span></label>{chosen.includes(a.ID)&&<div className="pg-phone-inline"><label>{t("Approved source","অনুমোদিত source")}<select value={routes[a.ID]?.parser_id||""} onChange={e=>{const parser=parsers.find(p=>p.id===e.target.value);setRoutes(old=>({...old,[a.ID]:{parser_id:e.target.value,binding:parser?.source?"package:"+parser.source:""}}))}}><option value="">{t("Select","বেছে নিন")}</option>{parsers.filter(p=>p.method===a.Method).map(p=><option value={p.id} key={p.id}>{p.source} · {p.id}</option>)}</select></label><label>{t("Exact SIM/source binding","সঠিক SIM/source binding")}<input required placeholder="sms:1 / package:..." value={routes[a.ID]?.binding||""} onChange={e=>setRoutes(old=>({...old,[a.ID]:{parser_id:old[a.ID]?.parser_id||"",binding:e.target.value}}))}/></label></div>}</div>)}</div>
     <div className="pg-phone-actions"><button disabled={busy||!chosen.length||!current.claimed_at} onClick={()=>void attachMany(current.id)}>{t("Save selected account bindings","নির্বাচিত account bindings সংরক্ষণ")}</button><button disabled={busy} onClick={()=>{const name=prompt(t("Rename phone","ফোনের নতুন নাম"),current.name);if(name?.trim())void command("/"+current.id+"/rename",{name:name.trim()})}}>{t("Rename phone","ফোনের নাম বদলান")}</button><button className="is-danger" disabled={busy} onClick={()=>{if(window.confirm(t("Revoke this phone? All its linked sources will be disabled.","ফোনটি বাতিল করবেন? সব যুক্ত উৎস বন্ধ হবে।")))void command("/"+current.id+"/revoke",{})}}>{t("Revoke phone","ফোন বাতিল")}</button></div>
    </>}
   </section>}
  </>}
 </section>;
}
