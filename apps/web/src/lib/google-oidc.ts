import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {createRemoteJWKSet,EncryptJWT,jwtDecrypt,jwtVerify,type JWTVerifyGetKey} from "jose";

export type GoogleFlow={state:string;nonce:string;verifier:string;locale:"en"|"bn";mode:"signin"|"link";userId?:string;sessionHash?:string};
const issuer="ekmivo:google-login";
const keys=createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"),{timeoutDuration:8000});
export function googleConfiguration(){
 const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim(),secret=process.env.GOOGLE_STATE_SECRET;
 try{
  const origin=new URL(process.env.GOOGLE_AUTH_ORIGIN||"");
  if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash) return null;
  if(!clientId||!clientSecret||!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret)||Buffer.from(secret,"base64url").length!==32)return null;
  return {clientId,clientSecret,secret:Buffer.from(secret,"base64url"),origin:origin.origin,callback:origin.origin+"/api/auth/google/callback"};
 }catch{return null;}
}
export function newGoogleFlow(locale:"en"|"bn",binding?:{userId:string;sessionHash:string}):GoogleFlow{
 return {state:randomBytes(32).toString("base64url"),nonce:randomBytes(32).toString("base64url"),verifier:randomBytes(48).toString("base64url"),locale,mode:binding?"link":"signin",...binding};
}
export function googleAuthorizationUrl(flow:GoogleFlow,clientId:string,callback:string){
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:"code",scope:"openid email profile",state:flow.state,nonce:flow.nonce,code_challenge:createHash("sha256").update(flow.verifier).digest("base64url"),code_challenge_method:"S256",prompt:"select_account"}).toString();
 return url.toString();
}
export async function sealGoogleFlow(flow:GoogleFlow,key:Uint8Array,origin:string){
 return new EncryptJWT({...flow}).setProtectedHeader({alg:"dir",enc:"A256GCM"}).setIssuer(issuer).setAudience(origin).setIssuedAt().setExpirationTime("10m").encrypt(key);
}
export async function openGoogleFlow(value:string,state:string,key:Uint8Array,origin:string):Promise<GoogleFlow>{
 if(value.length>4096||!value||!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error("GOOGLE_STATE_INVALID");
 const {payload:p}=await jwtDecrypt(value,key,{issuer,audience:origin,keyManagementAlgorithms:["dir"],contentEncryptionAlgorithms:["A256GCM"],requiredClaims:["iat","exp"],maxTokenAge:"10m"});
 if(typeof p.state!=="string"||p.state.length!==state.length||!timingSafeEqual(Buffer.from(p.state),Buffer.from(state))||typeof p.nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(p.nonce)||typeof p.verifier!=="string"||!/^[A-Za-z0-9_-]{64}$/.test(p.verifier)||!["en","bn"].includes(String(p.locale))||!["link","signin"].includes(String(p.mode)))throw Error("GOOGLE_STATE_INVALID");
 if(p.mode==="link"&&(typeof p.userId!=="string"||!/^[0-9a-f-]{36}$/.test(p.userId)||typeof p.sessionHash!=="string"||!/^[0-9a-f]{64}$/.test(p.sessionHash)))throw Error("GOOGLE_STATE_INVALID");
 return p as unknown as GoogleFlow;
}
export async function verifyGoogleIdToken(token:string,nonce:string,clientId:string,jwks:JWTVerifyGetKey=keys){
 const {payload:p}=await jwtVerify(token,jwks,{algorithms:["RS256"],issuer:["https://accounts.google.com","accounts.google.com"],audience:clientId,requiredClaims:["sub","iat","exp"],maxTokenAge:"2h"});
 if(typeof p.sub!=="string"||!p.sub||p.sub.length>255||p.nonce!==nonce||p.email_verified!==true||typeof p.email!=="string"||p.email.length>254||!/^\S+@\S+\.\S+$/.test(p.email)||(p.azp!==undefined&&p.azp!==clientId)||(Array.isArray(p.aud)&&p.aud.length>1&&p.azp!==clientId))throw Error("GOOGLE_IDENTITY_INVALID");
 const name=typeof p.name==="string"?p.name.replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,100):"";
 return {subject:p.sub,email:p.email.trim().toLowerCase(),name:name.length>=2?name:"Google user",authoritativeEmail:p.email.toLowerCase().endsWith("@gmail.com")||(typeof p.hd==="string"&&p.hd.length>0)};
}
