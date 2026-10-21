"use client";
import {planSectionAllowed} from "../lib/plan-features";
import type {PlanTerms} from "../lib/payment-plans";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sections, type SectionKey } from "../lib/dashboard-sections";
import { dashboardHref, navigation, searchableNavigation, searchableBusinesses, serviceEnabled, serviceNames, sectionInService, type Locale, type Service, type PaymentEnvironment } from "../lib/dashboard-navigation";
import { DashboardIcon as Icon } from "./dashboard-icon";
import {unifiedNavigation,enabledUnifiedService,unifiedSectionHref} from "../lib/unified-navigation";
import {chooseUnifiedBusiness} from "../actions/unified-business";
import { SiteControls } from "./site-controls";
import { DashboardFeedback } from "./dashboard-feedback";
import { PaymentNotifications } from "./payment-notifications";
import { PaymentRecordSearch } from "./payment-record-search";
import { activeDrafts,saveActiveDrafts,discardActiveDrafts } from "../lib/client/draft-navigation";
import "./primary-store-badge.css";

type Space = { id: string; name: string; mode: "ai" | "commerce" | "both" | "off"; role: "owner" | "admin" | "editor" | "viewer" };
type PaymentContext = { environment: PaymentEnvironment; status: "active" | "suspended"; availableEnvironments: PaymentEnvironment[]; liveOperational: false };

type Props = { unified?:boolean; planFeatures?:PlanTerms["features"]|null; locale: Locale; service: Service; section: SectionKey; workspace: Space; spaces: Space[]; userName: string; platformAdmin: boolean; theme: "light" | "dark" | "system"; paymentContext?: PaymentContext; children: React.ReactNode; logout: React.ReactNode };
const memoryKey=(workspaceId:string,service:Service)=>`ekmivo-last:${workspaceId}:${service}`;
// Paused: Sandbox/Live preference in merchant UI.
// const environmentKey=(workspaceId:string)=>`ekmivo-last-env:${workspaceId}`;
// Paused until sandbox UI is restored.
// function rememberedEnvironment(workspaceId:string):PaymentEnvironment{
//  try{return window.localStorage.getItem(environmentKey(workspaceId))==="live"?"live":"sandbox";}catch{return "sandbox";}
// }
function rememberedSection(workspaceId:string,service:Service): SectionKey {
 try {
  const stored=window.localStorage.getItem(memoryKey(workspaceId,service));
  if(stored&&sectionInService(service,stored))return stored;
 }catch{ /* Browser storage unavailable: safe overview fallback. */ }
 return "overview";
}
export function DashboardFrame({ unified=false, locale, service, section:initialSection, workspace, spaces, userName, platformAdmin, theme, paymentContext, planFeatures, children, logout }: Props) {
 // Internal locale rewrites and the visible URL must render identical nav.
 const bn=locale==="bn",router=useRouter(),pathname=usePathname().replace(/^\/(?:bn|en)(?=\/|$)/,"")||"/";
 // Locale-neutral visible URL, with tolerance for old prefixed URLs.
 const requestedSection=pathname.match(/\/(?:bn\/|en\/)?w\/[^/]+\/(?:ai|payments)\/([^/?#]+)/)?.[1];
 const section=sectionInService(service,requestedSection??"")?requestedSection as SectionKey:initialSection;
 // Browser environment selection is disabled; the server-authorized Live realm wins.
 // const requestedEnvironment=query.getAll("env");
 // const selectedEnvironment=requestedEnvironment.length===1?requestedEnvironment[0]:undefined;
 const environment:PaymentEnvironment=paymentContext?.environment??"live";
 const [mobileOpen,setMobileOpen]=useState(false);
 const [businessQuery,setBusinessQuery]=useState("");
 const [globalQuery,setGlobalQuery]=useState("");
 const [activeResult,setActiveResult]=useState(0);
 const [searchOpen,setSearchOpen]=useState(false);
 const [isNavigating,startTransition]=useTransition();
 const [noticeOpen,setNoticeOpen]=useState(false);
 const [blockedRoute,setBlockedRouteValue]=useState<string|null>(null);
 const blockedBusiness=useRef<string|null>(null);
 const setBlockedRoute=useCallback((route:string|null,businessId:string|null=null)=>{
  blockedBusiness.current=businessId;
  setBlockedRouteValue(route);
 },[]);
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
 const scrollableNav=useRef<HTMLElement|null>(null);
 const [navHasMore,setNavHasMore]=useState(false);
 useEffect(()=>{
  const el=scrollableNav.current;if(!el)return;
  const update=()=>setNavHasMore(el.scrollTop+el.clientHeight+3<el.scrollHeight);
  update();
  const observer=new ResizeObserver(update);observer.observe(el);
  Array.from(el.children).forEach(child=>observer.observe(child));
  el.addEventListener("scroll",update,{passive:true});
  return()=>{observer.disconnect();el.removeEventListener("scroll",update)};
 },[service,workspace.id]);

 useEffect(()=>{
  const onEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&businessMenu.current?.open){businessMenu.current.open=false;businessMenu.current.querySelector("summary")?.focus()}};
  const onOutside=(event:MouseEvent)=>{if(businessMenu.current?.open&&!businessMenu.current.contains(event.target as Node))businessMenu.current.open=false};
  document.addEventListener("keydown",onEscape);document.addEventListener("mousedown",onOutside);
  return()=>{document.removeEventListener("keydown",onEscape);document.removeEventListener("mousedown",onOutside)};
 },[]);
 const [unreadNotifications,setUnreadNotifications]=useState(0);

 useEffect(()=>{
  const current=scrollableNav.current?.querySelector<HTMLElement>('a[aria-current="page"]');
  if(current)current.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
 },[section,service,workspace.id,pathname]);
 useEffect(()=>{
  if(!mobileOpen)return;
  const frame=requestAnimationFrame(()=>{
   const current=drawer.current?.querySelector<HTMLElement>('.ds-navigation a[aria-current="page"]');
   current?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});
  });
  return()=>cancelAnimationFrame(frame);
 },[mobileOpen,section,workspace.id]);

 const allowed=(key:string)=>service!=="payments"||planSectionAllowed(key,planFeatures);
 const groups=navigation[service].map(g=>({...g,items:g.items.map(key=>service==="payments"&&key==="payment-links"&&!allowed(key)?"requests" as SectionKey:key).filter(allowed)})).filter(g=>g.items.length);
 const foundGroups=searchableNavigation(service,globalQuery).map(g=>({...g,items:g.items.filter(allowed)})).filter(g=>g.items.length);
 const foundKeys=unified?([] as SectionKey[]):foundGroups.flatMap(group=>group.items);
 const unifiedItems=unifiedNavigation.filter(item=>enabledUnifiedService(workspace.mode,item.service));
 const foundUnified=unified?unifiedItems.filter(item=>`${item.en} ${item.bn}`.toLocaleLowerCase().includes(globalQuery.trim().toLocaleLowerCase())):[];
 const foundBusinesses=spaces.length>1?searchableBusinesses(spaces,globalQuery):[];
 const resultCount=foundKeys.length+foundUnified.length+foundBusinesses.length;
 const roleNames={owner:{bn:"মালিক",en:"Owner"},admin:{bn:"অ্যাডমিন",en:"Admin"},editor:{bn:"সম্পাদক",en:"Editor"},viewer:{bn:"দর্শক",en:"Viewer"}} as const;
 const visibleBusinesses=spaces.filter(space=>space.name.toLocaleLowerCase().includes(businessQuery.trim().toLocaleLowerCase()));
 const contextHref=useCallback((key:SectionKey,product:Service=service,businessId:string=workspace.id,env:PaymentEnvironment=environment)=>unified&&businessId===workspace.id?(unifiedSectionHref(key,product)??dashboardHref(locale,businessId,product,key,env)):dashboardHref(locale,businessId,product,key,env),[locale,workspace.id,service,environment,unified]);

 const goTo=useCallback((businessId:string,product:Service,env:PaymentEnvironment,nextSection:SectionKey)=>{
  setMobileOpen(false);
  setSearchOpen(false);
  if(serviceMenu.current)serviceMenu.current.open=false;
  if(businessMenu.current)businessMenu.current.open=false;
  const next=unified&&businessId===workspace.id?(unifiedSectionHref(nextSection,product)??dashboardHref(locale,businessId,product,nextSection,env)):dashboardHref(locale,businessId,product,nextSection,env);
  if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}
  startTransition(()=>router.push(next));
 },[locale,router,startTransition,unified,workspace.id]);

 useEffect(()=>{
  try{window.localStorage.setItem(memoryKey(workspace.id,service),section);}catch{/* Non-essential preference. */}
 },[pathname,section,workspace.id,service,environment]);
 // The visible, server-authorized environment becomes the preference only
 // after routing commits. A cancelled draft dialog must never persist a new env.
 // Paused: Sandbox/Live selection memory.
 // useEffect(()=>{
 //  if(service!=="payments")return;
 //  try{window.localStorage.setItem(environmentKey(workspace.id),environment);}catch{/* Optional preference. */}
 // },[service,workspace.id,environment]);
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
 // Mobile modal must lock document scrolling as well as pointer/focus.
 // Restore the exact previous body style instead of forcing a new value.
 useEffect(()=>{
  if(!mobileOpen)return;
  const prior=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return ()=>{document.body.style.overflow=prior;};
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
 const finishDraftNavigation=async()=>{
  if(!blockedRoute)return;
  const next=blockedRoute,businessId=blockedBusiness.current;
  setDraftSaving(true);
  try{
   // Persist the authorized business only after the draft decision succeeds.
   // A denied/revoked membership must leave this page and dialog in place.
   if(businessId&&!await chooseUnifiedBusiness(businessId)){
    setDraftError(bn?"ব্যবসা পরিবর্তন করা যায়নি। আপনার প্রবেশাধিকার আবার যাচাই করুন।":"Unable to switch business. Check your access and retry.");
    return;
   }
   setBlockedRoute(null);
   startTransition(()=>{router.push(next);if(businessId)router.refresh();});
  }catch{
   setDraftError(bn?"ব্যবসা পরিবর্তন করা যায়নি। আবার চেষ্টা করুন।":"Unable to switch business. Please retry.");
  }finally{setDraftSaving(false);}
 };
 const commitDraftNavigation=async()=>{
  if(!blockedRoute||draftSaving)return;
  setDraftSaving(true);
  const ok=await saveActiveDrafts();
  setDraftSaving(false);
  if(!ok){setDraftError(bn?"খসড়া সংরক্ষণ করা যায়নি। এই পৃষ্ঠায় থাকুন বা পরিবর্তন বাতিল করুন।":"Draft save failed. Stay on this page or discard changes.");return;}
  await finishDraftNavigation();
 };
 const discardDraftNavigation=()=>{
  if(!blockedRoute||draftSaving)return;
  if(!discardActiveDrafts()){setDraftError(bn?"পরিবর্তন বাতিল করা যায়নি":"Unable to discard the changes");return;}
  void finishDraftNavigation();
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
  goTo(workspace.id,target,environment,remembered);
 };
 const switchBusiness=(target:Space)=>{
  if(target.id===workspace.id){setSearchOpen(false);setMobileOpen(false);if(businessMenu.current)businessMenu.current.open=false;return;}
  if(unified&&target.mode!=="off"){
   setSearchOpen(false);setMobileOpen(false);if(businessMenu.current)businessMenu.current.open=false;
   if(activeDrafts().length){setBlockedRoute("/dashboard",target.id);setDraftError("");return;}
   startTransition(async()=>{if(await chooseUnifiedBusiness(target.id)){router.push("/dashboard");router.refresh();}});
   return;
  }
  if(target.mode==="off"){
   setSearchOpen(false);
   setMobileOpen(false);
   const next=`/w/${target.id}/dashboard`;
   // Even a disabled product has a guarded destination. Never bypass an
   // active unsaved draft when switching to a business with both products off.
   if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}
   startTransition(()=>router.push(next));
   return;
  }
  const chosen=serviceEnabled(service,target.mode)?service:(target.mode==="ai"?"ai":"payments");
  goTo(target.id,chosen,environment,rememberedSection(target.id,chosen));
 };
 const nav=(key:SectionKey)=>{
  goTo(workspace.id,service,environment,key);
 };
 const openPaymentSearchResult=(destination:string)=>{
  if(!destination.startsWith(`/w/${workspace.id}/payments/`))return;
  setSearchOpen(false);
  if(activeDrafts().length){setBlockedRoute(destination);setDraftError("");return;}
  startTransition(()=>router.push(destination));
 };
 const activateSearchResult=(index:number)=>{
  if(index<foundKeys.length){
   const key=foundKeys[index];
   if(key)nav(key);
   return;
  }
  const unifiedResult=foundUnified[index-foundKeys.length];
  if(unifiedResult){setSearchOpen(false);setMobileOpen(false);const next=unifiedResult.href;if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}startTransition(()=>router.push(next));return;}
  const business=foundBusinesses[index-foundKeys.length-foundUnified.length];
  if(business)switchBusiness(business);
 };
 const sidebar=(mobile=false)=><>
  <div className="ds-brand-row">
   <Link href={unified?"/dashboard":"/"} className="ek-wordmark">ekmivo{!unified&&<small className="ds-product-tag">{service==="ai"?"AI":"Pay"}</small>}</Link>
   {mobile&&<button type="button" className="ds-icon-button" aria-label={bn?"মেনু বন্ধ করুন":"Close menu"} onClick={()=>setMobileOpen(false)}><Icon name="close"/></button>}
  </div>
  <div className="ds-business-block">{spaces.length<=1?
   <div className="ds-business-static" role="group" aria-label={bn?"আপনার স্টোর":"Your Store"}>
    <span className="ds-business-avatar" aria-hidden="true">{workspace.name.slice(0,1).toUpperCase()}</span>
    <strong className="ds-business-current-name">{workspace.name}</strong>
   </div>:
   <details className="ds-business-picker" ref={mobile?undefined:businessMenu}>
   <summary aria-label={bn?"ওয়ার্কস্পেস পরিবর্তন":"Switch workspace"} title={workspace.name}><span className="ds-business-avatar">{workspace.name.slice(0,1).toUpperCase()}</span><strong className="ds-business-current-name">{workspace.name}</strong><Icon name="chevron"/></summary>
   <div className="ds-business-menu" role="group" aria-label={bn?"ওয়ার্কস্পেস":"Workspaces"}>
    <label className="ds-switch-search"><span className="sr-only">{bn?"ব্যবসা খুঁজুন":"Find business"}</span><input value={businessQuery} onChange={event=>setBusinessQuery(event.target.value)} placeholder={bn?"ব্যবসা খুঁজুন…":"Search businesses…"} /></label>
    {visibleBusinesses.map(space=><button key={space.id} type="button" aria-current={space.id===workspace.id?"true":undefined} onClick={()=>switchBusiness(space)}><span className="ds-business-avatar">{space.name.slice(0,1).toUpperCase()}</span><span><strong>{space.name}</strong><small>{roleNames[space.role][locale]}</small></span>{space.id===workspace.id&&<Icon name="check"/>}</button>)}
    {!visibleBusinesses.length&&<p className="ds-no-match" role="status">{bn?"কোনো ব্যবসা পাওয়া যায়নি":"No businesses match"}</p>}
    <div className="ds-business-actions"><Link href="/workspaces" onClick={()=>setMobileOpen(false)}><Icon name="settings"/>{bn?"ওয়ার্কস্পেস পরিচালনা":"Manage workspaces"}</Link><Link href="/workspaces?create=1" onClick={()=>setMobileOpen(false)}><Icon name="plus"/>{bn?"নতুন ওয়ার্কস্পেস":"New workspace"}</Link></div>
   </div>
  </details>}
  </div>
  <nav ref={mobile?undefined:scrollableNav} className={"ds-navigation"+(navHasMore&&!mobile?" has-more":"")} aria-label={bn?`${serviceNames[service].bn} নেভিগেশন`:`${serviceNames[service].en} navigation`}>
   {unified?<section className="ds-nav-section"><h2>{bn?"ব্যবসা":"Business"}</h2>{unifiedItems.map(item=><Link key={item.key} href={item.href} className={pathname===item.href||pathname.startsWith(item.href+"/")?"is-current":undefined} aria-current={pathname===item.href?"page":undefined} onClick={event=>{event.preventDefault();setMobileOpen(false);if(activeDrafts().length){setBlockedRoute(item.href);setDraftError("");return;}startTransition(()=>router.push(item.href));}}><Icon name={item.icon}/><span>{item[locale]}</span>{(pathname===item.href||pathname.startsWith(item.href+"/"))&&<span className="ds-active-mark"/>}</Link>)}</section>:groups.filter(group=>!(service==="payments"&&group.items.length===1&&group.items[0]==="billing")).map(group=><section className="ds-nav-section" key={group.label.en}>
    {service==="payments"&&group.label.en==="Commerce"?<details className="ds-unreleased-nav"><summary>{group.label[locale]} <small>{bn?"নির্মাণাধীন":"In development"}</small></summary><p>{bn?"কমার্সের এই কাজগুলো Payment phase-এর পরে চালু হবে।":"Commerce operations will follow the verified payment phase."}</p></details>:<h2>{group.label[locale]}</h2>}
    {!(service==="payments"&&group.label.en==="Commerce")&&group.items.filter(key=>!(service==="payments"&&key==="requests")).map(key=><Link key={key} href={key==="api-docs"?"/developers":contextHref(key)} target={key==="api-docs"?"_blank":undefined} rel={key==="api-docs"?"noopener noreferrer":undefined} className={section===key?"is-current":undefined} aria-current={section===key?"page":undefined} prefetch={key!=="api-docs"} onMouseEnter={()=>{if(key!=="api-docs")router.prefetch(contextHref(key))}} onFocus={()=>{if(key!=="api-docs")router.prefetch(contextHref(key))}} onClick={event=>{if(key!=="api-docs"){event.preventDefault();nav(key);}}}>
     <Icon name={key}/><span>{sections[key][locale]}</span>{key==="api-docs"&&<span aria-hidden="true">↗</span>}{section===key&&<span className="ds-active-mark"/>}</Link>)}
   </section>)}
  </nav>
  {!unified&&service==="payments"&&<div className="ds-nav-fixed-bottom"><Link href={contextHref("billing")} className={section==="billing"?"is-current":undefined} aria-current={section==="billing"?"page":undefined} onClick={event=>{event.preventDefault();nav("billing")}}><Icon name="billing"/><span>{sections.billing[locale]}</span></Link></div>}
 </>;
 return <div className="ds-app" data-service={unified?"payments":service} data-unified={unified?"true":undefined} data-environment={environment}><DashboardFeedback locale={locale}/>
  <a className="ds-skip" href="#dashboard-content">{bn?"মূল অংশে যান":"Skip to content"}</a>
  <aside className="ds-sidebar">{sidebar()}</aside>
  <dialog ref={drawer} className="ds-mobile-dialog" aria-label={bn?"ওয়ার্কস্পেস মেনু":"Workspace menu"} onCancel={()=>setMobileOpen(false)} onClose={()=>setMobileOpen(false)}>{sidebar(true)}</dialog>
  <div className="ds-main">
   <header className="ds-topbar">
    <div className="ds-topbar-leading">
     <button type="button" className="ds-icon-button ds-mobile-trigger" ref={menuTrigger} aria-label={bn?"মেনু খুলুন":"Open menu"} aria-haspopup="dialog" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}><Icon name="menu"/></button>
     {unified?<div className="ds-service-picker"><strong>{workspace.name}</strong></div>:<details className="ds-service-picker" ref={serviceMenu}>
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
     </details>}
     {/* Paused Sandbox/Live picker (restore if public sandbox is revived).
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

     */}
    </div>
    <div className="ds-topbar-tools">
     <button type="button" className="ds-global-search-button" aria-label={bn?"পৃষ্ঠা, ব্যবসা বা পেমেন্ট রেকর্ড খুঁজুন":"Search pages, businesses or payment records"} onClick={()=>{searchReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setSearchOpen(true);setGlobalQuery("");setActiveResult(0);}}><Icon name="search"/><span>{bn?"খুঁজুন":"Search"}</span><kbd>⌘ K</kbd></button>
     <SiteControls locale={locale} initialTheme={theme} compactThemeToggle/>
     <details className="ds-notifications" open={noticeOpen} onToggle={event=>setNoticeOpen(event.currentTarget.open)}>
      <summary className="ds-icon-button" aria-label={bn?"নোটিফিকেশন":"Notifications"}><Icon name="bell"/>{unreadNotifications>0&&<span className="ref-notification-dot"/>}</summary>
      <div className="ref-notification-anchor">{service==="payments"&&paymentContext?<PaymentNotifications key={workspace.id+paymentContext.environment} locale={locale} workspaceId={workspace.id} environment={paymentContext.environment} open={noticeOpen} onUnread={setUnreadNotifications}/>:<p>{bn?"এই সেবার নোটিফিকেশন এখনো সংযুক্ত হয়নি।":"Notifications for this service are not connected yet."}</p>}</div>
     </details>
     <Link className="ds-help-link" href={contextHref("help")} aria-label={bn?"সহায়তা":"Help"}><Icon name="help"/></Link>
     <details className="ds-profile-menu">
      <summary aria-label={bn?"অ্যাকাউন্ট মেনু":"Account menu"} title={userName}><span className="ds-person-avatar">{userName.trim().charAt(0).toUpperCase()||"?"}</span></summary>
      <div className="ds-profile-popover">
       <strong>{userName}</strong>
       <Link href="/account"><Icon name="settings"/>{bn?"অ্যাকাউন্ট সেটিংস":"Account settings"}</Link>
       <Link href={`/w/${workspace.id}/mobile-devices`}><Icon name="devices"/>{bn?"ডিভাইস":"Devices"}</Link>
       {service==="payments"&&<Link href={dashboardHref(locale,workspace.id,"payments","events",environment)}><Icon name="events"/>{bn?"কার্যক্রমের ইতিহাস":"Activity logs"}</Link>}
       {platformAdmin&&<Link href="/admin"><Icon name="shield"/>{bn?"প্ল্যাটফর্ম অ্যাডমিন":"Platform admin"}</Link>}
       {logout}
      </div>
     </details>
    </div>
   </header>
   {/* Paused Sandbox status banner.
   {service==="payments"&&environment==="sandbox"&&<div className="ds-env-banner" role="status">
    <strong>{bn?"Sandbox · আলাদা পরীক্ষার পরিবেশ":"Sandbox · Isolated test environment"}</strong>
    <span>{bn?"এটি পরীক্ষার পরিবেশ। আসল টাকা পাঠাবেন না।":"Test environment only. Do not send real money."}</span>
   </div>}
   */}

   <nav className="ds-breadcrumb" aria-label={bn?"ব্রেডক্রাম্ব":"Breadcrumb"}>{unified?<><Link href="/dashboard">{workspace.name}</Link><Icon name="chevron"/><strong aria-current="page">{unifiedItems.find(item=>pathname===item.href||pathname.startsWith(item.href+"/"))?.[locale]??sections[section][locale]}</strong></>:<><Link href="/workspaces">{workspace.name}</Link><Icon name="chevron"/><Link href={contextHref("overview")}>{serviceNames[service][locale]}</Link><Icon name="chevron"/><strong aria-current="page">{sections[section][locale]}</strong></>}</nav>
   {isNavigating&&<div className="ds-navigation-progress" role="status">{bn?"পৃষ্ঠা খুলছে…":"Opening page…"}</div>}
   <main id="dashboard-content" className="ds-content" tabIndex={-1} aria-busy={isNavigating}>{children}</main>
   <footer className="ds-footnote"><span>{unified?workspace.name:serviceNames[service][locale]+" · "+workspace.name}</span><span>Asia/Dhaka</span></footer>
  </div>
  <dialog ref={searchDialog} className="ds-search-dialog" aria-label={bn?"ওয়ার্কস্পেস খুঁজুন":"Search workspace"} onCancel={()=>setSearchOpen(false)} onClose={()=>setSearchOpen(false)}>
   <div className="ds-search-top"><Icon name="search"/><input ref={searchInput} autoFocus role="combobox" aria-autocomplete="list" aria-expanded={searchOpen} aria-controls="ds-global-results" aria-activedescendant={resultCount?`ds-global-result-${Math.min(activeResult,resultCount-1)}`:undefined} value={globalQuery} onChange={event=>{setGlobalQuery(event.target.value);setActiveResult(0);}} placeholder={bn?"পৃষ্ঠা, পেমেন্ট, ইনভয়েস বা গ্রাহক খুঁজুন…":"Find pages, payments, invoices or customers…"} aria-label={bn?"পৃষ্ঠা বা পেমেন্ট রেকর্ড খুঁজুন":"Find pages or payment records"}
     onKeyDown={event=>{
      if(event.key==="ArrowDown"){event.preventDefault();setActiveResult(i=>resultCount?(i+1)%resultCount:0);}
      if(event.key==="ArrowUp"){event.preventDefault();setActiveResult(i=>resultCount?(i+resultCount-1)%resultCount:0);}
      if(event.key==="Enter"&&resultCount){event.preventDefault();activateSearchResult(Math.min(activeResult,resultCount-1));}
     }}/><button type="button" className="ds-icon-button" onClick={()=>setSearchOpen(false)} aria-label={bn?"বন্ধ করুন":"Close search"}><Icon name="close"/></button></div>
   <div id="ds-global-results" className="ds-search-results" role="listbox" aria-label={bn?"ফলাফল":"Results"}>
    {foundUnified.map((item,index)=><button id={`ds-global-result-${index}`} type="button" role="option" aria-selected={activeResult===index} onMouseEnter={()=>setActiveResult(index)} key={item.key} onClick={()=>{setSearchOpen(false);const next=item.href;if(activeDrafts().length){setBlockedRoute(next);setDraftError("");return;}startTransition(()=>router.push(next));}}><Icon name={item.icon}/><span>{item[locale]}</span></button>)}
    {foundKeys.map((key,index)=><button id={`ds-global-result-${index}`} type="button" role="option" aria-selected={activeResult===index} onMouseEnter={()=>setActiveResult(index)} key={key} onClick={()=>nav(key)}><Icon name={key}/><span>{sections[key][locale]}</span><small>{serviceNames[service][locale]}</small></button>)}
    {foundBusinesses.map((space,index)=>{
     const position=foundKeys.length+foundUnified.length+index;
     return <button id={`ds-global-result-${position}`} type="button" role="option" aria-selected={activeResult===position} onMouseEnter={()=>setActiveResult(position)} key={space.id} onClick={()=>switchBusiness(space)}><Icon name="settings"/><span>{space.name}</span><small>{space.id===workspace.id?(bn?"বর্তমান ব্যবসা":"Current business"):(bn?"ব্যবসা পরিবর্তন":"Switch business")}</small></button>;
    })}
    {!resultCount&&<p role="status">{bn?"মেলা পৃষ্ঠা বা ব্যবসা নেই":"No matching pages or businesses"}</p>}
   </div>
   {service==="payments"&&paymentContext&&<PaymentRecordSearch planFeatures={planFeatures} key={workspace.id+environment} locale={locale} workspaceId={workspace.id} environment={environment} query={globalQuery} open={searchOpen} onNavigate={openPaymentSearchResult}/>}
   {service!=="payments"&&<p className="ds-search-hint">{bn?"শুধু অনুমোদিত পৃষ্ঠা ও ব্যবসা দেখানো হচ্ছে।":"Only authorized pages and businesses appear."}</p>}
  </dialog>
  <dialog ref={draftDialog} className="ds-draft-dialog" aria-label={bn?"সংরক্ষণ না করা পরিবর্তন":"Unsaved changes"} onCancel={event=>{if(draftSaving){event.preventDefault();return;}setBlockedRoute(null);setDraftError("");}}>
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
