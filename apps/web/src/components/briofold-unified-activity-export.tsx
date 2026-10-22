"use client";

type Activity={source:string;action:string;actor_name:string;created_at:string;scope:string};
const csvCell=(value:string)=>{
 const safe=/^[\s]*[=+\-@\t\r]/.test(value)?"'"+value:value;
 return `"${safe.replaceAll('"','""')}"`;
};
export function UnifiedActivityExport({bn,rows,environment}:{bn:boolean;rows:Activity[];environment:"live"|"sandbox"}){
 const download=()=>{
  const records=[
   ["Time (UTC)","Source","Action","Actor","Scope"],
   ...rows.map(row=>[row.created_at,row.source,row.action,row.actor_name,row.scope==="realm"?environment:"store"])
  ];
  const csv="\uFEFF"+records.map(row=>row.map(csvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=`store-activity-${environment}.csv`;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <button type="button" onClick={download}>{bn?"এই পৃষ্ঠার CSV":"Download this page CSV"}</button>;
}
