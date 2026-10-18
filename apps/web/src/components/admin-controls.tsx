"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setEmailVerificationAction,setPlatformRoleAction,type AdminActionState } from "../actions/platform-admin";
type Locale="bn"|"en";
const initial:AdminActionState={status:"idle",message:""};
function SaveButton({locale}:{locale:Locale}){const {pending}=useFormStatus();return <button type="submit" className="pa-button pa-button-primary" disabled={pending}>{pending?"…":locale==="bn"?"সংরক্ষণ করুন":"Save changes"} ↗</button>;}
export function VerificationSettings({locale,enabled,providerReady}:{locale:Locale;enabled:boolean;providerReady:boolean}){
 const [state,action]=useActionState(setEmailVerificationAction.bind(null,locale),initial);
 return <section className="pa-admin-controls">
  <div className="pa-panel-head"><h2>{locale==="bn"?"ইমেইল যাচাই":"Email verification"}</h2><span>{enabled?"ENABLED":"DISABLED"}</span></div>
  <p>{locale==="bn"?"Register-এর পর ছয় সংখ্যার কোড দিয়ে email verification। ডিফল্ট OFF।":"Require six-digit email verification after registration. Default OFF."}</p>
  <form action={action} className="pa-control-form">
   <label>{locale==="bn"?"অবস্থা":"Verification requirement"}<select name="enabled" defaultValue={enabled?"on":"off"}><option value="off">OFF — {locale==="bn"?"যাচাই প্রয়োজন নেই":"No verification required"}</option><option value="on">ON — {locale==="bn"?"যাচাই প্রয়োজন":"Verification required"}</option></select></label>
   <label>{locale==="bn"?"পরিবর্তনের কারণ":"Reason (minimum 10 characters)"}<input name="reason" type="text" minLength={10} maxLength={500} required/></label>
   <label>{locale==="bn"?"CHANGE লিখে নিশ্চিত করুন":"Type CHANGE to confirm"}<input name="confirm" type="text" required pattern="CHANGE" autoComplete="off" placeholder="CHANGE"/></label>
   <SaveButton locale={locale}/>
  </form>
  {state.status!=="idle"&&<p className={state.status==="error"?"pa-error":"pa-subtle"} role="status">{state.message}</p>}
  <div className="pa-provider-status"><div><strong>Resend</strong><span>{providerReady?"CONFIGURED":"NOT CONNECTED"}</span></div><p>{locale==="bn"?"Email provider connection: Resend API key, verified sender domain এবং OTP secret সার্ভারের environment-এ দিতে হবে। Configured না হলে verification ON হবে না।":"Email provider: configure Resend API key, verified sender and OTP secret in secure server environment variables. Verification cannot be enabled without them."}</p></div>
 </section>;
}
export function RoleControls({locale,users}:{locale:Locale;users:Array<{id:string;email:string;name:string;verified:boolean;role:string|null}>}){
 const [state,action]=useActionState(setPlatformRoleAction.bind(null,locale),initial);
 return <section className="pa-admin-controls">
  <div className="pa-panel-head"><h2>{locale==="bn"?"প্ল্যাটফর্ম রোল পরিচালনা":"Platform role management"}</h2><span>RBAC</span></div>
  <p>{locale==="bn"?"শুধু যাচাইকৃত user-কে role দেওয়া যাবে। সব পরিবর্তন audit log-এ থাকবে।":"Grant roles only to verified users. Every update creates an audit entry."}</p>
  <div className="pa-role-list">{users.map(u=><div key={u.id} className="pa-role-row"><span className="pa-avatar">{u.name[0]?.toUpperCase()}</span><div><strong>{u.name}</strong><small>{u.email} · {u.verified?"Verified":"Unverified"} · {u.role||"No admin role"}</small></div></div>)}</div>
  <form action={action} className="pa-control-form">
   <label>{locale==="bn"?"সদস্য":"Team member"}<select name="userId" required defaultValue=""><option value="" disabled>{locale==="bn"?"সদস্য বেছে নিন":"Choose a team member"}</option>{users.filter(u=>u.verified).map(u=><option value={u.id} key={u.id}>{u.name} · {u.email} · {u.role||"No admin access"}</option>)}</select></label>
   <label>{locale==="bn"?"নতুন role":"Assign role"}<select name="role" defaultValue="analyst"><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="support">Support</option><option value="analyst">Analyst</option><option value="remove">Remove admin access</option></select></label>
   <label>{locale==="bn"?"পরিবর্তনের কারণ":"Reason (minimum 10 characters)"}<input name="reason" type="text" minLength={10} maxLength={500} required/></label>
   <label>{locale==="bn"?"CHANGE লিখে নিশ্চিত করুন":"Type CHANGE to confirm"}<input name="confirm" type="text" required pattern="CHANGE" autoComplete="off" placeholder="CHANGE"/></label>
   <SaveButton locale={locale}/>
  </form>
  {state.status!=="idle"&&<p className={state.status==="error"?"pa-error":"pa-subtle"} role="status">{state.message}</p>}
 </section>;
}
