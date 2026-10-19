# Canonical checkout links and default Official theme — 2026-10-19

- Customer checkout URLs use `https://ekmivo-web.vercel.app/checkout/<token>` by default, independently of the dashboard CORS origin. Optional Render-only `GO_PUBLIC_WEB_ORIGIN` accepts a bare HTTPS origin; invalid configuration fails startup. `GO_WEB_ORIGIN` remains the existing server-to-server/CORS binding and is not changed.
- Missing/invalid merchant theme settings resolve to Official using actual merchant name and safe logo. Valid selected themes are preserved. This also applies to existing payment links and final states.
- Language selection uses the locale preference cookie and canonical route instead of creating `/en` or `/bn` checkout links.
- Hidden signing secret now says Secret hidden rather than displaying a fabricated `whsec_` prefix.
- No migration, payment creation, cancellation or financial status mutation is needed for this repair.

Checks: Node fallback-theme regression tests, Go checkout/API package tests, targeted ESLint, Next production build. Deployment and live read-only checks are recorded in the task response. Physical transfer verification is not claimed.
