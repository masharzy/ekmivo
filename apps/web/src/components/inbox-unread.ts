"use client";
import {useEffect,useState} from "react";

export const INBOX_UNREAD_EVENT="briofold:inbox-unread";
export function announceInboxUnread(total:number){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(INBOX_UNREAD_EVENT,{detail:total}));}

const PREFIX=/^\(\d+\+?\)\s/;
/** Polls unread totals for the sidebar badge and prefixes the browser tab title: "(3) Inbox · Briofold". */
export function useInboxUnread(workspaceId:string,enabled:boolean,pathname:string){
 const [total,setTotal]=useState(0);
 useEffect(()=>{
  if(!enabled)return;let alive=true,busy=false;
  const onEvent=(e:Event)=>{const n=(e as CustomEvent<number>).detail;if(alive&&typeof n==="number")setTotal(n);};
  window.addEventListener(INBOX_UNREAD_EVENT,onEvent);
  async function poll(){
   if(busy||document.visibilityState==="hidden"||!navigator.onLine)return;busy=true;
   try{
    const r=await fetch(`/api/go/workspaces/${workspaceId}/inbox?environment=live`,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({action:"list",filters:{q:"",offset:0,queue:"all",channel:"",from_date:"",through_date:"",label:""}})});
    if(!r.ok)return;const j=await r.json() as {items?:{unread?:number}[]};
    const n=(j.items??[]).reduce((a,x)=>a+(Number(x.unread)||0),0);if(alive)setTotal(n);
   }catch{}finally{busy=false;}
  }
  // Skip the first poll while the Inbox itself is open: it announces its own totals every 2 s.
  const first=setTimeout(()=>{if(!pathname.startsWith("/inbox"))void poll();},0);
  const iv=setInterval(()=>{if(!pathname.startsWith("/inbox"))void poll();},20000);
  const vis=()=>{if(document.visibilityState==="visible"&&!pathname.startsWith("/inbox"))void poll();};
  document.addEventListener("visibilitychange",vis);
  return()=>{alive=false;clearTimeout(first);clearInterval(iv);window.removeEventListener(INBOX_UNREAD_EVENT,onEvent);document.removeEventListener("visibilitychange",vis);};
 },[workspaceId,enabled,pathname]);
 useEffect(()=>{
  const apply=()=>{const base=document.title.replace(PREFIX,"");const want=enabled&&total>0?`(${total>99?"99+":total}) ${base}`:base;if(document.title!==want)document.title=want;};
  apply();
  const el=document.querySelector("title");if(!el)return;
  const mo=new MutationObserver(apply);mo.observe(el,{childList:true,characterData:true,subtree:true});
  return()=>{mo.disconnect();document.title=document.title.replace(PREFIX,"");};
 },[total,enabled,pathname]);
 return enabled?total:0;
}
