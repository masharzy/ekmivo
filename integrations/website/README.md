# Website and custom-bot hosted checkout

`checkoutForAuthorizedOrder` is a server function for a website or custom bot. Adapt the `MerchantDatabase` transaction/query interface to your PostgreSQL driver. Install the local SDK and the merchant schema in `examples/webhook-receiver/schema.sql`. That schema belongs to the merchant application, not the Briofold financial database.

Your existing server must authenticate the buyer, authorize the order and create its price from your catalog before calling this function. A bot must resolve its verified platform user to its own order; a chat message cannot select another buyer's reference. Never accept the amount, API key, workspace or environment from a browser or chat message.

The function reads the stored total, rejects an already accepted order and creates a hosted payment using one deterministic key per order/business/environment. Retry a timeout with the same order. A changed total intentionally conflicts with the old key; resolve/cancel the previous request before creating a newly referenced order. Do not retry with a random key.

Send the returned HTTPS link to the authorized buyer or redirect them there. Do not fulfil on the return URL. Install one of the full webhook consumers under `examples/webhook-receiver`, using the same business/environment and server signing secret. Signature verification, authoritative payment query, stored-total check and durable fulfilment queue are required together. The fulfillment worker must also be idempotent.

For Shopify, use this only for an independently authorized external/manual payment flow permitted by the shop's configuration. This is not a Shopify Payments App or approval claim; an approved native Shopify payment extension requires its actual platform contract. Full Shopify order/catalog synchronization belongs to the later commerce phase. No connector has been live-tested from this source checkpoint.

Combined tests: unauthorized order, changed amount, lost API response followed by same-key retry, expired checkout, spoofed return, duplicate signed event, wrong business/environment, paid order retry, process restart and actual fulfilment once. Seller refunds remain requests; this integration never transfers money.
