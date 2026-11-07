# Workspace privacy workflow

An owner submits an authenticated, password-confirmed export/deletion request from Settings. The control-plane ledger tracks control, live, sandbox, private objects, jobs, Android caches and backups separately. No worker can claim deletion by accepting that request. Every store begins pending.

The operator first performs the approved store operation and retains a redacted evidence file. `record-store.mjs reviewed-store.json output.json audit` validates a record without connecting. `record` requires `BRIOFOLD_PRIVACY_RECORD_ENABLED=true` and the separately supplied `BRIOFOLD_PRIVACY_CONTROL_DATABASE_URL` belonging to the control database owner. Do not configure that role on the application. The file contains request/workspace UUIDs, store, disposition, reason, operator, actual observed_at, relative evidence_file and retained_until when applicable; never credentials or raw receipts.

`retained` requires a reviewed policy and future expiry, `not_applicable` requires evidence that the store has no relevant data. Financial history or backup copies are not called deleted merely because operational records disappeared. Export cannot be fulfilled by deletion evidence. Deletion cannot be fulfilled by export evidence. A blocked/pending store prevents completion; retained stores produce `complete_with_retention`. Each observation is appended immutably with the database operator identity.

Source limitations remain explicit: comprehensive store export/erasure executors and their reviewed retention policies are not yet implemented. This ledger/recording tool is real request processing, not a claim that those executors exist. Applied migration and live/browser/operator verification remain pending.


## Encrypted SQL-store executor

`store-export.mjs <request-uuid> <workspace-uuid> <control|financial_live|financial_sandbox> <private-output>` implements a read-only, one-store repeatable-read snapshot for an open export request. It needs `BRIOFOLD_PRIVACY_EXPORT_ENABLED=true`, a separate 32-byte `BRIOFOLD_PRIVACY_EXPORT_KEY_HEX`, the control operator connection, and the corresponding `BRIOFOLD_PRIVACY_LIVE_DATABASE_URL`/`BRIOFOLD_PRIVACY_SANDBOX_DATABASE_URL`. Financial realm and independent table-owner identity are checked. No application role receives these credentials. Do not run against accounts without owner authorization.

Catalog-discovered `workspace_id` tables use an exact parameterized workspace predicate. The workspace row, scoped member contact profiles and named child tables use explicit scoped parents. Passwords, tokens, capability secrets, encrypted receipt bodies and key material are excluded recursively. A bounded encrypted JSON-lines snapshot contains per-table counts. Failed snapshots are removed; no completion observation is recorded automatically. SQL-store snapshots are independent in time, so pause tenant changes if the reviewed export requires a coordinated cross-store snapshot.

This executor has syntax/unit source checks only; no database execution has run. Private object bytes, Android caches, backups, global queue wakeups, erasure execution and future child-table coverage are still separate required store work. Do not call a SQL snapshot a complete privacy export, and do not place decrypted customer data in Git/evidence reports. Evidence contains only the encrypted-file hash and counts.
