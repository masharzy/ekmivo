"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sections, type SectionKey } from "../lib/dashboard-sections";
import { dashboardHref, navigation, searchableNavigation, searchableBusinesses, serviceEnabled, serviceNames, sectionInService, type Locale, type Service, type PaymentEnvironment } from "../lib/dashboard-navigation";
import { DashboardIcon as Icon } from "./dashboard-icon";
import { SiteControls } from "./site-controls";
import { activeDrafts,saveActiveDrafts,discardActiveDrafts } from "../lib/client/draft-navigation";

type Space = { id: string; name: string; mode: "ai" | "commerce" | "both" | "off"; role: "owner" | "admin" | "editor" | "viewer" };
type PaymentContext = { environment: PaymentEnvironment; status: "active" | "suspended"; availableEnvironments: PaymentEnvironment[]; liveOperational: false };
type Props = { locale: Locale; service: Service; section: SectionKey; workspace: Space; spaces: Space[]; userName: string; platformAdmin: boolean; theme: "light" | "dark" | "system"; paymentContext?: PaymentContext; children: React.ReactNode; logout: React.ReactNode };
const memoryKey=(workspaceId:string,service:Service)=>`ekmivo-last:${workspaceId}:${service}`;
const environmentKey=(workspaceId:string)=>`ekmivo-last-env:${workspaceId}`;
function rememberedEnvironment(workspaceId:string):PaymentEnvironment{
 try{return window.localStorage.getItem(environmentKey(workspaceId))==="live"?"live":"sandbox";}catch{return "sandbox";}
}
function rememberedSection(workspaceId:string,service:Service): SectionKey {
 try {
  const stored=window.localStorage.getItem(memoryKey(workspaceId,service));
  if(stored&&sectionInService(service,stored))return stored;
 }catch{ /* Browser storage unavailable: safe overview fallback. */ }
 return "overview";
}
export function DashboardFrame({ locale, service, section, workspace, spaces, userName, platformAdmin, theme, paymentContext, children, logout }: Props) {
 const bn=locale==="bn",router=useRouter(),pathname=usePathname();
 const environment=paymentContext?.environment??"sandbox";
 const [mobileOpen,setMobileOpen]=useState(false);
 const [businessQuery,setBusinessQuery]=useState("");
 const [sidebarQuery,setSidebarQuery]=useState("");
 const [globalQuery,setGlobalQuery]=useState("");
 const [activeResult,setActiveResult]=useState(0);
 const [searchOpen,setSearchOpen]=useState(false);
 const [isNavigating,startTransition]=useTransition();
 const [noticeOpen,setNoticeOpen]=useState(false);
 const [blockedRoute,setBlockedRoute]=useState<string|null>(null);
 const [draftError,setDraftError]=useState("");
 const [draftSaving,setDraftSaving]=useState(false);
 const drawer=useRef<HTMLDialogElement>(null);
 const searchDialog=useRef<HTMLDialogElement>(null);
 const searchReturnFocus=useRef<HTMLElement|null>(null);
 const menuTrigger=useRef<HTMLButtonElement>(null);
 const mobileDrawerWasOpen=useRef(false);
 const searchInput=useRef<HTMLInputElement>(null);
 const draftDialog=useRef<HTMLDialogElement>(null);
 const serviceMenu=useRef<HTMLDetailsElement>(null);
 const businessMenu=useRef<HTMLDetailsElement>(null);
 const groups=sidebarQuery?searchableNavigation(service,sidebarQuery):navigation[service];
 const foundGroups=searchableNavigation(service,globalQuery);
 const foundKeys=foundGroups.flatMap(group=>group.items);
 const foundBusinesses=searchableBusinesses(spaces,globalQuery);
 const resultCount=foundKeys.length+foundBusinesses.length;
 const roleNames={owner:{bn:"মালিক",en:"Owner"},admin:{bn:"অ্যাডমিন",en:"Admin"},editor:{bn:"সম্পাদক",en:"Editor"},viewer:{bn:"দর্শক",en:"Viewer"}} as const;
 const visibleBusinesses=spaces.filter(space=>space.name.toLocaleLowerCase().includes(businessQuery.trim().toLocaleLowerCase()));
 const contextHref=useCallback((key:SectionKey,product:Service=service,businessId:string=workspace.id,env:PaymentEnvironment=environment)=>dashboardHref(locale,businessId,product,key,env),[locale,workspace.id,service,environment]);

 const goTo=useCallback((businessId:string,product:Service,env:PaymentEnvironment,nextSection:SectionKey)=>{
  setMobileOpen(false);
  setSearchOpen(false);
  if(serviceMenu.current)serviceMenu.current.open=false;
  if(businessMenu.current)businessMenu.current.open=false;
  const next=dashboardHref(locale,businessId,product,nextSection,env);
  if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}
  startTransition(()=>router.push(next));
 },[locale,router,startTransition]);

 useEffect(()=>{
  try{window.localStorage.setItem(memoryKey(workspace.id,service),section);}catch{/* Non-essential preference. */}
 },[pathname,section,workspace.id,service,environment]);
 // The visible, server-authorized environment becomes the preference only
 // after routing commits. A cancelled draft dialog must never persist a new env.
 useEffect(()=>{
  if(service!=="payments")return;
  try{window.localStorage.setItem(environmentKey(workspace.id),environment);}catch{/* Optional preference. */}
 },[service,workspace.id,environment]);
 useEffect(()=>{
  const d=drawer.current;
  if(mobileOpen && d && !d.open){d.showModal();mobileDrawerWasOpen.current=true;}
  if(!mobileOpen){
   if(d?.open)d.close();
   // React closes the modal in the prior effect cleanup before this effect
   // runs; focus restoration must not depend on d.open here.
   if(mobileDrawerWasOpen.current){mobileDrawerWasOpen.current=false;menuTrigger.current?.focus();}
  }
  return ()=>{if(d?.open)d.close();};
 },[mobileOpen]);
 useEffect(()=>{
  const d=searchDialog.current;
  if(searchOpen && d && !d.open){d.showModal();searchInput.current?.focus();}
  if(!searchOpen){
   if(d?.open)d.close();
   const previous=searchReturnFocus.current;
   if(previous?.isConnected)previous.focus();
   searchReturnFocus.current=null;
  }
  return ()=>{if(d?.open)d.close();};
 },[searchOpen]);
 useEffect(()=>{
  const d=draftDialog.current;
  if(blockedRoute && d && !d.open)d.showModal();
  if(!blockedRoute && d?.open)d.close();
  return ()=>{if(d?.open)d.close();};
 },[blockedRoute]);
 useEffect(()=>{
  const beforeLeave=(event:BeforeUnloadEvent)=>{
   if(activeDrafts().length){event.preventDefault();event.returnValue="";}
  };
  const guardedNavigation=(event:Event)=>{
   const intent=event as CustomEvent<{href?:string}>;
   const href=intent.detail?.href;
   if(typeof href!=="string"||!href.startsWith("/")||href.startsWith("//"))return;
   if(activeDrafts().length){event.preventDefault();setDraftError("");setBlockedRoute(href);}
  };
  const guardedAnchor=(event:MouseEvent)=>{
   if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!activeDrafts().length)return;
   const element=event.target instanceof Element?event.target.closest("a[href]"):null;
   if(!element||!(element instanceof HTMLAnchorElement)||element.target==="_blank"||element.hasAttribute("download"))return;
   const url=new URL(element.href);
   if(url.origin!==window.location.origin)return;
   const current=window.location.pathname+window.location.search+window.location.hash;
   const destination=url.pathname+url.search+url.hash;
   if(current===destination)return;
   event.preventDefault();event.stopPropagation();
   setDraftError("");setBlockedRoute(destination);
  };
  window.addEventListener("beforeunload",beforeLeave);
  window.addEventListener("ekmivo:guarded-navigation",guardedNavigation);
  document.addEventListener("click",guardedAnchor,true);
  return ()=>{
   window.removeEventListener("beforeunload",beforeLeave);
   window.removeEventListener("ekmivo:guarded-navigation",guardedNavigation);
   document.removeEventListener("click",guardedAnchor,true);
  };
 },[]);
 const commitDraftNavigation=async()=>{
  if(!blockedRoute)return;
  setDraftSaving(true);
  const ok=await saveActiveDrafts();
  setDraftSaving(false);
  if(!ok){setDraftError(bn?"খসড়া সংরক্ষণ করা যায়নি। এই পৃষ্ঠায় থাকুন বা পরিবর্তন বাতিল করুন।":"Draft save failed. Stay on this page or discard changes.");return;}
  const next=blockedRoute;setBlockedRoute(null);
  startTransition(()=>router.push(next));
 };
 const discardDraftNavigation=()=>{
  if(!blockedRoute)return;
  if(!discardActiveDrafts()){setDraftError(bn?"পরিবর্তন বাতিল করা যায়নি":"Unable to discard the changes");return;}
  const next=blockedRoute;setBlockedRoute(null);
  startTransition(()=>router.push(next));
 };
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if((event.metaKey||event.ctrlKey)&&event.key.toLocaleLowerCase()==="k"){
    event.preventDefault();
    searchReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    setGlobalQuery("");setActiveResult(0);setSearchOpen(true);
   }
   if(event.key==="Escape"){
    if(serviceMenu.current)serviceMenu.current.open=false;
    if(businessMenu.current)businessMenu.current.open=false;
   }
  };
  const dismiss=(event:PointerEvent)=>{
   const target=event.target as Node;
   for(const ref of [serviceMenu,businessMenu]) if(ref.current&&!ref.current.contains(target))ref.current.open=false;
  };
  document.addEventListener("keydown",key);
  document.addEventListener("pointerdown",dismiss);
  return ()=>{document.removeEventListener("keydown",key);document.removeEventListener("pointerdown",dismiss);};
 },[]);
 const switchProduct=(target:Service)=>{
  if(target===service)return;
  if(!serviceEnabled(target,workspace.mode))return;
  const remembered=rememberedSection(workspace.id,target);
  goTo(workspace.id,target,target==="payments"?rememberedEnvironment(workspace.id):environment,remembered);
 };
 const switchBusiness=(target:Space)=>{
  if(target.id===workspace.id){setSearchOpen(false);setMobileOpen(false);if(businessMenu.current)businessMenu.current.open=false;return;}
  if(target.mode==="off"){
   setSearchOpen(false);
   setMobileOpen(false);
   const next=`/${locale}/w/${target.id}/dashboard`;
   // Even a disabled product has a guarded destination. Never bypass an
   // active unsaved draft when switching to a business with both products off.
   if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}
   startTransition(()=>router.push(next));
   return;
  }
  const chosen=serviceEnabled(service,target.mode)?service:(target.mode==="ai"?"ai":"payments");
  goTo(target.id,chosen,chosen==="payments"?rememberedEnvironment(target.id):environment,rememberedSection(target.id,chosen));
 };
 const nav=(key:SectionKey)=>{
  goTo(workspace.id,service,environment,key);
 };
 const activateSearchResult=(index:number)=>{
  if(index<foundKeys.length){
   const key=foundKeys[index];
   if(key)nav(key);
   return;
  }
  const business=foundBusinesses[index-foundKeys.length];
  if(business)switchBusiness(business);
 };
 const sidebar=(mobile=false)=><>
  <div className="ds-brand-row">
   <Link href={`/${locale}`} className="ek-wordmark">ekmivo<span>.</span></Link>
   <span className="ds-product-tag">{service==="ai"?"AI":"PAY"}</span>
   {mobile&&<button type="button" className="ds-icon-button" aria-label={bn?"মেনু বন্ধ করুন":"Close menu"} onClick={()=>setMobileOpen(false)}><Icon name="close"/></button>}
  </div>
  <details className="ds-business-picker" ref={mobile?undefined:businessMenu}>
   <summary><span className="ds-business-avatar">{workspace.name.slice(0,1).toUpperCase()}</span><span><small>{bn?"বর্তমান ব্যবসা":"Current business"}</small><strong>{workspace.name}</strong></span><Icon name="chevron"/></summary>
   <div className="ds-business-menu">
    <label className="ds-switch-search"><span className="sr-only">{bn?"ব্যবসা খুঁজুন":"Find business"}</span><input value={businessQuery} onChange={event=>setBusinessQuery(event.target.value)} placeholder={bn?"ব্যবসা খুঁজুন…":"Search businesses…"} /></label>
    {visibleBusinesses.map(space=><button key={space.id} type="button" aria-current={space.id===workspace.id?"true":undefined} onClick={()=>switchBusiness(space)}><span className="ds-business-avatar">{space.name.slice(0,1).toUpperCase()}</span><span><strong>{space.name}</strong><small>{roleNames[space.role][locale]}{space.id===workspace.id?(bn?" · বর্তমান":" · Current"):""}</small></span>{space.id===workspace.id&&<Icon name="check"/>}</button>)}
    {!visibleBusinesses.length&&<p className="ds-no-match" role="status">{bn?"কোনো ব্যবসা পাওয়া যায়নি":"No businesses match"}</p>}
    <Link href={`/${locale}/workspaces`} onClick={()=>setMobileOpen(false)}><Icon name="plus"/>{bn?"ব্যবসা পরিচালনা / নতুন ব্যবসা":"Manage / create businesses"}</Link>
   </div>
  </details>
  <label className="ds-nav-search"><Icon name="search"/><span className="sr-only">{bn?"মেনু খুঁজুন":"Find a page"}</span><input value={sidebarQuery} onChange={event=>setSidebarQuery(event.target.value)} placeholder={bn?"মেনু খুঁজুন…":"Find a page…"}/></label>
  <nav className="ds-navigation" aria-label={bn?`${serviceNames[service].bn} নেভিগেশন`:`${serviceNames[service].en} navigation`}>
   {groups.map(group=><section className="ds-nav-section" key={group.label.en}>
    {service==="payments"&&group.label.en==="Commerce"?<details className="ds-unreleased-nav"><summary>{group.label[locale]} <small>{bn?"নির্মাণাধীন":"In development"}</small></summary><p>{bn?"কমার্সের এই কাজগুলো Payment phase-এর পরে চালু হবে।":"Commerce operations will follow the verified payment phase."}</p></details>:<h2>{group.label[locale]}</h2>}
    {!(service==="payments"&&group.label.en==="Commerce")&&group.items.map(key=><Link key={key} href={contextHref(key)} className={section===key?"is-current":undefined} aria-current={section===key?"page":undefined} onClick={event=>{event.preventDefault();nav(key);}}>
     <Icon name={key}/><span>{sections[key][locale]}</span>{section===key&&<span className="ds-active-mark"/>}</Link>)}
   </section>)}
   {!groups.length&&<p className="ds-search-empty" role="status">{bn?"কোনো মেনু পাওয়া যায়নি।":"No matching pages."}</p>}
  </nav>
  <div className="ds-sidebar-foot">
   {platformAdmin&&<Link href={`/${locale}/admin`}><Icon name="shield"/>{bn?"প্ল্যাটফর্ম অ্যাডমিন":"Platform admin"}</Link>}
   {logout}
   <div className="ds-signed-in"><span className="ds-person-avatar">{userName.slice(0,1).toUpperCase()}</span><span><strong>{userName}</strong><small>{bn?"আপনার অ্যাকাউন্ট":"Your account"}</small></span></div>
  </div>
 </>;
 return <div className="ds-app" data-service={service} data-environment={environment}>
  <a className="ds-skip" href="#dashboard-content">{bn?"মূল অংশে যান":"Skip to content"}</a>
  <aside className="ds-sidebar">{sidebar()}</aside>
  <dialog ref={drawer} className="ds-mobile-dialog" aria-label={bn?"ওয়ার্কস্পেস মেনু":"Workspace menu"} onCancel={()=>setMobileOpen(false)} onClose={()=>setMobileOpen(false)}>{sidebar(true)}</dialog>
  <div className="ds-main">
   <header className="ds-topbar">
    <div className="ds-topbar-leading">
     <button type="button" className="ds-icon-button ds-mobile-trigger" ref={menuTrigger} aria-label={bn?"মেনু খুলুন":"Open menu"} aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><Icon name="menu"/></button>
     <details className="ds-service-picker" ref={serviceMenu}>
      <summary><span className="ds-service-icon"><Icon name={service==="ai"?"ai-agent":"payments"}/></span><span><small>{bn?"সেবা নির্বাচন":"Product"}</small><strong>{serviceNames[service][locale]}</strong></span><Icon name="chevron"/></summary>
      <div className="ds-service-menu">
       <p>{bn?"সেবা পরিবর্তন করুন":"Switch product"}</p>
       {(["payments","ai"] as Service[]).map(item=>{
        const enabled=serviceEnabled(item,workspace.mode);
        return <button type="button" key={item} disabled={!enabled} aria-current={service===item?"true":undefined} onClick={()=>switchProduct(item)}>
         <span className="ds-service-icon"><Icon name={item==="ai"?"ai-agent":"payments"}/></span>
         <span><strong>{serviceNames[item][locale]}</strong><small>{item==="ai"?(bn?"চ্যাট, AI ও লিড · তৈরির কাজ চলছে":"Inbox, AI and leads · In development"):(bn?"পেমেন্ট ও ডিভাইস · সেটআপ প্রয়োজন":"Payments and devices · Setup required")}</small></span>
         {service===item?<Icon name="check"/>:<small>{enabled?"↗":(bn?"অ্যাক্সেস নেই":"Not available")}</small>}
        </button>;
       })}
       <p className="ds-service-note">{bn?"ব্যবসা অপরিবর্তিত থাকবে; আগের পৃষ্ঠা মনে রাখা হবে।":"Business stays selected. Your last page is remembered."}</p>
      </div>
     </details>
     {service==="payments"&&<label className="ds-environment-picker">
      <span className="sr-only">{bn?"পেমেন্ট পরিবেশ":"Payment environment"}</span>
      <select value={environment} onChange={event=>{
       const next=event.target.value as PaymentEnvironment;
       if(!paymentContext?.availableEnvironments.includes(next))return;
       // The new preference is committed only after the destination renders.
       // Environment-scoped record IDs and list filters never carry across:
       // this URL selects only the corresponding section in the other realm.
       goTo(workspace.id,service,next,section);
      }}>
       {(["sandbox","live"] as PaymentEnvironment[]).map(item=><option key={item} value={item} disabled={!paymentContext?.availableEnvironments.includes(item)}>{item==="sandbox"?"Sandbox":"Live"}</option>)}
      </select>
     </label>}
    </div>
    <div className="ds-topbar-tools">
     <button type="button" className="ds-global-search-button" onClick={()=>{searchReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSearchOpen(true);setGlobalQuery("");setActiveResult(0);}}><Icon name="search"/><span>{bn?"খুঁজুন":"Search"}</span><kbd>⌘ K</kbd></button>
     <SiteControls locale={locale} initialTheme={theme}/>
     <details className="ds-notifications" open={noticeOpen} onToggle={event=>setNoticeOpen(event.currentTarget.open)}>
      <summary className="ds-icon-button" aria-label={bn?"নোটিফিকেশন":"Notifications"}><Icon name="bell"/></summary>
      <div className="ds-notifications-menu"><strong>{bn?"নোটিফিকেশন":"Notifications"}</strong><p>{bn?"ইভেন্ট সেবা এখনো সংযুক্ত হয়নি; কোনো unread count দেখানো হচ্ছে না।":"The event service is not connected; unread counts are unavailable."}</p></div>
     </details>
     <Link className="ds-help-link" href={contextHref("help")} aria-label={bn?"সহায়তা":"Help"}><Icon name="help"/></Link>
     <details className="ds-profile-menu">
      <summary aria-label={bn?"অ্যাকাউন্ট মেনু":"Account menu"} title={userName}><span className="ds-person-avatar">{userName.slice(0,1).toUpperCase()}</span></summary>
      <div className="ds-profile-popover">
       <strong>{userName}</strong><small>{workspace.name}</small>
       <Link href={`/${locale}/account`}><Icon name="settings"/>{bn?"অ্যাকাউন্ট ও নিরাপত্তা":"Account & security"}</Link>
       <Link href={contextHref("settings")}><Icon name="settings"/>{bn?"ওয়ার্কস্পেস সেটিংস · নির্মাণাধীন":"Workspace settings · In development"}</Link>
       <Link href={contextHref("help")}><Icon name="help"/>{bn?"সাহায্য":"Help"}</Link>
       {platformAdmin&&<Link href={`/${locale}/admin`}><Icon name="shield"/>{bn?"প্ল্যাটফর্ম অ্যাডমিন":"Platform admin"}</Link>}
       {logout}
      </div>
     </details>
    </div>
   </header>
   {service==="payments"&&<div className={environment==="sandbox"?"ds-env-banner":"ds-env-banner is-live"} role="status">
    <strong>{environment==="sandbox"?(bn?"Sandbox · আলাদা পরীক্ষার পরিবেশ":"Sandbox · Isolated test environment"):(bn?"Live · সেটআপ অসম্পূর্ণ":"Live · Setup incomplete")}</strong>
    <span>{environment==="sandbox"?(bn?"এটি live টাকা গ্রহণ নয়; কোনো পেমেন্ট যাচাই বা webhook চালু নেই।":"This is not real money. Payment verification and webhooks are not enabled."):(bn?"Live payment চালু হয়নি। Receiving account, ডিভাইস, API ও security পরীক্ষা বাকি।":"Live payments are not enabled. Receiving sources, devices, APIs and security checks are pending.")}</span>
    {environment==="live"&&<Link href={contextHref("gateways")}>{bn?"সেটআপ দেখুন":"View setup"} ↗</Link>}
   </div>}
   <div className="ds-breadcrumb"><span>{workspace.name}</span><Icon name="chevron"/><span>{serviceNames[service][locale]}</span><Icon name="chevron"/><strong>{sections[section][locale]}</strong></div>
   {isNavigating&&<div className="ds-navigation-progress" role="status">{bn?"পৃষ্ঠা খুলছে…":"Opening page…"}</div>}
   <main id="dashboard-content" className="ds-content" tabIndex={-1}>{children}</main>
   <footer className="ds-footnote"><span>{serviceNames[service][locale]} · {workspace.name}</span><span>Asia/Dhaka</span></footer>
  </div>
  <dialog ref={searchDialog} className="ds-search-dialog" aria-label={bn?"ওয়ার্কস্পেস খুঁজুন":"Search workspace"} onCancel={()=>setSearchOpen(false)} onClose={()=>setSearchOpen(false)}>
   <div className="ds-search-top"><Icon name="search"/><input ref={searchInput} autoFocus role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="ds-global-results" aria-activedescendant={resultCount?`ds-global-result-${Math.min(activeResult,resultCount-1)}`:undefined} value={globalQuery} onChange={event=>{setGlobalQuery(event.target.value);setActiveResult(0);}} placeholder={bn?"পৃষ্ঠা ও অনুমোদিত ব্যবসা খুঁজুন…":"Find pages or your businesses…"} aria-label={bn?"পৃষ্ঠা বা ব্যবসা খুঁজুন":"Find a page or your business"}
     onKeyDown={event=>{
      if(event.key==="ArrowDown"){event.preventDefault();setActiveResult(i=>resultCount?(i+1)%resultCount:0);}
      if(event.key==="ArrowUp"){event.preventDefault();setActiveResult(i=>resultCount?(i+resultCount-1)%resultCount:0);}
      if(event.key==="Enter"&&resultCount){event.preventDefault();activateSearchResult(Math.min(activeResult,resultCount-1));}
     }}/><button type="button" className="ds-icon-button" onClick={()=>setSearchOpen(false)} aria-label={bn?"বন্ধ করুন":"Close search"}><Icon name="close"/></button></div>
   <div id="ds-global-results" className="ds-search-results" role="listbox" aria-label={bn?"ফলাফল":"Results"}>
    {foundKeys.map((key,index)=><button id={`ds-global-result-${index}`} type="button" role="option" aria-selected={activeResult===index} onMouseEnter={()=>setActiveResult(index)} key={key} onClick={()=>nav(key)}><Icon name={key}/><span>{sections[key][locale]}</span><small>{serviceNames[service][locale]}</small></button>)}
    {foundBusinesses.map((space,index)=>{
     const position=foundKeys.length+index;
     return <button id={`ds-global-result-${position}`} type="button" role="option" aria-selected={activeResult===position} onMouseEnter={()=>setActiveResult(position)} key={space.id} onClick={()=>switchBusiness(space)}><Icon name="settings"/><span>{space.name}</span><small>{space.id===workspace.id?(bn?"বর্তমান ব্যবসা":"Current business"):(bn?"ব্যবসা পরিবর্তন":"Switch business")}</small></button>;
    })}
    {!resultCount&&<p role="status">{bn?"কোনো অনুমোদিত ফলাফল পাওয়া যায়নি":"No authorized results match"}</p>}
   </div>
   <p className="ds-search-hint">{bn?"শুধু বর্তমান সেবার পৃষ্ঠা ও আপনার অনুমোদিত ব্যবসা দেখানো হচ্ছে। পেমেন্ট/গ্রাহকের record search সংশ্লিষ্ট backend তৈরি হলে চালু হবে।":"Only this product's pages and your authorized businesses appear. Payment/customer record search requires the later data APIs."}</p>
  </dialog>
  <dialog ref={draftDialog} className="ds-draft-dialog" aria-label={bn?"সংরক্ষণ না করা পরিবর্তন":"Unsaved changes"} onCancel={()=>{setBlockedRoute(null);setDraftError("");}}>
   <h2>{bn?"পরিবর্তন সংরক্ষণ করা হয়নি":"You have unsaved changes"}</h2>
   <p>{bn?"ব্যবসা, সেবা বা পরিবেশ পরিবর্তন করলে এই খসড়া হারাতে পারেন। কী করতে চান?":"Changing the business, product or environment may lose your draft. Choose an action."}</p>
   {draftError&&<p className="ds-draft-error" role="alert">{draftError}</p>}
   <div className="ds-draft-actions">
    <button type="button" disabled={draftSaving} onClick={()=>{setBlockedRoute(null);setDraftError("");}}>{bn?"থাকুন":"Stay"}</button>
    <button type="button" disabled={draftSaving} onClick={discardDraftNavigation}>{bn?"বাতিল করুন":"Discard"}</button>
    <button type="button" disabled={draftSaving} onClick={()=>{void commitDraftNavigation();}}>{draftSaving?(bn?"সংরক্ষণ হচ্ছে…":"Saving…"):(bn?"খসড়া সংরক্ষণ":"Save draft")}</button>
   </div>
  </dialog>
 </div>;
}
