"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../../lib/client/draft-navigation";

export type Profile={id?:string;revision:number;name:string;email?:string;phone?:string;notes?:string;reason?:string;tags:string[];stage:string;temperature:string;assignee:string|null;assigned?:boolean;preferences?:{marketing:string;do_not_contact:boolean};merged_into?:string;deleted_at?:string};
export type Followup={id:string;due_at:string;time_zone:string;body:string;status:string;kind?:"reminder"|"offer";requested_due_at?:string;quiet_start?:string|null;quiet_end?:string|null};
export type Detail={customer:Profile;archives?:{id:string;name:string;email:string;phone:string;notes:string;tags:string[]}[];sources:{id:string;kind:string;source_id:string}[];proofs:{id:string;kind:string;value:string;verified_at:string;revoked_at:string|null}[];followups:Followup[];events:{sequence:number;action:string;created_at:string}[];can_manage:boolean;can_contact:boolean;can_export:boolean};
export type CRMList={members:{id:string;name:string}[];items:Profile[];can_manage:boolean;can_contact:boolean;can_export:boolean};
export type OrderRow={id:string;reference:string;status:string;source:string;total_minor:number;created_at:string;summary:string;claimed_payment:{method?:string;payer_phone?:string;trx_id?:string};paid_verified:boolean;payment_state?:string};
export type CustomerOrders={orders:OrderRow[];numbers:{value:string;count:number}[];
 stats?:{orders:number;total_minor:number;last_at:string|null;delivered:number;cancelled:number;returned:number};
 risk?:{level:"none"|"medium"|"high";reasons:string[]};channels?:string[];
 products?:{name:string;sku:string;quantity:number;orders:number;last_at:string}[];merge_suggestions?:{id:string;name:string}[]};
export type Stat={orders:number;total_minor:number;last_at:string|null};
export const STAGES=["new","contacted","qualified","proposal","won","lost"] as const;
export const blankProfile:Profile={revision:0,name:"",tags:[],stage:"new",temperature:"warm",assignee:null};
type Pending={fp:string;key:string;action:string;body:object;time:number};
export type Filters={q:string;filter:string;source:string;priority:string;assignee:string;offset:number};

/**
 * Data layer for every Customers screen. The backend requires an operation key
 * per write and an unconfirmed-write recovery path, so that protocol lives here
 * once instead of in each screen.
 */
export function useCrm({workspaceId,actorId,environment,initial,bn,initialFilter="",ordersEnabled=false}:{workspaceId:string;actorId:string;environment:"live"|"sandbox";initial:CRMList|null;bn:boolean;initialFilter?:string;ordersEnabled?:boolean}){
 const t=useCallback((en:string,be:string)=>bn?be:en,[bn]);
 const [data,setData]=useState<CRMList|null>(initial),[detail,setDetail]=useState<Detail|null>(null),[draft,setDraft]=useState<Profile|null>(null),[baseline,setBaseline]=useState("");
 const [f,setF]=useState<Filters>({q:"",filter:initialFilter,source:"",priority:"",assignee:"",offset:0});
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(!initial),[error,setError]=useState(""),[message,setMessage]=useState(""),[unconfirmed,setUnconfirmed]=useState(false),[tab,setTab]=useState<"profile"|"orders"|"followups"|"activity">("profile");
 const pending=useRef<Pending|null>(null),lock=useRef(false),seq=useRef(0),first=useRef(true);
 const dirty=draft!==null&&JSON.stringify(draft)!==baseline;
 const endpoint=`/api/go/workspaces/${workspaceId}/crm?environment=${environment}`;
 const storageKey=`crm-operation:${actorId}:${workspaceId}:${environment}`;
 const request=useCallback(async(id?:string,page=0,signal?:AbortSignal,filters?:Filters)=>{
  const x=filters??f;
  const url=endpoint+"&"+new URLSearchParams(id?{customer:id,cursor:String(page)}:{q:x.q,filter:x.filter,source:x.source,priority:x.priority,assignee:x.assignee,cursor:String(x.offset)});
  const r=await fetch(url,{cache:"no-store",signal});
  if(!r.ok){if([401,403,409].includes(r.status)){setData(null);setDetail(null);setDraft(null);}throw Error(String(r.status));}
  return r.json();
 },[endpoint,f]);
 // List reads follow the filters; the first render uses the server snapshot.
 useEffect(()=>{
  if(first.current){first.current=false;if(initial)return;}
  const c=new AbortController();
  const timer=setTimeout(()=>{setLoading(true);void request(undefined,0,c.signal).then(v=>{if(!c.signal.aborted){setData(v);setError("");}}).catch(()=>{if(!c.signal.aborted)setError(t("Customers could not be loaded. Try Refresh.","গ্রাহকের তালিকা আনা যায়নি। রিফ্রেশ করুন।"));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});},f.q?250:0);
  return()=>{c.abort();clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[f.q,f.filter,f.source,f.priority,f.assignee,f.offset,endpoint]);
 // Order count, total and last order for the rows on screen (chat orders carry the customer link).
 const [stats,setStats]=useState<Record<string,Stat>>({});
 useEffect(()=>{
  if(!ordersEnabled||!data||data.items.length===0)return;
  const ids=data.items.slice(0,50).map(c=>c.id).filter(Boolean).join(",");
  const c=new AbortController();
  void fetch(endpoint+"&view=stats&ids="+ids,{cache:"no-store",signal:c.signal}).then(r=>r.ok?r.json():{}).then(v=>{if(!c.signal.aborted)setStats(v as Record<string,Stat>);}).catch(()=>{});
  return()=>c.abort();
 },[data,ordersEnabled,endpoint]);
 const loadOrders=useCallback(async(id:string):Promise<CustomerOrders|null>=>{
  try{const r=await fetch(endpoint+"&view=profile&customer="+id,{cache:"no-store"});return r.ok?await r.json():null;}catch{return null;}
 },[endpoint]);
 const set=useCallback((patch:Partial<Filters>)=>setF(x=>({...x,offset:0,...patch})),[]);
 const refresh=useCallback(async()=>{setLoading(true);try{setData(await request());setError("");}catch{setError(t("Refresh failed.","রিফ্রেশ হয়নি।"));}finally{setLoading(false);}},[request,t]);
 const open=useCallback(async(id:string,page=0,nextTab?:"profile"|"orders"|"followups"|"activity")=>{
  const n=++seq.current;
  try{const v:Detail=await request(id,page);if(n!==seq.current)return;setDetail(v);if(nextTab)setTab(nextTab);else if(page===0)setTab("profile");setDraft(v.customer);setBaseline(JSON.stringify(v.customer));setError("");}
  catch{setError(t("This customer could not be opened.","গ্রাহকের তথ্য খোলা যায়নি।"));}
 },[request,t]);
 const startNew=useCallback((can_contact:boolean)=>{setDetail(null);setTab("profile");setDraft({...blankProfile,...(can_contact?{email:"",phone:"",notes:"",reason:"",preferences:{marketing:"unknown",do_not_contact:false}}:{})});setBaseline("");},[]);
 const close=useCallback(()=>{if(dirty&&!window.confirm(t("Discard your unsaved changes?","সংরক্ষণ না করা পরিবর্তন বাতিল করবেন?")))return false;pending.current=null;setUnconfirmed(false);setDraft(null);setDetail(null);setBaseline("");setTab("profile");return true;},[dirty,t]);
 const command=useCallback(async(action:string,body:object)=>{
  if(lock.current)return null;lock.current=true;setBusy(true);setError("");setMessage("");
  const fp=JSON.stringify([environment,action,body]);
  if(pending.current&&pending.current.fp!==fp){setError(t("Retry the unfinished action first.","আগের অসম্পূর্ণ কাজটি আগে আবার চেষ্টা করুন।"));lock.current=false;setBusy(false);return null;}
  if(!pending.current)pending.current={fp,key:crypto.randomUUID(),action,body,time:Date.now()};
  setUnconfirmed(true);try{sessionStorage.setItem(storageKey,JSON.stringify(pending.current));}catch{/* the beforeunload guard still protects this tab */}
  try{
   const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,operation_key:pending.current.key,body})});
   if(!r.ok){if(![502,503,504].includes(r.status)){pending.current=null;setUnconfirmed(false);try{sessionStorage.removeItem(storageKey);}catch{}}throw Error(String(r.status));}
   const value=await r.json();pending.current=null;setUnconfirmed(false);try{sessionStorage.removeItem(storageKey);}catch{}
   setMessage(t("Saved.","সংরক্ষিত হয়েছে।"));
   try{setData(await request());}catch{setError(t("Saved, but the list could not refresh. Try Refresh.","সংরক্ষণ হয়েছে; তালিকা রিফ্রেশ হয়নি। রিফ্রেশ করুন।"));}
   return value as {id?:string;revision?:number;status?:string;next_cursor?:string|null;imported?:number};
  }catch(e){
   const code=e instanceof Error?e.message:"";
   setError(code==="409"?t("This customer changed elsewhere. Discard your edits and reopen.","গ্রাহকের তথ্য অন্যত্র বদলেছে। লেখা বাতিল করে আবার খুলুন।"):code==="403"?t("You do not have permission for this action.","এই কাজের অনুমতি নেই।"):t("Not confirmed. Check the fields and retry the same action.","কাজটি নিশ্চিত হয়নি। তথ্য দেখে একই কাজ আবার চেষ্টা করুন।"));
   if(["401","403"].includes(code)){setDetail(null);setDraft(null);setData(null);}
   return null;
  }finally{setBusy(false);lock.current=false;}
 },[endpoint,environment,request,storageKey,t]);
 // Recover an unfinished write after a reload (same rules as before: 30 min, strict shape, no masked fields).
 useEffect(()=>{const timer=setTimeout(()=>{try{const text=sessionStorage.getItem(storageKey);if(!text||text.length>24000)return;const v:Pending=JSON.parse(text);if(!initial?.can_manage||typeof v.key!=="string"||!/^[0-9a-f-]{36}$/.test(v.key)||typeof v.body!=="object"||!v.body||typeof v.action!=="string"||Date.now()-v.time>1800000||v.fp!==JSON.stringify([environment,v.action,v.body])){sessionStorage.removeItem(storageKey);return;}if(!initial.can_contact&&["email","phone","notes","preferences","reason"].some(k=>k in v.body)){sessionStorage.removeItem(storageKey);return;}pending.current=v;setUnconfirmed(true);setMessage(t("An unfinished action was recovered. Retry it before editing.","অসম্পূর্ণ কাজ পাওয়া গেছে। সম্পাদনার আগে আবার চেষ্টা করুন।"));}catch{try{sessionStorage.removeItem(storageKey);}catch{}}},0);return()=>clearTimeout(timer);},[storageKey,environment,initial,t]);
 const retry=useCallback(async()=>{const v=pending.current;if(!v)return;const r=await command(v.action,v.body);if(r?.id)await open(r.id);},[command,open]);
 const update=useCallback(<K extends keyof Profile>(key:K,value:Profile[K])=>{if(!unconfirmed)setDraft(d=>d?{...d,[key]:value}:d);},[unconfirmed]);
 const strip=useCallback((p:Profile)=>{const b={...p};if(!data?.can_contact){delete b.email;delete b.phone;delete b.notes;delete b.reason;delete b.preferences;}return b;},[data]);
 const save=useCallback(async()=>{if(!draft)return true;const body=strip(draft);const r=await command("save",body);if(!r?.id)return false;await open(r.id);return true;},[draft,strip,command,open]);
 const moveStage=useCallback(async(p:Profile,stage:string)=>{if(p.stage===stage)return;await command("save",{...strip(p),stage});},[command,strip]);
 const act=useCallback(async(name:string,body:object)=>{if(!detail)return null;const r=await command(name,{id:detail.customer.id,revision:detail.customer.revision,...body});if(r?.id)await open(r.id,0,tab);return r;},[detail,command,open,tab]);
 useEffect(()=>registerDraft({id:`crm:${actorId}:${workspaceId}`,isDirty:()=>dirty,save,discard:()=>{setDraft(detail?.customer??null);setBaseline(JSON.stringify(detail?.customer??null));}}),[actorId,workspaceId,dirty,save,detail]);
 useEffect(()=>{const leave=(e:BeforeUnloadEvent)=>{if(dirty||pending.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 return {t,bn,data,setData,detail,draft,dirty,f,set,loading,busy,error,setError,message,setMessage,unconfirmed,tab,setTab,endpoint,refresh,open,close,startNew,command,retry,update,save,moveStage,act,request,stats,loadOrders,ordersEnabled};
}
export function initials(name:string){const p=name.trim().split(/\s+/).filter(Boolean);return ((p[0]?.[0]??"?")+(p.length>1?p[p.length-1][0]:"")).toUpperCase();}
export const stageText=(s:string,bn:boolean)=>bn?({new:"নতুন",contacted:"যোগাযোগ হয়েছে",qualified:"যোগ্য",proposal:"প্রস্তাব",won:"কিনেছেন",lost:"হারানো"} as Record<string,string>)[s]??s:({new:"New",contacted:"Contacted",qualified:"Qualified",proposal:"Proposal",won:"Bought",lost:"Lost"} as Record<string,string>)[s]??s;
export const stageClass=(s:string)=>`int-status${s==="won"?" int-status-active":s==="lost"?" int-status-failed":s==="qualified"||s==="proposal"?" int-status-pending":s==="contacted"?" int-status-sending":""}`;
export const tempText=(s:string,bn:boolean)=>bn?({hot:"হট",warm:"ওয়ার্ম",cold:"কোল্ড"} as Record<string,string>)[s]??s:s[0].toUpperCase()+s.slice(1);
