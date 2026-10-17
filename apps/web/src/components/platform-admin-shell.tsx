"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useEffect,useMemo,useRef,useState,useTransition,type ReactNode} from "react";
import {logoutAction} from "../actions/account";

export type AdminLocale="en"|"bn";
const groups=[
 {group:"Platform",items:[["Overview","","home"],["Workspaces","workspaces","grid"],["Users","users","users"]]},
 {group:"Payment gateway",items:[["Payments","payments","wallet"],["Payment workspaces","payments/workspaces","grid"],["Providers","gateway/providers","plug"],["Receipt devices","gateway/devices","phone"],["Webhooks & jobs","gateway/webhooks","workflow"]]},
 {group:"AI Bot",items:[["AI workspaces","ai","bot"],["Models & usage","ai/models-usage","pulse"],["Conversations","ai/conversations","history"],["Safety","ai/safety","shield"],["Handover","ai/handover","users"]]},
 {group:"Commercial",items:[["Billing","billing","receipt"],["Invoices","billing/invoices","receipt"],["API credits","credits","coins"],["Plans","plans","layers"]]},
 {group:"Developers",items:[["API keys","api","code"],["Sandbox","api/sandbox","code"],["Rate limits","api/limits","pulse"],["API versions","api/versions","layers"]]},
 {group:"System",items:[["Health","health","pulse"],["Staff & security","staff","shield"],["Audit log","audit","history"],["Support tickets","support","users"],["Privacy requests","privacy","shield"],["Settings","settings","settings"]]}
] as const;
const bnNames:Record<string,string>={
 Overview:"ওভারভিউ",Workspaces:"ওয়ার্কস্পেস",Users:"ব্যবহারকারী",Payments:"পেমেন্ট","Payment workspaces":"পেমেন্ট ওয়ার্কস্পেস",
 Providers:"প্রোভাইডার","Receipt devices":"রিসিপ্ট ডিভাইস","Webhooks & jobs":"ওয়েবহুক ও জব",
 "AI workspaces":"এআই ওয়ার্কস্পেস","Models & usage":"মডেল ও ব্যবহার",Conversations:"কথোপকথন",Safety:"নিরাপত্তা",Handover:"হ্যান্ডওভার",
 Billing:"বিলিং",Invoices:"ইনভয়েস","API credits":"এপিআই ক্রেডিট",Plans:"প্ল্যান","API keys":"এপিআই কী",Sandbox:"স্যান্ডবক্স","Rate limits":"রেট লিমিট","API versions":"এপিআই ভার্সন",
 Health:"সিস্টেমের অবস্থা","Staff & security":"স্টাফ ও নিরাপত্তা","Audit log":"অডিট লগ","Support tickets":"সাপোর্ট টিকিট","Privacy requests":"প্রাইভেসি রিকোয়েস্ট",Settings:"সেটিংস",
 Platform:"প্ল্যাটফর্ম","Payment gateway":"পেমেন্ট গেটওয়ে","AI Bot":"এআই বট",Commercial:"বাণিজ্যিক",Developers:"ডেভেলপার",System:"সিস্টেম"
};
const iconPaths:Record<string,string>={
 search:"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M17 17l5 5",
 home:"M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
 grid:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
 users:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
 wallet:"M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h15V7H5a3 3 0 0 1 0-6 M16 12h6v5h-6z",
 receipt:"M4 2h16v20l-4-2-4 2-4-2-4 2z M8 7h8 M8 11h8 M8 15h4",
 coins:"M12 8c5 0 9-1.3 9-3s-4-3-9-3-9 1.3-9 3 4 3 9 3z M3 5v5c0 2 4 4 9 4s9-2 9-4V5 M3 11v6c0 2 4 4 9 4s9-2 9-4v-6",
 layers:"m12 2 9 5-9 5-9-5 9-5z m-9 9 9 5 9-5 M3 16l9 5 9-5",
 plug:"M12 22v-7 M8 2v6 M16 2v6 M7 8h10v3a5 5 0 0 1-10 0z",
 phone:"M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M10 18h4",
 workflow:"M5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 8v10h12 M10 6h9v10",
 bot:"M12 3v3 M8 3h8 M4 9h16v11H4z M8 13h.01 M16 13h.01 M8 17h8",
 code:"m8 7-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
 pulse:"M2 12h5l3-7 4 14 3-7h5",
 shield:"M12 2 3 6v6c0 6 4 9 9 10 5-1 9-4 9-10V6z M9 12l2 2 4-4",
 history:"M3 3v6h6 M3 9a9 9 0 1 1 0 6 M12 7v5l4 2",
 settings:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.9l-2 2a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V22h-3v-1.8a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-2-2A1.7 1.7 0 0 0 6 15a1.7 1.7 0 0 0-1.6-1H3v-3h1.4A1.7 1.7 0 0 0 6 10a1.7 1.7 0 0 0-.3-1.9l2-2a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h3v1.8a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l2 2A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.6 1H22v3h-1a1.7 1.7 0 0 0-1.6 1z"
};
export function AdminIcon({name}:{name:string}){return <svg width="16" height="16" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]||iconPaths.grid}/></svg>;}
export function AdminShell({locale,role,name,theme,children,production=false}:{locale:AdminLocale;role:string;name:string;theme:"light"|"dark"|"system";children:ReactNode;production?:boolean}){
 const pathname=usePathname(),router=useRouter(),[pending,startTransition]=useTransition();
 const [mobile,setMobile]=useState(false),[search,setSearch]=useState(false),[term,setTerm]=useState(""),[mode,setMode]=useState(theme);
 const queryRef=useRef<HTMLInputElement>(null),isBn=locale==="bn";
 const [entities,setEntities]=useState<Array<{id:string;kind:string;label:string;path:string}>>([]);
 const [entitySearching,setEntitySearching]=useState(false);
 const root="/"+locale+"/admin";
 const active=(path:string)=>pathname===root+(path?"/"+path:"")||!!path&&pathname.startsWith(root+"/"+path+"/");
 const nav=useMemo(()=>groups.flatMap(g=>g.items.map(item=>({name:item[0],path:item[1],icon:item[2]}))),[]);
 const options=nav.filter(item=>(item.name+" "+(bnNames[item.name]||"")).toLowerCase().includes(term.trim().toLowerCase())).slice(0,16);
 const go=(path:string)=>{setMobile(false);setSearch(false);setTerm("");setEntities([]);setEntitySearching(false);startTransition(()=>router.push(path));};
 useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearch(s=>!s);}if(event.key==="Escape")setSearch(false);};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[]);
 useEffect(()=>{if(search)queryRef.current?.focus();},[search]);
 useEffect(()=>{
  if(!search||role!=="super_admin"||term.trim().length<2)return;
  const abort=new AbortController();const timer=setTimeout(()=>{
   void fetch("/"+locale+"/admin/search?q="+encodeURIComponent(term.trim().slice(0,80)),{cache:"no-store",credentials:"same-origin",signal:abort.signal})
    .then(async r=>{if(!r.ok)throw Error(String(r.status));return r.json()})
    .then(data=>{if(!abort.signal.aborted){setEntities(Array.isArray(data.items)?data.items.filter((v:unknown)=>!!v&&typeof v==="object"&&"path" in v&&"label" in v).slice(0,16):[]);setEntitySearching(false)}})
    .catch(()=>{if(!abort.signal.aborted){setEntities([]);setEntitySearching(false)}});
  },180);
  return ()=>{clearTimeout(timer);abort.abort()};
 },[search,role,term,locale]);

 useEffect(()=>{document.cookie="ekmivo-admin-theme="+mode+";path=/;max-age=31536000;samesite=lax";},[mode]);
 const goLocale=(next:AdminLocale)=>{if(next!==locale)go(pathname.replace(/^\/(en|bn)(?=\/)/,"/"+next));};
 const jump=(path:string)=>go(root+(path?"/"+path:""));
 return <div className={"pa-root pa-admin-design"+(production?" pa-production":"")} data-admin-theme={mode} lang={locale}>
  <div className={"pa-route-progress"+(pending?" is-visible":"")} aria-hidden="true"/>
  <header className="pa-topbar">
   <button type="button" className="pa-icon-button pa-mobile-toggle" aria-label={isBn?"মেনু খুলুন":"Open navigation"} onClick={()=>setMobile(true)}><AdminIcon name="grid"/></button>
   <Link href={root} className="pa-brand" onClick={e=>{e.preventDefault();jump("");}}>ekmivo<span className="pa-admin-tag">Admin</span></Link>
   <button className="pa-search-launch" type="button" onClick={()=>setSearch(true)}><AdminIcon name="search"/><span>{isBn?"যেকোনো পেজে যান":"Search pages"}</span><kbd>⌘ K</kbd></button>
   <div className="pa-topbar-end">
    <span className="pa-environment"><span className="pa-status-dot green"/>{isBn?"লাইভ":"Live"}</span>
    <label className="pa-sr-only" htmlFor="pa-language">{isBn?"ভাষা":"Language"}</label>
    <select id="pa-language" className="pa-toolbar-select" value={locale} onChange={e=>goLocale(e.target.value as AdminLocale)}><option value="en">EN</option><option value="bn">বাং</option></select>
    <label className="pa-sr-only" htmlFor="pa-theme">{isBn?"থিম":"Theme"}</label>
    <select id="pa-theme" className="pa-toolbar-select" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="system">{isBn?"সিস্টেম":"System"}</option><option value="light">{isBn?"লাইট":"Light"}</option><option value="dark">{isBn?"ডার্ক":"Dark"}</option></select>
    <details className="pa-account-menu"><summary aria-label={isBn?"প্রোফাইল মেনু":"Account menu"}><span className="pa-person-dot"/></summary><div className="pa-account-popover"><strong>{name}</strong><span>{role.replaceAll("_"," ")}</span><Link href={root+"/security"}>{isBn?"আমার নিরাপত্তা":"My security"}</Link><Link href={"/"+locale+"/workspaces"}>{isBn?"মার্চেন্ট ড্যাশবোর্ড":"Merchant dashboard"}</Link><form action={logoutAction.bind(null,locale)}><button type="submit">{isBn?"সাইন আউট":"Sign out"}</button></form></div></details>
   </div>
  </header>
  {mobile&&<button className="pa-mobile-backdrop" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}
  <div className="pa-layout"><aside className={"pa-sidebar"+(mobile?" is-open":"")} aria-label="Admin navigation">
   <Link href={root} className="pa-sidebar-brand" onClick={e=>{e.preventDefault();jump("");}}><span className="pa-sidebar-brand-mark">e</span>Ekmivo</Link><nav>{groups.map(group=><section key={group.group} className="pa-nav-group"><h2>{isBn?bnNames[group.group]:group.group}</h2>{group.items.map(item=>{const path=item[1];return <Link key={path} href={root+(path?"/"+path:"")} prefetch onMouseEnter={()=>router.prefetch(root+(path?"/"+path:""))} onClick={e=>{e.preventDefault();jump(path);}} className={"pa-nav-link"+(active(path)?" is-active":"")} aria-current={active(path)?"page":undefined}><AdminIcon name={item[2]}/><span>{isBn?bnNames[item[0]]:item[0]}</span></Link>})}</section>)}</nav>
  </aside><main id="main" className="pa-main"><div className="pa-content">{children}</div></main></div>
  {search&&<div className="pa-palette-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSearch(false);}}><div className="pa-palette" role="dialog" aria-modal="true" aria-label={isBn?"দ্রুত খুঁজুন":"Quick navigation"}><div className="pa-palette-input"><AdminIcon name="search"/><input ref={queryRef} placeholder={isBn?"পেজের নাম লিখুন":"Search admin pages"} value={term} onChange={e=>{setTerm(e.target.value);setEntities([]);setEntitySearching(e.target.value.trim().length>=2)}} onKeyDown={e=>{if(e.key==="Enter"){if(options[0])jump(options[0].path);else if(entities[0])jump(entities[0].path);}}}/><button type="button" onClick={()=>setSearch(false)} aria-label="Close">Esc</button></div><div className="pa-palette-results">{options.map(item=><button key={item.path} onClick={()=>jump(item.path)}><AdminIcon name={item.icon}/><span>{isBn?bnNames[item.name]:item.name}</span></button>)}{role==="super_admin"&&term.trim().length>=2&&<><span className="pa-palette-section">{isBn?"ওয়ার্কস্পেস ও ব্যবহারকারী":"Workspaces & users"}</span>{entities.map(item=><button key={item.kind+item.id} onClick={()=>jump(item.path)}><AdminIcon name={item.kind==="workspace"?"grid":"users"}/><span>{item.label}<small>{item.kind} · {item.id.slice(0,8)}</small></span></button>)}</>}{!options.length&&!entities.length&&!entitySearching&&<p>{isBn?"কোনো ফল পাওয়া যায়নি":"No matching pages or records"}</p>}</div></div></div>}
 </div>;
}
