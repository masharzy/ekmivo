"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import {SavedReplyPreview,type SavedReply,type ReplyPart} from "./saved-reply-editor";
import styles from "./growth-operations.module.css";
type Campaign={id:string;title:string;revision:number;status:string};
type Preview={recipient_previews?:{id:string;name:string}[];token:string;recipients:number;messages:ReplyPart[];coupon?:{code:string;kind:string;value:number;minimum_minor:number;max_discount_minor:number|null;per_customer_limit:number;expires_at:string};campaign_title:string;channel:string};
type Run={id:string;status:string;channel:string;test_customer:string|null;due_at:string;expires_at:string;recipients:number;blocked:number;messages_sent:number;messages_failed_or_unknown:number};
type Data={items:Run[];replies:SavedReply[]};
export function BroadcastDispatch({workspaceId,environment,bn,campaigns}:{workspaceId:string;environment:"live"|"sandbox";bn:boolean;campaigns:Campaign[]}){
 const t=(en:string,be:string)=>bn?be:en;
 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [campaignId,setCampaignId]=useState(""),[replyId,setReplyId]=useState(""),[channel,setChannel]=useState("messenger"),[testCustomer,setTestCustomer]=useState(""),[schedule,setSchedule]=useState(""),[expiryHours,setExpiryHours]=useState(24),[zone,setZone]=useState("Asia/Dhaka"),[quietStart,setQuietStart]=useState(""),[quietEnd,setQuietEnd]=useState("");
 const [couponCode,setCouponCode]=useState("");
 const [testChoices,setTestChoices]=useState<{id:string;name:string}[]>([]);
 const [query,setQuery]=useState(""),[offset,setOffset]=useState(0),[preview,setPreview]=useState<Preview|null>(null),[confirmed,setConfirmed]=useState(false);
 const lock=useRef(false),operation=useRef<{fingerprint:string;key:string}|null>(null);
 const endpoint=`/api/go/workspaces/${workspaceId}/growth?environment=${environment}`;
 const invalidate=()=>{setPreview(null);setConfirmed(false);};
 const selectedCampaign=campaigns.find(c=>c.id===campaignId),selectedReply=data?.replies.find(r=>r.id===replyId);
 async function load(nextOffset=offset){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");
  try{const response=await fetch(endpoint+`&kind=broadcast-runs&q=${encodeURIComponent(query)}&cursor=${nextOffset}`,{cache:"no-store"});if(!response.ok)throw Error("HTTP "+response.status);setData(await response.json() as Data);setOffset(nextOffset);invalidate();}
  catch(e){setError(t("Delivery source unavailable. Retry to inspect current results.","পাঠানোর তথ্য পাওয়া যাচ্ছে না। বর্তমান ফলাফল দেখতে আবার চেষ্টা করুন।")+" "+String(e));}
  finally{lock.current=false;setBusy(false);}
 }
 async function command(action:string,body:Record<string,unknown>){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
  const fingerprint=JSON.stringify({action,body});if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,body,operation_key:operation.current.key})});
   if(!response.ok)throw Error("HTTP "+response.status);
   const result=await response.json();operation.current=null;
   if(action==="broadcast-preview"){setPreview(result as Preview);setTestChoices((result as Preview).recipient_previews??[]);setConfirmed(false);}else{invalidate();setNotice(action==="broadcast-cancel"?t("Cancelled. Messages already sending or accepted cannot be recalled.","বাতিল হয়েছে। ইতিমধ্যে পাঠানো বা গ্রহণ করা মেসেজ ফেরত নেওয়া যাবে না।"):t("Approved for the displayed audience and message revision. Refresh results to follow dispatch.","দেখানো গ্রাহক দল ও মেসেজের সংস্করণ অনুমোদিত। পাঠানোর ফলাফল রিফ্রেশ করে দেখুন।"));}
  }catch(e){setError(t("Operation not confirmed. Retry the unchanged request; never approve another copy to recover a timeout.","কাজ নিশ্চিত হয়নি। একই তথ্য রেখে আবার চেষ্টা করুন; টাইমআউটের জন্য নতুন কপি অনুমোদন করবেন না।")+" "+String(e));}
  finally{lock.current=false;setBusy(false);}
 }
 const content=()=>({campaign_id:selectedCampaign?.id,campaign_revision:selectedCampaign?.revision,reply_id:selectedReply?.id,reply_revision:selectedReply?.revision,channel,test_customer:testCustomer||null,coupon_code:couponCode||null});
 function approve(){
  if(!preview||!confirmed)return;
  // Keep the schedule fixed across timeout retries, including the "now" case.
  const old=operation.current;
  if(old){const previous=JSON.parse(old.fingerprint) as {action:string;body:Record<string,unknown>};if(previous.action==="broadcast-approve"){void command(previous.action,previous.body);return;}}
  const due=schedule?new Date(schedule):new Date();
  void command("broadcast-approve",{...content(),preview_token:preview.token,confirmed:true,due_at:due.toISOString(),expires_at:new Date(due.getTime()+expiryHours*3600000).toISOString(),time_zone:zone,quiet_start:quietStart||null,quiet_end:quietEnd||null});
 }
 return <section className={styles.panel} aria-label={t("Broadcast delivery","ব্রডকাস্ট পাঠানো")} aria-busy={busy}>
 <h2>{t("Review and approve delivery","যাচাই করে পাঠানোর অনুমতি দিন")}</h2>
 <p>{t("Only Messenger and Instagram customers with verified channel consent and a current conversation window are eligible. Outside-window templates, WhatsApp, email and SMS delivery are unavailable here. The draft is planning text; the selected saved sequence is the exact outgoing content.","যাচাইকৃত চ্যানেল সম্মতি ও কথোপকথনের বর্তমান সময়সীমা আছে এমন Messenger ও Instagram গ্রাহকরাই যোগ্য। সময়সীমার বাইরের template, WhatsApp, ইমেইল ও SMS এখানে পাঠানো যাবে না। ড্রাফট পরিকল্পনার লেখা; বেছে নেওয়া সংরক্ষিত মেসেজই পাঠানো হবে।")}</p>
 <p><Link href="/inbox">{t("Manage saved messages in Inbox","ইনবক্সে সংরক্ষিত মেসেজ পরিচালনা করুন")}</Link></p>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <label>{t("Find saved message","সংরক্ষিত মেসেজ খুঁজুন")}<input maxLength={100} value={query} disabled={busy} onChange={e=>setQuery(e.target.value)}/></label>
 <button type="button" disabled={busy} onClick={()=>void load(0)}>{t("Load delivery review","পাঠানোর তথ্য দেখুন")}</button>
 {data&&<><fieldset disabled={busy} onChange={invalidate}><legend>{t("Audience and outgoing content","গ্রাহক দল ও মেসেজ")}</legend>
 <label>{t("Broadcast campaign","ব্রডকাস্ট ক্যাম্পেইন")}<select value={campaignId} onChange={e=>setCampaignId(e.target.value)}><option value="">{t("Choose campaign","ক্যাম্পেইন বেছে নিন")}</option>{campaigns.filter(c=>c.status!=="archived").map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
 <label>{t("Saved message sequence","সংরক্ষিত মেসেজের ক্রম")}<select value={replyId} onChange={e=>setReplyId(e.target.value)}><option value="">{t("Choose saved sequence","মেসেজ বেছে নিন")}</option>{data.replies.slice(0,50).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
 <div className={styles.actions}><button type="button" disabled={offset===0} onClick={()=>void load(Math.max(0,offset-50))}>{t("Previous replies","আগের মেসেজ")}</button><button type="button" disabled={data.replies.length<51||offset>=10000} onClick={()=>void load(offset+50)}>{t("Next replies","পরের মেসেজ")}</button></div>
 {selectedReply&&<SavedReplyPreview reply={selectedReply} bn={bn} customerName={t("Customer name","গ্রাহকের নাম")}/>}
 <label>{t("Audience-bound coupon code (optional)","নির্দিষ্ট গ্রাহক দলের কুপন কোড (ঐচ্ছিক)")}<input value={couponCode} maxLength={40} onChange={e=>setCouponCode(e.target.value)}/></label>
 <p>{t("The offer must include every preview recipient and remain valid through delivery expiry. Put its code in the saved message before previewing. Customers explicitly send START OFFERS on the connected Messenger/Instagram account to opt in; STOP remains permanent and is never undone by START OFFERS.","অফারে প্রিভিউয়ের প্রত্যেক গ্রাহক থাকতে হবে এবং পাঠানোর মেয়াদ পর্যন্ত অফার সক্রিয় থাকতে হবে। প্রিভিউয়ের আগে সংরক্ষিত মেসেজে কুপন কোড লিখুন। সম্মতির জন্য গ্রাহক সংযুক্ত Messenger/Instagram-এ START OFFERS পাঠাবেন; STOP স্থায়ী এবং START OFFERS দিয়ে তা বাতিল হয় না।")}</p>
 <label>{t("Delivery channel","পাঠানোর চ্যানেল")}<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="messenger">Messenger</option><option value="instagram">Instagram</option></select></label>
 <label>{t("Test recipient (preview audience first)","পরীক্ষার গ্রাহক (আগে গ্রাহক দলের প্রিভিউ দেখুন)")}<select value={testCustomer} onChange={e=>setTestCustomer(e.target.value)}><option value="">{t("Entire eligible segment","সম্পূর্ণ যোগ্য গ্রাহক দল")}</option>{testChoices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>{t("Schedule (browser local time; empty means now)","সময়সূচি (ব্রাউজারের সময়; খালি হলে এখনই)")}<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label>
 <label>{t("Offer/delivery expires after hours","অফার/পাঠানোর মেয়াদ ঘণ্টা")}<input type="number" min={1} max={168} value={expiryHours} onChange={e=>setExpiryHours(Number(e.target.value))}/></label>
 <label>{t("Quiet-hours timezone","নীরব সময়ের টাইমজোন")}<input value={zone} maxLength={80} onChange={e=>setZone(e.target.value)}/></label>
 <div className={styles.two}><label>{t("Quiet hours start (optional)","নীরব সময় শুরু (ঐচ্ছিক)")}<input type="time" value={quietStart} onChange={e=>setQuietStart(e.target.value)}/></label><label>{t("Quiet hours end","নীরব সময় শেষ")}<input type="time" value={quietEnd} onChange={e=>setQuietEnd(e.target.value)}/></label></div>
 </fieldset>
 <button type="button" disabled={busy||!selectedCampaign||!selectedReply} onClick={()=>void command("broadcast-preview",content())}>{t("Preview eligible audience","যোগ্য গ্রাহক দল দেখুন")}</button>
 {preview&&<div className={styles.notice}><h3>{t("Approval preview","অনুমোদনের প্রিভিউ")}</h3><p>{preview.coupon&&<strong>{t("Offer","অফার")}: {preview.coupon.code} · {preview.coupon.kind==="percent"?new Intl.NumberFormat(bn?"bn-BD":"en-GB").format(preview.coupon.value/100)+"%":preview.coupon.kind==="shipping"?t("Shipping discount","ডেলিভারি ছাড়"):new Intl.NumberFormat(bn?"bn-BD":"en-GB",{style:"currency",currency:"BDT"}).format(preview.coupon.value/100)} · {new Date(preview.coupon.expires_at).toLocaleString(bn?"bn-BD":"en-GB")}<br/></strong>}{preview.campaign_title} · {preview.channel} · {t("Recipients:","গ্রাহক:")} {preview.recipients}</p>{preview.coupon&&<p>{t("Minimum order","ন্যূনতম অর্ডার")}: {new Intl.NumberFormat(bn?"bn-BD":"en-GB",{style:"currency",currency:"BDT"}).format(preview.coupon.minimum_minor/100)} · {t("Per customer limit","প্রতি গ্রাহকের সীমা")}: {preview.coupon.per_customer_limit} · {t("Maximum discount","সর্বোচ্চ ছাড়")}: {preview.coupon.max_discount_minor===null?t("No additional cap","বাড়তি সীমা নেই"):new Intl.NumberFormat(bn?"bn-BD":"en-GB",{style:"currency",currency:"BDT"}).format(preview.coupon.max_discount_minor/100)}. {t("Approval does not reserve a redemption; eligibility is checked again when redeemed.","অনুমোদনে ছাড়ের ব্যবহার সংরক্ষিত হয় না; ব্যবহারের সময় যোগ্যতা আবার যাচাই হয়।")}</p>}<SavedReplyPreview bn={bn} customerName={t("Customer name","গ্রাহকের নাম")} reply={{id:"preview",title:"",category:"",revision:0,body:"",messages:preview.messages}}/>
 <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{t("I approve this audience, message sequence and schedule. Fresh opt-outs may reduce delivery.","এই গ্রাহক দল, মেসেজের ক্রম ও সময়সূচি অনুমোদন করছি। নতুন অপ্ট-আউটে পাঠানোর সংখ্যা কমতে পারে।")}</label><button type="button" disabled={busy||!confirmed||preview.recipients===0} onClick={approve}>{testCustomer?t("Approve consented test send","সম্মতিপ্রাপ্ত পরীক্ষার মেসেজ অনুমোদন"):t("Approve scheduled broadcast","ব্রডকাস্ট অনুমোদন করুন")}</button></div>}
 <h3>{t("Latest delivery results","সাম্প্রতিক পাঠানোর ফলাফল")}</h3><button type="button" disabled={busy} onClick={()=>void load()}>{t("Refresh delivery results","পাঠানোর ফলাফল রিফ্রেশ")}</button>
 {data.items.length?data.items.map(r=><article className={styles.item} key={r.id}><strong>{r.channel} · {r.test_customer?t("Test","পরীক্ষা"):t("Audience","গ্রাহক দল")} · {r.status}</strong><p>{new Date(r.due_at).toLocaleString(bn?"bn-BD":"en-GB")} · {t("Expires","মেয়াদ")}: {new Date(r.expires_at).toLocaleString(bn?"bn-BD":"en-GB")} · {t("Recipients","গ্রাহক")} {r.recipients} · {t("Blocked","বন্ধ")} {r.blocked} · {t("Messages accepted","গ্রহণ করা মেসেজ")} {r.messages_sent} · {t("Failed/unknown","ব্যর্থ/অনিশ্চিত")} {r.messages_failed_or_unknown}</p>{r.status==="approved"&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm(t("Cancel unsent messages in this broadcast?","এই ব্রডকাস্টের না পাঠানো মেসেজ বাতিল করবেন?")))void command("broadcast-cancel",{id:r.id});}}>{t("Cancel remaining sends","বাকি মেসেজ বাতিল")}</button>}</article>):<p>{t("No approved runs yet.","এখনও কোনো পাঠানো অনুমোদিত হয়নি।")}</p>}</>}
 </section>;
}
