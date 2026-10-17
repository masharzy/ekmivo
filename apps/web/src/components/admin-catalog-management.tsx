"use client";
import {useActionState,useState} from "react";
import {adjustAdminAiCredits,saveAdminProvider,createAdminWorkspace,type AdminCatalogState} from "../actions/admin-catalog";
type Provider={code:string;display_name:string;logo_url:string;provider_type:string;status:string;visible_in_add_account:boolean;checkout_enabled:boolean;live_enabled:boolean;verification_supported:boolean;sort_order:number};
type Workspace={id:string;name:string;balance:number};
type CreditEntry={id:string;workspace:string;delta:number;balance_after:number;reason:string;actor:string;created_at:string};
const empty:AdminCatalogState={status:"idle",message:""};
const supported=new Set(["bkash","nagad","rocket"]);
function ProviderForm({provider,onClose}:{provider?:Provider;onClose:()=>void}){
 const [state,run,pending]=useActionState(saveAdminProvider,empty);
 const [code,setCode]=useState(provider?.code||""),[mode,setMode]=useState(provider?.status||"draft");
 const key=code.toLowerCase().trim();
 return <div className="pa-admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="pa-dialog pa-admin-modal" role="dialog" aria-modal="true" aria-label={provider?"Edit provider":"New provider"}>
   <div className="pa-dialog-head"><h2>{provider?"Edit provider":"New provider"}</h2><button type="button" className="pa-icon-button" onClick={onClose} aria-label="Close">×</button></div>
   <form action={run}>
    <div className="pa-dialog-body pa-admin-fields">
     <label>Display name<input name="name" required minLength={2} maxLength={90} defaultValue={provider?.display_name||""}/></label>
     <label>Provider code<input name="code" required pattern="[a-z][a-z0-9_]{1,39}" readOnly={!!provider} value={code} onChange={e=>setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/></label>
     <label>Logo — PNG / JPEG / WebP, up to 500 KB<input type="file" name="logo_file" accept="image/png,image/jpeg,image/webp"/></label>
     <label>Logo URL / existing asset<input name="logo_url" defaultValue={provider?.logo_url||""} placeholder="/payment-assets/provider.png"/></label>
     <div className="pa-admin-form-pair"><label>Provider type<select name="type" defaultValue={provider?.provider_type||"Mobile wallet"}><option>Mobile wallet</option><option>Bank</option><option>Other</option></select></label>
      <label>Order<input name="sort_order" type="number" min="0" max="100000" defaultValue={provider?.sort_order??100}/></label></div>
     <label>Status<select name="status" value={mode} onChange={e=>setMode(e.target.value)}>
      <option value="draft">Draft</option><option value="published" disabled={!supported.has(key)}>Published</option><option value="retired">Retired</option>
     </select></label>
     {!supported.has(key)&&<p className="pa-subtle">New provider is draft-only until its Go SMS verification and payment runtime support are implemented.</p>}
     <div className="pa-admin-switches">
       <label><span>Visible in Add Account</span><input type="checkbox" name="visible" defaultChecked={provider?.visible_in_add_account??true}/></label>
       <label><span>Selectable at checkout</span><input type="checkbox" name="checkout" defaultChecked={provider?.checkout_enabled??false}/></label>
       <label><span>Available in live mode</span><input type="checkbox" name="live" defaultChecked={provider?.live_enabled??false}/></label>
     </div>
     <label>Audit reason<textarea name="reason" minLength={10} maxLength={500} required placeholder="Explain this catalog change"/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <p className="pa-subtle">Publishing affects the provider picker only; it does not create a new verification integration. Changes require fresh Super Admin MFA.</p>
    </div>
    <div className="pa-dialog-foot"><button type="button" className="pa-button" onClick={onClose}>Cancel</button><button type="submit" className="pa-button pa-button-primary" disabled={pending}>{pending?"Saving…":"Save provider"}</button></div>
   </form>
  </div>
 </div>;
}
export function AdminProviderManager({providers,canEdit}:{providers:Provider[];canEdit:boolean}){
 const [selected,setSelected]=useState<Provider|null|undefined>(undefined);
 const [term,setTerm]=useState("");
 const filtered=providers.filter(p=>(p.display_name+" "+p.code).toLowerCase().includes(term.toLowerCase())).sort((a,b)=>a.sort_order-b.sort_order);
 return <>
  <div className="pa-page-head"><div><h1>Payment Providers</h1><p>The live catalog used by Payment Methods → Add Account.</p></div>{canEdit&&<button type="button" className="pa-button pa-button-primary" onClick={()=>setSelected(null)}>New provider</button>}</div>
  <section className="pa-surface pa-table-card">
   <div className="pa-filter-bar pa-admin-table-search"><input type="search" placeholder="Search providers" aria-label="Search providers" value={term} onChange={e=>setTerm(e.target.value)}/></div>
   <div className="pa-table-wrap"><table><thead><tr><th>Provider</th><th>Type</th><th>Catalog</th><th>Verification</th><th>Add Account</th><th>Checkout</th><th>Order</th><th></th></tr></thead>
    <tbody>{filtered.map(p=><tr key={p.code}><td><span className="pa-admin-provider-row">{p.logo_url?<img src={p.logo_url} alt={p.display_name+" logo"} width={30} height={30}/>:<span className="pa-admin-provider-letter">{p.display_name[0]}</span>}<span><strong>{p.display_name}</strong><small>{p.code}</small></span></span></td>
     <td>{p.provider_type}</td><td>{p.status}</td><td>{p.verification_supported?"Supported":"Not supported"}</td><td>{p.status==="published"&&p.visible_in_add_account?"Visible":"Hidden"}</td><td>{p.checkout_enabled?"Enabled":"Disabled"}</td><td>{p.sort_order}</td><td>{canEdit&&<button type="button" className="pa-button" onClick={()=>setSelected(p)}>Manage</button>}</td></tr>)}
     {!filtered.length&&<tr><td colSpan={8} className="pa-empty-row">No matching providers.</td></tr>}</tbody></table></div>
  </section>
  <section className="pa-surface pa-admin-catalog-preview"><div className="pa-split-head"><h2>What merchants see</h2><span className="pa-subtle">Provider picker</span></div>
   <div className="pa-admin-provider-grid">{providers.filter(p=>p.status==="published"&&p.visible_in_add_account&&p.verification_supported).sort((a,b)=>a.sort_order-b.sort_order).map(p=><div className="pa-admin-provider-tile" key={p.code}>{p.logo_url?<img src={p.logo_url} alt={p.display_name+" logo"} width={40} height={40}/>:<span className="pa-admin-provider-letter">{p.display_name[0]}</span>}{p.display_name}</div>)}</div>
  </section>
  {selected!==undefined&&<ProviderForm key={selected?.code||"new"} provider={selected||undefined} onClose={()=>setSelected(undefined)}/>}
 </>;
}
export function AdminAiCreditsManager({workspaces,entries,canEdit}:{workspaces:Workspace[];entries:CreditEntry[];canEdit:boolean}){
 const [state,run,pending]=useActionState(adjustAdminAiCredits,empty);
 const [workspace,setWorkspace]=useState(workspaces[0]?.id||"");
 return <>
  <div className="pa-page-head"><div><h1>AI Credits</h1><p>Audited credit grants and adjustments for AI-enabled workspaces.</p></div></div>
  <div className="pa-admin-two-col">
   <section className="pa-surface pa-table-card"><div className="pa-split-head pa-admin-section-head"><h2>Balances</h2><span className="pa-subtle">{workspaces.length} workspaces</span></div>
    <div className="pa-table-wrap"><table><thead><tr><th>Workspace</th><th>Credits</th></tr></thead><tbody>{workspaces.map(w=><tr key={w.id}><td>{w.name}</td><td>{w.balance.toLocaleString()}</td></tr>)}{!workspaces.length&&<tr><td colSpan={2} className="pa-empty-row">No AI-enabled workspaces.</td></tr>}</tbody></table></div>
   </section>
   <section className="pa-surface pa-admin-credit-form"><h2>Adjust credits</h2>
    {canEdit?<form action={run} className="pa-admin-fields">
     <label>Workspace<select name="workspace_id" value={workspace} onChange={e=>setWorkspace(e.target.value)} required>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
     <label>Credits (+ to grant, − to deduct)<input name="delta" type="number" min="-1000000" max="1000000" defaultValue="1000" required/></label>
     <label>Audit reason<textarea name="reason" minLength={10} maxLength={500} required/></label>
     {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
     <button className="pa-button pa-button-primary" disabled={pending||!workspace}>{pending?"Saving…":"Apply adjustment"}</button>
    </form>:<p className="pa-subtle">Super Admin permission and fresh MFA are required to change balances.</p>}
    <p className="pa-subtle">Manual grants are recorded. Automated AI model usage metering is a separate backend integration; usage is never invented here.</p>
   </section>
  </div>
  <section className="pa-surface pa-table-card"><div className="pa-split-head pa-admin-section-head"><h2>Adjustment history</h2><span className="pa-subtle">Latest 100</span></div>
   <div className="pa-table-wrap"><table><thead><tr><th>Date</th><th>Workspace</th><th>Change</th><th>Balance after</th><th>Actor</th><th>Reason</th></tr></thead><tbody>
    {entries.map(e=><tr key={e.id}><td>{new Date(e.created_at).toLocaleDateString()}</td><td>{e.workspace}</td><td>{e.delta>0?"+":""}{e.delta}</td><td>{e.balance_after.toLocaleString()}</td><td>{e.actor}</td><td>{e.reason}</td></tr>)}
    {!entries.length&&<tr><td colSpan={6} className="pa-empty-row">No adjustments yet.</td></tr>}
   </tbody></table></div>
  </section>
 </>;
}

export function AdminWorkspaceCreationForm(){
 const [state,run,pending]=useActionState(createAdminWorkspace,empty);
 return <form action={run} className="pa-admin-fields">
  <label>Workspace name<input name="name" type="text" minLength={2} maxLength={60} required placeholder="Merchant business name"/></label>
  <label>Verified owner email<input name="owner_email" type="email" required placeholder="owner@example.com"/></label>
  <label>Products<select name="mode" defaultValue="commerce"><option value="commerce">Payment Gateway</option><option value="ai">AI Bot</option><option value="both">Both products</option></select></label>
  <label>Audit reason<textarea name="reason" minLength={10} maxLength={500} required placeholder="Why this workspace is being created"/></label>
  {state.status!=="idle"&&<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>}
  <button className="pa-button pa-button-primary" type="submit" disabled={pending}>{pending?"Creating…":"Create workspace"}</button>
 </form>;
}
