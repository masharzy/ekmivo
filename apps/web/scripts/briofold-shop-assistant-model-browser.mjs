import assert from "node:assert/strict";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import postgres from "postgres";

export async function runBriofoldShopAssistantModelBrowser({origin, browser, control, sessions}) {
  const target = new URL(control);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && !/prod/i.test(target.pathname));
  const db = postgres(control, {max: 1, prepare: false, onnotice: () => {}});
  const contexts = [];
  const hash = token => createHash("sha256").update(token).digest("hex");
  try {
    for (const file of ["0003_pg01_admin_mfa.sql", "0240_briofold_shop_assistant_model.sql"]) {
      const source = await readFile(new URL("../../../infra/migrations/" + file, import.meta.url), "utf8");
      await db.unsafe(source).simple();
    }

    const admin = randomUUID();
    const token = randomBytes(32).toString("hex");
    await db`INSERT INTO app_users(id,email,display_name,password_hash,email_verified_at)
      VALUES (${admin},${admin + "@example.invalid"},'Shop Assistant Admin','fixture',now())`;
    await db`INSERT INTO platform_administrators(user_id,role) VALUES (${admin},'super_admin')`;
    await db`INSERT INTO platform_admin_mfa(user_id,secret_ciphertext,confirmed_at)
      VALUES (${admin},'fixture-session-only',now()-interval '1 minute')`;
    await db`INSERT INTO auth_sessions(user_id,token_hash,expires_at,mfa_verified_at)
      VALUES (${admin},${hash(token)},now()+interval '1 hour',now())`;

    const open = async value => {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addCookies([{name: "briofold-session", value, url: origin, httpOnly: true}]);
      return context;
    };
    const adminContext = await open(token);
    const page = await adminContext.newPage();
    const section = page.locator("section[aria-labelledby=shop-assistant-model-title]");
    const heading = {en: "Shop assistant model", bn: "দোকান সহকারীর মডেল"};
    for (const locale of ["en", "bn"]) {
      for (const theme of ["light", "dark"]) {
        await adminContext.addCookies([{name: "briofold-admin-theme", value: theme, url: origin}]);
        await page.goto(origin + "/" + locale + "/admin/credits");
        await section.getByRole("heading", {name: heading[locale]}).waitFor();
        assert.equal(await page.locator(".pa-root").getAttribute("data-admin-theme"), theme);
        for (const width of [320, 412, 1440]) {
          await page.setViewportSize({width, height: 900});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.ok(await section.evaluate(el => el.scrollWidth <= el.clientWidth));
        }
      }
    }

    await page.goto(origin + "/en/admin/credits");
    const [{model}] = await db`SELECT model FROM briofold_ai_tariff_catalog WHERE current_version IS NOT NULL ORDER BY model LIMIT 1`;
    await section.getByRole("combobox").selectOption(model);
    page.once("dialog", dialog => dialog.dismiss());
    await section.getByRole("button", {name: "Save model"}).click();
    assert.equal((await db`SELECT briofold_shop_assistant_model() AS model`)[0].model, null);
    page.once("dialog", dialog => dialog.accept());
    await section.getByRole("button", {name: "Save model"}).click();
    await section.getByText("Active model · " + model, {exact: true}).waitFor();
    page.once("dialog", dialog => dialog.accept());
    await section.getByRole("button", {name: "Rollback"}).click();
    await section.getByText("Active model · Default", {exact: true}).waitFor();
    const audit = await db`SELECT action FROM platform_admin_audit WHERE actor_id=${admin} ORDER BY action`;
    assert.deepEqual(audit.map(row => row.action), ["ai_model.change", "ai_model.rollback"]);

    const viewer = await (await open(sessions.viewer)).newPage();
    const denied = await viewer.goto(origin + "/en/admin/credits");
    assert.equal(denied.status(), 404);
    assert.equal(await viewer.getByRole("heading", {name: heading.en}).count(), 0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await db.end({timeout: 3});
  }
}
