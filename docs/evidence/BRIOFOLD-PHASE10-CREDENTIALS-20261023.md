# Phase 10 credential lifecycle continuation — 2026-10-23

Scope: Briofold Phase 10, stacked on the active `agents/phase10-growth-release` work. This is not the later full Workspace-to-Store migration. Signup/name collection and old route removal are deliberately deferred by the owner until Phase 10 is complete.

## Corrections

- Merchant key server actions revalidate the actual locale-prefixed canonical `/settings/api-keys` page as well as its historical adapter. A completed create/rotate/revoke must refresh the current inventory without a manual page reload.
- All three mutations recheck an installed authoritative primary Store binding inside the write transaction. A historical membership does not authorize a stale form targeting a different Store. Legacy databases without that additive binding table retain the existing membership authorization.
- Live key issuance handles a database lacking the optional platform-receiver function by denying the implicit platform exemption and checking the actual subscription. It does not invent an active entitlement or disable the plan check.

## New acceptance

`apps/web/scripts/briofold-key-lifecycle-acceptance.mjs` runs after the Phase 9 financial/browser fixture in the existing disposable Foundation workflow. It uses a fictional test password, restores the prior hash in `finally`, and never logs raw credentials. Coverage: wrong-password creation denial; owner Sandbox creation through the canonical UI and real server action; hash-only persisted credential; immediate inventory refresh; reload secret privacy; rotation with predecessor resolver invalidation and preserved expiry/scopes; successor revocation; private viewer inventory; exact append-only audit actions. These are automated source tests until their exact pushed commit's Foundation CI passes. No provider delivery or production acceptance is implied.

## Status

**NOT SEALED.** Full 56-row parity, missing growth integrations and other unresolved implementation remain governed by `docs/BRIOFOLD-FEATURE-PARITY-TRACKER.csv`. Do not count this change as full API-key row parity before interactive domain-lock coverage and exact-head CI are verified. No PR merge, production migration, flag activation, external send or deployment is authorized.

The follow-up expands the browser test with direct viewer replay of the actual Next action payload (authorization must hold independently of hidden UI), a historical-owner stale form after primary Store rebinding, and actual Live key create/revoke under the preceding fixture's purchased entitlement. The test installs the exact binding table DDL from the canonical foundation only when absent in the older disposable fixture, and removes only that fixture-owned table/binding in `finally`; it does not claim full subscription migration acceptance. Production Next build also passes locally. This expanded acceptance still needs its own exact-head CI.
