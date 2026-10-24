import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// 2026-10-22 OWNER SUPERSESSION: physical CSS isolation (old Phase 1) is
// waived. The upcoming merchant design intentionally adopts homepage styles.
// Never turn this guard into a demand to split globals.css or block design
// migration. Current Admin design independence and basic style loading remain.
const file=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");

test("shared root stylesheet stays available for the upcoming homepage/dashboard redesign",()=>{
 const layout=file("app/layout.tsx"),styles=file("app/globals.css");
 assert.match(layout,/import "\.\/globals\.css";/);
 assert.match(styles,/brand-tokens\.css/);
 assert.match(styles,/dashboard-v2\.css/);
});

test("Admin retains separately approved component/token scope",()=>{
 const admin=file("styles/admin/admin-tokens.css");
 assert.match(admin,/:root body \.pa-root\.pa-admin-design/);
 assert.match(admin,/:root body \.pa-root\.pa-admin-design\[data-admin-theme="dark"\]/);
 assert.match(admin,/--admin-sidebar-width:212px/);
 assert.match(admin,/--admin-header-height:48px/);
});
