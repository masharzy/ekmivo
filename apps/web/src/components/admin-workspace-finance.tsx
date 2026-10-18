"use client";
import {useCallback,useEffect,useState} from "react";
type Locale="bn"|"en";
type Row=Record<string,unknown>;
const format=(value:unknown,key:string,locale:Locale)=>{
 if(value===null||value===undefined||value==="")return "—";
 if(typeof value==="boolean")return value?(locale==="bn"?"হ্যাঁ":"Yes"):(locale==="bn"?"না":"No");
 if(typeof value==="number"&&key.endsWith("_minor"))return new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT"}).format(value/100);
 if(key.endsWith("_at")){const d=new Date(String(value));if(!Number.isNaN(d.valueOf()))return d.toLocaleString(locale==="bn"?"bn-BD":"en-GB",{timeZone:"Asia/Dhaka"})}
 if(typeof value==="object")return "—";
 return String(value);
};
const paymentCols:[string,string,string][]=[["merchant_reference","Reference","রেফারেন্স"],["verified_amount_minor","Verified amount","যাচাইকৃত টাকা"],["method","Method","মাধ্যম"],["status","Status","অবস্থা"],["verified_at","Verified at","যাচাইয়ের সময়"]];
const deviceCols:[string,string,string][]=[["name","Device","ডিভাইস"],["status","Status","অবস্থা"],["heartbeat_at","Last seen","সর্বশেষ সংযোগ"],["backlog","Queued","অপেক্ষমাণ"],["revoked_at","Disconnected","বিচ্ছিন্ন"]];
export function AdminWorkspaceFinance({locale,workspaceId,resource}:{locale:Locale;workspaceId:string;resource:"payments"|"devices"}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 const [environment,setEnvironment]=useState<"live"|"sandbox">("live"),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[search,setSearch]=useState("");
 const [selected,setSelected]=useState<Row|null>(null);
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");setRows([]);setSelected(null);
  try{
   const r=await fetch("/api/go/platform/workspaces/"+workspaceId+"/operations/"+resource+"?environment="+environment,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)});
   const body:unknown=await r.json();
   if(!r.ok)throw Error(body&&typeof body==="object"&&"code" in body?String(body.code):"HTTP "+r.status);
   const data=body&&typeof body==="object"&&!Array.isArray(body)&&"items" in body?(body as {items:unknown}).items:Array.isArray(body)?body:[];
   if(!Array.isArray(data))throw Error("INVALID_RESPONSE");
   setRows(data.filter((v:unknown)=>v!==null&&typeof v==="object"&&!Array.isArray(v)) as Row[]);
  }catch(e){setError((bn?"সরাসরি সার্ভার থেকে তথ্য পাওয়া যায়নি: ":"Live finance server unavailable: ")+(e instanceof Error?e.message:""));}
  finally{setLoading(false);}
 },[resource,workspaceId,environment,bn]);
 useEffect(()=>{void refresh()},[refresh]);
 const columns=resource==="payments"?paymentCols:deviceCols;
 const filtered=rows.filter(row=>Object.entries(row).some(([key,value])=>["id","name","merchant_reference","method","status","source"].includes(key)&&String(value||"").toLowerCase().includes(search.toLowerCase())));
 return <div className="pa-workspace-finance">
  <div className="pa-page-head"><div><h2>{resource==="payments"?t("Payments","পেমেন্ট"):t("SMS Devices","এসএমএস ডিভাইস")}</h2><p>{resource==="payments"?t("Verified payments from the financial service","ফাইন্যান্সিয়াল সার্ভিসের যাচাইকৃত পেমেন্ট"):t("Paired devices and last sync from the financial service","ফাইন্যান্সিয়াল সার্ভিসের পেয়ার করা ফোন ও সর্বশেষ সংযোগ")}</p></div>
   <div className="pa-page-actions"><label className="pa-sr-only" htmlFor="admin-finance-environment">{t("Environment","পরিবেশ")}</label><select id="admin-finance-environment" value={environment} onChange={e=>setEnvironment(e.target.value==="sandbox"?"sandbox":"live")}><option value="live">Live</option><option value="sandbox">Sandbox</option></select><button className="pa-button" disabled={loading} onClick={()=>void refresh()}>{loading?t("Loading…","লোড হচ্ছে…"):t("Refresh","রিফ্রেশ")}</button></div>
  </div>
  {error&&<div role="alert" className="pa-surface pa-workspace-finance-error"><p>{error}</p><button className="pa-button" onClick={()=>void refresh()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  <div className="pa-surface pa-table-card">
   <div className="pa-admin-table-search"><input type="search" value={search} placeholder={t("Search records","রেকর্ড খুঁজুন")} aria-label={t("Search records","রেকর্ড খুঁজুন")} onChange={e=>setSearch(e.target.value)}/><span className="pa-subtle">{loading?"…":filtered.length} {t("records","রেকর্ড")}</span></div>
   <div className="pa-table-wrap"><table><thead><tr>{columns.map(([key,en,bnLabel])=><th key={key}>{bn?bnLabel:en}</th>)}<th>{t("Details","বিস্তারিত")}</th></tr></thead><tbody>
   {filtered.map((row,i)=><tr key={String(row.id||i)}>{columns.map(([key])=><td key={key}>{format(row[key],key,locale)}</td>)}<td><button className="pa-button" onClick={()=>setSelected(row)}>{t("View","দেখুন")}</button></td></tr>)}
   {!loading&&!error&&filtered.length===0&&<tr><td colSpan={columns.length+1} className="pa-empty-row">{t("No records match this workspace and environment.","এই ওয়ার্কস্পেস ও পরিবেশে কোনো রেকর্ড পাওয়া যায়নি।")}</td></tr>}
   {loading&&<tr><td colSpan={columns.length+1} className="pa-empty-row">{t("Loading live records…","Live রেকর্ড লোড হচ্ছে…")}</td></tr>}
   </tbody></table></div>
  </div>
  {selected&&<div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="pa-dialog pa-workspace-finance-dialog" role="dialog" aria-modal="true" aria-label={t("Record details","রেকর্ডের বিস্তারিত")}>
   <div className="pa-dialog-head"><h2>{t("Record details","রেকর্ডের বিস্তারিত")}</h2><button type="button" className="pa-icon-button" aria-label={t("Close","বন্ধ")} onClick={()=>setSelected(null)}>×</button></div>
   <div className="pa-dialog-body"><dl>{Object.entries(selected).filter(([key,value])=>!/(secret|token|digest|cipher|sms_text|payer_number|account_number|private|password|binding)/i.test(key)&&value!==null&&typeof value!=="object").map(([key,value])=><div className="pa-description-row" key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{format(value,key,locale)}</dd></div>)}</dl></div>
   <div className="pa-dialog-foot"><button className="pa-button" onClick={()=>setSelected(null)}>{t("Close","বন্ধ")}</button></div>
  </section></div>}
 </div>;
}
