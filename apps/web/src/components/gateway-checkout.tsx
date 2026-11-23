"use client";
// Official ("gateway") checkout theme: the owner's design (2026-11-15).
// Step 1 is the owner-approved minimal provider selector; the wallet steps, success and
// cancel screens follow briofold-gateway-theme-preview.html exactly.
import {useRef,useState,type CSSProperties,type FormEvent,type ReactNode} from "react";
import {CheckoutReturn} from "./checkout-return";
import {compactOrderReference} from "../lib/checkout-return";
import type {CheckoutThemeConfig} from "../lib/checkout-theme";
import {type PayMethod} from "./provider-mark";
import type {ThemeStep} from "./themed-checkout";
import "./gateway-checkout.css";

const W:Record<PayMethod,{c:string;p2:string;bn:string;en:string}>={
 bkash:{c:"#E2136E",p2:"#C9105F",bn:"বিকাশ",en:"bKash"},
 nagad:{c:"#CE1319",p2:"#8E0E13",bn:"নগদ",en:"Nagad"},
 rocket:{c:"#8C3494",p2:"#5F2270",bn:"রকেট",en:"Rocket"},
};
const logo=(m:PayMethod)=>`/payment-assets/gw-${m}.png`;
export type GatewayTile={id:string;method:PayMethod;ready?:boolean};
export type GatewayField={key:"name"|"email"|"addr"|"note";value:string};

export type GatewayCheckoutProps={
 config:CheckoutThemeConfig;locale:"en"|"bn";step:ThemeStep;method:PayMethod;amountMinor:number;reference:string;onLanguage?:()=>void;error?:ReactNode;
 // step 1
 tiles:GatewayTile[];isPicked:(tile:GatewayTile)=>boolean;tileIndex:(tile:GatewayTile)=>number;onPick:(tile:GatewayTile)=>void;
 canPay:boolean;onPay:()=>void;fields:GatewayField[];onField:(key:GatewayField["key"],value:string)=>void;
 // step 2
 payer:string;onPayer:(value:string)=>void;onPayerBlur:()=>void;payerInvalid:boolean;locking:boolean;onBack:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>void;
 // step 3
 destination:string|null;destinationCopied:boolean;onCopyDestination:()=>void;onCopyAmount:()=>void;processing:boolean;timeLeft:string;sourceOffline:boolean;cancelling:boolean;onCancel:()=>void;payerShown:string;
 // result
 returnDestination:string;
 // step 1: extra inputs a payment link needs (quantity), shown above the Pay button
 extra?:ReactNode;
 // result: the payment link's note shown after a successful payment
 successNote?:string;
 // the dashboard preview renders a page fragment, without the full-height page background
 preview?:boolean;
};

const BF=<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/></svg>;

export function GatewayCheckout(p:GatewayCheckoutProps){
 const bn=p.locale==="bn",t=(b:string,e:string)=>bn?b:e,m=p.method,w=W[m],wn=(x:PayMethod)=>bn?W[x].bn:W[x].en;
 const amt="৳"+new Intl.NumberFormat("en-IN",{maximumFractionDigits:2}).format(p.amountMinor/100);
 const amt2=new Intl.NumberFormat("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2}).format(p.amountMinor/100);
 const store=p.config.store,ref=compactOrderReference(p.reference);
 const mark=(cls="")=><div className={`mk ${cls}`}>{store.logo?/* eslint-disable-next-line @next/next/no-img-element */<img src={store.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"inherit",filter:store.invert?"invert(1)":undefined}}/>:(store.name.trim()[0]||"B").toUpperCase()}</div>;
 const lgt=p.onLanguage?<span className="lgt"><button type="button" aria-pressed={bn} onClick={()=>{if(!bn)p.onLanguage?.()}}><span>বাং</span></button><button type="button" aria-pressed={!bn} onClick={()=>{if(bn)p.onLanguage?.()}}><span>EN</span></button></span>:null;
 const footer=(x?:PayMethod)=><><div className="pb"><span className="bf">{BF}</span>Powered by <b>Briofold</b> · {t("পেমেন্ট অটোমেশন","Payment Automation")}</div>{x&&<div className="disc">{t(`এটি ${wn(x)}-এর অফিসিয়াল পেজ নয়। ${store.name}-এর পেমেন্ট যাচাই করে Briofold।`,`Not an official ${wn(x)} page. Briofold verifies payments for ${store.name}.`)}</div>}</>;
 const err=p.error?<div className="gw-err" role="alert">{p.error}</div>:null;
 const root=(children:ReactNode,stage=true)=><div className="gw" lang={p.locale} data-customer-checkout="true" style={p.preview?{minHeight:0}:undefined}>{stage?<div className="gw-stage"><div className="gw-frame">{children}</div></div>:children}</div>;

 if(p.step==="pay"){
  const picked=p.tiles.find(x=>p.isPicked(x));
  const many=p.tiles.length>10;
  const labels:Record<GatewayField["key"],[string,string]>={name:["নাম","Name"],email:["ইমেইল","Email"],addr:["ঠিকানা","Address"],note:["নোট","Note"]};
  return root(<div className="gw-sw" style={p.preview?{minHeight:0}:undefined}><div className="gw-sb">
   <aside className="gw-si">{lgt}<div className="gw-mer"><div className="gw-logo" style={store.logo?{borderRadius:store.radius||18}:undefined}>{store.logo?/* eslint-disable-next-line @next/next/no-img-element */<img src={store.logo} alt="" style={store.invert?{filter:"invert(1)"}:undefined}/>:(store.name.trim()[0]||"B").toUpperCase()}</div><div><div className="gw-name">{store.name}</div><div className="gw-ord" title={p.reference}>#{ref}</div></div></div><div className="gw-pay"><span>{t("আপনি পরিশোধ করছেন","You are paying")}</span><b>{amt}</b></div><div className="gw-sum"><div><span>{t("সাবটোটাল","Subtotal")}</span><span>{amt}</span></div><div><span>{t("চার্জ","Charge")}</span><span>৳0</span></div><div className="tot"><span>{t("মোট","Total")}</span><span>{amt}</span></div></div></aside>
   <div className="gw-sp" style={{"--acc":picked?W[picked.method].c:"#15161C"} as CSSProperties}>
    <p className="gw-h">{t("পরিশোধের মাধ্যম বেছে নিন","Choose how to pay")}</p>
    {many&&<GatewaySearch tiles={p.tiles} render={list=><Grid list={list} p={p}/>} placeholder={t("খুঁজুন","Search")}/>}
    {!many&&<Grid list={p.tiles} p={p}/>}
    {p.fields.length>0&&<div className="gw-fields">{p.fields.map(f=>f.key==="note"
     ?<textarea key={f.key} placeholder={t(...labels.note)} aria-label={t(...labels.note)} maxLength={1000} value={f.value} onChange={e=>p.onField("note",e.target.value)}/>
     :<input key={f.key} className={f.key==="addr"?"w":undefined} type={f.key==="email"?"email":"text"} maxLength={254} placeholder={t(...labels[f.key])} aria-label={t(...labels[f.key])} value={f.value} onChange={e=>p.onField(f.key,e.target.value)}/>)}</div>}
    {p.extra&&<div className="gw-fields">{p.extra}</div>}
    <button type="button" className="gw-cta" disabled={!p.canPay} onClick={p.onPay}>{t(amt+" পরিশোধ করুন","Pay "+amt)}</button>
    {err}
    <p className="gw-pb">Powered by <b>Briofold</b></p>
   </div>
  </div></div>,false);
 }

 if(p.step==="payer"||p.step==="waiting"){
  const steps=<ul className="steps"><li><span className="n">1</span>{t("ঠিক "+amt+" পাঠান — কম বা বেশি নয়","Send exactly "+amt+" — no more, no less")}</li>{p.payerShown&&<li><span className="n">2</span>{t(p.payerShown+" নম্বর থেকেই পাঠান","Send from "+p.payerShown)}</li>}<li><span className="n">{p.payerShown?3:2}</span>{t("এই পেজেই থাকুন, টাকা পৌঁছানো মাত্র নিশ্চিত হবে","Stay here — confirmed the moment it arrives")}</li></ul>;
  const recv=<div className="box"><div><small>{t("এই নম্বরে পাঠান","Send to this number")}</small><strong className="num">{p.destination||"—"}</strong></div><button type="button" className="cp" disabled={!p.destination} onClick={p.onCopyDestination}>{p.destinationCopied?"✓":t("কপি","Copy")}</button></div>;
  const amtBox=<div className="box"><div><small>{t("যে পরিমাণ","Amount")}</small><strong className="num">{amt}</strong></div><button type="button" className="cp" onClick={p.onCopyAmount}>{t("কপি","Copy")}</button></div>;
  const status=<div className="wait-st"><i className="dot"/>{p.processing?t("যাচাই চলছে","Verification in progress"):t("আপনার পেমেন্টের অপেক্ষায়","Waiting for your payment")} · <b className="num">{p.timeLeft}</b></div>;
  const offline=p.sourceOffline?<div className="gw-err" role="alert">{t("গ্রহণকারী ফোন অফলাইনে। টাকা পাঠিয়ে থাকলে আবার পাঠাবেন না।","Receiving phone is offline. If you already paid, do not pay again.")}</div>:null;

  if(m==="nagad"){
   const head=<><div className="ng-top"><div style={{fontSize:11,opacity:.7}}>{t("নিরাপদ পেমেন্ট","Secure payment")}</div>{lgt}</div><div className="ng-hd">{mark()}<div className="nm">{store.name}</div></div><div className="ng-meta"><div className="r"><span>{t("অর্ডার নং","Order No")}</span><b className="num">{ref}</b></div><div className="r"><span>{t("মোট পরিমাণ","Total Amount")}</span><b className="num">BDT {amt2}</b></div><div className="r"><span>{t("চার্জ","Charge")}</span><b className="num">BDT 0</b></div></div></>;
   const foot=<div className="ng-foot">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={logo("nagad")} alt="Nagad"/></div>;
   if(p.step==="payer")return root(<div className="ng dark">{head}<form className="ng-bd" onSubmit={p.onSubmit} noValidate><h3>{t("কোন নগদ নম্বর থেকে টাকা পাঠাবেন?","Which Nagad number will you pay from?")}</h3><NagadDigits value={p.payer} onChange={p.onPayer} onBlur={p.onPayerBlur} disabled={p.locking} label={t("আপনার প্রেরক নম্বর","Your sending number")}/>{p.payerInvalid&&<p className="err" style={{textAlign:"center",color:"#FFE08A"}}>{t("সঠিক নম্বর দিন, যেমন 01712345678","Enter a valid number, e.g. 01712345678")}</p>}{err}<div className="ng-act"><button type="button" className="sec" disabled={p.locking} onClick={p.onBack}>{t("পিছনে","Back")}</button><button type="submit" disabled={p.locking||p.payerInvalid||p.payer.replace(/\D/g,"").length<11}>{p.locking?t("নিশ্চিত হচ্ছে…","Confirming…"):t("এগিয়ে যান","Proceed")}</button></div></form>{foot}{footer("nagad")}</div>);
   return root(<div className="ng dark">{head}<div className="ng-bd"><h3>{t("নগদ অ্যাপ থেকে Send Money করুন","Send Money from your Nagad app")}</h3>{offline}{recv}{amtBox}{steps}<div className="wait-st" style={{background:"rgba(0,0,0,.2)"}}><i className="dot"/>{p.processing?t("যাচাই চলছে","Verification in progress"):t("পেমেন্টের অপেক্ষায়","Waiting for payment")} · <b className="num">{p.timeLeft}</b></div>{err}<div className="ng-act"><button type="button" className="sec" disabled={p.cancelling} onClick={p.onCancel}>{t("বাতিল করুন","Cancel")}</button></div></div>{foot}{footer("nagad")}</div>);
  }

  const skin={"--pc":w.c,"--p2":w.p2} as CSSProperties;
  const head=<div className="bk-top"><div className="bk-logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={logo(m)} alt={w.en}/>{lgt}</div><div className="bk-mr">{mark()}<div><div className="nm">{store.name}</div><div className="ref num" title={p.reference}>{t("অর্ডার","Order")} {ref}</div></div><div className="amt"><small>{t("মোট","Total")}</small><b className="num">{amt}</b></div></div></div>;
  if(p.step==="payer"){const valid=!p.payerInvalid&&p.payer.replace(/\D/g,"").length>=11;return root(<form className="bk" style={skin} onSubmit={p.onSubmit} noValidate>{head}<div className="bk-body"><h3>{t("কোন "+w.bn+" নম্বর থেকে টাকা পাঠাবেন?","Which "+w.en+" number will you pay from?")}</h3><div className="field"><input className="bk-in num" type="tel" inputMode="numeric" maxLength={20} placeholder="01XXXXXXXXX" autoComplete="tel-national" aria-label={t("আপনার প্রেরক নম্বর","Your sending number")} aria-invalid={p.payerInvalid} disabled={p.locking} value={p.payer} onChange={e=>p.onPayer(e.target.value)} onBlur={p.onPayerBlur}/>{p.payerInvalid&&<p className="err" style={{color:"#FFE0E6"}}>{t("সঠিক নম্বর দিন, যেমন 01712345678","Enter a valid number, e.g. 01712345678")}</p>}{err}</div></div><div className="act"><button type="button" className="btn-ghost" disabled={p.locking} onClick={p.onBack}>{t("পিছনে","Back")}</button><button type="submit" className="btn-fill" disabled={p.locking||!valid}>{p.locking?t("নিশ্চিত হচ্ছে…","Confirming…"):t("এগিয়ে যান","Continue")}</button></div>{footer(m)}</form>);}
  return root(<div className="bk" style={skin}>{head}<div className="bk-body" style={{paddingTop:28}}><h3>{t(w.bn+" অ্যাপ থেকে Send Money করুন","Send Money from your "+w.en+" app")}</h3>{offline}{recv}{amtBox}{steps}{status}{err}</div><div className="act"><button type="button" className="btn-ghost" disabled={p.cancelling} onClick={p.onCancel}>{t("এই পেমেন্ট বাতিল করুন","Cancel this payment")}</button></div>{footer(m)}</div>);
 }

 const ok=p.step==="success",expired=p.step==="expired";
 const icon=ok?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>:<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>;
 return root(<div className="res" style={{"--c":w.c} as CSSProperties}><div className="res-top">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={logo(m)} alt={w.en}/>{lgt}</div><div className="res-mid"><div className={`res-ic ${ok?"ok":"no"}`}>{icon}</div><h2>{ok?t("পেমেন্ট নিশ্চিত হয়েছে","Payment confirmed"):expired?t("পেমেন্টের মেয়াদ শেষ","Payment expired"):t("পেমেন্ট বাতিল হয়েছে","Payment cancelled")}</h2>{ok&&p.successNote&&<p className="sub" style={{whiteSpace:"pre-line",fontWeight:600}}>{p.successNote}</p>}<p className="sub">{ok?t("আপনার "+wn(m)+" পেমেন্ট স্বয়ংক্রিয়ভাবে যাচাই হয়েছে।","Your "+wn(m)+" payment was verified automatically."):t("এই লিংকে আর টাকা পাঠাবেন না। নতুন লিংকের জন্য "+store.name+"-এর সঙ্গে যোগাযোগ করুন।","Do not send money to this link. Ask "+store.name+" for a new one.")}</p></div><dl><div><dt>{t("দোকান","Store")}</dt><dd>{store.name}</dd></div><div><dt>{t("অর্ডার","Order")}</dt><dd className="res-ref" title={p.reference}>{ref}</dd></div><div><dt>{t("পরিমাণ","Amount")}</dt><dd className="num">{amt}</dd></div>{ok&&<div><dt>{t("মাধ্যম","Method")}</dt><dd>{wn(m)}</dd></div>}</dl><div className="res-act">{p.returnDestination?<a className="cta acc" style={{"--c":w.c} as CSSProperties} href={p.returnDestination}>{t("দোকানে ফিরে যান","Back to store")}</a>:null}<CheckoutReturn destination={p.returnDestination} store={store.name} bn={bn}/></div>{err}{footer(m)}</div>);
}

function Grid({list,p}:{list:GatewayTile[];p:GatewayCheckoutProps}){
 return <div className="gw-grid" style={{"--cols":Math.max(1,Math.min(5,list.length))} as CSSProperties}>{list.map(tile=>{const n=p.tileIndex(tile),ready=tile.ready!==false;return <button type="button" key={tile.id||tile.method} className="gw-pv" style={{"--c":W[tile.method].c} as CSSProperties} aria-label={W[tile.method][p.locale==="bn"?"bn":"en"]+(n>1?" "+n:"")} aria-pressed={p.isPicked(tile)} disabled={!ready} onClick={()=>p.onPick(tile)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={logo(tile.method)} alt=""/>{n>1&&<i>{n}</i>}</button>})}</div>;
}

function GatewaySearch({tiles,render,placeholder}:{tiles:GatewayTile[];render:(list:GatewayTile[])=>ReactNode;placeholder:string}){
 const [query,setQuery]=useState("");
 const q=query.toLowerCase().replace(/\s+/g,"");
 const list=q?tiles.filter(x=>(x.method+W[x.method].bn+W[x.method].en.toLowerCase()).includes(q)):tiles;
 return <><input className="gw-q" type="search" placeholder={placeholder} aria-label={placeholder} value={query} onChange={e=>setQuery(e.target.value)}/>{render(list)}</>;
}

function NagadDigits({value,onChange,onBlur,disabled,label}:{value:string;onChange:(v:string)=>void;onBlur:()=>void;disabled:boolean;label:string}){
 const digits=value.replace(/[^\d ]/g,"").slice(0,11).padEnd(11," ").split("");
 const refs=useRef<(HTMLInputElement|null)[]>([]);
 const set=(i:number,d:string)=>{const next=digits.slice();next[i]=d||" ";onChange(next.join("").replace(/\s+$/,""));};
 const box=(i:number)=><input key={i} ref={el=>{refs.current[i]=el}} className="num" inputMode="numeric" maxLength={1} aria-label={i===0?label:undefined} disabled={disabled} value={digits[i].trim()} onBlur={i===10?onBlur:undefined}
  onPaste={e=>{const v=e.clipboardData.getData("text").replace(/\D/g,"").replace(/^88/,"").slice(0,11);if(v){e.preventDefault();onChange(v);refs.current[Math.min(10,v.length)]?.focus()}}}
  onChange={e=>{const d=e.target.value.replace(/\D/g,"").slice(-1);set(i,d);if(d&&i<10)refs.current[i+1]?.focus()}}
  onKeyDown={e=>{if(e.key==="Backspace"&&!digits[i].trim()&&i>0){e.preventDefault();set(i-1,"");refs.current[i-1]?.focus()}}}/>;
 return <div className="ng-digits">{[0,1,2].map(box)}<span className="sep"/>{[3,4,5,6].map(box)}<span className="sep"/>{[7,8,9,10].map(box)}</div>;
}
