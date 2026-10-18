// Browser-only registration for editable forms that participate in PG02's
// cross-product/business/environment navigation contract. No record data
// or secrets are stored here; only callbacks from mounted forms.
export type ActiveDraft = {
 id: string;
 isDirty: () => boolean;
 save: () => Promise<boolean>;
 discard: () => void;
};
const registered = new Map<string,ActiveDraft>();
export function registerDraft(draft:ActiveDraft):()=>void {
 if(!draft.id || typeof draft.save!=="function" || typeof draft.discard!=="function"){
  throw Error("Invalid draft registration");
 }
 registered.set(draft.id,draft);
 return ()=>{
  if(registered.get(draft.id)===draft)registered.delete(draft.id);
 };
}
export function activeDrafts():ActiveDraft[]{
 return [...registered.values()].filter(draft=>{
  try{return draft.isDirty();}catch{return true;} // Fail closed on unknown draft status.
 });
}
export async function saveActiveDrafts():Promise<boolean>{
 for(const draft of activeDrafts()){
  try {
   if(!await draft.save())return false;
  }catch{return false;}
 }
 // A true result means the form saved successfully. React state can settle
 // after this promise resolves, so a synchronous dirty recheck is unreliable.
 return true;
}
export function discardActiveDrafts():boolean{
 for(const draft of activeDrafts()){
  try{draft.discard();}catch{return false;}
 }
 // React applies setState after the click handler; a synchronous dirty recheck
 // would report failure even though every discard callback succeeded.
 return true;
}
