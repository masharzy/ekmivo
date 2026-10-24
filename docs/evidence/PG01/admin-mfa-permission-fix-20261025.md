# Administrator MFA permission repair — 2026-10-25 (Asia/Dhaka)

Production `/admin/verify` returned `Verification failed. Try again.`. Vercel
logged `[mfa confirm] k`. Running the deployed administrator identity query
as `ekmivo_web_app` reproduced `permission denied for table platform_administrators`.

Migration 0156 allowed SELECT/INSERT/DELETE on this table, but no UPDATE.
Both MFA confirmation and MFA security lifecycle actions use `FOR UPDATE OF`
on the administrator row. PostgreSQL requires UPDATE on at least one column
for that lock, even though the statement changes no values.

0214 grants UPDATE only on `user_id`, preserving the missing UPDATE permission
on `role`. The existing INSERT/DELETE grants remain unchanged. No enrollment,
secret, recovery code, attempt count or session verification state was changed.

## Verification

- Tested the column grant and exact confirmation lock query transactionally on
  isolated Neon branch `br-gentle-sea-b36d5af0`; actor found, role UPDATE false.
- Rolled back the test grant; verified it was absent afterward.
- Applied the guarded 0214 statements transactionally to production control DB
  `ekmivo`, project `sparkling-mountain-38618629`, branch `br-solitary-river-b3ztvg8j`.
- Re-ran confirmation and recovery administrator lock queries on production as
  `ekmivo_web_app`: both found the administrator without permission errors.
- MFA attempts and enrollment row locks succeeded with the same runtime role.
- Verified enrollment remains confirmed, attempts remain zero, blocked_until
  remains null, and UPDATE on `platform_administrators.role` remains false.
- No application deployment is required for this database permission repair.

## Manual pending

The owner must submit a fresh code from their existing authenticator on
`/admin/verify` and confirm that the admin screen opens. No code was generated
or replayed on the owner's behalf; full authenticated browser verification is
not claimed.

## Rollback

If explicitly required, the inverse grant is:
`REVOKE UPDATE (user_id) ON TABLE public.platform_administrators FROM ekmivo_web_app;`
This restores the original permission error and should not be run routinely.
