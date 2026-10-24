"use client";
import Image from "next/image";
import {useEffect,useRef,useState} from "react";
export function InboxAttachment({workspaceId,threadId,mediaId,name,bn}:{workspaceId:string;threadId:string;mediaId:string;name:string;bn:boolean}){
 const [url,setUrl]=useState(""),[mime,setMime]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const object=useRef(""),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>{controller.current?.abort();if(object.current)URL.revokeObjectURL(object.current);},[]);
 async function load(){
  if(busy||url)return;setBusy(true);setError(false);const c=new AbortController();controller.current=c;
  try{
   const response=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},signal:c.signal,body:JSON.stringify({action:"media-get",thread_id:threadId,body:{media_id:mediaId}})});
   if(!response.ok)throw Error();const result=await response.json();
   if(typeof result.data!=="string"||result.data.length>7000000||typeof result.mime!=="string")throw Error();
   const bytes=Uint8Array.from(atob(result.data),x=>x.charCodeAt(0));
   const type=["image/jpeg","image/png","audio/mpeg","audio/ogg","audio/mp4","audio/aac","application/pdf"].includes(result.mime)?result.mime:"application/octet-stream";
   if(c.signal.aborted)return;object.current=URL.createObjectURL(new Blob([bytes],{type}));setUrl(object.current);setMime(type);
  }catch{if(!c.signal.aborted)setError(true);}finally{if(!c.signal.aborted)setBusy(false);}
 }
 return <div>{url?<>{mime.startsWith("image/")&&<Image unoptimized src={url} width={300} height={220} style={{maxWidth:"100%",height:"auto"}} alt={name|| (bn?"সংযুক্ত ছবি":"Attached image")}/>}{mime.startsWith("audio/")&&<audio controls preload="metadata" src={url} aria-label={bn?`অডিও · ${name}`:`Audio · ${name}`} style={{display:"block",width:"100%",maxWidth:360}} onError={()=>setError(true)} />}<a href={url} download={name||"attachment"}>{bn?"ডাউনলোড":"Download"} · {name}</a></>:<button type="button" disabled={busy} onClick={()=>void load()}>{busy?(bn?"খুলছে…":"Loading…"):(bn?"সংযুক্ত ফাইল খুলুন":"Open attachment")} · {name}</button>}{error&&<p role="alert">{bn?"ফাইল পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।":"Attachment unavailable. Retry."}</p>}</div>;
}
