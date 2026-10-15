"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
const sectionIds=["create-checkout","request-fields","payment-status","authentication","api-keys","webhooks","custom-verification","sandbox","errors"];
export function DocsNavigation({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn",[open,setOpen]=useState(false),[active,setActive]=useState("create-checkout"),[query,setQuery]=useState("");
 const groups=[
  {label:bn?"পেমেন্ট API":"Payment API",items:[["create-checkout",bn?"পেমেন্ট তৈরি":"Create payment"],["request-fields",bn?"Request body":"Request fields"],["payment-status",bn?"পেমেন্ট যাচাই":"Verify payment"],["authentication",bn?"Authentication":"Preferred auth"],["api-keys",bn?"API key সংগ্রহ":"Get API keys"]]},
  {label:bn?"অতিরিক্ত":"Integration",items:[["webhooks",bn?"ওয়েবহুক":"Webhooks"],["custom-verification",bn?"নিজের Checkout":"Custom checkout"]]},
  {label:bn?"পরীক্ষা":"Testing",items:[["sandbox","Sandbox"],["errors",bn?"সমস্যার সমাধান":"Errors"]]}
 ];
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)setActive(entry.target.id)},{rootMargin:"-110px 0px -65% 0px",threshold:0});for(const id of sectionIds){const el=document.getElementById(id);if(el)observer.observe(el)}return()=>observer.disconnect()},[]);
 return <aside className={`ek-doc-sidebar${open?" is-open":""}`}><button type="button" className="ek-doc-menu" aria-expanded={open} aria-controls="docs-topic-navigation" onClick={()=>setOpen(!open)}>{bn?"বিষয়গুলো":"Browse topics"}<span aria-hidden="true">{open?"−":"+"}</span></button><nav id="docs-topic-navigation" aria-label="Documentation topics"><label className="ek-doc-search"><span className="sr-only">Search topics</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={bn?"বিষয় খুঁজুন…":"Search topics…"}/></label>{groups.map(group=><div key={group.label}><strong>{group.label}</strong>{group.items.filter(([id,label])=>(id+label).toLowerCase().includes(query.toLowerCase())).map(([id,label])=><a key={id} href={`#${id}`} aria-current={active===id?"location":undefined} onClick={()=>setOpen(false)}>{label}</a>)}</div>)}<Link href="/workspaces">{bn?"আমার API keys":"My API keys"} ↗</Link><a href="/api/payment-contract" download="ekmivo-openapi.json">Download OpenAPI ↓</a></nav></aside>;
}