"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { resendEmailCodeAction, verifyEmailCodeAction, type RecoveryState } from "../actions/recovery";
import type { Locale } from "../lib/site-copy";

const initial:RecoveryState={status:"idle",message:""};
export function VerificationForm({locale,email}:{locale:Locale;email:string}){
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
 return <main className="ek-verification-screen">
  <div className="ek-verify-card">
   <div className="ek-verify-mark">e<span>.</span></div>
   <span className="ek-page-kicker">ACCOUNT SECURITY / 01</span>
   <h1>{locale==="bn"?"ইমেইল যাচাই করুন":"Verify your email"}</h1>
   <p>{locale==="bn"?"ইমেইলের ছয় সংখ্যার কোড দিন, অথবা নতুন কোড নিন:":"Enter the six-digit email code, or request a new one:"}<br/><strong>{email}</strong></p>
   <form ref={form} action={verifyAction}>
    <input type="hidden" name="code" value={code}/>
    <div className="ek-otp-inputs" role="group" aria-label={locale==="bn"?"ছয় সংখ্যার যাচাই কোড":"Six-digit verification code"}>
     {digits.map((d,i)=><input key={i} ref={el=>{inputs.current[i]=el;}} value={d}
       type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete={i===0?"one-time-code":"off"}
       aria-label={locale==="bn"?`সংখ্যা ${i+1}`:`Digit ${i+1}`} aria-invalid={verifyState.status==="error"}
       onChange={event=>{if(!event.target.value){const next=[...digits];next[i]="";setDigits(next);}else applyAt(i,event.target.value);}}
       onPaste={event=>{const numbers=event.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);if(numbers){event.preventDefault();const next=Array(6).fill("");[...numbers].forEach((ch,j)=>next[j]=ch);setDigits(next);inputs.current[Math.min(numbers.length,5)]?.focus();}}}
       onKeyDown={event=>key(i,event)}/>)}
    </div>
    <div className="ek-verify-state" aria-live="polite">{verifying?(locale==="bn"?"যাচাই হচ্ছে…":"Verifying automatically…"):code.length===6?(locale==="bn"?"কোড পাঠানো হচ্ছে…":"Submitting code…"):(locale==="bn"?"৬ সংখ্যা লিখলে স্বয়ংক্রিয় যাচাই হবে":"Verification starts automatically after six digits")}</div>
    {verifyState.status==="error"&&<p className="ek-form-error" role="alert">{verifyState.message}</p>}
    <button type="submit" className="ek-action ek-verify-fallback" disabled={code.length!==6||verifying}>{locale==="bn"?"যাচাই করুন":"Verify email"} ↗</button>
   </form>
   <div className="ek-verify-resend"><span>{locale==="bn"?"কোড আসেনি?":"Didn't receive the code?"}</span>
    <button type="button" disabled={resending} onClick={()=>startResend(()=>resendAction())}>{locale==="bn"?"আবার পাঠান":"Resend code"}</button>
   </div>
   {resendState.status!=="idle"&&<p className={resendState.status==="error"?"ek-field-error":"ek-verify-help"} role="status">{resendState.message}</p>}
   <Link href="/account" className="ek-verify-back">← {locale==="bn"?"অ্যাকাউন্টে ফিরুন":"Back to account"}</Link>
  </div>
 </main>;
}
