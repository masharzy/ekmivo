/** Public service status. Never invents a state: anything missing or malformed is "unknown". */
export type ServiceState="operational"|"degraded"|"down"|"unknown";
export const SERVICE_KEYS=["web","payments","sms","ai","chat","webhooks"] as const;
export type ServiceKey=typeof SERVICE_KEYS[number];
export type ServiceStatus={
 services:Record<ServiceKey,ServiceState>;
 /** Kept for older clients: the payment row only. */
 payment_service:"operational"|"unavailable"|"unknown";
 release_verified:false;
 observed_at:string;
};
const STATES:readonly ServiceState[]=["operational","degraded","down","unknown"];
function state(v:unknown):ServiceState{return typeof v==="string"&&(STATES as readonly string[]).includes(v)?v as ServiceState:"unknown"}
function legacy(s:ServiceState):ServiceStatus["payment_service"]{return s==="operational"?"operational":s==="unknown"?"unknown":"unavailable"}

/** This web route answering at all means the website and dashboard are up. */
export function serviceStatusFromGo(raw:unknown,observedAt:string):ServiceStatus|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const services=(raw as {services?:unknown}).services;
 if(!services||typeof services!=="object"||Array.isArray(services))return null;
 const s=services as Record<string,unknown>;
 const out={web:"operational",payments:state(s.payments),sms:state(s.sms),ai:state(s.ai),chat:state(s.chat),webhooks:state(s.webhooks)} as Record<ServiceKey,ServiceState>;
 return {services:out,payment_service:legacy(out.payments),release_verified:false,observed_at:observedAt};
}

export function fallbackServiceStatus(payment:"operational"|"unavailable"|"unknown",observedAt:string):ServiceStatus{
 const payments:ServiceState=payment==="operational"?"operational":payment==="unavailable"?"down":"unknown";
 return {services:{web:"operational",payments,sms:"unknown",ai:"unknown",chat:"unknown",webhooks:"unknown"},payment_service:payment,release_verified:false,observed_at:observedAt};
}

/** Overall summary: any problem wins over unknown; all unknown is unknown. */
export function overallState(services:Record<ServiceKey,ServiceState>):"ok"|"issue"|"unknown"{
 const values=SERVICE_KEYS.map(k=>services[k]);
 if(values.some(v=>v==="degraded"||v==="down"))return "issue";
 if(values.every(v=>v==="operational"))return "ok";
 return "unknown";
}
