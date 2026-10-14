"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
export function DocsNavigation({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn",[open,setOpen]=useState(false),[active,setActive]=useState("overview"),[query,setQuery]=useState("");
 const groups=[
  {label:bn?"শুরু করুন":"Get started",items:[["overview",bn?"সংক্ষিপ্ত পরিচিতি":"Overview"],["authentication",bn?"API key":"API keys"]]},
  {label:bn?"পেমেন্ট API":"Payment API",items:[["create-checkout",bn?"পেমেন্ট তৈরি":"Create payment"],["request-fields",bn?"ফিল্ড ও প্যারামিটার":"Request fields"],["checkout-flow",bn?"চেকআউট URL":"Checkout URL"],["payment-status",bn?"পেমেন্ট যাচাই":"Verify payment"],["webhooks",bn?"ওয়েবহুক":"Webhooks"]]},
  {label:bn?"নিজের Checkout":"Custom checkout",items:[["custom-verification",bn?"✨ নিজের UI-তে যাচাই":"✨ Custom verification"]]},
  {label:bn?"পরীক্ষা ও Reference":"Testing & reference",items:[["sandbox",bn?"Sandbox পরীক্ষা":"Sandbox"],["errors",bn?"সমস্যা ও সমাধান":"Errors"],["api-reference",bn?"সব Endpoints":"All endpoints"]]},
 ];
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)setActive(entry.target.id)},{rootMargin:"-110px 0px -65% 0px",threshold:0});for(const id of ["overview","authentication","create-checkout","request-fields","checkout-flow","payment-status","webhooks","custom-verification","sandbox","errors","api-reference"]){const el=document.getElementById(id);if(el)observer.observe(el)}return()=>observer.disconnect()},[]);
 return <aside className={`ek-doc-sidebar${open?" is-open":""}`}><button type="button" className="ek-doc-menu" aria-expanded={open} aria-controls="docs-topic-navigation" onClick={()=>setOpen(!open)}>{bn?"বিষয়গুলো":"Browse topics"}<span aria-hidden="true">{open?"−":"+"}</span></button><nav id="docs-topic-navigation" aria-label={bn?"API নির্দেশনার বিষয়গুলো":"API documentation topics"}><label className="ek-doc-search"><span className="sr-only">{bn?"বিষয় খুঁজুন":"Search topics"}</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={bn?"বিষয় খুঁজুন…":"Search topics…"}/></label>{groups.map(group=><div key={group.label}><strong>{group.label}</strong>{group.items.filter(([id,label])=>(id+label).toLowerCase().includes(query.toLowerCase())).map(([id,label])=><a key={id} href={`#${id}`} aria-current={active===id?"location":undefined} onClick={()=>setOpen(false)}>{label}</a>)}</div>)}<Link href={`/${locale}/developers`}>{bn?"ডেভেলপারদের জন্য Ekmivo":"Developer overview"} ↗</Link><a href="/api/payment-contract" download="ekmivo-openapi.json">{bn?"OpenAPI ডাউনলোড":"Download OpenAPI"} ↓</a></nav></aside>;
}
