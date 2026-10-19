"use client";
import {useEffect,useState} from "react";
import {CHECKOUT_RETURN_SECONDS} from "../lib/checkout-return";
export function CheckoutReturn({destination,store,bn}:{destination:string;store:string;bn:boolean}){
 const [seconds,setSeconds]=useState(CHECKOUT_RETURN_SECONDS);
 useEffect(()=>{
  if(!destination)return;
  const deadline=Date.now()+CHECKOUT_RETURN_SECONDS*1000;
  const timer=window.setInterval(()=>setSeconds(Math.max(0,Math.ceil((deadline-Date.now())/1000))),250);
  const redirect=window.setTimeout(()=>window.location.assign(destination),CHECKOUT_RETURN_SECONDS*1000);
  return()=>{window.clearInterval(timer);window.clearTimeout(redirect)};
 },[destination]);
 if(!destination)return null;
 return <p className="tk-sub tk-return" role="status">{bn?`${seconds} সেকেন্ড পরে ${store}-এর ওয়েবসাইটে ফিরে যাবেন।`:`Returning to ${store} in ${seconds} seconds.`}</p>;
}
