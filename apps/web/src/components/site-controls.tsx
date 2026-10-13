"use client";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";

type Theme="system"|"light"|"dark";
export function SiteControls({locale,initialTheme}:{locale:"bn"|"en";initialTheme:Theme}){
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
  window.location.assign(href);
 }
 return <div className="ek-public-controls">
  <button type="button" className="ek-language-switch" onClick={toggleLocale} lang={locale==="bn"?"en":"bn"} aria-label={locale==="bn"?"Switch to English":"বাংলা ভাষায় দেখুন"}>
   <span aria-hidden="true">◎</span> {locale==="bn"?"English":"বাংলা"}
  </button>
  <label className="ek-theme-control">
   <span className="sr-only">Theme</span>
   <select value={theme} aria-label="Theme" onChange={e=>changeTheme(e.target.value as Theme)}>
    <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
   </select>
   <svg className="ek-theme-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </label>
 </div>;
}
