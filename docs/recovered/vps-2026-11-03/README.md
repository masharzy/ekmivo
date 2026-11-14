# Production migrations 0217–0219 that never reached `main` (applied on the VPS 2026-11-03)

The production control ledger (`dashboard_reference_migrations`) records these three files. They were copied here
byte-for-byte from the branches `fix/vps-feature-read-grants-20261103` and `fix/inbox-reference-spec`; their sha256
equals the production ledger rows (checked 2026-11-14 against the VPS inventory):

| file | sha256 |
|---|---|
| `0217_web_feature_read_grants.sql` | `abc5b149a798fd52146b8022267b1da5de6a9235d2392054cadfd1a7c9fa498c` |
| `0218_web_channel_scope_read.sql` | `6010dca7b8673e2789d68e0b43eab781a0ac9828d4bffeccf3a2ce962ee01773` |
| `0219_inbox_forward_customer.sql` | `0b0aef08c00ca4d6d32f17dffd5d2f627af8c9ab55ff5ff337b90f5070d05626` |

They are kept as a record, not in any migration list. Their numbers clash with `main`'s own 0217–0219, and the order in
which production ran them relative to `0219_inbox_telegram_no_reply_window.sql` has not been reproduced yet: applied
after it on a repo-built copy, `0219_inbox_forward_customer.sql` makes `inbox_forward_album_before_channel_scopes`
equal to production but not `inbox_advanced_before_channel_scopes` or `inbox_page_media`.
Do not edit these files: the ledger compares checksums.
