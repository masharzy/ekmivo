"use client";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {useCallback,useEffect,useRef,useState} from "react";
import "./ek-financial-pages.css";
import {FinancialIcon as DashboardIcon} from "./financial-icon";
type Row={id:string;payment_id:string|null;source_observation_id?:string|null;source_intent_id?:string|null;amount_minor:number;status:string;version:number;reason:string;created_at?:string;updated_at?:string;seller_note?:string;seller_reference?:string;customer?:{name:string;email:string;phone:string}};
type Action="review"|"approve"|"reject"|"cancel"|"report-returned";
const statusOptions=["requested","reviewing","approved","rejected","seller_reported_returned","cancelled"];
const statusMap:Record<string,[string,string]>={requested:["Requested","অনুরোধ"],reviewing:["Under review","পর্যালোচনা"],approved:["Approved","অনুমোদিত"],rejected:["Rejected","প্রত্যাখ্যাত"],seller_reported_returned:["Reported returned","ফেরত রিপোর্ট"],cancelled:["Cancelled","বাতিল"]};
export function PaymentRefunds({locale,workspaceId,environment,canManage,detailId}:{locale:"en"|"bn";workspaceId:string;environment:string;canManage:boolean;detailId?:string}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const base="/api/go/workspaces/"+workspaceId+"/refunds";
 const seed=useDashboardInitialData<{items:Row[];next_cursor?:string}>("refunds");
 const initialLoad=useRef(Boolean(seed));
 const [items,setItems]=useState<Row[]>(seed?.data?.items??[]),[loading,setLoading]=useState(!seed),[busy,setBusy]=useState(false),[error,setError]=useState(seed?.error??""),[notice,setNotice]=useState("");
 const [status,setStatus]=useState(""),[cursor,setCursor]=useState(""),[next,setNext]=useState<string|null>(seed?.data?.next_cursor??null),[nonce,setNonce]=useState(0);
 const decisionDialog=useRef<HTMLDialogElement|null>(null);
 const closeButton=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 const [search,setSearch]=useState("");
 useEffect(()=>{if(!notice)return;const timeout=setTimeout(()=>setNotice(""),1800);return()=>clearTimeout(timeout)},[notice]);
 const [baseCounts,setBaseCounts]=useState<Record<string,number>>(()=>{const counts:Record<string,number>={};for(const row of seed?.data?.items??[])counts[row.status]=(counts[row.status]??0)+1;return counts});
 const [viewing,setViewing]=useState<Row|null>(null);
 const [selected,setSelected]=useState<Row|null>(null),[action,setAction]=useState<Action>("review"),[note,setNote]=useState(""),[reference,setReference]=useState(""),[confirmed,setConfirmed]=useState(false);
 const name=(code:string)=>statusMap[code]?.[bn?1:0]||code;
 const money=(v:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(v/100);
 const date=(v?:string)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat(bn?"bn-BD":"en-BD",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(new Date(v)):"—";
 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);setError("");
  const params=new URLSearchParams({environment});if(status)params.set("status",status);if(cursor)params.set("cursor",cursor);
  try{const r=await fetch(base+(detailId?"/"+detailId:"")+"?"+params,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(!r.ok)throw Error(String(r.status));
   const body:unknown=await r.json();
   if(!body||typeof body!=="object"||!("items" in body)||!Array.isArray(body.items))throw Error("INVALID_DATA");
   if(!signal.aborted){const page=body as {items:Row[];next_cursor?:string};setItems(page.items);setNext(page.next_cursor??null);if(!status){const counts:Record<string,number>={};for(const row of page.items)counts[row.status]=(counts[row.status]??0)+1;setBaseCounts(counts)}}
  }catch(e){if(!signal.aborted)setError(t("Refund records are unavailable. Retry.","রিফান্ডের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।")+" ("+(e instanceof Error?e.message:"")+")")}
  finally{if(!signal.aborted)setLoading(false)}
 },[base,detailId,environment,status,cursor,bn]);
 useEffect(()=>{if(initialLoad.current){initialLoad.current=false;return;}const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)void load(c.signal)});return()=>c.abort()},[load,nonce]);
 useEffect(()=>{if(viewing)closeButton.current?.focus();else returnFocus.current?.focus()},[viewing]);
 useEffect(()=>{if(!viewing)return;const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();setViewing(null)}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[viewing]);
 useEffect(()=>{const d=decisionDialog.current;if(!d)return;if(selected&&!d.open)d.showModal();else if(!selected&&d.open)d.close()},[selected]);
 useEffect(()=>{if(!selected)return;const onEscape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)setSelected(null)};window.addEventListener("keydown",onEscape);return()=>window.removeEventListener("keydown",onEscape)},[selected,busy]);
 const eligible=(row:Row)=>canManage&&!["rejected","cancelled","seller_reported_returned"].includes(row.status);
 const choose=(row:Row)=>{setViewing(null);setSelected(row);setAction(row.status==="approved"?"report-returned":row.status==="reviewing"?"approve":"review");setNote("");setReference("");setConfirmed(false);setError("");};
 const operations=(row:Row):Action[]=>row.status==="approved"?["report-returned"]:row.status==="reviewing"?["approve","reject"]:["review","approve","reject","cancel"];
 async function submit(event:React.FormEvent){event.preventDefault();if(!selected||busy||!confirmed||!canManage)return;
  setBusy(true);setError("");setNotice("");
  try{const r=await fetch(base+"/"+selected.id+"/"+action+"?environment="+encodeURIComponent(environment),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({note,reference,expected_version:selected.version,confirm_seller_action:true})});
   const b=await r.json();if(!r.ok)throw Error(b.error?.code||b.code||String(r.status));
   setSelected(null);setNote("");setReference("");setConfirmed(false);setNotice(t("Decision recorded.","সিদ্ধান্ত সংরক্ষিত হয়েছে।"));setNonce(n=>n+1);
  }catch(e){setError(t("Could not confirm this decision.","সিদ্ধান্ত নিশ্চিত করা যায়নি।")+" "+String(e instanceof Error?e.message:""))}
  finally{setBusy(false)}
 }
 const visible=items.filter(r=>[r.id,r.payment_id,r.source_intent_id,r.customer?.phone].join(" ").toLowerCase().includes(search.toLowerCase()));
 const total=visible.reduce((s,r)=>s+r.amount_minor,0),needsAction=visible.filter(r=>r.status==="requested").length;
 const moneyRef=(v:number)=>"BDT "+(v/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
 const statusClass=(s:string)=>s==="approved"?"approved":s==="seller_reported_returned"?"refunded":s==="rejected"?"declined":s==="cancelled"?"cancelled":"pending";
 const statusChoices=[["",t("All requests","সব অনুরোধ")],["requested",t("Pending","অপেক্ষমাণ")],["reviewing",t("In review","পর্যালোচনায়")],["approved",t("Approved","অনুমোদিত")],["seller_reported_returned",t("Reported returned","ফেরত রিপোর্ট")],["rejected",t("Declined","প্রত্যাখ্যাত")],["cancelled",t("Cancelled","বাতিল")]];
 const copyId=(value:string)=>{void navigator.clipboard.writeText(value).then(()=>setNotice(t("Copied","কপি হয়েছে"))).catch(()=>setNotice(t("Copy failed","কপি করা যায়নি")))};
 const openDetails=(row:Row,el:HTMLElement)=>{returnFocus.current=el;setViewing(row)};
 const ref=(row:Row)=>row.id;
 const shortDate=(v?:string)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"Asia/Dhaka"}).format(new Date(v)):"—";
 const shortTime=(v?:string)=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat("en-US",{timeStyle:"short",timeZone:"Asia/Dhaka"}).format(new Date(v)):"";

 return <div className={"ek-page-scope rf-reference"+(viewing?" open":"")}>
  <div className="page">
   <header className="ph"><div><h1>{t("Refunds","রিফান্ড")}</h1><p>{t("Review requests and track seller-managed returns.","রিফান্ড অনুরোধ ও বিক্রেতা-পরিচালিত ফেরতের হিসাব দেখুন।")}</p></div>
    <button className={"btn"+(loading?" spin":"")} disabled={loading||busy} onClick={()=>{setNonce(n=>n+1);setNotice(t("Refreshed","রিফ্রেশ করা হয়েছে"))}}><DashboardIcon name="refresh" width={16} height={16}/>{t("Refresh","রিফ্রেশ")}</button></header>
   {/* Owner 2026-11-23: say when a refund is needed. Briofold never sends money back itself. */}
   <details className="rf-help" style={{border:"1px solid var(--line,#E4E6EB)",borderRadius:10,padding:"10px 14px",margin:"0 0 14px"}}>
    <summary style={{cursor:"pointer",fontWeight:600}}>{t("When is a refund needed?","রিফান্ড কখন লাগে?")}</summary>
    <ul style={{margin:"8px 0 4px",paddingLeft:18,lineHeight:1.6}}>
     <li>{t("The customer paid after the checkout expired or was cancelled.","checkout-এর মেয়াদ শেষ বা বাতিল হওয়ার পরে কাস্টমার টাকা পাঠিয়েছেন।")}</li>
     <li>{t("The customer paid twice, or sent more than the amount.","কাস্টমার দুবার পাঠিয়েছেন, বা বেশি টাকা পাঠিয়েছেন।")}</li>
     <li>{t("You cancelled the order after it was paid.","টাকা পাওয়ার পর আপনি অর্ডার বাতিল করেছেন।")}</li>
     <li>{t("The customer asked for their money back from the receipt page.","কাস্টমার রসিদের পেজ থেকে টাকা ফেরত চেয়েছেন।")}</li>
    </ul>
    <p style={{margin:0,opacity:.75}}>{t("Send the money back yourself from your wallet app, then mark the refund done here so your records match.","টাকা আপনি নিজের ওয়ালেট অ্যাপ থেকে ফেরত পাঠাবেন, তারপর এখানে রিফান্ড সম্পন্ন চিহ্নিত করবেন, যাতে হিসাব মেলে।")}</p>
   </details>
   <section className="stats" aria-label={t("Summary","সারাংশ")}>
    <div className="st"><div className="si"><DashboardIcon name="list" width={18} height={18}/></div><div><span>{t("Requests on this page","এই পাতার অনুরোধ")}</span><b>{visible.length}</b></div></div>
    <div className={"st"+(needsAction?" hot":"")}><div className="si"><DashboardIcon name="alert-circle" width={18} height={18}/></div><div><span>{t("Needs attention","পদক্ষেপ প্রয়োজন")}</span><b>{needsAction}</b></div></div>
    <div className="st"><div className="si"><DashboardIcon name="sliders" width={18} height={18}/></div><div><span>{t("Requested amount on this page","এই পাতার অনুরোধকৃত পরিমাণ")}</span><b dir="ltr">{moneyRef(total)}</b></div></div>
   </section>
   {error&&<div className="financial-error" role="alert">{error}<button onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
   <section className="card"><div className="tb"><div className="chips" role="group" aria-label={t("Filter by status","অবস্থা অনুযায়ী বাছুন")}>{statusChoices.map(([key,label])=><button type="button" className="chip" key={key} aria-pressed={status===key} onClick={()=>{setStatus(key);setCursor("");setViewing(null)}}>{label}<i>{key?(baseCounts[key]??(status===key?items.length:0)):Object.values(baseCounts).reduce((a,b)=>a+b,0)||items.length}</i></button>)}</div>
    <label className="find"><DashboardIcon name="search" width={16} height={16}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search reference or phone","রেফারেন্স বা ফোন খুঁজুন")} aria-label={t("Search refunds","রিফান্ড খুঁজুন")}/></label></div>
    {loading?<div className="financial-status" role="status">{t("Loading refunds…","রিফান্ড লোড হচ্ছে…")}</div>:<><table className="refund-table"><thead><tr><th>{t("Reference","রেফারেন্স")}</th><th>{t("Customer","গ্রাহক")}</th><th>{t("Date","তারিখ")}</th><th>{t("Status","অবস্থা")}</th><th className="r">{t("Amount","পরিমাণ")}</th><th style={{width:44}}/></tr></thead><tbody>{visible.map(row=><tr key={row.id} tabIndex={0} role="button" onClick={e=>openDetails(row,e.currentTarget)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openDetails(row,e.currentTarget)}}}><td className="mono">{ref(row).slice(0,12)}</td><td dir="ltr">{row.customer?.phone||row.customer?.name||"—"}</td><td>{shortDate(row.created_at)}<span className="sub">{shortTime(row.created_at)}</span></td><td><span className={"bd "+statusClass(row.status)}>{name(row.status)}</span></td><td className="r amt">{moneyRef(row.amount_minor)}</td><td className="go"><DashboardIcon name="chevron-right" width={18} height={18}/></td></tr>)}</tbody></table>
     {!visible.length&&<div className="empty"><b>{t("No refund requests match","মিলে যায় এমন রিফান্ড নেই")}</b>{t("Try another status or clear the search.","অন্য অবস্থা বেছে নিন বা সার্চ পরিষ্কার করুন।")}</div>}</>}
    <div className="pg"><span>{t("Showing","দেখানো হচ্ছে")} {visible.length} {t("of","টি /")} {items.length}{next?"+":""} {t("requests","অনুরোধ")}</span><div><button disabled={!cursor||loading||busy} onClick={()=>setCursor("")}>{t("First page","প্রথম পাতা")}</button><button disabled={!next||loading||busy} onClick={()=>setCursor(next??"")}>{t("Next page","পরের পাতা")}</button></div></div>
   </section>
  </div>
  <div className="scrim" onClick={()=>setViewing(null)} aria-hidden="true"/>
  <aside className="dr" role="dialog" aria-modal="true" aria-labelledby="refund-detail-title" aria-hidden={!viewing}>
   <div className="dh"><h3 id="refund-detail-title">{t("Refund details","রিফান্ডের বিবরণ")}</h3><button ref={closeButton} type="button" className="btn" aria-label={t("Close","বন্ধ করুন")} onClick={()=>setViewing(null)}><DashboardIcon name="x" width={16} height={16}/></button></div>
   {viewing&&<><div className="db"><div className="big" dir="ltr">{moneyRef(viewing.amount_minor)}</div><span className={"bd "+statusClass(viewing.status)}>{name(viewing.status)}</span>
    <div className="kv"><span>{t("Reference","রেফারেন্স")}</span><div className="mono">{ref(viewing)}<button type="button" className="cp" aria-label={t("Copy","কপি")} onClick={()=>copyId(ref(viewing))}><DashboardIcon name="copy" width={15} height={15}/></button></div></div>
    <div className="kv"><span>{t("Customer","গ্রাহক")}</span><div dir="ltr">{viewing.customer?.phone||viewing.customer?.name||"—"}</div></div>
    <div className="kv"><span>{t("Requested","অনুরোধ")}</span><div>{date(viewing.created_at)}</div></div>
    {viewing.reason&&<div className="kv"><span>{t("Reason","কারণ")}</span><div>{viewing.reason}</div></div>}
    {viewing.seller_reference&&<div className="kv"><span>{t("Return reference","ফেরত রেফারেন্স")}</span><div className="mono">{viewing.seller_reference}</div></div>}
    </div><div className="df"><button className="btn" type="button" onClick={()=>setViewing(null)}>{t("Close","বন্ধ করুন")}</button><button className="btn" type="button" onClick={()=>copyId(ref(viewing))}><DashboardIcon name="copy" width={16} height={16}/>{t("Copy ID","আইডি কপি")}</button>{eligible(viewing)&&<button className="btn" type="button" onClick={()=>choose(viewing)}>{t("Review request","অনুরোধ পর্যালোচনা")}</button>}</div></>}
  </aside>
  <dialog ref={decisionDialog} className="finance-decision" onCancel={e=>{if(busy)e.preventDefault();else setSelected(null)}} onClose={()=>setSelected(null)}>{selected&&<form onSubmit={submit} aria-label={t("Seller refund decision","বিক্রেতার রিফান্ড সিদ্ধান্ত")}>
   <header className="ph"><div><h2>{t("Review refund","রিফান্ড পর্যালোচনা")}</h2><strong dir="ltr">{moneyRef(selected.amount_minor)}</strong></div><button className="btn" type="button" disabled={busy} onClick={()=>setSelected(null)}>×</button></header>
   <label>{t("Decision","সিদ্ধান্ত")}<select value={action} onChange={e=>setAction(e.target.value as Action)}>{operations(selected).map(op=><option key={op} value={op}>{op==="report-returned"?t("Mark seller-reported returned","বিক্রেতার ফেরত রিপোর্ট করুন"):op==="review"?t("Review","পর্যালোচনা"):op==="approve"?t("Approve","অনুমোদন"):op==="reject"?t("Reject","প্রত্যাখ্যান"):t("Cancel","বাতিল")}</option>)}</select></label>
   <label>{t("Seller note","বিক্রেতার মন্তব্য")}<textarea required minLength={10} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder={t("Explain your decision","সিদ্ধান্তের কারণ লিখুন")}/></label>
   {action==="report-returned"&&<label>{t("Return transaction reference","ফেরতের লেনদেনের রেফারেন্স")}<input required maxLength={128} value={reference} onChange={e=>setReference(e.target.value)}/></label>}
   <label className="confirm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{t("I confirm this action. No money is transferred automatically.","আমি সিদ্ধান্ত নিশ্চিত করছি। স্বয়ংক্রিয়ভাবে কোনো টাকা পাঠানো হবে না।")}</span></label>
   <div className="decision-actions"><button type="button" className="btn" disabled={busy} onClick={()=>setSelected(null)}>{t("Cancel","বাতিল")}</button><button type="submit" className="btn" disabled={busy||!confirmed||note.trim().length<10}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save decision","সিদ্ধান্ত সংরক্ষণ")}</button></div>
  </form>}</dialog>
  {notice&&<div className="toast on" role="status">{notice}</div>}
 </div>;
}
