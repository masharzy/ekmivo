"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { resendEmailCodeAction, verifyEmailCodeAction, type RecoveryState } from "../actions/recovery";
import type { Locale } from "../lib/site-copy";
import { logoutAction } from "../actions/account";
import { PublicIcon } from "./public-icon";

const initial:RecoveryState={status:"idle",message:""};
export function VerificationForm({locale,email}:{locale:Locale;email:string}){
 const bn=locale==="bn";
 const t=(en:string,bengali:string)=>bn?bengali:en;
 const [digits,setDigits]=useState(["","","","","",""]);
 const [verifyState,verifyAction,verifying]=useActionState(verifyEmailCodeAction.bind(null,locale),initial);
 const [resendState,resendAction]=useActionState(resendEmailCodeAction.bind(null,locale),initial);
 const [resending,startResend]=useTransition();
 const inputs=useRef<Array<HTMLInputElement|null>>([]);
 const form=useRef<HTMLFormElement>(null);
 const submitted=useRef("");
 const code=digits.join("");
 useEffect(()=>{inputs.current[0]?.focus();},[]);
 useEffect(()=>{
  if(code.length!==6||verifying||submitted.current===code)return;
  submitted.current=code;
  form.current?.requestSubmit();
 },[code,verifying]);
 function applyAt(index:number,value:string){
  const numbers=value.replace(/\D/g,"").slice(0,6-index);
  if(!numbers)return;
  const next=[...digits];
  [...numbers].forEach((digit,i)=>next[index+i]=digit);
  setDigits(next);
  if(index+numbers.length<6)inputs.current[index+numbers.length]?.focus();
  else inputs.current[5]?.blur();
 }
 function key(index:number,event:React.KeyboardEvent<HTMLInputElement>){
  if(event.key==="Backspace"){
   event.preventDefault();
   const next=[...digits];
   if(next[index])next[index]="";
   else if(index>0){next[index-1]="";inputs.current[index-1]?.focus();}
   setDigits(next);
  }
  if(event.key==="ArrowLeft"&&index>0)inputs.current[index-1]?.focus();
  if(event.key==="ArrowRight"&&index<5)inputs.current[index+1]?.focus();
 }
 return <main className="ek-auth-main ek-auth-designed ek-auth-v2 ek-auth-polished ekm-auth ekm-auth-verify" lang={locale}>
  <div className="ek-auth-login-shell">
   <section className="ek-auth-login-rail" aria-label={t("Account security","অ্যাকাউন্টের নিরাপত্তা")}>
    <span className="ekm-auth-rail-kicker"><i aria-hidden="true"/>{t("ONE LAST STEP","আর মাত্র এক ধাপ")}</span>
    <div className="ek-auth-login-rail-copy">
     <span>{t("SECURE YOUR EKMIVO ACCOUNT","আপনার Ekmivo অ্যাকাউন্ট নিরাপদ রাখুন")}</span>
     <h2>{t("Your space. Only yours.","আপনার জায়গা, শুধু আপনার।")}</h2>
     <p>{t("A quick email check helps make sure only you can access your business tools.","একবার ইমেইল যাচাই করলেই আপনার ব্যবসার টুলগুলো নিরাপদে ব্যবহার করতে পারবেন।")}</p>
    </div>
    <div className="ekm-verify-journey" aria-label={t("Verification steps","ইমেইল যাচাইয়ের ধাপ")}>
     <div className="ekm-verify-journey-head"><span className="ekm-verify-journey-icon"><PublicIcon name="shield"/></span><div><strong>{t("Email verification","ইমেইল ভেরিফিকেশন")}</strong><p>{t("Simple. Secure. Almost done.","সহজ, নিরাপদ, আর একটু বাকি।")}</p></div><span className="ekm-verify-journey-check" aria-hidden="true">✳</span></div>
     <ol>
      <li><span>01</span>{t("Check your inbox","ইনবক্স দেখুন")}</li>
      <li><span>02</span>{t("Enter the six-digit code","ছয় সংখ্যার কোড লিখুন")}</li>
      <li><span>03</span>{t("Continue to your account","অ্যাকাউন্টে এগিয়ে যান")}</li>
     </ol>
    </div>
    <span className="ekm-auth-rail-bottom">EKMIVO <span aria-hidden="true">✳</span> {t("A calmer way to work","গুছিয়ে কাজ করার সহজ উপায়")}</span>
   </section>
   <section className="ek-auth-login-area" aria-labelledby="verify-heading">
    <div className="ek-auth-v2-form ekm-verify-form">
     <span className="ekm-auth-form-eyebrow"><i aria-hidden="true"/>{t("ACCOUNT VERIFICATION","অ্যাকাউন্ট যাচাই")}</span>
     <div className="ekm-verify-form-symbol" aria-hidden="true"><PublicIcon name="inbox"/></div>
     <h1 id="verify-heading">{t("Check your inbox.","আপনার ইনবক্স দেখুন।")}</h1>
     <p className="ek-auth-subtitle">{t("Enter the six-digit verification code for this email address.","এই ইমেইল ঠিকানায় পাঠানো ছয় সংখ্যার ভেরিফিকেশন কোডটি লিখুন।")}</p>
     <div className="ekm-verify-recipient"><span>{t("VERIFYING EMAIL","যে ইমেইল যাচাই হচ্ছে")}</span><strong>{email}</strong></div>
     <form ref={form} action={verifyAction}>
      <input type="hidden" name="code" value={code}/>
      <p className="ekm-verify-code-label" id="verify-code-label">{t("Your 6-digit code","আপনার ৬ সংখ্যার কোড")}</p>
      <div className="ek-otp-inputs" role="group" aria-labelledby="verify-code-label">
       {digits.map((d,i)=><input key={i} ref={el=>{inputs.current[i]=el;}} value={d}
        type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete={i===0?"one-time-code":"off"}
        aria-label={t(`Digit ${i+1}`,`সংখ্যা ${i+1}`)} aria-invalid={verifyState.status==="error"}
        onChange={event=>{if(!event.target.value){const next=[...digits];next[i]="";setDigits(next);}else applyAt(i,event.target.value);}}
        onPaste={event=>{const numbers=event.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);if(numbers){event.preventDefault();const next=Array(6).fill("");[...numbers].forEach((ch,j)=>next[j]=ch);setDigits(next);inputs.current[Math.min(numbers.length,5)]?.focus();}}}
        onKeyDown={event=>key(i,event)}/>)}
      </div>
      <p className="ek-verify-state" aria-live="polite">{verifying?t("Verifying your code…","কোড যাচাই হচ্ছে…"):verifyState.status==="error"?t("You can edit the code or request a new one.","কোড সংশোধন করুন অথবা নতুন কোড নিন।"):code.length===6?t("Submitting your code…","কোড পাঠানো হচ্ছে…"):t("Verification starts automatically after six digits.","৬ সংখ্যা লিখলেই স্বয়ংক্রিয় যাচাই শুরু হবে।")}</p>
      {verifyState.status==="error"&&<p className="ek-form-error" role="alert">{verifyState.message}</p>}
      <button type="submit" className="ek-auth-primary ekm-verify-submit" disabled={code.length!==6||verifying} aria-busy={verifying}>{verifying?t("Verifying…","যাচাই হচ্ছে…"):t("Verify email","ইমেইল যাচাই করুন")}<span aria-hidden="true">↗</span></button>
     </form>
     <div className="ek-verify-resend"><span>{t("Didn't get a code?","কোড পাননি?")}</span><button type="button" disabled={resending} onClick={()=>startResend(()=>resendAction())}>{resending?t("Sending…","পাঠানো হচ্ছে…"):t("Resend code","আবার কোড পাঠান")}</button></div>
     {resendState.status!=="idle"&&<p className={resendState.status==="error"?"ek-form-error":"ek-verify-help"} role="status">{resendState.message}</p>}
     <div className="ekm-verify-divider"/>
     <form action={logoutAction.bind(null,locale)}><button type="submit" className="ek-verify-back">← {t("Use a different account","অন্য অ্যাকাউন্ট ব্যবহার করুন")}</button></form>
    </div>
   </section>
  </div>
 </main>;
}
