"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";

type Locale="en"|"bn";
type Filters={from:string;to:string;account:string};
type LedgerRow={
 id:string;merchant_reference:string;verified_amount_minor:number;currency:string;
 payer_number:string|null;method:string;original_transaction_at?:string|null;verified_at:string
};
type Page={items:LedgerRow[];next_cursor:string|null};
const money=(n:number,locale:Locale)=>"BDT "+new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const date=(s:string|null|undefined,locale:Locale)=>s&&!Number.isNaN(Date.parse(s))?
 new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-BD",{timeZone:"Asia/Dhaka",dateStyle:"medium",timeStyle:"short"}).format(new Date(s)):"—";
function downloadCsv(rows:LedgerRow[],period:Filters){
 const quote=(v:unknown)=>{
  const str=String(v??"");
  return '"'+(/^[\s]*[=+\-@\t\r]/.test(str)?"'"+str:str).replaceAll('"','""')+'"';
 };
 const header=["Payment ID","Reference","Payer number","Method","Amount (BDT minor)","Transaction time (ISO)","Verified time (ISO)"];
 const csv="\uFEFF"+[header,...rows.map(r=>[r.id,r.merchant_reference,r.payer_number||"unavailable",r.method,r.verified_amount_minor,r.original_transaction_at||"",r.verified_at])].map(line=>line.map(quote).join(",")).join("\r\n")+"\r\n";
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download="ekmivo-verified-ledger-"+period.from+"-"+period.to+"-loaded.csv";document.body.appendChild(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export function PaymentReportLedger(props:Parameters<typeof ScopedLedger>[0]){
 return <ScopedLedger key={JSON.stringify([props.workspaceId,props.environment,props.period.from,props.period.to,props.period.account,props.canReveal])} {...props}/>;
}
function ScopedLedger({locale,workspaceId,environment,period,canReveal}:{
 locale:Locale;workspaceId:string;environment:string;period:Filters;canReveal:boolean
}){
 const bn=locale==="bn",t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const [rows,setRows]=useState<LedgerRow[]>([]);
 const [cursor,setCursor]=useState<string|null>(null);
 const [next,setNext]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  if(!canReveal)return;
  const controller=new AbortController();
  const run=async()=>{
   setBusy(true);setError("");
   const params=new URLSearchParams({environment,
    from:new Date(period.from+"T00:00:00+06:00").toISOString(),
    to:new Date(Date.parse(period.to+"T00:00:00+06:00")+86400000).toISOString()});
   if(period.account)params.set("account",period.account);
   if(cursor)params.set("cursor",cursor);
   try{
    const response=await fetch("/api/go/workspaces/"+workspaceId+"/reports/ledger?"+params,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
    if(!response.ok)throw Error(String(response.status));
    const data:unknown=await response.json();
    if(!data||typeof data!=="object"||!("items" in data)||!Array.isArray(data.items))throw Error("INVALID_REPORT");
    const result=data as Page;
    if(controller.signal.aborted)return;
    setRows(prev=>cursor?[...prev,...result.items.filter(r=>!prev.some(p=>p.id===r.id))]:result.items);
    setNext(result.next_cursor??null);
   }catch{if(!controller.signal.aborted)setError(t("Payer ledger unavailable. Please retry.","প্রেরকের রিপোর্ট পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।"))}
   finally{if(!controller.signal.aborted)setBusy(false)}
  };
  void run();
  return()=>controller.abort();
 },[workspaceId,environment,period.from,period.to,period.account,canReveal,cursor,refresh,locale,t]);
 return <section className="reference-ledger" aria-label={t("Verified payment ledger","যাচাইকৃত পেমেন্টের তালিকা")}>
  {!canReveal?<div className="empty">{t("You do not have access to payment details.","পেমেন্টের বিস্তারিত দেখার অনুমতি নেই।")}</div>:<>
   {error&&<div className="financial-error" role="alert">{error}<button type="button" onClick={()=>setRefresh(x=>x+1)}>{t("Retry","আবার চেষ্টা")}</button></div>}
   {busy&&!rows.length&&<div className="financial-status" role="status">{t("Loading verified transactions…","যাচাইকৃত লেনদেন লোড হচ্ছে…")}</div>}
   {!busy&&!error&&!rows.length&&<div className="empty"><b>{t("No verified payments in this period","এই সময়ে কোনো যাচাইকৃত পেমেন্ট নেই")}</b>{t("Try a longer period or a different account.","আরও বড় সময়সীমা বা অন্য অ্যাকাউন্ট বেছে নিন।")}</div>}
   {rows.length>0&&<div className="tw" role="region" tabIndex={0} aria-label={t("Verified payer payments","যাচাইকৃত প্রেরকের পেমেন্ট")}>
    <table><thead><tr><th>{t("Transaction ID","লেনদেন আইডি")}</th><th>{t("Date","তারিখ")}</th><th>{t("Method","মাধ্যম")}</th><th className="r">{t("Amount","পরিমাণ")}</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id}><td><Link className="mono" href={"/payments/transactions/"+r.id}>{r.merchant_reference||r.id.slice(0,12)}</Link><span className="sub mono" dir="ltr">{r.payer_number||t("Payer number unavailable","প্রেরকের নম্বর পাওয়া যায়নি")}</span></td><td>{date(r.original_transaction_at||r.verified_at,locale)}</td><td>{r.method||"—"}</td><td className="r amt">{money(r.verified_amount_minor,locale)}</td></tr>)}</tbody>
    </table></div>}
   {rows.length>0&&<div className="reference-ledger-footer"><span>{rows.length} {t("verified transactions loaded","টি যাচাইকৃত লেনদেন দেখানো হয়েছে")}</span><div>
    <button type="button" disabled={busy} onClick={()=>{setCursor(null);setNext(null);setRefresh(x=>x+1)}}>{t("Reload","রিফ্রেশ")}</button>
    <button type="button" disabled={!rows.length||busy} onClick={()=>downloadCsv(rows,period)}>{t("Export loaded","লোড হওয়া ডাউনলোড")}</button>
    {next&&<button type="button" disabled={busy} onClick={()=>setCursor(next)}>{busy?t("Loading…","লোড হচ্ছে…"):t("Load more","আরও দেখুন")}</button>}
   </div></div>}
  </>}
 </section>;
}
