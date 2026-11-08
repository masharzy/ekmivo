"use client";
import {useEffect,useRef,useState} from "react";
import {I,ChannelBadge} from "./icons";
import {channelMeta,fullDate,initials,money,num,type OrderRow,type Profile} from "./lib";
import s from "./inbox.module.css";

type Tone="ok"|"wr"|"er"|"mu";
export function verdict(p:Profile,bn:boolean){
 const o=p.orders,by=(x:string)=>o.filter(v=>v.status===x),ok=by("ok"),cx=by("cx"),rt=by("rt"),run=by("run"),done=ok.length+cx.length+rt.length;
 const rate=done?Math.round(ok.length/done*100):null,reasons:[Tone,string][]=[];let label:string,tone:Tone;
 const t=(en:string,be:string)=>bn?be:en;
 if(!o.length){if(p.talks<=1){label=t("New customer","নতুন কাস্টমার");tone="mu";}else if(p.talks>=4){label=t("Asked many times, hasn't bought","অনেকবার জিজ্ঞেস করেছেন, কেনেননি");tone="wr";}else{label=t("Hasn't bought yet","এখনো কেনেননি");tone="mu";}}
 else if(!done){label=t("First order in progress","প্রথম অর্ডার চলছে");tone="mu";}
 else if(done<3&&rate===100){label=t("New, but a good start","নতুন, কিন্তু ভালো শুরু");tone="ok";}
 else if(done<3){label=t("Be careful","সতর্ক থাকুন");tone="er";}
 else if((rate??0)>=85){label=t("Reliable customer","ভরসাযোগ্য কাস্টমার");tone="ok";}
 else if((rate??0)>=60){label=t("Average customer","মাঝারি কাস্টমার");tone="wr";}
 else{label=t("Risky customer","ঝুঁকিপূর্ণ কাস্টমার");tone="er";}
 if(ok.length)reasons.push(["ok",t(`Accepted ${ok.length} orders`,`${num(ok.length,true)}টি অর্ডার ঠিকমতো নিয়েছেন`)]);
 if(done&&!cx.length&&!rt.length)reasons.push(["ok",t("Never cancelled or returned","কখনো বাতিল বা ফেরত দেননি")]);
 if(cx.length){const w=cx.find(x=>x.reason);reasons.push(["er",t(`Cancelled ${cx.length} orders`,`${num(cx.length,true)}বার অর্ডার বাতিল করেছেন`)+(w?(bn?`। সর্বশেষ কারণ: ${w.reason}`:`. Latest reason: ${w.reason}`):"")]);}
 if(rt.length)reasons.push(["wr",t(`Returned ${rt.length} items`,`${num(rt.length,true)}টি পণ্য ফেরত দিয়েছেন`)]);
 if(run.length)reasons.push(["mu",t(`${run.length} orders in progress`,`${num(run.length,true)}টি অর্ডার এখন চলছে`)]);
 if(done&&tone==="er")reasons.push(["wr",t("Confirm by phone before shipping; take an advance if possible","অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন")]);
 return {label,tone,rate,done,ok,cx,rt,run,reasons};
}
const stLabel=(bn:boolean):Record<string,[string,Tone]>=>({ok:[bn?"সফল":"Delivered","ok"],cx:[bn?"বাতিল":"Cancelled","er"],rt:[bn?"ফেরত":"Returned","wr"],run:[bn?"চলমান":"In progress","mu"]});
const tone2=(t:Tone,c:Record<string,string>)=>c[t];

export function ProfileView({p,bn,aiEnabled,canManage,canNote,onBack,onChat,onToggleAi,onSaveNote,toast,onClose}:{p:Profile|null;bn:boolean;aiEnabled:boolean;canManage:boolean;canNote:boolean;onBack:()=>void;onChat:()=>void;onToggleAi:()=>void;onSaveNote:(text:string,version:number)=>Promise<boolean>;toast:(t:string)=>void;onClose?:()=>void}){
 const t=(en:string,be:string)=>bn?be:en;
 const [note,setNote]=useState(""),[open,setOpen]=useState<Record<string,boolean>>({}),last=useRef({id:"",saved:""});
 useEffect(()=>{if(p&&last.current.id!==p.id){last.current={id:p.id,saved:p.note??""};setNote(p.note??"");}},[p]);
 const tone=(x:Tone)=>x==="ok"?s.tag_ok:x==="wr"?s.tag_wr:x==="er"?s.tag_er:s.tag_mu;
 async function blurNote(){
  if(!p||!canNote||note===last.current.saved)return;
  const ok=await onSaveNote(note,p.note_version??0);
  if(ok){last.current.saved=note;toast(t("Note saved","নোট সেভ হয়েছে"));}else toast(t("Couldn't save the note","নোট সেভ হয়নি"));
 }
 const body=!p?<p className={s.sheetNote}>{t("Loading…","লোড হচ্ছে…")}</p>:(()=>{
  const V=verdict(p,bn),o=p.orders,fresh=!o.length&&p.talks<=1,phone=p.phone||p.contact?.phone||"";
  const sub=[channelMeta[p.channel]?.name,p.channel==="wa"&&phone?phone:p.channel==="ig"&&p.contact?.username?"@"+p.contact.username:""].filter(Boolean).join(" · ");
  const groups=o.length?[{name:p.store||"",list:o}]:[];
  const stat=stLabel(bn);
  const kv=(k:string,v:string)=><div className={s.kv} key={k}><span className={s.k}>{k}</span><span className={s.v}>{v}</span></div>;
  const sum=V.ok.reduce((a,x)=>a+x.amount_minor,0);
  return <>
   <div className={s.hero}><div className={`${s.av} ${s.avBig}`}>{initials(p.name)}<ChannelBadge channel={p.channel} size={24}/></div><h2>{p.name}</h2><div className={s.sub}>{sub}</div><span className={`${s.tag} ${tone(V.tone)}`}>{V.label}</span></div>
   <div className={s.qa}><button type="button" onClick={onChat}><I n="msg"/>{t("Message","মেসেজ")}</button>
    {phone&&<button type="button" onClick={()=>{try{void navigator.clipboard.writeText(phone);}catch{}toast(t("Number copied","নম্বর কপি হয়েছে"));}}><I n="copy"/>{t("Copy number","নম্বর কপি")}</button>}
    {canManage&&<button type="button" onClick={onToggleAi}><I n="ms"/>{aiEnabled?t("Turn AI off","AI বন্ধ করুন"):t("Turn AI on","AI চালু করুন")}</button>}</div>
   {V.done>0?<div className={s.pfc}><div className={s.vd2}><div className={`${s.ring} ${V.tone==="wr"?s.ringWr:V.tone==="er"?s.ringEr:""}`} style={{["--p" as string]:V.rate??0} as React.CSSProperties}><i>{num(V.rate??0,bn)}%</i></div><div><b>{bn?`${num(V.done,true)}টির মধ্যে ${num(V.ok.length,true)}টি অর্ডার সফল`:`${V.ok.length} of ${V.done} orders succeeded`}</b><span>{t("Order success rate","সফল অর্ডারের হার")}</span></div></div>
    <ul className={s.rs}>{V.reasons.map((x,i)=><li key={i} className={x[0]==="ok"?s.rok:x[0]==="er"?s.rer:x[0]==="wr"?s.rwr:undefined}>{x[1]}</li>)}</ul></div>
   :o.length?<div className={s.pfc}><div className={s.emp2}><div className={s.ic}><I n="clk"/></div><div><b>{t("First order in progress","প্রথম অর্ডার চলছে")}</b><span>{t("After delivery you'll see the success rate and customer quality here.","ডেলিভারি হওয়ার পর এখানে সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।")}</span></div></div></div>
   :fresh?<div className={s.pfc}><div className={s.emp2}><div className={s.ic}><I n="bag"/></div><div><b>{t("No orders yet","এখনো কোনো অর্ডার নেই")}</b><span>{t("First time messaging. Order history, success rate and customer quality will appear here after an order.","প্রথমবার মেসেজ করেছেন। অর্ডার হলে এখানে অর্ডারের ইতিহাস, সফল অর্ডারের হার আর কেমন কাস্টমার তা দেখা যাবে।")}</span></div></div></div>
   :<div className={s.pfc}><div className={s.emp2}><div className={s.ic}><I n="bag"/></div><div><b>{t("Hasn't bought anything","এখনো কিছু কেনেননি")}</b><span>{bn?`${num(p.talks,true)}বার কথা বলেছেন, মোট ${num(p.messages,true)}টি মেসেজ দিয়েছেন, কিন্তু কোনো অর্ডার হয়নি।`:`Talked ${p.talks} times, sent ${p.messages} messages, no orders.`}</span></div></div></div>}
   {V.done>0&&<div className={s.pfc}><h5>{t("Order summary","অর্ডারের সারাংশ")}</h5><div className={s.tiles}>
    {([[t("Total orders","মোট অর্ডার"),o.length,""],[t("Delivered","সফল"),V.ok.length,"ok"],[t("Cancelled","বাতিল"),V.cx.length,"er"],[t("Returned","ফেরত"),V.rt.length,"wr"],[t("In progress","চলমান"),V.run.length,""]] as [string,number,string][]).filter((x,i)=>i===0||x[1]>0).map(x=><div key={x[0]} className={`${s.tile} ${x[2]==="ok"?s.tok:x[2]==="er"?s.ter:x[2]==="wr"?s.twr:""}`}><b>{num(x[1],bn)}</b><span>{x[0]}</span></div>)}</div>
    {V.ok.length>0&&kv(t("Total purchases","মোট কেনাকাটা"),money(sum,bn))}{V.ok.length>1&&kv(t("Average order","গড় অর্ডার"),money(Math.round(sum/V.ok.length),bn))}{kv(t("Last order","শেষ অর্ডার"),fullDate(o[0].created_at,bn))}</div>}
   {fresh?<div className={s.pfc}><h5>{t("Introduction","পরিচিতি")}</h5>{kv(t("First message","প্রথম মেসেজ"),fullDate(p.first?.at,bn))}{kv(t("Channel","চ্যানেল"),channelMeta[p.channel]?.name??p.channel)}{p.first?.text&&<div className={s.fmsg}>{p.first.text}</div>}</div>
   :<div className={s.pfc}><h5>{t("Conversation & buying behaviour","কথা বলা আর কেনার আচরণ")}</h5>{kv(t("First message","প্রথম মেসেজ"),fullDate(p.first?.at,bn))}{kv(t("Messages sent","মোট মেসেজ দিয়েছেন"),num(p.messages,bn)+(bn?"টি":""))}{kv(t("Conversations","কথা হয়েছে"),num(p.talks,bn)+(bn?" বার":""))}{o.length>0&&kv(t("Orders placed","অর্ডার হয়েছে"),num(o.length,bn)+(bn?" বার":""))}{o.length>0&&p.talks>o.length&&kv(t("Talked but no order","কথা হয়েছে, কিন্তু অর্ডার হয়নি"),num(p.talks-o.length,bn)+(bn?" বার":""))}</div>}
   {groups.map(g=>{const ex=open[g.name];const rows=ex?g.list:g.list.slice(0,3);const total=g.list.filter(x=>x.status==="ok").reduce((a,x)=>a+x.amount_minor,0);
    return <div className={s.pfc} key="orders"><h5>{t("Order history","অর্ডারের ইতিহাস")}</h5><div className={s.stg}><div className={s.sth}><I n="bag" size={16}/>{g.name||t("Store","স্টোর")}<span>{num(g.list.length,bn)}{bn?"টি অর্ডার":" orders"}{total?" · "+money(total,bn):""}</span></div>
     {rows.map((x:OrderRow)=><div className={s.ord} key={x.id}><div className={s.l}><b>{x.items}</b><span>{fullDate(x.created_at,bn)} · {x.reference}</span>{x.reason&&<span className={s.why}>{x.reason}</span>}</div><div className={s.r}>{money(x.amount_minor,bn,x.currency)}<em className={tone2(stat[x.status][1],{ok:s.eok,er:s.eer,wr:s.ewr,mu:s.emu})}>{stat[x.status][0]}</em></div></div>)}
     {g.list.length>3&&<button type="button" className={s.mo} onClick={()=>setOpen(v=>({...v,[g.name]:!ex}))}>{ex?t("Show less","কম দেখুন"):bn?`আরও ${num(g.list.length-3,true)}টি দেখুন`:`Show ${g.list.length-3} more`}</button>}</div></div>;})}
   {(p.contact?.address||p.contact?.payment||(phone&&p.channel!=="wa"))&&<div className={s.pfc}><h5>{t("Contact & delivery","যোগাযোগ ও ডেলিভারি")}</h5>{phone&&p.channel!=="wa"&&kv(t("Phone","ফোন"),phone)}{p.contact?.address&&kv(t("Address","ঠিকানা"),p.contact.address)}{p.contact?.payment&&kv(t("Preferred payment","পছন্দের পেমেন্ট"),p.contact.payment)}</div>}
   <div className={s.pfc}><h5>{t("Your note","আপনার নোট")}</h5><textarea className={s.nt} rows={2} value={note} readOnly={!canNote} maxLength={2000} placeholder={t("Write something about this customer…","এই কাস্টমার সম্পর্কে কিছু লিখে রাখুন…")} onChange={e=>setNote(e.target.value)}
    onBlur={()=>void blurNote()}/></div>
  </>;})();
 return <><div className={s.pfh}><button type="button" className={`${s.ib} ${s.pfback}`} onClick={onBack} aria-label={t("Back","ফিরে যান")}><I n="back"/></button><b>{t("Customer details","কাস্টমারের তথ্য")}</b>{onClose&&<button type="button" className={`${s.ib} ${s.pfx}`} onClick={onClose} aria-label={t("Close","বন্ধ")}><I n="x"/></button>}</div><div className={s.pfBody}>{body}</div></>;
}
