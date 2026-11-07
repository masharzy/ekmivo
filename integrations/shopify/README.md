# Shopify payment-only connector source

This is a merchant-server connector for hosted external payment, not a Shopify Payments App or a provider API integration. bKash/Nagad/Rocket phone verification remains independent of Shopify credentials.

Install the merchant receiver schema, then `schema.sql`. The merchant application authenticates and authorizes each order before `prepareShopifyCheckout`. The adapter fetches its outstanding BDT amount from the configured Shopify account, snapshots it in the merchant database and creates a same-key hosted checkout. Changed totals require review. No catalog/customer synchronization is included in the payment phase.

Install the full signed webhook consumer under `examples/webhook-receiver`. Only its durably verified fulfilment job can invoke `recordVerifiedShopifyPayment`. Use a server-held merchant Shopify Admin token with permitted order read/write access; never browser input. The `2026-10` API is pinned. No token, permission or store capability has been tested here.

The exact-amount manual recording path requires the store capability supported by Shopify's [orderCreateManualPayment documentation](https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderCreateManualPayment): its amount argument currently requires Shopify Plus and the appropriate order permission. Configure `exactManualPaymentSupported` only after that capability is actually confirmed. Unsupported stores retain the verified external receipt but the adapter refuses an automatic Shopify accounting write; this is an external capability blocker, not a phone verification prerequisite.

The adapter records money already received. It never captures an authorization, charges or refunds. It records the exact receipt amount, compares the current outstanding balance and checks the returned order. A durable sending record is committed before the external mutation. A lost response or process death remains sending/unknown and is never blindly retried. Resolve it using the merchant database, Shopify transaction history and operator evidence. A paid order alone cannot identify who paid it. A failed pre-write/configuration case may be explicitly requeued after review; unknown cases must be reconciled first.

Required tests: unauthorized buyer/order, wrong shop/currency, changed amount, unsupported store capability, duplicated Briofold event, worker killed before/after external mutation, write timeout, concurrent Shopify payment, wrong payment ID and seller-managed refund. None has been executed against a Shopify account.
