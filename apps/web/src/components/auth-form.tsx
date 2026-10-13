"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import {useFormStatus} from "react-dom";
import {loginAction,registerAction} from "../actions/account";
import {emptyState,type FormErrorState} from "../lib/server/validation";
import type {Locale} from "../lib/site-copy";

const text={
 en:{
  login:{tag:"YOUR ACCOUNT",heading:"Good to see you again.",desc:"Your workspace is right where you left it.",submit:"Sign in",alternate:"New to Ekmivo?",alternateAction:"Create an account"},
  register:{tag:"JOIN EKMIVO",heading:"Create your account.",desc:"A few details, then you're ready to set up your business.",submit:"Create account",alternate:"Already have an account?",alternateAction:"Sign in"},
  name:"Your name",email:"Email address",password:"Password",confirm:"Confirm password",show:"Show",hide:"Hide",forgot:"Forgot your password?",
  nameError:"Enter a name between 2 and 100 characters.",emailError:"Enter a valid email address.",passwordLoginError:"Enter your password.",passwordError:"Use between 12 and 256 characters.",confirmError:"The passwords do not match.",
  summary:"Please correct the highlighted fields.",pending:"Please wait…",back:"Back to homepage",brand:"Your business, one workspace.",
  sideNote:"PAYMENTS · CHECKOUT · API",registerInfo:"Your account is free to create. Plans are not yet announced."
 },
 bn:{
  login:{tag:"আপনার অ্যাকাউন্ট",heading:"আবার স্বাগতম",desc:"আপনার ওয়ার্কস্পেসে যেতে লগইন করুন।",submit:"Sign in",alternate:"Ekmivo-তে নতুন?",alternateAction:"অ্যাকাউন্ট খুলুন"},
  register:{tag:"নতুন অ্যাকাউন্ট",heading:"Ekmivo-তে অ্যাকাউন্ট খুলুন",desc:"শুরু করতে আপনার নাম, ইমেইল ও একটি পাসওয়ার্ড দিন।",submit:"অ্যাকাউন্ট তৈরি করুন",alternate:"আগেই অ্যাকাউন্ট আছে?",alternateAction:"Sign in"},
  name:"আপনার নাম",email:"ইমেইল",password:"পাসওয়ার্ড",confirm:"পাসওয়ার্ড আবার লিখুন",show:"দেখুন",hide:"লুকান",forgot:"পাসওয়ার্ড ভুলে গেছেন?",
  nameError:"নাম ২ থেকে ১০০ অক্ষরের মধ্যে লিখুন।",emailError:"সঠিক ইমেইল ঠিকানা লিখুন।",passwordLoginError:"পাসওয়ার্ড লিখুন।",passwordError:"পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।",confirmError:"দুটি পাসওয়ার্ড মেলেনি।",
  summary:"চিহ্নিত তথ্যগুলো ঠিক করে আবার চেষ্টা করুন।",pending:"অপেক্ষা করুন…",back:"হোমপেজে ফিরুন",brand:"আপনার ব্যবসার কাজ, এক জায়গায়।",
  sideNote:"PAYMENTS · CHECKOUT · API",registerInfo:"অ্যাকাউন্ট তৈরি করতে কোনো প্যাকেজ কিনতে হবে না।"
 }
} as const;

function Submit({label,pendingText}:{label:string;pendingText:string}){
 const {pending}=useFormStatus();
 return <button type="submit" className="ek-auth-primary ek-auth-submit" aria-busy={pending} disabled={pending}>
  <span>{pending?pendingText:label}</span><span className="ek-auth-submit-arrow" aria-hidden="true">↗</span>
 </button>;
}
type Field="name"|"email"|"password"|"confirm";
type FieldErrors=Partial<Record<Field,string>>;

export function AuthForm({locale,mode}:{locale:Locale;mode:"login"|"register"}){
 const t=text[locale],p=t[mode],login=mode==="login";
 const action=login?loginAction.bind(null,locale):registerAction.bind(null,locale);
 const [server,formAction]=useActionState<FormErrorState,FormData>(action,emptyState);
 const [errors,setErrors]=useState<FieldErrors>({});
 const [edited,setEdited]=useState<Partial<Record<Field,boolean>>>({});
 const [show,setShow]=useState(false);
 const [passwordLength,setPasswordLength]=useState(0);
 const fieldError=(field:Field)=>errors[field]||(!edited[field]&&server.status==="error"?server.fields?.[field]:undefined);
 const clear=(field:Field)=>{setErrors(previous=>({...previous,[field]:undefined}));setEdited(previous=>({...previous,[field]:true}));};
 function validate(event:React.FormEvent<HTMLFormElement>){
  const form=event.currentTarget,values=new FormData(form);
  const name=String(values.get("name")||"").trim();
  const email=String(values.get("email")||"").trim();
  const password=String(values.get("password")||"");
  const confirm=String(values.get("confirm")||"");
  const found:FieldErrors={};
  if(!login&&(name.length<2||name.length>100))found.name=t.nameError;
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))found.email=t.emailError;
  if(login?password.length===0||password.length>256:password.length<12||password.length>256)found.password=login?t.passwordLoginError:t.passwordError;
  if(!login&&password!==confirm)found.confirm=t.confirmError;
  if(Object.values(found).some(Boolean)){
   event.preventDefault();
   setErrors(found);
   const first=(["name","email","password","confirm"] as Field[]).find(key=>found[key]);
   (form.elements.namedItem(first||"email") as HTMLElement|null)?.focus();
  }else setErrors({});
 }
 return <main className={"ek-auth-main ek-auth-designed ek-auth-"+mode} lang={locale}>
  <div className="ek-auth-scene">
   <aside className="ek-auth-brand-panel">
    <Link className="ek-auth-brand-logo" href="/">ekmivo<span>.</span></Link>
    <div className="ek-auth-art" aria-hidden="true">
     <span className="ek-auth-orbit ek-auth-orbit-one"/><span className="ek-auth-orbit ek-auth-orbit-two"/>
     <div className="ek-auth-graphic">
      <span className="ek-auth-graphic-line"/><span className="ek-auth-graphic-line ek-auth-line-short"/>
      <span className="ek-auth-graphic-pill">↗</span>
     </div>
     <span className="ek-auth-spark">✳</span>
    </div>
    <div className="ek-auth-brand-foot">
     <strong>{t.brand}</strong>
     <small>{t.sideNote}</small>
    </div>
   </aside>
   <div className="ek-auth-form-zone">
    <div className="ek-auth-form-body">
     <div className="ek-auth-form-top"><span className="ek-auth-card-kicker">{p.tag}</span><span className="ek-auth-form-step">{login?"01 / 02":"02 / 02"}</span></div>
     <h1>{p.heading}</h1>
     <p className="ek-auth-subtitle">{p.desc}</p>
     <form action={formAction} noValidate onSubmit={validate} className="ek-auth-fields">
      {!login&&<label htmlFor="ek-auth-name">{t.name}<input id="ek-auth-name" name="name" type="text" autoComplete="name" maxLength={100} onChange={()=>clear("name")} aria-invalid={!!fieldError("name")} aria-describedby={fieldError("name")?"ek-auth-name-error":undefined} placeholder={locale==="bn"?"আপনার পুরো নাম":"Full name"}/>{fieldError("name")&&<small id="ek-auth-name-error" className="ek-field-error" role="status">{fieldError("name")}</small>}</label>}
      <label htmlFor="ek-auth-email">{t.email}<input id="ek-auth-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} onChange={()=>clear("email")} placeholder="you@example.com" aria-invalid={!!fieldError("email")} aria-describedby={fieldError("email")?"ek-auth-email-error":undefined}/>{fieldError("email")&&<small id="ek-auth-email-error" className="ek-field-error" role="status">{fieldError("email")}</small>}</label>
      <label htmlFor="ek-auth-password">{t.password}
       <span className="ek-auth-password"><input id="ek-auth-password" name="password" type={show?"text":"password"} autoComplete={login?"current-password":"new-password"} onChange={event=>{clear("password");setPasswordLength(event.target.value.length)}} aria-invalid={!!fieldError("password")} aria-describedby={fieldError("password")?"ek-auth-password-error":undefined}/>
       <button type="button" aria-label={show?t.hide:t.show} onClick={()=>setShow(s=>!s)}>{show?t.hide:t.show}</button></span>
       {fieldError("password")&&<small id="ek-auth-password-error" className="ek-field-error" role="status">{fieldError("password")}</small>}
      </label>
      {!login&&<>
       <div className="ek-auth-strength" aria-label={locale==="bn"?"পাসওয়ার্ড কমপক্ষে ১২ অক্ষর":"Password requires 12 characters"}><div className={passwordLength>=12?"has-password":""}/><div className={passwordLength>=12?"has-password":""}/><div className={passwordLength>=12?"has-password":""}/><div className={passwordLength>=12?"has-password":""}/><span>{passwordLength>=12?(locale==="bn"?"দৈর্ঘ্য ঠিক আছে":"Length requirement met"):(locale==="bn"?"কমপক্ষে ১২ অক্ষর লিখুন":"At least 12 characters")}</span></div>
       <label htmlFor="ek-auth-confirm">{t.confirm}<input id="ek-auth-confirm" name="confirm" type={show?"text":"password"} autoComplete="new-password" onChange={()=>clear("confirm")} aria-invalid={!!fieldError("confirm")} aria-describedby={fieldError("confirm")?"ek-auth-confirm-error":undefined}/>{fieldError("confirm")&&<small className="ek-field-error" id="ek-auth-confirm-error" role="status">{fieldError("confirm")}</small>}</label>
      </>}
      {login&&<Link className="ek-auth-forgot" href="/forgot-password">{t.forgot} ↗</Link>}
      {server.status==="error"&&<p className="ek-form-error" role="alert">{server.message}</p>}
      {Object.values(errors).some(Boolean)&&<p className="ek-form-error" role="alert">{t.summary}</p>}
      <Submit label={p.submit} pendingText={t.pending}/>
     </form>
     {!login&&<p className="ek-auth-register-tip">{t.registerInfo}</p>}
     <div className="ek-auth-switch"><span>{p.alternate}</span><Link href={login?"/register":"/login"}>{p.alternateAction} ↗</Link></div>
     <Link className="ek-auth-return" href="/">← {t.back}</Link>
    </div>
   </div>
  </div>
 </main>;
}
