# Ekmivo — actual dashboard UI source
Exported from `masharzy/ekmivo` **main @ 82abbb0b46ec2d95fc3d0b47b2967a6714ac7f70** on 2026-10-16.

This export preserves original repository paths under `apps/web/` for easy replacement/merging.
It contains the actual Next.js TSX dashboard screens and components, CSS, public payment UI icons, UI helpers and config. It is **not** the previous HTML mockup.

### Hand this to Claude
Redesign ONLY UI in `apps/web/src/components/`, `apps/web/src/app/` route TSX and UI CSS. Preserve existing imports, routes, exported component names/props, component types, business logic, roles, client fetch calls, and server-action signatures. Return edited files with **the same paths**. The original repository contains backend/API code these UI components refer to.

### What is excluded
Backend Go, Next.js API routes, server implementation, database, secrets, credentials, generated artifacts, marketing/landing routes and font binaries. No backend files are necessary for a visual UI redesign. Because this is a selected source subset, running it as a standalone Next.js project is not supported; apply edited files back to the full Ekmivo repository and run its typecheck/build.

### Key paths
- `apps/web/src/components/dashboard-frame.tsx` — sidebar, header, switcher, routing UI
- `apps/web/src/components/dashboard-content.tsx` — workspace page selection
- `apps/web/src/components/payment-overview-mission.tsx` — Overview
- `apps/web/src/components/payment-transaction-workspace.tsx` — Transactions
- `apps/web/src/components/payment-documents.tsx` — Customers, Invoices, Links
- `apps/web/src/components/payment-reports.tsx` — Reports
- `apps/web/src/components/payment-refunds.tsx` — Refunds
- `apps/web/src/components/payment-method-management.tsx` — Payment Methods
- `apps/web/src/components/sms-devices.tsx` — SMS Devices
- `apps/web/src/components/payment-requests.tsx` — One-time requests
- `apps/web/src/components/workspaces-v2.tsx` — Workspaces
- `apps/web/src/app/dashboard-v2.css`, `dashboard-shell-v3.css`, `dashboard.css` — dashboard styles

Export contains 112 original UI/project files, with one extra README.
