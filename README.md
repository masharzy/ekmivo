# Briofold

Briofold is a dual-service SaaS under active development. The first public release is defined by the [canonical plan](docs/DUAL-SAAS-MVP-PLAN.bn.md) and [46-item feature scope](docs/MVP-FEATURE-SCOPE.md). The current source contains public web, auth/workspace and partial separate-dashboard foundation; financial workflows are not live. Latest order: complete payment gateway with sandbox/testing/developer docs, then full Android/inbox, then remaining full MVP. Start at [agent handoff](docs/AGENT-HANDOFF.md); exact sequence is in the [backlog](docs/IMPLEMENTATION-BACKLOG.md) and evidence in [status](docs/IMPLEMENTATION-STATUS.md).

## Repository

| Path | Purpose |
|---|---|
| `apps/web` | Next.js public site and future merchant UI; deploy to Vercel |
| `apps/mobile` | Native Kotlin + Jetpack Compose Android application (no RN/Flutter/bridge) |
| `apps/android-bridge` | Future consented Android payment receipt capture |
| `apps/extension` | Future browser assistant |
| `backend` | Go API and workers, intended for persistent container hosting |
| `contracts` | Versioned API contract |
| `docs` | Plan, scope, design system, backlog and evidence |
| `evals`, `tests` | AI and end-to-end verification |
| `infra` | Deployment and local infrastructure |

## Local development

Scaffold toolchains: Node.js 24 and Go 1.27; inspect/pin actual versions in PG00. Existing Next.js auth has server-side PostgreSQL connection/migration source; the Go API has no database-backed readiness or financial schema yet. Configure credentials through server-side secrets; never print or commit database URLs.

```powershell
cd apps/web
npm ci
npm run dev
```

The site runs at `http://localhost:3000/bn`; `/en` is the English version. The `predev`/`prebuild` scripts copy the canonical CSS tokens from `docs/design/tokens.css` into the web build. Run `python docs/design/verify_tokens.py` after changing palette values.

```powershell
cd backend
go test ./...
go run ./cmd/api
```

The API currently exposes only `/healthz` and a truthful `/readyz` response. Do not treat the public site, sample workspace preview or health route as completed product features.

## Deployment boundary

Vercel hosts the web app. The Go API and long-lived River workers will use persistent container hosting when their database-backed behavior is implemented. This keeps commerce rules in one Go backend and avoids duplicating them in Next.js server functions. Never commit the Neon URL or provider keys; configure them on the API/worker host when available.
