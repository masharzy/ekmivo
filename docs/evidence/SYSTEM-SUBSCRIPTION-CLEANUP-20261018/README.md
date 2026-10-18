# System subscription cleanup and usage rendering

The owner explicitly requested removing the current system workspace from all subscriptions. Migration 0104 records the former subscription and override in audit, deletes only the currently selected system workspace assignments, and rejects future subscription mutations for selected system workspaces. Historical invoices and plan catalog remain intact. Unlimited effective access remains active.

Admin workspace overview now reads effective entitlements instead of the stored Starter assignment. The plan panel hides subscription management for system workspaces. Usage formatting tolerates null quotas and displays Unlimited.

Validation: isolated Neon rollback test verified deletion, audit retention, unlimited access and blocked reassignment. Real admin usage component rendered with null quotas in EN/BN without crashing. Next production build passed, targeted lint 0 errors/2 existing warnings, admin design verifier passed. Migration 0104 applied in production; confirmed subscriptions=0, paid_overrides=0, system effective plan active. SHA256 6f5058e03d697e0d533ba0a3e24cab6a42e5d6830bead006ea667b450a884c10.

Deployment limitation: Vercel build rate limit has blocked frontend commits since 4743fbc, including concurrent PR83. Database changes are live; frontend rollout and manual visual verification remain pending until a build is permitted. No browser pass claimed.

## Usage date clarification

Production effective entitlement rechecked: active system-workspace, access_until=infinity, subscriptions=0. The header's date range was period_start/period_end for monthly reporting, not access expiry. System workspace now explicitly shows Unlimited / No expiry and omits the date range. Non-system workspaces label that range Usage period. Bilingual render regression includes actual period dates and verifies the system header has no date/expiry ambiguity. Targeted lint and production build passed; no database mutation needed.
