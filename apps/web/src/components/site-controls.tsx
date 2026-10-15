"use client";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";

type Theme="system"|"light"|"dark";
export function SiteControls({locale,initialTheme,compactThemeToggle=false}:{locale:"bn"|"en";initialTheme:Theme;compactThemeToggle?:boolean}){
 const pathname=usePathname();
 const [theme,setTheme]=useState<Theme>(initialTheme);
 useEffect(()=>{
  const onStorage=(event:StorageEvent)=>{
   if(event.key!=="ekmivo-theme-preference")return;
   const next=event.newValue==="light"||event.newValue==="dark"?event.newValue:"system";
   setTheme(next);
   if(next==="system")document.documentElement.removeAttribute("data-theme");
   else document.documentElement.dataset.theme=next;
   document.cookie=`ekmivo-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };
  window.addEventListener("storage",onStorage);
  return ()=>window.removeEventListener("storage",onStorage);
 },[]);
 function changeTheme(next:Theme){
  setTheme(next);
  if(next==="system")document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme=next;
  document.cookie=`ekmivo-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try{localStorage.setItem("ekmivo-theme-preference",next)}catch{/*cookie remains authoritative*/}
 }
 function toggleCompactTheme(){
  // The rendered document and OS preference, not stale navigation props, decide the next mode.
  const explicit=document.documentElement.getAttribute("data-theme");
  const isDark=explicit==="dark"||(explicit!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  changeTheme(isDark?"light":"dark");
 }
 useEffect(()=>{
  // Language is an explicit user preference, never rewrite the cookie from
  // an old/suspended dashboard render during client-side navigation.
  document.documentElement.lang=locale;
 },[locale]);
 function toggleLocale(){
  const next=locale==="bn"?"en":"bn";
  const href=(pathname.replace(/^\/(bn|en)(?=\/|$)/,"")||"/")+window.location.search+window.location.hash;
  const guard=new CustomEvent("ekmivo:guarded-navigation",{cancelable:true,detail:{href}});
  if(!window.dispatchEvent(guard))return;
  document.cookie=`ekmivo-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  // A reload is intentional: the server chooses the new locale from the cookie
  // without changing the visible URL or retaining stale RSC route params.
  // Assigning the same URL with an anchor can be a fragment-only navigation,
  // which leaves the server-rendered guide in the previous language.
  window.location.reload();
 }
 return <div className="ek-public-controls">
  <button type="button" className="ek-language-switch" onClick={toggleLocale} lang={locale==="bn"?"en":"bn"} aria-label={locale==="bn"?"Switch to English":"বাংলা ভাষায় দেখুন"}>
   <span aria-hidden="true">◎</span> {locale==="bn"?"English":"বাংলা"}
  </button>
  {compactThemeToggle?<button type="button" className="ek-dashboard-theme-button" onClick={toggleCompactTheme}
   aria-label={locale==="bn"?"ডার্ক ও লাইট মোড পরিবর্তন করুন":"Toggle dark and light mode"}
   title={locale==="bn"?"ডার্ক/লাইট মোড":"Dark/Light mode"}>
   <svg className="ek-theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>
   <svg className="ek-theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  </button>:<label className="ek-theme-control">
   <span className="sr-only">Theme</span>
   <select value={theme} aria-label="Theme" onChange={e=>changeTheme(e.target.value as Theme)}>
    <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
   </select>
   <svg className="ek-theme-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </label>}
 </div>;
}
