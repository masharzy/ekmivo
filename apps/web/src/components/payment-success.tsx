"use client";
import {useEffect,useState} from "react";
import {ProviderMark,type PayMethod} from "./provider-mark";

function safeReturnUrl(raw?:string):string {
 if(!raw)return "";
 try{
  const u=new URL(raw);
  return (u.protocol==="https:"||u.protocol==="http:"&&u.hostname==="localhost")&&!u.username&&!u.password?u.href:"";
 }catch{return ""}
}

export function PaymentSuccess({method,returnUrl,bn}:{method:PayMethod;returnUrl?:string;bn:boolean}){
 const destination=safeReturnUrl(returnUrl);
 const [seconds,setSeconds]=useState(3);
 useEffect(()=>{
  if(!destination)return;
  const timer=window.setInterval(()=>setSeconds(n=>Math.max(0,n-1)),1000);
  const redirect=window.setTimeout(()=>window.location.assign(destination),3000);
  return()=>{window.clearInterval(timer);window.clearTimeout(redirect)};
 },[destination]);
 const provider=method==="bkash"?"bKash":method==="nagad"?"Nagad":"Rocket";
 return <main className={"ek-payment-success ek-payment-success-"+method} role="status" aria-live="polite">
  <div className="ek-success-shell">
   <header className="ek-success-brand"><ProviderMark method={method}/></header>
   <section className="ek-success-panel">
    <svg className="ek-success-check" width="70" height="70" viewBox="0 0 70 70" fill="none" aria-hidden="true">
     <circle cx="35" cy="35" r="32" stroke="white" strokeOpacity=".8" strokeWidth="2"/>
     <path d="M19 35l11 11 22-23" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <h1>{destination?bn?provider+" অ্যাকাউন্ট যাচাই সফল":provider+" Account verification successful":bn?"পেমেন্ট সম্পন্ন হয়েছে":"Payment completed"}</h1>
    {destination?<p>{bn?"বিক্রেতার ওয়েবসাইটে ফিরে যাচ্ছেন":"Redirecting to Merchant Website"} in {seconds}s</p>
     :<p>{bn?"আপনার পেমেন্ট সফলভাবে যাচাই হয়েছে।":"Your payment has been successfully verified."}</p>}
    {destination&&<a href={destination} className="ek-success-return">{bn?"বিক্রেতার ওয়েবসাইট":"Merchant Website"} ↗</a>}
   </section>
   <div className="ek-success-progress" aria-hidden="true"><span className="active"/><span className="active"/><span/><span/></div>
  </div>
  <style>{`
   .ek-payment-success{--ek-brand:#ca1459;min-height:100dvh;background:#f8f8f8;display:flex;justify-content:center;align-items:center;padding:28px 18px;font-family:Arial,"Hind Siliguri",sans-serif;color:#fff}
   .ek-payment-success-nagad{--ek-brand:#ee6228}.ek-payment-success-rocket{--ek-brand:#80269c}
   .ek-success-shell{width:min(100%,860px);box-shadow:0 3px 24px #00000008;background:#fff}
   .ek-success-brand{height:150px;display:flex;justify-content:center;align-items:center;background:#fff}
   .ek-success-brand>div{transform:scale(1.35)}
   .ek-success-panel{min-height:410px;background:linear-gradient(151deg,#ffffff28,#ffffff00 50%),linear-gradient(37deg,#ffffff1d 0 23%,transparent 23% 55%,#ffffff13 55% 72%,transparent 72%),linear-gradient(125deg,#ac3768,var(--ek-brand));display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:45px 28px;gap:10px}
   .ek-success-check{margin-bottom:12px}.ek-success-panel h1{font-size:clamp(20px,3.8vw,29px);font-weight:700;line-height:1.35;margin:0}
   .ek-success-panel p{font-size:clamp(16px,2.9vw,23px);line-height:1.45;margin:0}
   .ek-success-return{color:white;text-decoration:underline;text-underline-offset:4px;font-weight:700;margin-top:4px}
   .ek-success-progress{height:68px;background:#dedee0;display:flex;align-items:center;justify-content:center;gap:9px}
   .ek-success-progress span{height:7px;width:7px;background:#b9b9c0;border-radius:50%}
   .ek-success-progress span.active{height:11px;width:11px;background:var(--ek-brand)}
   @media(max-width:560px){.ek-payment-success{padding:0;align-items:stretch;background:white}.ek-success-shell{display:flex;flex-direction:column;min-height:100dvh}.ek-success-brand{height:130px}.ek-success-panel{flex:1;min-height:380px}.ek-success-progress{height:65px}}
  `}</style>
 </main>
}
