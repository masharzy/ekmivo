"use client";
export type ReplyPart={type:"text"|"image"|"audio"|"document";text?:string;message_id?:string};
export type SavedReply={id:string;revision:number;title:string;category:string;body:string;messages?:ReplyPart[];shortcut?:string;visibility?:"team"|"private"};
export type ReplyMedia={id:string;type:"image"|"audio"|"document";name:string};
export function SavedReplySequenceEditor({reply,onChange,media,bn}:{reply:SavedReply;onChange:(reply:SavedReply)=>void;media:ReplyMedia[];bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const parts=reply.messages??[];
 const update=(next:ReplyPart[])=>onChange({...reply,messages:next});
 return <fieldset><legend>{t("Messages and sharing","মেসেজ ও শেয়ারিং")}</legend>
  <label>{t("Shortcut","শর্টকাট")}<input aria-label={t("Reply shortcut","উত্তরের শর্টকাট")} value={reply.shortcut??""} maxLength={40} pattern="[a-z0-9_-]*" onChange={e=>onChange({...reply,shortcut:e.target.value})}/></label>
  <label>{t("Visibility","কারা দেখবে")}<select aria-label={t("Reply visibility","উত্তর কারা দেখবে")} value={reply.visibility??"team"} onChange={e=>onChange({...reply,visibility:e.target.value as "team"|"private"})}><option value="team">{t("Team","টিম")}</option><option value="private">{t("Only me","শুধু আমি")}</option></select></label>
  <p>{t("Without a sequence, the reply text is used. Add up to 10 messages in delivery order. Media must already be sent in this Business; upload and send new media from Inbox first.","আলাদা মেসেজ না যোগ করলে উপরের লেখাই ব্যবহার হবে। পাঠানোর ক্রমে সর্বোচ্চ ১০টি মেসেজ যোগ করুন। মিডিয়া এই ব্যবসা থেকে আগে পাঠানো হতে হবে; নতুন মিডিয়া ইনবক্স থেকে আপলোড করে পাঠান।")}</p>
  {parts.map((part,index)=><fieldset key={index}><legend>{t("Message","মেসেজ")} {index+1}</legend>
   <select aria-label={`${t("Message type","মেসেজের ধরন")} ${index+1}`} value={part.type} onChange={e=>update(parts.map((x,i)=>i===index?{type:e.target.value as ReplyPart["type"]}:x))}>{(["text","image","audio","document"] as const).map((kind,i)=><option key={kind} value={kind}>{bn?["লেখা","ছবি","অডিও","ডকুমেন্ট"][i]:kind}</option>)}</select>
   {part.type==="text"?<textarea required aria-label={`${t("Sequence text","মেসেজের লেখা")} ${index+1}`} value={part.text??""} maxLength={8000} onChange={e=>update(parts.map((x,i)=>i===index?{...x,text:e.target.value}:x))}/>:<select required aria-label={`${t("Saved media","সংরক্ষিত মিডিয়া")} ${index+1}`} value={part.message_id??""} onChange={e=>update(parts.map((x,i)=>i===index?{...x,message_id:e.target.value}:x))}><option value="">{t("Choose previously sent media","আগে পাঠানো মিডিয়া বেছে নিন")}</option>{part.message_id&&!media.some(m=>m.id===part.message_id)&&<option value={part.message_id}>{t("Saved selection — review before sending","সেভ করা মিডিয়া — পাঠানোর আগে যাচাই করুন")}</option>}{media.filter(m=>m.type===part.type).map(m=><option key={m.id} value={m.id}>{m.name||m.type} · {m.id.slice(0,8)}</option>)}</select>}
   <button type="button" disabled={index===0} onClick={()=>{const next=[...parts];[next[index-1],next[index]]=[next[index],next[index-1]];update(next);}}>{t("Move earlier","আগে নিন")}</button>
   <button type="button" onClick={()=>update(parts.filter((_,i)=>i!==index))}>{t("Remove message","মেসেজ বাদ দিন")}</button>
  </fieldset>)}
  <button type="button" disabled={parts.length>=10} onClick={()=>update([...parts,{type:"text",text:""}])}>{t("Add message","মেসেজ যোগ করুন")}</button>
 </fieldset>;
}
export function SavedReplyPreview({reply,customerName,bn}:{reply:SavedReply;customerName:string;bn:boolean}){
 const parts:ReplyPart[]=reply.messages?.length?reply.messages:[{type:"text",text:reply.body}];
 return <ol aria-label={bn?"মেসেজের ক্রম":"Message sequence"}>{parts.map((part,index)=><li key={index}>{part.type==="text"?(part.text??"").replace(/{{\s*customer_name\s*}}/g,()=>customerName):`${part.type} · ${part.message_id?.slice(0,8)??""}`}</li>)}</ol>;
}
