# Briofold Phase 6 implementation checkpoint — 2026-10-21

Canonical scope: `docs/BRIOFOLD-UNIFIED-IMPLEMENTATION-ROADMAP.bn.md`, Phase 6–10. This checkpoint does not replace or reduce those gates. Phase 1 CSS extraction is outside the owner's current execution scope.

## Implemented increments

- PR #129, merged as `875ebf4`: least-privilege Inbox read/send/manage, AI entitlement checks, granular denial, real HTTP and browser role/revocation tests. This is only the first Phase 6 increment.
- PR #130: assistant drafts, explicit immutable publication and rollback, versioned knowledge sources and publication snapshots, removal from retrieval, tenant authorization, optimistic revisions, idempotency, bounded pages and audited rate-limited writes. New migration 0133 remains unapplied to production.
- PR #131 (stacked draft): account/business/thread-scoped reply drafts, existing navigation Save/Discard integration, durable send retry keys, lost-response acceptance, serialized polling and stale-response protection, revoked-access clearing, keyboard send and bounded conversation/history navigation. Inbox CSS is unchanged.

## Verification boundary

Local Studio validation/action tests (8) and Inbox draft storage tests (4) pass. TypeScript and focused ESLint pass. SQL acceptance exercised migration 0133, concurrent publication retry, immutable history, source snapshot/archival, tenant/role/product denial, pagination, FORCE RLS, runtime privilege denial and zero configuration credit debit. The first full CI run failed at a prefilled textarea label lookup; rendered-page diagnostics confirmed the editor existed. Explicit accessible names were added. SQL success is not a browser or full-phase pass. The diagnosis was resolved. Combined Studio/Inbox tree `4d0db3618759f0f06cfb019f511eacec914ebefb` passed all four Foundation CI jobs in run `39535767113`; SQL and real Next/Go browser markers passed. PR #131 was merged into the Phase 6 feature branch only. Main remains unchanged.

Critical Phase 5 proof-binding migration, recovery code and proof-integrity test blobs remain unchanged. Paid AI/top-up flags have not been enabled by these changes. Neither financial database was migrated by this increment.

## Open gates

Phase 6 is **not sealed**. Remaining code and acceptance include published-config integration with the metered AI/channel execution path; grounded assistant tests; ownership/handover and queued-send cancellation; auto-revert policy; labels/status/SLA/alerts/saved replies/tickets/duty; web attachment interactions; comment rules, post targeting, review/moderation, throttling, audit and dry-run; website origin/rate-limited chat; PDF/Word/URL ingestion; complete mock-provider end-to-end journeys. Live delivery additionally needs authorized provider accounts and is separate from code acceptance.

Phases 7–10 are **not sealed**. Their CRM identity, central order/inventory/delivery, financial read parity and growth/reporting/release gates must be implemented and tested under the canonical roadmap. Existing legacy screens or green baseline CI are not proof that these phases are complete.

The owner will perform the consolidated visual/physical acceptance after code and automated gates. No completion percentage or full-phase completion is claimed here.

## Human workflow increment

Migration 0134 and Go Inbox actions implement ownership, optimistic workflow revisions, human takeover with atomic queued-AI cancellation, explicit release guarded by disputes and unresolved complaint/refund/return tickets, worker-driven scheduled return, notes, duty, saved replies and ticket history. Runtime table access remains revoked; operations are authorized and audited. UTF-8 human reply validation uses character counts with a bounded byte cap.

Initial source run `39540052481` passed the Go/container/Kotlin jobs and the PostgreSQL/browser integration step. The library routes, assignee search, queue/content filtering, pagination and ticket deep links passed all four jobs in Foundation CI run `39540906903`, remote head `84d48ed942581a762a79ec7f427bafc7f7de10e5`. The actual PostgreSQL/browser workflow marker and all 766 isolated finance/River assertions passed. Migration 0134 is not applied to production. Published-config AI execution, comments, website chat and other canonical Phase 6 gates remain open.


## Grounded execution increment (verification pending)

Migration 0135 adds private durable AI jobs, published knowledge/catalog context, burst coalescing, one running job per conversation, no automatic provider retry after lost leases, and lease/idempotency guards. The Go runtime uses the existing prepaid engine; no alternate billing path or financial truth tools were added. Completion requires a completed metered execution. Human takeover, publisher revocation, new inbound messages, publication changes and source/catalog changes invalidate queued output at completion and dispatch. Practice testing has a server-authoritative context endpoint and explicit credit consent UI. Paid runtime remains operator-gated; no flags or production migrations were changed.

Local TypeScript, focused ESLint and 28 Studio/draft/route tests pass. New Go tests and isolated PostgreSQL channel tests require the current-tree CI run. This is not a Phase 6 completion claim. Core comments/site/attachment interactions and remaining canonical gates still require implementation.
