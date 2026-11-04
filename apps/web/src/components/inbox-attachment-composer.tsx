"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {attachmentKey,readAttachment,saveAttachment,type AttachmentDraft} from "../lib/client/inbox-attachments";
import {inboxAttachmentAccept,inboxAttachmentSupported,inboxAudioTypes,type InboxMediaCapabilities} from "../lib/client/inbox-attachment-types";
import {registerDraft} from "../lib/client/draft-navigation";
import {DashboardIcon as Icon} from "./dashboard-icon";
import styles from "./workspace-messaging.module.css";
export function InboxAttachmentComposer({workspaceId,actorId,threadId,bn,disabled,capabilities,onBusy,onSent}:{workspaceId:string;actorId:string;threadId:string;bn:boolean;disabled:boolean;capabilities:InboxMediaCapabilities;onBusy:(busy:boolean)=>void;onSent:()=>Promise<void>}){
 const t=(en:string,be:string)=>bn?be:en;
 const [draft,setDraft]=useState<AttachmentDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const file=useRef<File|null>(null),lock=useRef(false),input=useRef<HTMLInputElement|null>(null),audioInput=useRef<HTMLInputElement|null>(null);
 const key=attachmentKey(actorId,workspaceId,threadId);
 useEffect(()=>{const timer=setTimeout(()=>{try{setDraft(readAttachment(sessionStorage,key));}catch{setError(bn?"সংযুক্ত ফাইলের draft পড়া যায়নি।":"Could not read the attachment draft.");}},0);return()=>clearTimeout(timer);},[bn,key]);
 const discard=useCallback(()=>{saveAttachment(sessionStorage,key,null);file.current=null;setDraft(null);if(input.current)input.current.value="";if(audioInput.current)audioInput.current.value="";},[key]);
 useEffect(()=>registerDraft({id:`inbox-attachment:${actorId}:${workspaceId}:${threadId}`,isDirty:()=>!!file.current&&!draft?.uploaded,save:async()=>false,discard}),[actorId,discard,draft,threadId,workspaceId]);
 async function choose(selected:File|undefined){
  if(!selected||lock.current)return;
  if(!inboxAttachmentSupported(selected,capabilities)){setError(t("Choose a supported image, audio or document up to 5 MB for this channel.","এই চ্যানেলের জন্য সর্বোচ্চ ৫ MB-এর সমর্থিত ছবি, অডিও বা ডকুমেন্ট বেছে নিন।"));return;}
  lock.current=true;setBusy(true);onBusy(true);
  try{
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await selected.arrayBuffer())),x=>x.toString(16).padStart(2,"0")).join("");
   if(draft&&draft.fingerprint!==fingerprint){setError(t("A different attachment is pending. Review it before discarding.","অন্য একটি ফাইল অপেক্ষায় আছে। বাতিলের আগে পরীক্ষা করুন।"));return;}
   const next=draft??{mediaId:crypto.randomUUID(),sendKey:crypto.randomUUID(),fingerprint,name:selected.name.slice(0,200),size:selected.size,uploaded:false,expires:Date.now()+86400000};
   saveAttachment(sessionStorage,key,next);file.current=selected;setDraft(next);setError("");
  }catch{setError(t("The attachment draft could not be saved. Retry.","সংযুক্ত ফাইলের draft সংরক্ষণ হয়নি। আবার চেষ্টা করুন।"));}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function send(){
  if(lock.current||disabled||!draft)return;lock.current=true;setBusy(true);onBusy(true);setError("");
  const api=async(action:string,body:object)=>{const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,thread_id:threadId,body})});if(!response.ok){const result=await response.json();throw Error(String(result.error?.code??result.code));}return response.json();};
  try{
   if(!draft.uploaded){
    if(!file.current){setError(t("Choose the same file again to resume this upload.","আপলোড চালাতে একই ফাইল আবার বেছে নিন।"));return;}
    const selected=file.current;
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error());reader.readAsDataURL(selected);});
    await api("media-upload",{media_id:draft.mediaId,data,mime:selected.type,name:draft.name});
    const next={...draft,uploaded:true};saveAttachment(sessionStorage,key,next);setDraft(next);
   }
   await api("send-media",{media_id:draft.mediaId,idempotency_key:draft.sendKey});
   discard();await onSent();
  }catch(e){const code=e instanceof Error?e.message:"";setError(["FILE_SCAN_UNCONFIRMED","PRIVATE_STORAGE_UNAVAILABLE","MEDIA_ORIGIN_NOT_CONFIGURED"].includes(code)?t("Attachment storage, scanning or media delivery is unavailable. Your file has not been confirmed sent.","ফাইল সংরক্ষণ, স্ক্যান বা মিডিয়া ডেলিভারি পাওয়া যাচ্ছে না। ফাইল পাঠানো নিশ্চিত হয়নি।"):["BODY_TOO_LARGE","FILE_LIMIT_EXCEEDED"].includes(code)?t("The file exceeds the 5 MB upload limit.","ফাইলের আকার ৫ MB সীমা ছাড়িয়েছে।"):["UNSUPPORTED_FILE_TYPE","UNSUPPORTED_MESSAGE","INVALID_MEDIA"].includes(code)?t("This channel cannot send that file type. Choose another supported file.","এই চ্যানেলে ফাইলের ধরনটি পাঠানো যায় না। সমর্থিত ফাইল বেছে নিন।"):t("Could not confirm the attachment. Retry uses the same request; check the conversation before discarding.","ফাইল পাঠানো নিশ্চিত হয়নি। আবার চেষ্টা করলে একই অনুরোধ থাকবে; বাতিলের আগে কথোপকথন দেখুন।"));}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 const attachAllowed=capabilities.image||capabilities.audio||capabilities.document;
 const accept=inboxAttachmentAccept(capabilities);
 return <div className={styles.attachmentComposer}>
  <div className={styles.attachmentButtons}>
   <input ref={input} className={styles.visuallyHiddenInput} tabIndex={-1} type="file" aria-label={t("Choose attachment","সংযুক্তি বেছে নিন")} disabled={busy||disabled||!attachAllowed} accept={accept} onChange={e=>{void choose(e.target.files?.[0]);e.currentTarget.value="";}}/>
   <button type="button" className={styles.iconButton} disabled={busy||disabled||!attachAllowed} title={attachAllowed?t("Attach photo, audio or file (up to 5 MB)","ছবি, অডিও বা ফাইল যুক্ত করুন (সর্বোচ্চ ৫ MB)"):t("Attachments are not available for this channel","এই চ্যানেলে সংযুক্তি পাঠানো যায় না")} aria-label={t("Attach file","ফাইল যুক্ত করুন")} onClick={()=>input.current?.click()}><Icon name="paperclip"/></button>
   <input ref={audioInput} className={styles.visuallyHiddenInput} tabIndex={-1} type="file" aria-label={t("Choose an audio file","অডিও ফাইল বেছে নিন")} disabled={busy||disabled||!capabilities.audio} accept={inboxAudioTypes.join(",")} onChange={e=>{void choose(e.target.files?.[0]);e.currentTarget.value="";}}/>
   <button type="button" className={styles.iconButton} disabled={busy||disabled||!capabilities.audio} title={t("Attach an audio file (voice recording is not available)","অডিও ফাইল যুক্ত করুন (সরাসরি ভয়েস রেকর্ডিং এখন নেই)")} aria-label={t("Attach audio file","অডিও ফাইল যুক্ত করুন")} onClick={()=>audioInput.current?.click()}><Icon name="mic"/></button>
  </div>
  {draft&&<div className={styles.attachmentPreview} role="status"><span className={styles.attachmentFilename} title={draft.name}>{draft.name} <small>· {Math.ceil(draft.size/1024)} KB</small></span><button type="button" className={styles.attachmentSend} disabled={busy||disabled} onClick={()=>void send()}>{busy?t("Sending…","পাঠানো হচ্ছে…"):t("Send file","ফাইল পাঠান")}</button><button type="button" className={styles.attachmentDiscard} disabled={busy||disabled} aria-label={t("Discard attachment","ফাইল বাদ দিন")} title={t("Discard attachment","ফাইল বাদ দিন")} onClick={()=>{if(window.confirm(t("Discard pending attachment? Check for an already queued message first.","অপেক্ষায় থাকা ফাইল বাতিল করবেন? আগে মেসেজ queue হয়েছে কিনা দেখুন।")))try{discard();setError("");}catch{setError(t("Could not discard. Retry.","বাতিল হয়নি। আবার চেষ্টা করুন।"));}}}><Icon name="close"/></button></div>}
  {error&&<p className={styles.attachmentError} role="alert">{error}</p>}
 </div>;
}
