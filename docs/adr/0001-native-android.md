# ADR-0001: Kotlin + Jetpack Compose for Briofold Android
Status: Accepted by product owner (2026-10-11).

## Decision
Build the merchant Android product **fully in Kotlin**, with Jetpack Compose for UI/navigation/motion, Kotlin Coroutines/Flow for asynchronous state and native Android services for opt-in receipt collection. **No React Native, no Flutter, no JS bridge and no separate receipt-bridge APK.**

The receipt intake code is an internal module/service of `apps/mobile`, first exercised in PG06. It may be distributed before the full merchant UI is accepted, but only via the same app and identity. Android SMS/notification permissions require explicit consent, scoped parsing, enrollment, isolation and actual provider/device evidence; no amount-only matching and no SMS OTP collection.

## Boundaries
Go/PostgreSQL remain authoritative for payment matching, financial status, ledger, refunds, signed webhooks and tenant authorization. The Kotlin app sends signed **evidence** only; device signatures do not attest to payment-provider authenticity. No frontend 'mark-paid' or invented successful payment state. Provider API/receipt methods remain separate provenance categories.

Use Hind Siliguri, Ink & Bone tokens, full light/dark/system and EN/BN text. Copy layout/interaction *quality* of mature chat apps, not their protected brand/trade dress. Measure jank/frame timing and startup on low/mid/high devices using Macrobenchmark/Baseline Profiles before claims of smoothness. Use LazyColumn stable keys, state restoration, lifecycle-aware Flow and correctly scoped animation.

iOS uses its own client later (FM04), not cross-platform sharing. Existing `apps/android-bridge/` is a historical placeholder only; preserve history, migrations, secrets and server behavior.

## Trade-offs
Native Android offers direct system integration and performance tooling, but requires separate iOS UI implementation. Compose is not a guarantee of 60/120fps and real-world Messenger/Instagram/WhatsApp integration requires each provider's approved APIs, not UI imitation.

## Evidence
PG00 GitHub Actions [38114530626](https://github.com/masharzy/ekmivo/actions/runs/38114530626) covers **existing web/Go/Postgres foundation only**. Kotlin assemble and instrumented device benchmarks are tracked separately as implementation proceeds.
