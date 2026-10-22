"use client";
import Link from "next/link";
import {useActionState,useRef,useState} from "react";
import {useFormStatus} from "react-dom";
import {loginAction,registerAction} from "../actions/account";
import {emptyState,type FormErrorState} from "../lib/server/validation";
import {passwordChecks,validNewPassword} from "../lib/password-policy";
import {PublicIcon} from "./public-icon";
import type {Locale} from "../lib/site-copy";
import {beginGoogleAction} from "../actions/google";
type Field="email"|"password"|"name"|"workspace_name";
function Submit({label,bn}:{label:string;bn:boolean}){const {pending}=useFormStatus();return <button className="ek-auth-primary ek-auth-submit" type="submit" disabled={pending} aria-busy={pending}>{pending?(bn?"অপেক্ষা করুন…":"Please wait…"):label}<span aria-hidden="true">↗</span></button>}
export function AuthForm({locale,mode,googleReady=false,googleNotice=""}:{locale:Locale;mode:"login"|"register";googleReady?:boolean;googleNotice?:string}){
 const bn=locale==="bn",login=mode==="login",t=(en:string,bengali:string)=>bn?bengali:en;
 const submitAction=login?loginAction.bind(null,locale):registerAction.bind(null,locale);
 const [server,action]=useActionState<FormErrorState,FormData>(async(previous,data)=>{const result=await submitAction(previous,data);setEdited({});return result;},emptyState);
 const [values,setValues]=useState({email:"",password:"",name:"",workspace_name:""});
 const [step,setStep]=useState(1),[show,setShow]=useState(false),[errors,setErrors]=useState<Partial<Record<Field,string>>>({}),[edited,setEdited]=useState<Partial<Record<Field,boolean>>>({});
 const formRef=useRef<HTMLFormElement|null>(null);
 const currentStep=server.status==="error"&&((server.fields?.email&&!edited.email)||(server.fields?.password&&!edited.password))?1:step;
 const change=(field:Field,value:string)=>{setValues(v=>({...v,[field]:value}));setErrors(e=>({...e,[field]:undefined}));setEdited(e=>({...e,[field]:true}));};
 const error=(field:Field)=>errors[field]||(!edited[field]&&server.status==="error"?server.fields?.[field]:undefined);
 function credentials(){const found:Partial<Record<Field,string>>={};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())||values.email.trim().length>254)found.email=t("Enter a valid email address.","সঠিক ইমেইল ঠিকানা দিন।");if(login?values.password.length<1||values.password.length>256:!validNewPassword(values.password))found.password=login?t("Enter your password.","পাসওয়ার্ড দিন।"):t("Use 8–256 characters with a letter and a number.","৮–২৫৬ অক্ষর, অন্তত একটি অক্ষর ও একটি সংখ্যা দিন।");return found;}
 function validate(e:React.FormEvent<HTMLFormElement>){
  const found=credentials();
  if(!login&&currentStep===1){e.preventDefault();setErrors(found);if(!Object.keys(found).length){setStep(2);setEdited({email:true,password:true});requestAnimationFrame(()=>document.getElementById("auth-name")?.focus());}else formRef.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(found)[0]}"]`)?.focus();return;}
  if(!login)for(const f of ["name"] as const)if(values[f].trim().length<2||values[f].trim().length>100)found[f]=t("Enter 2–100 characters.","২–১০০ অক্ষরের মধ্যে লিখুন।");
  setErrors(found);if(Object.keys(found).length){e.preventDefault();if(found.email||found.password)setStep(1);requestAnimationFrame(()=>document.getElementById("auth-"+Object.keys(found)[0])?.focus());}
 }
 const input=(field:Field,label:string,complete:string)=><label htmlFor={"auth-"+field}>{label}<input id={"auth-"+field} name={field} value={values[field]} onChange={e=>change(field,e.target.value)} autoComplete={complete} maxLength={field==="email"?254:100} type={field==="email"?"email":"text"} aria-invalid={!!error(field)} aria-describedby={error(field)?"error-"+field:undefined}/>{error(field)&&<small id={"error-"+field} className="ek-field-error">{error(field)}</small>}</label>;
 const c=passwordChecks(values.password);
 const heading=login?t("Pick up where you left off.","আপনার কাজে ফিরে যান।"):currentStep===1?t("Start with your account.","আপনার অ্যাকাউন্ট দিয়ে শুরু করুন।"):t("What should we call you?","আপনাকে কী বলে ডাকব?");
 return <main className={`ek-auth-main ek-auth-designed ek-auth-v2 ekm-auth ${login?"ek-auth-login":"ek-auth-register"} ek-auth-polished`} lang={locale}><div className="ek-auth-login-shell">
  <section className="ek-auth-login-rail" aria-label={t("One connected workspace","একটি সংযুক্ত ওয়ার্কস্পেস")}>
   <span className="ekm-auth-rail-kicker"><i aria-hidden="true"/>{t("YOUR WORKSPACE, REIMAGINED","আপনার কাজের নতুন ঠিকানা")}</span>
   <div className="ek-auth-login-rail-copy"><span>{t("PAYMENTS · AI BOT · ONE PLACE","পেমেন্টস · এআই বট · এক জায়গায়")}</span><h2>{t("Less switching. More doing.","কম ঝামেলা। কাজে বেশি মন।")}</h2><p>{t("Keep payments, conversations and everyday business work together in one clear space.","পেমেন্ট, কথোপকথন আর ব্যবসার প্রতিদিনের কাজ—সব থাকুক একই গুছানো জায়গায়।")}</p></div>
   <div className="ek-auth-workflow"><span><i aria-hidden="true"/>{t("YOUR BUSINESS, ORGANIZED","ব্যবসার কাজ এক জায়গায়")}</span>{[
   {icon:"wallet" as const,title:t("Payment requests","পেমেন্ট অনুরোধ"),body:t("Links, invoices and checkout.","লিংক, ইনভয়েস ও checkout।")},
   {icon:"shield" as const,title:t("Receipt verification","পেমেন্ট যাচাই"),body:t("Follow the result of each payment.","প্রতিটি পেমেন্টের অবস্থা দেখুন।")},
   {icon:"business" as const,title:t("Your workspace","আপনার ওয়ার্কস্পেস"),body:t("Your team and business tools.","আপনার টিম ও ব্যবসার সেবা।")}
  ].map(item=><div key={item.title}><span className="ek-auth-workflow-icon"><PublicIcon name={item.icon}/></span><div><strong>{item.title}</strong><p>{item.body}</p></div><span className="ekm-auth-workflow-arrow" aria-hidden="true">↗</span></div>)}</div>
   <span className="ekm-auth-rail-bottom">EKMIVO <span aria-hidden="true">✳</span> {t("A calmer way to work","গুছিয়ে কাজ করার সহজ উপায়")}</span>
  </section>
  <section className="ek-auth-login-area" aria-labelledby="auth-heading"><div className="ek-auth-v2-form">
   <span className="ekm-auth-form-eyebrow"><i aria-hidden="true"/>{login?t("WELCOME BACK","আবার স্বাগতম"):t("GET STARTED","চলুন শুরু করি")}</span>
   {!login&&<ol className="ek-auth-progress" aria-label={t("Registration steps","অ্যাকাউন্ট তৈরির ধাপ")}><li aria-current={currentStep===1?"step":undefined}><span>{currentStep===2?<PublicIcon name="check"/>:"1"}</span>{t("Account","অ্যাকাউন্ট")}</li><li aria-current={currentStep===2?"step":undefined}><span>2</span>{t("Your name","আপনার নাম")}</li></ol>}
   <h1 id="auth-heading">{heading}</h1><p className="ek-auth-subtitle">{login?t("Sign in to open your default workspace.","লগইন করে আপনার ডিফল্ট ওয়ার্কস্পেস খুলুন।"):currentStep===1?t("Your email and a secure password. That's the first step.","ইমেইল ও নিরাপদ পাসওয়ার্ড দিয়ে প্রথম ধাপ শুরু করুন।"):t("Enter your name. Store setup comes after verification.","আপনার নাম দিন। ভেরিফিকেশনের পরে স্টোর সেটআপ হবে।")}</p>
   {googleNotice&&<p className="ek-form-error" role="status">{googleNotice}</p>}
   {googleReady&&(login||currentStep===1)&&<form action={beginGoogleAction.bind(null,locale,"signin")}><GoogleSubmit bn={bn}/></form>}
   <form ref={formRef} className="ek-auth-fields" action={action} onSubmit={validate} noValidate>
    {login||currentStep===1?<>{input("email",t("Email address","ইমেইল ঠিকানা"),"email")}<label htmlFor="auth-password">{t("Password","পাসওয়ার্ড")}<span className="ek-auth-password"><input id="auth-password" name="password" aria-label={t("Password","পাসওয়ার্ড")} type={show?"text":"password"} autoComplete={login?"current-password":"new-password"} maxLength={256} value={values.password} onChange={e=>change("password",e.target.value)} aria-invalid={!!error("password")} aria-describedby={error("password")?"auth-password-error":!login?"auth-password-checks":undefined}/><button type="button" aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?t("Hide","লুকান"):t("Show","দেখুন")}</button></span>{error("password")&&<small id="auth-password-error" className="ek-field-error">{error("password")}</small>}</label>
    {!login&&<ul className="ek-password-checks" id="auth-password-checks">{[{met:c.length,label:t("8–256 characters","৮–২৫৬ অক্ষর")},{met:c.letter,label:t("At least one letter","অন্তত একটি অক্ষর")},{met:c.number,label:t("At least one number","অন্তত একটি সংখ্যা")},{met:c.symbol,label:t("Symbol for extra strength (optional)","আরও শক্তিশালী করতে বিশেষ চিহ্ন (ঐচ্ছিক)")}].map(item=><li key={item.label} data-met={item.met}><span aria-hidden="true">{item.met?<PublicIcon name="check"/>:"○"}</span><span className="sr-only">{item.met?t("Met: ","পূরণ হয়েছে: "):t("Not met: ","পূরণ হয়নি: ")}</span>{item.label}</li>)}</ul>}</>:<><input type="hidden" name="email" value={values.email}/><input type="hidden" name="password" value={values.password}/><p className="ek-auth-account-summary"><PublicIcon name="key"/>{values.email}<button type="button" onClick={()=>{setStep(1);setEdited({email:true,password:true});}}>{t("Edit","পরিবর্তন")}</button></p>{input("name",t("Your name","আপনার নাম"),"name")}<p className="ek-auth-register-tip">{t("Choose your services after verification.","ভেরিফিকেশনের পরে আপনার সেবা বেছে নেবেন।")}</p></>}
    {!login&&<input type="hidden" name="confirm" value={values.password}/>}{login&&<Link href="/forgot-password" className="ek-auth-forgot">{t("Forgot password?","পাসওয়ার্ড ভুলে গেছেন?")}</Link>}
    {server.status==="error"&&<p className="ek-form-error" role="alert">{server.message}</p>}
    {!login&&currentStep===1?<button className="ek-auth-primary ek-auth-submit" type="submit">{t("Continue","পরবর্তী ধাপ")}<span aria-hidden="true">→</span></button>:<Submit bn={bn} label={login?t("Sign in","লগইন করুন"):t("Create account","অ্যাকাউন্ট খুলুন")}/>}
   </form>{!login&&<p className="ek-auth-register-tip">{t("Creating an account does not activate a paid plan.","অ্যাকাউন্ট খুললেই পেইড প্যাকেজ চালু হবে না।")}</p>}
   <div className="ek-auth-switch"><span>{login?t("New to Ekmivo?","Ekmivo-তে নতুন?"):t("Already have an account?","আগেই অ্যাকাউন্ট আছে?")}</span><Link href={login?"/register":"/login"}>{login?t("Create account","অ্যাকাউন্ট খুলুন"):t("Sign in","লগইন করুন")}</Link></div><Link className="ek-auth-return" href="/">← {t("Back to home","হোমপেজে ফিরুন")}</Link>
  </div></section>
 </div></main>;
}
function GoogleSubmit({bn}:{bn:boolean}){const {pending}=useFormStatus();return <button className="ek-auth-google" type="submit" disabled={pending}>{pending?(bn?"Google খুলছে…":"Opening Google…"):(bn?"Google দিয়ে চালিয়ে যান":"Continue with Google")}</button>}
