# System receiving workspace and mobile dashboard — 18 October 2026

Owner requested mobile dashboard fixes and Admin selection of Ekmivo's system receiving workspace. Paid-plan destinations were previously sourced exclusively from PLATFORM_BILLING_WORKSPACE_ID, with no Admin selector. The reported error is emitted for missing/invalid destination or unavailable payment service; historical environment values were not exposed or guessed. Production control database had zero platform invoices before this rollout.

## Implementation
- Admin Settings: MFA-protected super-admin action selects a payment-enabled workspace managed by the actor. Every member must be an active super admin. SQL validates the same rules, audits the previous/new destination and reason, guards later membership inserts/updates and platform-role demotions. Runtime can read configuration but cannot set it or update its table.
- Migration 0096 in control realm, integrated with the existing coordinator. Every new invoice pins its receiving workspace. Existing invoice proof/reconciliation and background reconciliation use that pinned destination, even after changing the setting. Current and unpaid historical receiving workspaces receive the internal billing allowance snapshot.
- Checkout checks active receiving methods and verification sources before creating an invoice. Missing system setup yields an actionable bilingual message. No receiving number, owner workspace or receipt/device was fabricated or configured on the owner's behalf. Physical phone/SMS setup remains owner work.
- Mobile desktop CSS had overridden sidebar hiding and fixed header sizing. Final scoped rules restore the mobile shell, wrap controls/account actions and constrain dialogs. Billing's early mobile grid rules were overridden by later desktop rules; final breakpoints stack content, keep metrics readable and scroll tables within cards.

## Verification
- Isolated Neon migration and rollback-only fixture passed: denied ordinary actor, super-admin setting, denied ordinary member, denied role downgrade, invoice pinning across destination change, protected unpaid old workspace and audit record.
- Actual restricted runtime role: read current/pinned destination allowed; setter and raw UPDATE denied.
- Six source CSS cascade tests at 320, 375, 390, 768, 800 and desktop widths passed. These verify actual stylesheet rule precedence, not rendered visual parity.
- Full Go suite, Next production build, draft navigation regression and Admin reference checker passed. Targeted lint: zero errors, three existing unused-variable warnings in platform-admin-console.tsx.
- Chromium download failed (truncated archive), so no browser/visual result is claimed. Owner's mobile and physical-device verification remains pending.

## Activation
Admin > Settings > System receiving workspace: select an eligible workspace and save. Add Ekmivo's own numbers under that workspace's Payment methods, then connect the real verification phone under SMS devices. This destination serves every paid plan. Until those steps are complete, paid purchase correctly remains unavailable. No real plan purchase or payment was performed in this task.
