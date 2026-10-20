import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const src=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
function statementHelpers(){
 const source=src("lib/server/briofold-ai-statement.ts").replace(/^import "server-only";\s*/,"");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const cjsModule={exports:{}};
 vm.runInNewContext(js,{module:cjsModule,exports:cjsModule.exports,Buffer,Date,Number,JSON,Error,String});
 return cjsModule.exports;
}
test("Wallet statement cursor preserves strict (timestamp, ID) pagination",()=>{
 const h=statementHelpers();
 const item={id:"10000000-0000-4000-8000-000000000001",created_at:"2026-10-20T10:10:10.123Z"};
 const cursor=h.statementCursor(item);
 assert.deepEqual(JSON.parse(JSON.stringify(h.parseStatementCursor(cursor))),{createdAt:item.created_at,id:item.id});
 assert.equal(h.parseStatementCursor(null),null);
 for(const broken of ["{}","ab c",Buffer.from(JSON.stringify(["garbage",item.id])).toString("base64url"),
  Buffer.from(JSON.stringify([item.created_at,"other"])).toString("base64url"),"a".repeat(300)]){
  assert.throws(()=>h.parseStatementCursor(broken));
 }
});
test("Lossless currency arithmetic refuses imprecise or noninteger wallet amounts",()=>{
 const h=statementHelpers();
 assert.equal(h.safeWalletMinor("9007199254740991"),Number.MAX_SAFE_INTEGER);
 assert.throws(()=>h.safeWalletMinor("9007199254740992"));
 assert.throws(()=>h.safeWalletMinor("10.5"));
 assert.throws(()=>h.safeWalletMinor("invalid"));
 assert.throws(()=>h.safeWalletMinor(Infinity));
 const row=h.statementEntry({id:"10000000-0000-4000-8000-000000000001",kind:"settle",
  created_at:"2026-10-20T10:10:10.123Z",available_delta_minor:"-20",reserved_delta_minor:"0",
  available_after_minor:"1000",reserved_after_minor:"0"});
 assert.equal(row.available_delta_minor,-20);
 assert.equal(row.available_after_minor,1000);
});
test("Ledger pages are tenant, role, subscription and permission restricted",()=>{
 const api=src("app/api/ai-credits/statement/route.ts");
 assert.match(api,/currentUser\(\)/);
 assert.match(api,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(api,/requestWorkspace!==workspace\.id/);
 assert.match(api,/ACTIVE_BUSINESS_CHANGED/);
 assert.match(api,/workspace\.role!==["']owner["']/);
 assert.match(api,/workspace_product_access/);
 assert.match(api,/pg13_capability_override/);
 assert.match(api,/workspace_id=\$\{workspace\.id\}::uuid/);
 assert.match(api,/\(created_at,id\)<\(/);
 assert.match(api,/LIMIT 51/);
 assert.match(api,/no-store/);
 assert.match(api,/searchParams\.get\("workspace_id"\)/);
 assert.doesNotMatch(api,/workspace_id[\s\S]*workspaceId/);
});
test("Low-balance warnings depend on live configured reservation, not guessed prices",()=>{
 const server=src("lib/server/briofold-ai-wallet.ts"),ui=src("components/briofold-ai-credit-summary.tsx");
 assert.match(server,/min\(ceil\(\(\(v\.terms->>'max_input_tokens'\)::numeric/);
 assert.match(server,/max_output_tokens/);
 assert.match(server,/output_minor_per_million/);
 assert.match(server,/m\.role IN \('owner','admin'\)/);
 assert.match(ui,/wallet\.available_minor<wallet\.minimum_request_minor/);
 assert.match(ui,/BriofoldAiStatement/);
});
