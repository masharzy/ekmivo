# AI commerce: owner feedback backlog (2026-11-10)

Recorded from the owner's first production test. Not fixed yet; owner asked to note them.

## 0. The AI does not read the business's own data (blocker, found 2026-11-10)
- The AI's context (`studioContext`, built in `briofold_ai_channel_claim`) contains only:
  - the Settings → AI instructions, language and tone;
  - the Knowledge base;
  - the Settings → AI product list (`inbox_products`);
  - the chat history;
  - the channel instructions.
- It never reads:
  - the **Business profile** (`dashboard_store_profiles.body`, or the workspace name): name, contact, address, hours, policies;
  - the **Products** catalog, unless AI selling is on;
  - the platform's real published **subscription plans** (`pg13_plans` / `payment_plan_versions`) for Briofold's own shop.
- Observed in production:
  - The store name "Ekmivo", saved long ago in the Business profile, is unknown to the AI ("no business name set").
  - Asked about plans, the AI answered "1 month ৳50, 2 months ৳90 (payment gateway)". These came from entries the owner typed into the Settings → AI list, not from the real plans. Replacing the Knowledge text did not help, because that list still holds the old numbers.
- Fix direction:
  - At claim time, add a read-only `business` block to the context: Business profile fields and the workspace name, plus the catalog (always) and, for the platform's own workspace, the published plans with current prices.
  - The prompt treats these database facts as authoritative over free-text lists.
  - Remove the duplicate Settings → AI list (item 1), so there is one source per fact.
- Owner workaround until fixed: put the business name in the Settings → AI instructions, and delete or correct the old service prices in the Settings → AI list.

## 1. Two separate product lists confuse owners
- **Settings → AI** has its own "products/services" list (`inbox_products`, old AI studio list).
- **Products** page is the commerce catalog (`commerce_products`).
- The AI reads only one of them, and which one depends on the shop's **AI selling** toggle:
  - AI selling **off** → the AI uses the Settings → AI list.
  - AI selling **on** → the AI uses the Products catalog through the tools.
- Observed: the owner added "Alu" (potato) on the Products page and the two Briofold services in Settings → AI. With AI selling off, the AI said it has no potato.
- Fix direction:
  - Use one catalog only: Products.
  - Migrate existing `inbox_products` rows into `commerce_products`.
  - Remove the list from Settings → AI, leaving a link to Products.
  - Make the AI read the catalog whether AI selling is on or off (AI selling only decides whether it may take orders).

## 2. Services need a type of their own
- The catalog treats everything as a physical item: stock, warehouse, delivery, address at order time.
- Add an item type, **product** or **service**. A service has no stock, warehouse or delivery, and the AI does not ask for an address.
- The Settings → AI "product or service" option goes away with item 1.

## 3. Remove "Choose warehouse" when adding a product
- The owner asked earlier for this to be removed.
- Use the shop's default warehouse automatically. Show warehouse choice only when the shop has more than one warehouse (Stock & warehouses page).

## 4. Product add/edit UI is not good enough
- The form needs a redesign that follows the dashboard reference design.
- Do it together with items 2 and 3.

## 5. Public landing page makes claims the product does not meet
- "Powered by a vector database": the photo search is a perceptual-hash fingerprint, not a vector database.
- "Works from video screenshots": not verified; the v1 fingerprint matches near-identical images only.
- "Customers never fill a TrxID form": chat orders ask for the sender number and TrxID.
- Fix the copy now, or after item 6 ships.

## 6. Semantic image search (planned next week)
- Image embeddings (CLIP-style model) plus pgvector inside the existing Postgres, so photos from other angles or sources still match.

## Rollout leftovers (production, 2026-11-10)
- Go API: `BRIOFOLD_CATALOG_ENABLED=true` (Vercel already has it). Without it the catalog panel (minimum price, aliases, AI notes) does not work.
- Go API: `BRIOFOLD_PRODUCT_PHOTOS_ENABLED=true` and `PRIVATE_S3_*`, so uploaded product photos get indexed for photo search.
- Verify that SMTP and FCM are configured (owner email and push notices).
- Admin channel config: confirm the AI model key (`QWEN_API_KEY` / `OPENROUTER_API_KEY`) is set.
- Vercel production now lives in the new account `mahdyabrarsharzy-7804s-projects` (project `ekmivo-web`). The old team is blocked for fair use.
