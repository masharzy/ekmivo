"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {registerDraft} from "../lib/client/draft-navigation";

export type IntegrationScope={locale:"en"|"bn";workspaceId:string;environment:string;canManage:boolean;canonicalRoutes?:boolean};
export type ActivityRow=Record<string,unknown>&{id:string};
export class IntegrationRequestError extends Error{constructor(public status:number,message:string){super(message);this.name='IntegrationRequestError'}}
export function IntegrationIcon({name}:{name:"code"|"hook"|"activity"|"plug"|"arrow"|"refresh"|"shield"}){
 const paths={code:"m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18",hook:"M4 6a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm10 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM7 9v6a3 3 0 0 0 3 3h4M17 15V9a3 3 0 0 0-3-3h-4",activity:"M3 12h4l3-8 4 16 3-8h4",plug:"M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4",arrow:"M5 12h14m-6-6 6 6-6 6",refresh:"M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6",shield:"m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-6"};
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export function IntegrationNav({scope,active}:{scope:IntegrationScope;active:string}){
 const items=[['developers','Developers','ডেভেলপার','code'],['webhooks','Webhooks','ওয়েবহুক','hook'],['integrations','Integrations','সংযোগ','plug']] as const;
 return <nav className="int-nav" aria-label={scope.locale==="bn"?"ইন্টিগ্রেশন ও ইভেন্ট":"Integrations and events"}>{items.map(([id,en,bn,icon])=><Link key={id} href={integrationHref(scope,id)} aria-current={id===active?"page":undefined}><IntegrationIcon name={icon}/>{scope.locale==="bn"?bn:en}</Link>)}</nav>;
}
export function integrationHref(s:IntegrationScope,section:string,id?:string,tab?:string){
 const p=new URLSearchParams();if(tab)p.set("tab",tab);
 const canonical:Record<string,string>={developers:"/settings/api-keys",webhooks:"/settings/webhooks",events:"/settings/activity",integrations:"/settings/integrations"};
 const base=s.canonicalRoutes&&canonical[section]?canonical[section]:`/${s.locale}/w/${s.workspaceId}/payments/${section}`;
 return `${base}${id?'/'+encodeURIComponent(id):''}${p.size?'?'+p:''}`;
}
// Local view changes keep the application shell and do not trigger a new
// server render/auth/database lookup. Next synchronizes useSearchParams.
export function setIntegrationTab(tab:string){const u=new URL(window.location.href);u.searchParams.delete('env');u.searchParams.set('tab',tab);window.history.replaceState(null,'',u.pathname+u.search);}
export function IntegrationIntro({icon,title,description,children}:{icon:"code"|"hook"|"activity"|"plug";title:string;description:string;children?:ReactNode}){return <div className="int-intro"><span className="int-mark"><IntegrationIcon name={icon}/></span><div><h2>{title}</h2><p>{description}</p></div>{children&&<div className="int-intro-action">{children}</div>}</div>;}
export function IntegrationEmpty({title,description,children}:{title:string;description:string;children?:ReactNode}){return <div className="int-empty"><IntegrationIcon name="plug"/><h3>{title}</h3><p>{description}</p>{children}</div>;}
export function IntegrationSkeleton({locale,kind='cards'}:{locale:"en"|"bn";kind?:'cards'|'events'}){return <div className={kind==='cards'?'int-card-grid int-skeleton':'int-event-list int-skeleton'} role="status" aria-label={locale==='bn'?'তথ্য লোড হচ্ছে':'Loading records'}><span className="sr-only">{locale==='bn'?'তথ্য লোড হচ্ছে…':'Loading records…'}</span>{[1,2,3,4].map(i=><div key={i} className="int-panel" aria-hidden="true"><span/><span/><span/></div>)}</div>;}
export function IntegrationStatus({value,locale}:{value:string;locale:"en"|"bn"}){
 const labels:Record<string,[string,string]>={active:['Enabled','চালু'],disabled:['Disabled','বন্ধ'],configured:['Configured','সেটিং সংরক্ষিত'],pending:['Queued','অপেক্ষমাণ'],sending:['Sending','পাঠানো হচ্ছে'],delivered:['Delivered','পৌঁছেছে'],failed:['Failed','ব্যর্থ'],transport_unknown:['Outcome unknown','ফলাফল অনিশ্চিত'],expired:['Expired','মেয়াদ শেষ'],read:['Read','পড়া হয়েছে'],unread:['Unread','অপঠিত']};
 return <span className={`int-status int-status-${value}`}>{labels[value]?.[locale==='bn'?1:0]||value}</span>;
}
export function integrationDate(value:unknown,locale:string){if(!value)return "—";const d=new Date(String(value));return Number.isNaN(d.valueOf())?"—":new Intl.DateTimeFormat(locale==='bn'?'bn-BD':'en-BD',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dhaka'}).format(d);}
export function CopyValue({value,label,locale}:{value:string;label?:string;locale:"en"|"bn"}){const [state,setState]=useState('');return <span className="int-copy"><code>{value}</code><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(value);setState(locale==='bn'?'কপি হয়েছে':'Copied')}catch{setState(locale==='bn'?'কপি হয়নি; লেখাটি নির্বাচন করুন':'Copy failed; select the text')}}}>{label||(locale==='bn'?'কপি':'Copy')}</button><small role="status">{state}</small></span>;}
export function useIntegrationTransport(scope:IntegrationScope){
 const [online,setOnline]=useState(true);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[]);
 const request=useCallback(async(path:string,body?:unknown,signal?:AbortSignal)=>{
  const url=new URL(`/api/go/workspaces/${scope.workspaceId}/${path}`,window.location.origin);url.searchParams.set('environment',scope.environment);
  const r=await fetch(url,{cache:'no-store',method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const bn=scope.locale==='bn';const message=r.status===401?(bn?'সেশনের মেয়াদ শেষ। আবার সাইন ইন করুন।':'Session expired. Sign in again.'):r.status===403?(bn?'এই কাজের অনুমতি নেই। মালিক বা অ্যাডমিনের সঙ্গে যোগাযোগ করুন।':'Access denied. Contact the owner or admin.'):r.status===503?(bn?'সেবা পাওয়া যাচ্ছে না। আবার চেষ্টা করুন; এটি শূন্য তথ্য নয়।':'Service unavailable. Retry; this is not an empty result.'):r.status===409?(bn?'সেটিং বদলে গেছে বা কাজটি ইতিমধ্যে চলছে। রিফ্রেশ করে দেখুন।':'State changed or action already in progress.'):r.status===422||r.status===400?(bn?'দেওয়া তথ্য যাচাই করুন। HTTPS ঠিকানা ও প্রয়োজনীয় ঘরগুলো সঠিক হতে হবে।':'Check your inputs, HTTPS URL and required fields.'):r.status===404?(bn?'রেকর্ড পাওয়া যায়নি বা এই ব্যবসার নয়।':'Record not found or outside this business.'):r.status===429?(bn?'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।':'Too many requests. Try again shortly.'):(bn?'কাজ নিশ্চিত হয়নি। পুনরায় পাঠানোর আগে রিফ্রেশ করুন।':'Action unconfirmed. Refresh before retrying.');throw new IntegrationRequestError(r.status,message+(d?.error?.correlation_id?` (${d.error.correlation_id})`:''));}
  if(body===undefined&&/^(operations\/(webhooks|events|deliveries)|integrations|activity|notifications)/.test(path)&&!Array.isArray(d?.items))throw new IntegrationRequestError(503,scope.locale==='bn'?'সার্ভারের উত্তর সঠিক নয়। রিফ্রেশ করুন।':'Invalid service response. Refresh to retry.');
  return d;
 },[scope.workspaceId,scope.environment,scope.locale]);
 return {request,online};
}
export function useIntegrationDraft(id:string,dirty:boolean,save:()=>Promise<boolean>,discard:()=>void){const current=useRef({dirty,save,discard});useEffect(()=>{current.current={dirty,save,discard}});useEffect(()=>registerDraft({id,isDirty:()=>current.current.dirty,save:()=>current.current.save(),discard:()=>current.current.discard()}),[id]);useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(current.current.dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[]);}
export function IntegrationFeedback({error,notice,online,locale}:{error:string;notice?:string;online:boolean;locale:"en"|"bn"}){return <>{!online&&<p className="int-feedback" role="status">{locale==='bn'?'আপনি অফলাইন। তথ্য পুরোনো হতে পারে; পরিবর্তন বন্ধ আছে।':'You are offline. Data may be stale; changes are disabled.'}</p>}{error&&<p className="int-feedback int-error" role="alert">{error}</p>}{notice&&<p data-feedback="success" className="int-feedback" role="status">{notice}</p>}</>;}
