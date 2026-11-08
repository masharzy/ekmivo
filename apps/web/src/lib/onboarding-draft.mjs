// Pure client-safe workspace onboarding draft schema, deliberately NO secrets.
// A saved draft is a browser-local convenience, never a server-side entitlement.
const validUuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function draftStorageKey(userId){
 if(typeof userId!=="string"||!validUuid.test(userId))throw Error("Invalid account-scoped draft identity");
 return "briofold:onboarding-draft:v1:"+userId.toLowerCase();
}
function valid(value){
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const {name,mode}=value;
 if(typeof name!=="string"||name.length>100)return null;
 if(mode!=="ai"&&mode!=="commerce"&&mode!=="both")return null;
 return {name,mode};
}
export function parseSavedDraft(value){
 if(typeof value!=="string"||value.length>400)return null;
 try{return valid(JSON.parse(value));}catch{return null;}
}
export function encodeSavedDraft(value){
 const draft=valid(value);
 if(!draft)throw Error("Invalid business draft");
 return JSON.stringify(draft);
}
