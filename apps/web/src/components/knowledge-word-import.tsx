"use client";
import {useRef,useState} from "react";
export function KnowledgeWordImport({workspaceId,bn,disabled,onBusy,onImport,onDenied}:{workspaceId:string;bn:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onImport:(title:string,text:string)=>void;onDenied:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const lock=useRef(false);
 async function load(file:File|undefined){
  if(!file||disabled||lock.current)return;
  if(file.size<1||file.size>5242880||!file.name.toLowerCase().endsWith(".docx")){setError(bn?"সর্বোচ্চ ৫ MB-এর .docx ফাইল বেছে নিন।":"Choose a .docx file up to 5 MB.");return;}
  lock.current=true;setBusy(true);onBusy(true);setError("");
  try{
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
   const response=await fetch(`/api/go/workspaces/${workspaceId}/ai/knowledge-import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name.slice(0,200),data}),signal:AbortSignal.timeout(45000)});
   const result=await response.json();
   const code=result.error?.code??result.code;
   if(!response.ok){if(response.status===401||response.status===403||code==="STALE_BUSINESS")onDenied();setError(code==="FILE_SCAN_UNCONFIRMED"?(bn?"ফাইলের নিরাপত্তা পরীক্ষা এখন পাওয়া যাচ্ছে না। পরে চেষ্টা করুন।":"Document safety checks are unavailable. Retry later."):(bn?"ফাইলের লেখা পড়া যায়নি। অনুমতি, ফাইলের ধরন ও আকার পরীক্ষা করুন।":"Could not extract the document. Check access, file type and size."));return;}
   if(typeof result.text!=="string"||result.text.length>100000)throw Error();onImport(file.name.slice(0,160),result.text);
  }catch{setError(bn?"ফাইল আনা যায়নি। আবার চেষ্টা করুন।":"Document import unavailable. Retry.");}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <div><label className="ss-field"><span>{bn?"Word (.docx) থেকে লেখা আনুন (৫ MB)":"Import text from Word (.docx, 5 MB)"}</span><input aria-label={bn?"Word ফাইল আনুন":"Import Word file"} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value="";void load(file);}}/></label><p>{bn?"আনা লেখা আগে দেখুন, তারপর উৎস সংরক্ষণ করুন। মূল ফাইল ও macro সংরক্ষণ করা হয় না।":"Review the extracted text, then save the source. The original file and macros are not stored."}</p>{busy&&<p role="status">{bn?"লেখা পড়া হচ্ছে…":"Extracting text…"}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
