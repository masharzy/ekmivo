import {createHash,createHmac,randomBytes} from "node:crypto";
const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
const idempotencyPattern=/^[A-Za-z0-9_-]{16,128}$/;
/** The public handle is deterministic for one session+idempotency key, never
 * predictable without the 256-bit HttpOnly guest secret. */
export function newPurchaseSecret(){return randomBytes(32).toString("base64url")}
export function derivePurchaseToken(guest:string,idempotencyKey:string){
 if(!tokenPattern.test(guest)||!idempotencyPattern.test(idempotencyKey))throw Error("INVALID_PURCHASE_SECRET");
 return createHmac("sha256",guest).update("ekmivo:purchase:"+idempotencyKey).digest("base64url");
}
export function purchaseDigest(token:string){
 return createHash("sha256").update(token).digest("hex");
}
export function purchaseCreationKey(guest:string,idempotencyKey:string){
 if(!tokenPattern.test(guest)||!idempotencyPattern.test(idempotencyKey))throw Error("INVALID_PURCHASE_SECRET");
 return purchaseDigest(guest+":"+idempotencyKey);
}
export function validPurchaseCapability(token:string){return tokenPattern.test(token)}
