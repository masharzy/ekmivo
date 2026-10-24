"use client";
import {CheckoutReturn} from "./checkout-return";
import {compactOrderReference} from "../lib/checkout-return";
import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from "react";
import type {MerchantBrandInfo} from "./merchant-brand";
import type {CheckoutThemeConfig} from "../lib/checkout-theme";
import {type PayMethod,payNames} from "./provider-mark";
import "./themed-checkout.css";
export type ThemeStep='pay'|'payer'|'waiting'|'success'|'cancelled'|'expired';
export const walletColors={bkash:['#E2136E','#A6104F'],nagad:['#F37021','#E2231A'],rocket:['#8C3494','#4E1A6B']};
export function WalletToken({method}:{method:PayMethod}){return <span className="pm">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/payment-assets/${method}-icon.png`} alt="" aria-hidden="true"/></span>}
function BrandMark({config}:{config:CheckoutThemeConfig}){return config.store.logo?<div className="tk-mk has-logo" style={{borderRadius:config.store.radius}}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={config.store.logo} alt=""/></div>:<div className="tk-mk">{config.store.name.trim().charAt(0).toUpperCase()}</div>}

function safeMerchantUrl(value?:string){
 if(!value)return "";
 try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password?url.href:""}catch{return ""}
}
function customerPhone(value?:string){
 const digits=(value||"").replace(/\D/g,"");
 const local=digits.startsWith("880")?"0"+digits.slice(3):digits;
 return /^01[3-9]\d{8}$/.test(local)?"+88"+local:"";
}
function MerchantInfo({brand,name,locale}:{brand?:MerchantBrandInfo;name:string;locale:"en"|"bn"}){
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const website=safeMerchantUrl(brand?.website_url||brand?.support_url);
 const policy=safeMerchantUrl(brand?.legal_url);
 const support=customerPhone(brand?.support_phone);
 const whatsapp=customerPhone(brand?.whatsapp);
 const email=brand?.support_email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brand.support_email)?brand.support_email:"";
 useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[open]);
 const close=()=>{setOpen(false);trigger.current?.focus()};
 return <>
  <button ref={trigger} type="button" className="tk-info-toggle" aria-haspopup="dialog" aria-expanded={open} aria-label={t("Business information and contact","ব্যবসার তথ্য ও যোগাযোগ")} title={t("Business information","ব্যবসার তথ্য")} onClick={()=>setOpen(value=>!value)}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 10.8v5.5M12 7.5h.01"/></svg></button>
  {open&&<><button type="button" className="tk-info-dismiss" tabIndex={-1} aria-label={t("Close business information","ব্যবসার তথ্য বন্ধ করুন")} onClick={close}/><section className="tk-info-panel" role="dialog" aria-modal="false" aria-label={t("Business information","ব্যবসার তথ্য")}>
   <div className="tk-info-head"><strong>{t("About this business","ব্যবসার পরিচিতি")}</strong><button type="button" onClick={close} aria-label={t("Close","বন্ধ করুন")}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
   <div className="tk-info-body"><b className="tk-info-name">{name}</b>{brand?.description&&<p>{brand.description}</p>}
   <dl>
   {brand?.business_type&&<div><dt>{t("Business type","ব্যবসার ধরন")}</dt><dd>{brand.business_type}</dd></div>}
   {brand?.address&&<div><dt>{t("Address","ঠিকানা")}</dt><dd>{brand.address}</dd></div>}
   {support&&<div><dt>{t("Support phone","সাপোর্ট ফোন")}</dt><dd><a href={"tel:"+support}>{support}</a></dd></div>}
   {whatsapp&&<div><dt>WhatsApp</dt><dd><a href={"https://wa.me/"+whatsapp.slice(1)} target="_blank" rel="noopener noreferrer">{whatsapp}</a></dd></div>}
   {email&&<div><dt>{t("Email","ইমেইল")}</dt><dd><a href={"mailto:"+email}>{email}</a></dd></div>}
   {website&&<div><dt>{t("Website","ওয়েবসাইট")}</dt><dd><a href={website} target="_blank" rel="noopener noreferrer">{website}</a></dd></div>}
   {policy&&<div><dt>{t("Refund policy","রিফান্ড নীতিমালা")}</dt><dd><a href={policy} target="_blank" rel="noopener noreferrer">{t("View policy","নীতিমালা দেখুন")}</a></dd></div>}
   {brand?.statement_name&&<div><dt>{t("Statement name","স্টেটমেন্টের নাম")}</dt><dd>{brand.statement_name}</dd></div>}
   </dl>{brand?.receipt_note&&<p className="tk-info-note">{brand.receipt_note}</p>}
   </div>
  </section></>}
 </>;
}
function ClockFace({seconds}:{seconds:number}){const circumference=2*Math.PI*90,f=Math.min(1,Math.max(0,seconds/840));return <div className="tk-face"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98" className="fb"/><g className="ft">{Array.from({length:60},(_,i)=>{const a=i*Math.PI/30,r=i%5?76:70;return <line key={i} x1={100+Math.sin(a)*82} y1={100-Math.cos(a)*82} x2={100+Math.sin(a)*r} y2={100-Math.cos(a)*r}/>})}</g><circle cx="100" cy="100" r="90" className="ftr"/><circle cx="100" cy="100" r="90" className="fpr" style={{strokeDasharray:circumference,strokeDashoffset:(1-f)*circumference}}/><g style={{transform:`rotate(${f*360}deg)`,transformOrigin:'100px 100px',transition:'transform 1s linear'}}><circle cx="100" cy="10" r="6" className="fh"/></g></svg><div className="tk-fc"><b>{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</b></div></div>}
export function ThemedCheckout({config,locale,method,step,amountMinor,reference,children,seconds=0,onLanguage,merchant}:{config:CheckoutThemeConfig;locale:'en'|'bn';method:PayMethod|null;step:ThemeStep;amountMinor:number;reference:string;children:ReactNode;seconds?:number;onLanguage?:()=>void;merchant?:MerchantBrandInfo}){
 const bn=locale==='bn',t=(en:string,be:string)=>bn?be:en,th=config.theme,official=th==='official',neutral=official&&!method&&step==='pay',m=method||'bkash',colors=neutral?['#2B2D3A','#15161C']:walletColors[m];
 const index=({pay:0,payer:1,waiting:2} as Partial<Record<ThemeStep,number>>)[step],amount='৳'+new Intl.NumberFormat('en-BD',{minimumFractionDigits:0,maximumFractionDigits:2}).format(amountMinor/100);
 const mark=<BrandMark config={config}/>,identity=<div className="tk-mi"><b>{config.store.name}</b><span className="tk-ref" title={reference}>{t('Order','অর্ডার')} {compactOrderReference(reference)}</span></div>,total=<div className="tk-amt"><small>{t('Total','মোট')}</small>{amount}</div>;
 const progress=index===undefined?null:<div className="tk-pg" aria-hidden="true">{[0,1,2].map(i=><i className={i<=index?'on':''} key={i}/>)}</div>;
 const language=onLanguage&&<button type="button" className="tk-lg" onClick={onLanguage}>{bn?'EN':'বাং'}</button>;
 const rail=[['Choose how to pay','bKash, Nagad or Rocket','পরিশোধের মাধ্যম বেছে নিন','বিকাশ, নগদ বা রকেট'],['Enter your number','The one you will pay from','আপনার নম্বর দিন','যে নম্বর থেকে টাকা পাঠাবেন'],['Send the money','From your mobile app','টাকা পাঠান','আপনার মোবাইল অ্যাপ থেকে'],['Payment confirmed','You will see a confirmation','পেমেন্ট নিশ্চিত','আপনি নিশ্চিতকরণ দেখতে পাবেন']];
 return <div className="checkout-theme-surface"><main data-customer-checkout="true" data-logo-position={config.store.position} data-logo-invert={config.theme==="night"&&config.store.invert?"true":"false"} className={official?`tk of of-${neutral?'none':m}`:`tk tk-${th==='rail'?'railx':th}`} style={{'--lgs':`${config.store.size}px`,'--lgr':`${config.store.radius}px`,...(official?{'--pc':colors[0],'--p2':colors[1]}:{})} as CSSProperties} lang={locale}>{!official&&<div className="tk-bg"/>}<section className="tk-card">
 <MerchantInfo brand={merchant} name={config.store.name} locale={locale}/>
 {official?<header className="of-hd">{language}<span className="of-chip">{neutral?<i className="of-ic">○</i>:<WalletToken method={m}/>}<b>{neutral?t('Choose a wallet','ওয়ালেট বেছে নিন'):payNames[m]}</b></span><div className="of-mr">{mark}{identity}</div>{total}</header>:<>{language}<aside className="tk-side">{th==='dial'?<><div className="tk-mrow">{mark}{identity}</div>{step==='waiting'?<ClockFace seconds={seconds}/>:total}</>:<><div className="tk-brand-row">{mark}{identity}</div>{total}<ol className="tk-rail">{rail.map((row,i)=><li key={i} className={i<(index??(step==='success'?4:-1))?'d':i===index?'c':''}><span><b>{t(row[0],row[2])}</b><small>{t(row[1],row[3])}</small></span></li>)}</ol></>}</aside></>}
 <div className={`tk-main${index===undefined?' rs':''}`}>{progress}{children}<p className="tk-pw">Powered by <b>ekmivo</b></p></div></section></main></div>;
}
export function ThemedResult({step,locale,amountMinor,method,reference,store,returnDestination}:{step:'success'|'cancelled'|'expired';locale:'en'|'bn';amountMinor:number;method:PayMethod;reference:string;store:string;returnDestination:string}){
 const bn=locale==='bn',t=(en:string,be:string)=>bn?be:en,success=step==='success',expired=step==='expired',amount='৳'+new Intl.NumberFormat('en-BD',{minimumFractionDigits:0,maximumFractionDigits:2}).format(amountMinor/100);
 return <><div className={`tk-res ${success?'ok':'no'}`}><span className="tk-stamp">{success?t('PAID','পরিশোধিত'):expired?t('EXPIRED','মেয়াদোত্তীর্ণ'):t('VOID','বাতিল')}</span><svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="28" cy="28" r="24"/><path d={success?'m17 29 8 8 14-16':expired?'M28 16v14M28 38v2':'m19 19 18 18M37 19 19 37'}/></svg></div><h2 className="tk-h">{success?t('Payment received','পেমেন্ট পাওয়া গেছে'):expired?t('This payment link has expired','এই পেমেন্ট লিংকের মেয়াদ শেষ হয়েছে'):t('Payment cancelled','পেমেন্ট বাতিল করা হয়েছে')}</h2><p className="tk-sub">{success?t(`Thank you. ${amount} has been paid to ${store}.`,`ধন্যবাদ। ${store}-কে ${amount} পরিশোধ করা হয়েছে।`):t('This link is no longer active. Please do not send money to it. Ask the business for a new one.',`এই লিংকটি আর সক্রিয় নেই। এতে টাকা পাঠাবেন না। নতুন লিংকের জন্য ${store}-এর সঙ্গে যোগাযোগ করুন।`)}</p>{success&&<dl className="tk-dl"><div><dt>{t('Amount','পরিমাণ')}</dt><dd>{amount}</dd></div><div><dt>{t('Paid with','মাধ্যম')}</dt><dd>{payNames[method]}</dd></div><div><dt>{t('Order','অর্ডার')}</dt><dd title={reference}>{compactOrderReference(reference)}</dd></div></dl>}<CheckoutReturn destination={returnDestination} store={store} bn={bn}/></>;
}
