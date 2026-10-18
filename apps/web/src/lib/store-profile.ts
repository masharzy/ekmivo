export type StoreProfile={
 name:string;logo:string;business_type:string;description:string;brand_color:string;
 phone:string;support_email:string;whatsapp:string;website:string;address:string;
 statement_name:string;refund_url:string;receipt_note:string;
};
export function validStoreProfile(value:unknown):value is StoreProfile{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 const limits={name:40,logo:1500000,business_type:30,description:60,brand_color:7,phone:11,support_email:254,whatsapp:11,website:500,address:250,statement_name:22,refund_url:500,receipt_note:120} as const;
 if(Object.keys(v).sort().join("|")!==Object.keys(limits).sort().join("|"))return false;
 for(const [k,n] of Object.entries(limits)){if(typeof v[k]!=="string"||(v[k] as string).length>n||/[\u0000-\u001f]/.test(v[k] as string))return false}
 if((v.name as string).trim().length<2)return false;
 if(!["online","physical","service","other"].includes(v.business_type as string))return false;
 if(!["#0b0c0f","#2563eb","#7c3aed","#db2777","#ea580c","#059669"].includes(v.brand_color as string))return false;
 if(!((v.logo as string)===""||/^\/api\/checkout-logos\/[a-f0-9]{64}$/.test(v.logo as string)||(v.logo as string).startsWith("data:image/png;base64,")))return false;
 if(!["phone","whatsapp"].every(k=>!v[k]||/^01[3-9][0-9]{8}$/.test(v[k] as string)))return false;
 if(v.support_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.support_email as string))return false;
 for(const k of ["website","refund_url"])if(v[k]){try{const u=new URL(v[k] as string);if(u.protocol!=="https:"||u.username||u.password)return false}catch{return false}}
 if(v.statement_name&&!/^[A-Za-z0-9 .-]{1,22}$/.test(v.statement_name as string))return false;
 return true;
}
