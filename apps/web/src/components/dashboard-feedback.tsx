"use client";
import {useEffect,useRef,useState} from "react";

// Mirror existing, explicit inline outcomes so financial errors remain on the
// page as well as in the transient notification. Never infer success from HTTP.
export function DashboardFeedback({locale}:{locale:"en"|"bn"}){
 const [toast,setToast]=useState<{text:string;kind:"error"|"success";id:number}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  const root=document.getElementById("dashboard-content");
  if(!root)return;
  const last=new WeakMap<Element,string>();
  const scan=()=>{
   root.querySelectorAll('[role="alert"],[data-feedback="success"],.ws-note,.rf-notice,.ek-account-success,.pg10-message,.pg10-workspace>p[role="status"],.int-success,.pg-operation-success,.opw-notice,.ds-key-success,.pg-request-success').forEach(node=>{
    const text=node.textContent?.trim();
    if(!text||last.get(node)===text||!node.getClientRects().length)return;
    last.set(node,text);
    const kind=node.getAttribute("role")==="alert"?"error":"success";
    setToast({text,kind,id:Date.now()});
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>setToast(null),root.closest('[data-service="payments"]')?3000:8000);
   });
  };
  const observer=new MutationObserver(scan);observer.observe(root,{subtree:true,childList:true,characterData:true});scan();
  return()=>{observer.disconnect();if(timer.current)clearTimeout(timer.current)};
 },[]);
 return <div className="ref-toast-region" aria-live="polite" aria-atomic="true">{toast&&<div className="ref-toast" data-kind={toast.kind} key={toast.id}><span className="ref-toast-icon" aria-hidden="true">{toast.kind==="error"?"!":"✓"}</span><div><p>{toast.text}</p></div><button type="button" onClick={()=>setToast(null)} aria-label={locale==="bn"?"বন্ধ করুন":"Dismiss notification"}>×</button></div>}</div>;
}
