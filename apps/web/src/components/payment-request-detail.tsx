"use client";
import {useEffect,useState,type ReactNode} from "react";
type Detail={merchant_reference:string;amount_minor:number;currency:string;state:string;source_reference?:string;
 items?:{title:string;quantity:number;unit_amount_minor:number}[];
 attempt:null|{payer_suffix:string;method:string;window_start:string;window_end:string};
 events:{event_type:string;reason:string;occurred_at:string}[]};
export function PaymentRequestDetail({id,workspaceId,environment,locale}:{
 id:string;workspaceId:string;environment:string;locale:"bn"|"en";onClose:()=>void;
}){
 const bn=locale==="bn";
 const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[copied,setCopied]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/go/workspaces/${workspaceId}/payment-intents/${id}?environment=${environment}`,{cache:"no-store",signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error("unavailable");return response.json()})
   .then(body=>{if(!controller.signal.aborted)setDetail(body.data as Detail)})
   .catch(()=>{if(!controller.signal.aborted)setError(true)});
  return ()=>controller.abort();
 },[id,workspaceId,environment,retry]);
 // Owner 2026-11-23: the drawer was a wall of text. Amount and status first, then a few
 // labelled rows, then a short timeline. Times are short and in Dhaka time.
 const time=(value:string)=>new Date(value).toLocaleString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
 const money=(value:number)=>"৳"+new Intl.NumberFormat(bn?"bn-BD":"en-IN",{maximumFractionDigits:2}).format(value/100);
 const events:Record<string,string>={created:bn?"রিকোয়েস্ট তৈরি":"Request created",payer_locked:bn?"কাস্টমার নম্বর দিয়েছেন":"Customer entered their number",cancelled:bn?"বাতিল":"Cancelled",completed:bn?"পেমেন্ট যাচাই হয়েছে":"Payment verified",expired:bn?"মেয়াদ শেষ":"Expired"};
 const states:Record<string,[string,string,string]>={completed:["Paid","পরিশোধিত","#1a8f4a"],awaiting_payment:["Waiting for payment","পেমেন্টের অপেক্ষা","#b26a00"],requires_payer:["Not started","শুরু হয়নি","#5b6070"],processing:["Checking","যাচাই চলছে","#1f6feb"],cancelled:["Cancelled","বাতিল","#c0392b"],expired:["Expired","মেয়াদ শেষ","#5b6070"]};
 const methods:Record<string,string>={bkash:bn?"বিকাশ":"bKash",nagad:bn?"নগদ":"Nagad",rocket:bn?"রকেট":"Rocket"};
 const row=(label:string,value:ReactNode)=><div style={{display:"flex",justifyContent:"space-between",gap:16,padding:"10px 0",borderBottom:"1px solid var(--line,rgba(127,127,127,.18))"}}><span style={{opacity:.7}}>{label}</span><span style={{textAlign:"right",fontWeight:500,minWidth:0,overflowWrap:"anywhere"}}>{value}</span></div>;
 return <section className="ref-request-details" aria-label={bn?"রিকোয়েস্টের বিস্তারিত":"Request details"} style={{display:"grid",gap:18}}>
  {error?<p role="alert">{bn?"তথ্য পাওয়া যায়নি বা দেখার অনুমতি নেই।":"Details unavailable or access denied."} <button className="ib" onClick={()=>{setError(false);setRetry(x=>x+1)}}>{bn?"আবার চেষ্টা":"Retry"}</button></p>
  :!detail?<p role="status">{bn?"তথ্য আনা হচ্ছে…":"Loading details…"}</p>:(()=>{
   const st=states[detail.state]||[detail.state,detail.state,"#5b6070"];
   return <>
    <div style={{display:"grid",gap:6}}>
     <span style={{fontSize:30,fontWeight:700,letterSpacing:"-.01em"}}>{money(detail.amount_minor)}</span>
     <span style={{justifySelf:"start",padding:"3px 10px",borderRadius:999,fontSize:13,fontWeight:600,color:st[2],background:"color-mix(in srgb, "+st[2]+" 14%, transparent)"}}>{bn?st[1]:st[0]}</span>
    </div>
    <div>
     {row(bn?"রেফারেন্স":"Reference",<span style={{display:"inline-flex",alignItems:"center",gap:8}}><span className="mono" title={detail.merchant_reference}>{detail.merchant_reference.length>24?detail.merchant_reference.slice(0,14)+"…"+detail.merchant_reference.slice(-6):detail.merchant_reference}</span><button type="button" className="ib" onClick={()=>void navigator.clipboard.writeText(detail.merchant_reference).then(()=>setCopied(true))}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"কপি":"Copy")}</button></span>)}
     {detail.source_reference&&row(bn?"কোথা থেকে":"From",detail.source_reference)}
     {detail.attempt&&row(bn?"কাস্টমারের নম্বর":"Customer number","••••"+detail.attempt.payer_suffix)}
     {detail.attempt&&row(bn?"মাধ্যম":"Method",methods[detail.attempt.method]||detail.attempt.method)}
     {detail.attempt&&row(bn?"পেমেন্টের সময়সীমা":"Payment window",time(detail.attempt.window_start)+" – "+new Date(detail.attempt.window_end).toLocaleTimeString(bn?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka",hour:"numeric",minute:"2-digit"}))}
    </div>
    {detail.items&&detail.items.length>0&&<div><h4 style={{margin:"0 0 6px",fontSize:13,opacity:.7}}>{bn?"পণ্য":"Items"}</h4>{detail.items.map((line,i)=><div key={i}>{row(line.title+" × "+line.quantity,money(line.unit_amount_minor*line.quantity))}</div>)}</div>}
    {detail.events.length>0&&<div><h4 style={{margin:"0 0 8px",fontSize:13,opacity:.7}}>{bn?"কী কী হয়েছে":"Timeline"}</h4>
     <ol style={{listStyle:"none",margin:0,padding:0,display:"grid",gap:10}}>{detail.events.map((event,i)=><li key={i} style={{display:"grid",gridTemplateColumns:"10px 1fr",gap:10,alignItems:"start"}}><span aria-hidden="true" style={{width:8,height:8,marginTop:6,borderRadius:"50%",background:"currentColor",opacity:.5}}/><span><span style={{display:"block",fontWeight:500}}>{events[event.event_type]||event.event_type}</span><time dateTime={event.occurred_at} style={{fontSize:13,opacity:.65}}>{time(event.occurred_at)}</time></span></li>)}</ol></div>}
   </>;
  })()}
 </section>;
}
