"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect,useRef,useState,useTransition} from "react";
import {createWorkspaceOnListAction,setDefaultWorkspaceOnListAction,renameWorkspaceOnListAction} from "../actions/account";
import {setWorkspaceProduct} from "../actions/workspace-products";
import {draftStorageKey,parseSavedDraft,encodeSavedDraft} from "../lib/onboarding-draft.mjs";

type Locale="en"|"bn";
type Mode="ai"|"commerce"|"both"|"off";
type Workspace={id:string;name:string;mode:Mode;role:"owner"|"admin"|"editor"|"viewer"};
type Product="payments"|"ai";
type Theme="light"|"dark"|"system";
function Icon({name}:{name:"plus"|"x"|"ai"|"pay"|"both"}){
 return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
 {name==="plus"?<path d="M12 5v14M5 12h14"/>:name==="x"?<path d="M6 6l12 12M18 6 6 18"/>:name==="ai"?<path d="M4 5h16v14H4zM4 14h5l1 2h4l1-2h5"/>:name==="pay"?<><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></>:<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6"/>}
 </svg>;
}
const copy={
 en:{title:"Your Store",subtitle:"Manage the services inside your Store.",new:"Create Store",open:"Open",manage:"Manage",default:"Store",name:"Store name",example:"e.g. North Studio",ai:"AI communication",aiHint:"Inbox, knowledge and follow-ups.",pay:"Commerce & payments",payHint:"Orders, payment checks and devices.",both:"Both",bothHint:"Both services in one Store.",payProduct:"Payment gateway",payProductHint:"Links, invoices and checkout.",aiProduct:"AI",aiProductHint:"Customer conversations.",create:"Create Store",cancel:"Cancel",done:"Done",noPlan:"Does not start a paid plan.",access:"Changes access only.",makeDefault:"Make default",created:"Store created",saved:"Saved",changed:"Store selected",empty:"Name your Store to get started.",noProduct:"No products",role:{owner:"Owner",admin:"Admin",editor:"Editor",viewer:"Viewer"},close:"Close",confirmTitle:"Turn off service?",confirmMessage:"This changes product access for everyone in this Store.",turnOff:"Turn off",tryAgain:"Try again",loading:"Loading Stores…"},
 bn:{title:"আপনার স্টোর",subtitle:"একটি স্টোরেই সব সেবা পরিচালনা করুন।",new:"স্টোর তৈরি করুন",open:"খুলুন",manage:"পরিচালনা",default:"স্টোর",name:"স্টোরের নাম",example:"যেমন: নর্থ স্টুডিও",ai:"AI যোগাযোগ",aiHint:"ইনবক্স, নলেজ ও ফলো-আপ।",pay:"কমার্স ও পেমেন্ট",payHint:"অর্ডার, পেমেন্ট যাচাই ও ডিভাইস।",both:"দুটোই",bothHint:"একই স্টোরে দুটি সেবা।",payProduct:"পেমেন্ট গেটওয়ে",payProductHint:"লিংক, ইনভয়েস ও চেকআউট।",aiProduct:"AI",aiProductHint:"গ্রাহকের কথোপকথন।",create:"স্টোর তৈরি করুন",cancel:"বাতিল",done:"সম্পন্ন",noPlan:"কোনো পেইড প্ল্যান শুরু হবে না।",access:"শুধু অ্যাক্সেস বদলাবে।",makeDefault:"ডিফল্ট করুন",created:"স্টোর তৈরি হয়েছে",saved:"সংরক্ষিত",changed:"স্টোর নির্ধারিত",empty:"শুরু করতে স্টোরের নাম দিন।",noProduct:"কোনো সেবা নেই",role:{owner:"মালিক",admin:"অ্যাডমিন",editor:"সম্পাদক",viewer:"দর্শক"},close:"বন্ধ করুন",confirmTitle:"সেবা বন্ধ করবেন?",confirmMessage:"এই স্টোরের সবার সেবা ব্যবহারের অনুমতি বদলাবে।",turnOff:"বন্ধ করুন",tryAgain:"আবার চেষ্টা করুন",loading:"স্টোর লোড হচ্ছে…"}
} as const;

function WorkspaceHeaderControls({locale,initialTheme}:{locale:Locale;initialTheme:Theme}){
 const [theme,setTheme]=useState<Theme>(initialTheme);
 const [systemDark,setSystemDark]=useState(false);
 useEffect(()=>{
  const preference=window.matchMedia("(prefers-color-scheme: dark)");
  const update=()=>setSystemDark(preference.matches);
  update();preference.addEventListener("change",update);
  const sync=(e:StorageEvent)=>{
   if(e.key!=="ekmivo-theme-preference")return;
   const next=e.newValue==="light"||e.newValue==="dark"?e.newValue:"system";
   setTheme(next);if(next==="system")document.documentElement.removeAttribute("data-theme");else document.documentElement.dataset.theme=next;
  };
  window.addEventListener("storage",sync);
  return()=>{preference.removeEventListener("change",update);window.removeEventListener("storage",sync)};
 },[]);
 const dark=theme==="dark"||(theme==="system"&&systemDark);
 function toggleTheme(){
  const next:Theme=dark?"light":"dark";setTheme(next);
  document.documentElement.dataset.theme=next;
  document.cookie=`ekmivo-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try{localStorage.setItem("ekmivo-theme-preference",next)}catch{/* cookie remains authoritative */}
 }
 function toggleLocale(){
  const next=locale==="bn"?"en":"bn";
  document.cookie=`ekmivo-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
 }
 return <div className="wk2-header-controls">
  <button type="button" className="wk2-button" onClick={toggleLocale} lang={locale==="bn"?"en":"bn"} aria-label={locale==="bn"?"Switch to English":"বাংলা ভাষায় দেখুন"}>{locale==="bn"?"English":"বাংলা"}</button>
  <button type="button" className="wk2-button wk2-theme-button" onClick={toggleTheme} aria-label={dark?(locale==="bn"?"লাইট মোড":"Light mode"):(locale==="bn"?"ডার্ক মোড":"Dark mode")} title={dark?(locale==="bn"?"লাইট মোড":"Light mode"):(locale==="bn"?"ডার্ক মোড":"Dark mode")}>
   <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dark?<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>:<path d="M21 13A9 9 0 0 1 11 3a7 7 0 0 0 10 10z"/>}</svg>
  </button>
 </div>;
}
export function WorkspacesV2({locale,user,initialWorkspaces,initialDefault,initialTheme,selectedPlan=""}:{locale:Locale;user:{id:string;name:string};initialWorkspaces:Workspace[];initialDefault:string|null;initialTheme:Theme;selectedPlan?:string}){
 const t=copy[locale];const router=useRouter();
 const [rows,setRows]=useState(initialWorkspaces),[defaultId,setDefaultId]=useState(initialDefault);
 const [createOpen,setCreateOpen]=useState(false),[selected,setSelected]=useState<string|null>(null);
 const [name,setName]=useState(""),[rename,setRename]=useState(""),[mode,setMode]=useState<"ai"|"commerce"|"both">("both");
 const [loadedDraftKey,setLoadedDraftKey]=useState(""),[createError,setCreateError]=useState(""),[manageError,setManageError]=useState("");
 const [creating,setCreating]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const [confirmProduct,setConfirmProduct]=useState<Product|null>(null);
 const [toast,setToast]=useState(""),[navigating,setNavigating]=useState(false);
 const [,transition]=useTransition();
 const createDialog=useRef<HTMLDialogElement>(null),manageDialog=useRef<HTMLDialogElement>(null),confirmDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const url=new URL(window.location.href);if(url.searchParams.get("create")!=="1")return;const timer=setTimeout(()=>{setCreateOpen(true);url.searchParams.delete("create");window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash)},0);return()=>clearTimeout(timer)},[]);
 const createName=useRef<HTMLInputElement>(null),previousFocus=useRef<HTMLElement|null>(null);
 const draftKey=draftStorageKey(user.id),draftReady=loadedDraftKey===draftKey;
 const active=rows.find(w=>w.id===selected)??null;
 const canManage=active?.role==="owner"||active?.role==="admin";
 useEffect(()=>{const timer=setTimeout(()=>{setRows(initialWorkspaces);setDefaultId(initialDefault)},0);return()=>clearTimeout(timer)},[initialWorkspaces,initialDefault]);
 useEffect(()=>{const timer=setTimeout(()=>{let saved=null;try{saved=parseSavedDraft(localStorage.getItem(draftKey))}catch{/* browser storage is optional */}setName(saved?saved.name.slice(0,60):"");setMode(saved?saved.mode:"both");setLoadedDraftKey(draftKey)},0);return()=>clearTimeout(timer)},[draftKey]);
 useEffect(()=>{if(!draftReady)return;try{localStorage.setItem(draftKey,encodeSavedDraft({name,mode}))}catch{/* silent */}},[name,mode,draftKey,draftReady]);
 useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(""),2400);return()=>clearTimeout(timer)},[toast]);
 useEffect(()=>{const dialog=createDialog.current;if(!dialog)return;if(createOpen&&!dialog.open){previousFocus.current=document.activeElement as HTMLElement;dialog.showModal();requestAnimationFrame(()=>createName.current?.focus())}else if(!createOpen&&dialog.open){dialog.close();previousFocus.current?.focus()}},[createOpen]);
 useEffect(()=>{const dialog=manageDialog.current;if(!dialog)return;if(selected&&!dialog.open){previousFocus.current=document.activeElement as HTMLElement;dialog.showModal()}else if(!selected&&dialog.open){dialog.close();previousFocus.current?.focus()}},[selected]);
 useEffect(()=>{const dialog=confirmDialog.current;if(!dialog)return;if(confirmProduct&&!dialog.open)dialog.showModal();else if(!confirmProduct&&dialog.open)dialog.close()},[confirmProduct]);
 function closeCreate(){if(creating)return;setCreateOpen(false);setCreateError("")}
 function closeManage(){if(busy)return;setSelected(null);setManageError("");setConfirmProduct(null)}
 const openCreate=()=>{setCreateError("");setCreateOpen(true)};
 const openManage=(id:string)=>{setManageError("");setSelected(id);setRename(rows.find(w=>w.id===id)?.name??"")};
 function saveRename(){if(!active||!canManage||busy||rename.trim().length<2||rename.trim()===active.name)return;setBusy("rename");setManageError("");transition(async()=>{try{const result=await renameWorkspaceOnListAction(locale,active.id,rename);if(result.status==="success"&&result.name){setRows(old=>old.map(w=>w.id===active.id?{...w,name:result.name!}:w));setToast(t.saved);router.refresh()}else setManageError(result.message)}catch{setManageError(t.tryAgain)}finally{setBusy(null)}})}
 function meta(w:Workspace){const products=[...(w.mode==="both"||w.mode==="commerce"?[t.payProduct]:[]),...(w.mode==="both"||w.mode==="ai"?[t.aiProduct]:[])];return (products.join(" · ")||t.noProduct)+" · "+t.role[w.role]}
 function onNewSubmit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(creating||name.trim().length<2)return;
  setCreating(true);setCreateError("");
  transition(async()=>{
   try{const result=await createWorkspaceOnListAction(locale,name,mode);
    if(result.status==="success"&&result.workspace){
     setRows(old=>[{...result.workspace!,role:"owner" as const},...old]);
     if(rows.length===0)setDefaultId(result.workspace.id);
     setName("");setMode("both");
     try{localStorage.removeItem(draftKey)}catch{}
     setCreateOpen(false);setToast(t.created);router.refresh();
    }else setCreateError(result.message||t.tryAgain);
   }catch{setCreateError(t.tryAgain)}finally{setCreating(false)}
  });
 }
 function makeDefault(){if(!active||busy)return;setBusy("default");setManageError("");
  transition(async()=>{try{const response=await setDefaultWorkspaceOnListAction(locale,active.id);if(response.status==="success"){setDefaultId(active.id);setToast(t.changed);router.refresh()}else setManageError(response.message)}catch{setManageError(t.tryAgain)}finally{setBusy(null)}})
 }
 function applyToggle(product:Product){
  if(!active||!canManage||busy)return;
  const current=product==="payments"?(active.mode==="both"||active.mode==="commerce"):(active.mode==="both"||active.mode==="ai");
  const next=!current;const workspaceId=active.id;
  const updated=(w:Workspace):Workspace=>{
   if(w.id!==workspaceId)return w;
   const pay=product==="payments"?next:(w.mode==="both"||w.mode==="commerce");
   const ai=product==="ai"?next:(w.mode==="both"||w.mode==="ai");
   return {...w,mode:pay&&ai?"both":pay?"commerce":ai?"ai":"off"};
  };
  setBusy(product);setManageError("");
  setRows(old=>old.map(updated));
  const data=new FormData();data.set("workspaceId",workspaceId);data.set("product",product);data.set("enabled",String(next));
  transition(async()=>{try{const result=await setWorkspaceProduct(locale,{status:"idle",message:""},data);
   if(result.status==="success"){setToast(t.saved);router.refresh()}
   else {setRows(old=>old.map(w=>w.id===workspaceId?active:w));setManageError(result.message)}
  }catch{setRows(old=>old.map(w=>w.id===workspaceId?active:w));setManageError(t.tryAgain)}finally{setBusy(null)}});
 }
 function toggle(product:Product){if(!active||!canManage||busy)return;const isOn=product==="payments"?(active.mode==="both"||active.mode==="commerce"):(active.mode==="both"||active.mode==="ai");if(isOn)setConfirmProduct(product);else applyToggle(product)}
 function clickAway(event:React.MouseEvent<HTMLDialogElement>,close:()=>void){if(event.target===event.currentTarget)close()}
 const serviceModes=[{id:"ai" as const,title:t.ai,desc:t.aiHint},{id:"commerce" as const,title:t.pay,desc:t.payHint},{id:"both" as const,title:t.both,desc:t.bothHint}];
 return <main className="wk2-root" lang={locale}>
  {navigating&&<div className="wk2-progress" role="progressbar" aria-label={locale==="bn"?"ওয়ার্কস্পেস খোলা হচ্ছে":"Opening workspace"}/>}
  <header className="wk2-header">
   <Link href="/workspaces" className="wk2-logo">ekmivo</Link>
   <div className="wk2-header-right"><WorkspaceHeaderControls locale={locale} initialTheme={initialTheme}/><span className="wk2-user-name">{user.name}</span><span className="wk2-avatar">{user.name.trim().charAt(0).toUpperCase()}</span></div>
  </header>
  <div className="wk2-content">
   <div className="wk2-titlebar"><h1>{t.title}</h1>{rows.length===0&&<button type="button" className="wk2-button wk2-primary" onClick={openCreate}><Icon name="plus"/>{t.new}</button>}<p>{t.subtitle}</p></div>
   <section className="wk2-list" aria-label={t.title}>
    {rows.length===0?<div className="wk2-empty"><p>{t.empty}</p><button type="button" className="wk2-button wk2-primary" onClick={openCreate}>{t.new}</button></div>:
    rows.map(w=><div key={w.id} className="wk2-row">
     <span className="wk2-avatar" aria-hidden="true">{w.name.trim().charAt(0).toUpperCase()}</span>
     <div className="wk2-row-info"><div className="wk2-name"><strong>{w.name}</strong>{w.id===defaultId&&<span className="wk2-default">{t.default}</span>}</div><small>{meta(w)}</small></div>
     <div className="wk2-row-actions"><button type="button" className="wk2-button" onClick={()=>openManage(w.id)}>{t.manage}</button>
      <Link href={selectedPlan&&(w.mode==="commerce"||w.mode==="both")?`/subscribe/${selectedPlan}?workspace=${w.id}`:`/w/${w.id}/dashboard`} prefetch={false} onClick={()=>setNavigating(true)} className="wk2-button wk2-primary">{selectedPlan&&(w.mode==="commerce"||w.mode==="both")?(locale==="bn"?"প্ল্যান বেছে নিন":"Choose plan"):t.open}</Link></div>
    </div>)}
   </section>
  </div>
  <dialog ref={createDialog} className="wk2-dialog" aria-labelledby="wk2-create-title" onCancel={event=>{if(creating)event.preventDefault();else closeCreate()}} onClose={()=>setCreateOpen(false)} onClick={event=>clickAway(event,closeCreate)}>
   <form onSubmit={onNewSubmit}>
    <div className="wk2-modal-header"><h2 id="wk2-create-title">{t.new}</h2><button type="button" aria-label={t.close} onClick={closeCreate}><Icon name="x"/></button></div>
    <label className="wk2-field-label" htmlFor="wk2-name">{t.name}</label><input ref={createName} id="wk2-name" className="wk2-input" name="name" value={name} onChange={e=>setName(e.target.value)} placeholder={t.example} maxLength={60} minLength={2} required autoComplete="off"/>
    <div className="wk2-options" role="radiogroup" aria-label={t.title}>
     {serviceModes.map(option=><label className="wk2-option" key={option.id}><input type="radio" name="mode" value={option.id} checked={mode===option.id} onChange={()=>setMode(option.id)}/><Icon name={option.id==="commerce"?"pay":option.id}/><strong>{option.title}</strong><small>{option.desc}</small></label>)}
    </div>
    {createError&&<p className="wk2-modal-error" role="alert">{createError}</p>}
    <div className="wk2-modal-footer"><span className="wk2-hint">{t.noPlan}</span><button type="button" className="wk2-button" onClick={closeCreate}>{t.cancel}</button><button type="submit" className="wk2-button wk2-primary" disabled={creating||name.trim().length<2}>{creating?(locale==="bn"?"তৈরি হচ্ছে…":"Creating…"):t.create}</button></div>
   </form>
  </dialog>
  <dialog ref={manageDialog} className="wk2-dialog" aria-labelledby="wk2-manage-title" onCancel={event=>{if(busy)event.preventDefault();else closeManage()}} onClose={()=>{setSelected(null);setManageError("")}} onClick={event=>clickAway(event,closeManage)}>
   {active&&<div><div className="wk2-modal-header"><h2 id="wk2-manage-title">{active.name}</h2><button type="button" aria-label={t.close} onClick={closeManage}><Icon name="x"/></button></div>
    <div className="wk2-rename"><label className="wk2-field-label" htmlFor="wk2-rename">{t.name}</label><div className="wk2-rename-row"><input className="wk2-input" id="wk2-rename" value={rename} maxLength={60} disabled={!canManage||Boolean(busy)} onChange={event=>setRename(event.target.value)}/><button className="wk2-button" type="button" onClick={saveRename} disabled={!canManage||Boolean(busy)||rename.trim().length<2||rename.trim()===active.name}>{locale==="bn"?"সংরক্ষণ":"Save"}</button></div></div>
    {([{key:"payments" as const,label:t.payProduct,desc:t.payProductHint},{key:"ai" as const,label:t.aiProduct,desc:t.aiProductHint}]).map(product=>{
     const checked=product.key==="payments"?(active.mode==="both"||active.mode==="commerce"):(active.mode==="both"||active.mode==="ai");
     return <div className="wk2-product" key={product.key}><div><strong>{product.label}</strong><small>{product.desc}</small></div><button type="button" role="switch" className="wk2-switch" aria-label={product.label} aria-checked={checked} disabled={!canManage||Boolean(busy)} onClick={()=>toggle(product.key)}/></div>;
    })}
    {manageError&&<p className="wk2-modal-error" role="alert">{manageError}</p>}
    <div className="wk2-modal-footer"><span className="wk2-hint">{t.access}</span>{active.id!==defaultId&&<button type="button" className="wk2-button" disabled={Boolean(busy)} onClick={makeDefault}>{t.makeDefault}</button>}<button type="button" className="wk2-button wk2-primary" onClick={closeManage} disabled={Boolean(busy)}>{t.done}</button></div>
   </div>}
  </dialog>
  <dialog ref={confirmDialog} className="wk2-dialog wk2-confirm" aria-labelledby="wk2-confirm-title" onCancel={()=>setConfirmProduct(null)} onClose={()=>setConfirmProduct(null)} onClick={event=>clickAway(event,()=>setConfirmProduct(null))}>
   <div className="wk2-modal-header"><h2 id="wk2-confirm-title">{t.confirmTitle}</h2><button type="button" aria-label={t.close} onClick={()=>setConfirmProduct(null)}><Icon name="x"/></button></div>
   <p>{t.confirmMessage}</p>
   <div className="wk2-modal-footer"><button type="button" className="wk2-button" onClick={()=>setConfirmProduct(null)}>{t.cancel}</button><button type="button" className="wk2-button wk2-primary" onClick={()=>{const p=confirmProduct;setConfirmProduct(null);if(p)applyToggle(p)}}>{t.turnOff}</button></div>
  </dialog>
  {toast&&<div className="wk2-toast" role="status">{toast}</div>}
 </main>;
}
