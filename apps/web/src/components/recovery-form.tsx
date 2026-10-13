"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import {requestPasswordResetAction,completePasswordResetAction,type RecoveryState} from "../actions/recovery";
import type {Locale} from "../lib/site-copy";

const initial:RecoveryState={status:"idle",message:""};
export function RecoveryForm({locale}:{locale:Locale}){
 const [email,setEmail]=useState("");
 const [requestState,requestAction,requestPending]=useActionState(requestPasswordResetAction.bind(null,locale),initial);
 const [resetState,resetAction,resetPending]=useActionState(completePasswordResetAction.bind(null,locale),initial);
 const sent=requestState.status==="sent";
 const bn=locale==="bn";
 return <main className="ek-auth-main ek-auth-recovery" lang={locale}>

  <div className="ek-recovery-layout ek-recovery-layout-compact">
   <div className="ek-auth-card ek-recovery-card">
    <span className="ek-auth-card-kicker">{bn?"পাসওয়ার্ড রিসেট":"RECOVER ACCOUNT"}</span>
    <h1>{bn?"পাসওয়ার্ড ভুলে গেছেন?":"Reset your password"}</h1>
    <p className="ek-auth-subtitle">{bn?"অ্যাকাউন্টের ইমেইল দিন। পাসওয়ার্ড বদলানোর জন্য একটি কোড পাঠানো হবে।":"Enter the address connected to your Ekmivo account."}</p>
    <form action={requestAction}>
     <label>{bn?"ইমেইল":"Email address"}<input type="email" name="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/></label>
     <button className="ek-auth-primary" disabled={requestPending} type="submit">{requestPending?(bn?"পাঠানো হচ্ছে…":"Please wait…"):sent?(bn?"নতুন কোড পাঠান":"Send another code"):(bn?"কোড পাঠান":"Send recovery code")} <span aria-hidden="true">↗</span></button>
     {requestState.status!=="idle"&&<p role="status" className={requestState.status==="error"?"ek-form-error":"ek-auth-hint"}>{requestState.message}</p>}
    </form>
    {sent&&resetState.status!=="success"&&<form action={resetAction} className="ek-recovery-second-step">
     <input type="hidden" name="email" value={email}/>
     <h3>{bn?"নতুন পাসওয়ার্ড দিন":"Choose a new password"}</h3>
     <label>{bn?"ইমেইলে পাওয়া ৬ সংখ্যার কোডটি লিখুন":"Six-digit email code"}<input name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000"/></label>
     <label>{bn?"নতুন পাসওয়ার্ড":"New password"}<input type="password" name="password" minLength={12} required autoComplete="new-password"/></label>
     <label>{bn?"নতুন পাসওয়ার্ড আবার লিখুন":"Confirm password"}<input type="password" name="confirm" minLength={12} required autoComplete="new-password"/></label>
     <button disabled={resetPending} type="submit" className="ek-auth-primary">{resetPending?(bn?"অপেক্ষা করুন…":"Please wait…"):(bn?"পাসওয়ার্ড পরিবর্তন করুন":"Reset password")} <span aria-hidden="true">↗</span></button>
     {resetState.status==="error"&&<p className="ek-form-error" role="alert">{resetState.message}</p>}
    </form>}
    {resetState.status==="success"&&<p role="status" className="ek-auth-success">{resetState.message}</p>}
    <Link className="ek-auth-recovery-back" href={`/${locale}/login`}>← {bn?"লগইন পেজে ফিরুন":"Back to sign in"}</Link>
   </div>
  </div>
  <Link className="ek-auth-back" href={`/${locale}`}>← {bn?"হোমপেজে ফিরুন":"Back to home"}</Link>
 </main>;
}
