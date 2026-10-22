"use client";

type Row={day:string;status:string;source:string;assignee_id:string|null;assignee_name:string|null;orders:number};
const cell=(raw:unknown)=>{
 const text=String(raw??"");
 // Neutralize spreadsheet formula injection in team names and imported labels.
 const safe=/^[\s]*[=+\-@\t\r]/.test(text)?"'"+text:text;
 return `"${safe.replaceAll('"','""')}"`;
};

export function OrderReportExport({bn,rows,from,to,truncated}:{bn:boolean;rows:Row[];from:string;to:string;truncated:boolean}){
 const exportCSV=()=>{
  const header=["Date","Order status","Source","Assigned team member","Orders"];
  const values=[header,...rows.map(row=>[row.day,row.status,row.source,row.assignee_name??"Unassigned",row.orders])];
  const csv="\uFEFF"+values.map(record=>record.map(cell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;
  anchor.download=`orders-${from}-${to}.csv`;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <button type="button" disabled={truncated} onClick={exportCSV}>
  {bn?"CSV ডাউনলোড":"Download CSV"}
 </button>;
}
