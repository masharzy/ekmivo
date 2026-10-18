# Admin-only design instructions for coding agents

**Mandatory reference:** `docs/design/ekmivo-admin-reference.html`. Approved 100%; do not redesign.

- First inspect reference selectors AND the real Admin JSX; style must match the reference. Do not invent spacing, typography, theme or navigation patterns.
- The authenticated Admin Panel uses **Inter 13px/1.45**; sidebar 212px; header 48px; content max 1180px; 28px controls. The reference CSS is authoritative.
- Design source: `apps/web/src/styles/admin/admin-tokens.css`, `admin-theme.css`, `admin-components.css`.
- No public `--color-*`/landing dark-mode palettes may override Admin colors; compatibility aliases inside the Admin root are okay but must resolve to Admin tokens.
- Set Admin root `.pa-root.pa-admin-design`; theme attribute `data-admin-theme`; cookie `ekmivo-admin-theme`.
- Public, merchant, developer, and checkout UI must not be restyled.
- Do not replace production Admin route logic/DB calls/role checks with the reference HTML's hardcoded mock state. Preserve MFA, RBAC, audit, server components and real empty/error states.
- Compare final desktop/mobile and light/dark screenshots against reference; visual regressions are blockers. Record tests run; never claim visual verification if no screenshots or authenticated preview.
- If no reusable Admin component covers the need, extract exact spacing/color from reference before adding to the Admin stylesheet and document it.
- Run `python apps/web/scripts/verify-admin-design.py` after editing approved tokens; any intentional change requires owner approval and update to reference.

## LOCKED SIDEBAR
The approved Admin HTML has exactly **11 primary options** in this order: Overview, Workspaces, Subscriptions, Billing & Revenue, Plans & Pricing, Payment Providers, AI Credits, Support, System Health, Audit Logs, Settings. Do not add Users, Payments, Devices, API, AI Bot, Staff or other extra sidebar links. Put necessary secondary features inside the approved pages as tabs/drawers. Add a sidebar option only after the owner changes the source HTML and explicitly approves it.
