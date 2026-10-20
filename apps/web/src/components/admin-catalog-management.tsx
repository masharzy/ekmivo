"use client";
import {useActionState,useState} from "react";
import {adjustAdminAiCredits,saveAdminProvider,createAdminWorkspace,type AdminCatalogState} from "../actions/admin-catalog";
type Provider={code:string;display_name:string;logo_url:string;provider_type:string;status:string;visible_in_add_account:boolean;checkout_enabled:boolean;live_enabled:boolean;verification_supported:boolean;sort_order:number};
type Workspace={id:string;name:string;balance:number;reserved:number};
type CreditEntry={id:string;workspace:string;delta:number;balance_after:number;reason:string;actor:string;created_at:string};
const empty:AdminCatalogState={status:"idle",message:""};
const supported=new Set(["bkash","nagad","rocket"]);
function ProviderForm({provider,onClose,locale}:{provider?:Provider;onClose:()=>void;locale:"en"|"bn"}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [state,run,pending]=useActionState(saveAdminProvider,empty);
 const [code,setCode]=useState(provider?.code||""),[mode,setMode]=useState(provider?.status||"draft");
 const key=code.toLowerCase().trim();
 return <div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="pa-dialog pa-admin-modal" role="dialog" aria-modal="true" aria-label={provider?t("Edit provider","প্রোভাইডার সম্পাদনা"):t("New provider","নতুন প্রোভাইডার")}>
   <div className="pa-dialog-head"><h2>{provider?t("Edit provider","প্রোভাইডার সম্পাদনা"):t("New provider","নতুন প্রোভাইডার")}</h2><button type="button" className="pa-icon-button" onClick={onClose} aria-label={t("Close","বন্ধ")}>×</button></div>
   <form action={run}>
    <div className="pa-dialog-body pa-admin-fields">
     <label>{t("Display name","প্রদর্শনের নাম")}<input name="name" required minLength={2} maxLength={90} defaultValue={provider?.display_name||""}/></label>
     <label>{t("Provider code","প্রোভাইডার কোড")}<input name="code" required pattern="[a-z][a-z0-9_]{1,39}" readOnly={!!provider} value={code} onChange={e=>setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/></label>
     <label>{t("Upload logo — PNG / JPEG / WebP, up to 500 KB","লোগো আপলোড — PNG / JPEG / WebP, সর্বোচ্চ ৫০০ KB")}<input type="file" name="logo_file" accept="image/png,image/jpeg,image/webp"/></label>
     <label>{t("Logo URL / existing asset","লোগোর URL / আগের ফাইল")}<input name="logo_url" defaultValue={provider?.logo_url||""} placeholder="/payment-assets/provider.png"/></label>
     <div className="pa-admin-form-pair"><label>{t("Provider type","প্রোভাইডারের ধরন")}<select name="type" defaultValue={provider?.provider_type||"Mobile wallet"}><option>Mobile wallet</option><option>Bank</option><option>Other</option></select></label>
      <label>{t("Order","ক্রম")}<input name="sort_order" type="number" min="0" max="100000" defaultValue={provider?.sort_order??100}/></label></div>
     <label>{t("Status","অবস্থা")}<select name="status" value={mode} onChange={e=>setMode(e.target.value)}>
      <option value="draft">Draft</option><option value="published" disabled={!supported.has(key)}>Published</option><option value="retired">Retired</option>
     </select></label>
     {!supported.has(key)&&<p className="pa-subtle">{t("New providers remain in draft until payment verification is supported.","নতুন মাধ্যমের পেমেন্ট যাচাই চালু না হওয়া পর্যন্ত খসড়া থাকবে।")}</p>}
     <div className="pa-admin-switches">
       <label><span>{t("Visible in Add Account","অ্যাকাউন্ট যোগে দেখাবে")}</span><input type="checkbox" name="visible" defaultChecked={provider?.visible_in_add_account??true}/></label>
       <label><span>{t("Selectable at checkout","চেকআউটে নির্বাচনযোগ্য")}</span><input type="checkbox" name="checkout" defaultChecked={provider?.checkout_enabled??false}/></label>
       <label><span>{t("Available in live mode","লাইভ মোডে চালু")}</span><input type="checkbox" name="live" defaultChecked={provider?.live_enabled??false}/></label>
     </div>
     <label>{t("Audit reason","পরিবর্তনের কারণ")}<textarea name="reason" minLength={10} maxLength={500} required placeholder="Explain this catalog change"/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <p className="pa-subtle">{t("Publishing requires runtime verification support and recent Super Admin MFA.","প্রকাশ করতে পেমেন্ট যাচাই সাপোর্ট ও সাম্প্রতিক Super Admin MFA প্রয়োজন।")}</p>
    </div>
    <div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={onClose}>{t("Cancel","বাতিল")}</button><button type="submit" className="pa-button pa-button-primary" disabled={pending}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save provider","প্রোভাইডার সংরক্ষণ")}</button></div>
   </form>
  </div>
 </div>;
}
export function AdminProviderManager({providers,canEdit,locale}:{providers:Provider[];canEdit:boolean;locale:"en"|"bn"}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [selected,setSelected]=useState<Provider|null|undefined>(undefined);
 const [term,setTerm]=useState("");
 const filtered=providers.filter(p=>(p.display_name+" "+p.code).toLowerCase().includes(term.toLowerCase())).sort((a,b)=>a.sort_order-b.sort_order);
 return <>
  <div className="pa-page-head"><div><h1>{t("Payment Providers","পেমেন্ট প্রোভাইডার")}</h1><p>{t("Methods shown in Payment Methods → Add Account.","পেমেন্ট মাধ্যম → অ্যাকাউন্ট যোগ-এ যে মাধ্যমগুলো দেখাবে।")}</p></div>{canEdit&&<button type="button" className="pa-button pa-button-primary" onClick={()=>setSelected(null)}>{t("New provider","নতুন প্রোভাইডার")}</button>}</div>
  <section className="pa-surface pa-table-card">
   <div className="pa-filter-bar pa-admin-table-search"><input type="search" placeholder={t("Search providers","প্রোভাইডার খুঁজুন")} aria-label={t("Search providers","প্রোভাইডার খুঁজুন")} value={term} onChange={e=>setTerm(e.target.value)}/></div>
   <div className="pa-table-wrap"><table><thead><tr><th>{t("Provider","প্রোভাইডার")}</th><th>{t("Type","ধরন")}</th><th>{t("Catalog","ক্যাটালগ")}</th><th>{t("Verification","যাচাই")}</th><th>{t("Add Account","অ্যাকাউন্ট যোগ")}</th><th>{t("Checkout","চেকআউট")}</th><th>{t("Order","ক্রম")}</th><th></th></tr></thead>
    <tbody>{filtered.map(p=><tr key={p.code}><td><span className="pa-admin-provider-row">{p.logo_url?<img src={p.logo_url} alt={p.display_name+" logo"} width={30} height={30}/>:<span className="pa-admin-provider-letter">{p.display_name[0]}</span>}<span><strong>{p.display_name}</strong><small>{p.code}</small></span></span></td>
     <td>{p.provider_type}</td><td>{p.status}</td><td>{p.verification_supported?t("Supported","চালু"):t("Not supported","চালু নেই")}</td><td>{p.status==="published"&&p.visible_in_add_account?t("Visible","দৃশ্যমান"):t("Hidden","লুকানো")}</td><td>{p.checkout_enabled?t("Enabled","চালু"):t("Disabled","বন্ধ")}</td><td>{p.sort_order}</td><td>{canEdit&&<button type="button" className="pa-button" onClick={()=>setSelected(p)}>{t("Manage","পরিচালনা")}</button>}</td></tr>)}
     {!filtered.length&&<tr><td colSpan={8} className="pa-empty-row">{t("No matching providers.","কোনো প্রোভাইডার পাওয়া যায়নি।")}</td></tr>}</tbody></table></div>
  </section>
  <section className="pa-surface pa-admin-catalog-preview"><div className="pa-split-head"><h2>{t("What merchants see","মার্চেন্ট যা দেখবে")}</h2><span className="pa-subtle">{t("Provider picker","প্রোভাইডার নির্বাচন")}</span></div>
   <div className="pa-admin-provider-grid">{providers.filter(p=>p.status==="published"&&p.visible_in_add_account&&p.verification_supported).sort((a,b)=>a.sort_order-b.sort_order).map(p=><div className="pa-admin-provider-tile" key={p.code}>{p.logo_url?<img src={p.logo_url} alt={p.display_name+" logo"} width={40} height={40}/>:<span className="pa-admin-provider-letter">{p.display_name[0]}</span>}{p.display_name}</div>)}</div>
  </section>
  {selected!==undefined&&<ProviderForm key={selected?.code||"new"} provider={selected||undefined} locale={locale} onClose={()=>setSelected(undefined)}/>}
 </>;
}
export function AdminAiCreditsManager({workspaces,entries,canEdit,locale,operationKey}:{workspaces:Workspace[];entries:CreditEntry[];canEdit:boolean;locale:"en"|"bn";operationKey:string}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [state,run,pending]=useActionState(adjustAdminAiCredits,empty);
 const money=(minor:number)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
 const [workspace,setWorkspace]=useState(workspaces[0]?.id||"");
 return <>
  <div className="pa-page-head"><div><h1>{t("AI Credits","এআই ক্রেডিট")}</h1><p>{t("Manage AI workspace credits with audited adjustments.","Audit-সহ AI ওয়ার্কস্পেসের ক্রেডিট পরিচালনা করুন।")}</p></div></div>
  <div className="pa-admin-two-col">
   <section className="pa-surface pa-table-card"><div className="pa-split-head pa-admin-section-head"><h2>{t("Balances","ব্যালেন্স")}</h2><span className="pa-subtle">{workspaces.length} {t("workspaces","ওয়ার্কস্পেস")}</span></div>
    <div className="pa-table-wrap"><table><thead><tr><th>{t("Workspace","ওয়ার্কস্পেস")}</th><th>{t("Available","ব্যবহারযোগ্য")}</th><th>{t("Reserved","রিজার্ভ")}</th></tr></thead><tbody>{workspaces.map(w=><tr key={w.id}><td>{w.name}</td><td>{money(w.balance)}</td><td>{money(w.reserved)}</td></tr>)}{!workspaces.length&&<tr><td colSpan={3} className="pa-empty-row">{t("No AI-enabled workspaces.","AI চালু থাকা ওয়ার্কস্পেস নেই।")}</td></tr>}</tbody></table></div>
   </section>
   <section className="pa-surface pa-admin-credit-form"><h2>{t("Adjust credits","ক্রেডিট পরিবর্তন")}</h2>
    {canEdit?<form action={run} className="pa-admin-fields">
     <input type="hidden" name="operation_key" value={operationKey}/>
     <label>{t("Workspace","ওয়ার্কস্পেস")}<select name="workspace_id" value={workspace} onChange={e=>setWorkspace(e.target.value)} required>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
     <label>{t("Amount in BDT (+ grant, − deduct)","টাকা (+ যোগ, − বিয়োগ)")}<input name="delta" type="number" min="-1000000" max="1000000" step="0.01" required/></label>
     <label>Audit reason<textarea name="reason" minLength={10} maxLength={500} required/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <button className="pa-button pa-button-primary" disabled={pending||!workspace}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Apply adjustment","পরিবর্তন সংরক্ষণ")}</button>
    </form>:<p className="pa-subtle">{t("Super Admin and recent MFA are required.","Super Admin ও সাম্প্রতিক MFA প্রয়োজন।")}</p>}
    <p className="pa-subtle">{t("Manual adjustments are audited; automated AI metering is not yet connected.","ম্যানুয়াল পরিবর্তন Audit-এ থাকবে; স্বয়ংক্রিয় AI মিটারিং এখনো সংযুক্ত নয়।")}</p>
   </section>
  </div>
  <section className="pa-surface pa-table-card"><div className="pa-split-head pa-admin-section-head"><h2>{t("Adjustment history","পরিবর্তনের ইতিহাস")}</h2><span className="pa-subtle">{t("Latest 100","সর্বশেষ ১০০")}</span></div>
   <div className="pa-table-wrap"><table><thead><tr><th>{t("Date","তারিখ")}</th><th>{t("Workspace","ওয়ার্কস্পেস")}</th><th>{t("Change","পরিবর্তন")}</th><th>{t("Balance after","পরের ব্যালেন্স")}</th><th>{t("Actor","যিনি করেছেন")}</th><th>{t("Reason","কারণ")}</th></tr></thead><tbody>
    {entries.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleDateString()}</td><td>{e.workspace}</td><td>{e.delta>0?"+":""}{money(e.delta)}</td><td>{money(e.balance_after)}</td><td>{e.actor}</td><td>{e.reason}</td></tr>)}
    {!entries.length&&<tr><td colSpan={6} className="pa-empty-row">{t("No adjustments yet.","এখনো কোনো পরিবর্তন নেই।")}</td></tr>}
   </tbody></table></div>
  </section>
 </>;
}

export function AdminWorkspaceCreationForm({locale="en"}:{locale?:"en"|"bn"}){
 const t=(en:string,bn:string)=>locale==="bn"?bn:en;
 const [state,run,pending]=useActionState(createAdminWorkspace,empty);
 return <form action={run} className="pa-admin-fields">
  <label>{t("Workspace name","ওয়ার্কস্পেসের নাম")}<input name="name" type="text" minLength={2} maxLength={60} required placeholder="Merchant business name"/></label>
  <label>{t("Verified owner email","যাচাইকৃত মালিকের ইমেইল")}<input name="owner_email" type="email" required placeholder="owner@example.com"/></label>
  <label>{t("Products","প্রোডাক্ট")}<select name="mode" defaultValue="commerce"><option value="commerce">Payment Gateway</option><option value="ai">AI Bot</option><option value="both">Both products</option></select></label>
  <label>Audit reason<textarea name="reason" minLength={10} maxLength={500} required placeholder="Why this workspace is being created"/></label>
  {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
  <button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?t("Creating…","তৈরি হচ্ছে…"):t("Create workspace","ওয়ার্কস্পেস তৈরি")}</button>
 </form>;
}
