# System workspace feature snapshot regression

Root cause: planSnapshot returned early for the system receiving workspace with only workspace_id, platform_billing and fetched_at. The Go feature check used actual control terms and passed, while private financial SQL saw no terms.features and raised P6807. This affected invoices, links and reports despite an enabled plan.

Fix: retain effective plan terms and append the system quota exemption. Feature access still follows the assigned plan; no feature or resource limit is broadened.

Validation: full Go suite passed. A regression test exercises the real planSnapshot method for ordinary/system workspaces and preserves enabled and disabled flags. Isolated Neon live-financial runtime test reproduced P6807 with the old snapshot, passed invoices/links/reports with corrected terms, and confirmed a disabled export remains denied. No migration or production user-data change required.

Manual pending: owner refresh of the system workspace Payment links invoice-linked section and Reports after backend deployment.
