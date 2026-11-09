# Briofold Product API

Base URL: your API origin. Every call needs `?environment=live` or `?environment=sandbox` and
`Authorization: Bearer <merchant API key>`. Keys are created in the dashboard with scope
`products:read` (list and fetch) and/or `products:write` (create, update, stock, deactivate).
The API is off until the operator sets `BRIOFOLD_PRODUCT_API_ENABLED=true`; while off it answers 404.

Writes need `Idempotency-Key: <uuid>`. Repeating a request with the same key and body returns the
first answer; the same key with a different body is rejected (409). Writes are limited to 60 per
minute and reads to 120 per minute per business.

Prices are whole paisa (`price_minor`: 120000 = 1,200.00 BDT). The server owns `id`, `revision`
and `source`; sending them is refused. API products are only visible to and editable through the API
(`source = api`), so they never overwrite products created by hand, by CSV or by WooCommerce.

## Create or update by your own id (`external_id`)

```bash
curl -X POST "$API/v1/products?environment=live" \
  -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" -d '{
    "external_id": "P-1001",
    "name": "Cotton Panjabi",
    "description": "Soft cotton panjabi",
    "category": "Panjabi",
    "tags": ["eid", "cotton"],
    "search_aliases": ["পাঞ্জাবি", "punjabi"],
    "ai_notes": "Never discount below the minimum price.",
    "min_price_minor": 90000,
    "image_urls": ["https://example.com/p1001.jpg"],
    "variants": [
      {"sku": "P-1001-M", "price_minor": 120000, "stock": 10, "options": {"size": "M", "color": "White"}},
      {"sku": "P-1001-L", "price_minor": 120000, "stock": 5,  "options": {"size": "L", "color": "White"}}
    ]
  }'
```

`201` with `{"id","revision","created":true,"external_id"}` the first time; posting the same
`external_id` again updates the same product (`200`, `created:false`) and never creates a duplicate.
`min_price_minor` is never returned by the customer-facing search or the AI reply path.
`image_urls` (up to 8) are downloaded by Briofold: https only, port 443, public hosts only
(private, loopback, link-local, metadata and CGNAT addresses are refused, redirects are re-checked),
JPEG/PNG/WebP, 10 MB each. An image that cannot be fetched is listed in `image_errors`; the product is still saved.
`stock` sets the on-hand quantity in your first warehouse (create one in the dashboard first).

## Read

```bash
curl "$API/v1/products?environment=live&q=panjabi&cursor=0" -H "Authorization: Bearer $KEY"
curl "$API/v1/products/$ID?environment=live"               -H "Authorization: Bearer $KEY"
curl "$API/v1/products?environment=live&external_id=P-1001" -H "Authorization: Bearer $KEY"
```

Lists return 50 items and `next_cursor` (a number, or `null` at the end).

## Update one product

```bash
curl -X PUT "$API/v1/products/$ID?environment=live" \
  -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" -d '{"name": "Cotton Panjabi (Eid)"}'
```

Send only the fields that change. `external_id` cannot be changed.

## Set stock

```bash
curl -X PUT "$API/v1/products/$ID/stock?environment=live" \
  -H "Authorization: Bearer $KEY" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" -d '{"items": [{"sku": "P-1001-M", "quantity": 12}]}'
```

`quantity` is the new on-hand total. Setting the same number twice changes nothing the second time.

## Deactivate

```bash
curl -X DELETE "$API/v1/products/$ID?environment=live" -H "Authorization: Bearer $KEY"
```

Products are deactivated, not erased, so order history stays intact.

## Errors

`401/403` bad or wrong-scope key, `404` API disabled or unknown product, `409` idempotency key
reused with a different body, `422` invalid field (`INVALID_PRODUCT`, `INVALID_FILTER`), `429` rate limit.
