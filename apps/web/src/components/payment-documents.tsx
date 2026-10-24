"use client";
import {ExportUpgradeLink} from "./plan-feature-upgrade";
import {planLimitMessage} from "../lib/plan-resource-limits";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {paymentLinkState} from "./payment-link-cards";
import {RefModal,RefIcon,RefStatus,RefSwitch} from "./reference-ui";
import {DashboardDateTimePicker,DashboardDatePicker} from "./dashboard-date-controls";
import {DashboardCombobox,DashboardTagInput} from "./dashboard-form-controls";
import {unifiedFinancialDetailPath} from "../lib/unified-navigation";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
type Kind="customers"|"invoices"|"payment-links";
type Line={title:string;quantity:number;unit_amount_minor:number};
type Field={id:string;label:string;type:string;required:boolean;options:string[]};
type Body={source?:string;payment_count?:number;verified_minor?:number;last_payment_at?:string;max_quantity:number;image_url:string;return_url:string;customer_id:string;reference:string;name:string;email:string;phone:string;description:string;notes:string;private_notes:string;amount_minor:number;items:Line[];tax_minor:number;fee_minor:number;shipping_minor:number;discount_minor:number;max_uses:number;expires_at:string;due_at:string;fields:Field[];tags:string[]};
type RecordRow={id:string;reference:string;status:string;version:number;body:Partial<Body>;amount_minor:number;paid_minor:number;public_token?:string;payments:{intent_id:string;state:string}[];history:{version:number;status:string;occurred_at:string}[]};
const empty=():Body=>({max_quantity:1,image_url:"",return_url:"",customer_id:"",reference:"",name:"",email:"",phone:"",description:"",notes:"",private_notes:"",amount_minor:0,items:[{title:"",quantity:1,unit_amount_minor:0}],tax_minor:0,fee_minor:0,shipping_minor:0,discount_minor:0,max_uses:0,expires_at:"",due_at:"",fields:[],tags:[]});
type DocumentAction='archive'|'cancel'|'delete'|'disable'|'publish'|'send'|'remind';
function DocumentActions({row,kind,canWrite,canManage,busy,t,onEdit:edit,onDuplicate:duplicateLink,onConfirm:setConfirming,onAction:action,onCopy:copy,publicPath}:{row:RecordRow;kind:Kind;canWrite:boolean;canManage:boolean;busy:boolean;t:(en:string,bn:string)=>string;onEdit:(row:RecordRow)=>Promise<void>;onDuplicate:(row:RecordRow)=>Promise<void>;onConfirm:(value:{mode:DocumentAction;row:RecordRow})=>void;onAction:(row:RecordRow,action:string)=>Promise<boolean>;onCopy:(value:string)=>Promise<void>;publicPath:(row:RecordRow)=>string}){const isLinks=kind==='payment-links';return <>
  {!row.body.source&&canWrite&&(kind==="customers"||["draft","issued"].includes(row.status)||isLinks&&!["archived","deleted"].includes(row.status))&&<button className="ib" disabled={busy} onClick={()=>void edit(row)}>{t("Edit","পরিবর্তন")}</button>}
  {isLinks&&canWrite&&!['archived','deleted'].includes(row.status)&&<><button className="ib" disabled={busy} onClick={()=>void duplicateLink(row)}>{t("Duplicate","ডুপ্লিকেট")}</button><button className="ib" disabled={busy} onClick={()=>setConfirming({mode:row.status==='active'?'disable':'publish',row})}>{row.status==='active'?t("Disable","বন্ধ করুন"):t("Enable","চালু করুন")}</button><button className="ib" disabled={busy} onClick={()=>setConfirming({mode:"archive",row})}>{t("Archive","আর্কাইভ")}</button></>}
  {isLinks&&canWrite&&row.status!=='deleted'&&<button className="ib dg" disabled={busy} onClick={()=>setConfirming({mode:"delete",row})}>{t("Delete","মুছুন")}</button>}
  {kind==="invoices"&&canWrite&&row.status==="draft"&&<button className="ib pri" disabled={busy} onClick={()=>void action(row,"issue")}>{t("Issue invoice","ইনভয়েস ইস্যু")}</button>}
  {kind==="invoices"&&canManage&&row.status==="issued"&&<><button className="ib" disabled={busy} onClick={()=>setConfirming({mode:"send",row})}>{t("Send invoice","ইনভয়েস পাঠান")}</button><button className="ib" disabled={busy} onClick={()=>setConfirming({mode:"remind",row})}>{t("Send reminder","রিমাইন্ডার পাঠান")}</button></>}
  {kind==="invoices"&&canWrite&&["draft","issued"].includes(row.status)&&<button className="ib dg" disabled={busy||row.paid_minor>0} onClick={()=>setConfirming({mode:"cancel",row})}>{t("Cancel invoice","ইনভয়েস বাতিল")}</button>}
  {row.public_token&&["active","issued"].includes(row.status)&&<><Link className="ib" href={publicPath(row)} target="_blank">{t("Open checkout","চেকআউট খুলুন")}</Link><button className="ib" onClick={()=>void copy(location.origin+publicPath(row))}>{t("Copy link","লিংক কপি")}</button></>}
  {kind==="invoices"&&row.public_token&&<Link className="ib" href={publicPath(row)+"?print=1"} target="_blank" rel="noopener noreferrer">{t("Print","প্রিন্ট")}</Link>}
 </>}

export function PaymentDocuments({kind,workspaceId,environment,locale,userId,canWrite,canManage,detailId,canExport,canInvoices=false,canonicalRoutes=false}:{kind:Kind;workspaceId:string;environment:string;locale:"en"|"bn";userId:string;canWrite:boolean;canManage:boolean;detailId?:string;canExport?:boolean;canInvoices?:boolean;canonicalRoutes?:boolean}){
 const [expiryMode,setExpiryMode]=useState<"none"|"24"|"7"|"custom">("none");
 const [hideNumbers,setHideNumbers]=useState(true);
 const bn=locale==="bn",t=useCallback((en:string,bnText:string)=>bn?bnText:en,[bn]),base=`/api/go/workspaces/${workspaceId}/documents/${kind}`;
 const [preferenceBusy,setPreferenceBusy]=useState(false);
 useEffect(()=>{if(kind!=="customers")return;const abort=new AbortController();void fetch(`/api/workspaces/${workspaceId}/preferences`,{cache:"no-store",signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(!abort.signal.aborted)setHideNumbers(!canManage||d.hide_customer_numbers)}).catch(()=>{});return()=>abort.abort()},[kind,workspaceId,canManage]);
 async function toggleNumbers(value:boolean){setPreferenceBusy(true);try{const response=await fetch(`/api/workspaces/${workspaceId}/preferences`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({hide_customer_numbers:value})});if(!response.ok)throw Error();const d=await response.json();setHideNumbers(!canManage||d.hide_customer_numbers)}catch{setError(t("Number visibility could not be saved. Retry.","নম্বর দেখানোর সেটিংস সংরক্ষণ হয়নি। আবার চেষ্টা করুন।"))}finally{setPreferenceBusy(false)}}

 const formatPhone=(value:string)=>{const digits=value.replace(/\D/g,"");const local=digits.startsWith("880")?digits.slice(3):digits.startsWith("0")?digits.slice(1):digits;const last=local.slice(-4);return hideNumbers||!canManage?"+880 1••• ••"+last:local.length===10?"+880 "+local.slice(0,4)+" "+local.slice(4):value};
 const seed=useDashboardInitialData<{items:RecordRow[];next_cursor:string|null;delivery:typeof delivery;activity:{invoices:typeof activity}}>("documents");
 const initialLoad=useRef(Boolean(seed));
 const [now,setNow]=useState(seed?.at??0);
 useEffect(()=>{const tick=()=>setNow(Date.now());const first=setTimeout(tick,0),timer=setInterval(tick,30000);return()=>{clearTimeout(first);clearInterval(timer)}},[]);
 const [linkFilter,setLinkFilter]=useState("all");
 const [documentFilter,setDocumentFilter]=useState("all");



 const isLinks=kind==="payment-links";
 const [invoiceLinks,setInvoiceLinks]=useState<RecordRow[]>([]),[invoiceLinksError,setInvoiceLinksError]=useState("");
 const [invoiceLinksCursor,setInvoiceLinksCursor]=useState<string|null>(null),[invoiceLinksLoading,setInvoiceLinksLoading]=useState(false),[invoiceLinksRefresh,setInvoiceLinksRefresh]=useState(0);
 const invoiceMoreRequest=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(!isLinks||!canInvoices)return;
  const abort=new AbortController();
  invoiceMoreRequest.current?.abort();invoiceMoreRequest.current=null;
  const loadInvoices=async()=>{
   setInvoiceLinksLoading(true);setInvoiceLinksError("");
   try{
    const response=await fetch(`/api/go/workspaces/${workspaceId}/documents/invoices?environment=${encodeURIComponent(environment)}`,{cache:"no-store",credentials:"same-origin",signal:abort.signal});
    if(!response.ok)throw Error(String(response.status));
    const data=await response.json();
    if(!abort.signal.aborted){setInvoiceLinks(Array.isArray(data.items)?data.items.filter((row:RecordRow)=>row.public_token&&["issued","cancelled"].includes(row.status)):[]);setInvoiceLinksCursor(data.next_cursor??null)}
   }catch{if(!abort.signal.aborted)setInvoiceLinksError(t("Invoice-linked payments are temporarily unavailable.","ইনভয়েসের পেমেন্ট লিংক এখন পাওয়া যাচ্ছে না।"))}
   finally{if(!abort.signal.aborted)setInvoiceLinksLoading(false)}
  };
  queueMicrotask(()=>{if(!abort.signal.aborted){setInvoiceLinks([]);setInvoiceLinksCursor(null);void loadInvoices()}});
  return()=>{abort.abort();invoiceMoreRequest.current?.abort()};
 },[isLinks,canInvoices,workspaceId,environment,invoiceLinksRefresh,t]);
 const loadMoreInvoiceLinks=async()=>{
  if(!isLinks||!invoiceLinksCursor||invoiceLinksLoading)return;
  const controller=new AbortController();invoiceMoreRequest.current=controller;
  setInvoiceLinksLoading(true);setInvoiceLinksError("");
  try{
   const query=new URLSearchParams({environment,cursor:invoiceLinksCursor});
   const response=await fetch(`/api/go/workspaces/${workspaceId}/documents/invoices?${query}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
   if(!response.ok)throw Error(String(response.status));
   const data=await response.json();
   setInvoiceLinks(old=>[...old,...(Array.isArray(data.items)?data.items.filter((row:RecordRow)=>row.public_token&&["issued","cancelled"].includes(row.status)&&!old.some(existing=>existing.id===row.id)):[])]);
   setInvoiceLinksCursor(data.next_cursor??null);
  }catch{if(!controller.signal.aborted)setInvoiceLinksError(t("Could not load more invoice links.","আরও ইনভয়েস লিংক লোড করা যায়নি।"))}
  finally{if(invoiceMoreRequest.current===controller){invoiceMoreRequest.current=null;setInvoiceLinksLoading(false)}}
 };
 const [customerSearch,setCustomerSearch]=useState("");const [customerError,setCustomerError]=useState("");
 const [activity,setActivity]=useState<{id:string;reference:string;status:string;amount_minor:number;paid_minor:number}[]>([]);
 const [delivery,setDelivery]=useState<{id:string;kind:string;status:string;created_at:string}[]>([]);
 const [rows,setRows]=useState<RecordRow[]>(seed?.data?.items??[]),[loading,setLoading]=useState(!seed),[error,setError]=useState(seed?.error??""),[search,setSearch]=useState(""),[cursor,setCursor]=useState<string|null>(seed?.data?.next_cursor??null),[busy,setBusy]=useState(false),[editing,setEditing]=useState<RecordRow|null|undefined>(undefined),[body,setBody]=useState<Body>(empty),[csv,setCsv]=useState(""),[preview,setPreview]=useState<{valid_count:number;errors:{row:number;code:string}[]}|null>(null),[message,setMessage]=useState(""),[customers,setCustomers]=useState<{id:string;body:{name:string}}[]>([]);
 const visibleRows=isLinks?rows.filter(row=>linkFilter==="all"||paymentLinkState(row,now)===linkFilter):rows.filter(row=>documentFilter==="all"||documentFilter==="checkout"&&Boolean(row.body.source)||documentFilter==="manual"&&!row.body.source||documentFilter==="paid"&&row.amount_minor>0&&row.status!=="draft"&&row.paid_minor>=row.amount_minor||documentFilter==="unpaid"&&row.status==="issued"&&row.paid_minor<row.amount_minor||row.status===documentFilter);
 const exportAbort=useRef<AbortController|null>(null);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(""),3000);return()=>clearTimeout(timer)},[message]);
 useEffect(()=>()=>exportAbort.current?.abort(),[]);
 const editorRef=useRef<HTMLFormElement|null>(null);

 const [importOpen,setImportOpen]=useState(false);

 const createFromLinkHandled=useRef(false);
 useEffect(()=>{
  if(!isLinks||!canWrite||createFromLinkHandled.current)return;
  const url=new URL(window.location.href);
  if(url.searchParams.get("create")!=="1")return;
  const timer=setTimeout(()=>{
   createFromLinkHandled.current=true;
   url.searchParams.delete("create");
   window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
   setBody(empty());
   setEditing(null);
  },0);
  return()=>clearTimeout(timer);
 },[isLinks,canWrite]);

  const [selectedDocument,setSelectedDocument]=useState<RecordRow|null>(null);
  const [confirming,setConfirming]=useState<{mode:"archive"|"cancel"|"delete"|"disable"|"publish"|"send"|"remind";row:RecordRow}|null>(null);
  const detailRequest=useRef<AbortController|null>(null);
  const closeDocument=()=>{detailRequest.current?.abort();detailRequest.current=null;setSelectedDocument(null)};
  const openDocument=(row:RecordRow)=>{


   detailRequest.current?.abort();
   setSelectedDocument(row);

   // The listing is intentionally compact. Reload one authorized record to
   // include the latest available payer phone and document details.
   const controller=new AbortController();
   detailRequest.current=controller;
   void fetch(`${base}/${row.id}?environment=${encodeURIComponent(environment)}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal})
    .then(async response=>{if(!response.ok)throw Error("DETAILS_UNAVAILABLE");return response.json()})
    .then(data=>{if(!controller.signal.aborted){const fresh=data?.items?.[0] as RecordRow|undefined;if(fresh?.id===row.id)setSelectedDocument(fresh)}})
    .catch(()=>{if(!controller.signal.aborted)setError(t("Record details could not be refreshed. Retry.","রেকর্ডের বিস্তারিত হালনাগাদ হয়নি। আবার চেষ্টা করুন।"))});
  };

 const draft=useRef<{dirty:boolean;save:()=>Promise<boolean>;discard:()=>void}>({dirty:false,save:async()=>false,discard:()=>{}});
 const load=useCallback(async(after?:string,signal?:AbortSignal)=>{setLoading(true);setError("");try{const q=new URLSearchParams({environment});if(search)q.set("q",search);if(after)q.set("cursor",after);const r=await fetch(`${base}${detailId?"/"+detailId:""}?${q}`,{cache:"no-store",signal});if(!r.ok)throw Error(String(r.status));const d=await r.json();if(!signal?.aborted){setRows(old=>after?[...old,...d.items]:d.items);setCursor(d.next_cursor);setDelivery(d.delivery??[]);setActivity(d.activity?.invoices??[])}}catch(e){if(!signal?.aborted)setError(navigator.onLine?t("Unable to load records.","তথ্য পাওয়া যাচ্ছে না।"):t("Offline. Reconnect to load records.","সংযোগ নেই। আবার সংযুক্ত হয়ে দেখুন।"))}finally{if(!signal?.aborted)setLoading(false)}},[base,detailId,environment,search,t]);
 useEffect(()=>{if(initialLoad.current){initialLoad.current=false;return;}const c=new AbortController();void Promise.resolve().then(()=>load(undefined,c.signal));return()=>c.abort()},[load,seed,search,detailId]);
 useEffect(()=>{if(editing===undefined)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault()};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard)},[editing]);
 async function command(path:string,data:unknown,method="POST"){setBusy(true);setError("");setMessage("");try{const serialized=JSON.stringify(data);const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${base}|${environment}|${path}|${method}|${serialized}`));const slot="ekmivo-request:"+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");let key=sessionStorage.getItem(slot);if(!key){key=crypto.randomUUID();sessionStorage.setItem(slot,key)}const r=await fetch(`${base}${path}?environment=${environment}`,{method,headers:{"Content-Type":"application/json","Idempotency-Key":key},body:serialized});const d=await r.json();if(!r.ok)throw Error(d.error?.code||d.code||String(r.status));sessionStorage.removeItem(slot);setMessage(t("Saved by the server.","সার্ভারে সংরক্ষিত হয়েছে।"));return d}catch(e){setError(planLimitMessage(e instanceof Error?e.message:"",bn)??(e instanceof Error?e.message:t("Request unconfirmed","অনুরোধ নিশ্চিত হয়নি")));return null}finally{setBusy(false)}}
 async function save(e?:React.FormEvent,issueInvoice=kind==="invoices"){e?.preventDefault();const data={...body,customer_id:body.customer_id||undefined,expires_at:body.expires_at?new Date(body.expires_at).toISOString():undefined,due_at:body.due_at?new Date(body.due_at).toISOString():undefined,expected_version:editing?.version};const created=await command(editing?"/"+editing.id+(kind==="invoices"&&editing.status==="issued"?"/correct":""):"",data,editing&&!(kind==="invoices"&&editing.status==="issued")?"PATCH":"POST");if(!created)return false;if(isLinks&&!editing){const published=await command("/"+created.id+"/publish",{expected_version:created.version});if(!published){setEditing({...created,body:{...data,reference:created.reference}} as RecordRow);setBody(current=>({...current,reference:created.reference}));await load();return false}}if(kind==="invoices"&&issueInvoice&&editing?.status!=="issued"){const issued=await command("/"+created.id+"/issue",{expected_version:created.version});if(!issued){setEditing({...created,body:{...data,reference:created.reference}} as RecordRow);setBody(current=>({...current,reference:created.reference}));await load();return false}}draft.current.dirty=false;setEditing(undefined);await load();return true}
 useEffect(()=>{draft.current={dirty:editing!==undefined,save:()=>save(undefined,false),discard:()=>{draft.current.dirty=false;setEditing(undefined)}}});
 useEffect(()=>registerDraft({id:`documents:${workspaceId}:${environment}:${kind}`,isDirty:()=>draft.current.dirty,save:()=>draft.current.save(),discard:()=>draft.current.discard()}),[workspaceId,environment,kind]);
 useEffect(()=>{if(kind!=="invoices"||!canWrite)return;const c=new AbortController();const timer=setTimeout(()=>{void fetch(`/api/go/workspaces/${workspaceId}/documents/customers?environment=${environment}&q=${encodeURIComponent(customerSearch)}`,{signal:c.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw Error(String(r.status));return r.json()}).then(d=>{if(!c.signal.aborted){setCustomers(d.items);setCustomerError("")}}).catch(()=>{if(!c.signal.aborted)setCustomerError(locale==="bn"?"গ্রাহকের তথ্য পাওয়া যাচ্ছে না।":"Customer source unavailable.")})},250);return()=>{clearTimeout(timer);c.abort()}},[kind,canWrite,workspaceId,environment,customerSearch,locale]);
 async function edit(row:RecordRow|null){closeDocument();if(row){setBusy(true);try{const r=await fetch(`${base}/${row.id}?environment=${environment}`,{cache:"no-store"});if(!r.ok)throw Error(String(r.status));const data=await r.json();row=data.items?.[0];if(!row)throw Error("RECORD_UNAVAILABLE")}catch(e){setError(String(e));return}finally{setBusy(false)}}setEditing(row);setExpiryMode(row?.body.expires_at?"custom":"none");const d={...empty(),...row?.body};if(!row&&kind==="customers")d.reference="CUS-"+crypto.randomUUID();if(!row&&kind==="invoices")d.reference="";for(const k of ["expires_at","due_at"] as const){if(d[k])d[k]=new Date(Date.parse(d[k])-new Date(d[k]).getTimezoneOffset()*60000).toISOString().slice(0,16)}setBody(d)}
 async function duplicateLink(row:RecordRow){
  if(!canWrite||busy||kind!=="payment-links")return;
  closeDocument();setBusy(true);setError("");
  try{
   const res=await fetch(`${base}/${row.id}?environment=${encodeURIComponent(environment)}`,{cache:"no-store",credentials:"same-origin"});
   if(!res.ok)throw Error("LINK_DETAILS_UNAVAILABLE");
   const data=await res.json();const original=data?.items?.[0] as RecordRow|undefined;
   if(!original?.body)throw Error("LINK_DETAILS_UNAVAILABLE");
   const cloned={...empty(),...original.body,reference:(original.reference||row.reference).slice(0,70)+"-copy-"+crypto.randomUUID().slice(0,8)};
    if(cloned.expires_at){const expiry=new Date(cloned.expires_at);if(Number.isFinite(expiry.getTime()))cloned.expires_at=new Date(expiry.getTime()-expiry.getTimezoneOffset()*60000).toISOString().slice(0,16)}
   setBody(cloned);setExpiryMode(cloned.expires_at?"custom":"none");setEditing(null);
  }catch{setError(t("Unable to duplicate this link.","লিংকটি ডুপ্লিকেট করা যায়নি।"))}
  finally{setBusy(false)}
 }
 function field(key:keyof Body,label:string,type="text"){const money=key.endsWith("_minor");const required=(key==="reference"&&kind!=="invoices")||(kind==="payment-links"&&key==="amount_minor");if(type==="datetime-local")return <div className="fld"><label>{label}</label><DashboardDateTimePicker locale={locale} value={String(body[key]||"")} min={new Date(now-new Date(now).getTimezoneOffset()*60000).toISOString().slice(0,10)} label={label} onChange={value=>setBody(old=>({...old,[key]:value}))}/></div>;return <div className="fld"><label htmlFor={"doc-"+key}>{label}</label><input id={"doc-"+key} className="in w" type={type} required={required} disabled={key==="reference"&&kind==="invoices"&&Boolean(editing)} step={money?"0.01":undefined} value={String(money?Number(body[key]??0)/100:body[key]??"")} onChange={e=>setBody(old=>({...old,[key]:type==="number"?(money?Math.round(Number(e.target.value)*100):Number(e.target.value)):e.target.value}))} maxLength={type==="text"?2000:undefined} min={type==="number"?(required&&money?0.01:0):undefined}/></div>}
 async function exportCSV(){
  if(!canExport)return;
  exportAbort.current?.abort();const abort=new AbortController();exportAbort.current=abort;setBusy(true);setError("");
  const slot=`ekmivo-export:${userId}:${workspaceId}:${environment}:${kind}`;
  try{
   const exportsBase=`/api/go/workspaces/${workspaceId}/exports`;
   let saved:{key:string;id?:string}|null=null;
   try{saved=JSON.parse(sessionStorage.getItem(slot)||"null")}catch{sessionStorage.removeItem(slot)}
   if(!saved||typeof saved.key!=="string") {saved={key:crypto.randomUUID()};sessionStorage.setItem(slot,JSON.stringify(saved))}
   if(!saved.id){const queued=await fetch(`${exportsBase}?environment=${environment}`,{method:"POST",signal:abort.signal,headers:{"Content-Type":"application/json","Idempotency-Key":saved.key},body:JSON.stringify({resource:kind})});if(!queued.ok)throw Error(t("Export request unconfirmed. Retry with the same saved key.","Export নিশ্চিত হয়নি। সংরক্ষিত একই key দিয়ে আবার চেষ্টা করুন।"));const job=await queued.json();if(typeof job.id!=="string"||!/^[0-9a-f-]{36}$/i.test(job.id))throw Error("EXPORT_UNCONFIRMED");saved.id=job.id;sessionStorage.setItem(slot,JSON.stringify(saved))}
   const state=await fetch(`${exportsBase}/${saved.id}?environment=${environment}`,{cache:"no-store",signal:abort.signal});if(!state.ok)throw Error(t("Export status unavailable. Your request is saved.","Export-এর অবস্থা পাওয়া যাচ্ছে না। অনুরোধ সংরক্ষিত আছে।"));const d=await state.json();
   if(d.status==="failed"){sessionStorage.removeItem(slot);throw Error(d.error_code||"EXPORT_FAILED")}
   if(d.status!=="complete"){if(!abort.signal.aborted)setMessage(t("Export is queued. You can leave and return; use Export CSV again to check or download it.","Export queue-তে আছে। পেজ ছেড়ে আবার ফিরতে পারবেন; CSV export চাপলে অবস্থা দেখা বা download হবে।"));return}
   const r=await fetch(`${exportsBase}/${saved.id}/download?environment=${environment}`,{cache:"no-store",signal:abort.signal});if(r.status===410){sessionStorage.removeItem(slot);throw Error(t("Export expired. Create another export.","Export-এর মেয়াদ শেষ। নতুন export করুন।"))}if(!r.ok)throw Error(t("Private export unavailable","Private export পাওয়া যাচ্ছে না"));const blob=await r.blob();if(abort.signal.aborted)return;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=kind+".csv";a.click();URL.revokeObjectURL(url);sessionStorage.removeItem(slot);setMessage(t("Export downloaded; its server copy expires after 15 minutes.","Export download হয়েছে; সার্ভারে থাকা কপির মেয়াদ ১৫ মিনিট।"));
  }catch(e){if(!abort.signal.aborted)setError(String(e))}finally{if(!abort.signal.aborted)setBusy(false)}
 }
 const amount=(minor:number)=>"BDT "+new Intl.NumberFormat(bn?"bn-BD":"en-GB",{minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100);
 const date=(value?:string)=>value?new Intl.DateTimeFormat(bn?"bn-BD":"en-GB",{dateStyle:"medium"}).format(new Date(value)):"—";
 const state=(row:RecordRow)=>isLinks?paymentLinkState(row,now):kind==="invoices"&&row.status==="issued"&&row.paid_minor>=row.amount_minor?"paid":row.status;
 const label=(value:string)=>({active:t("Active","সক্রিয়"),disabled:t("Disabled","বন্ধ"),draft:t("Draft","খসড়া"),drafts:t("Draft","খসড়া"),expired:t("Expired","মেয়াদোত্তীর্ণ"),archived:t("Archived","আর্কাইভ"),paid:t("Paid","পরিশোধিত"),issued:t("Issued","ইস্যু"),cancelled:t("Cancelled","বাতিল")}[value]||value);
 const publicPath=(row:RecordRow)=>`/${kind==="invoices"?"invoice":"pay"}/${row.public_token}`;
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setMessage(t("Copied","কপি হয়েছে"))}catch{setError(t("Copy failed. Please retry.","কপি হয়নি। আবার চেষ্টা করুন।"))}};
 const closeEditor=()=>{if(!busy){draft.current.dirty=false;setEditing(undefined)}};
 const action=async(row:RecordRow,op:string)=>{const result=await command(`/${row.id}/${op}`,{expected_version:row.version,...(["send","remind"].includes(op)?{consent_to_contact:true}:{})});if(result){closeDocument();await load()}return Boolean(result)};
 const actionProps={kind,canWrite,canManage,busy,t,onEdit:edit,onDuplicate:duplicateLink,onConfirm:setConfirming,onAction:action,onCopy:copy,publicPath};
 const editorTitle=kind==="customers"?(editing?t("Edit customer","গ্রাহক পরিবর্তন"):t("Add customer","গ্রাহক যোগ")):isLinks?(editing?t("Edit link","লিংক সম্পাদনা"):t("New link","নতুন লিংক")):(editing?t("Edit invoice","ইনভয়েস পরিবর্তন"):t("New invoice","নতুন ইনভয়েস"));
 return <div className="ref-dashboard"><div className="ref-page" aria-busy={loading}>
  <div className="top"><h1>{isLinks?t("Payment links","পেমেন্ট লিংক"):kind==="customers"?t("Customers","কাস্টমার"):t("Invoices","ইনভয়েস")}</h1><div className="acts">
   {kind==="customers"&&<><label className="ey mut" style={{fontSize:12,whiteSpace:"nowrap"}}><RefSwitch checked={hideNumbers} label={t("Hide numbers","নম্বর লুকান")} disabled={!canManage||preferenceBusy} onChange={value=>void toggleNumbers(value)}/>{t("Hide numbers","নম্বর লুকান")}</label>{canWrite&&<button className="ib" onClick={()=>setImportOpen(true)}>{t("Import CSV","CSV ইমপোর্ট")}</button>}</>}
   {canWrite&&<button className="ib pri" disabled={busy} onClick={()=>void edit(null)}><RefIcon name="plus"/>{isLinks?t("New link","নতুন লিংক"):kind==="customers"?t("Add customer","গ্রাহক যোগ"):t("New invoice","নতুন ইনভয়েস")}</button>}
  </div><p>{isLinks?t("Share a link or request a one-time payment.","লিংক শেয়ার করুন অথবা একবারের পেমেন্ট চান।"):kind==="customers"?t("People who pay your business.","যাঁরা আপনার ব্যবসায় পেমেন্ট করেন।"):t("Issue invoices and track confirmed payments.","ইনভয়েস তৈরি ও নিশ্চিত পেমেন্ট দেখুন।")}</p></div>
  {error&&<div className="notice ref-errors" role="alert">{error}<button className="ib" disabled={busy} onClick={()=>void load()}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {message&&<p className="notice" role="status" data-feedback="success">{message}</p>}
  <div className="card">
   <div className={isLinks?"bar2":"toolbar"}><input className="in searchbox" aria-label={t("Search","খুঁজুন")} placeholder={isLinks?t("Search links","লিংক খুঁজুন"):kind==="customers"?t("Search customers…","গ্রাহক খুঁজুন…"):t("Search invoices…","ইনভয়েস খুঁজুন…")} value={search} onChange={e=>setSearch(e.target.value)}/>
    {isLinks?<div className="seg">{["all","active","draft","expired","archived"].map(value=><button key={value} className={linkFilter===value?"on":""} onClick={()=>setLinkFilter(value)}>{value==="all"?t("All","সব"):label(value)}</button>)}</div>:<select className="in" aria-label={t("Filter records","রেকর্ড ফিল্টার")} value={documentFilter} onChange={e=>setDocumentFilter(e.target.value)}>{(kind==="customers"?["all","checkout","manual"]:["all","paid","issued","draft","unpaid","cancelled"]).map(v=><option key={v} value={v}>{v==="all"?t("All","সব"):v==="checkout"?t("Checkout payers","চেকআউটের প্রেরক"):v==="manual"?t("Saved contacts","সংরক্ষিত গ্রাহক"):v==="unpaid"?t("Unpaid","অপরিশোধিত"):label(v)}</option>)}</select>}
    <div className="sp"/><button className="ib i" aria-label={t("Refresh","রিফ্রেশ")} disabled={loading} onClick={()=>void load()}><RefIcon name="refresh"/></button>{canExport===false&&<ExportUpgradeLink locale={locale} workspaceId={workspaceId}/>}{canExport&&<button className="ib" disabled={busy} onClick={()=>void exportCSV()}><RefIcon name="download"/>{t("Export","এক্সপোর্ট")}</button>}
   </div>
   <div className="tw" role="region" aria-label={t("Records","রেকর্ড")} tabIndex={0}><table><thead><tr>
    <th>{kind==="customers"?t("Customer","গ্রাহক"):isLinks?t("Reference","রেফারেন্স"):t("Invoice","ইনভয়েস")}</th><th className={kind!=="customers"?"num":undefined}>{kind==="customers"?t("Phone","ফোন"):t("Amount","পরিমাণ")}</th><th className="num">{kind==="customers"?t("Payments","পেমেন্ট"):isLinks?t("Received","প্রাপ্ত"):t("Paid / Due","পরিশোধিত / বাকি")}</th>
    {kind!=="customers"&&<th>{t("Status","অবস্থা")}</th>}<th>{kind==="customers"?t("Last payment","শেষ পেমেন্ট"):isLinks?t("Expires","মেয়াদ"):t("Due date","শেষ তারিখ")}</th><th/></tr></thead><tbody>
    {visibleRows.filter(r=>r.status!=="deleted").map(row=><tr className="rowclick" key={row.id} tabIndex={0} onClick={()=>openDocument(row)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDocument(row)}}}>
     <td><span className={`itemtitle ${kind!=="customers"?"mono":""}`}>{kind==="customers"?row.body.name||t("Payer","প্রেরক"):row.reference}</span>{(kind==="customers"||row.body.description)&&<span className="rmeta">{kind==="customers"?row.reference:row.body.description}</span>}</td>
     <td className={kind!=="customers"?"num":undefined}>{kind==="customers"?<span className="chip"><span className="mono">{row.body.phone?formatPhone(row.body.phone):"—"}</span>{row.body.phone&&canManage&&!hideNumbers&&<button aria-label={t("Copy phone","ফোন কপি")} onClick={e=>{e.stopPropagation();void copy(row.body.phone!)}}><RefIcon name="copy"/></button>}</span>:amount(row.amount_minor)}</td>
     <td className="num">{kind==="customers"?row.body.payment_count??0:isLinks?amount(row.paid_minor):`${amount(row.paid_minor)} / ${amount(Math.max(0,row.amount_minor-row.paid_minor))}`}</td>
     {kind!=="customers"&&<td><RefStatus status={state(row)} label={label(state(row))}/></td>}
     <td className="mut">{kind==="customers"?date(row.body.last_payment_at):isLinks?row.body.expires_at?date(row.body.expires_at):t("No expiry","মেয়াদ নেই"):date(row.body.due_at)}</td>
     <td className="num">{isLinks?<details className="ref-row-menu" onClick={e=>e.stopPropagation()}><summary className="ib i" aria-label={t("Link actions","লিংকের অপশন")}><RefIcon name="more"/></summary><div className="ref-row-pop">{<DocumentActions row={row} {...actionProps}/>}</div></details>:<RefIcon name="chevron"/>}</td>
    </tr>)}</tbody></table></div>
   {loading&&!rows.length?<div className="empty" role="status">{t("Loading…","লোড হচ্ছে…")}</div>:!visibleRows.length&&!error&&<div className="table-empty"><div className="empty-art"><RefIcon name={kind==='customers'?'monitor':'copy'}/></div><b>{t("Nothing here yet.","এখনো কিছু নেই।")}</b><p>{t("Try another search or create a record.","অন্যভাবে খুঁজুন অথবা নতুন রেকর্ড তৈরি করুন।")}</p></div>}
   {cursor&&<div className="toolbar-note"><button className="ib" disabled={loading} onClick={()=>void load(cursor)}>{t("Load more","আরও দেখুন")}</button></div>}
  </div>
  {isLinks&&canInvoices&&<details className="card ref-invoice-links"><summary>{t("Invoice payment links","ইনভয়েস পেমেন্ট লিংক")} · {invoiceLinks.length}{invoiceLinksCursor?"+":""}</summary><div className="panel-pad"><div className="actionline"><button type="button" className="ib" disabled={invoiceLinksLoading} onClick={()=>setInvoiceLinksRefresh(n=>n+1)}>{t("Refresh","রিফ্রেশ")}</button></div>{invoiceLinksLoading&&<p role="status" className="mut">{t("Loading invoice links…","ইনভয়েস লিংক লোড হচ্ছে…")}</p>}{invoiceLinksError&&<p role="alert" className="ref-errors">{invoiceLinksError}</p>}{!invoiceLinks.length&&!invoiceLinksError&&!invoiceLinksLoading&&!invoiceLinksCursor&&<p className="mut">{t("Issued invoices automatically have their own payment links.","ইস্যু করা ইনভয়েসের নিজস্ব পেমেন্ট লিংক থাকে।")}</p>}{invoiceLinks.map(invoice=><div key={invoice.id} className="kv"><span><strong>{t("From","থেকে")} {invoice.reference}</strong> <RefStatus status={invoice.paid_minor>=invoice.amount_minor?"paid":invoice.status} label={invoice.paid_minor>=invoice.amount_minor?t("Paid","পরিশোধিত"):invoice.status==="cancelled"?t("Void","বাতিল"):t("Due","বাকি")}/></span><span className="actionline"><Link className="ib" href={`/invoice/${invoice.public_token}`} target="_blank">{t("View invoice","ইনভয়েস দেখুন")}</Link><button className="ib" type="button" onClick={()=>void copy(location.origin+"/invoice/"+invoice.public_token)}>{t("Copy link","লিংক কপি")}</button></span></div>)}{invoiceLinksCursor&&<div className="actionline"><button type="button" className="ib" disabled={invoiceLinksLoading} onClick={()=>void loadMoreInvoiceLinks()}>{t("Load more invoice links","আরও ইনভয়েস লিংক")}</button></div>}</div></details>}
  {detailId&&rows.map(row=><section className="card panel-pad" key={row.id}><div className="actionline"><b>{row.reference}</b><div className="sp"/>{<DocumentActions row={row} {...actionProps}/>}</div><div className="drawer-group"><h4>{t("History","হিস্ট্রি")}</h4>{row.history?.map(h=><p key={h.version}>{h.version} · {label(h.status)} · {date(h.occurred_at)}</p>)}</div>{row.payments?.map(p=><p key={p.intent_id}><Link href={canonicalRoutes?`/payments/links?view=requests&request=${p.intent_id}`:`/w/${workspaceId}/payments/requests?request=${p.intent_id}`}>{p.state} · {p.intent_id}</Link></p>)}</section>)}
  {detailId&&activity.length>0&&<section className="card panel-pad">{activity.map(inv=><p key={inv.id}><Link href={canonicalRoutes?unifiedFinancialDetailPath("invoices",inv.id)??"/invoices":`/w/${workspaceId}/payments/invoices/${inv.id}`}>{inv.reference}</Link> · {amount(inv.paid_minor)} / {amount(inv.amount_minor)}</p>)}</section>}
  {detailId&&delivery.length>0&&<section className="card panel-pad">{delivery.map(n=><p key={n.id}>{n.kind} · {n.status} · {date(n.created_at)}</p>)}</section>}
 </div>
 <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={editing!==undefined} title={editorTitle} width={kind==='customers'?480:560} busy={busy} onClose={closeEditor} footer={<><button type="button" className="ib" disabled={busy} onClick={closeEditor}>{t("Cancel","বাতিল")}</button><button type="submit" form="ref-document-form" className={`ib pri ${busy?'ld':''}`} disabled={busy}>{editing?t("Save changes","পরিবর্তন সংরক্ষণ"):kind==='customers'?t("Add customer","গ্রাহক যোগ"):isLinks?t("Create link","লিংক তৈরি করুন"):t("Create invoice","ইনভয়েস তৈরি")}</button>{kind==="invoices"&&editing?.status!=="issued"&&<button type="submit" form="ref-document-form" data-save-mode="draft" className="ib" disabled={busy}>{t("Save as draft","খসড়া সংরক্ষণ")}</button>}</>}>
  <form id="ref-document-form" ref={editorRef} onSubmit={e=>void save(e,(e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-save-mode")!=="draft")}>
   {kind==='customers'?<>{field('name',t('Customer name','গ্রাহকের নাম'))}{field('phone',t('Phone number','ফোন নম্বর'),'tel')}{field('email',t('Email (optional)','ইমেইল (ঐচ্ছিক)'),'email')}<details className="ref-more"><summary>{t('More options','আরও অপশন')}</summary><p className="modal-desc">{t('Reference','রেফারেন্স')}: <span className="mono">{body.reference}</span></p><div className="fld"><label>{t('Tags (optional)','ট্যাগ (ঐচ্ছিক)')}</label><DashboardTagInput locale={locale} tags={body.tags} onChange={tags=>setBody(v=>({...v,tags}))}/></div></details></>:isLinks?<>
    <div className="f2">{field('reference',t('Reference','রেফারেন্স'))}{field('amount_minor',t('Amount (BDT)','পরিমাণ (টাকা)'),'number')}</div>{field('description',t('Description','বিবরণ'))}
    <div className="fld"><span className="lb">{t('Expiry','মেয়াদ')}</span><div className="chips">{([['none',t('No expiry','মেয়াদ নেই')],['24',t('24 hours','২৪ ঘণ্টা')],['7',t('7 days','৭ দিন')],['custom',t('Pick date','তারিখ বাছুন')]] as const).map(([mode,text])=><button type="button" className={`chp ${expiryMode===mode?'on':''}`} key={mode} onClick={()=>{setExpiryMode(mode);if(mode==='none')setBody(v=>({...v,expires_at:''}));else if(mode!=='custom'){const d=new Date(Date.now()+(mode==='24'?86400000:604800000));setBody(v=>({...v,expires_at:new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}))}}}>{text}</button>)}</div>{expiryMode==='custom'&&field('expires_at',t('Date and time','তারিখ ও সময়'),'datetime-local')}</div>
    <div className="fld"><span className="lb">{t('Maximum payments','সর্বোচ্চ পেমেন্ট')}</span><div className="r2"><input className="in w num" type="number" min={1} disabled={body.max_uses===0} placeholder={t('No limit','সীমা নেই')} value={body.max_uses||''} onChange={e=>setBody(v=>({...v,max_uses:Number(e.target.value)}))}/><RefSwitch checked={body.max_uses===0} label={t('No limit','সীমা নেই')} onChange={on=>setBody(v=>({...v,max_uses:on?0:1}))}/><span>{t('No limit','সীমা নেই')}</span></div></div>
    <details className="ref-more"><summary>{t('More options','আরও অপশন')}</summary>{field('return_url',t('Redirect URL','রিডাইরেক্ট URL'),'url')}<div className="f2">{field('max_quantity',t('Maximum quantity','সর্বোচ্চ পরিমাণ'),'number')}{field('image_url',t('Image URL','ছবির URL'),'url')}</div><div className="fld"><span className="lb">{t('Customer fields','গ্রাহকের ফিল্ড')}</span><div className="cfs">{body.fields.map((f,i)=><details key={i} className="ref-custom-field"><summary className="chp on">{f.label||t('New field','নতুন ফিল্ড')}</summary><div className="f2"><div className="fld"><label>{t('Field ID','ফিল্ড ID')}</label><input className="in w" required value={f.id} onChange={e=>setBody(v=>({...v,fields:v.fields.map((x,n)=>n===i?{...x,id:e.target.value}:x)}))}/></div><div className="fld"><label>{t('Field name','ফিল্ডের নাম')}</label><input className="in w" required value={f.label} onChange={e=>setBody(v=>({...v,fields:v.fields.map((x,n)=>n===i?{...x,label:e.target.value}:x)}))}/></div></div><div className="fld"><label>{t('Type','ধরন')}</label><select className="in w" value={f.type} onChange={e=>setBody(v=>({...v,fields:v.fields.map((x,n)=>n===i?{...x,type:e.target.value}:x)}))}>{['text','textarea','select','radio','checkbox','file'].map(x=><option key={x}>{x}</option>)}</select></div><div className="fld"><label>{t('Options (comma separated)','অপশন (কমা দিয়ে)')}</label><input className="in w" value={f.options.join(',')} onChange={e=>setBody(v=>({...v,fields:v.fields.map((x,n)=>n===i?{...x,options:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}:x)}))}/></div><label><input type="checkbox" checked={f.required} onChange={e=>setBody(v=>({...v,fields:v.fields.map((x,n)=>n===i?{...x,required:e.target.checked}:x)}))}/> {t('Required','আবশ্যক')}</label><button className="ib dg" type="button" onClick={()=>setBody(v=>({...v,fields:v.fields.filter((_,n)=>n!==i)}))}>{t('Remove','সরান')}</button></details>)}<button className="chp" type="button" onClick={()=>setBody(v=>({...v,fields:[...v.fields,{id:'field'+(v.fields.length+1),label:'',type:'text',required:false,options:[]}]}))}>{t('Add field','ফিল্ড যোগ করুন')}</button></div></div></details>
   </>:<>
    <details className="ref-more"><summary>{t("Advanced: invoice number","উন্নত অপশন: ইনভয়েস নম্বর")}</summary>{field("reference",t("Invoice reference (optional override)","ইনভয়েস রেফারেন্স (ঐচ্ছিক পরিবর্তন)"))}</details>
    <div className="fld"><DashboardCombobox locale={locale} label={t('Customer','গ্রাহক')} placeholder={t('Select or enter customer','গ্রাহক বাছুন বা লিখুন')} query={customerSearch} selectedValue={body.customer_id} selectedLabel={customers.find(c=>c.id===body.customer_id)?.body.name||''} options={customers.map(c=>({value:c.id,label:c.body.name||c.id.slice(0,8)}))} onQueryChange={setCustomerSearch} onChange={customer_id=>setBody(v=>({...v,customer_id}))}/>{customerError&&<p className="ref-errors" role="alert">{customerError}</p>}</div>
    <div className="fld"><label>{t('Due date','শেষ তারিখ')}</label><DashboardDatePicker locale={locale} label={t('Due date','শেষ তারিখ')} value={body.due_at.slice(0,10)} onChange={date=>setBody(v=>({...v,due_at:date?date+'T23:59':''}))}/></div>{field('description',t('Description','বিবরণ'))}
    <div className="fld"><span className="lb">{t('Invoice line items','ইনভয়েসের পণ্য/সেবা')}</span><div className="ref-invoice-items">{body.items.map((item,i)=><div key={i} className="ref-invoice-line"><input className="in" required aria-label={t('Description','বিবরণ')} placeholder={t('Item description','পণ্যের বিবরণ')} value={item.title} onChange={e=>setBody(v=>({...v,items:v.items.map((x,n)=>n===i?{...x,title:e.target.value}:x)}))}/><input className="in num" required type="number" aria-label={t('Quantity','পরিমাণ')} min={1} max={9999} value={item.quantity} onChange={e=>setBody(v=>({...v,items:v.items.map((x,n)=>n===i?{...x,quantity:Number(e.target.value)}:x)}))}/><input className="in num" required type="number" aria-label={t('Unit price (BDT)','একক দাম (টাকা)')} step="0.01" min={0} value={item.unit_amount_minor/100} onChange={e=>setBody(v=>({...v,items:v.items.map((x,n)=>n===i?{...x,unit_amount_minor:Math.round(Number(e.target.value)*100)}:x)}))}/><button className="ib i" type="button" aria-label={t('Remove item','পণ্য সরান')} disabled={body.items.length===1} onClick={()=>setBody(v=>({...v,items:v.items.filter((_,n)=>n!==i)}))}><RefIcon name="close"/></button></div>)}</div><button className="ib" type="button" style={{marginTop:8}} onClick={()=>setBody(v=>({...v,items:[...v.items,{title:'',quantity:1,unit_amount_minor:0}]}))}><RefIcon name="plus"/>{t('Add item','পণ্য যোগ করুন')}</button></div>
    <div className="ref-amount-grid">{field('tax_minor',t('Tax (BDT)','কর (টাকা)'),'number')}{field('fee_minor',t('Fee (BDT)','ফি (টাকা)'),'number')}{field('shipping_minor',t('Shipping (BDT)','ডেলিভারি (টাকা)'),'number')}{field('discount_minor',t('Discount (BDT)','ছাড় (টাকা)'),'number')}</div><div className="ref-invoice-summary" aria-live="polite"><div><span>{t("Subtotal","সাবটোটাল")}</span><b>{amount(body.items.reduce((sum,line)=>sum+line.quantity*line.unit_amount_minor,0))}</b></div><div><span>{t("Invoice fee (not gateway charge)","ইনভয়েস ফি (গেটওয়ে চার্জ নয়)")}</span><b>{amount(body.fee_minor)}</b></div><div className="total"><span>{t("Total due (including adjustments)","মোট পাওনা (সব সমন্বয়সহ)")}</span><b>{amount(body.items.reduce((sum,line)=>sum+line.quantity*line.unit_amount_minor,0)+body.tax_minor+body.fee_minor+body.shipping_minor-body.discount_minor)}</b></div></div>
   </>}
   {kind!=='customers'&&<details className="ref-more"><summary>{t('Notes','নোট')}</summary>{(['notes','private_notes'] as const).map(key=><div className="fld" key={key}><label htmlFor={'doc-'+key}>{key==='notes'?t('Public notes','পাবলিক নোট'):t('Private notes','প্রাইভেট নোট')}</label><textarea id={'doc-'+key} className="in w" rows={2} maxLength={4000} value={body[key]} onChange={e=>setBody(v=>({...v,[key]:e.target.value}))}/></div>)}</details>}
   {error&&<p role="alert" className="ref-errors">{error}</p>}
  </form>
 </RefModal>
 <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={Boolean(selectedDocument)} title={t('Details','বিস্তারিত')} drawer onClose={closeDocument} footer={<><button className="ib" onClick={closeDocument}>{t('Close','বন্ধ করুন')}</button>{selectedDocument&&<DocumentActions row={selectedDocument} {...actionProps}/>}</>}>
  {selectedDocument&&<><div className="detail-intro">{kind==='customers'?selectedDocument.body.name||t('Payer','প্রেরক'):amount(selectedDocument.amount_minor)}</div><div className="drawer-group">
   {[[t('Status','অবস্থা'),<RefStatus key="status" status={state(selectedDocument)} label={label(state(selectedDocument))}/>],[t('Reference','রেফারেন্স'),selectedDocument.reference],...(kind==='customers'?[[t('Phone number','ফোন নম্বর'),selectedDocument.body.phone?formatPhone(selectedDocument.body.phone):'—'],[t('Email','ইমেইল'),selectedDocument.body.email||'—'],[t('Payments','পেমেন্ট'),selectedDocument.body.payment_count??0],[t('Last payment','শেষ পেমেন্ট'),date(selectedDocument.body.last_payment_at)],[t('Tags','ট্যাগ'),selectedDocument.body.tags?.join(', ')||'—']]:[[t('Paid','পরিশোধিত'),amount(selectedDocument.paid_minor)],[t('Remaining','বাকি'),amount(Math.max(0,selectedDocument.amount_minor-selectedDocument.paid_minor))],[isLinks?t('Expires','মেয়াদ'):t('Due date','শেষ তারিখ'),date(isLinks?selectedDocument.body.expires_at:selectedDocument.body.due_at)],[t('Description','বিবরণ'),selectedDocument.body.description||'—']])].map(([key,value],i)=><div className="kv" key={i}><span>{key}</span><span>{value}</span></div>)}
  </div>{(!canonicalRoutes||unifiedFinancialDetailPath(kind,selectedDocument.id))&&<Link className="ib" href={canonicalRoutes?unifiedFinancialDetailPath(kind,selectedDocument.id)!:`/w/${workspaceId}/payments/${kind}/${selectedDocument.id}`}>{t('View full record','পুরো রেকর্ড দেখুন')}</Link>}</>}
 </RefModal>
 <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={Boolean(confirming)} title={confirming?.mode==='delete'?t('Delete this link?','লিংকটি মুছবেন?'):confirming?.mode==='send'?t('Send invoice','ইনভয়েস পাঠান'):confirming?.mode==='remind'?t('Send reminder','রিমাইন্ডার পাঠান'):t('Confirm change','পরিবর্তন নিশ্চিত করুন')} busy={busy} onClose={()=>setConfirming(null)} footer={<><button className="ib" disabled={busy} onClick={()=>setConfirming(null)}>{t('Cancel','বাতিল')}</button><button className={`ib ${['delete','cancel','archive','disable'].includes(confirming?.mode||'')?'dgb':'pri'}`} disabled={busy} onClick={async()=>{if(confirming&&await action(confirming.row,confirming.mode))setConfirming(null)}}>{t('Confirm','নিশ্চিত করুন')}</button></>}>
  <p>{confirming?.mode==='delete'?t('Its checkout page stops working. Past payments stay in your records.','এর চেকআউট পেজ আর কাজ করবে না। আগের পেমেন্ট আপনার রেকর্ডে থাকবে।'):['send','remind'].includes(confirming?.mode||'')?t('I have permission to contact this customer at their linked email address.','এই গ্রাহকের সংযুক্ত ইমেইলে যোগাযোগের অনুমতি আছে।'):t('This changes the record used by your customers. Continue?','গ্রাহকের ব্যবহৃত রেকর্ড পরিবর্তন হবে। এগিয়ে যাবেন?')}</p>{error&&<p className="ref-errors" role="alert">{error}</p>}
 </RefModal>
 <RefModal closeLabel={locale==="bn"?"বন্ধ করুন":"Close"} open={importOpen} title={t('Import customers','গ্রাহক ইমপোর্ট')} busy={busy} onClose={()=>setImportOpen(false)} footer={<><button className="ib" disabled={busy} onClick={()=>setImportOpen(false)}>{t('Cancel','বাতিল')}</button><button className="ib pri" disabled={busy||!csv||Boolean(preview?.errors.length)} onClick={()=>void (preview?command('/commands/import',{csv}).then(d=>{if(d){setCsv('');setPreview(null);setImportOpen(false);void load()}}):command('/commands/import-preview',{csv}).then(d=>d&&setPreview(d)))}>{preview?t('Import valid batch','সঠিক ব্যাচ ইমপোর্ট'):t('Preview import','ইমপোর্ট প্রিভিউ')}</button></>}>
  <p className="modal-desc">{t('Upload a CSV with reference, name, email, and phone. Preview and validate before submitting to the server.','reference, name, email ও phone কলামসহ CSV আপলোড করুন। সার্ভারে পাঠানোর আগে প্রিভিউ ও যাচাই করুন।')}</p><div className="fld"><label>{t('CSV file','CSV ফাইল')}</label><input className="in w" type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>524288){setError(t('CSV exceeds 512 KB.','CSV ফাইল ৫১২ KB-এর বেশি।'));setCsv('');setPreview(null);return}void f.text().then(x=>{setCsv(x);setPreview(null);setError('')}).catch(()=>setError(t('CSV could not be read.','CSV ফাইল পড়া যায়নি।')))}}/></div><a className="ib" download="customers-template.csv" href="data:text/csv;charset=utf-8,reference%2Cname%2Cemail%2Cphone%0A">{t('Download template','টেমপ্লেট ডাউনলোড')}</a><details className="ref-more"><summary>{t('CSV content','CSV তথ্য')}</summary><textarea className="in w" value={csv} onChange={e=>{setCsv(e.target.value);setPreview(null)}}/></details>{preview&&<><p>{preview.valid_count} {t('valid rows','সঠিক সারি')}</p>{preview.errors.map(e=><p className="ref-errors" key={e.row}>{e.row}: {e.code}</p>)}</>}{error&&<p className="ref-errors" role="alert">{error}</p>}
 </RefModal>
 </div>;
}
