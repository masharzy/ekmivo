"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {resourceLimit,type PlanResource,type ResourceLimitsData} from "../lib/plan-resource-limits";
export function useResourceLimit(resource:PlanResource,workspaceId:string,environment:string,enabled=true){
 const seed=useDashboardInitialData<ResourceLimitsData>("resourceLimits");
 const scope=workspaceId+":"+environment;
 const [snapshot,setSnapshot]=useState<{scope:string;data:ResourceLimitsData|null}>({scope,data:seed?.data??null}),[loading,setLoading]=useState(enabled&&!seed);
 const data=snapshot.scope===scope?snapshot.data:seed?.data??null;
 const request=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(!enabled)return;const generation=++request.current;
  try{const r=await fetch(`/api/go/workspaces/${workspaceId}/billing/limits?environment=${environment}`,{cache:"no-store",signal});if(!r.ok)throw Error();const d=await r.json();if(!d||typeof d.exempt!=="boolean"||!d.resources)throw Error();if(!signal?.aborted&&generation===request.current)setSnapshot({scope,data:d})}catch{if(!signal?.aborted&&generation===request.current)setSnapshot({scope,data:null})}finally{if(!signal?.aborted&&generation===request.current)setLoading(false)}
 },[workspaceId,environment,enabled,scope]);
 useEffect(()=>{if(seed||!enabled)return;const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)void refresh(c.signal)});return()=>c.abort()},[seed,refresh,enabled]);
 useEffect(()=>{const check=()=>{if(enabled&&document.visibilityState==="visible")void refresh()};window.addEventListener("focus",check);return()=>window.removeEventListener("focus",check)},[refresh,enabled]);
 return {...resourceLimit(enabled?data:{exempt:true,resources:{}},resource,environment),loading,refresh,resource,workspaceId};
}
export function PlanResourceStatus({value,locale}:{value:ReturnType<typeof useResourceLimit>;locale:"en"|"bn"}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 if(value.reason==="exempt")return null;
 const label={payment_methods:t("Receiving accounts","Receiving account"),devices:t("SMS devices","SMS ডিভাইস"),api_keys:t("Live API keys","Live API key"),team_members:t("Team seats","সদস্যের slot"),payments:t("Payments this period","এই সময়ের পেমেন্ট")}[value.resource];
 const number=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD").format(n);
 return <div className="pg-plan-limit" data-blocked={value.blocked||undefined} role="status">
  <span>{value.loading?t("Checking plan limit…","প্ল্যানের সীমা যাচাই হচ্ছে…"):value.reason==="unavailable"?t("Plan limit unavailable.","প্ল্যানের সীমা পাওয়া যাচ্ছে না।"):value.reason==="inactive"?t("Activate or renew your plan to add more.","আরও যোগ করতে প্ল্যান চালু বা নবায়ন করুন।"):<>{label}: {number((value.used??0)+value.pending)} / {value.limit===null?t("Unlimited","সীমাহীন"):number(value.limit)}{value.pending>0&&` (${number(value.pending)} ${t("invited","আমন্ত্রিত")})`}{value.reason==="full"?t(" · Limit reached"," · সীমা পূর্ণ"):value.reason==="active"?t(" · Pending checkout limit reached"," · Pending checkout-এর সীমা পূর্ণ"):""}</>}</span>
  {!value.loading&&value.blocked&&<span className="pg-plan-limit-actions"><button type="button" onClick={()=>void value.refresh()}>{value.reason==="unavailable"?t("Retry","আবার চেষ্টা"):t("Refresh","রিফ্রেশ")}</button>{value.reason!=="unavailable"&&<Link href={`/w/${value.workspaceId}/payments/billing`}>{t("View plans","প্ল্যান দেখুন")}</Link>}</span>}
 </div>;
}
