"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {attachmentKey,readAttachment,saveAttachment,type AttachmentDraft} from "../lib/client/inbox-attachments";
import {registerDraft} from "../lib/client/draft-navigation";
import styles from "./workspace-messaging.module.css";
export function InboxAttachmentComposer({workspaceId,actorId,threadId,bn,disabled,documentAllowed,onBusy,onSent}:{workspaceId:string;actorId:string;threadId:string;bn:boolean;disabled:boolean;documentAllowed:boolean;onBusy:(busy:boolean)=>void;onSent:()=>Promise<void>}){
 const t=(en:string,be:string)=>bn?be:en;
 const [draft,setDraft]=useState<AttachmentDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const file=useRef<File|null>(null),lock=useRef(false),input=useRef<HTMLInputElement|null>(null);
 const key=attachmentKey(actorId,workspaceId,threadId);
 useEffect(()=>{const timer=setTimeout(()=>{try{setDraft(readAttachment(sessionStorage,key));}catch{setError(bn?"সংযুক্ত ফাইলের draft পড়া যায়নি।":"Could not read the attachment draft.");}},0);return()=>clearTimeout(timer);},[bn,key]);
 const discard=useCallback(()=>{saveAttachment(sessionStorage,key,null);file.current=null;setDraft(null);if(input.current)input.current.value="";},[key]);
 useEffect(()=>registerDraft({id:`inbox-attachment:${actorId}:${workspaceId}:${threadId}`,isDirty:()=>!!file.current&&!draft?.uploaded,save:async()=>false,discard}),[actorId,discard,draft,threadId,workspaceId]);
 async function choose(selected:File|undefined){
  if(!selected||lock.current)return;
  if(selected.size<1||selected.size>5242880||(!documentAllowed&&!selected.type.startsWith("image/")&&!selected.type.startsWith("audio/"))){setError(t("Choose a supported file up to 5 MB. Instagram does not support documents.","সর্বোচ্চ ৫ MB-এর অনুমোদিত ফাইল বেছে নিন। Instagram-এ document সমর্থিত নয়।"));return;}
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
  }catch(e){setError(e instanceof Error&&["FILE_SCAN_UNCONFIRMED","PRIVATE_STORAGE_UNAVAILABLE"].includes(e.message)?t("Secure attachment storage or scanning is unavailable. Your file has not been sent.","নিরাপদ ফাইল সংরক্ষণ অথবা scan পাওয়া যাচ্ছে না। ফাইল পাঠানো হয়নি।"):t("Could not confirm the attachment. Retry uses the same request; check the conversation before discarding.","ফাইল পাঠানো নিশ্চিত হয়নি। আবার চেষ্টা করলে একই অনুরোধ থাকবে; বাতিলের আগে কথোপকথন দেখুন।"));}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <div className={styles.workflow}><label>{t("Attach file (up to 5 MB)","ফাইল যুক্ত করুন (সর্বোচ্চ ৫ MB)")}<input ref={input} type="file" aria-label={t("Attach file","ফাইল যুক্ত করুন")} disabled={busy||disabled} accept={documentAllowed?"image/jpeg,image/png,audio/mpeg,audio/ogg,audio/mp4,audio/aac,application/pdf,text/plain":"image/jpeg,image/png,audio/mpeg,audio/ogg,audio/mp4,audio/aac"} onChange={e=>void choose(e.target.files?.[0])}/></label>{draft&&<><p>{draft.name} · {Math.ceil(draft.size/1024)} KB</p><button type="button" disabled={busy||disabled} onClick={()=>void send()}>{busy?t("Sending…","পাঠানো হচ্ছে…"):t("Send attachment","ফাইল পাঠান")}</button><button type="button" disabled={busy||disabled} onClick={()=>{if(window.confirm(t("Discard pending attachment? Check for an already queued message first.","অপেক্ষায় থাকা ফাইল বাতিল করবেন? আগে মেসেজ queue হয়েছে কিনা দেখুন।")))try{discard();}catch{setError(t("Could not discard. Retry.","বাতিল হয়নি। আবার চেষ্টা করুন।"));}}}>{t("Discard attachment","ফাইল বাদ দিন")}</button></>}{error&&<p role="alert">{error}</p>}</div>;
}
