"use client";

import Link from "next/link";
import {useActionState,useState} from "react";
import {useFormStatus} from "react-dom";
import {loginAction,registerAction} from "../actions/account";
import {emptyState,type FormErrorState} from "../lib/server/validation";
import type {Locale} from "../lib/site-copy";

const copy={
 en:{
  login:{intro:"Back to the work that matters.",title:"Welcome back.",subtitle:"Sign in to manage payments and your Ekmivo workspace.",submit:"Sign in",bottom:"New to Ekmivo?",swap:"Create an account",eyebrow:"WELCOME BACK"},
  register:{intro:"A clearer way to manage payments.",title:"Create your account.",subtitle:"Get your workspace ready and choose the services you need.",submit:"Create account",bottom:"Already have an account?",swap:"Sign in",eyebrow:"GET STARTED"},
  name:"Full name",email:"Email address",password:"Password",confirm:"Confirm password",show:"Show",hide:"Hide",
  strength:"Use at least 12 characters.",back:"Back to home",pending:"Please wait…",forgot:"Forgot password?",
  introDetail:"Your payments and everyday work, in one place.",loginTip:"Use the email address associated with your account."
 },
 bn:{
  login:{intro:"আপনার সব কাজ, এক জায়গায়।",title:"আবার স্বাগতম।",subtitle:"পেমেন্ট ও ওয়ার্কস্পেসের কাজ চালিয়ে যেতে Sign in করুন।",submit:"Sign in",bottom:"Ekmivo-তে নতুন?",swap:"অ্যাকাউন্ট তৈরি করুন",eyebrow:"আবার স্বাগতম"},
  register:{intro:"পেমেন্টের কাজ শুরু হোক গুছিয়ে।",title:"অ্যাকাউন্ট তৈরি করুন।",subtitle:"Ekmivo-তে আপনার ওয়ার্কস্পেস তৈরি করে প্রয়োজনের সেবা বেছে নিন।",submit:"অ্যাকাউন্ট তৈরি করুন",bottom:"আগেই অ্যাকাউন্ট আছে?",swap:"Sign in",eyebrow:"নতুন অ্যাকাউন্ট"},
  name:"পুরো নাম",email:"ইমেইল ঠিকানা",password:"পাসওয়ার্ড",confirm:"আবার পাসওয়ার্ড লিখুন",show:"দেখুন",hide:"লুকান",
  strength:"কমপক্ষে ১২ অক্ষর ব্যবহার করুন।",back:"হোমপেজে ফিরুন",pending:"অপেক্ষা করুন…",forgot:"পাসওয়ার্ড ভুলে গেছেন?",
  introDetail:"পেমেন্ট, চেকআউট ও ব্যবসার তথ্য একই ওয়ার্কস্পেসে।",loginTip:"অ্যাকাউন্ট খোলার সময় যে ইমেইল ব্যবহার করেছেন, সেটি লিখুন।"
 }
} as const;

function Submit({label,loading}:{label:string;loading:string}){
 const {pending}=useFormStatus();
 return <button className="ek-auth-primary" type="submit" disabled={pending}>{pending?loading:label}<span aria-hidden="true">↗</span></button>;
}

export function AuthForm({locale,mode}:{locale:Locale;mode:"login"|"register"}){
 const t=copy[locale],p=t[mode],login=mode==="login";
 const action=login?loginAction.bind(null,locale):registerAction.bind(null,locale);
 const [state,formAction]=useActionState<FormErrorState,FormData>(action,emptyState);
 const [show,setShow]=useState(false);
 return <main className="ek-auth-main" lang={locale}>
 
  <div className="ek-auth-layout ek-auth-layout-compact">
   <div className="ek-auth-card">
    <span className="ek-auth-card-kicker">{p.eyebrow}</span>
    <h1>{p.title}</h1><p className="ek-auth-subtitle">{p.subtitle}</p>
    <form action={formAction}>
     {!login&&<label>{t.name}<input type="text" name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder={t.name} aria-invalid={!!state.fields?.name}/>{state.fields?.name&&<small className="ek-field-error">{state.fields.name}</small>}</label>}
     <label>{t.email}<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} aria-invalid={!!state.fields?.email}/>{state.fields?.email&&<small className="ek-field-error">{state.fields.email}</small>}</label>
     <label>{t.password}<span className="ek-auth-password"><input name="password" type={show?"text":"password"} autoComplete={login?"current-password":"new-password"} minLength={login?1:12} maxLength={256} required aria-invalid={!!state.fields?.password}/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?t.hide:t.show}>{show?t.hide:t.show}</button></span>{!login&&<small className="ek-auth-hint">{t.strength}</small>}{state.fields?.password&&<small className="ek-field-error">{state.fields.password}</small>}</label>
     {!login&&<label>{t.confirm}<input name="confirm" type={show?"text":"password"} autoComplete="new-password" minLength={12} required aria-invalid={!!state.fields?.confirm}/>{state.fields?.confirm&&<small className="ek-field-error">{state.fields.confirm}</small>}</label>}
     {login&&<Link className="ek-auth-forgot" href={`/${locale}/forgot-password`}>{t.forgot} ↗</Link>}
     {state.status==="error"&&<p className="ek-form-error" role="alert">{state.message}</p>}
     <Submit label={p.submit} loading={t.pending}/>
    </form>
    <div className="ek-auth-switch"><span>{p.bottom}</span><Link href={`/${locale}/${login?"register":"login"}`}>{p.swap} ↗</Link></div>
   </div>
  </div>
  <Link className="ek-auth-back" href={`/${locale}`}>← {t.back}</Link>
 </main>;
}
