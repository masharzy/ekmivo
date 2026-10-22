import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {noticeHref} from "../../apps/web/src/lib/payment-notice.ts";
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
 assert.match(dropdown,/href="\/notifications"/);
 assert.match(dropdown,/setTotalUnread/);
 assert.match(nav,/"events","notifications"/);
 const entry=load("apps/web/src/app/[locale]/notifications/page.tsx");
 assert.match(entry,/preferredWorkspaceFor\(user\.id\)/);
 assert.match(entry,/paymentContext&&<PaymentNotificationCenter/);
 assert.doesNotMatch(entry,/redirect\(`\/w\//);
});
test("payment notification deep links keep the primary Store URL and reject unsafe reference segments",()=>{
 const id="31d06427-5384-4a72-bacd-e39dfb7c895a";
 assert.equal(noticeHref("legacy-workspace",{type:"payment.verified",resource_id:id}),`/payments/transactions/${id}`);
 assert.equal(noticeHref("legacy-workspace",{type:"refund.requested",resource_id:id}),`/payments/refunds/${id}`);
 assert.equal(noticeHref("legacy-workspace",{type:"device.warning",resource_id:id}),`/sms-data/${id}`);
 assert.equal(noticeHref("legacy-workspace",{type:"payment.verified",resource_id:"../../admin"}),"/payments/transactions");
 assert.equal(noticeHref("legacy-workspace",{type:"device.warning",resource_id:null}),"/sms-data");
});
