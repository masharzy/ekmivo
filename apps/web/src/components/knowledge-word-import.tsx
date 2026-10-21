"use client";
import {useRef,useState} from "react";
export function KnowledgeWordImport({workspaceId,bn,disabled,onBusy,onImport,onDenied}:{workspaceId:string;bn:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onImport:(title:string,text:string)=>void;onDenied:()=>void}){
 const [url,setUrl]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const lock=useRef(false);
 async function load(file:File|undefined){
  if(!file||disabled||lock.current)return;
  if(file.size<1||file.size>5242880||!/[.](docx|pdf)$/i.test(file.name)){setError(bn?"সর্বোচ্চ ৫ MB-এর .docx অথবা PDF ফাইল বেছে নিন।":"Choose a .docx or PDF file up to 5 MB.");return;}
  lock.current=true;setBusy(true);onBusy(true);setError("");
  try{
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
   const response=await fetch(`/api/go/workspaces/${workspaceId}/ai/knowledge-import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:file.name.slice(0,200),data}),signal:AbortSignal.timeout(45000)});
   const result=await response.json();
   const code=result.error?.code??result.code;
   if(!response.ok){if(response.status===401||response.status===403||code==="STALE_BUSINESS")onDenied();setError(code==="FILE_SCAN_UNCONFIRMED"?(bn?"ফাইলের নিরাপত্তা পরীক্ষা এখন পাওয়া যাচ্ছে না। পরে চেষ্টা করুন।":"Document safety checks are unavailable. Retry later."):(bn?"ফাইলের লেখা পড়া যায়নি। অনুমতি, ধরন ও আকার পরীক্ষা করুন। PDF-এ বেছে নেওয়া যায় এমন লেখা থাকতে হবে; password থাকা যাবে না।":"Could not extract the document. Check access, type and size. PDFs need selectable text and no password."));return;}
   if(typeof result.text!=="string"||result.text.length>100000)throw Error();onImport(file.name.slice(0,160),result.text);
  }catch{setError(bn?"ফাইল আনা যায়নি। আবার চেষ্টা করুন।":"Document import unavailable. Retry.");}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function loadURL(){
  if(disabled||lock.current||!url.trim())return;
  lock.current=true;setBusy(true);onBusy(true);setError("");
  try{
   const response=await fetch(`/api/go/workspaces/${workspaceId}/ai/knowledge-import`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim()}),signal:AbortSignal.timeout(20000)});
   const result=await response.json(),code=result.error?.code??result.code;
   if(!response.ok){if(response.status===401||response.status===403||code==="STALE_BUSINESS")onDenied();setError(bn?"এই পৃষ্ঠার লেখা আনা যায়নি। Public HTTPS ঠিকানা ও UTF-8 HTML/text পৃষ্ঠা বেছে নিন।":"Could not import this page. Use a public HTTPS address serving UTF-8 HTML or plain text.");return;}
   if(typeof result.text!=="string"||result.text.length>100000||typeof result.name!=="string")throw Error();onImport(result.name.slice(0,160),result.text);
  }catch{setError(bn?"পৃষ্ঠাটি আনা যায়নি। আবার চেষ্টা করুন।":"Page import unavailable. Retry.");}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <div><label className="ss-field"><span>{bn?"Word (.docx) অথবা PDF থেকে লেখা আনুন (৫ MB)":"Import text from Word (.docx) or PDF (5 MB)"}</span><input aria-label={bn?"Document আনুন":"Import document"} type="file" accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={disabled||busy} onChange={event=>{const file=event.target.files?.[0];event.target.value="";void load(file);}}/></label><p>{bn?"আনা লেখা আগে দেখুন, তারপর উৎস সংরক্ষণ করুন। মূল ফাইল ও macro সংরক্ষণ করা হয় না।":"Review the extracted text, then save the source. The original file and macros are not stored."}</p><label className="ss-field"><span>{bn?"Public HTTPS পৃষ্ঠা থেকে লেখা আনুন":"Import text from a public HTTPS page"}</span><input aria-label={bn?"নলেজের URL":"Knowledge URL"} type="url" maxLength={2048} value={url} disabled={disabled||busy} onChange={e=>setUrl(e.target.value)}/></label><button className="ss-btn" type="button" disabled={disabled||busy||!url.trim()} onClick={()=>void loadURL()}>{bn?"পৃষ্ঠার লেখা আনুন":"Import page text"}</button>{busy&&<p role="status">{bn?"লেখা পড়া হচ্ছে…":"Extracting text…"}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
