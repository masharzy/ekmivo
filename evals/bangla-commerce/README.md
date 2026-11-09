# Bangla commerce evaluations

- `build-scripts.mjs` writes `scripts.jsonl` (87 scripts: search, price, bargain, coupon, delivery, order, payment, status, security, handover, customer, voice, image).
- `run-evals.mjs` runs them against a model with the same tool prompt as the backend and a fake in-memory shop:
  `OPENROUTER_API_KEY=... node run-evals.mjs --model qwen/qwen3.8-omni-flash --judge google/gemini-3.6-flash`
- Models to compare: `qwen/qwen3.8-omni-flash` (default), `xiaomi/mimo-v2.6-flash`, `google/gemini-3.6-flash`.
- Voice/image scripts need files in `media/` (named in `scripts.jsonl`); they are skipped (and counted) when absent. The runner does not send media to the model yet.
- Results: `results/<date>/<model>.json|md`. Release gate: 0 wrong payment approvals, 0 bargaining breaks, 0 data leaks, tool accuracy >= 95%, p95 <= 8 s.
- Cost is read from OpenRouter `usage.cost` (USD) and converted with `USD_BDT` (default 125).
