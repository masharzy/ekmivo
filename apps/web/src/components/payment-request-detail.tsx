"use client";
import {useEffect,useState} from "react";
type Detail={merchant_reference:string;amount_minor:number;currency:string;state:string;source_reference?:string;
 items?:{title:string;quantity:number;unit_amount_minor:number}[];
 attempt:null|{payer_suffix:string;method:string;window_start:string;window_end:string};
 events:{event_type:string;reason:string;occurred_at:string}[]};
export function PaymentRequestDetail({id,workspaceId,environment,locale,onClose}:{
 id:string;workspaceId:string;environment:string;locale:"bn"|"en";onClose:()=>void;
}){
 const bn=locale==="bn";
 const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/go/workspaces/${workspaceId}/payment-intents/${id}?environment=${environment}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error("unavailable");return response.json()})
   .then(body=>{if(!controller.signal.aborted)setDetail(body.data as Detail)})
   .catch(()=>{if(!controller.signal.aborted)setError(true)});
  return ()=>controller.abort();
 },[id,workspaceId,environment,retry]);
 const time=(value:string)=>new Date(value).toLocaleString(bn?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",timeZoneName:"short"});
 const money=(value:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(value/100);
 const events:Record<string,string>={created:bn?"রিকোয়েস্ট ইস্যু":"Request issued",payer_locked:bn?"প্রেরক ও মাধ্যম লক":"Payer and method locked",cancelled:bn?"ব্যবসা বাতিল করেছে":"Cancelled by merchant"};
 return <section className="ds-panel pg05-section" aria-label={bn?"রিকোয়েস্টের ইতিহাস":"Request history"}>
  <div className="pg05-topline"><h2>{detail?.merchant_reference||(bn?"রিকোয়েস্টের তথ্য":"Request details")}</h2><button type="button" onClick={onClose}>{bn?"বন্ধ করুন":"Close details"}</button></div>
  {error?<p role="alert">{bn?"তথ্য পাওয়া যায়নি বা দেখার অনুমতি নেই।":"Details unavailable or access denied."} <button onClick={()=>{setError(false);setRetry(x=>x+1)}}>{bn?"আবার চেষ্টা":"Retry"}</button></p>:
   !detail?<p role="status">{bn?"তথ্য আনা হচ্ছে…":"Loading details…"}</p>:<>
    <p>{money(detail.amount_minor)} · {detail.source_reference||(bn?"স্বতন্ত্র রিকোয়েস্ট":"Standalone request")}</p>
    {detail.items&&<ul>{detail.items.map((line,i)=><li key={i}>{line.title} — {line.quantity} × {money(line.unit_amount_minor)}</li>)}</ul>}
    {detail.attempt?<dl className="pg05-summary"><div><dt>{bn?"প্রেরক / মাধ্যম":"Payer / method"}</dt><dd>••••{detail.attempt.payer_suffix} · {detail.attempt.method}</dd></div><div><dt>{bn?"মূল সময়সীমা":"Original payment window"}</dt><dd>{time(detail.attempt.window_start)} — {time(detail.attempt.window_end)}</dd></div></dl>:<p>{bn?"প্রেরক এখনও নিশ্চিত করা হয়নি।":"Payer has not been confirmed."}</p>}
    <ol>{detail.events.map((event,i)=><li key={i}>{events[event.event_type]||event.event_type} · <time dateTime={event.occurred_at}>{time(event.occurred_at)}</time></li>)}</ol>
    <p className="pg05-muted">{bn?"এই ইতিহাস টাকা পাওয়ার প্রমাণ নয়। রসিদ যাচাই এখনও সংযুক্ত হয়নি।":"This history is not proof of funds. Receipt verification is not connected."}</p>
   </>}
 </section>;
}
