"use client";
import {useEffect,useState} from "react";
import {RefModal,RefIcon} from "./reference-ui";
import Link from "next/link";
export function AutomaticWebhookSecret({workspaceId,environment,locale}:{workspaceId:string;environment:string;locale:"en"|"bn"}){
 const bn=locale==="bn";const [open,setOpen]=useState(false);
 const [secret,setSecret]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!secret)return;const timer=setTimeout(()=>{setSecret("");setOpen(false)},60000);return()=>clearTimeout(timer)},[secret]);
 async function reveal(){setBusy(true);setError("");try{
  const r=await fetch(`/api/go/workspaces/${workspaceId}/automatic-webhook-secret?environment=${environment}`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
  if(!r.ok)throw Error(String(r.status));const data=await r.json();if(typeof data.signing_secret!=="string")throw Error("INVALID_RESPONSE");setSecret(data.signing_secret);
 }catch{setError(bn?"Signing secret পাওয়া যায়নি। আবার চেষ্টা করুন।":"Unable to reveal signing secret. Try again.")}finally{setBusy(false)}}
 function close(){setSecret("");setError("");setCopied(false);setOpen(false)}
 return <div className="ref-dashboard" style={{marginTop:18}}><div className="card"><div className="switchrow"><div><b>{bn?"ওয়েবহুক সাইনিং সিক্রেট":"Webhook signing secret"}</b><small>{bn?"কলব্যাকের signature যাচাই করতে সার্ভারে ব্যবহার করুন।":"Use this on your server to verify signed callback requests."}</small></div><button className="ib" type="button" onClick={()=>setOpen(true)}>{bn?"সিক্রেট দেখুন":"Reveal secret"}</button><Link className="ib" href={`/w/${workspaceId}/payments/webhooks`}>{bn?"ওয়েবহুক পরিচালনা":"Manage webhooks"}</Link></div></div>
 <RefModal open={open} title={bn?"ওয়েবহুক সাইনিং":"Webhook signing"} onClose={close} footer={<button className="ib pri" onClick={close}>{bn?"সম্পন্ন":"Done"}</button>}><div className="keyv"><span className="mono">{secret||(bn?"সিক্রেট লুকানো আছে":"Secret hidden")}</span>{secret?<button className="ib i" aria-label={bn?"কপি":"Copy"} onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true)}catch{setError(bn?"কপি হয়নি":"Copy failed")}}}><RefIcon name="copy"/></button>:<button className="ib" disabled={busy} onClick={()=>void reveal()}>{bn?"দেখান":"Show secret"}</button>}</div>{copied&&<p role="status">{bn?"কপি হয়েছে":"Copied"}</p>}{error&&<p className="ref-errors" role="alert">{error}</p>}<p className="modal-desc">{bn?"এই সিক্রেট কেবল server-এ সংরক্ষণ করুন।":"Keep this secret on your server."}</p></RefModal></div>;
}
