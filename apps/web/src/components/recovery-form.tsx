"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import {requestPasswordResetAction,completePasswordResetAction,type RecoveryState} from "../actions/recovery";
import type {Locale} from "../lib/site-copy";

const initial:RecoveryState={status:"idle",message:""};
const EYE="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const EYE_OFF="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2";

function PasswordField({id,name,label,hint,show,onToggle,bn}:{id:string;name:string;label:string;hint?:string;show:boolean;onToggle:()=>void;bn:boolean}){
 return <div className="bf-field">
  <label htmlFor={id}>{label}</label>
  <div className="bf-pw">
   <input className="bf-input" id={id} name={name} type={show?"text":"password"} minLength={12} maxLength={256} required autoComplete="new-password" aria-describedby={hint?`${id}-hint`:undefined}/>
   <button type="button" onClick={onToggle} aria-pressed={show} aria-label={show?(bn?"পাসওয়ার্ড লুকান":"Hide password"):(bn?"পাসওয়ার্ড দেখান":"Show password")}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={show?EYE_OFF:EYE}/></svg>
   </button>
  </div>
  {hint&&<p className="bf-hint" id={`${id}-hint`}>{hint}</p>}
 </div>;
}

export function RecoveryForm({locale}:{locale:Locale}){
 const [email,setEmail]=useState("");
 const [showNew,setShowNew]=useState(false);
 const [showConfirm,setShowConfirm]=useState(false);
 const [requestState,requestAction,requestPending]=useActionState(requestPasswordResetAction.bind(null,locale),initial);
 const [resetState,resetAction,resetPending]=useActionState(completePasswordResetAction.bind(null,locale),initial);
 const sent=requestState.status==="sent";
 const done=resetState.status==="success";
 const bn=locale==="bn";
 const step=done?2:sent?2:1;
 return <main className="bf-pub bf-auth" lang={locale} id="main">
  <section className="bf-auth-card" aria-labelledby="bf-recovery-title">
   {done?<>
    <span className="bf-auth-ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg></span>
    <div className="bf-center" role="status">
     <h1 id="bf-recovery-title">{bn?"পাসওয়ার্ড বদলানো হয়েছে":"Password changed"}</h1>
     <p className="bf-auth-sub">{resetState.message||(bn?"নতুন পাসওয়ার্ড দিয়ে এখন লগইন করুন।":"Sign in with your new password.")}</p>
    </div>
    <Link className="bf-btn bf-btn-lime bf-btn-block" href={`/${locale}/login`}>{bn?"লগইন করুন":"Sign in"}</Link>
   </>:<>
    <div className="bf-prog" role="img" aria-label={bn?`ধাপ ${step===1?"১":"২"} / ২`:`Step ${step} of 2`}><span className="on"/><span className={step===2?"on":""}/></div>
    <div>
     <span className="bf-pill"><i aria-hidden="true"/>{bn?"পাসওয়ার্ড রিসেট":"Password reset"}</span>
     <h1 id="bf-recovery-title">{sent?(bn?"নতুন পাসওয়ার্ড দিন":"Choose a new password"):(bn?"পাসওয়ার্ড ভুলে গেছেন?":"Forgot your password?")}</h1>
    </div>
    {!sent&&<p className="bf-auth-sub">{bn?"অ্যাকাউন্টের ইমেইল দিন। ৬ সংখ্যার একটা কোড পাঠানো হবে।":"Enter your account email. We will send a 6-digit code."}</p>}
    <form action={requestAction} className="bf-form" hidden={sent}>
     <div className="bf-field">
      <label htmlFor="bf-recovery-email">{bn?"ইমেইল":"Email"}</label>
      <input className="bf-input" id="bf-recovery-email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/>
     </div>
     <button className="bf-btn bf-btn-lime bf-btn-block" disabled={requestPending} type="submit">{requestPending?(bn?"পাঠানো হচ্ছে…":"Sending…"):(bn?"কোড পাঠান":"Send code")}</button>
     {requestState.status==="error"&&<p role="alert" className="bf-msg is-err">{requestState.message}</p>}
    </form>
    {sent&&<>
     {requestState.message&&<p role="status" className="bf-msg is-ok">{requestState.message}</p>}
     <form action={resetAction} className="bf-form">
      <input type="hidden" name="email" value={email}/>
      <div className="bf-field">
       <label htmlFor="bf-recovery-code">{bn?"ইমেইলে পাওয়া ৬ সংখ্যার কোড":"Six-digit code from your email"}</label>
       <input className="bf-input bf-code" id="bf-recovery-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="000000"/>
      </div>
      <PasswordField id="bf-recovery-password" name="password" label={bn?"নতুন পাসওয়ার্ড":"New password"} hint={bn?"কমপক্ষে ১২ অক্ষর":"At least 12 characters"} show={showNew} onToggle={()=>setShowNew(v=>!v)} bn={bn}/>
      <PasswordField id="bf-recovery-confirm" name="confirm" label={bn?"নতুন পাসওয়ার্ড আবার লিখুন":"Confirm new password"} show={showConfirm} onToggle={()=>setShowConfirm(v=>!v)} bn={bn}/>
      <button disabled={resetPending} type="submit" className="bf-btn bf-btn-lime bf-btn-block">{resetPending?(bn?"অপেক্ষা করুন…":"Please wait…"):(bn?"পাসওয়ার্ড বদলান":"Reset password")}</button>
      {resetState.status==="error"&&<p className="bf-msg is-err" role="alert">{resetState.message}</p>}
     </form>
     <form action={requestAction} className="bf-auth-alt">
      <input type="hidden" name="email" value={email}/>
      <button type="submit" disabled={requestPending}>{requestPending?(bn?"পাঠানো হচ্ছে…":"Sending…"):(bn?"নতুন কোড পাঠান":"Send another code")}</button>
     </form>
    </>}
    <div className="bf-auth-alt">
     <Link href={`/${locale}/login`}>← {bn?"লগইনে ফিরে যান":"Back to sign in"}</Link>
     <span>{bn?"অ্যাকাউন্ট নেই?":"No account?"} <Link href={`/${locale}/register`}>{bn?"অ্যাকাউন্ট খুলুন":"Create one"}</Link></span>
    </div>
   </>}
  </section>
 </main>;
}
