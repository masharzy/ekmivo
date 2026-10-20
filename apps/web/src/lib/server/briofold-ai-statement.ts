import "server-only";

// This is a pagination locator, NEVER proof of payment or authority.
// Tenant/role authorization must be rechecked on every request.
export type WalletStatementEntry={
 id:string;kind:string;available_delta_minor:number;reserved_delta_minor:number;
 available_after_minor:number;reserved_after_minor:number;created_at:string;
};
export function safeWalletMinor(value:unknown):number{
 const n=Number(value);
 if(!Number.isSafeInteger(n))throw new Error("AI_WALLET_INTEGER_UNSAFE");
 return n;
}
export function statementEntry(row:Record<string,unknown>):WalletStatementEntry{
 const at=new Date(String(row.created_at)).toISOString();
 const id=String(row.id);
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new Error("AI_LEDGER_ROW_ID_INVALID");
 return {
  id,kind:String(row.kind),created_at:at,
  available_delta_minor:safeWalletMinor(row.available_delta_minor),
  reserved_delta_minor:safeWalletMinor(row.reserved_delta_minor),
  available_after_minor:safeWalletMinor(row.available_after_minor),
  reserved_after_minor:safeWalletMinor(row.reserved_after_minor),
 };
}
export function statementCursor(entry:WalletStatementEntry):string{
 return Buffer.from(JSON.stringify([entry.created_at,entry.id]),"utf8").toString("base64url");
}
export function parseStatementCursor(value:string|null):{createdAt:string;id:string}|null{
 if(value===null)return null;
 if(!/^[A-Za-z0-9_-]{8,256}$/.test(value))throw new Error("AI_LEDGER_CURSOR_INVALID");
 const parsed:unknown=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
 if(!Array.isArray(parsed)||parsed.length!==2||typeof parsed[0]!=="string"||typeof parsed[1]!=="string")
  throw new Error("AI_LEDGER_CURSOR_INVALID");
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parsed[0])||
  !Number.isFinite(Date.parse(parsed[0]))||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parsed[1]))
  throw new Error("AI_LEDGER_CURSOR_INVALID");
 return {createdAt:parsed[0],id:parsed[1]};
}
