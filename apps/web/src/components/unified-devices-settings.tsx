"use client";
import type {ReactNode} from "react";
import {useState} from "react";
import styles from "./unified-devices-settings.module.css";

export function UnifiedDevicesSettings({locale,smsDevices,aiDevices}:{
 locale:"en"|"bn";smsDevices:ReactNode;aiDevices:ReactNode;
}){
 const [active,setActive]=useState<"sms"|"ai">("sms");
 const bn=locale==="bn";
 const tabs=[
  {id:"sms" as const,en:"Payment SMS devices",bn:"পেমেন্ট SMS ডিভাইস"},
  {id:"ai" as const,en:"Inbox devices",bn:"ইনবক্স ডিভাইস"}
 ];
 return <section className={styles.root} aria-label={bn?"ডিভাইস পরিচালনা":"Device management"}>
  <div role="tablist" aria-label={bn?"ডিভাইসের ধরন":"Device type"} className={styles.tabs}>
   {tabs.map(tab=><button key={tab.id} type="button" role="tab" id={"device-tab-"+tab.id}
    aria-selected={active===tab.id} aria-controls={"device-panel-"+tab.id}
    tabIndex={active===tab.id?0:-1}
    onClick={()=>setActive(tab.id)}
    onKeyDown={event=>{
     if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
     event.preventDefault();
     const next=event.key==="Home"?"sms":event.key==="End"?"ai":active==="sms"?"ai":"sms";
     setActive(next);document.getElementById("device-tab-"+next)?.focus();
    }}>{tab[locale]}</button>)}
  </div>
  <div role="tabpanel" id={"device-panel-"+active} aria-labelledby={"device-tab-"+active}>
   {active==="sms"?smsDevices:aiDevices}
  </div>
 </section>;
}
