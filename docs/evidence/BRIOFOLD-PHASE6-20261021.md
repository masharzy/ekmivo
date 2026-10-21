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

Phase 6 is **not sealed**. Remaining code and acceptance include current-tree acceptance of grounded metered AI/channel execution, instruction proposals/review queue and web attachment interactions; persistent alert delivery; comment rules, post targeting, review/moderation, throttling, audit and dry-run; website origin/rate-limited chat; PDF/Word/URL ingestion; complete mock-provider end-to-end journeys. Live delivery additionally needs authorized provider accounts and is separate from code acceptance.

Phases 7–10 are **not sealed**. Their CRM identity, central order/inventory/delivery, financial read parity and growth/reporting/release gates must be implemented and tested under the canonical roadmap. Existing legacy screens or green baseline CI are not proof that these phases are complete.

The owner will perform the consolidated visual/physical acceptance after code and automated gates. No completion percentage or full-phase completion is claimed here.

## Human workflow increment

Migration 0134 and Go Inbox actions implement ownership, optimistic workflow revisions, human takeover with atomic queued-AI cancellation, explicit release guarded by disputes and unresolved complaint/refund/return tickets, worker-driven scheduled return, notes, duty, saved replies and ticket history. Runtime table access remains revoked; operations are authorized and audited. UTF-8 human reply validation uses character counts with a bounded byte cap.

Initial source run `39540052481` passed the Go/container/Kotlin jobs and the PostgreSQL/browser integration step. The library routes, assignee search, queue/content filtering, pagination and ticket deep links passed all four jobs in Foundation CI run `39540906903`, remote head `84d48ed942581a762a79ec7f427bafc7f7de10e5`. The actual PostgreSQL/browser workflow marker and all 766 isolated finance/River assertions passed. Migration 0134 is not applied to production. Published-config AI execution, comments, website chat and other canonical Phase 6 gates remain open.


## Grounded execution increment (verification pending)

Migration 0135 adds private durable AI jobs, published knowledge/catalog context, burst coalescing, one running job per conversation, no automatic provider retry after lost leases, and lease/idempotency guards. The Go runtime uses the existing prepaid engine; no alternate billing path or financial truth tools were added. Completion requires a completed metered execution. Human takeover, publisher revocation, new inbound messages, publication changes and source/catalog changes invalidate queued output at completion and dispatch. Practice testing has a server-authoritative context endpoint and explicit credit consent UI. Paid runtime remains operator-gated; no flags or production migrations were changed.

Local TypeScript, focused ESLint and 28 Studio/draft/route tests pass. New Go tests and isolated PostgreSQL channel tests require the current-tree CI run. This is not a Phase 6 completion claim. Core comments/site/attachment interactions and remaining canonical gates still require implementation.


## Current execution verification

Human workflow/library head `84d48ed942581a762a79ec7f427bafc7f7de10e5` remains the latest fully green checkpoint (run `39540906903`). Grounded execution/attachment run `39559293014` passed Go tests, API/container compilation and Kotlin build, but failed applying migration 0135: an unqualified JSON product alias collided with the outer entitlement `product` text column. Explicit `fact.value` references correct that source defect; a new current-tree run is required. No SQL/channel/attachment acceptance is inferred from that failed run.

Further source adds bounded worker concurrency (four global, two per business), bounded delivered conversation context, conversational term retrieval, natural-language instruction proposals with comparison and explicit unsaved-draft acceptance, and durable account/business-scoped paid-test retry keys. No proposal auto-saves or auto-publishes. The isolated browser harness enables only Next's UI flag and leaves Go's paid flag false; mocked practice/proposal results are UI evidence, not live model quality or metered-provider evidence. The actual SQL acceptance separately exercises audited synthetic credit grant, reserve/complete, exactly-once output queueing and source-change dispatch cancellation.

Local current-source checks: TypeScript and focused ESLint pass; 32 Studio/draft/route/request/attachment tests pass. Additional Go tests await CI. Web attachments use the existing required scan/private storage backend; no scan bypass or public file host was added. Browser fixture storage is explicitly mocked; the real proxy scanner-unavailable failure is separately exercised. New migrations 0133–0135 remain unapplied to production.


Run `39560329706` successfully applied the corrected 0135 migration, passed Go/API/Kotlin jobs and the real Inbox access browser gate, then failed the paid-off Studio browser assertion. The client read only a top-level error code while Go returns the established nested error envelope. Studio, attachment and document-import clients now accept that envelope; the scanner assertion uses the same real contract. This run is not current-tree acceptance.

The next source also adds server-side selected-business checks for paid Studio/import proxy calls, visibility of expired jobs while paid workers are paused, bounded per-business concurrent claim tests, and rejection of late older inbound events as replacement AI questions. Word `.docx` extraction supports paragraphs/tables, headers/footers and notes with ZIP expansion, XML depth and text limits; document macros/relationships are never executed or fetched. Import requires the existing safety scanner, has a bounded global slot/rate limit, and only populates an unsaved plain-text editor preview. Migration 0136 adds authorization only. PDF, legacy `.doc`, URL ingestion, comments and website chat remain open canonical work, not provider-only blockers.


Run `39561633848` passed the actual AI channel acceptance marker: published grounding, coalescing/lease rules, unmetered finish denial, takeover/publisher/source/publication guards, actual audited grant/reserve/complete, bounded concurrent claims, exactly-once queueing and dispatch cancellation. Full CI stayed red: Word traversal test exposed a leading `../` validation gap (fixed and locally retested), and Studio browser found duplicate visible paused text (the assertion now targets the alert role). These failures are retained in the evidence, not treated as infrastructure flakes.

A checksum-verified local Go 1.27.0 toolchain now runs the complete Go suite successfully. URL import source adds a public-only HTTPS fetcher with pinned, revalidated DNS/IP connections, redirect/port/credential restrictions, no environment proxy or cookies, TLS verification, body/time/token/text limits, and non-executing HTML-to-text extraction. The `golang.org/x/net/html` dependency is pinned at v0.61.0 and its required Go module updates are locked; the full Go regression suite passes locally. URL network/HTML fixtures and Word parser tests pass; actual proxy/browser/save paths need the next CI run. Imports are unsaved text until explicit Save and do not debit credits. PDF remains open.


## Verified grounded/workflow/import checkpoint

Remote head `e1a1f8cf26d8c81fee6acb3b8d3b2cabd30b218e` passed all four Foundation CI jobs in run `39562652089`. Logs contain actual Inbox access, AI channel, Studio browser, eight-long-conversation draft/attachment and human workflow markers, plus the 766 baseline isolated finance/River assertions. Word/URL browser previews use explicitly mocked parser/network transport; actual source Save/authorization/proxy/scanner failure and the real Go parsers/network-policy unit tests are separately verified. No live model/provider delivery quality is inferred from these mocks.

The subsequent PDF increment uses Poppler in a separate credential-free child process with wall/CPU/address-space/output limits. Local real PDF tests pass for English and embedded Bengali text, malformed/textless input and cancellation; all Go packages, TypeScript and focused lint pass. Production image assembly now needs its next CI build to verify the native executables/dependencies under the existing nonroot runtime. The parser test also runs during that image build. No unpatched in-process PDF parser was introduced.

Phase 6 remains OPEN for post-specific comments/rule/moderation automation, website channel chat, persistent alert delivery and remaining canonical provider/mock end-to-end coverage. Current PDF tree is not yet CI accepted. Phases 7–10 remain OPEN; this checkpoint does not mark them implemented. Production/main and financial realms remain unchanged.

## Recovered channel extensions — current acceptance pending

Workspace maintenance removed the unpublished local website/comments/alerts source. The saved PR branch was restored from GitHub. Owner explicitly authorized publishing Phase 6 code and running CI. Restored website adapter commit `5387148b18afbc4081ebdba39d77f8ed110f12e9` passed all four Foundation jobs in run `39596943953`; that run did not yet apply 0137 or run the new public channel journeys.

The subsequent source restores migrations 0138–0139, persistent recipient-scoped Inbox alerts and AI-only `/notifications`, signed comment intake/deduplication, post allow/exclude lists, Unicode keyword policy, PII/complaint review, confidence thresholds, fixed/AI/human modes, actual review actions, dry-run, audit, bounded worker claims, rate limits, uncertain-outcome recovery and authorized Meta moderation. Intent classification and grounded AI replies use the existing prepaid meter. Fixed replies/dry-run do not call it. Publication/source/rule/permission changes invalidate queued output. New OAuth comment scopes require an explicit connector action; ordinary chat connections keep their prior scopes.

`BRIOFOLD_COMMENTS_ENABLED=true` starts two bounded evaluation/delivery workers; `BRIOFOLD_COMMENT_DELIVERY_ENABLED=true` separately allows provider dispatch. Neither flag was enabled in production. `INBOX_PUBLIC_API_ORIGIN` is required for an installable website snippet. Public visitor access is exact-origin and secret scoped; capabilities are hash-only in the database. Existing billing, financial proof binding, payment confirmation and provider credentials are unchanged. No production migration or live customer test occurred.

Local full Go tests, TypeScript and focused lint passed before publication; new comment provider/policy tests and integration source have been restored. Actual 0137–0139 migration/HTTP/browser acceptance and the real Chromium widget with mocked transport require the new CI run. No Phase 6 seal is claimed by source creation or by the older green run.

## Channel extensions CI checkpoint and final hardening

Commit `ebe90f4089c3a0f251df56799cbac278a523c1c2` passed all four Foundation CI jobs in run `39598513000`: Go, Android, web/PostgreSQL/browser, and production container build. The run applied migrations 0137–0139 and passed signed comment HTTP/SQL/browser, website origin/session/idempotency/privacy, recipient-scoped persistent alerts, real Chromium widget retry/history/XSS/keyboard, existing metered AI/Studio/access/workflow/eight-conversation journeys and 766 isolated baseline finance/River assertions. Provider and storage fixtures remain mocked; no production rollout is inferred.

This follow-up adds secret-scoped delivery of sent website attachments, queued/other-visitor media rejection, safe browser blob rendering, actual Go comment worker execution against the disposable CI database, unmetered AI comment rejection, and timezone-independent SLA deduplication. Its current-source CI result is pending; the previous checkpoint does not prove these additions. No production migrations, flags or live sends were changed.

Run `39601308149` on `075ed02fefc653ab44e97e1523df80cef8517f00` passed all Phase 6 acceptance markers, including the added actual Go comment worker, unmetered AI rejection, sent/queued/other-visitor attachment authorization, browser attachment blobs and timezone-safe SLA deduplication. Go, Android and container jobs passed. The overall web job failed afterward in the older PG02 VM fixture because concurrent main SiteControls now uses React useRef. Both locale/onboarding fixture hook mocks have been updated and passed locally against current main's actual component source. Earlier run `39600098223` exposed the stale marketing selector assertion; run `39600419048` exposed an ambiguous duplicate permission-text locator. Both test guards were corrected without changing product CSS or removing assertions. Full final CI remains required; no green overall result or production rollout is claimed here.
