# Phase 5 evidence (code level)
Migration `0235_briofold_customer_profile.sql`: `briofold_customer_profile`, `briofold_thread_name_sync` trigger, index.
Verified on Neon test branch: stats orders 6 / delivered 3 / cancelled 1 / returned 1 / total 300000, channel ms, risk none, owner sees phone, thread rename syncs customer name.
NOT verified: viewer/editor PII hiding by running as those roles, 1,000-customer p95, second run/rollback. NOT built: drawer UI, Meta Graph name fetch, merge action.
