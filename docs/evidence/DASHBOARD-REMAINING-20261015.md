# Dashboard remaining — 2026-10-15

- Customers Details: reproduce and fix occasional 404 / “Source unavailable, please retry” when opening an existing customer.
- One-time Request: reproduce and fix “Unable to load workspace” route failure.
- Live browser QA: check compact Overview, Payments/SMS Data alignment, Customers CSV modal, Payment Links modal, Receiving Account modal, EN/BN and mobile layouts.
- SMS verification QA: on deployed Go + web, confirm real historical payer numbers, TrxID and original SMS show to owner/admin but never to unauthorized roles.
- Live device QA: verify real bKash/Nagad incoming SMS → payment match → webhook delivery; SQL read migration alone does not prove end-to-end behavior.

Applied migration 0066 to Neon live/sandbox financial databases on 2026-10-15; verified read functions and manually authored invoices list is empty (no manual invoices in current database). No historical payment or SMS rows rewritten.
