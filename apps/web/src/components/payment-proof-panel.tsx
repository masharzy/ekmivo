"use client";
// Payment proof on the checkout (owner decision 2026-11-22).
// * The shop's SMS phone is offline: a clear notice that automatic verification
//   is not possible right now, and the customer can still pay and leave proof.
// * While waiting: a notice that the TrxID or receipt can be left (shown at once, owner 2026-11-23).
// * The TrxID box and receipt photo upload are always there while waiting, and
//   after the checkout expired (the usual case of a phone that was offline).
// Hidden entirely while BRIOFOLD_PAYMENT_PROOFS_ENABLED is off (the API answers 404).
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./payment-proof-panel.module.css";

type ProofStatus={submitted:boolean;state?:string;has_trx_id?:boolean;image_count?:number};
const MAX_IMAGES=5;

const messages:Record<string,[string,string]>={
 INVALID_TRX_ID:["Check the Transaction ID: 6 to 24 letters or digits.","Transaction ID ঠিক আছে কি না দেখুন: ৬ থেকে ২৪টা অক্ষর বা সংখ্যা।"],
 EMPTY_PROOF:["Enter the Transaction ID or add a photo.","Transaction ID লিখুন অথবা ছবি দিন।"],
 PROOF_IMAGE_INVALID:["This file could not be read as a photo. Use a JPG or PNG screenshot.","ফাইলটা ছবি হিসেবে পড়া গেল না। JPG বা PNG স্ক্রিনশট দিন।"],
 PROOF_IMAGE_TOO_LARGE:["The photo is too large. Try a screenshot.","ছবিটা অনেক বড়। একটা স্ক্রিনশট দিয়ে চেষ্টা করুন।"],
 PROOF_STORAGE_UNAVAILABLE:["Photos cannot be received right now. Please enter the Transaction ID instead.","এই মুহূর্তে ছবি নেওয়া যাচ্ছে না। অনুগ্রহ করে Transaction ID লিখে দিন।"],
 PROOF_LIMIT_REACHED:["You have already sent the maximum number of photos.","সর্বোচ্চ সংখ্যক ছবি পাঠানো হয়ে গেছে।"],
 PROOF_NOT_ALLOWED:["This payment is already settled; nothing more is needed.","এই পেমেন্টের কাজ শেষ, আর কিছু দিতে হবে না।"],
};

// Shrink to at most 1600 px and re-encode as JPEG in the browser, so the upload
// stays small on mobile data and under the hosting request limit.
async function shrink(file:File):Promise<Blob>{
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext("2d");if(!ctx)throw new Error("canvas");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 return await new Promise<Blob>((ok,no)=>canvas.toBlob(b=>b?ok(b):no(new Error("encode")),"image/jpeg",0.82));
}

export function PaymentProofPanel({token,bn,offline,expired,onAvailable}:{token:string;bn:boolean;offline:boolean;expired?:boolean;onAvailable?:(on:boolean)=>void}){
 const route="/api/checkout/"+token+"/proof";
 const tr=(en:string,b:string)=>bn?b:en;
 const [available,setAvailable]=useState<boolean|null>(null);
 const [status,setStatus]=useState<ProofStatus>({submitted:false});
 const [trx,setTrx]=useState("");
 const [busy,setBusy]=useState<""|"trx"|"image">("");
 const [error,setError]=useState("");
 const [done,setDone]=useState("");
 const fileInput=useRef<HTMLInputElement>(null);

 useEffect(()=>{
  const ctl=new AbortController();
  fetch(route,{cache:"no-store",signal:ctl.signal}).then(async r=>{
   if(r.status===404){setAvailable(false);onAvailable?.(false);return}
   const json=await r.json().catch(()=>null);
   if(r.ok&&json){setStatus(json);setAvailable(true);onAvailable?.(true)}else{setAvailable(false);onAvailable?.(false)}
  }).catch(()=>{if(!ctl.signal.aborted){setAvailable(false);onAvailable?.(false)}});
  return()=>ctl.abort();
 },[route,onAvailable]);

 const fail=useCallback(async(r:Response)=>{
  const json=await r.json().catch(()=>null);
  const code=json?.error?.code||json?.code||"";
  setError(messages[code]?tr(...messages[code]):tr("Could not send. Please try again.","পাঠানো গেল না। আবার চেষ্টা করুন।"));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[bn]);

 async function sendTrx(){
  setError("");setDone("");
  if(!/^[A-Za-z0-9\s-]{6,40}$/.test(trx.trim())){setError(tr(...messages.INVALID_TRX_ID));return}
  setBusy("trx");
  try{
   const r=await fetch(route,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trx_id:trx.trim()})});
   if(!r.ok){await fail(r);return}
   setStatus(await r.json());setTrx("");setDone(tr("Transaction ID received. The shop will check it.","Transaction ID পেয়েছি। দোকান যাচাই করে নেবে।"));
  }catch{setError(tr("No connection. Please try again.","সংযোগ নেই। আবার চেষ্টা করুন।"))}
  finally{setBusy("")}
 }

 async function sendImages(files:FileList|null){
  setError("");setDone("");
  if(!files||!files.length)return;
  const room=MAX_IMAGES-(status.image_count||0);
  if(room<=0){setError(tr(...messages.PROOF_LIMIT_REACHED));return}
  setBusy("image");
  let sent=0;
  try{
   for(const file of Array.from(files).slice(0,room)){
    let blob:Blob;
    try{blob=await shrink(file)}catch{setError(tr(...messages.PROOF_IMAGE_INVALID));continue}
    const r=await fetch(route+"/image",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:blob});
    if(!r.ok){await fail(r);break}
    setStatus(await r.json());sent++;
   }
   if(sent)setDone(sent===1?tr("Photo received. The shop will check it.","ছবি পেয়েছি। দোকান যাচাই করে নেবে।"):tr(sent+" photos received. The shop will check them.",sent+"টা ছবি পেয়েছি। দোকান যাচাই করে নেবে।"));
  }catch{setError(tr("No connection. Please try again.","সংযোগ নেই। আবার চেষ্টা করুন।"))}
  finally{setBusy("");if(fileInput.current)fileInput.current.value=""}
 }

 if(!available)return null;
 if(status.state==="approved"||status.state==="auto_verified")return null;
 const imageCount=status.image_count||0;

 return <section className={styles.panel} aria-label={tr("Payment proof","পেমেন্টের প্রমাণ")} data-testid="payment-proof-panel">
  {offline&&!expired&&<div className={styles.notice} role="alert">
   <strong>{tr("Automatic verification is not possible right now","অটোমেটিক যাচাই এই মুহূর্তে সম্ভব হচ্ছে না")}</strong>
   <p>{tr("The shop's payment verification phone is offline at the moment. You can still send the money. Then enter your Transaction ID below, or upload a photo or screenshot of the payment receipt. The shop will check it and confirm your payment.",
    "দোকানের পেমেন্ট যাচাইয়ের ফোনটি এই মুহূর্তে অফলাইনে আছে, তাই অটোমেটিক যাচাই এখন সম্ভব হচ্ছে না। আপনি নিশ্চিন্তে টাকা পাঠান। তারপর নিচে Transaction ID লিখুন, অথবা টাকা পাঠানোর রসিদ বা স্ক্রিনশটের ছবি আপলোড করুন। দোকান নিজে যাচাই করে আপনার পেমেন্ট নিশ্চিত করবে।")}</p>
  </div>}
  {!offline&&!expired&&!status.submitted&&<div className={styles.notice} role="status">
   <strong>{tr("Sent the money but not verified yet?","টাকা পাঠিয়েছেন, কিন্তু এখনো যাচাই হয়নি?")}</strong>
   <p>{tr("Don't worry. Enter the Transaction ID or upload the receipt below and keep it here. The shop will verify it by hand.",
    "চিন্তা করবেন না। নিচে Transaction ID দিন বা রসিদের ছবি আপলোড করে রাখুন। দোকান নিজে যাচাই করে নেবে।")}</p>
  </div>}
  {expired&&<div className={styles.notice} role="status">
   <strong>{tr("Already sent the money?","টাকা কি পাঠিয়ে ফেলেছেন?")}</strong>
   <p>{tr("Do not pay again. Enter the Transaction ID or upload the receipt below and the shop will check it.",
    "আবার পাঠাবেন না। নিচে Transaction ID দিন বা রসিদের ছবি আপলোড করুন, দোকান যাচাই করে নেবে।")}</p>
  </div>}

  <h3 className={styles.title}>{tr("Transaction ID or receipt","Transaction ID বা রসিদ")}</h3>
  <p className={styles.hint}>{tr("You will find the Transaction ID (TrxID) in the payment SMS or in the app's history.","Transaction ID (TrxID) পাবেন টাকা পাঠানোর SMS-এ বা অ্যাপের হিস্টরিতে।")}</p>
  <div className={styles.row}>
   <input className={styles.input} value={trx} onChange={e=>setTrx(e.target.value)} placeholder={tr("e.g. 9A7X3K2M","যেমন 9A7X3K2M")}
    inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={40} aria-label="Transaction ID" disabled={busy!==""}/>
   <button type="button" className={styles.primary} onClick={()=>void sendTrx()} disabled={busy!==""||!trx.trim()}>{busy==="trx"?tr("Sending…","পাঠানো হচ্ছে…"):tr("Send","পাঠান")}</button>
  </div>
  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/*" multiple hidden onChange={e=>void sendImages(e.target.files)}/>
  <button type="button" className={styles.upload} onClick={()=>fileInput.current?.click()} disabled={busy!==""||imageCount>=MAX_IMAGES}>
   {busy==="image"?tr("Uploading…","আপলোড হচ্ছে…"):tr("Upload receipt photo or screenshot","রসিদের ছবি বা স্ক্রিনশট আপলোড করুন")}
  </button>
  <p className={styles.hint}>{tr("Up to "+MAX_IMAGES+" photos. Photos are deleted after 30 days.","সর্বোচ্চ "+MAX_IMAGES+"টা ছবি। ছবি ৩০ দিন পরে মুছে যায়।")}</p>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {done&&<p className={styles.ok} role="status">{done}</p>}
  {status.submitted&&!done&&<p className={styles.ok} role="status">{status.state==="rejected"
   ?tr("The shop could not confirm what you sent. Please check and send again.","দোকান আপনার পাঠানো তথ্য নিশ্চিত করতে পারেনি। দেখে আবার পাঠান।")
   :tr("Received: "+(status.has_trx_id?"Transaction ID":"")+(status.has_trx_id&&imageCount?" and ":"")+(imageCount?imageCount+" photo(s)":"")+". The shop will check it.",
    "পাওয়া গেছে: "+(status.has_trx_id?"Transaction ID":"")+(status.has_trx_id&&imageCount?" আর ":"")+(imageCount?imageCount+"টা ছবি":"")+"। দোকান যাচাই করে নেবে।")}</p>}
 </section>;
}
