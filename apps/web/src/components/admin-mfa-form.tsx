"use client";
import {useActionState,useRef,useState} from "react";
import {beginAdminMfaAction,confirmAdminMfaAction,type MfaActionState} from "../actions/admin-mfa";
import {recoverAdminMfaAction,type MfaSecurityState} from "../actions/mfa-security";
import {logoutAction} from "../actions/account";
type Locale="bn"|"en";
const start:MfaActionState={status:"idle",message:""};
const recoveryInitial:MfaSecurityState={status:"idle",message:""};
export function AdminMfaForm({locale,ready,enrolled=false}:{locale:Locale;ready:boolean;enrolled?:boolean}){
 const bn=locale==="bn";
 const [view,setView]=useState<"verify"|"setup"|"recovery">(enrolled?"verify":"setup");
 const [setup,begin,starting]=useActionState(beginAdminMfaAction.bind(null,locale),start);
 const [confirmed,confirm,checking]=useActionState(confirmAdminMfaAction.bind(null,locale),start);
 const [recovered,recover,recovering]=useActionState(recoverAdminMfaAction.bind(null,locale),recoveryInitial);
 const verifyRef=useRef<HTMLFormElement>(null);
 return <div className="pa-mfa-card">
  <div className="pa-mfa-logo">ekmivo <small>Admin</small></div>
  <h1>{view==="recovery"?(bn?"অ্যাকাউন্ট পুনরুদ্ধার":"Recover your account"):view==="setup"?(bn?"অথেন্টিকেটর সেটআপ":"Set up authenticator"):(bn?"নিরাপত্তা যাচাই":"Security verification")}</h1>
  <p style={{textAlign:"center"}}>{view==="setup"?(bn?"অ্যাডমিন অ্যাক্সেসের জন্য অথেন্টিকেটর চালু করুন।":"Protect admin access with an authenticator."):view==="recovery"?(bn?"একটি অব্যবহৃত রিকভারি কোড ব্যবহার করুন।":"Use an unused recovery code."):(bn?"অথেন্টিকেটরের ৬ সংখ্যার কোড দিন।":"Enter your six-digit authenticator code.")}</p>
  {!ready&&<p className="pa-mfa-errors" role="alert">{bn?"সার্ভারে MFA কনফিগার করা হয়নি।":"Administrator MFA is not configured on the server."}</p>}
  {view==="setup"&&!setup.setupKey&&<form action={begin}>
   <label>{bn?"পাসওয়ার্ড নিশ্চিত করুন":"Confirm your password"}<input autoFocus name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={!ready}/></label>
   <button type="submit" disabled={!ready||starting}>{starting?"…":bn?"পরবর্তী ধাপ":"Continue"}</button>
   {setup.status==="error"&&<p className="pa-mfa-errors" role="alert">{setup.message}</p>}
  </form>}
  {view==="setup"&&setup.setupKey&&<div style={{display:"grid",gap:14}}>
   <p>{bn?"অথেন্টিকেটর অ্যাপে নিচের সেটআপ কী যোগ করুন।":"Add this setup key to your authenticator app."}</p>
   <div className="pa-mfa-codes">{setup.setupKey}</div>
   <button className="pa-mfa-link" type="button" onClick={()=>navigator.clipboard.writeText(setup.setupKey||"")}>{bn?"সেটআপ কী কপি করুন":"Copy setup key"}</button>
  </div>}
  {(view==="verify"||view==="setup"&&!!setup.setupKey)&&<form ref={verifyRef} action={confirm}>
   <label>{bn?"৬ সংখ্যার কোড":"6-digit code"}<input autoFocus name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" required disabled={!ready||checking} onChange={e=>{if(/^\d{6}$/.test(e.target.value))verifyRef.current?.requestSubmit();}}/></label>
   <label className="pa-trust-choice"><input type="checkbox" name="trustDevice"/>{bn?"এই ব্যক্তিগত ডিভাইস ৩০ দিনের জন্য বিশ্বস্ত রাখুন":"Trust this private device for 30 days"}</label>
   <button type="submit" disabled={!ready||checking}>{checking?"…":view==="setup"?(bn?"চালু করুন":"Turn on"):(bn?"যাচাই করুন":"Verify")}</button>
   {confirmed.status==="error"&&<p className="pa-mfa-errors" role="alert">{confirmed.message}</p>}
  </form>}
  {view==="recovery"&&<form action={recover}>
   <label>{bn?"পাসওয়ার্ড":"Password"}<input autoFocus name="password" type="password" autoComplete="current-password" required maxLength={256}/></label>
   <label>{bn?"রিকভারি কোড":"Recovery code"}<input name="recoveryCode" type="text" autoCapitalize="none" autoComplete="off" spellCheck={false} required maxLength={32}/></label>
   <button type="submit" disabled={recovering}>{recovering?"…":bn?"রিকভারি কোড ব্যবহার করুন":"Use recovery code"}</button>
   <p>{bn?"অন্য সব সেশন সাইন আউট হবে।":"Other sessions will be signed out."}</p>
   {recovered.status==="error"&&<p className="pa-mfa-errors" role="alert">{recovered.message}</p>}
  </form>}
  {enrolled&&<button className="pa-mfa-link" type="button" onClick={()=>setView(view==="recovery"?"verify":"recovery")}>{view==="recovery"?(bn?"পেছনে":"Back"):(bn?"অথেন্টিকেটর হারিয়েছেন?":"Lost your authenticator?")}</button>}
  <form action={logoutAction.bind(null,locale)}><button className="pa-mfa-link" type="submit" style={{width:"100%",background:"transparent",color:"inherit",minHeight:24}}>{bn?"সাইন আউট":"Sign out"}</button></form>
 </div>;
}
