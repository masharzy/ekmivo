"use client";
import { useActionState, useEffect, useState } from "react";
import { recoverAdminMfaAction, rotateAdminRecoveryAction, resetAdminMfaAction, type MfaSecurityState } from "../actions/mfa-security";

const initial:MfaSecurityState={status:"idle",message:""};
export function MfaSecurityControls({locale,recovery=false}:{locale:"bn"|"en";recovery?:boolean}) {
 const bn=locale==="bn";
 const [state,action,pending]=useActionState((recovery?recoverAdminMfaAction:rotateAdminRecoveryAction).bind(null,locale),initial);
 const [reset,resetAction,resetting]=useActionState(resetAdminMfaAction.bind(null,locale),initial);
 return <section className="ek-verify-card" aria-labelledby={recovery?"recover-heading":"security-heading"}>
  <h2 id={recovery?"recover-heading":"security-heading"}>{recovery?(bn?"Authenticator হারিয়েছেন?":"Lost your authenticator?"):(bn?"Recovery codes":"Recovery codes")}</h2>
  <p>{recovery?(bn?"আপনার পাসওয়ার্ড ও একটি অব্যবহৃত recovery code দিন। অন্য sessions বন্ধ হবে।":"Enter your password and one unused recovery code. Other sessions will be revoked."):(bn?"প্রতিটি কোড একবার চলবে। নতুন কোড তৈরি করলে আগেরগুলো বাতিল হবে।":"Each code works once. Generating new codes invalidates all previous codes.")}</p>
  <form action={action} className="ek-recovery-form">
   <label>{bn?"পাসওয়ার্ড":"Password"}<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
   {recovery&&<label>{bn?"Recovery code":"Recovery code"}<input name="recoveryCode" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={32}/></label>}
   <button className="ek-action" disabled={pending}>{pending?(bn?"যাচাই হচ্ছে…":"Verifying…"):recovery?(bn?"Recovery code দিয়ে প্রবেশ":"Use recovery code"):(bn?"নতুন recovery codes তৈরি":"Generate recovery codes")}</button>
   {state.status!=="idle"&&<p role="status" className={state.status==="error"?"ek-form-error":"ek-verify-help"}>{state.message}</p>}
  </form>
  {state.codes&&<div aria-label={bn?"একবার প্রদর্শিত recovery codes":"Once-visible recovery codes"}>
   <ul>{state.codes.map(code=><li key={code}><code style={{overflowWrap:"anywhere"}}>{code}</code></li>)}</ul>
   <p>{bn?"এই পৃষ্ঠা বন্ধ হলে কোডগুলো আর দেখা যাবে না। ব্যক্তিগতভাবে সংরক্ষণ করুন।":"These codes cannot be retrieved after leaving this page. Business them privately."}</p>
  </div>}
  {!recovery&&<form action={resetAction} className="ek-recovery-form">
   <h2>{bn?"Authenticator পরিবর্তন":"Replace authenticator"}</h2>
   <p>{bn?"বর্তমান authenticator ও recovery codes বাতিল হবে। অন্য sessions বন্ধ হবে। নতুন setup ছাড়া admin access বন্ধ থাকবে।":"This revokes the current authenticator, recovery codes and other sessions. Admin access stays blocked until you enroll again."}</p>
   <label>{bn?"পাসওয়ার্ড নিশ্চিত করুন":"Confirm password"}<input name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
   <button className="ek-action" disabled={resetting}>{resetting?(bn?"অপেক্ষা করুন…":"Please wait…"):(bn?"বাতিল করে নতুন setup":"Revoke and set up again")}</button>
   {reset.status!=="idle"&&<p className="ek-form-error" role="status">{reset.message}</p>}
  </form>}
 </section>;
}
export function GoSessionStatus({locale}:{locale:"bn"|"en"}) {
 const [state,setState]=useState("loading");
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/go/session",{signal:controller.signal,cache:"no-store"}).then(response=>setState(response.ok?"ok":"error")).catch(()=>{if(!controller.signal.aborted)setState("error");});
  return ()=>controller.abort();
 },[]);
 return <p role="status">{locale==="bn"?{loading:"Go session যাচাই হচ্ছে…",ok:"Go API আপনার session যাচাই করেছে।",error:"Go session যাচাই করা যাচ্ছে না। আবার চেষ্টা করুন।"}[state]:{loading:"Checking Go session…",ok:"Go API verified your session.",error:"Go session verification unavailable. Try again."}[state]}</p>;
}
