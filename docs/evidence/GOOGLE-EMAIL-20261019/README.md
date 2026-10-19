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
- Production live password-recovery test for the established owner address was initiated once. HTTP response timed out; this is NOT provider acceptance or inbox delivery evidence. Local direct Resend test did not obtain a parseable provider response. Do not claim email delivery from configuration presence or an outstanding OTP row.

## Deployment setup
Vercel production already contains RESEND_API_KEY, EMAIL_FROM (`Ekmivo <noreply@ieltspracticelab.com>`) and independent OTP_PEPPER. Google canonical origin and independent state encryption key were added. Preserve these secrets.

User must create/configure Google Cloud OAuth Web application and add:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
Authorized redirect: https://ekmivo-web.vercel.app/api/auth/google/callback
Authorized application origin: https://ekmivo-web.vercel.app
Scopes: openid email profile. No Gmail/Drive permissions needed. Configure consent-screen audience and test users/publication as appropriate. There is no connected Google Cloud administration capability in this session; no claim of creating a Google OAuth client.

Global mandatory email verification remains off pending a verified real delivery test, so existing users are not locked out by an unverified sending setup. Account self-verification and password recovery work independently of this policy.

These changes concern auth security email. Payment receipt/invoice SMTP workers are a distinct existing configuration, not claimed configured or tested here.

## Sources
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://resend.com/docs/api-reference/emails/send-email
