import {createHash,createHmac,timingSafeEqual} from "node:crypto";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
// Signature validation alone is not fulfilment. Follow the Go consumer's
// authoritative query and merchant PostgreSQL transaction in schema.sql.
export function verifyEkmivo(raw:Buffer,headers:Headers,secret:string,workspace:string,environment:"sandbox"|"live",now=Math.floor(Date.now()/1000)){
 if(raw.length>16384||secret.length<32)throw Error("Invalid webhook bounds");const timestamp=(headers.get("X-Briofold-Timestamp")||headers.get("X-Ekmivo-Timestamp"))||"";
 if(!/^\d+$/.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||Math.abs(now-Number(timestamp))>300)throw Error("Timestamp rejected");
 const signature="v1="+createHmac("sha256",secret).update(timestamp+".").update(raw).digest("hex"),keyID=createHash("sha256").update(secret).digest("hex").slice(0,16);
 if(!equal(signature,(headers.get("X-Briofold-Signature")||headers.get("X-Ekmivo-Signature"))||"")||!equal(keyID,(headers.get("X-Briofold-Key-ID")||headers.get("X-Ekmivo-Key-ID"))||""))throw Error("Signature rejected");const event=JSON.parse(raw.toString("utf8")),data=event.data||{};
 if(event.id!==(headers.get("X-Briofold-Event-ID")||headers.get("X-Ekmivo-Event-ID"))||event.delivery_id!==(headers.get("X-Briofold-Delivery-ID")||headers.get("X-Ekmivo-Delivery-ID"))||event.schema_version!==1||event.workspace_id!==workspace||event.environment!==environment||event.type!=="payment.verified")throw Error("Scope rejected");
 if(![event.id,event.delivery_id,data.payment_id].every(x=>typeof x==="string"&&uuid.test(x))||!Number.isSafeInteger(data.amount_minor)||data.amount_minor<=0||data.currency!=="BDT"||data.verification_status!=="verified")throw Error("Payment fields rejected");return event;
}
