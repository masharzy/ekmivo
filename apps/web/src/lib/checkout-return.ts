export const CHECKOUT_RETURN_SECONDS = 10;
export function checkoutReturnUrl(state:string, origin:string|undefined, returnUrl?:string, cancelUrl?:string):string {
 if(origin!=="merchant" || !["completed","cancelled"].includes(state))return "";
 const raw=state==="cancelled"?(cancelUrl||returnUrl):returnUrl;
 if(!raw)return "";
 try{const u=new URL(raw);return (u.protocol==="https:"||u.protocol==="http:"&&u.hostname==="localhost")&&!u.username&&!u.password?u.href:""}catch{return ""}
}
export function compactOrderReference(reference:string):string {
 return reference.length>28?reference.slice(0,16)+"…"+reference.slice(-8):reference;
}
