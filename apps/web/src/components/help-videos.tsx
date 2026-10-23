"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import styles from "./growth-operations.module.css";
type Tutorial={id:string;module:string;title_en:string;title_bn:string;media_path:string;captions_en:string;captions_bn:string;duration_seconds:number;position_seconds:number;watched:boolean};
export function HelpVideos({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [items,setItems]=useState<Tutorial[]|null>(null),[module,setModule]=useState(""),[selected,setSelected]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const video=useRef<HTMLVideoElement>(null),queue=useRef<Promise<void>>(Promise.resolve()),serial=useRef(0),lastSaved=useRef(0);
 const endpoint=`/api/go/workspaces/${workspaceId}/workspace-tools/help-videos?environment=live`;
 const load=useCallback(async(signal?:AbortSignal)=>{const r=await fetch(endpoint+"&kind="+module,{cache:"no-store",signal});if(!r.ok)throw Error();const d=await r.json();if(!Array.isArray(d.items))throw Error();if(!signal?.aborted){setItems(d.items);setError("");}},[endpoint,module]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{void load(controller.signal).catch(()=>{if(!controller.signal.aborted){setItems(null);setError(bn?"টিউটোরিয়াল পাওয়া যাচ্ছে না।":"Tutorials are unavailable.");}});},0);return()=>{controller.abort();clearTimeout(timer);};},[bn,load]);
 const record=(id:string,position:number,reset=false)=>{
  const request=++serial.current;setSaving(true);setNotice("");
  queue.current=queue.current.catch(()=>{}).then(async()=>{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,position_seconds:position,reset})});if(!r.ok)throw Error();const data=await r.json();
   setItems(current=>current?.map(item=>item.id===id?{...item,position_seconds:data.position_seconds,watched:data.watched}:item)??null);setError("");
   if(request===serial.current)setNotice(bn?"দেখার অগ্রগতি সংরক্ষিত।":"Watch progress saved.");
  }).catch(()=>setError(bn?"অগ্রগতি সংরক্ষণ হয়নি। আবার চেষ্টা করুন।":"Progress was not saved. Retry."))
   .finally(()=>{if(request===serial.current)setSaving(false);});
 };
 const current=items?.find(item=>item.id===selected);
 return <section className={styles.root}><header className={styles.header}><div><h1>{t("Video tutorials","ভিডিও টিউটোরিয়াল")}</h1><p>{t("Published module guides and your private watch progress.","প্রকাশিত মডিউল নির্দেশিকা ও আপনার ব্যক্তিগত দেখার অগ্রগতি।")}</p></div><button type="button" disabled={saving} onClick={()=>void load().catch(()=>setError(t("Could not refresh tutorials.","টিউটোরিয়াল রিফ্রেশ হয়নি।")))}>{t("Refresh tutorials","টিউটোরিয়াল রিফ্রেশ")}</button></header>
  <label>{t("Module","মডিউল")}<select value={module} disabled={saving} onChange={e=>{setModule(e.target.value);setSelected("");setItems(null);setError("");}}><option value="">{t("All modules","সব মডিউল")}</option>{["payments","inbox","orders","customers","settings"].map((value,index)=><option key={value} value={value}>{bn?["পেমেন্ট","ইনবক্স","অর্ডার","গ্রাহক","সেটিংস"][index]:value}</option>)}</select></label>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!items&&!error&&<p role="status">{t("Loading tutorials…","টিউটোরিয়াল লোড হচ্ছে…")}</p>}
  {items?.length===0&&<p>{t("No published tutorials for this module.","এই মডিউলের প্রকাশিত টিউটোরিয়াল নেই।")}</p>}
  {items&&<ul>{items.map(item=><li key={item.id}><button type="button" aria-pressed={selected===item.id} disabled={saving} onClick={()=>{lastSaved.current=item.position_seconds;setSelected(item.id);setNotice("");}}>{bn?item.title_bn:item.title_en}</button> · {item.watched?t("Watched","দেখা হয়েছে"):`${item.position_seconds} / ${item.duration_seconds} ${t("seconds","সেকেন্ড")}`}</li>)}</ul>}
  {current&&<div className={styles.panel}><h2>{bn?current.title_bn:current.title_en}</h2><video ref={video} key={current.id} src={current.media_path} controls preload="metadata" style={{width:"100%",maxHeight:480}} aria-label={bn?current.title_bn:current.title_en}
   onLoadedMetadata={e=>{if(!current.watched)e.currentTarget.currentTime=Math.min(current.position_seconds,Math.max(0,e.currentTarget.duration-.2));}}
   onTimeUpdate={e=>{const position=Math.min(current.duration_seconds,Math.floor(e.currentTarget.currentTime));if(position-lastSaved.current>=30){lastSaved.current=position;record(current.id,position);}}}
   onPause={e=>{if(!e.currentTarget.ended)record(current.id,Math.min(current.duration_seconds,Math.floor(e.currentTarget.currentTime)));}}
   onEnded={()=>record(current.id,current.duration_seconds)} onError={()=>setError(t("This video could not be loaded. Refresh or choose another tutorial.","ভিডিও লোড হয়নি। রিফ্রেশ করুন বা অন্য টিউটোরিয়াল বেছে নিন।"))}><track kind="captions" src={current.captions_en} srcLang="en" label="English" default={!bn}/><track kind="captions" src={current.captions_bn} srcLang="bn" label="বাংলা" default={bn}/></video>
   <button type="button" disabled={saving} onClick={()=>record(current.id,Math.min(current.duration_seconds,Math.floor(video.current?.currentTime??0)))}>{t("Save progress","অগ্রগতি সংরক্ষণ")}</button>
   <button type="button" disabled={saving} onClick={()=>{video.current?.pause();if(video.current)video.current.currentTime=0;record(current.id,0,true);}}>{t("Mark unwatched","না-দেখা হিসেবে রাখুন")}</button>
  </div>}
 </section>;
}
