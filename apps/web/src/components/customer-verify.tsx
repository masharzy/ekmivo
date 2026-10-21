"use client";
import {useEffect,useState} from "react";
export function CustomerVerify({bn}:{bn:boolean}){
 const [token,setToken]=useState(""),[status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{const value=window.location.hash.slice(1);queueMicrotask(()=>setToken(/^[A-Za-z0-9_-]{43}$/.test(value)?value:""));history.replaceState(null,"",window.location.pathname);},[]);
 async function verify(){setBusy(true);try{const r=await fetch("/api/customer-verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});if(!r.ok)throw Error();setStatus(bn?"ইমেইল যাচাই হয়েছে।":"Email verified.");setToken("");}catch{setStatus(bn?"লিংকটি মেয়াদোত্তীর্ণ, ব্যবহৃত বা বাতিল। নতুন লিংক চাইতে পারেন।":"This link is expired, used or revoked. Request a new link.");}finally{setBusy(false);}}
 return <main><h1>{bn?"ইমেইল যাচাই":"Confirm your email"}</h1><p>{bn?"শুধু এই ঠিকানাটি আপনার হলে নিশ্চিত করুন। এটি বিপণনের সম্মতি বা পেমেন্ট নিশ্চিত করে না।":"Confirm only if this email address is yours. This does not consent to marketing or confirm payment."}</p><button disabled={!token||busy} onClick={()=>void verify()}>{bn?"নিশ্চিত করুন":"Confirm address"}</button>{status&&<p role="status">{status}</p>}</main>;
}
