# Ekmivo Admin — Locked Design System

**Status: approved / locked** · Source of truth: `docs/design/ekmivo-admin-reference.html`. This is **not** the public homepage, merchant dashboard, checkout, or Developers portal theme.

## Ownership / CSS load order
- `apps/web/src/styles/admin/admin-tokens.css`: exact reference light/dark palette; aliases only for *existing admin components*.
- `apps/web/src/styles/admin/admin-theme.css`: Inter font, Admin-only focus/reset and typography.
- `apps/web/src/styles/admin/admin-components.css`: Admin UI adapter for existing `.pa-*` and `.mp-admin` components.
- `apps/web/src/styles/admin/admin-reference.css`: unchanged standalone HTML styles. **Never import this unscoped CSS into the production web app.**
- These three production stylesheets are imported at the **end** of `apps/web/src/app/globals.css`. Their selectors only target `.pa-root.pa-admin-design` (or Admin MFA screen).
- The full original approved working HTML is checked in as `docs/design/ekmivo-admin-reference.html` and is the comparison target.

## Exact source tokens — Light / Dark
| Token | Light | Dark |
|---|---|---|
| `--bg` | `#fafafa` | `#0a0a0a` |
| `--sf` | `#fff` | `#111` |
| `--s2` | `#f5f5f5` | `#171717` |
| `--s3` | `#ebebeb` | `#242424` |
| `--bd` | `#e6e6e6` | `#222` |
| `--tx` | `#0a0a0a` | `#ededed` |
| `--t2` | `#404040` | `#b8b8b8` |
| `--mu` | `#8a8a8a` | `#7d7d7d` |
| `--ac` | `#2f5bea` | `#7b9bff` |
| `--ok` | `#12a150` | `#3ecf7a` |
| `--wa` | `#d98a00` | `#f2b134` |
| `--ba` | `#e5372b` | `#ff6b5e` |
| `--ink` | `#0a0a0a` | `#ededed` |
| `--onink` | `#fff` | `#0a0a0a` |
| `--sh` | `0 16px 48px rgba(0,0,0,.14)` | `0 16px 48px rgba(0,0,0,.6)` |

## Exact dimensions and typography
- Font: `Inter, system-ui, -apple-system, "Segoe UI", "Noto Sans Bengali", sans-serif`; Google Fonts weights 400, 450, 500, 600, `font-feature-settings:"cv11","ss01"`. Do not use Geist or Hind Siliguri in the Admin Panel.
- Body: `13px/1.45`; page title `18px / 600`; cards/panels `10px` radius; controls `28px` high and `6px` radius.
- Sidebar `212px`, vertical padding `16px 10px 20px`; nav rows `28px`, active `--s3`, no decorative gradient.
- Header `48px` high, horizontal padding `28px`; content maximum `1180px`, padding `28px 28px 48px`.
- Tables: header padding `9px 16px`, row height `44px`, body text `13px`, borders `--bd`; no browser-native visual chrome.
- Standard modal `max-width:480px`, `12px` radius; body `6px 20px 16px`, footer `0 20px 18px`.
- Right drawer source width: `min(460px,100%)`; responsive collapse at 900px/820px reference breakpoints.
- Reference metric strip: 4 columns, panels `16px 18px`, numbers `24px / 550`.
- Source input backgrounds `--sf` and focus 3px ring using `color-mix(in srgb,var(--ink) 10%,transparent)`.
- Reference uses no emoji and no oversized cards/marketing fonts.

## Light / dark separation
- Admin preference is `ekmivo-admin-theme`, **not** `ekmivo-theme`.
- `data-admin-theme="light|dark|system"` lives on the Admin component root. `system` tracks `prefers-color-scheme`.
- The existing marketing `html[data-theme]` and public cookie must not control the Admin palette. Conversely, changing the Admin theme must not change marketing theme.
- No `html`, `:root` or `body` token definitions in production Admin-only files. Theme selectors must be Admin-scoped.

## Building a new Admin page
1. Read `docs/design/ekmivo-admin-reference.html` (HTML/CSS/JS) before editing.
2. Read all 3 Admin stylesheets. Use existing `.pa-*` classes/components before making new ones.
3. Preserve Next.js server-rendered routes, Go financial authority, RBAC/MFA, subscriptions and real data. Demo values **must never** replace actual API/database responses.
4. Compare new page and dialogs against original HTML in light and dark at desktop and mobile widths; do not claim pixel parity without screenshots.
5. Check that public homepage and merchant dashboard are untouched. Never import `admin-reference.css` globally.
6. Run `python apps/web/scripts/verify-admin-design.py`, then typecheck/build and review responsive appearance.

## Known functional / visual gap
The original HTML is an interactive **demo** with in-memory records and proposed business features. The production React pages have different data sources/routes. The CSS adapter maps approved **visual rules**, not demo behavior or unsupported backend actions. Some components still need component-level visual comparison and adjustments as their production markup differs from the reference. No backend or schema is invented by this design extraction.

## Strict prohibitions
No arbitrary Tailwind/shadcn/Geist defaults, no generic gradients, no new tokens outside this source, no changing Inter, no overriding only dark mode with public styles, no hardcoded demo metrics in production, and no copy/paste of unscoped `:root` or `body` reference rules into global CSS.
