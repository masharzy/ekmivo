# Google sign-in and security email — 19 October 2026

## Implemented
- Existing self-hosted auth/session/admin trusted-device and MFA rules retained. Google OpenID Connect authorization-code flow uses PKCE S256, random state/nonce, encrypted HttpOnly Secure host-only 10-minute state cookie, canonical callback origin, RS256 JWKS issuer/audience/expiry/nonce verification. No Google access or refresh token is persisted.
- Stable Google subject maps to one local user. Email alone never merges accounts, including administrator/unverified accounts. Existing account owners sign in normally, verify email and explicitly connect the same-email Google account in Account settings within 10 minutes of fresh login. Disabled users cannot sign in. New Gmail/Workspace identities create an ordinary owner workspace; no administrator or paid subscription. Third-party Google email without authoritative hd follows email signup/verification before explicit linking.
- Google controls are hidden until the four deployment settings exist. EN/BN cancellation, missing configuration, email collision/mismatch and expired-session guidance; existing page design remains intact.
- Account email verification now works even when global mandatory verification is off. It no longer reports verification success for an unverified user just because enforcement is off; a usable Enter code link opens the verification screen.
- Resend security codes have bilingual HTML/plain text, stable challenge idempotency keys, bounded delivery timeout and serialized database issuance/cooldown. Code hashes, expiry, attempt cap and one-time consumption remain enforced. Provider failure never reports sent. No credential in source/evidence.

## Checks
- `node --test tools/testing/google-auth.test.mjs tools/testing/google-account.test.mjs tools/testing/security-email-service.test.mjs`: 16/16 pass. Real locally signed RSA/JWKS tokens exercise issuer/audience/nonce/signature/expiry rejection; authenticated account binding and mail failure/throttling/hashed code tests execute application functions with isolated test dependencies.
- Next production build and targeted ESLint pass. React review: server-only credentials, minimal serialized boolean/message props, no new client API fetch, labeled native forms, pending Google sign-in button, scoped public auth styles.
- Migration 0106 applied to existing isolated Neon branch br-still-fog-b38to82q. Rolled-back synthetic fixtures assert unique subject/user and no Go financial runtime identity access. No production synthetic users or workspace writes.
- Production password-recovery test via the actual browser Server Action RPC returned HTTP 200 with status sent for the established owner address; its newly created OTP remains unconsumed. The application awaited Resend HTTP success before returning sent: real provider acceptance, NOT inbox delivery. The earlier plain multipart form test (including invalid-email early rejection) timed out independently of mail; RPC invalid-email control also returned 200 correctly. Direct local Resend API requests returned non-JSON 403, so those are not provider credential/domain evidence.

## Deployment setup
Vercel production already contains RESEND_API_KEY, EMAIL_FROM (`Ekmivo <noreply@ieltspracticelab.com>`) and independent OTP_PEPPER. Google canonical origin and independent state encryption key were added. Preserve these secrets.

User must create/configure Google Cloud OAuth Web application and add:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
Authorized redirect: https://ekmivo-web.vercel.app/api/auth/google/callback
Authorized application origin: https://ekmivo-web.vercel.app
Scopes: openid email profile. No Gmail/Drive permissions needed. Configure consent-screen audience and test users/publication as appropriate. There is no connected Google Cloud administration capability in this session; no claim of creating a Google OAuth client.

After the production Server Action acceptance test, mandatory email verification was enabled with an owner-attributed platform_admin_audit entry. Unverified accounts now enter the email-code flow; existing verification timestamps were not fabricated. Inbox delivery/code consumption remains a manual owner check.

These changes concern auth security email. Payment receipt/invoice SMTP workers are a distinct existing configuration, not claimed configured or tested here.

## Sources
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://resend.com/docs/api-reference/emails/send-email

## Release
Primary implementation: 5da998891dad76aa4fb162c86d4ab14ac922a471. Production Vercel deployment dpl_EPxP77mRT8LA6pJT821po8yivAE3 READY with ekmivo-web.vercel.app alias. Production migration 0106 checksum eaa86e11a4508c4d1f6de4da4148fa38b989f8637da4eecad0d09c5d48ce6c43; finance runtime SELECT denied, no Google identities fabricated. Follow-up makes verification instructions truthful before a code is requested and logs only safe provider acceptance/rejection metadata.

Verification page now offers an actual sign-out/switch-account action, rather than sending an unverified user back into the verification redirect loop. Primary follow-up 545c3c05b50f87203180d9978f908b25ea0c714e deployed READY (dpl_2KAnJ9tCXpGBoWanqjconLuWVyij); 16 tests/build/lint passed before rollout.
