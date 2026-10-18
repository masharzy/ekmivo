<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## LOCKED: Ekmivo Admin Design System
For **all** routes under `/[locale]/admin` (including Admin plans, login/MFA and Admin-only drawers/modals):
- FIRST read `docs/design/ekmivo-admin-reference.html` and `docs/design/ADMIN-DESIGN-SYSTEM.md`.
- Use `src/styles/admin/admin-tokens.css`, `admin-theme.css`, `admin-components.css` and `ADMIN-AGENT-RULES.md`; approved Inter 13px/1.45 and the exact reference palette/spacing are not optional.
- The approved Admin design is **independent** of the public website and Merchant Dashboard. Never borrow public `globals.css` dark-mode defaults, Geist fonts or marketing components into Admin.
- Do not implement new Admin visual styles independently of the HTML reference. Existing live APIs, RSC pages, permissions and MFA must survive UI changes.
- Run `python scripts/verify-admin-design.py` from `apps/web`, along with normal build/tests, and visually compare light/dark/mobile against the reference.

## LOCKED SIDEBAR
The approved Admin HTML has exactly **11 primary options** in this order: Overview, Workspaces, Subscriptions, Billing & Revenue, Plans & Pricing, Payment Providers, AI Credits, Support, System Health, Audit Logs, Settings. Do not add Users, Payments, Devices, API, AI Bot, Staff or other extra sidebar links. Put necessary secondary features inside the approved pages as tabs/drawers. Add a sidebar option only after the owner changes the source HTML and explicitly approves it.
