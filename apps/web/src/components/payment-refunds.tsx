"use client";
import {useCallback,useEffect,useRef,useState} from "react";
type Row={id:string;payment_id:string|null;source_observation_id?:string|null;source_intent_id?:string|null;amount_minor:number;status:string;version:number;reason:string;created_at?:string;updated_at?:string;seller_note?:string;seller_reference?:string;customer?:{name:string;email:string;phone:string}};
type Action="review"|"approve"|"reject"|"cancel"|"report-returned";
const statusOptions=["requested","reviewing","approved","rejected","seller_reported_returned","cancelled"];
const statusMap:Record<string,[string,string]>={requested:["Requested","অনুরোধ"],reviewing:["Under review","পর্যালোচনা"],approved:["Approved","অনুমোদিত"],rejected:["Rejected","প্রত্যাখ্যাত"],seller_reported_returned:["Reported returned","ফেরত রিপোর্ট"],cancelled:["Cancelled","বাতিল"]};
export function PaymentRefunds({locale,workspaceId,environment,canManage,detailId}:{locale:"en"|"bn";workspaceId:string;environment:string;canManage:boolean;detailId?:string}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const base="/api/go/workspaces/"+workspaceId+"/refunds";
 const [items,setItems]=useState<Row[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [status,setStatus]=useState(""),[cursor,setCursor]=useState(""),[next,setNext]=useState<string|null>(null),[nonce,setNonce]=useState(0);
 const detailsDialog=useRef<HTMLDialogElement|null>(null),decisionDialog=useRef<HTMLDialogElement|null>(null);
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
   if(!signal.aborted){const page=body as {items:Row[];next_cursor?:string};setItems(page.items);setNext(page.next_cursor??null)}
  }catch(e){if(!signal.aborted)setError(t("Refund records are unavailable. Retry.","রিফান্ডের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।")+" ("+(e instanceof Error?e.message:"")+")")}
  finally{if(!signal.aborted)setLoading(false)}
 },[base,detailId,environment,status,cursor,bn]);
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)void load(c.signal)});return()=>c.abort()},[load,nonce]);
 useEffect(()=>{const d=detailsDialog.current;if(!d)return;if(viewing&&!d.open)d.showModal();else if(!viewing&&d.open)d.close()},[viewing]);
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
 const total=items.reduce((s,r)=>s+r.amount_minor,0),needsAction=items.filter(r=>["requested","reviewing","approved"].includes(r.status)).length;
 return <div className="rf-workbench">
  <header className="rf-header"><div><h1>{t("Refunds","রিফান্ড")}</h1><p>{t("Review requests and track seller-managed returns.","রিফান্ড অনুরোধ ও বিক্রেতার সিদ্ধান্ত পরিচালনা করুন।")}</p></div><button type="button" onClick={()=>setNonce(n=>n+1)} disabled={loading||busy}>{t("Refresh","রিফ্রেশ")}</button></header>
  <section className="rf-totals" aria-label={t("Loaded refunds","লোড হওয়া রিফান্ড")}><div><span>{t("Requests on this page","এই পৃষ্ঠার অনুরোধ")}</span><strong>{items.length}{next?"+":""}</strong></div><div><span>{t("Needs attention","পদক্ষেপ প্রয়োজন")}</span><strong>{needsAction}</strong></div><div><span>{t("Requested amount on this page","এই পৃষ্ঠার পরিমাণ")}</span><strong>{money(total)}</strong></div></section>
  {!detailId&&<div className="rf-filter"><label>{t("Status","অবস্থা")}<select value={status} onChange={e=>{setStatus(e.target.value);setCursor("")}}><option value="">{t("All requests","সব অনুরোধ")}</option>{statusOptions.map(x=><option key={x} value={x}>{name(x)}</option>)}</select></label></div>}
  {notice&&<p data-feedback="success" className="rf-notice" role="status">{notice}</p>}
  {error&&<div className="rf-error" role="alert">{error}<button type="button" onClick={()=>setNonce(n=>n+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {loading?<div className="rf-empty" role="status">{t("Loading refunds…","রিফান্ড লোড হচ্ছে…")}</div>:!error&&!items.length?<div className="rf-empty"><strong>{t("No refund requests","কোনো রিফান্ড অনুরোধ নেই")}</strong></div>:<div className="ekv2-refund-table opw-scroll" role="region" tabIndex={0} aria-label={t("Refund requests","রিফান্ড অনুরোধ")}><table><thead><tr><th>{t("Reference","রেফারেন্স")}</th><th>{t("Customer","গ্রাহক")}</th><th>{t("Date","তারিখ")}</th><th>{t("Status","অবস্থা")}</th><th>{t("Amount","পরিমাণ")}</th></tr></thead><tbody>{items.map(row=><tr key={row.id} className="ekv2-clickable-row" tabIndex={0} onClick={()=>setViewing(row)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setViewing(row)}}}><td>{row.payment_id?row.payment_id.slice(0,12):row.source_intent_id?row.source_intent_id.slice(0,12):row.id.slice(0,12)}</td><td>{row.customer?.name||row.customer?.phone||"—"}</td><td>{date(row.created_at)}</td><td><span className="opw-status" data-status={row.status}>{name(row.status)}</span></td><td className="opw-num">{money(row.amount_minor)}</td></tr>)}</tbody></table></div>}
  <dialog ref={detailsDialog} className="ekv2-record-dialog" aria-label={t("Refund details","রিফান্ডের বিবরণ")} onCancel={()=>setViewing(null)} onClose={()=>setViewing(null)} onClick={e=>{if(e.target===e.currentTarget)setViewing(null)}}>
   {viewing&&<div className="ekv2-detail"><div className="ekv2-detail-head"><h2>{t("Refund details","রিফান্ডের বিবরণ")}</h2><button type="button" aria-label={t("Close","বন্ধ করুন")} onClick={()=>setViewing(null)}>×</button></div><div className="ekv2-detail-amount">{money(viewing.amount_minor)}</div><span className="opw-status" data-status={viewing.status}>{name(viewing.status)}</span><dl className="ekv2-detail-list">
    <div><dt>{t("Customer","গ্রাহক")}</dt><dd>{viewing.customer?.name||viewing.customer?.phone||"—"}</dd></div><div><dt>{t("Phone","ফোন")}</dt><dd>{viewing.customer?.phone||"—"}</dd></div><div><dt>{t("Date","তারিখ")}</dt><dd>{date(viewing.created_at)}</dd></div><div><dt>{t("Payment","পেমেন্ট")}</dt><dd>{viewing.payment_id||viewing.source_intent_id||"—"}</dd></div><div><dt>{t("Reason","কারণ")}</dt><dd>{viewing.reason||"—"}</dd></div>{viewing.seller_reference&&<div><dt>{t("Return reference","ফেরতের রেফারেন্স")}</dt><dd>{viewing.seller_reference}</dd></div>}</dl>
    <div className="ekv2-detail-actions"><button type="button" onClick={()=>setViewing(null)}>{t("Close","বন্ধ করুন")}</button>{eligible(viewing)&&<button type="button" className="ekv2-primary" onClick={()=>choose(viewing)}>{t("Review request","অনুরোধ দেখুন")}</button>}</div></div>}
  </dialog>
  {!detailId&&<div className="rf-page-nav"><button type="button" disabled={!cursor||loading||busy} onClick={()=>setCursor("")}>{t("First page","প্রথম পাতা")}</button><button type="button" disabled={!next||loading||busy} onClick={()=>setCursor(next??"")}>{t("Next page","পরের পাতা")}</button></div>}
  <dialog ref={decisionDialog} className="ekv2-refund-decision" onCancel={e=>{if(busy)e.preventDefault();else setSelected(null)}} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget&&!busy)setSelected(null)}}>{selected&&<form className="rf-action-panel" onSubmit={submit} aria-label={t("Seller refund decision","বিক্রেতার রিফান্ড সিদ্ধান্ত")}>
   <div className="rf-action-head"><div><h2>{t("Review refund","রিফান্ড পর্যালোচনা")}</h2><strong>{money(selected.amount_minor)}</strong></div><button type="button" disabled={busy} onClick={()=>setSelected(null)} aria-label={t("Close","বন্ধ করুন")}>✕</button></div>
   <label>{t("Decision","সিদ্ধান্ত")}<select value={action} onChange={e=>setAction(e.target.value as Action)}>{operations(selected).map(op=><option key={op} value={op}>{op==="report-returned"?t("Mark seller-reported returned","বিক্রেতার ফেরত রিপোর্ট করুন"):op==="review"?t("Review","পর্যালোচনা"):op==="approve"?t("Approve","অনুমোদন"):op==="reject"?t("Reject","প্রত্যাখ্যান"):t("Cancel","বাতিল")}</option>)}</select></label>
   <label>{t("Seller note","বিক্রেতার মন্তব্য")}<textarea required minLength={10} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder={t("Explain your decision","সিদ্ধান্তের কারণ লিখুন")}/></label>
   {action==="report-returned"&&<label>{t("Return transaction reference","ফেরতের লেনদেনের রেফারেন্স")}<input required maxLength={128} value={reference} onChange={e=>setReference(e.target.value)}/></label>}
   <label className="rf-confirm"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{t("I confirm this action. No money is transferred automatically.","আমি সিদ্ধান্ত নিশ্চিত করছি। স্বয়ংক্রিয়ভাবে কোনো টাকা পাঠানো হবে না।")}</span></label>
   <div className="rf-action-buttons"><button type="button" disabled={busy} onClick={()=>setSelected(null)}>{t("Cancel","বাতিল")}</button><button type="submit" disabled={busy||!confirmed||note.trim().length<10}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save decision","সিদ্ধান্ত সংরক্ষণ")}</button></div>
  </form></div>}
 </div>;
}
