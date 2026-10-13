"use client";
import Link from "next/link";
import {useActionState,useState} from "react";
import {useFormStatus} from "react-dom";
import {loginAction,registerAction} from "../actions/account";
import {emptyState,type FormErrorState} from "../lib/server/validation";
import type {Locale} from "../lib/site-copy";

const copy={
 en:{
  login:{label:"SIGN IN",heading:"Pick up where you left off.",intro:"Sign in to open your default workspace.",submit:"Sign in",alternative:"Don't have an Ekmivo account?",switch:"Create one"},
  register:{label:"CREATE ACCOUNT",heading:"Start with an account.",intro:"You can set up your business workspace right after signing up.",submit:"Create my account",alternative:"Already use Ekmivo?",switch:"Sign in"},
  name:"Your name",email:"Email address",password:"Password",confirm:"Repeat password",show:"Show",hide:"Hide",forgot:"Forgot password?",
  nameError:"Enter your name (2–100 characters).",emailError:"Enter a valid email address.",loginPasswordError:"Enter your password.",passwordError:"Use 12–256 characters.",confirmError:"Passwords must match.",
  invalid:"Check the highlighted fields.",pending:"Please wait…",home:"Back to Ekmivo",
  asideHeading:"Welcome back to your workspace.",asideText:"Your next step starts right where you left off.",
  registerGuide:"AFTER YOU SIGN UP",steps:[["Your account","Create a secure Ekmivo login."],["Your workspace","Name your business and choose which tools to use."],["Your payments","Connect payment options when you're ready."]],
  registerNote:"Creating an account does not activate a paid plan."
 },
 bn:{
  login:{label:"SIGN IN",heading:"আপনার অ্যাকাউন্টে লগইন করুন",intro:"লগইন করলেই আপনার ডিফল্ট ওয়ার্কস্পেস খুলবে।",submit:"Sign in",alternative:"Ekmivo-তে নতুন?",switch:"অ্যাকাউন্ট খুলুন"},
  register:{label:"CREATE ACCOUNT",heading:"Ekmivo-তে অ্যাকাউন্ট খুলুন",intro:"অ্যাকাউন্ট তৈরি হলে নিজের ব্যবসার ওয়ার্কস্পেস সাজিয়ে নিতে পারবেন।",submit:"অ্যাকাউন্ট তৈরি করুন",alternative:"আগেই অ্যাকাউন্ট আছে?",switch:"Sign in"},
  name:"আপনার নাম",email:"ইমেইল",password:"পাসওয়ার্ড",confirm:"পাসওয়ার্ড আবার লিখুন",show:"দেখুন",hide:"লুকান",forgot:"পাসওয়ার্ড ভুলে গেছেন?",
  nameError:"নাম ২ থেকে ১০০ অক্ষরের মধ্যে লিখুন।",emailError:"সঠিক ইমেইল ঠিকানা লিখুন।",loginPasswordError:"পাসওয়ার্ড লিখুন।",passwordError:"কমপক্ষে ১২ অক্ষরের পাসওয়ার্ড দিন।",confirmError:"পাসওয়ার্ড দুটি মেলেনি।",
  invalid:"চিহ্নিত তথ্যগুলো ঠিক করে আবার চেষ্টা করুন।",pending:"অপেক্ষা করুন…",home:"Ekmivo হোমপেজে ফিরুন",
  asideHeading:"আগের কাজেই ফিরে যান।",asideText:"আপনার পেমেন্ট, হিসাব আর ওয়ার্কস্পেস যেখানে রেখেছিলেন, সেখান থেকেই শুরু করুন।",
  registerGuide:"অ্যাকাউন্ট খোলার পর",steps:[["অ্যাকাউন্ট তৈরি","নাম, ইমেইল ও পাসওয়ার্ড দিয়ে শুরু করুন।"],["ওয়ার্কস্পেস তৈরি","আপনার ব্যবসার নাম দিন এবং কোন সেবা ব্যবহার করবেন, বেছে নিন।"],["পেমেন্ট সেটআপ","প্রস্তুত হলে পেমেন্ট অ্যাকাউন্ট ও চেকআউট যুক্ত করুন।"]],
  registerNote:"অ্যাকাউন্ট খুললেই কোনো পেইড প্যাকেজ চালু হবে না।"
 }
} as const;

type Field="name"|"email"|"password"|"confirm";
type FieldErrors=Partial<Record<Field,string>>;
function Submit({label,pendingText}:{label:string;pendingText:string}){
 const {pending}=useFormStatus();
 return <button className="ek-auth-primary ek-auth-submit" type="submit" disabled={pending} aria-busy={pending}>
  <span>{pending?pendingText:label}</span><span className="ek-auth-submit-arrow" aria-hidden="true">↗</span>
 </button>;
}
export function AuthForm({locale,mode}:{locale:Locale;mode:"login"|"register"}){
 const t=copy[locale],isLogin=mode==="login",page=t[mode];
 const action=isLogin?loginAction.bind(null,locale):registerAction.bind(null,locale);
 const [server,formAction]=useActionState<FormErrorState,FormData>(action,emptyState);
 const [errors,setErrors]=useState<FieldErrors>({});
 const [edited,setEdited]=useState<Partial<Record<Field,boolean>>>({});
 const [show,setShow]=useState(false);
 const [length,setLength]=useState(0);
 const fieldError=(field:Field)=>errors[field]||(!edited[field]&&server.status==="error"?server.fields?.[field]:undefined);
 const clear=(field:Field)=>{setErrors(old=>({...old,[field]:undefined}));setEdited(old=>({...old,[field]:true}));};
 function validate(event:React.FormEvent<HTMLFormElement>){
  const values=new FormData(event.currentTarget),found:FieldErrors={};
  const email=String(values.get("email")||"").trim(),password=String(values.get("password")||"");
  if(!isLogin){const name=String(values.get("name")||"").trim();if(name.length<2||name.length>100)found.name=t.nameError}
  if(email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))found.email=t.emailError;
  if(isLogin?password.length<1||password.length>256:password.length<12||password.length>256)found.password=isLogin?t.loginPasswordError:t.passwordError;
  if(!isLogin&&password!==String(values.get("confirm")||""))found.confirm=t.confirmError;
  if(Object.values(found).some(Boolean)){
   event.preventDefault();
   setErrors(found);
   const first=(["name","email","password","confirm"] as Field[]).find(field=>found[field]);
   (event.currentTarget.elements.namedItem(first||"email") as HTMLElement|null)?.focus();
  }else setErrors({});
 }
 const form=<form className="ek-auth-fields" action={formAction} noValidate onSubmit={validate}>
  {!isLogin&&<label htmlFor="auth-full-name">{t.name}<input id="auth-full-name" name="name" autoComplete="name" maxLength={100} placeholder={t.name} onChange={()=>clear("name")} aria-invalid={!!fieldError("name")} aria-describedby={fieldError("name")?"auth-name-error":undefined}/>{fieldError("name")&&<small id="auth-name-error" role="status" className="ek-field-error">{fieldError("name")}</small>}</label>}
  <label htmlFor="auth-email">{t.email}<input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@company.com" onChange={()=>clear("email")} aria-invalid={!!fieldError("email")} aria-describedby={fieldError("email")?"auth-email-error":undefined}/>{fieldError("email")&&<small id="auth-email-error" role="status" className="ek-field-error">{fieldError("email")}</small>}</label>
  <label htmlFor="auth-password">{t.password}<span className="ek-auth-password"><input id="auth-password" name="password" type={show?"text":"password"} autoComplete={isLogin?"current-password":"new-password"} maxLength={256} onChange={e=>{clear("password");setLength(e.target.value.length)}} aria-invalid={!!fieldError("password")} aria-describedby={fieldError("password")?"auth-password-error":undefined}/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?t.hide:t.show}>{show?t.hide:t.show}</button></span>{fieldError("password")&&<small id="auth-password-error" role="status" className="ek-field-error">{fieldError("password")}</small>}</label>
  {!isLogin&&<>
   <div className="ek-auth-strength" aria-label={locale==="bn"?"পাসওয়ার্ডে কমপক্ষে ১২ অক্ষর থাকতে হবে":"Use at least 12 characters"}><div className={length>=12?"has-password":""}/><div className={length>=12?"has-password":""}/><div className={length>=12?"has-password":""}/><div className={length>=12?"has-password":""}/><span>{length>=12?(locale==="bn"?"দৈর্ঘ্য ঠিক আছে":"Length requirement met"):(locale==="bn"?"কমপক্ষে ১২ অক্ষর":"At least 12 characters")}</span></div>
   <label htmlFor="auth-confirm">{t.confirm}<input id="auth-confirm" name="confirm" type={show?"text":"password"} autoComplete="new-password" maxLength={256} onChange={()=>clear("confirm")} aria-invalid={!!fieldError("confirm")} aria-describedby={fieldError("confirm")?"auth-confirm-error":undefined}/>{fieldError("confirm")&&<small id="auth-confirm-error" role="status" className="ek-field-error">{fieldError("confirm")}</small>}</label>
  </>}
  {isLogin&&<Link href="/forgot-password" className="ek-auth-forgot">{t.forgot} ↗</Link>}
  {server.status==="error"&&<p className="ek-form-error" role="alert">{server.message}</p>}
  {Object.values(errors).some(Boolean)&&<p className="ek-form-error" role="alert">{t.invalid}</p>}
  <Submit label={page.submit} pendingText={t.pending}/>
 </form>;
 const switchLink=<div className="ek-auth-switch"><span>{page.alternative}</span><Link href={isLogin?"/register":"/login"}>{page.switch} ↗</Link></div>;
 if(isLogin)return <main className="ek-auth-main ek-auth-designed ek-auth-login ek-auth-v2" lang={locale}>
  <div className="ek-auth-login-shell">
   <section className="ek-auth-login-rail">
    <Link className="ek-auth-brand-logo" href="/">ekmivo<span>.</span></Link>
    <div className="ek-auth-login-symbol" aria-hidden="true"><div className="ek-auth-login-orbit"/><span>↗</span><div className="ek-auth-login-chip">EKMIVO / 01</div></div>
    <div className="ek-auth-login-rail-copy"><span>YOUR WORKSPACE</span><h2>{t.asideHeading}</h2><p>{t.asideText}</p></div>
   </section>
   <section className="ek-auth-login-area" aria-labelledby="login-title"><div className="ek-auth-v2-form">
    <div className="ek-auth-form-top"><span className="ek-auth-card-kicker">{page.label}</span><span className="ek-auth-form-step">EKMIVO</span></div>
    <h1 id="login-title">{page.heading}</h1><p className="ek-auth-subtitle">{page.intro}</p>
    {form}{switchLink}
    <Link className="ek-auth-return" href="/">← {t.home}</Link>
   </div></section>
  </div>
 </main>;
 return <main className="ek-auth-main ek-auth-designed ek-auth-register ek-auth-v2" lang={locale}>
  <div className="ek-auth-register-shell">
   <div className="ek-auth-register-head"><Link className="ek-auth-brand-logo" href="/">ekmivo<span>.</span></Link><span>NEW ACCOUNT <i aria-hidden="true">✳</i></span></div>
   <div className="ek-auth-register-grid">
    <section className="ek-auth-register-form" aria-labelledby="register-title">
     <span className="ek-auth-card-kicker">{page.label}</span>
     <h1 id="register-title">{page.heading}</h1><p className="ek-auth-subtitle">{page.intro}</p>
     {form}<p className="ek-auth-register-tip">{t.registerNote}</p>{switchLink}
    </section>
    <aside className="ek-auth-register-guide"><span className="ek-auth-guide-eyebrow">{t.registerGuide}</span><div className="ek-auth-guide-path">{t.steps.map(([heading,body],i)=><div className="ek-auth-guide-row" key={heading}><span>{String(i+1).padStart(2,"0")}</span><div><strong>{heading}</strong><p>{body}</p></div></div>)}</div><span className="ek-auth-guide-signature">✳ &nbsp; EKMIVO</span></aside>
   </div>
   <Link href="/" className="ek-auth-register-back">← {t.home}</Link>
  </div>
 </main>;
}
