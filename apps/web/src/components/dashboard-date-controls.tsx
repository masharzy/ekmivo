"use client";
import {useEffect,useRef,useState} from "react";
type Locale="bn"|"en";
const parse=(s:string)=>{if(!/^\d{4}-\d\d-\d\d$/.test(s))return null;const [y,m,d]=s.split("-").map(Number);const v=new Date(y,m-1,d);return v.getFullYear()===y&&v.getMonth()===m-1&&v.getDate()===d?v:null};
const dateISO=(v:Date)=>[v.getFullYear(),String(v.getMonth()+1).padStart(2,"0"),String(v.getDate()).padStart(2,"0")].join("-");
const dateText=(v:string,locale:Locale)=>{const d=parse(v);return d?new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{day:"numeric",month:"short",year:"numeric"}).format(d):"—"};
function Month({locale,month,from,to,min,move,select}:{locale:Locale;month:Date;from?:string;to?:string;min?:string;move:(n:number)=>void;select:(v:string)=>void}){
 const year=month.getFullYear(),idx=month.getMonth(),start=new Date(year,idx,1).getDay(),days=new Date(year,idx+1,0).getDate();
 return <div className="ek-cal-month"><div className="ek-cal-head"><button type="button" aria-label="Previous month" onClick={()=>move(-1)}>‹</button><strong>{new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{month:"long",year:"numeric"}).format(month)}</strong><button type="button" aria-label="Next month" onClick={()=>move(1)}>›</button></div>
 <div className="ek-cal-grid">{Array.from({length:7},(_,i)=><span className="ek-cal-day-name" key={i}>{new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-GB",{weekday:"short"}).format(new Date(2024,0,7+i))}</span>)}{Array.from({length:start},(_,i)=><span key={"blank"+i}/>)}
 {Array.from({length:days},(_,i)=>{const value=dateISO(new Date(year,idx,i+1));return <button type="button" key={value} aria-label={dateText(value,locale)} aria-pressed={value===from||value===to} className={value===from||value===to?"ek-cal-selected":from&&to&&value>from&&value<to?"ek-cal-between":""} disabled={!!min&&value<min} onClick={()=>select(value)}>{new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-GB").format(i+1)}</button>})}</div></div>;
}
function useCalendarClose(ref:React.RefObject<HTMLDivElement|null>,open:boolean,close:()=>void){
 useEffect(()=>{if(!open)return;const pointer=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close()};const key=(e:KeyboardEvent)=>{if(e.key==="Escape")close()};document.addEventListener("pointerdown",pointer);document.addEventListener("keydown",key);return()=>{document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",key)}},[open,ref,close]);
}
export function DashboardDatePicker({locale,value,onChange,min,label}:{locale:Locale;value:string;onChange:(date:string)=>void;min?:string;label?:string}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(()=>{const d=parse(value)||new Date();return new Date(d.getFullYear(),d.getMonth(),1)});const ref=useRef<HTMLDivElement>(null);useCalendarClose(ref,open,()=>setOpen(false));
 return <div className="ek-cal-root" ref={ref}><button type="button" className="ek-cal-trigger" aria-label={label||"Date"} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>{value?dateText(value,locale):locale==="bn"?"তারিখ বাছুন":"Pick date"}</span><span aria-hidden="true">▦</span></button>{open&&<div className="ek-cal-popover" role="group" aria-label={label||"Calendar"}><Month month={month} locale={locale} from={value} min={min} move={n=>setMonth(m=>new Date(m.getFullYear(),m.getMonth()+n,1))} select={d=>{onChange(d);setOpen(false)}}/></div>}</div>;
}
export function DashboardDateTimePicker({locale,value,onChange,min,label}:{locale:Locale;value:string;onChange:(s:string)=>void;min?:string;label?:string}){
 const d=value.slice(0,10),tm=value.length>=16?value.slice(11,16):"09:00",[h,m]=tm.split(":");
 return <div className="ek-cal-datetime"><DashboardDatePicker locale={locale} value={d} min={min} label={label} onChange={next=>onChange(next+"T"+tm)}/><select aria-label="Hour" value={h} onChange={e=>onChange((d||dateISO(new Date()))+"T"+e.target.value+":"+m)}>{Array.from({length:24},(_,i)=>{const v=String(i).padStart(2,"0");return <option value={v} key={v}>{v}</option>})}</select><span>:</span><select aria-label="Minute" value={m} onChange={e=>onChange((d||dateISO(new Date()))+"T"+h+":"+e.target.value)}>{Array.from({length:60},(_,i)=>{const v=String(i).padStart(2,"0");return <option value={v} key={v}>{v}</option>})}</select></div>;
}
export function DashboardDateRangePicker({locale,from,to,onChange}:{locale:Locale;from:string;to:string;onChange:(start:string,end:string)=>void}){
 const [open,setOpen]=useState(false),[month,setMonth]=useState(()=>{const d=parse(from)||new Date();return new Date(d.getFullYear(),d.getMonth(),1)});const ref=useRef<HTMLDivElement>(null);useCalendarClose(ref,open,()=>setOpen(false));const move=(n:number)=>setMonth(d=>new Date(d.getFullYear(),d.getMonth()+n,1));
 const select=(v:string)=>{if(!from||to||v<from)onChange(v,"");else{onChange(from,v);setOpen(false)}};
 return <div className="ek-cal-root ek-cal-range" ref={ref}><button type="button" className="ek-cal-trigger" aria-expanded={open} aria-label="Date range" onClick={()=>setOpen(v=>!v)}><span>{dateText(from,locale)} — {to?dateText(to,locale):locale==="bn"?"শেষ তারিখ":"End date"}</span><span aria-hidden="true">▦</span></button>{open&&<div className="ek-cal-popover ek-cal-wide" role="group" aria-label="Select date range"><p>{locale==="bn"?"শুরু এবং শেষের তারিখ বাছুন":"Choose start and end dates"}</p><div className="ek-cal-months"><Month locale={locale} month={month} from={from} to={to} move={move} select={select}/><Month locale={locale} month={new Date(month.getFullYear(),month.getMonth()+1,1)} from={from} to={to} move={move} select={select}/></div></div>}</div>;
}
export function DashboardSwitch({checked,onChange,label}:{checked:boolean;onChange:(checked:boolean)=>void;label:string}){
 return <button type="button" role="switch" className="ek-dashboard-switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}><span/></button>;
}
