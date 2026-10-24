"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {setWorkspaceProduct,type ServiceToggleState} from "../actions/workspace-products";
type Product="ai"|"payments";
type Mode="ai"|"commerce"|"both"|"off";
const initial:ServiceToggleState={status:"idle",message:""};

function ToggleSubmit({enabled,bn}:{enabled:boolean;bn:boolean}){
 const {pending}=useFormStatus();
 return <button type="submit" disabled={pending} aria-busy={pending} className="ek-workspace-product-button">
  {pending?(bn?"পরিবর্তন হচ্ছে…":"Updating…"):enabled?(bn?"বন্ধ করুন":"Disable"):(bn?"চালু করুন":"Enable")}
 </button>;
}
function ProductSwitch({locale,workspaceId,product,enabled}:{locale:"bn"|"en";workspaceId:string;product:Product;enabled:boolean}){
 const [state,action]=useActionState(setWorkspaceProduct.bind(null,locale),initial);
 const bn=locale==="bn";
 return <form action={action} className="ek-workspace-product-control">
  <input type="hidden" name="workspaceId" value={workspaceId}/>
  <input type="hidden" name="product" value={product}/>
  <input type="hidden" name="enabled" value={String(!enabled)}/>
  <div><strong>{product==="ai"?(bn?"AI ব্যবসা":"AI business"):(bn?"পেমেন্ট গেটওয়ে":"Payment gateway")}</strong>
   <span>{enabled?(bn?"এই ব্যবসায় সেবা নির্বাচিত":"Enabled for this business"):(bn?"সেবা বন্ধ":"Disabled")}</span></div>
  <ToggleSubmit bn={bn} enabled={enabled}/>
  {state.status!=="idle"&&<p role="status" className={state.status==="error"?"ek-form-error":"ek-account-success"}>{state.message}</p>}
 </form>;
}
export function WorkspaceProductControls({locale,workspaceId,mode}:{locale:"bn"|"en";workspaceId:string;mode:Mode}){
 return <section className="ek-product-settings" aria-label={locale==="bn"?"ব্যবসার সেবা সেটিংস":"Business product settings"}>
  <h3>{locale==="bn"?"সেবা কনফিগারেশন":"Product configuration"}</h3>
  <ProductSwitch locale={locale} workspaceId={workspaceId} product="payments" enabled={mode==="both"||mode==="commerce"}/>
  <ProductSwitch locale={locale} workspaceId={workspaceId} product="ai" enabled={mode==="both"||mode==="ai"}/>
  <p>{locale==="bn"?"এটি শুধু ব্যবসার সেবা অ্যাক্সেস। পেমেন্ট লাইভ, সাবস্ক্রিপশন বা provider connection সক্রিয় করে না।":"This changes business product access only. It does not activate live payments, a subscription or any provider."}</p>
 </section>;
}
