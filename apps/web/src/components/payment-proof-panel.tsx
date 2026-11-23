"use client";
// Payment proof on the checkout (owner decision 2026-11-22).
// * The shop's SMS phone is offline: a clear notice that automatic verification
//   is not possible right now, and the customer can still pay and leave proof.
// * Owner 2026-11-23: no TrxID box and no explanations; one upload button in the
//   theme's own style, above Cancel. Tapping it opens a picker of up to 5 photos.
// Hidden entirely while BRIOFOLD_PAYMENT_PROOFS_ENABLED is off (the API answers 404).
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./payment-proof-panel.module.css";

type ProofStatus={submitted:boolean;state?:string;has_trx_id?:boolean;image_count?:number};
const MAX_IMAGES=5;

const messages:Record<string,[string,string]>={
 INVALID_TRX_ID:["Check the Transaction ID: 6 to 24 letters or digits.","Transaction ID ঠিক আছে কি না দেখুন: ৬ থেকে ২৪টা অক্ষর বা সংখ্যা।"],
 EMPTY_PROOF:["Add a photo.","ছবি দিন।"],
 PROOF_IMAGE_INVALID:["This file could not be read as a photo. Use a JPG or PNG screenshot.","ফাইলটা ছবি হিসেবে পড়া গেল না। JPG বা PNG স্ক্রিনশট দিন।"],
 PROOF_IMAGE_TOO_LARGE:["The photo is too large. Try a screenshot.","ছবিটা অনেক বড়। একটা স্ক্রিনশট দিয়ে চেষ্টা করুন।"],
 PROOF_STORAGE_UNAVAILABLE:["Photos cannot be received right now. Please try again in a minute.","এই মুহূর্তে ছবি নেওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।"],
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

export type ProofSkin="gateway"|"themed"|"classic";

export function PaymentProofPanel({token,bn,offline,expired,onAvailable,skin="classic"}:{token:string;bn:boolean;offline:boolean;expired?:boolean;onAvailable?:(on:boolean)=>void;skin?:ProofSkin}){
 const route="/api/checkout/"+token+"/proof";
 const tr=(en:string,b:string)=>bn?b:en;
 const [available,setAvailable]=useState<boolean|null>(null);
 const [status,setStatus]=useState<ProofStatus>({submitted:false});
 const [busy,setBusy]=useState<""|"image">("");
 const [error,setError]=useState("");
 const fileInput=useRef<HTMLInputElement>(null);
 // Owner 2026-11-23: only an upload button; tapping it opens the picker with up to 5 photos.
 const [open,setOpen]=useState(false);
 const [picked,setPicked]=useState<{file:File;url:string}[]>([]);
 const pickedRef=useRef(picked);pickedRef.current=picked;
 useEffect(()=>()=>pickedRef.current.forEach(x=>URL.revokeObjectURL(x.url)),[]);

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

 function add(files:FileList|null){
  setError("");
  if(!files)return;
  const room=MAX_IMAGES-(status.image_count||0)-picked.length;
  const next=Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,Math.max(0,room)).map(file=>({file,url:URL.createObjectURL(file)}));
  if(files.length>room)setError(tr("Up to "+MAX_IMAGES+" photos.","সর্বোচ্চ "+MAX_IMAGES+"টা ছবি।"));
  setPicked(p=>[...p,...next]);
  if(fileInput.current)fileInput.current.value="";
 }
 function remove(i:number){setPicked(p=>{URL.revokeObjectURL(p[i].url);return p.filter((_,j)=>j!==i)})}

 async function send(){
  setError("");
  if(!picked.length){setError(tr(...messages.EMPTY_PROOF));return}
  setBusy("image");
  let sent=0;
  try{
   for(const x of picked){
    let blob:Blob;
    try{blob=await shrink(x.file)}catch{setError(tr(...messages.PROOF_IMAGE_INVALID));break}
    const r=await fetch(route+"/image",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:blob});
    if(!r.ok){await fail(r);break}
    setStatus(await r.json());sent++;
   }
  }catch{setError(tr("No connection. Please try again.","সংযোগ নেই। আবার চেষ্টা করুন।"))}
  finally{
   setBusy("");
   if(sent){setPicked(p=>{p.slice(0,sent).forEach(x=>URL.revokeObjectURL(x.url));const rest=p.slice(sent);if(!rest.length)setOpen(false);return rest})}
  }
 }

 if(!available)return null;
 if(status.state==="approved"||status.state==="auto_verified")return null;
 const imageCount=status.image_count||0;
 // Owner 2026-11-23: once sent, show "sent" and stop; a new upload only after the shop rejects it.
 const sent=status.submitted&&status.state!=="rejected";
 const left=status.state==="rejected"?MAX_IMAGES:MAX_IMAGES-imageCount;

 return <section className={styles.panel} data-skin={skin} aria-label={tr("Payment receipt","পেমেন্টের রসিদ")} data-testid="payment-proof-panel">
  {offline&&!expired&&!sent&&<div className={styles.notice} role="alert">{tr("The shop's phone is offline, so automatic verification is not possible now. Pay, then upload the receipt.","দোকানের ফোন অফলাইনে, তাই এখন অটোমেটিক যাচাই হবে না। টাকা পাঠিয়ে রসিদ আপলোড করুন।")}</div>}
  {sent&&!picked.length?<div className={styles.sent} role="status">
   <span className={styles.tick} aria-hidden="true">✓</span>
   <div><b>{tr("Receipt sent","রসিদ পাঠানো হয়েছে")}</b><small>{tr("The shop will check it and confirm your payment.","দোকান যাচাই করে আপনার পেমেন্ট নিশ্চিত করবে।")}</small></div>
  </div>:<>
  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/*" multiple hidden onChange={e=>add(e.target.files)}/>
  {status.state==="rejected"&&!open&&<p className={styles.error} role="alert">{tr("The shop could not confirm the receipt. Please send it again.","দোকান রসিদটা নিশ্চিত করতে পারেনি। আবার পাঠান।")}</p>}
  {!open?<button type="button" className={styles.btn} onClick={()=>{setOpen(true);if(!picked.length)fileInput.current?.click()}} disabled={left<=0}>
   {tr("Upload receipt","রসিদ আপলোড করুন")}
  </button>:<div className={styles.box}>
   <div className={styles.grid}>
    {picked.map((x,i)=><div key={x.url} className={styles.th}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={x.url} alt=""/>
     <button type="button" aria-label={tr("Remove","সরান")} onClick={()=>remove(i)} disabled={busy!==""}>×</button></div>)}
    {picked.length<left&&<button type="button" className={styles.add} onClick={()=>fileInput.current?.click()} disabled={busy!==""} aria-label={tr("Add photo","ছবি যোগ করুন")}>+</button>}
   </div>
   <div className={styles.row}>
    <button type="button" className={styles.ghost} onClick={()=>{picked.forEach(x=>URL.revokeObjectURL(x.url));setPicked([]);setOpen(false);setError("")}} disabled={busy!==""}>{tr("Cancel","বাতিল")}</button>
    <button type="button" className={styles.send} onClick={()=>void send()} disabled={busy!==""||!picked.length}>{busy?tr("Sending…","পাঠানো হচ্ছে…"):tr("Send","পাঠান")+(picked.length?" ("+picked.length+")":"")}</button>
   </div>
  </div>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
  </>}
 </section>;
}
