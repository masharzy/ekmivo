# Recovered from the production VPS, 2026-11-13

The API image running in production (`briofold-api:late-sms-a75880f5`, built 2026-11-10 on top of `15eac981`) and
several database functions were changed directly on the VPS and never pushed. These files preserve them so the
repository can be brought level before the next deploy.

- `control-functions.sql`: definitions taken from a schema-only dump of the control database. The first eight exist
  only on the VPS; `briofold_ai_order_tool`, `briofold_ai_tool` and `briofold_ai_claim_resolve` are the production
  versions of functions the repository also defines.
- `api-tool-prompt-strings.txt`: the AI sales instructions and tool list as string literals from the running binary.

Known problems in the recovered code (do not copy as-is):
- `briofold_ai_financial_receipt_lookup` uses `dblink ... user=briofold_admin` and returns NULL on ANY error, so a
  broken lookup looks like "no SMS found". The supported read path is `pg236_ai_receipt` via the finance reader.
- The prompt orders "Ask for name, phone and address before ask_payment_choice" and forbids ever saying a payment is
  confirmed; both are behind the owner's complaints about the payment conversation.
