"use client";
// Count of new receipts on the "Receipts" tab (owner 2026-11-23). Refreshes every minute.
import {useEffect,useState} from "react";
import "./payment-receipts.css";

export function ReceiptsBadge({workspaceId,environment}:{workspaceId:string;environment:string}){
 const [n,setN]=useState(0);
 useEffect(()=>{
  const c=new AbortController();
  const read=()=>fetch(`/api/go/workspaces/${workspaceId}/payment-proofs?environment=${environment==="sandbox"?"sandbox":"live"}`,{cache:"no-store",signal:c.signal})
   .then(r=>r.ok?r.json():null).then(v=>{if(v&&typeof v.new==="number")setN(v.new)}).catch(()=>{});
  void read();const timer=setInterval(read,60000);
  return()=>{clearInterval(timer);c.abort()};
 },[workspaceId,environment]);
 return n>0?<span className="ek-badge" aria-label={n+" new"}>{n>99?"99+":n}</span>:null;
}
