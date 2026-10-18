import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=(name)=>readFileSync(new URL("../../"+name,import.meta.url),"utf8");
test("payment notifications are scoped to workspace and current financial realm",()=>{
 const go=load("backend/internal/checkout/reporting.go");
 const sql=load("infra/migrations/0103_notification_center_pagination.sql");
 assert.match(go,/documentActor\(r, ws, realm, "payments", false\)/);
 assert.match(go,/pg103_notification_page/);
 assert.match(sql,/PERFORM pg06_scope\(w,e\)/);
 assert.match(sql,/n\.workspace_id=w AND n\.environment=e/);
 assert.match(sql,/r\.actor_id=actor/);
 assert.match(sql,/REVOKE ALL ON FUNCTION pg103_notification_page/);
 assert.match(go,/pg13_notification_list/,"dropdown legacy compatibility remains");
 assert.match(go,/pg13_notification_read_all/,"mark all read remains server-authoritative");
});
test("notification center uses server search, pagination and read filters",()=>{
 const client=load("apps/web/src/components/payment-notification-center.tsx");
 const proxy=load("apps/web/src/app/api/go/[...path]/route.ts");
 for(const key of ["page","page_size","filter","q"])assert.ok(client.includes(key+":"),"missing "+key);
 assert.match(client,/filter:category,status,q:query/);
 assert.match(client,/Mark all read/);
 assert.match(client,/mark\(item\.id\)/);
 assert.match(client,/noticeHref\(workspaceId,item\)/);
 for(const field of ['"page"','"page_size"','"filter"'])assert.ok(proxy.includes(field));
 assert.match(client,/setPage\(1\)/,"filters must reset pagination");
});
test("dropdown uses Hind Siliguri and links to actual notifications route",()=>{
 const dropdown=load("apps/web/src/components/payment-notifications.tsx");
 const css=load("apps/web/src/components/notifications-reference.css");
 const nav=load("apps/web/src/lib/dashboard-navigation.ts");
 assert.match(css,/ref-notifications\[lang="bn"\].*font-hind-siliguri/);
 assert.match(dropdown,/payments\/notifications/);
 assert.match(dropdown,/setTotalUnread/);
 assert.match(nav,/"events","notifications"/);
 assert.match(load("apps/web/src/app/[locale]/notifications/page.tsx"),/payments\/notifications/);
});
