---
name: briofold-dashboard
description: Refine Briofold merchant dashboard screens with its warm, compact visual system and existing real payment workflows.
---

Use docs/DESIGN-SYSTEM.md and docs/design/tokens.css as the visual authority. The 2026-10-15 owner request supersedes the old expanded payment sidebar.

- Build original cream/navy light surfaces and charcoal dark surfaces with restrained blue, peach, sage and ochre information accents. Reference Paymently only for hierarchy and interaction quality; do not copy its layout, palette, assets or text.
- Put functional breadcrumb above one page heading. Keep one main action. Use a compact table toolbar with search, an expandable filter panel and column visibility. Amounts align right, identifiers have explicit detail links, statuses use text with soft semantic backgrounds.
- Always show operational Overview metrics independently of setup completion. Missing sources show a dash and retry; only real empty data shows zero. Setup is a compact optional detail. No decorative invented sparkline or misleading lifetime counts from a paginated response.
- Payment sidebar: Overview, Payments, Customers, Invoices, Payment Links, Reports, Refunds; Payment Methods, SMS Devices, SMS Data; API Keys, external API Docs. Keep legacy routes and records accessible. Payment Links contains reusable links and one-time requests.
- Workspace selector settings opens Billing & usage, Team & access, Workspace settings, in that order. Header question mark opens Help. Apps & Plugins belongs in developer documentation.
- Mirror every explicit error/success in a dismissible toast, keeping persistent financial outcomes and field errors inline. Never show keys or signing secrets in toast content.
- Preserve draft guards, server roles, workspace/environment boundaries, EN/BN, Hind Siliguri, Light/Dark/System and responsive keyboard interactions. Do not let a design change alter payment truth or approval rules.
