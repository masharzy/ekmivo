"use client";
import {useEffect,useRef,useState} from "react";
type Option={value:string;label:string;description?:string};
export function DashboardCombobox({label,placeholder,query,selectedValue,selectedLabel,options,onQueryChange,onChange,locale}:{
 label:string;placeholder:string;query:string;selectedValue:string;selectedLabel?:string;options:Option[];onQueryChange:(v:string)=>void;onChange:(v:string)=>void;locale:"bn"|"en"
}){
 const [open,setOpen]=useState(false),[active,setActive]=useState(0);
 const ref=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{const dismiss=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss)},[]);
 const filtered=options.filter(o=>!query||o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())||o.value===selectedValue).slice(0,15);
 const selected=options.find(o=>o.value===selectedValue);
 const choose=(o:Option)=>{onChange(o.value);onQueryChange(o.label);setOpen(false);setActive(0)};
 return <div className="ek-combobox" ref={ref}>
  <label>{label}<input ref={input} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls="ek-customer-combo-list" aria-activedescendant={open&&filtered[active]?"ek-combo-"+active:undefined} autoComplete="off" value={query||(selected?.label||selectedLabel||"")} placeholder={placeholder} onFocus={()=>setOpen(true)} onChange={e=>{onChange("");onQueryChange(e.target.value);setActive(0);setOpen(true)}} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,filtered.length-1))}if(e.key==="ArrowUp"){e.preventDefault();setActive(i=>Math.max(0,i-1))}if(e.key==="Enter"&&open&&filtered[active]){e.preventDefault();choose(filtered[active])}if(e.key==="Escape")setOpen(false)}}/></label>
  {open&&<div id="ek-customer-combo-list" role="listbox" className="ek-combobox-list">{selectedValue&&<button type="button" onClick={()=>{onChange("");onQueryChange("");input.current?.focus()}}>{locale==="bn"?"নির্বাচন সরান":"Clear selection"}</button>}{filtered.length?filtered.map((item,index)=><button id={"ek-combo-"+index} role="option" aria-selected={item.value===selectedValue} type="button" key={item.value} className={active===index?"is-active":""} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}><span>{item.label}</span>{item.description&&<small>{item.description}</small>}</button>):<p>{locale==="bn"?"গ্রাহক পাওয়া যায়নি":"No customers found"}</p>}</div>}
 </div>;
}
export function DashboardTagInput({tags,onChange,locale}:{tags:string[];onChange:(tags:string[])=>void;locale:"bn"|"en"}){
 const [text,setText]=useState("");
 const add=(v:string)=>{const name=v.trim();if(name&&!tags.includes(name))onChange([...tags,name]);setText("")};
 return <div className="ek-tags-input"><div className="ek-tag-chips">{tags.map(tag=><span key={tag}>{tag}<button type="button" aria-label={locale==="bn"?tag+" সরান":"Remove "+tag} onClick={()=>onChange(tags.filter(t=>t!==tag))}>×</button></span>)}</div><input aria-label={locale==="bn"?"ট্যাগ":"Tags"} value={text} placeholder={locale==="bn"?"ট্যাগ লিখুন, Enter চাপুন":"Type a tag and press Enter"} onChange={e=>{if(e.target.value.includes(",")){add(e.target.value.replace(/,/g,""))}else setText(e.target.value)}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();add(text)}else if(e.key==="Backspace"&&!text&&tags.length)onChange(tags.slice(0,-1))}}/></div>;
}
