# Channel platform setup

Meta OAuth/webhook existed without a protected platform configuration editor or missing-configuration state. Telegram had no adapter.

Adds Super Admin/MFA-protected encrypted CONTROL configuration, masked secret reads, audited changes, environment compatibility and backend readiness. Configuration drives Meta OAuth, signatures, sender, comments and media consistently. Merchant connections show missing setup and OAuth returns canonically. Saving configuration never grants Meta approval or activates AI/billing.

Telegram verifies identity via getMe, reserves existing business ownership before setWebhook, encrypts credentials, authenticates each bot webhook and deduplicates durable update IDs transactionally. Disabled connections cannot ingest. Supported private text messages use the existing Inbox/grounded-AI pipeline. Groups, media and broadcasts remain unavailable; ambiguous sends remain uncertain rather than auto-retrying.

CONTROL-only migration 0212 is new/unapplied. No financial IDs/history or existing table renames. Provider credentials, app creation, approval and live tests remain prerequisites listed in MANUAL-VERIFICATION.md.

Local unit/build checks use no Docker/database. SQL/Go webhook acceptance is wired into existing isolated CI. Exact checks and outcome belong in the PR; do not infer CI/live acceptance from source.
