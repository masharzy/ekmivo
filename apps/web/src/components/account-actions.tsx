"use client";

import { useActionState,useEffect,useRef,useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDisplayName,revokeOtherSessions,type ProfileActionState } from "../actions/profile";
const profileInitial:ProfileActionState={status:"idle",message:""};

type Locale="bn"|"en";
function Submit({label}:{label:string}){
 const {pending}=useFormStatus();
 return <button className="ek-action" type="submit" disabled={pending} aria-busy={pending}>{pending?"…":label}</button>;
}

export function AccountActions({locale,name:initialName,accountId}:{locale:Locale;name:string;accountId:string}){
 const [profile,save]=useActionState(saveDisplayName.bind(null,locale),profileInitial);
 const [sessions,revoke]=useActionState(revokeOtherSessions.bind(null,locale),profileInitial);
 const [name,setName]=useState(initialName);
 const [pendingUrl,setPendingUrl]=useState("");
 const [draftMessage,setDraftMessage]=useState("");
 const dialog=useRef<HTMLDialogElement>(null);
 const leaving=useRef(false);
 const bn=locale==="bn";
 const savedName=profile.status==="success" && profile.savedName!==undefined ? profile.savedName : initialName;
 const dirty=name!==savedName;
 const key=`ekmivo:account-name-draft:v1:${accountId}`;

 // A confirmed server save supersedes any stale tab-local name draft.
 useEffect(()=>{
  if(profile.status!=="success")return;
  try{window.sessionStorage.removeItem(key);}catch{/* Optional storage. */}
 },[profile.status,key]);

 const restore=()=>{
  try{
   const value=window.sessionStorage.getItem(key);
   if(value===null||value.length<2||value.length>100){throw Error("no valid draft");}
   setName(value);
   setDraftMessage(bn?"এই ট্যাবের ড্রাফট ফিরিয়ে আনা হয়েছে।":"Restored the saved draft in this tab.");
  }catch{setDraftMessage(bn?"এই ট্যাবে কোনো বৈধ ড্রাফট পাওয়া যায়নি।":"No valid draft is available in this tab.");}
 };
 const leave=(choice:"save"|"discard")=>{
  if(choice==="save"){
   try{
    window.sessionStorage.setItem(key,name);
   }catch{
    setDraftMessage(bn?"এই ট্যাবে ড্রাফট রাখা যায়নি।":"Unable to save the draft in this tab.");
    return;
   }
  }else{
   try{window.sessionStorage.removeItem(key);}catch{/* Storage is optional. */}
   setName(savedName);
  }
  const next=pendingUrl;setPendingUrl("");
  dialog.current?.close();
  if(next){leaving.current=true;window.location.assign(next);}
 };
 useEffect(()=>{
  if(!dirty)return;
  const beforeLeave=(event:BeforeUnloadEvent)=>{
   if(leaving.current)return;
   event.preventDefault();event.returnValue="";
  };
  const intercept=(href:string)=>{
   const destination=new URL(href,window.location.href);
   if(destination.origin!==window.location.origin||destination.href===window.location.href)return false;
   setDraftMessage("");setPendingUrl(destination.href);
   if(!dialog.current?.open)dialog.current?.showModal();
   return true;
  };
  const link=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const anchor=event.target instanceof Element?event.target.closest("a[href]"):null;
   if(!anchor||anchor.hasAttribute("download")||anchor.getAttribute("target"))return;
   if(intercept((anchor as HTMLAnchorElement).href)){event.preventDefault();event.stopPropagation();}
  };
  const guarded=(event:Event)=>{
   const e=event as CustomEvent<{href?:string}>;
   if(typeof e.detail?.href==="string"&&intercept(e.detail.href))event.preventDefault();
  };
  window.addEventListener("beforeunload",beforeLeave);
  window.addEventListener("ekmivo:guarded-navigation",guarded);
  document.addEventListener("click",link,true);
  return ()=>{
   window.removeEventListener("beforeunload",beforeLeave);
   window.removeEventListener("ekmivo:guarded-navigation",guarded);
   document.removeEventListener("click",link,true);
  };
 },[dirty,name,savedName,bn]);
 return <>
  <section className="ek-account-panel">
   <h2>{bn?"প্রোফাইল আপডেট":"Edit profile"}</h2>
   <form action={save} className="ek-account-form">
    <label>{bn?"আপনার নাম":"Display name"}
     <input name="name" value={name} onChange={event=>setName(event.target.value)} type="text" minLength={2} maxLength={100} required autoComplete="name" /></label>
    <Submit label={bn?"নাম সংরক্ষণ":"Save name"}/>
    <button type="button" className="ek-profile-draft-button" onClick={restore}>{bn?"এই ট্যাবের ড্রাফট ফিরিয়ে আনুন":"Restore tab draft"}</button>
    {dirty&&<p role="status" className="ek-onboard-note">{bn?"নাম পরিবর্তনটি সার্ভারে সংরক্ষিত হয়নি।":"This name change is not saved on the server."}</p>}
    {profile.status!=="idle"&&<p className={profile.status==="error"?"ek-form-error":"ek-account-success"} role="status">{profile.message}</p>}
    {draftMessage&&<p role="status" className="ek-onboard-note">{draftMessage}</p>}
   </form>
  </section>
  <section className="ek-account-panel">
   <h2>{bn?"সেশন নিরাপত্তা":"Session security"}</h2>
   <p>{bn?"এখনকার সেশন রেখে অন্য সব সক্রিয় লগইন বন্ধ করা হবে।":"Revoke all other active logins while keeping this session."}</p>
   <form action={revoke} className="ek-account-form">
    <Submit label={bn?"অন্য সেশনগুলো বন্ধ করুন":"Revoke other sessions"}/>
    {sessions.status!=="idle"&&<p className={sessions.status==="error"?"ek-form-error":"ek-account-success"} role="status">{sessions.message}</p>}
   </form>
  </section>
  <dialog ref={dialog} className="ek-onboard-leave" aria-label={bn?"অসম্পূর্ণ প্রোফাইল":"Unsaved profile"} onClose={()=>setPendingUrl("")}>
   <h2>{bn?"অসম্পূর্ণ প্রোফাইল পরিবর্তন":"Unsaved profile changes"}</h2>
   <p>{bn?"সার্ভারে এখনো নাম সংরক্ষিত হয়নি। এই ট্যাবে ড্রাফট রাখবে, বাতিল করবে, নাকি এখানেই থাকবে?":"The name is not saved on the server. Keep a draft in this tab, discard it, or stay."}</p>
   <div className="ek-onboard-leave-actions">
    <button type="button" onClick={()=>leave("save")}>{bn?"ড্রাফট রেখে যান":"Save draft & leave"}</button>
    <button type="button" onClick={()=>leave("discard")}>{bn?"বাতিল করে যান":"Discard & leave"}</button>
    <button type="button" onClick={()=>{dialog.current?.close();setPendingUrl("");}}>{bn?"এখানেই থাকুন":"Stay"}</button>
   </div>
  </dialog>
 </>;
}
