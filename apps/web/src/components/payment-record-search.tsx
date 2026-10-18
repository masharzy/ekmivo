"use client";
import {planSectionAllowed} from "../lib/plan-features";
import type {PlanTerms} from "../lib/payment-plans";
import {useEffect,useState} from "react";
import type {Locale,PaymentEnvironment} from "../lib/dashboard-navigation";

type SearchSection="payments"|"incoming"|"payment-links"|"invoices"|"customers";
type RecordMatch={id:string;section:SearchSection;title:string;detail:string;href:string};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sources:SearchSection[]=["payments","incoming","payment-links","invoices","customers"];
const en={payments:"Transaction",incoming:"Incoming receipt","payment-links":"Payment link",invoices:"Invoice",customers:"Customer"};
const bn={payments:"লেনদেন",incoming:"ইনকামিং রসিদ","payment-links":"পেমেন্ট লিংক",invoices:"ইনভয়েস",customers:"গ্রাহক"};
type SourceItem={id?:unknown;merchant_reference?:unknown;reference?:unknown;body?:{name?:unknown};method?:unknown;status?:unknown;amount_minor?:unknown;verified_amount_minor?:unknown};
export function PaymentRecordSearch({locale,workspaceId,environment,query,open,onNavigate,planFeatures}:{
 planFeatures?:PlanTerms["features"]|null;locale:Locale;workspaceId:string;environment:PaymentEnvironment;query:string;open:boolean;onNavigate:(url:string)=>void;
}){
 const [matches,setMatches]=useState<RecordMatch[]>([]);
 const [pending,setPending]=useState(false);
 const [failed,setFailed]=useState<SearchSection[]>([]);
 const term=query.trim().slice(0,96);
 useEffect(()=>{
  if(!open||term.length<2)return;
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   setPending(true);
   const allowedSources=sources.filter(section=>planSectionAllowed(section,planFeatures));
   const results=await Promise.allSettled(allowedSources.map(async section=>{
    const params=new URLSearchParams({environment,q:term});
    const base=`/api/go/workspaces/${workspaceId}`;
    const url=["payments","incoming"].includes(section)
     ?`${base}/operations/${section}?${params}`
     :`${base}/documents/${section}?${params}`;
    const response=await fetch(url,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw Error(String(response.status));
    const json=await response.json();
    if(!Array.isArray(json.items))throw Error("INVALID_RESULT");
    return json.items.slice(0,5).flatMap((item:SourceItem)=>{
     if(typeof item.id!=="string"||!uuid.test(item.id))return [];
     const raw=item.body?.name??item.merchant_reference??item.reference??item.method??item.status;
     const title=typeof raw==="string"&&raw.length?raw.slice(0,120):item.id.slice(0,8);
     const amount=item.verified_amount_minor??item.amount_minor;
     const detail=typeof amount==="number"
      ?new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(amount/100)
      :typeof item.status==="string"?item.status.slice(0,30):"";
     return [{id:item.id,section,title,detail,
      href:`/w/${workspaceId}/payments/${section==="payments"?"transactions":section}/${item.id}`}];
    });
   }));
   if(controller.signal.aborted)return;
   setMatches(results.flatMap(result=>result.status==="fulfilled"?result.value:[]).slice(0,16));
   setFailed(results.flatMap((result,i)=>result.status==="rejected"?[allowedSources[i]]:[]));
   setPending(false);
  },280);
  return()=>{window.clearTimeout(timer);controller.abort()};
 },[term,workspaceId,environment,locale,open,planFeatures]);
 if(!open||term.length<2)return <p className="ds-search-hint">{locale==="bn"?"কমপক্ষে ২ অক্ষর লিখলে অনুমোদিত পেমেন্ট, রসিদ, লিংক, ইনভয়েস ও গ্রাহক খোঁজা হবে।":"Type at least 2 characters to search authorized transactions, receipts, links, invoices and customers."}</p>;
 return <section className="ds-record-search" aria-label={locale==="bn"?"পেমেন্ট রেকর্ড":"Payment records"}>
  <h3>{locale==="bn"?"পেমেন্ট রেকর্ড":"Payment records"}</h3>
  {pending&&<p role="status">{locale==="bn"?"খোঁজা হচ্ছে…":"Searching…"}</p>}
  {!pending&&matches.length===0&&failed.length===0&&<p role="status">{locale==="bn"?"মেলা রেকর্ড নেই":"No matching records"}</p>}
  {matches.map(item=><button type="button" key={item.section+item.id} className="ds-record-search-result"
    onClick={()=>onNavigate(item.href)}>
    <strong>{item.title}</strong> <span>{(locale==="bn"?bn:en)[item.section]}{item.detail?" · "+item.detail:""}</span>
  </button>)}
  {failed.length>0&&<p role="alert">{locale==="bn"?"কিছু রেকর্ডের উৎস পাওয়া যাচ্ছে না, ফলাফল অসম্পূর্ণ।":"Some record sources are unavailable; these results are incomplete."}</p>}
 </section>;
}
