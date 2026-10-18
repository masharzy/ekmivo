# System workspace unlimited override

Owner authorized all features and unlimited commercial quotas for the currently selected system receiving workspace. No secret plan is created. Migration 0103 adds a derived branch to payment_plan_effective; every call checks current system designation. Existing subscription/version data remains intact. Removing/changing designation automatically restores the assigned plan (including expiry and disabled features).

All four features enabled; payment volume, active checkouts, commercial creation-per-minute quota, accounts, devices, keys and team seats are unlimited. Authentication, membership/RBAC, system workspace super-admin eligibility, request budgets/security rate limits, financial validation and audit remain enforced.

Billing shows a compact system/unlimited state without renewal/upgrade offers. Usage and historical billing records remain accessible. Admin usage displays null creation cap as Unlimited.

Validation: isolated Neon rollback fixture covers every feature/quota, expired and absent subscriptions, designation removal/change, and unchanged underlying subscription. Full Go suite and Next production build passed; targeted lint 0 warnings/errors; 15 feature/resource tests passed; admin design verifier passed.

Production control migration 0103 applied with ledger checksum cc3b9ed1924821fc68b6d8f59675e184dfbe1a8f001559104b0a8efccabb9568. Actual runtime role confirms platform_billing=true, active=true, infinity expiry, all flags true and null quotas.

Manual pending: Billing/usage visual check in EN/BN light/dark and mobile/desktop. No physical-device or browser pass claimed.
