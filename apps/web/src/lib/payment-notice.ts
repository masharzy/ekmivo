export type PaymentNotice={
 id:string;type:string;resource_id:string|null;created_at:string;read_at:string|null;
 body:{amount_minor?:number;status?:string;reference?:string}|null
};
export function noticeCategory(type:string):"payments"|"refunds"|"alerts"{
 if(type==="payment.verified")return "payments";
 if(type.toLowerCase().includes("refund"))return "refunds";
 return "alerts";
}
export function noticeHref(_workspaceId:string,notice:Pick<PaymentNotice,"type"|"resource_id">){
 const category=noticeCategory(notice.type);
 const root=category==="payments"?"/payments/transactions":category==="refunds"?"/payments/refunds":"/sms-data";
 // The destination resolves the authenticated primary Store on the server.
 // Untrusted/non-UUID provider references stay on a scoped listing page.
 const id=notice.resource_id;
 return id&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?`${root}/${id}`:root;
}
export function noticeHeading(type:string,bn:boolean){
 if(type==="payment.verified")return bn?"যাচাইকৃত পেমেন্ট":"Verified payment";
 if(noticeCategory(type)==="refunds")return bn?"রিফান্ড অনুরোধ":"Refund request";
 return bn?"পেমেন্ট সতর্কতা":"Payment alert";
}
export function noticeAmount(amountMinor:number,bn:boolean){
 return "BDT "+new Intl.NumberFormat(bn?"bn-BD":"en-GB",{minimumFractionDigits:0,maximumFractionDigits:2}).format(amountMinor/100);
}
