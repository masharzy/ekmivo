"use server";
import {currentUser,selectDefaultWorkspace} from "../lib/server/auth";

// Called only after an authorized merchant chooses an already-owned business.
// The membership is validated again before changing the HttpOnly preference.
export async function chooseUnifiedBusiness(workspaceId:string):Promise<boolean>{
 const user=await currentUser();
 if(!user)return false;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))return false;
 return selectDefaultWorkspace(user.id,workspaceId);
}
