"use client";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {changeAdminProductAction,changeAdminEnvironmentAction,revokeAdminUserSessionsAction,changeAdminUserStatusAction,revokeAdminApiKeyAction,replyAdminSupportAction,type AdminOperationState} from "../actions/platform-admin-operations";

const initial:AdminOperationState={status:"idle",message:""};
function Submit({text}:{text:string}){const {pending}=useFormStatus();return <button type="submit" disabled={pending} className="pa-button pa-button-primary">{pending?"Saving…":text}</button>;}
function Status({state}:{state:AdminOperationState}){return state.status==="idle"?null:<p role="status" className={state.status==="error"?"pa-action-error":"pa-action-success"}>{state.message}</p>;}
export function ProductAccessAction({locale,workspaceId,product,enabled}:{locale:"en"|"bn";workspaceId:string;product:"ai"|"payments";enabled:boolean}){
 const [state,action]=useActionState(changeAdminProductAction.bind(null,locale),initial);
 return <form action={action} className="pa-op-form">
  <input type="hidden" name="workspaceId" value={workspaceId}/><input type="hidden" name="product" value={product}/><input type="hidden" name="enabled" value={enabled?"off":"on"}/>
  <div className="pa-op-name"><strong>{product==="ai"?"AI Bot":"Payment gateway"}</strong><span className={"pa-status-text"+(enabled?" is-enabled":"")}>{enabled?"Enabled":"Disabled"}</span></div>
  <label>{locale==="bn"?"পরিবর্তনের কারণ (১০–৫০০ অক্ষর)":"Reason for change (10–500 characters)"}<input name="reason" type="text" minLength={10} maxLength={500} required placeholder={locale==="bn"?"কারণ লিখুন":"Explain why this access must change"}/></label>
  <label>{locale==="bn"?"নিশ্চিত করতে CHANGE লিখুন":"Type CHANGE to confirm"}<input name="confirm" type="text" required pattern="CHANGE" autoComplete="off" placeholder="CHANGE"/></label>
  <Submit text={enabled?"Disable "+(product==="ai"?"AI Bot":"Payments"):"Enable "+(product==="ai"?"AI Bot":"Payments")}/><Status state={state}/>
 </form>;
}
export function EnvironmentAction({locale,workspaceId,environment,status}:{locale:"en"|"bn";workspaceId:string;environment:"live"|"sandbox";status:string}){
 const [state,action]=useActionState(changeAdminEnvironmentAction.bind(null,locale),initial);
 const next=status==="active"?"suspended":"active";
 return <form action={action} className="pa-op-form">
  <input type="hidden" name="workspaceId" value={workspaceId}/><input type="hidden" name="environment" value={environment}/><input type="hidden" name="status" value={next}/>
  <div className="pa-op-name"><strong>{environment==="live"?"Live":"Sandbox"}</strong><span>{status==="active"?"Active":"Suspended"}</span></div>
  <label>{locale==="bn"?"পরিবর্তনের কারণ":"Reason for change"}<input name="reason" type="text" minLength={10} maxLength={500} required placeholder="At least 10 characters"/></label>
  <label>{locale==="bn"?"CHANGE লিখে নিশ্চিত করুন":"Type CHANGE to confirm"}<input name="confirm" type="text" required pattern="CHANGE" autoComplete="off" placeholder="CHANGE"/></label>
  <Submit text={next==="active"?"Resume "+environment:"Suspend "+environment}/><Status state={state}/>
 </form>;
}
export function UserSessionsAction({locale,userId,active}:{locale:"en"|"bn";userId:string;active:number}){
 const [state,action]=useActionState(revokeAdminUserSessionsAction.bind(null,locale),initial);
 return <form action={action} className="pa-op-form">
  <input type="hidden" name="userId" value={userId}/>
  <div className="pa-op-name"><strong>{locale==="bn"?"সেশন প্রত্যাহার":"Revoke sessions"}</strong><span>{active} {locale==="bn"?"সক্রিয় সেশন":"active sessions"}</span></div>
  <p className="pa-subtle">{locale==="bn"?"বর্তমান সব সক্রিয় সেশন সাইন-আউট হবে।":"All active sessions for this user will be signed out. This cannot be undone."}</p>
  <label>{locale==="bn"?"কারণ":"Reason"}<input name="reason" type="text" minLength={10} maxLength={500} required placeholder="At least 10 characters"/></label>
  <label>{locale==="bn"?"REVOKE লিখুন":"Type REVOKE to confirm"}<input name="confirm" type="text" required pattern="REVOKE" autoComplete="off" placeholder="REVOKE"/></label>
  <Submit text={locale==="bn"?"সেশন প্রত্যাহার করুন":"Revoke all active sessions"}/><Status state={state}/>
 </form>;
}
export function AdminStepUpLink({locale}:{locale:"bn"|"en"}){void locale;return null;}

export function UserStatusAction({locale,userId,disabled,protectedUser=false}:{locale:"en"|"bn";userId:string;disabled:boolean;protectedUser?:boolean}){
 const [state,action]=useActionState(changeAdminUserStatusAction.bind(null,locale),initial);
 if(protectedUser)return <p className="pa-subtle">Administrator access must first be removed through Staff roles.</p>;
 return <form action={action} className="pa-op-form">
  <input type="hidden" name="userId" value={userId}/><input type="hidden" name="status" value={disabled?"enabled":"disabled"}/>
  <div className="pa-op-name"><strong>User account</strong><span>{disabled?"Disabled":"Enabled"}</span></div>
  <label>Reason (min 10 characters)<input name="reason" type="text" required minLength={10} maxLength={500}/></label>
  <label>Type CHANGE to confirm<input name="confirm" type="text" required pattern="CHANGE" placeholder="CHANGE" autoComplete="off"/></label>
  <Submit text={disabled?"Enable account":"Disable account and revoke sessions"}/><Status state={state}/>
 </form>;
}
export function ApiKeyRevokeAction({locale,keyId,name}:{locale:"en"|"bn";keyId:string;name:string}){
 const [state,action]=useActionState(revokeAdminApiKeyAction.bind(null,locale),initial);
 return <details className="pa-surface pa-key-revoke"><summary>Revoke {name} <span>Permanent</span></summary><form action={action} className="pa-op-form">
  <input type="hidden" name="keyId" value={keyId}/>
  <p className="pa-subtle">All requests signed with this key will fail immediately. Raw key material is never displayed.</p>
  <label>Reason<input name="reason" minLength={10} maxLength={500} required type="text"/></label>
  <label>Type REVOKE to confirm<input name="confirm" type="text" required pattern="REVOKE" placeholder="REVOKE" autoComplete="off"/></label>
  <Submit text="Revoke API key"/><Status state={state}/>
 </form></details>;
}

export function AdminSupportReply({locale,ticketId}:{locale:"en"|"bn";ticketId:string}){
 const [state,action]=useActionState(replyAdminSupportAction.bind(null,locale),initial);
 return <form action={action} className="pa-op-form">
  <input type="hidden" name="ticketId" value={ticketId}/>
  <label>{locale==="bn"?"উত্তর":"Reply to customer"}<textarea name="message" required minLength={10} maxLength={4000} rows={5} placeholder="Write an actionable response; do not request payment credentials."/></label>
  <label>{locale==="bn"?"নতুন অবস্থা":"New ticket status"}<select name="status" defaultValue="reviewing"><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></select></label>
  <label>Type SEND to confirm<input type="text" name="confirm" required pattern="SEND" placeholder="SEND" autoComplete="off"/></label>
  <Submit text="Send reply"/><Status state={state}/>
 </form>;
}
