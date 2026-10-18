export type AdminRole="super_admin"|"admin"|"support"|"analyst";
// Financial/catalog writes and role/security administration stay Super Admin only.
const readable:Record<AdminRole,readonly string[]>={
 super_admin:["*"],
 admin:["","workspaces","users","subscriptions","billing","providers","credits","support","health","audit"],
 support:["workspaces","users","support"],
 analyst:["","billing","audit"],
};
export function canReadAdmin(role:string,section:string){return (readable[role as AdminRole]||[]).some(s=>s==="*"||s===section);}
