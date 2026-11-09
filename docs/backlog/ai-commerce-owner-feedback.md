# AI commerce: owner feedback backlog (2026-11-10)

Recorded from the owner's first production test. Not fixed yet; owner asked to note them.

## 1. Two separate product lists confuse owners (highest priority)
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
