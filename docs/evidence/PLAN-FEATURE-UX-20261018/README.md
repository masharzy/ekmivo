# Plan feature handling — 2026-10-18

Feature flags in the plan editor: invoices, reusable payment links, reports, exports.

- Shared page/navigation feature mapping; disabled features omitted from sidebar/search.
- Direct list/detail URLs show a bilingual merchant upgrade card rather than a 404 or failed API table. CTA opens Billing > Plans; no invented discounts.
- Plan read failure is a retry state, not a claim that an upgrade is needed.
- Overview actions fall back to core one-time requests when reusable links are disabled; disabled reports/active-link widgets omitted.
- Global record search skips disabled document sources. One-time requests skip invoice sources when invoices are disabled. Reusable links skip the invoice-linked section when invoices are disabled.
- Exports are hidden behind the existing server gate; the unavailable action has a concise upgrade link.
- Existing backend feature enforcement remains unchanged; no database migration.

Validation: Next production build, targeted ESLint (0 errors; existing warnings), four automated feature tests (all 16 flag combinations, missing data, EN/BN upgrade rendering, retry), 11 resource-limit tests, six responsive cascade tests, admin design verifier, draft smoke.

Manual pending: owner mobile/desktop light/dark visual checks; toggle features in an actual workspace plan and verify navigation, overview, direct URLs and Billing > Plans. No browser or physical-device pass claimed.
