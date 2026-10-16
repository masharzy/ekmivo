# Ekmivo signed-in dashboard reference pass 2 — code audit

Date: 2026-10-16
Branch: `codex/dashboard-reference-pass2`
Sources: approved Overview and provided Pay shell/pages, Payment links/API keys/Customers HTML references.
Scope: presentation-focused. API contracts, permission decisions, server actions, migrations, provider matching, data writes left intact.

## Code changes (implemented; not acceptance-tested)
- Shared Pay sidebar wordmark: inline **ekmivo Pay**, reference proportions. All desktop header tool controls aligned at 34px in a 57px header.
- Generic header duplicate removed for Payments methods, SMS devices and developers/API keys.
- New `DashboardDatePicker`, `DashboardDateTimePicker`, `DashboardDateRangePicker`, `DashboardSwitch`, `DashboardCombobox` and `DashboardTagInput` reusable React UI primitives.
- Payment links: compact right-aligned BDT table amounts; status dots; filled status filter; viewport-portaled row menu ordered Open checkout, Copy, Edit, Duplicate, Archive, Delete; long-form modal constrained to viewport; reference/amount row, expiry presets and custom date/time, no-limit switch, advanced options accordion; public/private notes.
- API keys: emoji-free Sandbox/Live switch, redundant heading/docs link removed, key summary table, create modal, details drawer and Rotate/Revoke confirmation dialogs. Password confirmation, scope limits, environment gate and once-only secret server actions preserved.
- Webhook signing: compact row and modal that fetches the actual secret only through the existing authenticated endpoint, masks before reveal and clears it after closing.
- Customers: single-page title, consistent mobile formatting, local privacy-mode switch, chip tag input, input order and phone column.
- Invoices: customer combobox, aligned line items, computed line and grand totals, compact extras and custom due-date calendar, modal constrained/sticky footer.
- Reports: two-month calendar with existing presets and Apply (retained because backend report API is expensive), remove stale/status paragraphs, BDT formatting.
- SMS data: privacy switch, matching phone-format display, TrxID copy icon, quiet record count, color status dot, amount headers aligned and custom date/time filters.
- Methods and SMS devices retain existing table/list/drawer actions from the prior approved reference; method number text is full and formatted with copy icon.
- Global select, checkbox, accordion and textarea reset scoped to Pay dashboard. Dates/languages render with Intl; reduced-motion existing behavior retained.

## NOT accepted / still TODO (requires implementation or evidence)
1. **Backend security (high priority)**: owner/admin vs editor/viewer reveal eligibility, audited reveal endpoint, full-number response redaction for unauthorized users, field-level encryption + keyed hash + stored last four. UI-only masking is **not** server data protection; do not count as done.
2. **Full account number in Reports filter**: existing account DTO supplies only `display_suffix`. API must provide full receiving number to authorized users; do not manufacture it.
3. **Payment link Duplicate/Delete**: no existing verified API operations. Menu entries deliberately disabled. Need authorized backend actions, idempotency and Delete confirmation before enabling.
4. **API key last four**: current server key list exposes `public_id`, not a secure raw key suffix. Table copies public reference, **not secret**. Need explicit backend-safe metadata if a genuine suffix is required.
5. **Audit other signed-in routes** for remaining native controls, duplicate titles and emojis beyond the affected components; broader reference parity not established.
6. **Browser acceptance QA pending**: 360px/mobile, tablet/desktop, EN/BN, Light/Dark/System, OS theme change, keyboard modal focus trap, route navigation, requests/filters, export, real reports, genuine API key creation/rotation and real devices.
7. **TypeScript/Next.js build and CI pending** (owner asked to conserve CI minutes). No pass asserted. Do not merge to production without verification.
8. **Form validation and usability**: verify inline field errors (instead of native validation bubbles); test invoice and link modal focus/scroll on mobile; monitor table overlay positioning and portal menus.
9. **Sensitive-number privacy switch synchronization**: per-workspace local browser preference only, not a globally audited reveal session. Screen-sharing masking is visual only.
10. **Data/status meaning**: no invented statuses; existing backend meanings must be checked before changing labels. Some operational filters still expose internal terms.

## Verification truthfulness
- GitHub changes were committed on isolated branch; diff/audit review performed.
- No real Android devices, wallet providers, webhooks, production accounts, manual screenshots, mobile browsers or production deployment were tested in this work.
- Never label an untested flow 'passed'.
