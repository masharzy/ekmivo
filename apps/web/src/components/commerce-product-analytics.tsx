"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./commerce-product-analytics.module.css";

type Row={product_id:string;product_name:string;variant_id:string;sku:string;order_count:number;ordered_units:number;delivered_units:number;returned_units:number;net_delivered_units:number};
type Result={items:Row[];more:boolean;definition:string};

export function CommerceProductAnalytics({workspaceId,environment,bn}:{workspaceId:string;environment:"live"|"sandbox";bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [open,setOpen]=useState(false),[offset,setOffset]=useState(0),[query,setQuery]=useState(""),[search,setSearch]=useState("");
 const [data,setData]=useState<Result|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[refresh,setRefresh]=useState(0);
 const load=useCallback(async(signal:AbortSignal)=>{
  if(!open)return;
  try{
   const q=new URLSearchParams({environment,resource:"product-analytics",cursor:String(offset),q:search});
   const response=await fetch(`/api/go/workspaces/${workspaceId}/commerce?${q}`,{cache:"no-store",signal});
   if(!response.ok)throw Error(String(response.status));
   const next=await response.json() as Result;
   if(!Array.isArray(next.items)||typeof next.more!=="boolean")throw Error("INVALID_ANALYTICS_SOURCE");
   if(!signal.aborted){setData(next);setError(false);}
  }catch{if(!signal.aborted){setData(null);setError(true);}}
  finally{if(!signal.aborted)setLoading(false);}
 },[environment,offset,open,search,workspaceId]);
 useEffect(()=>{if(!open)return;const controller=new AbortController();const timer=setTimeout(()=>{setLoading(true);void load(controller.signal);},180);return()=>{clearTimeout(timer);controller.abort();};},[load,open,refresh]);
 return <section className={styles.panel} aria-label={t("Product operational analytics","পণ্যের কার্যক্রম বিশ্লেষণ")}>
  <div className={styles.heading}><div><h2>{t("Product operational analytics","পণ্যের কার্যক্রম বিশ্লেষণ")}</h2><p>{t("Real order quantities per SKU, not payment revenue. Draft, held and cancelled orders are excluded.","প্রতি SKU-তে বাস্তব অর্ডারের পরিমাণ; পেমেন্টের আয় নয়। খসড়া, অপেক্ষমান ও বাতিল অর্ডার বাদ।")}</p></div><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?t("Hide analysis","বিশ্লেষণ লুকান"):t("View analysis","বিশ্লেষণ দেখুন")}</button></div>
  {open&&<><form className={styles.tools} onSubmit={e=>{e.preventDefault();setOffset(0);setSearch(query.trim());}}><label>{t("Product or SKU","পণ্য বা SKU")}<input maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="submit">{t("Search","খুঁজুন")}</button><button type="button" disabled={loading} onClick={()=>setRefresh(x=>x+1)}>{t("Refresh","রিফ্রেশ")}</button></form>
   {loading&&<p role="status">{t("Reading actual orders…","বাস্তব অর্ডার দেখা হচ্ছে…")}</p>}
   {error&&<p role="alert">{t("Operational report unavailable. No totals are inferred.","কার্যক্রমের রিপোর্ট পাওয়া যাচ্ছে না; অনুমান করে সংখ্যা দেখানো হচ্ছে না।")}</p>}
   {!loading&&data&&<><div className={styles.table} role="region" aria-label={t("SKU operations","SKU কার্যক্রম")} tabIndex={0}><table><thead><tr><th>{t("Product / SKU","পণ্য / SKU")}</th><th>{t("Orders","অর্ডার")}</th><th>{t("Ordered units","অর্ডারকৃত")}</th><th>{t("Delivered units","ডেলিভারিকৃত")}</th><th>{t("Returned units","ফেরত")}</th><th>{t("Net delivered","নেট ডেলিভারি")}</th></tr></thead><tbody>{data.items.map(row=><tr key={row.variant_id}><th scope="row">{row.product_name}<small>{row.sku}</small></th><td>{row.order_count}</td><td>{row.ordered_units}</td><td>{row.delivered_units}</td><td>{row.returned_units}</td><td>{row.net_delivered_units}</td></tr>)}</tbody></table></div>{data.items.length===0&&<p>{t("No matching catalog variants.","মিলে যাওয়া পণ্যের ধরন নেই।")}</p>}<p className={styles.note}>{t("These are operational order states, never verified sales, settlement, refunds or income.","এগুলো কার্যক্রমের অর্ডার অবস্থা; যাচাইকৃত বিক্রি, নিষ্পত্তি, রিফান্ড বা আয় নয়।")}</p><div className={styles.tools}><button type="button" disabled={offset===0} onClick={()=>setOffset(x=>Math.max(0,x-50))}>{t("Previous","আগের")}</button><button type="button" disabled={!data.more||offset>=10000} onClick={()=>setOffset(x=>x+50)}>{t("Next","পরের")}</button></div></>}
  </>}
 </section>;
}
