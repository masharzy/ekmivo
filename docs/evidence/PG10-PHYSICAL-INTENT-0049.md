# PG10 payment-intent physical phone compatibility — 0049

**Production error:** `RECEIVING_SOURCE_UNAVAILABLE` from `pg10_intent()` with SQLSTATE `23514` and message `live source unavailable`. Previous 0048 fixed checkout view and route but not intent creation. A single paired `pg06_phones` handset with valid signed heartbeat had no `pg06_devices` rows.

**Fix:** additive realm-scoped `0049_pg10_physical_phone_intent.sql` extends the existing authorization condition to consider unrevoked permission-enabled physical phones with heartbeat less than 20 minutes old (periodic Android sync ~15 minutes). It still requires an enabled configured receiving account in the same workspace/environment and preserves old source route and request idempotency.

**Safety:** This does not mark a payment paid or bypass live-parser validation in `liveMethods()`. Real payment must not be sent until an approved production parser extracts the actual receiving account from receipt evidence and full five-field verification is tested.

**Evidence required:** apply in both isolated financial databases after 0048; compare function definitions and explicit owner/realm preflight; production Go code already maps SQL failure. Retest merchant creation and public checkout with a newly created intent. Real receipt/provider, SMS format and worker integration remain pending.
