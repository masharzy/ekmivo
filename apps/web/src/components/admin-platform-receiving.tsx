"use client";
import {useActionState} from "react";
import Link from "next/link";
import {setPlatformReceivingAction,type AdminActionState} from "../actions/platform-admin";
import type {Locale} from "../lib/dashboard-navigation";
const initial:AdminActionState={status:"idle",message:""};
export function AdminPlatformReceiving({locale,current,options}:{locale:Locale;current:{id:string;name:string}|null;options:{id:string;name:string}[]}){
 const bn=locale==="bn",t=(en:string,bd:string)=>bn?bd:en;
 const [state,action,pending]=useActionState(setPlatformReceivingAction.bind(null,locale),initial);
 return <section className="pa-surface pa-admin-controls pa-system-receiving">
  <div className="pa-panel-head"><h2>{t("System receiving workspace","System receiving workspace")}</h2></div>
  <p>{t("All paid plans receive money through this workspace. Only active super admins may be members. Configure receiving numbers in Payment methods and connect its SMS device.","সব paid plan-এর টাকা এই workspace-এ আসবে। শুধু সক্রিয় super admin-রা এর সদস্য হতে পারবেন। Payment methods-এ নম্বর দিন এবং SMS device যুক্ত করুন।")}</p>
  <p>{t("Selected:","নির্বাচিত:")} <strong>{current?.name||t("Not configured","সেট করা হয়নি")}</strong></p>
  <form action={action} className="pa-control-form">
   <label>{t("Workspace","ওয়ার্কস্পেস")}<select name="workspaceId" required defaultValue={current?.id||""} disabled={pending}><option value="" disabled>{t("Choose a workspace","ওয়ার্কস্পেস বেছে নিন")}</option>{options.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
   {!options.length&&<p>{t("Create a payment-enabled workspace with only super admin members first.","আগে শুধু super admin সদস্যসহ Payment gateway চালু থাকা একটি workspace তৈরি করুন।")}</p>}
   <label>{t("Reason for change","পরিবর্তনের কারণ")}<input name="reason" required minLength={10} maxLength={500} disabled={pending}/></label>
   <label>{t("Type CHANGE to confirm","CHANGE লিখে নিশ্চিত করুন")}<input name="confirm" required pattern="CHANGE" placeholder="CHANGE" autoComplete="off" disabled={pending}/></label>
   <button type="submit" className="pa-button pa-button-primary" disabled={pending||!options.length}>{pending?t("Saving…","সংরক্ষণ হচ্ছে…"):t("Save workspace","ওয়ার্কস্পেস সংরক্ষণ")}</button>
  </form>
  {state.status!=="idle"&&<p className={state.status==="error"?"pa-error":"pa-subtle"} role="status">{state.message}</p>}
  {current&&<div className="pa-page-actions"><Link className="pa-button" href={`/w/${current.id}/payments/gateways`}>{t("Payment methods","পেমেন্ট মাধ্যম")}</Link><Link className="pa-button" href={`/w/${current.id}/payments/devices`}>{t("SMS devices","SMS ডিভাইস")}</Link></div>}
  <p className="pa-subtle">{t("Changing the workspace affects new invoices. Existing invoices keep their original receiving workspace.","Workspace বদলালে নতুন invoice-এ কার্যকর হবে। আগের invoice-এর receiving workspace অপরিবর্তিত থাকবে।")}</p>
 </section>;
}
