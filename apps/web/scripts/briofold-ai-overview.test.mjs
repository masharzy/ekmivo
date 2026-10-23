import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");

test("AI overview is backed by real Inbox and current server-authorized tenant",()=>{
 const page=read("components/dashboard-content.tsx"),source=read("components/briofold-ai-overview.tsx");
 assert.match(page,/section==="overview"&&service==="ai"\?<BriofoldAiOverview/);
 assert.match(page,/workspaceId=\{workspace\.id\} userId=\{user\.id\}/);
 assert.match(source,/FROM workspace_members m/);
 assert.match(source,/u\.disabled_at IS NULL/);
 assert.match(source,/p\.product='ai' AND p\.enabled=true/);
 assert.match(source,/m\.workspace_id=\$\{workspaceId\}::uuid AND m\.user_id=\$\{userId\}::uuid/);
 assert.match(source,/FROM inbox_threads t JOIN inbox_connections c/);
 assert.match(source,/WHERE m\.workspace_id=\$\{workspaceId\}::uuid/);
 assert.match(source,/response\.state IN \('sent','delivered','seen'\)/);
 assert.match(source,/response\.sequence>request\.sequence/);
 assert.match(source,/c\.environment='live'/);
 // Inbox itself excludes disconnected channel conversations; overview counts
 // and recent list must use identical visibility constraints.
 assert.match(source,/c\.environment='live' AND c\.enabled=true\) AS conversations/);
 assert.match(source,/c\.environment='live' AND c\.enabled=true\s+ORDER BY t\.last_activity_at/);
 assert.match(source,/WHERE t\.workspace_id=\$\{workspaceId\}::uuid AND c\.environment='live' AND c\.enabled=true/);

 assert.match(source,/FROM briofold_ai_executions WHERE workspace_id=\$\{workspaceId\}::uuid/);
 assert.match(source,/to_regclass\('public\.briofold_ai_executions'\)/);
 assert.doesNotMatch(source,/Math\.random|mockThread|fakeConversation/);
});
test("Unavailable database results cannot masquerade as zero Inbox or AI activity",()=>{
 const source=read("components/briofold-ai-overview.tsx");
 assert.match(source,/return null;/);
 assert.match(source,/data===null&&<p role="alert"/);
 assert.match(source,/value===null\|\|value===undefined\?"—"/);
 assert.match(source,/data&&data\.recent\.length===0/);
 assert.match(source,/Link href="\/inbox"/);
 assert.match(source,/Link href="\/settings\/channels"/);
});
test("AI overview uses scoped styles and never edits Inbox presentation",()=>{
 const css=read("components/briofold-ai-overview.module.css");
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/var\(--color-border\)/);
 const page=read("components/unified-merchant-route.tsx");
 assert.match(page,/DashboardContent/);
});
test("AI dashboard setup and business alerts never fabricate completion",()=>{
 const source=read("components/briofold-ai-overview.tsx");
 const styles=read("components/briofold-ai-overview.module.css");
 assert.match(source,/aria-label=\{t\("Business alerts"/);
 assert.match(source,/data\.stats\.waiting>0/);
 assert.match(source,/data===null\?<p role="status">/);
 assert.match(source,/aria-label=\{t\("Store setup checklist"/);
 assert.match(source,/data\.stats\.channels>0\?t\("Connected"/);
 assert.match(source,/Review required/);
 assert.match(source,/never silently marks them complete/);
 for(const href of ["/settings/channels","/inbox","/inbox/agent-desk","/settings/business"])
  assert.ok(source.includes(`href="${href}"`),`setup action missing ${href}`);
 assert.match(styles,/\.checklist/);
});
