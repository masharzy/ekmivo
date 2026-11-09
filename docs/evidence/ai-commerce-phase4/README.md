# Phase 4 evidence (code level)
Migration `0234_briofold_ai_selling.sql`; Go `ai_payment_verify.go` (+test), TrxID digest rewrite in `ai_tools.go`.
Verified on Neon test branch (rolled-back scenario): negotiation floor (offer 500 BDT became 950 BDT floor), draft total = subtotal + 70 BDT Dhaka delivery, stock reserved 2, mobile payment choice returns receiving number,
claim accepted then duplicate TrxID refused, resolve (Both mode) -> payment_state verified / status confirmed, draft expiry -> cancelled and reserved back to 0.
NOT verified: Go build (CI), cross-DB receipt lookup against a real financial realm, AI-only 'review' path, wrong-TrxID x5 handover, coupon paths, second migration run/rollback.
NOT built: Settings page, sidebar badge, email/push notifications, review queue UI, payment links, stock-moves rows. Rollback: see runbook.
