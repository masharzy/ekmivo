"use client";
import Link from "next/link";
import {useActionState,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {saveDisplayName,revokeOtherSessions,revokeAccountSession,type ProfileActionState} from "../actions/profile";
import {resendEmailCodeAction,type RecoveryState} from "../actions/recovery";
import {logoutAction} from "../actions/account";
import {RefIcon} from "./reference-ui";
import {SiteControls} from "./site-controls";
import "./account-dashboard.css";

type Session={id:string;created_at:string;expires_at:string;is_current:boolean};
const initial:ProfileActionState={status:"idle",message:""};

export function AccountSecurityView({locale,user,sessions,mfa,theme}:{locale:"bn"|"en";user:{id:string;name:string;email:string;verified:boolean};sessions:Session[];mfa:boolean;theme:"light"|"dark"|"system"}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en,router=useRouter();
 const [profile,save,saving]=useActionState(saveDisplayName.bind(null,locale),initial);
 const [revoked,revoke,revoking]=useActionState(revokeOtherSessions.bind(null,locale),initial);
 const [verification,verify,verifying]=useActionState(resendEmailCodeAction.bind(null,locale),{status:"idle",message:""} as RecoveryState);
 const [name,setName]=useState(user.name),[message,setMessage]=useState(""),[busy,setBusy]=useState(""),[confirm,setConfirm]=useState(false);
 const [restored,setRestored]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const key="ekmivo:account-name-draft:v1:"+user.id;
 const savedName=profile.status==="success"?profile.savedName||user.name:user.name,dirty=name!==savedName;
 useEffect(()=>{if(!dirty)return;const leave=(e:BeforeUnloadEvent)=>{try{sessionStorage.setItem(key,name)}catch{}e.preventDefault()};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave)},[dirty,key,name]);
 useEffect(()=>{if(profile.status==="success"){setName(profile.savedName||user.name);try{sessionStorage.removeItem(key)}catch{}}},[profile.status,profile.savedName,key,user.name]);
 useEffect(()=>{if(revoked.status==="success")router.refresh()},[revoked.status,router]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
 const stamp=(value:string)=>new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(new Date(value));
 const alert=message||profile.message||revoked.message||verification.message;
 const error=profile.status==="error"||revoked.status==="error"||verification.status==="error";
 const others=sessions.filter(session=>!session.is_current);
 const initials=savedName.trim().slice(0,1).toUpperCase()||"?";
 const restore=()=>{try{const value=sessionStorage.getItem(key);if(value===null||value.length>100)throw Error("NO_DRAFT");setName(value);setRestored(true);setMessage(t("Restored your draft in this tab.","এই ট্যাবের খসড়া ফিরিয়ে আনা হয়েছে।"))}catch{setMessage(t("No saved draft in this tab.","এই ট্যাবে কোনো খসড়া নেই।"))}};
 return <div className="account-page" lang={locale}>
  <header className="ac-top"><Link href="/workspaces" className="ac-brand">ekmivo</Link><div className="ac-top-actions"><Link href="/workspaces" className="ac-back">{t("Workspaces","ওয়ার্কস্পেস")}</Link><SiteControls locale={locale} initialTheme={theme} compactThemeToggle/><span className="ac-mini-avatar" aria-label={savedName}>{initials}</span></div></header>
  <main className="ac-main">
   <div className="ac-page-head"><h1>{t("Account settings","অ্যাকাউন্ট সেটিংস")}</h1><p>{t("Your profile, sign-in and active sessions.","আপনার প্রোফাইল, লগইন ও সক্রিয় সেশন।")}</p></div>
   <section className="ac-identity" aria-label={t("Account summary","অ্যাকাউন্ট পরিচিতি")}><span className="ac-avatar">{initials}</span><div className="ac-identify"><strong>{savedName}</strong><span>{user.email}</span></div><span className={"ac-status "+(user.verified?"ac-positive":"ac-warning")}>{user.verified?t("Email verified","ইমেইল যাচাইকৃত"):t("Verification needed","যাচাই প্রয়োজন")}</span></section>
   {alert&&<p className={"ac-alert "+(error?"ac-alert-error":"")} role={error?"alert":"status"}>{alert}</p>}
   <div className="ac-grid">
    <section className="ac-panel"><div className="ac-panel-heading"><h2>{t("Personal details","ব্যক্তিগত তথ্য")}</h2></div>
     <form action={save} className="ac-form"><label htmlFor="account-name">{t("Display name","প্রদর্শিত নাম")}</label><input id="account-name" type="text" autoComplete="name" name="name" minLength={2} maxLength={100} required value={name} onChange={e=>setName(e.target.value)}/>
     <span className="ac-field-note">{t("Visible to your workspace teammates.","ওয়ার্কস্পেসের সহকর্মীরা এই নাম দেখতে পাবেন।")}</span>
     <div className="ac-form-actions"><button className="ac-primary" type="submit" disabled={!dirty||name.trim().length<2||saving}>{saving?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save changes","সংরক্ষণ")}</button><button type="button" className="ac-secondary" onClick={restore}>{t("Restore draft","খসড়া ফিরিয়ে আনুন")}</button></div>
     {dirty&&<p className="ac-draft-note" role="status">{restored?t("Restored draft is not yet saved.","ফিরিয়ে আনা খসড়া এখনো সংরক্ষিত নয়।"):t("You have unsaved changes.","আপনার পরিবর্তন সংরক্ষিত হয়নি।")}</p>}
     </form>
    </section>
    <section className="ac-panel"><div className="ac-panel-heading"><h2>{t("Sign-in & security","লগইন ও নিরাপত্তা")}</h2></div>
     <div className="ac-setting-row"><div><strong>{t("Email address","ইমেইল ঠিকানা")}</strong><span>{user.email}</span></div><span className={"ac-status "+(user.verified?"ac-positive":"ac-warning")}>{user.verified?t("Verified","যাচাইকৃত"):t("Unverified","যাচাই হয়নি")}</span></div>
     {!user.verified&&<form action={verify} className="ac-verify"><button className="ac-secondary" disabled={verifying||verification.status==="sent"}>{verifying?t("Sending…","পাঠানো হচ্ছে…"):t("Send verification email","যাচাইয়ের ইমেইল পাঠান")}</button></form>}
     <div className="ac-setting-row"><div><strong>{t("Multi-factor authentication","দুই ধাপের নিরাপত্তা")}</strong><span>{t("Additional protection for administrator access.","অ্যাডমিন অ্যাক্সেসের অতিরিক্ত সুরক্ষা।")}</span></div><span className={"ac-status "+(mfa?"ac-positive":"ac-neutral")}>{mfa?t("Enabled","সক্রিয়"):t("Not set up","চালু নয়")}</span></div>
     <div className="ac-setting-row"><div><strong>{t("Password","পাসওয়ার্ড")}</strong><span>{t("Recover access securely by email.","ইমেইলের মাধ্যমে নিরাপদে অ্যাক্সেস ফিরিয়ে নিন।")}</span></div><Link className="ac-secondary" href="/forgot-password">{t("Recovery","পুনরুদ্ধার")}</Link></div>
    </section>
   </div>
   <section className="ac-panel ac-sessions"><header className="ac-panel-heading ac-session-header"><div><h2>{t("Active sessions","সক্রিয় সেশন")}</h2><p>{t("Review and revoke signed-in sessions.","সক্রিয় লগইনগুলো দেখুন ও প্রয়োজনমতো বন্ধ করুন।")}</p></div><form action={revoke} onSubmit={e=>{if(!confirm){e.preventDefault();setConfirm(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setConfirm(false),4500)}else setConfirm(false)}}><button className="ac-secondary ac-danger" disabled={revoking||others.length===0}>{revoking?t("Revoking…","বন্ধ হচ্ছে…"):confirm?t("Confirm revoke","বাতিল নিশ্চিত করুন"):t("Revoke other sessions","অন্য সেশন বন্ধ করুন")}</button></form></header>
    <div className="ac-session-list">{sessions.length===0?<div className="ac-empty">{t("No active sessions found.","সক্রিয় সেশন পাওয়া যায়নি।")}</div>:sessions.map(session=><div className="ac-session" key={session.id}>
     <span className="ac-device"><RefIcon name="monitor" className="ac-icon"/></span><div className="ac-session-content"><strong>{session.is_current?t("Current session","বর্তমান সেশন"):t("Other session","অন্য সেশন")}</strong><span>{t("Started","শুরু")}: {stamp(session.created_at)} · {t("Expires","মেয়াদ")}: {stamp(session.expires_at)}</span></div>
     {session.is_current?<span className="ac-status ac-positive">{t("Current","বর্তমান")}</span>:<button type="button" className="ac-secondary ac-danger" disabled={busy===session.id} onClick={async()=>{setBusy(session.id);try{const result=await revokeAccountSession(locale,session.id);setMessage(result.message);if(result.status==="success")router.refresh()}finally{setBusy("")}}}>{busy===session.id?t("Working…","অপেক্ষা করুন…"):t("Revoke","বন্ধ করুন")}</button>}
    </div>)}</div><p className="ac-note">{t("We only show actual recorded sessions. Device and IP information is not collected.","শুধু সংরক্ষিত সেশন দেখানো হয়; ডিভাইস বা IP তথ্য অনুমান করে দেখানো হয় না।")}</p>
   </section>
   <footer className="ac-footer"><Link href="/workspaces" className="ac-secondary">{t("Back to workspaces","ওয়ার্কস্পেসে ফিরুন")}</Link><form action={logoutAction.bind(null,locale)}><button className="ac-secondary" type="submit">{t("Sign out","সাইন আউট")}</button></form></footer>
  </main>
 </div>;
}
