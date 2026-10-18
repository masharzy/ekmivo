"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {StoreProfile} from "../lib/store-profile";
import {registerDraft} from "../lib/client/draft-navigation";
import "./store-profile-editor.css";
const empty:StoreProfile={name:"",logo:"",area:"",address:"",phone:""};
export function StoreProfileEditor({workspaceId,locale,canManage}:{workspaceId:string;locale:"en"|"bn";canManage:boolean}){
 const bn=locale==="bn",t=(en:string,bengali:string)=>bn?bengali:en,router=useRouter();
 const [body,setBody]=useState<StoreProfile>(empty),[saved,setSaved]=useState<StoreProfile>(empty);
 const [version,setVersion]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const endpoint="/api/workspaces/"+workspaceId+"/store";
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const response=await fetch(endpoint,{cache:"no-store",signal});
   if(!response.ok)throw Error(String(response.status));
   const data=await response.json() as {body:StoreProfile;version:number};
   if(!data.body||!Number.isInteger(data.version))throw Error("INVALID_STORE");
   if(signal?.aborted)return;
   setBody(data.body);setSaved(data.body);setVersion(data.version);
  }catch{if(!signal?.aborted)setError(bn?"স্টোরের তথ্য লোড হয়নি। আবার চেষ্টা করুন।":"Store details could not be loaded. Retry.")}
  finally{if(!signal?.aborted)setLoading(false)}
 },[endpoint,bn]);
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort()},[load]);
 const dirty=JSON.stringify(body)!==JSON.stringify(saved);
 const save=useCallback(async()=>{
  if(!canManage||loading||busy||!body.name.trim()||version<1)return false;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch(endpoint,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({body,version})});
   const data=await res.json();
   if(!res.ok)throw Error(data.code==="VERSION_CONFLICT"?t("Another editor updated the store. Refresh first.","অন্য কেউ তথ্য বদলেছেন। রিফ্রেশ করুন।"):t("Could not save changes.","তথ্য সংরক্ষণ হয়নি।"));
   setBody(data.body);setSaved(data.body);setVersion(data.version);setNotice(t("Store saved","স্টোর সংরক্ষিত হয়েছে"));router.refresh();return true;
  }catch(e){setError(e instanceof Error?e.message:t("Could not save changes.","তথ্য সংরক্ষণ হয়নি।"));return false}
  finally{setBusy(false)}
 },[canManage,loading,busy,body,version,endpoint,router,bn]);
 const latest=useRef({body,saved,save});useEffect(()=>{latest.current={body,saved,save}},[body,saved,save]);
 useEffect(()=>registerDraft({id:"store:"+workspaceId,isDirty:()=>JSON.stringify(latest.current.body)!==JSON.stringify(latest.current.saved),save:()=>latest.current.save(),discard:()=>{setBody(latest.current.saved);setError("")}}),[workspaceId]);
 const set=(key:keyof StoreProfile,value:string)=>setBody(current=>({...current,[key]:value}));
 async function upload(file:File){
  if(file.size>1048576||!["image/png","image/jpeg","image/webp","image/svg+xml"].includes(file.type)){setError(t("Choose an image under 1 MB.","১ MB-এর কম একটি ছবি বাছুন।"));return}
  try{
   const src=await new Promise<string>((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result));fr.onerror=reject;fr.readAsDataURL(file)});
   const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
   const scale=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement("canvas");canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
   if(!canvas.width||!canvas.height)throw Error();
   canvas.getContext("2d")?.drawImage(img,0,0,canvas.width,canvas.height);
   const png=canvas.toDataURL("image/png");if(png.length>1450000)throw Error();
   set("logo",png);setError("");
  }catch{setError(t("Could not read this logo.","লোগোটি পড়া যায়নি।"))}
 }
 return <div className="store-page ws-workbench">
  <header className="ws-page-head"><div><h1>{t("Store","স্টোর")}</h1></div><button type="button" className="ws-refresh" onClick={()=>void load()} disabled={busy||loading||dirty}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<p className="ws-alert" role="alert">{error}</p>}
  {notice&&<p className="ws-note" role="status">{notice}</p>}
  {loading?<p className="ws-loading" role="status">{t("Loading store…","স্টোর লোড হচ্ছে…")}</p>:<section className="ws-card store-panel">
   <div className="store-logo-row"><div className="store-logo-preview">{body.logo?/* eslint-disable-next-line @next/next/no-img-element */<img src={body.logo} alt=""/>:<span>{body.name.charAt(0).toUpperCase()}</span>}</div><div className="store-logo-actions"><strong>{t("Store logo","স্টোরের লোগো")}</strong><div className="store-buttons"><label className="store-upload">{t("Upload","আপলোড")}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canManage||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file)}}/></label>{body.logo&&<button type="button" onClick={()=>set("logo","")} disabled={!canManage||busy}>{t("Remove","সরান")}</button>}</div></div></div>
   <div className="ws-form ws-settings-grid store-fields">
    {([["name",t("Store name","স্টোরের নাম"),100],["phone",t("Phone number","ফোন নম্বর"),30],["area",t("Area","এলাকা"),120],["address",t("Address","ঠিকানা"),250]] as const).map(([key,label,max])=><label key={key}>{label}<input type={key==="phone"?"tel":"text"} value={body[key]} maxLength={max} required={key==="name"} disabled={!canManage||busy} onChange={e=>set(key,e.target.value)}/></label>)}
   </div>
   {canManage&&<div className="store-footer"><button type="button" onClick={()=>{setBody(saved);setError("")}} disabled={!dirty||busy}>{t("Discard","বাতিল")}</button><button type="button" className="ws-primary" disabled={!dirty||busy||body.name.trim().length<2} onClick={()=>void save()}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save changes","পরিবর্তন সংরক্ষণ")}</button></div>}
  </section>}
 </div>;
}
