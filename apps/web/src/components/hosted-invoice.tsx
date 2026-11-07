"use client";
/* eslint-disable @next/next/no-img-element */
import {useEffect,useState} from "react";
import Link from "next/link";
import {parseCheckoutTheme} from "../lib/checkout-theme";
import "./hosted-invoice.css";
type Item={title:string;quantity:number;unit_amount_minor:number};
type VerifiedReceipt={payment_id:string;amount_minor:number;verified_at:string;method:string};
type Invoice={kind:string;reference:string;status?:string;issued_at?:string;bill_to_name?:string;merchant_name?:string;brand?:{logo_url?:string;title?:string;checkout_theme?:string};amount_minor:number;paid_minor:number;due_minor?:number;verified_receipts?:VerifiedReceipt[];environment?:string;created_at?:string;body?:{items?:Item[];due_at?:string;issued_at?:string;name?:string;email?:string;description?:string;notes?:string;tax_minor?:number;fee_minor?:number;shipping_minor?:number;discount_minor?:number}};
export function HostedInvoice({locale,token}:{locale:"en"|"bn";token:string}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 // Associate the async response with its request; a new token is immediately loading.
 const [result,setResult]=useState<{token:string;locale:"en"|"bn";doc:Invoice|null;error:string}|null>(null);
 const matched=result?.token===token&&result?.locale===locale;
 const doc=matched?result?.doc??null:null;
 const error=matched?result?.error??"":"";
 const pending=!matched;
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{
  const tick=window.setTimeout(()=>setNow(Date.now()),0);
  const interval=window.setInterval(()=>setNow(Date.now()),60_000);
  return()=>{window.clearTimeout(tick);window.clearInterval(interval)};
 },[]);
 useEffect(()=>{
  const abort=new AbortController();
  fetch("/api/documents/"+token,{cache:"no-store",signal:abort.signal})
   .then(async r=>{if(!r.ok)throw Error("UNAVAILABLE");return r.json()})
   .then(d=>{if(!abort.signal.aborted){if(d?.kind!=="invoices")throw Error("INVALID_KIND");setResult({token,locale,doc:d,error:""})}})
   .catch(()=>{if(!abort.signal.aborted)setResult({token,locale,doc:null,error:bn?"ইনভয়েস পাওয়া যাচ্ছে না বা আর পরিশোধযোগ্য নয়।":"Invoice unavailable or no longer payable."})});
  return()=>abort.abort();
 },[token,locale,bn]);
 useEffect(()=>{
  if(!doc||new URLSearchParams(window.location.search).get("print")!=="1")return;
  let canceled=false,printed=false;
  const trigger=()=>{if(!canceled&&!printed){printed=true;window.print()}};
  const fallback=window.setTimeout(trigger,2500);
  const imgs=Array.from(document.querySelectorAll<HTMLImageElement>(".ek-invoice-sheet img"));
  void Promise.allSettled(imgs.map(img=>img.complete?Promise.resolve():img.decode())).then(trigger);
  return()=>{canceled=true;window.clearTimeout(fallback)};
 },[doc]);
 const money=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:2}).format(n/100);
 const fmt=(raw?:string)=>{if(!raw)return "—";const d=new Date(raw);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium",timeZone:"Asia/Dhaka"}).format(d):"—"};
 const rows=doc?.body?.items??[];const subtotal=rows.reduce((sum,item)=>sum+item.quantity*item.unit_amount_minor,0);
 const total=doc?.amount_minor??0,paid=doc?.paid_minor??0;
 const draft=doc?.status==="draft";const cancelled=doc?.status==="cancelled";const fullyPaid=Boolean(doc)&&total>0&&paid>=total;const overdue=Boolean(doc?.body?.due_at)&&now!==null&&new Date(doc!.body!.due_at!).getTime()<now;
 const status=draft?t("Draft","খসড়া"):cancelled?t("Void","বাতিল"):fullyPaid?t("Paid","পরিশোধিত"):overdue?t("Overdue","মেয়াদ পেরিয়েছে"):t("Due","বাকি");
 const theme=parseCheckoutTheme(doc?.brand?.checkout_theme);const logo=theme?.store.logo||doc?.brand?.logo_url;const safeLogo=logo&&(logo.startsWith("/")&&!logo.startsWith("//")||/^https:\/\/[^\s@]+$/i.test(logo)||/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(logo))?logo:undefined;
 return <main className="ek-invoice-host" lang={locale}>
  <div className="ek-invoice-actions"><Link href="/" aria-label={t("Briofold home","Briofold হোম")}>briofold</Link><div><button type="button" onClick={()=>{document.cookie=`briofold-locale=${bn?"en":"bn"}; Path=/; Max-Age=31536000; SameSite=Lax`;window.location.reload()}}>{bn?"English":"বাংলা"}</button><button type="button" onClick={()=>window.print()} disabled={!doc}>{t("Print / Save PDF","প্রিন্ট / PDF সেভ")}</button></div></div>
  {pending?<p role="status">{t("Loading invoice…","ইনভয়েস লোড হচ্ছে…")}</p>:error?<p role="alert">{error}</p>:doc&&<article className="ek-invoice-sheet">
   <header className="ek-invoice-heading"><div className="ek-invoice-business">{safeLogo&&<img src={safeLogo} width={54} height={54} alt="" referrerPolicy="no-referrer"/>}<div><span>{t("From","প্রেরক")}</span><strong>{theme?.store.name||doc.merchant_name||doc.brand?.title||"Briofold"}</strong></div></div><div className="ek-invoice-meta"><h1>{t("Invoice","ইনভয়েস")} <span>{doc.reference}</span></h1><span className={fullyPaid?"ek-invoice-status paid":"ek-invoice-status"}>{status}</span></div></header>
   {doc.environment==="sandbox"&&<p className="ek-invoice-sandbox">{t("Sandbox invoice — no real money","স্যান্ডবক্স ইনভয়েস — আসল টাকা নয়")}</p>}
   <section className="ek-invoice-details"><div><small>{t("Issued","ইস্যু")}</small><strong>{fmt(doc.issued_at||doc.body?.issued_at||doc.created_at)}</strong></div><div><small>{t("Due date","শেষ তারিখ")}</small><strong>{fmt(doc.body?.due_at)}</strong></div><div><small>{t("To","প্রাপক")}</small><strong>{doc.bill_to_name||doc.body?.name||"—"}</strong>{doc.body?.email&&<span>{doc.body.email}</span>}</div></section>
   {doc.body?.description&&<p className="ek-invoice-description">{doc.body.description}</p>}
   <div className="ek-invoice-overflow"><table><thead><tr><th>{t("Description","বিবরণ")}</th><th>{t("Quantity","পরিমাণ")}</th><th>{t("Unit price","একক দাম")}</th><th>{t("Line total","মোট")}</th></tr></thead><tbody>{rows.map((item,i)=><tr key={i}><td>{item.title}</td><td>{item.quantity}</td><td>{money(item.unit_amount_minor)}</td><td>{money(item.quantity*item.unit_amount_minor)}</td></tr>)}</tbody></table></div>
   <div className="ek-invoice-totals"><div><span>{t("Subtotal","উপমোট")}</span><strong>{money(subtotal)}</strong></div>{([["Tax","কর",doc.body?.tax_minor],["Invoice fee","ইনভয়েস ফি",doc.body?.fee_minor],["Shipping","ডেলিভারি",doc.body?.shipping_minor],["Discount","ছাড়",-(doc.body?.discount_minor??0)]] as const).filter(item=>item[2]).map(([en,be,value])=><div key={en}><span>{t(en,be)}</span><strong>{money(value??0)}</strong></div>)}<div className="ek-invoice-total"><span>{t("Total","সর্বমোট")}</span><strong>{money(total)}</strong></div>{paid>0&&<div><span>{t("Paid","পরিশোধিত")}</span><strong>{money(paid)}</strong></div>}{paid<total&&<div><span>{t("Outstanding","বাকি")}</span><strong>{money(Math.max(0,doc.due_minor??total-paid))}</strong></div>}</div>
   {doc.body?.notes&&<p className="ek-invoice-description">{doc.body.notes}</p>}{(doc.verified_receipts?.length??0)>0&&<section className="ek-invoice-receipts" aria-label={t("Verified payment receipts","যাচাইকৃত পেমেন্ট রসিদ")}><h2>{t("Verified payments","যাচাইকৃত পেমেন্ট")}</h2>{doc.verified_receipts?.map(receipt=><div className="ek-invoice-receipt" key={receipt.payment_id}><div><span>{t("Payment ID","পেমেন্ট আইডি")}</span><code title={receipt.payment_id}>{receipt.payment_id}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(receipt.payment_id)}>{t("Copy ID","আইডি কপি")}</button></div><div><span>{t("Verified at","যাচাই হয়েছে")}</span><b>{fmt(receipt.verified_at)}</b></div><div><span>{t("Method","পদ্ধতি")}</span><b>{receipt.method}</b></div><div><span>{t("Amount","পরিমাণ")}</span><b>{money(receipt.amount_minor)}</b></div></div>)}</section>}
   <footer className="ek-invoice-foot">{draft?<p className="ek-invoice-void" role="status">{t("This invoice is a draft. Payment is not available until issued.","এই ইনভয়েসটি খসড়া। ইস্যু হওয়ার আগে পেমেন্ট করা যাবে না।")}</p>:cancelled?<p className="ek-invoice-void" role="status">{t("This invoice was cancelled. Payment is unavailable.","এই ইনভয়েসটি বাতিল হয়েছে। পেমেন্ট করা যাবে না।")}</p>:fullyPaid?<p className="ek-invoice-paid" role="status">{t("Payment verified. Thank you.","পেমেন্ট যাচাই হয়েছে। ধন্যবাদ।")}</p>:<Link className="ek-invoice-pay" href={`/pay/${token}`}>{t("Pay invoice","ইনভয়েস পরিশোধ করুন")}</Link>}<small>{t("Payments are confirmed only after server verification.","শুধু সার্ভার যাচাইয়ের পর পেমেন্ট নিশ্চিত হয়।")}</small></footer>
  </article>}
 </main>;
}
