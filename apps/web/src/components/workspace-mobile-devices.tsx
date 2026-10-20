"use client";
import styles from "./workspace-messaging.module.css";
import {useCallback,useEffect,useRef,useState} from "react";
import {pairingSvg} from "../lib/pairing-qr.mjs";
import {RefModal} from "./reference-ui";
type Device={id:string;name:string;claimed_at?:string;revoked_at?:string};
export function WorkspaceMobileDevices({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const [items,setItems]=useState<Device[]>([]),[error,setError]=useState(false),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[name,setName]=useState(""),[code,setCode]=useState(""),[deleting,setDeleting]=useState<Device|null>(null),[loaded,setLoaded]=useState(false),[denied,setDenied]=useState(false);
 const mutation=useRef(false),readVersion=useRef(0);
 const base="/api/go/workspaces/"+workspaceId+"/mobile-devices?environment=live";
 const failure=useCallback((status?:number)=>{
  setError(true);
  if(status===401||status===403){setDenied(true);setItems([]);setCode("");setOpen(false);setDeleting(null);}
 },[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const version=++readVersion.current;
  try{
   const response=await fetch(base,{cache:"no-store",signal});
   if(!response.ok){if(!signal?.aborted&&version===readVersion.current)failure(response.status);return false;}
   const result=await response.json();
   if(!Array.isArray(result.items)||!result.items.every((item:Device)=>item&&typeof item.id==="string"&&typeof item.name==="string"))throw Error("INVALID_DEVICE_LIST");
   if(!signal?.aborted&&version===readVersion.current){setItems(result.items);setLoaded(true);setDenied(false);setError(false);}
   return true;
  }catch{if(!signal?.aborted&&version===readVersion.current)failure();return false;}
 },[base,failure]);
 useEffect(()=>{
  if(denied)return;
  const controller=new AbortController();
  const initial=setTimeout(()=>void refresh(controller.signal),0);
  const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh(controller.signal)},3000);
  return()=>{controller.abort();clearTimeout(initial);clearInterval(timer);};
 },[refresh,denied]);
 async function act(action:string,device?:Device):Promise<boolean>{
  if(mutation.current||denied)return false;
  mutation.current=true;setBusy(true);setError(false);
  try{
   const path=device?"/api/go/workspaces/"+workspaceId+"/mobile-devices/"+device.id+"/"+action+"?environment=live":base;
   const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(device?{phone_id:device.id}:{name})});
   if(!response.ok){failure(response.status);return false;}
   const result=await response.json();
   if(result.pairing_token){
    if(typeof result.pairing_token!=="string"||!/^[A-Z0-9]{8}$/.test(result.pairing_token))throw Error("INVALID_PAIRING_CODE");
    setCode(result.pairing_token);setOpen(true);
   }
   if(action==="delete"&&device)setItems(current=>current.filter(item=>item.id!==device.id));
   await refresh();
   return true;
  }catch{failure();return false;}finally{mutation.current=false;setBusy(false);}
 }
 return <div className={styles.root}>
  <header><h1>{bn?"ডিভাইস":"Devices"}</h1><button type="button" disabled={busy||denied} onClick={()=>{setCode("");setOpen(true);}}>{bn?"ফোন যুক্ত করুন":"Connect phone"}</button></header>
  {error?<p role="alert">{denied?(bn?"ডিভাইস পরিচালনার অনুমতি নেই। আপনার অ্যাকাউন্ট ও অনুমতি যাচাই করুন।":"Device management access is unavailable. Check your account and permissions."):(bn?"ডিভাইসের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।":"Unable to load devices. Please try again.")} <button type="button" disabled={busy} onClick={()=>void refresh()}>{bn?"আবার চেষ্টা করুন":"Retry"}</button></p>:null}
  {!loaded&&!error?<p role="status">{bn?"লোড হচ্ছে…":"Loading…"}</p>:null}
  <div className={styles.card}>
   {items.map(device=><div key={device.id} className={styles.row}><span>{device.name}</span><span>{device.revoked_at?(bn?"বিচ্ছিন্ন":"Disconnected"):device.claimed_at?(bn?"সংযুক্ত":"Connected"):(bn?"অপেক্ষায়":"Waiting")}</span>
    <button type="button" disabled={busy||denied} onClick={()=>void act(device.revoked_at?"reconnect":"revoke",device)}>{device.revoked_at?(bn?"আবার যুক্ত করুন":"Reconnect"):(bn?"বিচ্ছিন্ন করুন":"Disconnect")}</button>
    <button type="button" disabled={busy||denied} onClick={()=>setDeleting(device)}>{bn?"মুছুন":"Delete"}</button></div>)}
   {loaded&&!error&&!items.length?<p>{bn?"কোনো ডিভাইস যুক্ত নেই।":"No connected devices."}</p>:null}
  </div>
  {open?<RefModal open title={bn?"ফোন যুক্ত করুন":"Connect phone"} onClose={()=>{if(!busy)setOpen(false);}}>
   {code?<div><div dangerouslySetInnerHTML={{__html:pairingSvg(code)}}/><p>{code}</p><button type="button" onClick={()=>void navigator.clipboard.writeText(code)}>{bn?"কোড কপি":"Copy code"}</button></div>:
    <form onSubmit={event=>{event.preventDefault();void act("begin");}}><label>{bn?"ফোনের নাম":"Phone name"}<input value={name} onChange={event=>setName(event.target.value)} required maxLength={80}/></label><button type="submit" disabled={busy||denied}>{bn?"চালিয়ে যান":"Continue"}</button></form>}
  </RefModal>:null}
  {deleting?<RefModal open title={bn?"ফোন মুছুন":"Delete phone"} onClose={()=>{if(!busy)setDeleting(null);}}>
   <p>{deleting.name}</p><button type="button" disabled={busy||denied} onClick={()=>{void act("delete",deleting).then(success=>{if(success)setDeleting(null);});}}>{bn?"মুছে ফেলুন":"Delete"}</button>
  </RefModal>:null}
 </div>;
}
