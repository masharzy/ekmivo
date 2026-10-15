# Developer portal — 2026-10-15

## Scope

Latest owner instruction replaces the old documentation design. The supplied HTML is a visual reference only; its demo behavior and API facts are not authoritative. Main was pulled first from b65a188 to 277a568, preserving the other agent's dashboard/SMS work. No backend, API contract, authentication or database changes in this release. No Docker used.

The portal has its own route-group layout, 57px header, sidebar, outline, mobile drawer, shared command palette/modal/progress, semantic tables and server-highlighted Shiki dark-plus/light-plus code. Geist fonts are bundled. Existing theme/language cookies and theme storage are retained. Eleven localized routes: overview, quickstart, authentication, payments/create, payments/verify, webhooks, errors, sandbox, go-live, api-reference and changelog. Legacy documentation redirect and old anchors remain mapped.

The test console opens in a modal, retains a pasted test key in component memory only, rejects live keys client-side and server-side, and uses a same-origin route handler to call the existing test-key-bound API. It does not issue keys or simulate successful payments/alerts. Existing key secrets cannot be recovered from stored hashes, so no automatic signed-in secret prefilling is implemented.

## Available checks

- Production build passed after creating the standalone route group and eleven pages. Final checks are recorded below when complete.
- TypeScript noEmit passed after route types regenerated.
- Targeted portal ESLint passed after fixing escaped JSX quotes and modal refs.
- Production dependency audit: 67 production dependencies, zero known vulnerabilities.
- Local HTTP/security smoke: 28 checks passed: all 11 routes in EN/BN return 200 with localized HTML, canonical/OG metadata and without marketing chrome; live-key/invalid amount/invalid invoice/invalid action/origin rejections; unknown route returns 404. No successful create/payment or credential mutations are used by these tests.
- Browser observed: Bengali dark desktop hub/quickstart, shared language selection changes both quickstart examples, API modal rejects a fictional live-prefixed key and disables submission, Escape closes modal and restores trigger focus. Mobile 360px hub/quickstart/authentication/create show one h1, no horizontal overflow, no marketing chrome; left drawer opens with all links.
- Browser viewport/navigation/debugger failures repeatedly interrupted the remaining theme/language/mobile/keyboard matrix. Do not claim these visual checks all passed. The Chrome hydration warning observed was caused by Grammarly/ColorZilla body attributes, not portal data.

## Facts and remaining work

1. Configure `NEXT_PUBLIC_DEVELOPER_API_ORIGIN` with the actual provisioned custom HTTPS API origin. Until then the chip honestly shows unpublished and cannot be copied; examples use EKMIVO_API_ORIGIN. Do not invent api.ekmivo.com or display a third-party hosting URL as a custom domain. `NEXT_PUBLIC_DEVELOPER_ORIGIN` can set a separate public portal host.
2. Publish a guaranteed idempotency retention period; current source specifies 16–128-character syntax but no promised expiry. This is marked TODO in API reference.
3. Requests use `amount` in taka. The pulled Verify API contract/backend still return `amount_minor`; this is documented once in API reference and not silently changed by a UI release. New request examples never use legacy minor-unit fields.
4. Current version is taken from OpenAPI (0.9.0-draft). Status enum, signature tolerance, 120/minute per-process merchant limit and eight-attempt retry schedule are grounded in existing source; no new operational promises.
5. Complete remaining visual/keyboard matrix and an authorized real Sandbox happy path, including genuine receipt scenarios and signed callback/verify. Alert replay/testing remains in the authorized workspace. The portal does not fabricate an alert log.

`DEVELOPER_SANDBOX_ENABLED=false` disables the thin API tester transport. Temporary reference HTML was removed before commit.

## Final source checks

Full `npm run lint` passed with zero errors and 20 existing warnings outside the portal. Current TypeScript noEmit passed. All 28 local smoke checks passed. The initial complete production build passed; a final repeat build is still running on the slow local filesystem when the release commit is prepared. No backend/contracts/infra diff. Remote main was fetched again and remained at 277a568 with no divergence. Owner explicitly requested pushing when code checks were good. Remaining browser matrix is manual pending, not a source-build failure.
