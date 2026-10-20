"use client";
import {PlanResourceStatus,useResourceLimit} from "./plan-resource-status";
import {planLimitMessage} from "../lib/plan-resource-limits";
import {useDashboardInitialData} from "./dashboard-initial-data";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {registerDraft} from "../lib/client/draft-navigation";
import {PaymentPrivacy} from "./payment-privacy";
import "./payment-team-reference.css";

type Member={id:string;name:string;email?:string;role:"owner"|"admin"|"editor"|"viewer";joined_at?:string};
type Invitation={id:string;email:string;role:string;expires_at:string};
type Reply={message:string;created_at:string};
type Ticket={id:string;subject:string;message:string;status:string;created_at:string;replies?:Reply[]};
type Settings={name:string;support_email:string;support_url:string;legal_url:string;timezone:string;locale:string;notification_email:string;logo_url:string;checkout_title:string;checkout_description:string};
type Resource="team"|"settings"|"help";
type ApiData={members?:Member[];invitations?:Invitation[];grants?:Record<string,Record<string,boolean>>;body?:Partial<Settings>;version?:number;items?:Ticket[]};
type Result={error?:{code?:string};code?:string;invitation_token?:string};
const defaults:Settings={name:"",support_email:"",support_url:"",legal_url:"",timezone:"Asia/Dhaka",locale:"bn",notification_email:"",logo_url:"",checkout_title:"",checkout_description:""};
const caps=[
 ["product:payments","Payment service","পেমেন্ট সেবা"],["payments:read","View payments","পেমেন্ট দেখা"],
 ["payments:issue","Create payment requests","পেমেন্ট রিকোয়েস্ট তৈরি"],["payments:manage","Manage payments","পেমেন্ট পরিচালনা"],
 ["payments:export","Export payment records","পেমেন্ট export"],["workspace:settings","Edit business settings","ব্যবসার সেটিংস"],
 ["members:manage","Manage team","সদস্য পরিচালনা"]
] as const;
const fields={
 name:["Business name","ব্যবসার নাম"],checkout_title:["Checkout heading","চেকআউট শিরোনাম"],
 checkout_description:["Checkout description","চেকআউট বিবরণ"],logo_url:["Checkout logo URL","চেকআউট লোগো URL"],
 support_email:["Support email","সহায়তার ইমেইল"],notification_email:["Notification email","নোটিফিকেশন ইমেইল"],
 support_url:["Support website","সহায়তার ওয়েবসাইট"],legal_url:["Legal / terms URL","নীতিমালা / শর্তাবলি"],
 timezone:["Timezone","সময়ের অঞ্চল"],locale:["Default language","পূর্বনির্ধারিত ভাষা"]
} as const;
function at(value?:string,locale:"en"|"bn"="en"){
 if(!value||!Number.isFinite(Date.parse(value)))return "—";
 return new Intl.DateTimeFormat(locale==="bn"?"bn-BD":"en-BD",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dhaka"}).format(new Date(value));
}
function isHttps(value:string){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!!u.hostname}catch{return false}}
function formatSettings(body:Settings):Settings{return Object.fromEntries(Object.entries(body).map(([k,v])=>[k,v.trim()])) as unknown as Settings}
export function PaymentWorkspaceTools({locale,workspaceId,environment,resource,canManage,isOwner,userId,paymentPlanApplies=true,workspaceName=""}:{locale:"en"|"bn";workspaceId:string;environment:string;resource:Resource;canManage:boolean;isOwner:boolean;userId:string;paymentPlanApplies?:boolean;workspaceName?:string}){
 const router=useRouter(),bn=locale==="bn";
 const t=useCallback((en:string,bengali:string)=>bn?bengali:en,[bn]);
 // Payment subscription quotas apply only when Payments is enabled. AI-only
 // workspaces are explicitly exempt in payment_plan_control_limit() SQL.
 const teamLimit=useResourceLimit("team_members",workspaceId,environment,resource==="team"&&paymentPlanApplies);
 const base="/api/go/workspaces/"+workspaceId+"/workspace-tools";
 const seed=useDashboardInitialData<ApiData>("workspace");
 const initialSettings={...defaults,...seed?.data?.body,name:seed?.data?.body?.name||workspaceName};
 const [members,setMembers]=useState<Member[]>(seed?.data?.members??[]),[invites,setInvites]=useState<Invitation[]>(seed?.data?.invitations??[]),[tickets,setTickets]=useState<Ticket[]>(seed?.data?.items??[]);
 const [body,setBody]=useState<Settings>(initialSettings),[version,setVersion]=useState(seed?.data?.version??0),[saved,setSaved]=useState<Settings>(initialSettings);
 const [grants,setGrants]=useState<Record<string,Record<string,boolean>>>(seed?.data?.grants??{});
 const [grantDrafts,setGrantDrafts]=useState<Record<string,Record<string,boolean>>>({});
 const [roleDrafts,setRoleDrafts]=useState<Record<string,string>>({});
 const [loaded,setLoaded]=useState(Boolean(seed?.data)),[loading,setLoading]=useState(!seed),[busy,setBusy]=useState(false),[error,setError]=useState(seed?.error??""),[notice,setNotice]=useState("");
 const [email,setEmail]=useState(""),[role,setRole]=useState("viewer"),[password,setPassword]=useState("");
 const [secretLink,setSecretLink]=useState(""),[subject,setSubject]=useState(""),[issue,setIssue]=useState(""),[find,setFind]=useState("");
 const [roleFilter,setRoleFilter]=useState("all"),[matrixOpen,setMatrixOpen]=useState(true);
 const [pendingAction,setPendingAction]=useState<{action:string;target:string;data:Record<string,unknown>}|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const askPassword=(action:string,target:string,data:Record<string,unknown>={})=>{setPassword("");setPendingAction({action,target,data});dialog.current?.showModal()};
 const closePassword=()=>{dialog.current?.close();setPassword("");setPendingAction(null);setRoleDrafts({})};
 const confirmPassword=async()=>{if(!pendingAction||!password.trim())return;const ok=await command(pendingAction.action,pendingAction.data,pendingAction.target);if(ok)closePassword()};

 const dirty=useMemo(()=>JSON.stringify(body)!==JSON.stringify(saved),[body,saved]);
 const latest=useRef({body,version,saved,save:async()=>false,discard:()=>{}});
 const memberRole=(r:string)=>({owner:t("Owner","মালিক"),admin:t("Admin","অ্যাডমিন"),editor:t("Editor","সম্পাদক"),viewer:t("Viewer","দর্শক")} as Record<string,string>)[r]??r;
 const load=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);setError("");
  try{
   const r=await fetch(base+"/"+resource+"?environment="+encodeURIComponent(environment),{credentials:"same-origin",cache:"no-store",signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
   if(!r.ok)throw Error(String(r.status));
   const d=await r.json() as ApiData;
   if(signal?.aborted)return;
   if(resource==="team"){
    if(!Array.isArray(d.members)||!Array.isArray(d.invitations))throw Error("INVALID_TEAM_RESPONSE");
    setMembers(d.members);setInvites(d.invitations);setGrants(d.grants??{});setGrantDrafts({});setRoleDrafts({});
   }else if(resource==="settings"){
    if(!d.body||typeof d.version!=="number")throw Error("INVALID_SETTINGS_RESPONSE");
    const value={...defaults,...d.body,name:d.body.name||workspaceName};setBody(value);setSaved(value);setVersion(d.version);
   }else{
    if(!Array.isArray(d.items))throw Error("INVALID_SUPPORT_RESPONSE");
    setTickets(d.items);
   }
   setLoaded(true);
  }catch(e){if(!signal?.aborted)setError(t("Unable to load workspace data. Check the connection and retry.","ওয়ার্কস্পেসের তথ্য পাওয়া যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।")+" ("+(e instanceof Error?e.message:"UNKNOWN")+")")}
  finally{if(!signal?.aborted)setLoading(false)}
 },[base,resource,environment,t,workspaceName]);
 useEffect(()=>{if(seed)return;const c=new AbortController();void Promise.resolve().then(()=>{if(!c.signal.aborted)return load(c.signal)});return()=>c.abort()},[load,seed]);
 const refresh=()=>{if(resource==="settings"&&dirty&&!window.confirm(t("Discard unsaved settings and reload?","সংরক্ষণ না করা সেটিংস বাদ দিয়ে আবার লোড করবেন?")))return;void load()};
 async function command(action:string,data:Record<string,unknown>,target?:string){
  if(busy)return false;
  setBusy(true);setError("");setNotice("");
  try{
   const sensitive=["change-role","remove-member","grants","transfer-owner"].includes(action);
   if(sensitive&&!password.trim())throw Error("PASSWORD_REQUIRED");
   const path=base+"/"+action+(target?"/"+target:"")+"?environment="+encodeURIComponent(environment);
   const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(sensitive?{...data,current_password:password}:data),signal:AbortSignal.timeout(15000)});
   const json=await response.json() as Result;
   if(!response.ok)throw Error(json.error?.code||json.code||String(response.status));
   if(json.invitation_token){
    setSecretLink(window.location.origin+"/"+locale+"/invite/"+json.invitation_token);
   }
   setPassword("");
   if(action==="settings"){
    const next=formatSettings(data.body as Settings);
    setSaved(next);setBody(next);setVersion(current=>current+1);
   }
   setNotice(t("Changes saved.","পরিবর্তন সংরক্ষণ হয়েছে।"));
   if(action!=="settings")await load();
   if(resource==="team")await teamLimit.refresh();
   if(action==="settings"||action==="transfer-owner")router.refresh();
   return true;
  }catch(e){if(resource==="team")void teamLimit.refresh();setError(planLimitMessage(e instanceof Error?e.message:"",bn,"team_members")??(t("Action not confirmed.","পরিবর্তন নিশ্চিত হয়নি।")+" "+(e instanceof Error?e.message:"")));return false}
  finally{setBusy(false)}
 }
 const saveSettings=async()=>{
  if(!canManage||busy)return false;
  const next=formatSettings(latest.current.body);
  if(next.name.length>0&&(next.name.length<2||next.name.length>120)){setError(t("Business name must be 2–120 characters.","ব্যবসার নাম ২–১২০ অক্ষরের হতে হবে।"));return false}
  for(const k of ["logo_url","support_url","legal_url"] as const)if(next[k]&&!isHttps(next[k])){setError(t("Use a valid HTTPS URL.","সঠিক HTTPS URL দিন।"));return false}
  for(const k of ["support_email","notification_email"] as const)if(next[k]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next[k])){setError(t("Enter a valid email address.","সঠিক ইমেইল ঠিকানা দিন।"));return false}
  if(Object.values(next).some(v=>v.length>500||/[\r\n\x00]/.test(v))){setError(t("A field contains unsupported characters or is too long.","কোনো ফিল্ডে ভুল অক্ষর আছে অথবা সীমা ছাড়িয়েছে।"));return false}
  return command("settings",{body:next,expected_version:latest.current.version});
 };
 useEffect(()=>{latest.current={body,version,saved,save:saveSettings,discard:()=>{setBody({...latest.current.saved});setError("")}}});
 useEffect(()=>{if(resource!=="settings"||!canManage)return;return registerDraft({id:"workspace-settings:"+workspaceId+":"+environment,isDirty:()=>JSON.stringify(latest.current.body)!==JSON.stringify(latest.current.saved),save:()=>latest.current.save(),discard:()=>latest.current.discard()})},[resource,workspaceId,environment,canManage]);
 async function invite(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(teamLimit.blocked)return;if(await command("invite",{email:email.trim().toLowerCase(),role})){setEmail("");setRole("viewer")}}
 async function support(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(await command("help",{subject:subject.trim(),message:issue.trim()})){setSubject("");setIssue("")}}
 const visible=members.filter(member=>(member.name+" "+(member.email??"")+" "+member.role).toLowerCase().includes(find.trim().toLowerCase())&&(roleFilter==="all"||member.role===roleFilter));
 const resourceTitle=resource==="team"?t("Team & permissions","টিম ও অনুমতি"):resource==="settings"?t("Workspace settings","ওয়ার্কস্পেস সেটিংস"):t("Help & feedback","সহায়তা ও মতামত");
 return <div className={resource==="team"?"ek-team-page":"ws-workbench"} aria-busy={busy}>
  <header className={resource==="team"?"tp-header":"ws-page-head"}><div><h1>{resourceTitle}</h1><p>{resource==="team"?t("People and permissions for this business.","এই ব্যবসার সদস্য ও তাদের অনুমতি।"):resource==="settings"?t("Business identity, checkout branding and customer contact.","ব্যবসার পরিচয়, চেকআউট ও যোগাযোগ।"):t("Contact support and follow your submitted requests.","সহায়তার অনুরোধ পাঠান ও অগ্রগতি দেখুন।")}</p></div><button type="button" className="ws-refresh" disabled={busy||loading} onClick={refresh}>{t("Refresh","রিফ্রেশ")}</button></header>
  {error&&<div className="ws-alert" role="alert"><span>{error}</span><button type="button" onClick={refresh} disabled={busy}>{t("Retry","আবার চেষ্টা")}</button></div>}
  {notice&&<p data-feedback="success" className="ws-note" role="status">{notice}</p>}
  {loading?<div className="ws-loading" role="status">{t("Loading workspace…","ওয়ার্কস্পেস লোড হচ্ছে…")}</div>:!loaded?<p className="ws-empty" role="status">{t("Workspace data is unavailable. Try Refresh.","ওয়ার্কস্পেসের তথ্য পাওয়া যায়নি। রিফ্রেশ করুন।")}</p>:<>
   {resource==="team"&&<>
    <PlanResourceStatus value={teamLimit} locale={locale}/>
    <div className="tp-stats" aria-label={t("Team summary","টিমের সারসংক্ষেপ")}><div><span>{t("Active members","সক্রিয় সদস্য")}</span><strong>{members.length}</strong></div><div><span>{t("Pending invites","অপেক্ষমাণ আমন্ত্রণ")}</span><strong>{invites.length}</strong></div><div><span>{t("Your role","আপনার দায়িত্ব")}</span><strong className="tp-stat-role">{isOwner?t("Owner","মালিক"):canManage?t("Admin","অ্যাডমিন"):t("Member","সদস্য")}</strong></div></div>
    <div className="tp-columns"><div className="tp-column">
     <section className="tp-panel">
      <div className="tp-panel-header"><h2>{t("Members","সদস্য")}</h2><p>{t("Who belongs to this workspace.","এই ওয়ার্কস্পেসের সদস্যরা।")}</p></div>
      <div className="tp-search-row"><input type="search" aria-label={t("Search members","সদস্য খুঁজুন")} value={find} onChange={e=>setFind(e.target.value)} placeholder={t("Search by name or email","নাম বা ইমেইল লিখে খুঁজুন")}/><select aria-label={t("Filter by role","দায়িত্ব অনুযায়ী খুঁজুন")} value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">{t("All roles","সব দায়িত্ব")}</option>{["owner","admin","editor","viewer"].map(r=><option value={r} key={r}>{memberRole(r)}</option>)}</select></div>
      {visible.length===0?<div className="tp-empty"><strong>{t("No matching members","কোনো সদস্য পাওয়া যায়নি")}</strong><span>{t("Try another search or role.","অন্য নাম বা দায়িত্ব দিয়ে খুঁজুন।")}</span></div>:
      <div className="tp-members">{visible.map(member=>{
       const editable=canManage&&member.id!==userId&&(isOwner||!["owner","admin"].includes(member.role));
       const draft=roleDrafts[member.id]??member.role,grantEdits=grantDrafts[member.id]??{};
       return <div className="tp-member" key={member.id}>
        <div className="tp-avatar">{(member.name||member.email||"?").slice(0,1).toUpperCase()}</div>
        <div className="tp-member-name"><div><strong>{member.name||member.email||t("Member","সদস্য")}</strong>{member.id===userId&&<span className="tp-you">{t("You","আপনি")}</span>}</div><small>{member.email??t("Email hidden","ইমেইল গোপন")}</small></div>
        <span className="tp-presence">{member.id===userId?t("Your account","আপনার অ্যাকাউন্ট"):member.joined_at?t("Joined","যোগ দিয়েছেন")+" "+at(member.joined_at,locale):""}</span>
        {editable?<div className="tp-role-actions"><select aria-label={t("Member role","সদস্যের দায়িত্ব")} value={draft} disabled={busy} onChange={e=>{const next=e.target.value;setRoleDrafts(d=>({...d,[member.id]:next}));if(next!==member.role){setPassword("");setPendingAction({action:"change-role",target:member.id,data:{role:next}});dialog.current?.showModal()}}}>{(isOwner?["admin","editor","viewer"]:["editor","viewer"]).map(r=><option key={r} value={r}>{memberRole(r)}</option>)}</select><button className="tp-remove" type="button" disabled={busy} onClick={()=>askPassword("remove-member",member.id)}>{t("Remove","সরান")}</button></div>:
        <span className="tp-tag">{memberRole(member.role)}</span>}
        {isOwner&&member.id!==userId&&member.role!=="owner"&&<details className="tp-member-permissions"><summary>{t("Advanced permissions","অতিরিক্ত অনুমতি")}</summary>
          <div className="tp-grants">{caps.map(([key,en,bengali])=><label key={key}><input type="checkbox" disabled={busy} checked={grantEdits[key]??(grants[member.id]?.[key]!==false)} onChange={e=>setGrantDrafts(old=>({...old,[member.id]:{...(old[member.id]??{}),[key]:e.target.checked}}))}/>{bn?bengali:en}</label>)}</div>
          <div className="tp-advanced-actions"><button type="button" disabled={busy||Object.keys(grantEdits).length===0} onClick={()=>askPassword("grants",member.id,grantEdits)}>{t("Save permissions","অনুমতি সংরক্ষণ")}</button><button type="button" className="tp-remove" disabled={busy} onClick={()=>askPassword("transfer-owner",member.id)}>{t("Transfer ownership","মালিকানা হস্তান্তর")}</button></div>
        </details>}
       </div>})}</div>}
     </section>
     <section className="tp-panel"><button className="tp-fold" type="button" aria-expanded={matrixOpen} onClick={()=>setMatrixOpen(v=>!v)}><span><strong>{t("Roles & permissions","দায়িত্ব ও অনুমতি")}</strong><small>{t("An overview of standard roles. Server rules apply.","প্রচলিত দায়িত্বের তালিকা। সার্ভারের নিয়ম প্রযোজ্য।")}</small></span><span className={matrixOpen?"tp-chevron open":"tp-chevron"} aria-hidden="true">⌄</span></button>
      {matrixOpen&&<div className="tp-matrix-wrap"><table className="tp-matrix"><thead><tr><th scope="col"></th>{["owner","admin","editor","viewer"].map(r=><th key={r} scope="col">{memberRole(r)}</th>)}</tr></thead><tbody>{[
       [t("View payments & reports","পেমেন্ট ও রিপোর্ট দেখা"),1,1,1,1],
       [t("Issue refunds","রিফান্ড দেওয়া"),1,1,0,0],
       [t("Manage API keys","API key পরিচালনা"),1,1,0,0],
       [t("Store settings","স্টোর সেটিংস"),1,1,0,0],
       [t("Manage team","টিম পরিচালনা"),1,1,0,0],
       [t("Billing & usage","বিল ও ব্যবহার"),1,0,0,0]
      ].map((row,i)=><tr key={i}><th scope="row">{row[0]}</th>{row.slice(1).map((v,j)=><td key={j}>{v?<span className="tp-yes" aria-label={t("Allowed","অনুমোদিত")}>✓</span>:<span className="tp-no">–</span>}</td>)}</tr>)}</tbody></table></div>}
     </section>
    </div><div className="tp-column">
     {canManage&&<section className="tp-panel"><div className="tp-panel-header"><h2>{t("Invite a teammate","সহকর্মী আমন্ত্রণ")}</h2><p>{t("Creates a private invitation link. No email is sent automatically.","গোপন আমন্ত্রণ লিংক তৈরি হবে; ইমেইল পাঠানো হবে না।")}</p></div>
      <form className="tp-invite" onSubmit={invite}><label>{t("Email","ইমেইল")}<input value={email} type="email" maxLength={254} required autoComplete="off" placeholder="name@company.com" disabled={busy} onChange={e=>setEmail(e.target.value)}/></label><label>{t("Role","দায়িত্ব")}<select value={role} disabled={busy} onChange={e=>setRole(e.target.value)}>{(isOwner?["admin","editor","viewer"]:["editor","viewer"]).map(r=><option key={r} value={r}>{memberRole(r)}</option>)}</select><small className="tp-role-hint">{role==="viewer"?t("Can view payments and reports.","পেমেন্ট ও রিপোর্ট দেখতে পারবেন।"):role==="editor"?t("Can work on assigned payment operations.","নির্ধারিত পেমেন্ট কাজ করতে পারবেন।"):t("Can manage team access.","টিমের অনুমতি পরিচালনা করতে পারবেন।")}</small></label><button className="tp-primary" disabled={busy||teamLimit.blocked||!email.trim()}>{t("Create invite","আমন্ত্রণ তৈরি")}</button></form>
     </section>}
     {secretLink&&<section className="tp-panel"><div className="tp-panel-header"><h2>{t("Invitation link","আমন্ত্রণ লিংক")}</h2><p>{t("Only share with the intended person.","শুধু নির্দিষ্ট ব্যক্তির সঙ্গে শেয়ার করুন।")}</p></div><div className="tp-secret"><input readOnly value={secretLink} aria-label={t("Private invitation URL","গোপন আমন্ত্রণ লিংক")}/><div><button type="button" onClick={()=>void navigator.clipboard.writeText(secretLink).then(()=>setNotice(t("Copied","কপি হয়েছে"))).catch(()=>setError(t("Copy failed","কপি হয়নি")))}>{t("Copy link","লিংক কপি")}</button><button type="button" onClick={()=>setSecretLink("")}>{t("Done","শেষ")}</button></div></div></section>}
     <section className="tp-panel"><div className="tp-panel-header"><h2>{t("Pending invites","অপেক্ষমাণ আমন্ত্রণ")}</h2></div>
      {invites.length===0?<div className="tp-empty"><strong>{t("No pending invites","কোনো আমন্ত্রণ বাকি নেই")}</strong><span>{t("Invites you create will appear here.","নতুন আমন্ত্রণ এখানে দেখা যাবে।")}</span></div>:<div className="tp-invites">{invites.map(inv=><article key={inv.id}><div><strong>{inv.email}</strong><small>{memberRole(inv.role)} · {t("Expires","মেয়াদ")} {at(inv.expires_at,locale)}</small></div>{canManage&&<div><button disabled={busy} type="button" onClick={()=>void command("resend-invite",{},inv.id)}>{t("Renew link","লিংক নবায়ন")}</button><button type="button" disabled={busy} onClick={()=>void command("revoke-invite",{},inv.id)}>{t("Revoke","বাতিল")}</button></div>}</article>)}</div>}
     </section>
    </div></div>
    <dialog className="tp-confirm" ref={dialog} onCancel={closePassword} onClose={()=>{setPendingAction(null);setPassword("");setRoleDrafts({})}}>
     <form method="dialog" onSubmit={e=>e.preventDefault()}><h2>{t("Confirm this change","পরিবর্তন নিশ্চিত করুন")}</h2><p>{t("Enter your current password to update team access.","টিমের অনুমতি বদলাতে বর্তমান পাসওয়ার্ড দিন।")}</p><label>{t("Current password","বর্তমান পাসওয়ার্ড")}<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><div className="tp-dialog-actions"><button type="button" onClick={closePassword}>{t("Cancel","বাতিল")}</button><button className="tp-primary" type="submit" disabled={!password.trim()||busy} onClick={()=>void confirmPassword()}>{busy?t("Working…","অপেক্ষা করুন…"):t("Confirm","নিশ্চিত করুন")}</button></div></form>
    </dialog>
   </>}
   {resource==="settings"&&<nav className="ref-settings-categories" aria-label={t("Settings categories","সেটিংস বিভাগ")}>
 {[['business-profile',t("Business identity","ব্যবসার পরিচয়"),t("Name and checkout presentation","নাম ও চেকআউটের পরিচয়"),'◈'],['customer-contact',t("Contact & policies","যোগাযোগ ও নীতিমালা"),t("Support, notices and legal links","সহায়তা, নোটিশ ও শর্তাবলি"),'↗'],['language-region',t("Language & region","ভাষা ও অঞ্চল"),t("Checkout language and timezone","চেকআউটের ভাষা ও সময়"),'◎'],...(isOwner?[['privacy-data',t("Privacy & data","গোপনীয়তা ও তথ্য"),t("Workspace data requests","ওয়ার্কস্পেসের তথ্যের অনুরোধ"),'◇']]:[])].map(([id,title,description,icon])=><a key={id} href={"#"+id}><span aria-hidden="true">{icon}</span><div><strong>{title}</strong><small>{description}</small></div><b aria-hidden="true">↗</b></a>)}
 </nav>}
 {resource==="settings"&&<div className="ws-two-col ws-settings-layout"><div className="ws-sidebar-col">
    <section className="ws-card" id="business-profile"><div className="ws-section-heading"><div><h2>{t("Business profile","ব্যবসার পরিচয়")}</h2><p>{t("What customers see at checkout.","চেকআউটে গ্রাহক যা দেখবেন।")}</p></div></div>
     <div className="ws-form ws-settings-grid">{(["name","checkout_title","checkout_description","logo_url"] as const).map(k=><label key={k}>{fields[k][bn?1:0]}<input disabled={!canManage||busy} value={body[k]} maxLength={500} onChange={e=>setBody(v=>({...v,[k]:e.target.value}))} placeholder={k==="logo_url"?"https://":undefined}/></label>)}</div>
    </section>
    <section className="ws-card" id="customer-contact"><h2>{t("Customer contact","গ্রাহকের যোগাযোগ")}</h2><div className="ws-form ws-settings-grid">{(["support_email","notification_email","support_url","legal_url"] as const).map(k=><label key={k}>{fields[k][bn?1:0]}<input type={k.endsWith("_email")?"email":"url"} disabled={!canManage||busy} value={body[k]} maxLength={500} onChange={e=>setBody(v=>({...v,[k]:e.target.value}))} placeholder={k.endsWith("_url")?"https://":undefined}/></label>)}</div></section>
   </div><div className="ws-sidebar-col">
    <section className="ws-card" id="language-region"><h2>{t("Language & region","ভাষা ও অঞ্চল")}</h2><div className="ws-form"><label>{fields.locale[bn?1:0]}<select value={body.locale} disabled={!canManage||busy} onChange={e=>setBody(v=>({...v,locale:e.target.value}))}><option value="bn">বাংলা</option><option value="en">English</option></select></label><label>{fields.timezone[bn?1:0]}<input value={body.timezone} disabled={!canManage||busy} maxLength={120} onChange={e=>setBody(v=>({...v,timezone:e.target.value}))} list="ws-common-timezones"/><datalist id="ws-common-timezones"><option value="Asia/Dhaka"/><option value="UTC"/><option value="Asia/Kolkata"/></datalist></label></div></section>
    {canManage&&<section className="ws-card ws-sticky-actions"><h2>{t("Save your changes","পরিবর্তন সংরক্ষণ")}</h2><p className="ws-muted">{dirty?t("You have unsaved settings.","সংরক্ষণ না করা পরিবর্তন আছে।"):t("All changes are saved.","সব পরিবর্তন সংরক্ষিত আছে।")}</p><div className="ws-row"><button className="ws-primary" disabled={busy||loading||!dirty} type="button" onClick={()=>void saveSettings()}>{busy?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save settings","সেটিংস সংরক্ষণ")}</button><button type="button" disabled={busy||!dirty} onClick={()=>latest.current.discard()}>{t("Discard","বাতিল")}</button></div></section>}
    {isOwner&&<section className="ws-card" id="privacy-data"><h2>{t("Privacy & data","গোপনীয়তা ও তথ্য")}</h2><PaymentPrivacy locale={locale} workspaceId={workspaceId}/></section>}
   </div></div>}
   {resource==="help"&&<div className="ws-two-col ws-help-layout"><section className="ws-card"><h2>{t("Request support","সহায়তা চান")}</h2><p className="ws-muted">{t("Please do not include passwords, API keys, full payment SMS or other secrets.","পাসওয়ার্ড, API key বা সম্পূর্ণ পেমেন্ট SMS শেয়ার করবেন না।")}</p><form className="ws-form" onSubmit={support}><label>{t("Subject","বিষয়")}<input required minLength={3} maxLength={160} disabled={busy} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t("Describe the issue","সমস্যা লিখুন")}<textarea required rows={6} minLength={10} maxLength={4000} disabled={busy} value={issue} onChange={e=>setIssue(e.target.value)}/></label><button className="ws-primary" type="submit" disabled={busy||subject.trim().length<3||issue.trim().length<10}>{t("Submit request","অনুরোধ পাঠান")}</button></form></section>
    <section className="ws-card"><h2>{t("Your support requests","আপনার সহায়তার অনুরোধ")}</h2>{!tickets.length?<div className="ws-empty">{t("No support requests yet.","এখনো কোনো সহায়তার অনুরোধ নেই।")}</div>:<div className="ws-tickets">{tickets.map(ticket=><article key={ticket.id}><div className="ws-ticket-head"><strong>{ticket.subject}</strong><span>{ticket.status}</span></div><time>{at(ticket.created_at,locale)}</time><p>{ticket.message}</p>{!!ticket.replies?.length&&<details><summary>{t("Replies","উত্তর")} ({ticket.replies.length})</summary>{ticket.replies.map((reply,i)=><blockquote key={i}><p>{reply.message}</p><time>{at(reply.created_at,locale)}</time></blockquote>)}</details>}</article>)}</div>}</section>
   </div>}
  </>}
 </div>;
}
