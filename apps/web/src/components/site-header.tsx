"use client";

import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {SiteControls} from "./site-controls";
import {siteCopy,type Locale} from "../lib/site-copy";

type Theme="system"|"light"|"dark";
const pages=[
 {path:"payment-gateway",en:"Payment Gateway",bn:"Payment Gateway"},
 {path:"ai-bot",en:"AI Bot",bn:"AI Bot"},
 {path:"pricing",en:"Pricing",bn:"Pricing"},
 {path:"developers",en:"Developers",bn:"Developers"}
] as const;

export function SiteHeader({locale,initialTheme}:{locale:Locale;initialTheme:Theme}){
 const t=siteCopy[locale];
 const pathname=usePathname();
 const [scrolled,setScrolled]=useState(false);
 const [hidden,setHidden]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const lastY=useRef(0);
 const keepVisibleAfterAnchor=useRef(false);

 useEffect(()=>{
  lastY.current=window.scrollY;
  const onScroll=()=>{
   const y=window.scrollY,delta=y-lastY.current;
   setScrolled(y>36);
   if(y<72||menuOpen||keepVisibleAfterAnchor.current)setHidden(false);
   else if(delta>6&&y>168)setHidden(true);
   else if(delta< -6)setHidden(false);
   lastY.current=y;
  };
  const release=()=>{keepVisibleAfterAnchor.current=false};
  const onAnchor=()=>{if(window.location.hash){keepVisibleAfterAnchor.current=true;setHidden(false)}};
  const onKey=(event:KeyboardEvent)=>{
   if(["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," "].includes(event.key)&&
     !(event.target instanceof HTMLElement&&event.target.closest("input,textarea,select,[contenteditable='true']")))release();
  };
  onAnchor();
  onScroll();
  window.addEventListener("scroll",onScroll,{passive:true});
  window.addEventListener("hashchange",onAnchor);
  window.addEventListener("wheel",release,{passive:true});
  window.addEventListener("touchmove",release,{passive:true});
  window.addEventListener("keydown",onKey);
  return ()=>{
   window.removeEventListener("scroll",onScroll);
   window.removeEventListener("hashchange",onAnchor);
   window.removeEventListener("wheel",release);
   window.removeEventListener("touchmove",release);
   window.removeEventListener("keydown",onKey);
  };
 },[menuOpen]);

 function closeMenu(){setMenuOpen(false);setHidden(false)}
 return <header className={`site-header ek-public-header${scrolled?" is-wide":""}${hidden?" is-hidden":""}${menuOpen?" menu-open":""}`}>
  <div className="header-inner">
   <Link className="brand" href={`/${locale}`} aria-label="Ekmivo home" onClick={closeMenu}>
    <span className="brand-mark" aria-hidden="true"><span/></span><span>ekmivo<span className="brand-dot">.</span></span>
   </Link>
   <nav id="ek-public-navigation" className={`header-nav${menuOpen?" open":""}`} aria-label={locale==="bn"?"মূল মেনু":"Main navigation"}>
    {pages.map(page=><Link key={page.path} aria-current={pathname===`/${locale}/${page.path}`?"page":undefined} href={`/${locale}/${page.path}`} onClick={closeMenu}>{page[locale]}</Link>)}
   </nav>
   <div className="header-right">
    <SiteControls locale={locale} initialTheme={initialTheme}/>
    <Link className="header-cta ek-signin" href={`/${locale}/login`} onClick={closeMenu}>{t.login}<span aria-hidden="true">↗</span></Link>
    <button className="menu-toggle" type="button" aria-label={menuOpen?t.closeMenu:t.menu} aria-controls="ek-public-navigation" aria-expanded={menuOpen} onClick={()=>setMenuOpen(x=>!x)}><span/><span/></button>
   </div>
  </div>
 </header>;
}
