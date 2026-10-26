# Multilingual business reply evaluation — prepared, live run blocked

Owner scope: audio excluded; two realistic businesses with synthetic data only:
1. Shapla Diagnostic Center: test prices/preparation/report schedules/address/home collection; no patient records.
2. Neer Bags: price/stock/shipping, corrections, complaints; no customer records.

84 fixed cases: 42 per business, each with 12 Bengali, 12 romanized Bengali,
12 English, 6 additional adversarial/mixed-language/context cases.
`backend/internal/checkout/studio_text_evaluation.go` contains the exact cases/data.

The harness uses the production `studioMessages`, metered AI engine and
`studioSafeReply`. It records raw/final synthetic replies, language classification,
usage, cost and elapsed time in private operator logs. It does not insert inbox
messages, send customer messages or read customer conversations. Stable run keys
prevent duplicate charges on restart. Activation requires explicit scoped JSON
and an expiry no more than one hour ahead. Default disabled.

## Actual results

- Targeted checkout/aicredits Go tests: PASS.
- checkout go vet: PASS.
- Live inference: NOT RUN. No model reply or score is claimed.
- Render service srv-db5j532d0e5s73fli4h0 reports `suspended: suspended`,
  `suspenders: [billing]`. Environment/deploy attempts fail HTTP400:
  `cannot deploy suspended service`.
- Attempted temporary evaluation configuration was cleared, but Render rejected
  that operation too. Expiry is mandatory in source; the attempted config had no
  expiry and therefore cannot execute when deployed later.
- No billing purchase or service-plan change attempted.

## Scoring plan (pending real outputs)

Per case 0–10: grounded accuracy 3, correct reply language 2, context/intent 2,
natural concise tone 2, honest capability boundary 1. Separately mark critical
false payment/order/booking claims, invented prices/contacts, unsafe diagnostic
advice or identity deception. Report each language/business mean and examples;
critical failures prevent an unconditional keep recommendation regardless of mean.

Inspect preliminary classifier risks: common romanized Bengali such as
`assalamu alaikum vai`, `na na nil ta bolsi`, `bujhlam na`, `accha thikase`,
`amr order koi?` lack currently listed Banglish markers and may receive `en`.
This is a source finding, not an observed live-model failure or a score.

The same fixed fixtures can later compare Gemini Flash candidates after the owner
provides/configures the models. Do not silently change fixtures or prompts between
models; use a fresh run ID for each evaluated version.
