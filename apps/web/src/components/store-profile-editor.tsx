"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {registerDraft} from "../lib/client/draft-navigation";
import type {StoreProfile} from "../lib/store-profile";
import {validStoreProfile} from "../lib/store-profile";
import "./store-profile-editor.css";
const initial:StoreProfile={name:"",logo:"",business_type:"online",description:"",brand_color:"#0b0c0f",phone:"",support_email:"",whatsapp:"",website:"",address:"",statement_name:"",refund_url:"",receipt_note:""};
const swatches=["#0b0c0f","#2563eb","#7c3aed","#db2777","#ea580c","#059669"];
export function StoreProfileEditor({workspaceId,locale,canManage}:{workspaceId:string;locale:"en"|"bn";canManage:boolean}){
 const bn=locale==="bn",t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const router=useRouter(),base="/api/workspaces/"+workspaceId+"/store";
 const [body,setBody]=useState<StoreProfile>(initial),[saved,setSaved]=useState<StoreProfile>(initial),[version,setVersion]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [invalid,setInvalid]=useState<keyof StoreProfile|null>(null);
 const dirty=JSON.stringify(body)!==JSON.stringify(saved);
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const response=await fetch(base,{cache:"no-store",signal});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json() as {body:StoreProfile;version:number};
   if(!validStoreProfile(data.body)||!Number.isInteger(data.version))throw Error("INVALID_STORE");
   if(signal?.aborted)return;
   setBody(data.body);setSaved(data.body);setVersion(data.version);
  }catch{if(!signal?.aborted)setError(t("Could not load store details. Retry.","স্টোরের তথ্য লোড হয়নি। আবার চেষ্টা করুন।"))}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,t]);
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)return load(c.signal)});return()=>c.abort()},[load]);
 const set=(key:keyof StoreProfile,value:string)=>{setBody(old=>({...old,[key]:value}));setInvalid(null);setNotice("")};
 const save=useCallback(async()=>{
  if(!canManage||loading||busy||version<1)return false;
  if(!validStoreProfile(body)){setError(t("Check the highlighted fields: store name, phone, website or statement name.","স্টোরের নাম, ফোন, ওয়েবসাইট বা স্টেটমেন্ট নাম যাচাই করুন।"));setInvalid("name");return false}
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch(base,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({body,version})});
   const result=await r.json();
   if(!r.ok)throw Error(result.code==="VERSION_CONFLICT"?t("Store was changed elsewhere. Refresh before saving.","অন্য জায়গায় স্টোর পরিবর্তিত হয়েছে। রিফ্রেশ করুন।"):t("Store could not be saved.","স্টোর সংরক্ষণ করা যায়নি।"));
   if(!validStoreProfile(result.body))throw Error("INVALID_STORE_RESPONSE");
   setBody(result.body);setSaved(result.body);setVersion(result.version);
   setNotice(t("Changes saved","পরিবর্তন সংরক্ষিত হয়েছে"));router.refresh();return true;
  }catch(e){setError(e instanceof Error?e.message:t("Could not save store.","স্টোর সংরক্ষণ করা যায়নি।"));return false}
  finally{setBusy(false)}
 },[body,base,version,busy,loading,canManage,router,t]);
 const latest=useRef({body,saved,save});useEffect(()=>{latest.current={body,saved,save}},[body,saved,save]);
 useEffect(()=>registerDraft({id:"store:"+workspaceId,isDirty:()=>JSON.stringify(latest.current.body)!==JSON.stringify(latest.current.saved),save:()=>latest.current.save(),discard:()=>{setBody(latest.current.saved);setError("")}}),[workspaceId]);
 useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(""),2400);return()=>window.clearTimeout(timer)},[notice]);
 async function upload(file:File){
  if(file.size>1048576||!["image/png","image/jpeg","image/webp","image/svg+xml"].includes(file.type)){setError(t("Choose a PNG, JPG, SVG or WebP image under 1 MB.","১ MB-এর কম PNG, JPG, SVG বা WebP ছবি দিন।"));return}
  try{
   const src=await new Promise<string>((ok,no)=>{const reader=new FileReader();reader.onload=()=>ok(String(reader.result));reader.onerror=no;reader.readAsDataURL(file)});
   const img=await new Promise<HTMLImageElement>((ok,no)=>{const el=new Image();el.onload=()=>ok(el);el.onerror=no;el.src=src});
   const scale=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(scale*img.naturalWidth));canvas.height=Math.max(1,Math.round(scale*img.naturalHeight));
   const ctx=canvas.getContext("2d");if(!ctx)throw Error("CANVAS");ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const uri=canvas.toDataURL("image/png");if(uri.length>1450000)throw Error("TOO_LARGE");
   set("logo",uri);
  }catch{setError(t("Could not read the image.","ছবিটি পড়া যায়নি।"))}
 }
 function field(key:keyof StoreProfile,en:string,be:string,max:number,options?:{placeholder?:string;type?:string}){
  return <label className="ss-field" key={key}><span>{t(en,be)}</span><input className={invalid===key?"ss-invalid":undefined} type={options?.type??"text"} maxLength={max} placeholder={options?.placeholder??""} value={body[key]} disabled={!canManage||busy} onChange={e=>set(key,e.target.value)}/></label>;
 }
 function phone(key:"phone"|"whatsapp",en:string,be:string){
  return <label className="ss-field"><span>{t(en,be)}</span><span className="ss-phone"><i>+88</i><input type="tel" inputMode="numeric" maxLength={11} value={body[key]} placeholder="01XXXXXXXXX" disabled={!canManage||busy} onChange={e=>set(key,e.target.value.replace(/\D/g,""))}/></span></label>
 }
 const discard=()=>{setBody(saved);setInvalid(null);setError("")};
 return <div className="store-settings-page" lang={locale}>
  <header className="ss-header"><div><h1>{t("Store","স্টোর")}</h1><p>{t("Store details and logo for your customers.","গ্রাহকের জন্য স্টোরের তথ্য ও লোগো।")}</p></div><button className="ss-btn" type="button" disabled={loading||busy||dirty} onClick={()=>void load()}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<p className="ss-error" role="alert">{error}</p>}
  {notice&&<p className="ss-toast" role="status">{notice}</p>}
  {loading?<div className="ss-loading" role="status">{t("Loading store…","স্টোর লোড হচ্ছে…")}</div>:
  <div className="ss-panel">
   <section className="ss-section">
    <div className="ss-logo-line">
     <div className="ss-logo-box">{body.logo?/* eslint-disable-next-line @next/next/no-img-element */<img src={body.logo} alt={t("Store logo","স্টোরের লোগো")}/>:<span>{body.name.slice(0,1).toUpperCase()||"S"}</span>}</div>
     <div><h2>{t("Store logo","স্টোরের লোগো")}</h2><p>{t("PNG, JPG or WebP · Up to 1 MB · Square works best","PNG, JPG বা WebP · সর্বোচ্চ ১ MB · বর্গাকার হলে ভালো")}</p>
      <div className="ss-actions"><label className="ss-btn ss-upload">{t("Upload","আপলোড")}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canManage||busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file)}}/></label>{body.logo&&<button type="button" className="ss-btn" disabled={!canManage||busy} onClick={()=>set("logo","")}>{t("Remove","মুছুন")}</button>}</div>
     </div>
    </div>
    <div className="ss-grid">
     <label className="ss-field"><span>{t("Store name","স্টোরের নাম")} <small>{body.name.length}/40</small></span><input value={body.name} maxLength={40} required className={invalid==="name"?"ss-invalid":undefined} disabled={!canManage||busy} onChange={e=>set("name",e.target.value)}/></label>
     <label className="ss-field"><span>{t("Business type","ব্যবসার ধরন")}</span><select value={body.business_type} disabled={!canManage||busy} onChange={e=>set("business_type",e.target.value)}><option value="online">{t("E-commerce / online shop","ই-কমার্স / অনলাইন শপ")}</option><option value="physical">{t("Physical store","ফিজিক্যাল স্টোর")}</option><option value="service">{t("Services","সেবা")}</option><option value="other">{t("Other","অন্যান্য")}</option></select></label>
     <label className="ss-field ss-full"><span>{t("Short description (optional)","সংক্ষিপ্ত পরিচিতি (ঐচ্ছিক)")} <small>{body.description.length}/60</small></span><input maxLength={60} value={body.description} disabled={!canManage||busy} placeholder={t("What does your store sell?","যেমন: প্রতিদিনের বাজার, দোনাজপুর")} onChange={e=>set("description",e.target.value)}/></label>
     <div className="ss-field ss-full"><span>{t("Brand color","ব্র্যান্ড রং")}</span><div className="ss-swatches" role="group" aria-label={t("Brand color","ব্র্যান্ড রং")}>{swatches.map(color=><button key={color} type="button" style={{background:color}} className={color===body.brand_color?"selected":undefined} aria-label={color} aria-pressed={color===body.brand_color} disabled={!canManage||busy} onClick={()=>set("brand_color",color)}/>)}</div></div>
    </div>
   </section>
   <section className="ss-section"><h2>{t("Contact","যোগাযোগ")}</h2><p className="ss-description">{t("Where customers can reach you about their orders.","গ্রাহক পেমেন্ট নিয়ে সমস্যায় পড়লে এখানে যোগাযোগ করবেন।")}</p>
    <div className="ss-grid">{phone("phone","Support phone number","সাপোর্ট ফোন নম্বর")}{field("support_email","Support email (optional)","সাপোর্ট ইমেইল (ঐচ্ছিক)",254,{type:"email",placeholder:"support@yourstore.com"})}{phone("whatsapp","WhatsApp (optional)","হোয়াটসঅ্যাপ (ঐচ্ছিক)")}{field("website","Website (optional)","ওয়েবসাইট (ঐচ্ছিক)",500,{type:"url",placeholder:"https://yourstore.com"})}</div>
   </section>
   <section className="ss-section"><h2>{t("Address","ঠিকানা")}</h2><p className="ss-description">{t("Business address for invoices and receipts.","রসিদ ও ইনভয়েসে দেখানো হবে।")}</p>
    <div className="ss-grid"><label className="ss-field ss-full"><span>{t("Address","ঠিকানা")}</span><input value={body.address} maxLength={250} disabled={!canManage||busy} placeholder={t("House / road / market, city","বাড়ি/রোড নম্বর, মার্কেট বা ভবনের নাম")} onChange={e=>set("address",e.target.value)}/></label></div>
   </section>
   <section className="ss-section"><h2>{t("Payments & receipts","পেমেন্ট ও রসিদ")}</h2><p className="ss-description">{t("Optional information shown to customers.","গ্রাহকের রসিদের জন্য অতিরিক্ত তথ্য।")}</p>
    <div className="ss-grid">{field("statement_name","Statement name (optional)","স্টেটমেন্ট নাম (ঐচ্ছিক)",22,{placeholder:"EKMIVO"})}{field("refund_url","Refund policy link (optional)","রিফান্ড নীতিমালা (ঐচ্ছিক)",500,{type:"url",placeholder:"https://yourstore.com/refunds"})}<label className="ss-field ss-full"><span>{t("Receipt footer (optional)","রসিদের নিচের লেখা (ঐচ্ছিক)")}</span><textarea maxLength={120} value={body.receipt_note} disabled={!canManage||busy} rows={3} onChange={e=>set("receipt_note",e.target.value)}/></label></div>
   </section>
  </div>}
  {canManage&&<div className={"ss-unsaved"+(dirty?" is-visible":"")} aria-hidden={!dirty}><span>{t("Unsaved changes","পরিবর্তন সংরক্ষিত হয়নি")}</span><button type="button" onClick={discard} disabled={busy||!dirty}>{t("Discard","বাতিল")}</button><button type="button" className="ss-save" onClick={()=>void save()} disabled={busy||!dirty}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save changes","সংরক্ষণ")}</button></div>}
 </div>;
}
