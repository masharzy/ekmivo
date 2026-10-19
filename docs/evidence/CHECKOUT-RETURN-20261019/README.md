# Checkout result return behavior

All nine checkout themes share a result component. Success and cancellation from a merchant checkout return automatically after 10 seconds to the configured safe merchant destination (cancellation prefers cancel URL). No return button is displayed. Payment-link checkout never returns automatically and has no return button. Expired checkout does not redirect. Missing or unsafe destination displays no countdown.

Origin is resolved by migration 0109 from tenant/realm-scoped durable payment-link document bindings. Payment-link redirects are omitted server-side. Unknown origin fails closed in the browser. Shared reference display preserves the first 16 and last 8 characters, with the full reference in the title; shrink/wrapping constraints cover all theme headers/results. Result messages use the configured store name.

Validation: three Node regression cases pass; Next production build and TypeScript pass; targeted ESLint has zero errors (existing image/unused warnings). Migration applied and tested on isolated Live/Sandbox and production Live/Sandbox. SQL assertions check existing link/merchant intents and wrong-workspace denial. No new payment or financial state mutation for validation. Migration SHA256: 76a33e8862c27429a6debb72b4c34450f27a8403af7d3ae0e53d341bb0dafb96.

Physical-device testing remains with the owner. Deployment status is reported separately after deployment.
