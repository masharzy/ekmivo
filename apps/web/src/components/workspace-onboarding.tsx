"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspaceAction } from "../actions/account";
import { emptyState, type FormErrorState } from "../lib/server/validation";
import type { Locale } from "../lib/site-copy";
import { draftStorageKey, parseSavedDraft, encodeSavedDraft } from "../lib/onboarding-draft.mjs";

const modes=[
 {value:"ai",title:{en:"AI Communication",bn:"AI যোগাযোগ"},description:{en:"Inbox, AI, knowledge, CRM and follow-ups.",bn:"ইনবক্স, AI, নলেজ, CRM ও ফলো-আপ।"},icon:"✳"},
 {value:"commerce",title:{en:"Commerce & Payments",bn:"কমার্স ও পেমেন্ট"},description:{en:"Orders, payment verification, devices and courier operations.",bn:"অর্ডার, পেমেন্ট যাচাই, ডিভাইস ও কুরিয়ার পরিচালনা।"},icon:"▦"},
 {value:"both",title:{en:"Both services",bn:"দুটি সেবাই"},description:{en:"Keep both independent services in a connected workspace.",bn:"দুটি স্বাধীন সেবা একটি ওয়ার্কস্পেসে সংযুক্ত করুন।"},icon:"↔"}
] as const;
function Submit({locale}:{locale:Locale}){
 const {pending}=useFormStatus();
 return <button className="ek-action" disabled={pending} type="submit">{pending?(locale==="bn"?"তৈরি হচ্ছে…":"Creating…"):(locale==="bn"?"ওয়ার্কস্পেস তৈরি করুন":"Create workspace")} <span>↗</span></button>;
}
type Draft = {name:string;mode:"ai"|"commerce"|"both"};
const EMPTY_DRAFT: Draft = {name:"",mode:"both"};
export function WorkspaceOnboarding({locale,userId}:{locale:Locale;userId:string}){
 const [name,setName]=useState("");
 const [mode,setMode]=useState<"ai"|"commerce"|"both">("both");
 const [saved,setSaved]=useState<Draft>(EMPTY_DRAFT);
 const [notice,setNotice]=useState("");
 const [pendingUrl,setPendingUrl]=useState("");
 const dialog=useRef<HTMLDialogElement>(null);
 const submitting=useRef(false);
 const draftKey=draftStorageKey(userId);
 const dirty=name!==saved.name||mode!==saved.mode;
 const [state,action]=useActionState<FormErrorState,FormData>(createWorkspaceAction.bind(null,locale),emptyState);
 const save=():boolean=>{
  const draft:Draft={name,mode};
  try{
   window.localStorage.setItem(draftKey,encodeSavedDraft(draft));
   setSaved(draft);
   setNotice(locale==="bn"?"এই ব্রাউজারে ড্রাফট সংরক্ষিত হয়েছে।":"Draft saved in this browser.");
   return true;
  }catch{
   setNotice(locale==="bn"?"এই ব্রাউজারে ড্রাফট সংরক্ষণ করা যায়নি।":"Browser storage is unavailable; draft was not saved.");
   return false;
  }
 };
 const restore=()=>{
  try{
   const data=window.localStorage.getItem(draftKey);
   const parsed=parseSavedDraft(data);
   if(!parsed)throw Error("missing/invalid draft");
   setName(parsed.name);setMode(parsed.mode);setSaved(parsed);
   setNotice(locale==="bn"?"সর্বশেষ ড্রাফট ফিরিয়ে আনা হয়েছে।":"Saved draft restored.");
  }catch{setNotice(locale==="bn"?"এই অ্যাকাউন্টের কোনো বৈধ ড্রাফট পাওয়া যায়নি।":"No valid saved draft for this account.");}
 };
 const discard=()=>{
  try{window.localStorage.removeItem(draftKey);}catch{/* No draft stored. */}
  setName("");setMode("both");setSaved(EMPTY_DRAFT);
  setNotice(locale==="bn"?"ড্রাফট বাতিল করা হয়েছে।":"Draft discarded.");
 };
 useEffect(()=>{
  if(!dirty)return;
  const onUnload=(event:BeforeUnloadEvent)=>{
   if(submitting.current)return;
   event.preventDefault();event.returnValue="";
  };
  const confirmNavigation=(href:string)=>{
   const next=new URL(href,window.location.href);
   if(next.origin!==window.location.origin||next.href===window.location.href)return false;
   setPendingUrl(next.href);
   if(!dialog.current?.open)dialog.current?.showModal();
   return true;
  };
  const onLink=(event:MouseEvent)=>{
   if(submitting.current||event.defaultPrevented||event.button!==0||event.ctrlKey||event.shiftKey||event.metaKey||event.altKey)return;
   const anchor=event.target instanceof Element?event.target.closest("a[href]"):null;
   if(!anchor||anchor.hasAttribute("download")||anchor.getAttribute("target"))return;
   if(confirmNavigation((anchor as HTMLAnchorElement).href)){event.preventDefault();event.stopPropagation();}
  };
  // SiteControls uses this event for locale changes that do not have an anchor.
  // Do not persist a new locale or discard form input before Save/Discard/Stay.
  const onGuardedNavigation=(event:Event)=>{
   if(submitting.current)return;
   const href=(event as CustomEvent<{href?:string}>).detail?.href;
   if(typeof href==="string"&&confirmNavigation(href))event.preventDefault();
  };
  window.addEventListener("beforeunload",onUnload);
  window.addEventListener("ekmivo:guarded-navigation",onGuardedNavigation);
  document.addEventListener("click",onLink,true);
  return ()=>{
   window.removeEventListener("beforeunload",onUnload);
   window.removeEventListener("ekmivo:guarded-navigation",onGuardedNavigation);
   document.removeEventListener("click",onLink,true);
  };
 },[dirty,name,mode,locale,draftKey]);
 useEffect(()=>{if(state.status==="error")submitting.current=false;},[state]);
 const leave=(choice:"save"|"discard")=>{
  if(choice==="save"&&!save())return;
  if(choice==="discard")discard();
  const destination=pendingUrl;
  dialog.current?.close();
  setPendingUrl("");
  if(destination){submitting.current=true;window.location.assign(destination);}
 };
 return <section className="ek-onboard" aria-labelledby="setup-title">
  <div className="ek-page-kicker">01 / WORKSPACE SETUP</div>
  <h1 id="setup-title">{locale==="bn"?"ব্যবসার ওয়ার্কস্পেস তৈরি করুন।":"Create your workspace."}</h1>
  <p className="ek-lead">{locale==="bn"?"আপনার কাজের ধরন বেছে নিন। পরেও সুবিধাগুলো স্বাধীনভাবে চালু বা বন্ধ করার ব্যবস্থা থাকবে।":"Choose a starting configuration. Service entitlements remain independent of this preference."}</p>
  <form action={action} className="ek-onboard-form" onSubmit={()=>{submitting.current=true;}}>
   <label className="ek-input-label">{locale==="bn"?"ওয়ার্কস্পেসের নাম":"Business or workspace name"}
    <input value={name} onChange={event=>setName(event.target.value)} name="name" type="text" minLength={2} maxLength={100} required placeholder={locale==="bn"?"যেমন: আমার ব্যবসা":"e.g. North Studio"} aria-invalid={!!state.fields?.name}/>
    {state.fields?.name&&<small className="ek-field-error">{state.fields.name}</small>}
   </label>
   <p className="ek-input-label">{locale==="bn"?"প্রয়োজনীয় সেবা নির্বাচন করুন":"Choose your starting services"}</p>
   <div className="ek-mode-grid" role="radiogroup" aria-label={locale==="bn"?"সেবার ধরন":"Service mode"}>
    {modes.map(item=><label className={`ek-mode-card ${mode===item.value?"is-selected":""}`} key={item.value}>
     <input type="radio" name="mode" value={item.value} checked={mode===item.value} onChange={()=>setMode(item.value)}/>
     <span className="ek-mode-icon" aria-hidden="true">{item.icon}</span>
     <strong>{item.title[locale]}</strong>
     <small>{item.description[locale]}</small>
    </label>)}
   </div>
   {state.fields?.mode&&<small className="ek-field-error">{state.fields.mode}</small>}
   {state.status==="error"&&<p className="ek-form-error" role="alert">{state.message}</p>}
   <Submit locale={locale}/>
   <div className="ek-onboard-draft-controls">
    <button type="button" onClick={save} disabled={!dirty}>{locale==="bn"?"এই ব্রাউজারে ড্রাফট সংরক্ষণ":"Save draft in this browser"}</button>
    <button type="button" onClick={restore}>{locale==="bn"?"ড্রাফট ফিরিয়ে আনুন":"Restore saved draft"}</button>
    <button type="button" onClick={discard}>{locale==="bn"?"ড্রাফট বাতিল":"Discard draft"}</button>
   </div>
   {notice&&<p role="status" className="ek-onboard-note">{notice}</p>}
  </form>
  <p className="ek-onboard-note">{locale==="bn"?"সেবা বেছে নেওয়া মানে কোনো পেইড সাবস্ক্রিপশন সক্রিয় করা নয়।":"Choosing a service does not activate a paid subscription or live provider integration."}</p>
  <dialog ref={dialog} aria-label={locale==="bn"?"অসম্পূর্ণ ফর্ম":"Unsaved changes"} className="ek-onboard-leave" onClose={()=>setPendingUrl("")}>
   <h2>{locale==="bn"?"অসম্পূর্ণ তথ্য আছে":"You have unsaved changes"}</h2>
   <p>{locale==="bn"?"অন্য পৃষ্ঠায় যাওয়ার আগে এই ব্রাউজারে ড্রাফট সংরক্ষণ করবে, বাতিল করবে, নাকি এখানেই থাকবে?":"Before leaving, save your draft locally, discard it or stay on this form."}</p>
   <div className="ek-onboard-leave-actions">
    <button type="button" onClick={()=>leave("save")}>{locale==="bn"?"ড্রাফট সংরক্ষণ করে যান":"Save draft & leave"}</button>
    <button type="button" onClick={()=>leave("discard")}>{locale==="bn"?"বাতিল করে যান":"Discard & leave"}</button>
    <button type="button" onClick={()=>dialog.current?.close()}>{locale==="bn"?"এখানেই থাকুন":"Stay"}</button>
   </div>
  </dialog>
 </section>;
}
