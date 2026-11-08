"use client";
import {useEffect,useState,type ReactNode} from "react";
import s from "./inbox.module.css";
export function Sheet({open,onClose,children,label}:{open:boolean;onClose:()=>void;children:ReactNode;label:string}){
 const [mounted,setMounted]=useState(open),[shown,setShown]=useState(false);
 useEffect(()=>{
  if(open){const a=setTimeout(()=>{setMounted(true);requestAnimationFrame(()=>requestAnimationFrame(()=>setShown(true)));},0);return()=>clearTimeout(a);}
  const a=setTimeout(()=>setShown(false),0),b=setTimeout(()=>setMounted(false),320);return()=>{clearTimeout(a);clearTimeout(b);};
 },[open]);
 useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",k);return()=>window.removeEventListener("keydown",k);},[open,onClose]);
 if(!mounted)return null;
 return <div className={`${s.ov} ${shown?s.show:""}`} role="dialog" aria-modal="true" aria-label={label}><div className={s.bk} onClick={onClose}/><div className={s.sheet}>{children}</div></div>;
}
