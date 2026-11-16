import "server-only";
import type {Sql} from "postgres";

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
 // PostgreSQL timestamptz has microsecond precision. Never pass the ledger
 // keyset timestamp through JS Date.toISOString() (milliseconds only):
 // doing so can silently skip journal rows during pagination.
 const at=String(row.created_at);
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{3})?Z$/.test(at)||
  !Number.isFinite(Date.parse(at)))throw new Error("AI_LEDGER_ROW_TIMESTAMP_INVALID");
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
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{3})?Z$/.test(parsed[0])||
  !Number.isFinite(Date.parse(parsed[0]))||
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parsed[1]))
  throw new Error("AI_LEDGER_CURSOR_INVALID");
 return {createdAt:parsed[0],id:parsed[1]};
}

/**
 * One statement line per AI reply. A reply writes a "reserve" row (the most it may
 * cost is held) and later a "settle"/"release" row (the unused part comes back);
 * both share reference_id = the reservation. Shown separately they looked like
 * "৳2 per reply". Grouped, the line is the actual cost; still pending = held.
 * Other kinds (top-up, free credit, admin) stay one row each.
 */
export async function groupedStatement(db:Sql,workspaceId:string,cursor:{createdAt:string;id:string}|null,limit:number){
 return db`WITH j AS (
   SELECT id,kind,available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,created_at,
    CASE WHEN kind IN ('reserve','settle','release') AND reference_id IS NOT NULL THEN reference_id ELSE id END AS gid
   FROM briofold_ai_credit_journal WHERE workspace_id=${workspaceId}::uuid
  ), g AS (
   SELECT gid AS id,
    CASE WHEN bool_and(kind IN ('reserve','settle','release')) THEN
     CASE WHEN bool_or(kind IN ('settle','release')) THEN 'ai_reply' ELSE 'ai_reply_pending' END
    ELSE min(kind) END AS kind,
    sum(available_delta_minor) AS available_delta_minor,sum(reserved_delta_minor) AS reserved_delta_minor,
    (array_agg(available_after_minor ORDER BY created_at DESC,id DESC))[1] AS available_after_minor,
    (array_agg(reserved_after_minor ORDER BY created_at DESC,id DESC))[1] AS reserved_after_minor,
    max(created_at) AS created_at
   FROM j GROUP BY gid
  )
  SELECT id,kind,available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,
   to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at
  FROM g ${cursor?db`WHERE (created_at,id)<(${cursor.createdAt}::timestamptz,${cursor.id}::uuid)`:db``}
  ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
}
