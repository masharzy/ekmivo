# Briofold web — Next.js RSC, Neon and self-hosted auth

Next.js + TypeScript application. Public bilingual marketing website and server-rendered private application shell.

## Implemented in source

- RSC protected merchant dashboard and workspace switcher; URL-scoped membership authorization on every request.
- Server Action login/register, scrypt password hashing, opaque revocable HttpOnly session cookies and database-backed login attempt limits.
- Workspace onboarding with AI Communication, Commerce & Payments and Both modes. These are configuration preferences, not active paid entitlements.
- PipraPay-inspired commerce module navigation and Briofold AI module navigation; no fake business records.
- Restricted platform admin shell; no first administrator is seeded automatically.
- Server error boundary and field-level validation and toast UX.
- Ink & Bone Light/Dark/System, Bengali and English.

## Setup before real account use

See [Neon auth runbook](../../../docs/runbooks/NEON-AUTH-SETUP.md) for DATABASE_URL, SQL migration, platform administrator provisioning and security gaps. No database credential or email provider is connected in the repository. Do not mistake shells or source-only access for tested authentication or a working payment backend.

Install with npm ci from apps/web; npm run build and npm run dev sync canonical design tokens.

Private reads are Server Components, mutations are Server Actions. Browser network tooling can still see HTTP and RSC payloads, but sensitive SQL and database credentials stay server-side.
