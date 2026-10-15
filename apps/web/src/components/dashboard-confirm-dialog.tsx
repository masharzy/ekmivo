"use client";
import {useEffect,useRef} from "react";

export function DashboardConfirmDialog({
 open,title,message,confirmLabel,cancelLabel,disabled=false,danger=false,onConfirm,onClose
}:{
 open:boolean;title:string;message:string;confirmLabel:string;cancelLabel:string;
 disabled?:boolean;danger?:boolean;onConfirm:()=>void|Promise<void>;onClose:()=>void
}){
 const ref=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{
  const dialog=ref.current;
  if(!dialog)return;
  if(open&&!dialog.open)dialog.showModal();
  if(!open&&dialog.open)dialog.close();
 },[open]);
 return <dialog ref={ref} className="ekv2-confirm-dialog" aria-label={title} onCancel={event=>{if(disabled)event.preventDefault();else onClose()}} onClose={onClose} onClick={event=>{if(event.target===event.currentTarget&&!disabled)onClose()}}>
  <div className="ekv2-confirm-content">
   <h2>{title}</h2>
   <p>{message}</p>
   <div className="ekv2-confirm-actions">
    <button type="button" disabled={disabled} onClick={onClose}>{cancelLabel}</button>
    <button type="button" data-danger={danger||undefined} disabled={disabled} onClick={()=>void Promise.resolve(onConfirm()).finally(onClose)}>{confirmLabel}</button>
   </div>
  </div>
 </dialog>;
}
