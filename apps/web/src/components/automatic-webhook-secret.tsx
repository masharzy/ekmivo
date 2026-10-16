"use client";
import {useEffect,useRef,useState} from "react";
export function AutomaticWebhookSecret({workspaceId,environment,locale}:{workspaceId:string;environment:string;locale:"en"|"bn"}){
 const bn=locale==="bn",dialog=useRef<HTMLDialogElement>(null);
 const [secret,setSecret]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[copied,setCopied]=useState(false);
 useEffect(()=>{if(!secret)return;const timer=setTimeout(()=>{setSecret("");dialog.current?.close()},60000);return()=>clearTimeout(timer)},[secret]);
 async function reveal(){setBusy(true);setError("");try{
  const r=await fetch(`/api/go/workspaces/${workspaceId}/automatic-webhook-secret?environment=${environment}`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
  if(!r.ok)throw Error(String(r.status));const data=await r.json();if(typeof data.signing_secret!=="string")throw Error("INVALID_RESPONSE");setSecret(data.signing_secret);
 }catch{setError(bn?"Signing secret পাওয়া যায়নি। আবার চেষ্টা করুন।":"Unable to reveal signing secret. Try again.")}finally{setBusy(false)}}
 function close(){setSecret("");setError("");setCopied(false);dialog.current?.close()}
 return <section className="ws-card ref-signing-secret ek-key-webhook">
  <div><strong>{bn?"Webhook signing":"Webhook signing"}</strong><small>{bn?"পেমেন্ট callback যাচাইয়ের secret":"Secret for verifying payment callbacks"}</small></div>
  <button type="button" onClick={()=>dialog.current?.showModal()}>{bn?"সিক্রেট দেখুন":"Reveal secret"}</button>
  <dialog ref={dialog} className="ekv2-export-dialog ek-key-secret-dialog" aria-label={bn?"Webhook secret":"Webhook secret"} onClose={()=>{setSecret("");setError("");setCopied(false)}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
   <h2>{bn?"Webhook secret":"Webhook secret"}</h2>{error&&<p role="alert">{error}</p>}
   {secret?<><div className="ek-key-secret-value"><code>{secret}</code><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopied(true)}catch{setCopied(false)}}}>{copied?(bn?"কপি হয়েছে":"Copied"):(bn?"কপি করুন":"Copy")}</button></div><p>{bn?"এই সিক্রেট কেবল server-এ সংরক্ষণ করুন।":"Keep this secret on your server."}</p></>:<div className="ek-key-secret-value"><code>whsec_••••••••••••</code><button type="button" disabled={busy} onClick={()=>void reveal()}>{busy?(bn?"খুলছে…":"Revealing…"):(bn?"দেখান":"Show secret")}</button></div>}
   <div className="ek-key-confirm-actions"><button type="button" onClick={close}>{bn?"বন্ধ করুন":"Close"}</button></div>
  </dialog>
 </section>;
}
