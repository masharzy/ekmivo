"use client";
import {useRef,useState} from "react";
import styles from "./channel-settings.module.css";
type Option={id:number;name:string};
export function PathaoBooking({workspaceId,deliveryId,bn,disabled,onBooked}:{workspaceId:string;deliveryId:string;bn:boolean;disabled:boolean;onBooked:()=>Promise<void>}){
 const t=(en:string,be:string)=>bn?be:en,endpoint=`/api/go/workspaces/${workspaceId}/commerce?environment=live`;
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false);
 const [stores,setStores]=useState<Option[]>([]),[cities,setCities]=useState<Option[]>([]),[zones,setZones]=useState<Option[]>([]),[areas,setAreas]=useState<Option[]>([]);
 const [store,setStore]=useState(0),[city,setCity]=useState(0),[zone,setZone]=useState(0),[area,setArea]=useState(0),[weight,setWeight]=useState("0.5"),[quantity,setQuantity]=useState("1"),[itemType,setItemType]=useState("2"),[confirmed,setConfirmed]=useState(false);
 const lock=useRef(false),operation=useRef<{fp:string;key:string}|null>(null);
 async function locations(kind:string,parent=0):Promise<Option[]>{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pathao-locations",operation_key:crypto.randomUUID(),body:{provider:"pathao",kind,parent_id:parent}})});if(!response.ok)throw Error();const data=await response.json();if(!Array.isArray(data.items))throw Error();return data.items;}
 async function load(kind:"initial"|"zones"|"areas",id=0){if(lock.current)return;lock.current=true;setBusy(true);setError("");setConfirmed(false);try{
  if(kind==="initial"){const [s,c]=await Promise.all([locations("stores"),locations("cities")]);setStores(s);setCities(c);setStore(0);setCity(0);setZone(0);setArea(0);setZones([]);setAreas([]);}
  else if(kind==="zones"){setCity(id);setZone(0);setArea(0);setZones([]);setAreas([]);if(id)setZones(await locations("zones",id));}
  else{setZone(id);setArea(0);setAreas([]);if(id)setAreas(await locations("areas",id));}
 }catch{setError(t("Pathao locations unavailable. Check credentials and retry loading.","Pathao-এর এলাকা পাওয়া যাচ্ছে না। সংযোগের তথ্য দেখে আবার লোড করুন।"));}finally{lock.current=false;setBusy(false);}}
 async function book(){if(lock.current||!confirmed||uncertain)return;lock.current=true;setBusy(true);setError("");try{
  const body={provider:"pathao",id:deliveryId,options:{store_id:store,recipient_city:city,recipient_zone:zone,recipient_area:area,delivery_type:48,item_type:Number(itemType),item_quantity:Number(quantity),item_weight:Number(weight)}};
  const fp=JSON.stringify(body);if(operation.current?.fp!==fp)operation.current={fp,key:crypto.randomUUID()};
  let response:Response;try{response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"courier-book",operation_key:operation.current.key,body})});}catch{setUncertain(true);throw Error();}
  if(!response.ok){if(response.status>=500||response.status===409)setUncertain(true);throw Error();}
  setOpen(false);await onBooked();
 }catch{setError(t("Booking unconfirmed. Refresh shipments and reconcile with Pathao before another attempt.","বুকিং নিশ্চিত হয়নি। শিপমেন্ট রিফ্রেশ করে Pathao-তে মিলিয়ে তারপর আবার চেষ্টা করুন।"));}finally{lock.current=false;setBusy(false);}}
 const select=(name:string,value:number,items:Option[],change:(id:number)=>void,required=true)=><label>{name}<select aria-label={name} required={required} value={value} onChange={e=>{change(Number(e.target.value));setConfirmed(false);}}><option value={0}>{required?t("Choose…","বাছুন…"):t("Optional area","এলাকা ঐচ্ছিক")}</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
 if(!open)return <button type="button" disabled={disabled} onClick={()=>setOpen(true)}>{t("Book with Pathao","Pathao বুকিং")}</button>;
 return <div className={styles.root} style={{minWidth:0,maxWidth:420}}><form onSubmit={event=>{event.preventDefault();void book();}}><fieldset disabled={busy||disabled}><legend>{t("Pathao parcel booking","Pathao পার্সেল বুকিং")}</legend><p>{t("Normal delivery. Order recipient and COD come from the saved order; Pathao requires whole-taka COD. Booking does not record cash settlement.","সাধারণ ডেলিভারি। প্রাপক ও COD সংরক্ষিত অর্ডার থেকে আসবে; Pathao-তে COD পূর্ণ টাকায় হতে হবে। বুকিং মানেই নগদ জমার রেকর্ড নয়।")}</p><button type="button" onClick={()=>void load("initial")}>{t("Load Pathao locations","Pathao-এর এলাকা লোড করুন")}</button>
 {select(t("Pickup Business","পিকআপ ব্যবসা"),store,stores,setStore)}{select(t("Recipient city","প্রাপকের শহর"),city,cities,id=>void load("zones",id))}{select(t("Recipient zone","প্রাপকের জোন"),zone,zones,id=>void load("areas",id))}{select(t("Recipient area","প্রাপকের এলাকা"),area,areas,setArea,false)}
 <label>{t("Parcel type","পার্সেলের ধরন")}<select value={itemType} onChange={e=>{setItemType(e.target.value);setConfirmed(false);}}><option value="2">{t("Parcel","পার্সেল")}</option><option value="1">{t("Document","ডকুমেন্ট")}</option></select></label>
 <label>{t("Parcel quantity","পার্সেলের সংখ্যা")}<input type="number" min="1" max="999999999" step="1" required value={quantity} onChange={e=>{setQuantity(e.target.value);setConfirmed(false);}}/></label>
 <label>{t("Weight (kg)","ওজন (কেজি)")}<input type="number" min="0.5" max="10" step="0.001" required value={weight} onChange={e=>{setWeight(e.target.value);setConfirmed(false);}}/></label>
 <label><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("I checked the saved recipient, COD and parcel details and authorize this booking.","সংরক্ষিত প্রাপক, COD ও পার্সেলের তথ্য দেখে এই বুকিং অনুমোদন করছি।")}</label>
 <button type="submit" disabled={!confirmed||!store||!city||!zone||uncertain}>{t("Confirm Pathao booking","Pathao বুকিং নিশ্চিত করুন")}</button><button type="button" onClick={()=>setOpen(false)}>{t("Close","বন্ধ করুন")}</button></fieldset></form>{error&&<p role="alert">{error}</p>}</div>;
}
