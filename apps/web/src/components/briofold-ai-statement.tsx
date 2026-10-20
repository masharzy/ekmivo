"use client";
import {useState} from "react";
import type {WalletStatementEntry} from "../lib/server/briofold-ai-statement";
import styles from "./briofold-ai-statement.module.css";

export function BriofoldAiStatement({locale,initial,nextCursor}:{locale:"en"|"bn";initial:WalletStatementEntry[];nextCursor:string|null}){
 const bn=locale==="bn",t=(en:string,be:string)=>bn?be:en;
 const [rows,setRows]=useState(initial),[cursor,setCursor]=useState(nextCursor);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const money=(n:number)=>new Intl.NumberFormat(bn?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(n/100);
 const kinds:Record<string,[string,string]>={
  verified_topup:["Verified top-up","যাচাইকৃত টপ-আপ"],
  reserve:["Reserved","রিজার্ভ"],settle:["Usage charge","AI ব্যবহারের খরচ"],
  release:["Released","রিজার্ভ ফেরত"],correction:["Admin adjustment","অ্যাডমিন সমন্বয়"],
 };
 async function loadMore(){
  if(busy||!cursor)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/ai-credits/statement?cursor="+encodeURIComponent(cursor),
    {credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw new Error("HTTP_"+response.status);
   const data:unknown=await response.json();
   if(!data||typeof data!=="object"||!("entries" in data)||!("next_cursor" in data))throw Error("INVALID_STATEMENT");
   const page=data as {entries:WalletStatementEntry[];next_cursor:string|null};
   if(!Array.isArray(page.entries)||!(page.next_cursor===null||typeof page.next_cursor==="string"))throw Error("INVALID_STATEMENT");
   if(page.next_cursor===cursor)throw Error("REPEATED_CURSOR");
   setRows(previous=>{
    const existing=new Set(previous.map(row=>row.id));
    return [...previous,...page.entries.filter(row=>typeof row.id==="string"&&!existing.has(row.id))];
   });
   setCursor(page.next_cursor);
  }catch{
   setError(t("Could not load older activity. Please retry.","পুরোনো হিসাব লোড হয়নি। আবার চেষ্টা করুন।"));
  }finally{setBusy(false);}
 }
 return <details className={styles.statement}>
  <summary>{t("AI credit statement","AI ক্রেডিটের সম্পূর্ণ হিসাব")}</summary>
  {rows.length===0?<p>{t("No credit activity yet.","এখনও কোনো ক্রেডিটের লেনদেন নেই।")}</p>:
  <div className={styles.tableScroll}><table>
   <thead><tr><th>{t("Date","তারিখ")}</th><th>{t("Activity","বিবরণ")}</th><th>{t("Credit change","ক্রেডিট পরিবর্তন")}</th><th>{t("Reserved change","রিজার্ভ পরিবর্তন")}</th><th>{t("Balance after","পরের ব্যালেন্স")}</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.id}>
    <td><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(bn?"bn-BD":"en-BD",{dateStyle:"medium",timeStyle:"short"})}</time></td>
    <td>{kinds[row.kind]?.[bn?1:0]??row.kind.replaceAll("_"," ")}</td>
    <td className={styles.numeric}>{money(row.available_delta_minor)}</td>
    <td className={styles.numeric}>{money(row.reserved_delta_minor)}</td>
    <td className={styles.numeric}>{money(row.available_after_minor)}</td>
   </tr>)}</tbody>
  </table></div>}
  {cursor&&<button className={styles.more} disabled={busy} aria-busy={busy} type="button" onClick={()=>void loadMore()}>
   {busy?t("Loading…","লোড হচ্ছে…"):t("Load older activity","আগের হিসাব দেখুন")}
  </button>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </details>;
}
