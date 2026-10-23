"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {registerDraft} from "../lib/client/draft-navigation";
import styles from "./team-groups.module.css";

type Group={id:string;name:string;denied_capabilities:string[];members:string[];revision:number};
type Member={id:string;name:string;role:string};
type Data={can_manage:boolean;groups:Group[];members:Member[]};
type Draft={id:string;name:string;denied_capabilities:string[];members:string[];revision:number};
const empty:Draft={id:"",name:"",denied_capabilities:[],members:[],revision:0};
const caps:[string,string,string][]=[
 ["payments:read","Read payments","পেমেন্ট দেখা"],["payments:issue","Issue payment requests","পেমেন্ট অনুরোধ"],
 ["payments:manage","Manage payments","পেমেন্ট পরিচালনা"],["payments:export","Export payments","পেমেন্ট এক্সপোর্ট"],
 ["workspace:settings","Change Store settings","স্টোর সেটিংস"],["members:manage","Manage team","টিম পরিচালনা"],
 ["product:payments","All Payments access","সমস্ত পেমেন্ট অ্যাক্সেস"],["inbox:read","Read Inbox","ইনবক্স দেখা"],
 ["inbox:send","Send Inbox messages","ইনবক্সে মেসেজ"],["inbox:manage","Manage Inbox/AI","ইনবক্স ও AI পরিচালনা"],
 ["product:ai","All AI access","সমস্ত AI অ্যাক্সেস"],
];

export function TeamGroups({workspaceId,bn}:{workspaceId:string;bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [busy,setBusy]=useState(false),[draft,setDraft]=useState<Draft>(empty),[password,setPassword]=useState("");
 const [loaded,setLoaded]=useState(false);
 const lock=useRef(false),draftRef=useRef(draft),newId=useRef("");
 useEffect(()=>{draftRef.current=draft;},[draft]);
 const endpoint=`/api/go/workspaces/${workspaceId}/workspace-tools/groups?environment=live`;
 const dirty=Boolean(draft.name||draft.members.length||draft.denied_capabilities.length||draft.id);
 useEffect(()=>registerDraft({id:`team-groups:${workspaceId}`,isDirty:()=>Boolean(draftRef.current.id||draftRef.current.name||draftRef.current.members.length||draftRef.current.denied_capabilities.length),save:async()=>false,discard:()=>{setDraft(empty);setPassword("");newId.current="";}}),[workspaceId]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const response=await fetch(endpoint,{cache:"no-store",signal});
  if(!response.ok)throw Error(String(response.status));
  const next=await response.json() as Data;
  if(!next||!Array.isArray(next.groups)||!Array.isArray(next.members)||typeof next.can_manage!=="boolean")throw Error("INVALID_GROUP_SOURCE");
  if(!signal?.aborted){setData(next);setLoaded(true);setError("");}
 },[endpoint]);
 useEffect(()=>{const c=new AbortController();const timer=setTimeout(()=>{void load(c.signal).catch(()=>{if(!c.signal.aborted){setLoaded(true);setData(null);setError(bn?"গ্রুপের তথ্য পাওয়া যাচ্ছে না।":"Team group source unavailable.");}});},0);return()=>{clearTimeout(timer);c.abort();};},[bn,load]);
 const update=<K extends keyof Draft>(field:K,value:Draft[K])=>setDraft(previous=>({...previous,[field]:value}));
 const toggle=(field:"members"|"denied_capabilities",value:string,checked:boolean)=>setDraft(previous=>({...previous,[field]:checked?[...previous[field],value]:previous[field].filter(x=>x!==value)}));
 const clear=()=>{setDraft(empty);setPassword("");newId.current="";};
 const run=async(action:"create"|"update"|"archive",body:Draft)=>{
  if(lock.current||!password||!data?.can_manage)return false;
  lock.current=true;setBusy(true);setError("");setMessage("");
  try{
   newId.current||=crypto.randomUUID();
   const payload={...body,id:body.id||newId.current};
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,body:payload,current_password:password})});
   if(!response.ok)throw Error(String(response.status));
   const result=await response.json() as {saved?:boolean};
   if(result.saved!==true)throw Error("INVALID_SAVE_RESULT");
   clear();
   try{await load();setMessage(t("Group change saved and audited.","গ্রুপ পরিবর্তন ও অডিট সংরক্ষিত হয়েছে।"));}
   catch{setError(t("Saved, but reload failed. Refresh to confirm access.","সংরক্ষিত হয়েছে, কিন্তু রিফ্রেশ হয়নি। অনুমতি নিশ্চিত করতে রিফ্রেশ করুন।"));}
   return true;
  }catch(e){setError(e instanceof Error&&e.message==="409"?t("Group changed elsewhere. Keep your edits and refresh before retrying.","অন্য জায়গায় গ্রুপ বদলেছে। লেখা রেখে রিফ্রেশ করে আবার চেষ্টা করুন।"):t("Could not confirm the group change. Inspect the list before retrying.","গ্রুপ পরিবর্তন নিশ্চিত হয়নি। আবার চেষ্টা করার আগে তালিকা দেখুন।"));return false;}
  finally{lock.current=false;setBusy(false);setPassword("");}
 };
 return <section className={styles.root} aria-busy={busy}>
  <header><p className={styles.eyebrow}>{t("Store owner · security","স্টোর মালিক · নিরাপত্তা")}</p><h1>{t("Team permission groups","টিমের অনুমতি গ্রুপ")}</h1>
   <p>{t("Group policies only restrict access. They cannot elevate a role or override a direct denial. Owner permissions are never changed by a group.","গ্রুপ শুধু অনুমতি সীমিত করতে পারে। দায়িত্বের চেয়ে বেশি অনুমতি বা ব্যক্তিগত নিষেধাজ্ঞা বাতিল করতে পারে না। মালিকের অনুমতি অপরিবর্তিত থাকে।")}</p>
   <Link href="/settings/team">{t("Manage individual team roles and grants","সদস্যদের দায়িত্ব ও আলাদা অনুমতি দেখুন")}</Link>
   <button type="button" disabled={busy||dirty} onClick={()=>void load().catch(()=>setError(t("Could not refresh groups.","গ্রুপ রিফ্রেশ হয়নি।")))}>{t("Refresh","রিফ্রেশ")}</button>
  </header>
  {error&&<p className={styles.error} role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {!loaded&&<p role="status">{t("Loading authorized groups…","অনুমোদিত গ্রুপ লোড হচ্ছে…")}</p>}
  {loaded&&!data&&<p role="alert">{t("No permissions were assumed. Try again later.","কোনো অনুমতি ধরে নেওয়া হয়নি। পরে আবার চেষ্টা করুন।")}</p>}
  {data&&!data.can_manage&&<p role="status">{t("Only the Store owner can inspect or change private group restrictions.","শুধু স্টোরের মালিক ব্যক্তিগত গ্রুপ নিষেধাজ্ঞা দেখতে বা বদলাতে পারবেন।")}</p>}
  {data?.can_manage&&<div className={styles.grid}>
   <section className={styles.panel}><h2>{t("Existing groups","বর্তমান গ্রুপ")}</h2>
    {data.groups.length===0?<p>{t("No restriction groups yet.","এখনো কোনো গ্রুপ নেই।")}</p>:data.groups.map(group=><article className={styles.group} key={group.id}><h3>{group.name}</h3><p>{t("Members","সদস্য")}: {group.members.length} · {t("Restrictions","নিষেধাজ্ঞা")}: {group.denied_capabilities.length}</p>
     <p>{group.denied_capabilities.length?group.denied_capabilities.join(", "):t("No restrictions","কোনো নিষেধাজ্ঞা নেই")}</p>
     <div className={styles.actions}><button type="button" disabled={busy||dirty} onClick={()=>{setDraft({...group});setPassword("");}}>{t("Edit group","গ্রুপ সম্পাদনা")}</button>
      <button type="button" disabled={busy||dirty} onClick={()=>{if(window.confirm(t("Archiving removes this group's restrictions from its members. Continue?","আর্কাইভ করলে সদস্যদের ওপর এই গ্রুপের নিষেধাজ্ঞা উঠে যাবে। চালাবেন?"))){setDraft({...group,name:group.name});setMessage(t("Enter your password, then use Archive selected group.","পাসওয়ার্ড দিয়ে নির্বাচিত গ্রুপ আর্কাইভ করুন।"));}}}>{t("Prepare archive","আর্কাইভ প্রস্তুত")}</button>
     </div></article>)}
   </section>
   <section className={styles.panel}><h2>{draft.id?t("Edit selected group","নির্বাচিত গ্রুপ সম্পাদনা"):t("Create group","নতুন গ্রুপ")}</h2>
    <form onSubmit={e=>{e.preventDefault();void run(draft.id?"update":"create",draft);}}>
     <label>{t("Group name","গ্রুপের নাম")}<input required maxLength={100} value={draft.name} disabled={busy} onChange={e=>update("name",e.target.value)}/></label>
     <fieldset disabled={busy}><legend>{t("Restrict these capabilities (deny-only)","এই কাজগুলো নিষিদ্ধ করুন (শুধু নিষেধাজ্ঞা)")}</legend>
      <div className={styles.options}>{caps.map(([cap,en,be])=><label key={cap}><input type="checkbox" checked={draft.denied_capabilities.includes(cap)} onChange={e=>toggle("denied_capabilities",cap,e.target.checked)}/>{bn?be:en}</label>)}</div>
     </fieldset>
     <fieldset disabled={busy}><legend>{t("Assign non-owner members","মালিক ছাড়া সদস্য যুক্ত করুন")}</legend>
      <div className={styles.options}>{data.members.map(member=><label key={member.id}><input type="checkbox" checked={draft.members.includes(member.id)} onChange={e=>toggle("members",member.id,e.target.checked)}/>{member.name} · {member.role}</label>)}</div>
      {data.members.length===0&&<p>{t("No eligible members.","যোগ্য সদস্য নেই।")}</p>}
     </fieldset>
     <label>{t("Current owner password required for every change","প্রতিটি পরিবর্তনে মালিকের বর্তমান পাসওয়ার্ড প্রয়োজন")}<input type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>
     <div className={styles.actions}><button disabled={busy||!password||!draft.name.trim()}>{draft.id?t("Save restrictions","নিষেধাজ্ঞা সংরক্ষণ"):t("Create group","গ্রুপ তৈরি")}</button>
      {draft.id&&<button type="button" disabled={busy||!password} onClick={()=>{if(window.confirm(t("Archive this group and remove all its restrictions now?","এই গ্রুপ আর্কাইভ করে সব নিষেধাজ্ঞা তুলে দেবেন?")))void run("archive",draft);}}>{t("Archive selected group","নির্বাচিত গ্রুপ আর্কাইভ")}</button>}
      <button type="button" disabled={busy} onClick={clear}>{t("Discard changes","পরিবর্তন বাদ দিন")}</button></div>
    </form>
    <p>{t("All changes are checked against current membership, versioned and recorded in the control audit. Archive does not erase history.","সদস্যপদ যাচাই, revision ও control audit সংরক্ষণ করা হয়। আর্কাইভ করলেও ইতিহাস মুছে যায় না।")}</p>
   </section>
  </div>}
 </section>;
}
