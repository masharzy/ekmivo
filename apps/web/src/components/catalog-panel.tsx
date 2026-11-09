"use client";
import {useCallback,useRef,useState} from "react";
import styles from "./commerce.module.css";
import {CATALOG_TEMPLATE,importBody,parseProducts,toBatches,type ImportIssue,type ImportProduct} from "../lib/client/catalog-import";
import {csvCells,xlsxRows} from "../lib/client/commerce-import";

type VariantDraft={sku:string;size:string;color:string;price:string;stock:string};
type ProductDraft={name:string;description:string;category:string;tags:string;aliases:string;notes:string;minPrice:string;images:string[];variants:VariantDraft[]};
type ImportResult={row:number;ok:boolean;error?:string};
const blankVariant=():VariantDraft=>({sku:"",size:"",color:"",price:"",stock:""});
const blank=():ProductDraft=>({name:"",description:"",category:"",tags:"",aliases:"",notes:"",minPrice:"",images:[],variants:[blankVariant()]});
const list=(v:string)=>v.split(",").map(x=>x.trim()).filter(Boolean);
// Taka text to whole paisa without floating-point drift.
export function takaToMinor(v:string):number|null{const m=/^([0-9]{1,10})(?:\.([0-9]{1,2}))?$/.exec(v.trim());if(!m)return null;return Number(m[1])*100+Number((m[2]??"").padEnd(2,"0")||0);}

export function CatalogPanel({workspaceId,environment,bn,canManage,wooSyncEnabled,onChanged}:{workspaceId:string;environment:"live"|"sandbox";bn:boolean;canManage:boolean;wooSyncEnabled:boolean;onChanged:()=>void}){
 const t=(en:string,be:string)=>bn?be:en;
 const api=`/api/go/workspaces/${workspaceId}/commerce?environment=${environment}`;
 const [draft,setDraft]=useState<ProductDraft>(blank()),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [thumbs,setThumbs]=useState<Record<string,string>>({}),[parsed,setParsed]=useState<{products:ImportProduct[];issues:ImportIssue[]}|null>(null);
 const [results,setResults]=useState<{name:string;error:string}[]>([]),[progress,setProgress]=useState("");
 const saveKey=useRef<string|null>(null);
 const post=useCallback(async(action:string,body:Record<string,unknown>,key:string)=>{
  const response=await fetch(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,operation_key:key,body})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.code??result.error?.code??"SAVE_UNAVAILABLE");
  return result;
 },[api]);
 const thumb=async(id:string)=>{try{const r=await post("media-read",{id},crypto.randomUUID());setThumbs(prev=>({...prev,[id]:`data:${r.mime};base64,${r.data}`}));}catch{/* thumbnail is optional */}};
 const upload=async(files:FileList|null)=>{
  if(!files)return;setError("");
  for(const file of Array.from(files)){
   if(draft.images.length>=10)break;
   try{
    if(file.size>5242880)throw Error("IMAGE_LIMIT_5_MB");
    const bytes=new Uint8Array(await file.arrayBuffer());let text="";for(const b of bytes)text+=String.fromCharCode(b);
    const r=await post("media-upload",{name:file.name,mime:file.type,data:btoa(text)},crypto.randomUUID());
    setDraft(d=>({...d,images:[...d.images,r.id]}));void thumb(r.id);
   }catch(e){setError(e instanceof Error?e.message:"IMAGE_UNAVAILABLE");}
  }
 };
 const move=(i:number,by:number)=>setDraft(d=>{const to=i+by;if(to<0||to>=d.images.length)return d;const images=d.images.slice();[images[i],images[to]]=[images[to],images[i]];return {...d,images};});
 const setVariant=(i:number,patch:Partial<VariantDraft>)=>setDraft(d=>({...d,variants:d.variants.map((v,n)=>n===i?{...v,...patch}:v)}));
 const save=async()=>{
  setError("");setMessage("");
  const variants=[];
  for(const v of draft.variants){
   const price=takaToMinor(v.price);
   if(!v.sku.trim()||price===null||price<1||(v.stock&&!/^[0-9]{1,8}$/.test(v.stock))){setError("VARIANT_SKU_PRICE_REQUIRED");return;}
   const options:Record<string,string>={};if(v.size.trim())options.size=v.size.trim();if(v.color.trim())options.color=v.color.trim();
   const out:Record<string,unknown>={sku:v.sku.trim(),price_minor:price,options};if(v.stock)out.stock=Number(v.stock);variants.push(out);
  }
  const min=draft.minPrice.trim()?takaToMinor(draft.minPrice):null;
  if(!draft.name.trim()||(draft.minPrice.trim()&&min===null)){setError("NAME_AND_VALID_MINIMUM_PRICE_REQUIRED");return;}
  const body:Record<string,unknown>={name:draft.name.trim(),description:draft.description,category:draft.category,tags:list(draft.tags),search_aliases:list(draft.aliases),ai_notes:draft.notes,images:draft.images,variants};
  if(min!==null)body.min_price_minor=min;
  // The key survives a failed attempt so a retry cannot create a second product.
  saveKey.current??=crypto.randomUUID();setBusy(true);
  try{await post("catalog-product",body,saveKey.current);saveKey.current=null;setDraft(blank());setThumbs({});setMessage(t("Product saved.","পণ্য সংরক্ষিত হয়েছে।"));onChanged();}
  catch(e){const code=e instanceof Error?e.message:"SAVE_UNAVAILABLE";if(!["SAVE_UNAVAILABLE","API_UNAVAILABLE"].includes(code))saveKey.current=null;setError(code);}
  finally{setBusy(false);}
 };
 const readFile=async(file:File)=>{
  setError("");setMessage("");setResults([]);setParsed(null);
  try{
   if(file.size>5242880)throw Error("FILE_LIMIT_5_MB");const name=file.name.toLowerCase();
   const table=name.endsWith(".csv")?csvCells(await file.text()):name.endsWith(".xlsx")?await xlsxRows(new Uint8Array(await file.arrayBuffer())):null;
   if(!table)throw Error("CSV_OR_XLSX_REQUIRED");setParsed(parseProducts(table));
  }catch(e){setError(e instanceof Error?e.message:"IMPORT_INVALID");}
 };
 const runImport=async()=>{
  if(!parsed||parsed.products.length===0)return;setBusy(true);setError("");setMessage("");setResults([]);
  const failures:{name:string;error:string}[]=[];let saved=0,done=0;const batches=toBatches(parsed.products);
  try{
   for(const batch of batches){
    setProgress(`${done}/${parsed.products.length}`);
    const r=await post("catalog-import",{rows:batch.map(importBody)},crypto.randomUUID());
    saved+=r.saved??0;
    for(const item of (r.results as ImportResult[]??[]))if(!item.ok)failures.push({name:batch[item.row]?.name??`#${item.row+1}`,error:item.error??"ROW_FAILED"});
    done+=batch.length;
   }
   setMessage(t(`Imported ${saved} of ${parsed.products.length} products. Re-uploading the same file updates, never duplicates.`,`${parsed.products.length}টির মধ্যে ${saved}টি পণ্য আমদানি হয়েছে। একই ফাইল আবার দিলে নতুন কপি হবে না, হালনাগাদ হবে।`));
   setResults(failures);setParsed(null);onChanged();
  }catch(e){setError(e instanceof Error?e.message:"IMPORT_UNAVAILABLE");}
  finally{setBusy(false);setProgress("");}
 };
 const runWoo=async()=>{
  setBusy(true);setError("");setMessage("");setResults([]);let page=1,saved=0;const failures:{name:string;error:string}[]=[];
  try{
   for(;page<=10000;){
    setProgress(t(`Page ${page}`,`পৃষ্ঠা ${page}`));
    const r=await post("woocommerce-import",{provider:"woocommerce",page},crypto.randomUUID());
    saved+=r.saved??0;for(const item of (r.results as {ok:boolean;name:string;error?:string}[]))if(!item.ok)failures.push({name:item.name,error:item.error??"ROW_FAILED"});
    if(!r.next_page)break;page=r.next_page;
   }
   setMessage(t(`WooCommerce import finished: ${saved} products saved.`,`WooCommerce আমদানি শেষ: ${saved}টি পণ্য সংরক্ষিত।`));setResults(failures);onChanged();
  }catch(e){setError(e instanceof Error?e.message:"WOOCOMMERCE_SOURCE_UNAVAILABLE");}
  finally{setBusy(false);setProgress("");}
 };
 const template=()=>{const blob=new Blob(["﻿"+CATALOG_TEMPLATE],{type:"text/csv"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="briofold-catalog-template.csv";a.click();URL.revokeObjectURL(u);};
 if(!canManage)return null;
 const grid={display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:10} as const;
 return <section aria-label={t("Product catalog","পণ্যের ক্যাটালগ")} className={styles.catalogPanel}>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{progress&&<p role="status">{progress}</p>}
  <details open><summary><strong>{t("Add a product","পণ্য যোগ করুন")}</strong></summary>
   <form style={grid} onSubmit={e=>{e.preventDefault();void save();}}>
    <label style={grid}>{t("Name","নাম")}<input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label style={grid}>{t("Description","বিবরণ")}<textarea maxLength={4000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
     <label style={grid}>{t("Category","ক্যাটাগরি")}<input maxLength={80} value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}/></label>
     <label style={grid}>{t("Minimum price (BDT, hidden from customers)","সর্বনিম্ন দাম (টাকা, গ্রাহক দেখবে না)")}<input inputMode="decimal" value={draft.minPrice} onChange={e=>setDraft({...draft,minPrice:e.target.value})}/></label>
    </div>
    <label style={grid}>{t("Tags (comma separated)","ট্যাগ (কমা দিয়ে)")}<input value={draft.tags} onChange={e=>setDraft({...draft,tags:e.target.value})}/></label>
    <label style={grid}>{t("Other names customers use (comma separated)","গ্রাহকরা যে নামে খোঁজে (কমা দিয়ে)")}<input value={draft.aliases} onChange={e=>setDraft({...draft,aliases:e.target.value})}/></label>
    <label style={grid}>{t("Notes for the AI (not shown to customers)","AI-এর জন্য নোট (গ্রাহক দেখবে না)")}<textarea maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
    <fieldset style={grid}><legend>{t("Images (up to 10, first is the cover)","ছবি (সর্বোচ্চ ১০টি, প্রথমটি কভার)")}</legend>
     <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||draft.images.length>=10} onChange={e=>{void upload(e.target.files);e.target.value="";}}/>
     <ol style={{display:"flex",gap:10,flexWrap:"wrap",listStyle:"none",padding:0,margin:0}}>{draft.images.map((id,i)=><li key={id} style={{display:"grid",gap:4}}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {thumbs[id]?<img src={thumbs[id]} alt={t(`Image ${i+1}`,`ছবি ${i+1}`)} width={72} height={72} style={{objectFit:"cover",width:72,height:72}}/>:<button type="button" onClick={()=>void thumb(id)}>{t("Show","দেখুন")}</button>}
      <span style={{display:"flex",gap:4}}><button type="button" aria-label={t("Move earlier","আগে আনুন")} disabled={i===0} onClick={()=>move(i,-1)}>←</button><button type="button" aria-label={t("Move later","পরে নিন")} disabled={i===draft.images.length-1} onClick={()=>move(i,1)}>→</button><button type="button" aria-label={t("Remove image","ছবি সরান")} onClick={()=>setDraft({...draft,images:draft.images.filter(x=>x!==id)})}>×</button></span>
     </li>)}</ol></fieldset>
    <fieldset style={grid}><legend>{t("Variants","ধরন")}</legend>
     {draft.variants.map((v,i)=><div key={i} style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
      <label style={grid}>SKU<input required maxLength={80} value={v.sku} onChange={e=>setVariant(i,{sku:e.target.value})}/></label>
      <label style={grid}>{t("Size","সাইজ")}<input maxLength={40} value={v.size} onChange={e=>setVariant(i,{size:e.target.value})}/></label>
      <label style={grid}>{t("Color","রং")}<input maxLength={40} value={v.color} onChange={e=>setVariant(i,{color:e.target.value})}/></label>
      <label style={grid}>{t("Price (BDT)","দাম (টাকা)")}<input required inputMode="decimal" value={v.price} onChange={e=>setVariant(i,{price:e.target.value})}/></label>
      <label style={grid}>{t("Stock","মজুত")}<input inputMode="numeric" value={v.stock} onChange={e=>setVariant(i,{stock:e.target.value})}/></label>
      <button type="button" disabled={draft.variants.length===1} onClick={()=>setDraft({...draft,variants:draft.variants.filter((_,n)=>n!==i)})}>{t("Remove","সরান")}</button>
     </div>)}
     <button type="button" disabled={draft.variants.length>=100} onClick={()=>setDraft({...draft,variants:[...draft.variants,blankVariant()]})}>{t("Add variant","ধরন যোগ করুন")}</button>
     <small>{t("Stock needs a warehouse. Leave blank to keep current stock.","মজুতের জন্য একটি গুদাম লাগবে। ফাঁকা রাখলে বর্তমান মজুত অপরিবর্তিত থাকবে।")}</small>
    </fieldset>
    <button className="ib" type="submit" disabled={busy}>{t("Save product","পণ্য সংরক্ষণ")}</button>
   </form>
  </details>
  <details><summary><strong>{t("Import from CSV / Excel","CSV / Excel থেকে আমদানি")}</strong></summary><div style={grid}>
   <p>{t("One row per variant. Rows with the same product_id become one product. Re-importing the same file updates products instead of duplicating them.","প্রতি ধরনের জন্য একটি সারি। একই product_id-র সারিগুলো একটি পণ্য হবে। একই ফাইল আবার দিলে পণ্য হালনাগাদ হবে, নকল হবে না।")}</p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="button" className="ib" onClick={template}>{t("Download template","টেমপ্লেট নামান")}</button>
    <input type="file" accept=".csv,.xlsx" disabled={busy} aria-label={t("Catalog file (up to 500 rows)","পণ্যের ফাইল (সর্বোচ্চ ৫০০ সারি)")} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void readFile(f);}}/></div>
   {parsed&&<div style={grid}><p>{t(`${parsed.products.length} products ready, ${parsed.issues.length} rows with problems.`,`${parsed.products.length}টি পণ্য প্রস্তুত, ${parsed.issues.length}টি সারিতে সমস্যা।`)}</p>
    {parsed.issues.length>0&&<table><thead><tr><th>{t("Line","লাইন")}</th><th>{t("Problem","সমস্যা")}</th></tr></thead><tbody>{parsed.issues.slice(0,100).map((x,i)=><tr key={i}><td>{x.line}</td><td>{x.code}</td></tr>)}</tbody></table>}
    <button className="ib" disabled={busy||parsed.products.length===0} onClick={()=>void runImport()}>{t(`Import ${parsed.products.length} products`,`${parsed.products.length}টি পণ্য আমদানি করুন`)}</button></div>}
   {results.length>0&&<table><thead><tr><th>{t("Product","পণ্য")}</th><th>{t("Problem","সমস্যা")}</th></tr></thead><tbody>{results.slice(0,100).map((x,i)=><tr key={i}><td>{x.name}</td><td>{x.error}</td></tr>)}</tbody></table>}
  </div></details>
  {wooSyncEnabled&&<details><summary><strong>WooCommerce</strong></summary><div style={grid}>
   <p>{t("Imports every published product with variations, images, price and stock. Only BDT stores are accepted. Later changes arrive automatically through the webhook.","প্রকাশিত সব পণ্য ধরন, ছবি, দাম ও মজুতসহ আমদানি হয়। শুধু BDT স্টোর চলবে। পরের পরিবর্তন ওয়েবহুকের মাধ্যমে নিজে থেকে আসবে।")}</p>
   <button className="ib" disabled={busy} onClick={()=>void runWoo()}>{t("Import whole WooCommerce catalog","পুরো WooCommerce ক্যাটালগ আমদানি")}</button>
  </div></details>}
 </section>;
}
