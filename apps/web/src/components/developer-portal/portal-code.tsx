"use client";
import {useState} from "react";
import {usePortal} from "./portal-shell";
type Variant={id:"curl"|"node"|"python"|"php"|"json"|"http";label:string;code:string;html:string};
export function PortalCode({variants,label}:{variants:Variant[];label?:string}){
 const {language,setLanguage,notify,locale}=usePortal(),[copied,setCopied]=useState(false);
 const selected=variants.find(v=>v.id===language)||variants[0];
 async function copy(){try{await navigator.clipboard.writeText(selected.code);setCopied(true);notify(locale==="bn"?"কপি হয়েছে":"Copied");setTimeout(()=>setCopied(false),1400)}catch{notify(locale==="bn"?"কপি করা যায়নি":"Could not copy")}}
 return <div className="dp-code"><div className="dp-code-tabs">{variants.length>1?<div role="group" aria-label={locale==="bn"?"কোডের ভাষা":"Code language"}>{variants.map(v=><button type="button" key={v.id} aria-pressed={selected.id===v.id} onClick={()=>setLanguage(v.id as "curl"|"node"|"python"|"php")}>{v.label}</button>)}</div>:<span>{label||selected.label}</span>}<button type="button" onClick={()=>void copy()} aria-label={locale==="bn"?"কোড কপি করুন":"Copy code"}>{copied?(locale==="bn"?"কপি হয়েছে":"Copied"):<><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg><span>{locale==="bn"?"কপি":"Copy"}</span></>}</button></div><div className="dp-code-scroll" tabIndex={0} role="region" aria-label={label||selected.label} dangerouslySetInnerHTML={{__html:selected.html}}/></div>;
}
