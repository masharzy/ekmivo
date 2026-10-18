export type PaymentNotice={
 id:string;type:string;resource_id:string|null;created_at:string;read_at:string|null;
 body:{amount_minor?:number;status?:string;reference?:string}|null
};
export function noticeCategory(type:string):"payments"|"refunds"|"alerts"{
 if(type==="payment.verified")return "payments";
 if(type.toLowerCase().includes("refund"))return "refunds";
 return "alerts";
}
export function noticeHref(workspaceId:string,notice:Pick<PaymentNotice,"type"|"resource_id">){
 const segment=noticeCategory(notice.type)==="payments"?"transactions":noticeCategory(notice.type)==="refunds"?"refunds":"incoming";
 return `/w/${workspaceId}/payments/${segment}`+(notice.resource_id?`?q=${encodeURIComponent(notice.resource_id)}`:"");
}
export function noticeHeading(type:string,bn:boolean){
 if(type==="payment.verified")return bn?"যাচাইকৃত পেমেন্ট":"Verified payment";
 if(noticeCategory(type)==="refunds")return bn?"রিফান্ড অনুরোধ":"Refund request";
 return bn?"পেমেন্ট সতর্কতা":"Payment alert";
}
export function noticeAmount(amountMinor:number,bn:boolean){
 return "BDT "+new Intl.NumberFormat(bn?"bn-BD":"en-GB",{minimumFractionDigits:0,maximumFractionDigits:2}).format(amountMinor/100);
}
