# Code review: AI commerce Phase 2–6 + production readiness (PR #165)

Reviewer: Claude Opus 5.5 · Date: 2026-11-09 · Branch: `agents/ai-commerce-phase5` (commit 1cc4f21)
Method: code reading only, against `docs/plans/ai-commerce-core.md` and the existing migrations/Go code. Nothing was run for this review.

## Verdict (age eta poro)

**Goal achieve hoy na.** Code dekhe nishchit je production e AI tool loop ekta reply-o customer ke pathate parbe na, ar payment verification ekta claim-o verify korte parbe na. Neon test branch er scenario gulo pass korechilo karon segulo DB owner hishebe SQL function directly call korechilo. Real API `ekmivo_financial_runtime` role e chole, ar ei path ta test e kokhono chalano hoyni.

Blocker 4 ta (B1–B4). Egulo fix na kore Gemini diye Phase 3/4 test korle shob fail korbe, ar sei result theke kichu shekha jabe na. B1–B4 fix korar por test koro.

| Severity | Count |
|---|---|
| Blocker (feature kaj e kore na) | 4 |
| High (security / money / data) | 8 |
| Medium | 10 |
| Low | 7 |

---

## Blockers

### B1. Notun SQL function gulo runtime role ke GRANT kora hoyni, tai shob call `permission denied`
- API control DB te `ekmivo_financial_runtime` hishebe connect kore. `backend/internal/authz/authz.go:91` eta enforce kore.
- `0233`/`0234` e `briofold_ai_tool`, `briofold_ai_order_tool`, `briofold_ai_claims_due`, `briofold_ai_claim_resolve`, `briofold_ai_expire_drafts`, `briofold_ai_review_queue`, `briofold_ai_selling_read/write` er upor shudhu `REVOKE ALL ... FROM PUBLIC, ekmivo_financial_runtime, ...` ache. Kono `GRANT EXECUTE` nei.
  - Pattern ta dekho: `0135:116` ar `0202:123` e claim/finish/valid explicitly grant kora ache. Phase 1 e thik ei bug er jonno `0231` lagechilo.
- `ai_tools.go:74` `aiWithinLimits` `ai_tool_calls` ar `briofold_ai_channel_jobs` theke **direct SELECT** kore. Duto table-ei runtime role er theke revoke kora. Query fail kore, function `false` return kore ("fail closed"), tai **loop ta kokhono shuru-i hoy na**. Flag on korlei proti job `AI_RUNTIME_UNAVAILABLE` review e chole jay.
- Payment worker (`briofold_ai_claims_due`) ar expiry o fail kore. Error ignore hoy (`Scan` er result check kora hoy na), tai log e kichu ashe na.
- **Fix:** notun migration `0236` e protita function er jonno `GRANT EXECUTE ... TO ekmivo_financial_runtime, ekmivo_financial_projection` dao. Rate limit ta SECURITY DEFINER function (`briofold_ai_rate_ok(w, thread)`) e niye jao, direct table read baad dao.

### B2. Tool loop er reply `briofold_ai_channel_finish` reject kore: metered key mile na
- `briofold_ai_channel_finish` (`0135`, ~line 105) e ei shorto ache: `briofold_ai_executions` e **job er nijer `request_key`** diye ekta `completed` row thakte hobe. Na thakle `RAISE 'Metered completed generation required'`.
- Tool loop proti step e `aiStepKey(req.Key, step)` use kore (`ai_tools.go:261`), job key kokhono use kore na. Tai finish **shob shomoy** raise kore.
- `studio_execution.go` e finish er error `_ =` diye ignore hoy. Job `running` theke jay, lease expire hoy, tarpor `WORKER_OUTCOME_UNKNOWN` review. **Customer kono reply pay na.**
- B1 fix korleo B2 er jonno ekta reply-o jabe na.
- **Fix (2 ta upay):**
  - (a) Last step (je step final reply dey) job key diye chalao. Kintu age step gulo fixed, tai kon step last seta age jana jay na.
  - (b) Notun finish variant `briofold_ai_channel_finish_tools(job, lease, body, step_keys text[])`, jeta step key gulor je kono ekta completed execution accept kore. (b) ta clean.

### B3. Model jane na tool gulor argument er naam ki
- `aiToolPrompt` (`ai_tools.go:239`) e shudhu tool er naam ache. SQL je argument expect kore tar kono schema nei: `query`, `product_ref`, `variant_ref`, `offer_minor`, `items[{variant_ref,quantity}]`, `area`, `recipient`, `coupon_code`, `code`, `choice: mobile|cod`, `transaction_id` + `method`, `reference`, `name`.
- `search_products` variant er id `id` key e return kore. Kintu prompt e `id` pathano nished, ar parser `id` key reject kore. Model ke `id` theke `variant_ref` e bodlate hobe, eta kothao bola nei.
- Phase 4 er purota (`upsert_order_draft`, `quote_price`, `submit_payment_proof`) model er guess er upor nirbhor kore. Bhul arg dile `22023` raise hoy, tarpor B4 er handover.
- **Fix:** OpenRouter native `tools` parameter e JSON schema pathao (plan e "function-calling" ei kotha-i bola chhilo), othoba prompt e protita tool er arg schema likho. Search result e `id` er bodole `variant_ref` return koro.

### B4. Je kono tool error hole thread chupchap human ke handover hoye jay
- `upsert_order_draft` stock kom hole `RAISE 'Out of stock'` (`0234:81`) kore, ar invalid item/quantity e `22023`. Exception `briofold_ai_tool` theke Go te ashe, `qerr != nil` hoy, loop `break` kore (`ai_tools.go:286`).
- Tarpor fallback `handover_to_human` step 6 e chole: `ai_enabled=false`, `ai_version+1`.
- Sheshe body "Ekjon manush apnar sathe shighroi jogajog korben." (`:296`) finish e jay. Kintu finish validity check e `ai_version` mile na, tai `CONVERSATION_OR_SOURCE_CHANGED` review hoy ar **message ta-o jay na**.
- Fol: customer "2ta dien" bollo, stock e 1ta, AI chirodiner jonno off hoye gelo, customer kichui shunlo na. Parse error ba invalid JSON output holeo eki ghotona.
- Model nije `handover_to_human` call korleo eki: tarpor loop ar ekta metered call kore, ar reply drop hoy.
- **Fix:**
  - Business error (stock, invalid item, unknown variant) `RAISE` na kore `{"error":"out_of_stock","available":n}` return koro, jate model customer ke bolte pare.
  - Handover er age customer er message ta finish koro, tarpor thread disable koro. Mane handover finish er pore, ekta alada call e.

---

## High (security / money / data)

### H1. Seed script production database e lekhar shujog dey
- `assertSafeTarget` (`seed-ai-commerce-sandbox.mjs:12`) shudhu DB **name** e `prod|live` ache kina dekhe. Neon production DB er naam `ekmivo`. `SEED_ALLOW_REMOTE_SANDBOX=1` + production connection string dile guard pass kore, ar production control DB te `TEST-` workspace, order, customer lekha hoy. `environment='sandbox'` hole-o eta production DB te write.
- Plan rule: "no production DB writes without owner permission".
- **Fix:** remote hole ekta explicit marker lagbe. Upay:
  - Neon endpoint host allowlist (`SEED_ALLOWED_HOST=<test branch endpoint>`)
  - DB te ekta marker table/`current_setting` check (e.g. `SELECT 1 FROM pg_settings ...` / ekta `briofold_test_branch` row)
  - Production endpoint host hard-code refuse
- Load test script e (`ai-load-test.mjs`) eki shomossha.

### H2. TrxID chiniye neya (claim race) ar payer er shathe kono binding nei
- Verification shudhu TrxID digest, method, amount ≥ due, ar time ≥ order − 1 min check kore. Payer number ba last digit check kore na.
- Jodi kono vabe onner TrxID jana jay (screenshot share, same shop group), ar seta tar order er pore kintu attacker er order er-o pore hoy, tahole attacker age claim kore nijer order `verified` korte pare. Asol customer tokhon `already_used` pay.
- **Fix:** customer er kach theke sender number er last 3–4 digit chao, receipt er `payer_hmac`/suffix er shathe match koro. Mismatch hole `review`.

### H3. Checkout payment e already allocated receipt AI order e abar use kora jay (double-spend)
- `lookupAIReceipt` dekhe na je receipt ta `financial_payments`/`financial_allocations` e already kono payment intent e allocate kora ache kina. `commerce_payment_claims` er UNIQUE shudhu AI claim der modhye duplicate atkay.
- Ekta bKash payment diye ekta checkout link ar ekta AI order, duita-i "paid" hote pare.
- Seed er "TESTUSED001 already used" scenario kono payment er shathe link kora nei, tai eta test-o hoy na.
- **Fix:** match er age `NOT EXISTS (financial_payments WHERE observation_id = o.id)` check koro. Matched hole financial side e allocation/lock record koro, `pg61`/`pg07` er moto realm function diye.

### H4. Unlimited TrxID guess: pending claim gulo limit e count hoy na
- `wrong_trx_limit` shudhu `failed`/`review` count kore (`0234` `submit_payment_proof`). Unknown TrxID 15 minute `pending` thake, tai ek order e 15 minute e jotokhushi claim pathano jay. Proti ta ekta row ar ekta cross-DB lookup.
- **Fix:** thread/order proti `pending` count-o limit e dhoro, ar ek order e ekshathe 1 ta pending claim.

### H5. AI-only workspace e claim chirodin `pending` thake, ar je kono lookup error e-o
- AI-only workspace er financial realm projection nei, tai `s.scoped` error dey. `ai_payment_verify.go:131` e `continue` hoy, resolve kokhono call hoy na, tai 15 minute er `review` rule-o chole na. Claim owner er review queue te kokhono ashe na.
- Eki vabe realm role direct `SELECT financial_receipt_observations` korte na parle (realm e kono GRANT paini, existing design `pg61_transaction_lookup` function diye pore) **shob** workspace er claim pending e atke thake.
- **Fix:**
  - AI-only hole lookup na kore sorasori `review` (`ai_only_never_verified`).
  - Lookup error hole-o `retry` resolve call koro, jate 15 min er rule chole.
  - Receipt read ekta realm SECURITY DEFINER function diye koro.

### H6. Cancel hoye jaoa (expired) order e payment verify hoy, kintu stock already chere dewa
- `briofold_ai_expire_drafts` `payment_state='awaiting'` order ke `cancelled` kore, reservation chere dey, kintu `payment_state` `awaiting` rekhe dey (`0234:220`).
- `submit_payment_proof` status na dekhe `payment_state IN('awaiting','claimed')` order khoje (`:120`). Fol: customer deri te pay korle cancelled order e claim hoy, tarpor `verified`. Order `cancelled` kintu paid, stock reserved na. Owner bujhbe na je product pathate hobe.
- **Fix:**
  - Expire korle `payment_state='none'`.
  - Proof shudhu `status IN('draft','hold')` order e.
  - Cancelled order e match hole `review` (`paid_after_expiry`).

### H7. Receiving number plaintext e control DB te
- `commerce_ai_settings.receiving_numbers` jsonb plaintext. Existing system receiving number encrypt kore financial realm e rakhe (`pg06_account_configuration.number_cipher`, AES-GCM). Ar `briofold_ai_selling_read` eta pura return kore.
- Phone number ar privacy rule er bairer. Shothik field hole number `financial_receiving_accounts` theke ashbe (je account e SMS ashe), ar AI shudhu account ref + display suffix pabe.
- Ekhon je kono receiving number type kora jay, ja SMS account er shathe link na. Fol: customer bhul number e pathay, ar kokhono verify hoy na.

### H8. Stock reservation ledger bypass kore
- Existing design e `commerce_stock.reserved` change er shathe `commerce_stock_moves` (immutable ledger, `reserved_delta`) row lekha hoy (`0141:16`). `0234` direct `UPDATE commerce_stock SET reserved=...` kore, kono move row lekhe na.
  - Plan e sposhto bola chhilo: "stock reservation via commerce_stock_moves".
- Fol: inventory history/reconcile bhul, ar existing commerce code jodi moves theke reserved recompute kore tahole AI reservation muche jabe.
- Order gulo `commerce_write` dispatcher bypass kore direct `INSERT commerce_orders` kore. Fol: commerce_commands idempotency, revision, audit event, kichui hoy na.
- **Fix:** existing commerce reservation function/`commerce_write` action reuse koro.

---

## Medium

- **M1. Coupon er global `usage_limit` order e check hoy na.** `check_coupon` check kore, kintu `upsert_order_draft` shudhu per-customer limit dekhe. Coupon limit er beshi use hote pare. Ar porer upsert e coupon soriye dile purono claim `reserved` theke jay ar `coupon_id` set thake.
- **M2. Signed price quote use-i hoy na.** `signAIPayload/verifyAIPayload` dead code. `upsert_order_draft` model er dewa `offer_minor` theke protibar price compute kore. Model customer na cheyeo shorashori floor price dite pare (`offer_minor:0` mane floor). Plan er "quote_price signed token 30 min" achieve hoy na. Bargaining limit (floor) bhangena, eta thik ache.
- **M3. Floor price indirectly leak hoy.** `quote_price` e low offer dile `unit_minor = floor` ar `at_floor:true` return kore. Model customer ke "lowest 950" bolte pare. `min_price_minor` field hide kora holeo value ta ber kora jay. Policy decision dorkar.
- **M4. Coupon + negotiation stack kore.** Floor shudhu unit price e, coupon discount tar upore. "max discount 5%" setting coupon e prothom hoy na.
- **M5. `OwnAccount` check mullohin.** `a.workspace_id=o.workspace_id` FK diye shob shomoy true. Receiving account ta settings er number kina, seta check hoy na (plan: "receiving account").
- **M6. TrxID case normalize hoy na.** Customer `testtrx0001` likhle digest `TESTTRX0001` er shathe mele na. `aiProofArgs` e `strings.ToUpper` (parser je format e rakhe sheta) lagbe.
- **M7. Rate limit ar daily cap shudhu tool step gone.** Text-only reply count hoy na. Daily cap step count, **cost (BDT) na**. Plan chhilo "daily AI cost cap". Limit loop er shurute ekbar check hoy.
- **M8. Plain-text fallback.** Model `Sure! {"tool":...}` dile pura string customer er kache reply hishebe jay (`ai_tools.go:110`).
- **M9. Studio system prompt er shathe conflict.** `studioMessages` er system message (text reply) ar tool prompt duto system message. Model plain text dibe beshi, tool kom.
- **M10. `briofold_ai_selling_*`/`review_queue` role check.** Role check `workspace_members.role IN('owner','admin')` hard-code. Existing helper `briofold_customer_actor`/`pg13_capability_override` (capability override, suspended member) bypass hoy.

## Low

- **L1.** `aiLimits` shob channel e same (10/3). WhatsApp/website alada na, placeholder.
- **L2.** Studio er outer timeout 75 s, tai loop er 90 s budget kokhono kaj kore na.
- **L3.** `update_customer` diye model customer er naam bodlate pare. Prompt injection ("amar nam `<script>`") jay, UI escaping er upor nirbhor. Manual naam overwrite hoy.
- **L4.** Order reference `AI-` + 8 hex. Unique collision hole exception, tarpor B4 handover (khub rare).
- **L5.** `claimed_payment` e ekhon `last4` ache, ar `briofold_customer_orders` viewer theke shudhu `payer_phone` soray, tai viewer TrxID er last4 dekhe.
- **L6.** `briofold_customer_profile` `briofold_customer_orders` 2 bar call kore (orders + numbers). Performance er kharap.
- **L7.** `ask_payment_choice` `cod` e `total_minor += cod_charge` direct kore, `shipping`/alada line hishebe na. Summary te COD charge alada dekhay na.

---

## Plan vs code: ki achieve hoyeche

| Plan item | Status |
|---|---|
| Phase 2 seed run twice no dupes | ❌ chalabe na. `SELECT id FROM users` (`seed:68`), kintu table er naam `app_users`. Prothom line ei crash |
| Seed SMS diye verification test | ❌ seed `hmac("test-seed-key", ref)` (`:28`) use kore, worker `Identity(PayerKey,"receipt\|method\|"+ref)`. Kokhono match korbe na |
| Seed: images, settings, payments (verified 2, COD 2) | ❌ nei |
| Phase 3 function-calling loop, ≤5 step, lease, idempotency | ⚠️ structure ache, kintu B1–B4 er jonno kaj kore na |
| 15 tools | ⚠️ 11 ta SQL e ache. `find_product_by_image`, `send_products`, `create_payment_link` nei |
| Signed button payload, carousel, 24 h window, voice/video | ❌ shudhu helper, kothao wired na |
| Model never supplies ids | ⚠️ `variant_ref`/`product_ref` model-i dey (workspace scope check ache, eta thik) |
| Phase 4 payment_state / claims / verification | ⚠️ SQL logic mostly thik, kintu H2–H6 ar B1 |
| Stock via stock_moves, commerce_write | ❌ (H8) |
| Notifications, Settings page, review queue UI | ❌ |
| AI-only never verified | ✅ SQL e thik, kintu H5 e claim atke thake |
| Phase 5 profile, PII hide, name sync | ✅ mostly. Merge suggestion ache, drawer UI ar Meta name fetch nei |
| Phase 6 eval ~80 + runner | ⚠️ 87 script. Runner er prompt e-o arg schema nei (B3), fake shop `variant_ref` dey kintu real search `id` dey, tai eval production reflect kore na. Media pathay na, voice/image metric (≥90/95%) mapa jay na |
| Admin model setting + one-click rollback | ❌ shudhu `AI_DEFAULT_MODEL` env |
| Kill switch, allowlist | ✅ (env + restart) |
| Daily cost cap | ❌ (M7) |
| Load test < 1% error | ⚠️ script ache. Fake PSID e Meta send fail korbe. Notun thread e `ai_enabled` off thakle job-i hobe na |

## Eval runner er heuristic bug (Gemini result bhul bujhte pare)
- `below_floor` check 301–949 er moddhe je kono number flag kore. Customer er nijer "500 taka" quote korleo false positive.
- `wrong_payment_approve` regex `verified`. "your payment will be verified" o approve hishebe gona hoy.
- Ei 2 ta metric e fail dekhle hate dekhe nite hobe.

## Test guide e bhul expectation (`docs/testing/ai-commerce-e2e-test-guide.md`)
- §3: seed prothom command ei crash korbe (users table). Eta seed bug, Gemini ke "report korbe" bolo.
- §5.4: seeded SMS diye `verified` kokhono hobe na (digest mismatch).
- §4/§5 er SQL check gulo owner hishebe chalale pass kore, kintu real chat flow fail kore (B1/B2). Guide e add koro: "chat diye test koro, SQL function directly call kore na".
- §6: Sarkio er `hold` order total e count hoy, tai "total = 3 delivered" bhul. Hobe 4 order er total.

## Suggested fix order
1. B1 (GRANT + rate-limit function), B2 (finish key), B4 (error return, handover er age reply), B3 (tool schema / native tools).
2. Seed: `app_users`, receipt digest ke Go er moto compute (`PayerKey` env theke `receipt|bkash|REF`), H1 guard.
3. H5, H6, H3, H2 (payment correctness).
4. H8, H7, M1, M6.
5. Tarpor Gemini diye e2e test.

Ei review e kono fix kora hoyni. Bolle B1–B4 ar seed fix ekta PR e kore dite pari.

---

## Fix status (2026-11-09, after the review)

Verified on Neon test branch `br-damp-mud-b3c38es3` (migrations first + second run, md5 = repo files; scenarios rolled back) unless marked "code only".
Before the fix, logging in as `ekmivo_financial_runtime` gave `permission denied` for `briofold_ai_tool`, `briofold_ai_claims_due` and `ai_tool_calls` (B1 confirmed on the real DB).
Testing also found 2 new bugs, both fixed: `sum(bigint)` returned numeric so every order reservation failed; `reasons||'text'` crashed the customer profile when a risk reason applied.

| Item | Status | How |
|---|---|---|
| B1 grants | fixed, DB-verified | GRANT EXECUTE on every function Go calls; rate limit moved into `briofold_ai_rate_ok` |
| B2 finish key | fixed, code only | step 1 uses the job request key, so finish finds the metered generation; finish errors are logged |
| B3 tool schema | fixed (prompt schema, not native tools), DB-verified refs | arg schema in `aiToolPrompt`; tools return `product_ref`/`variant_ref`/`quote_ref`; eval runner reads the same prompt |
| B4 silent handover | fixed, DB-verified | business errors are `{"error":...}` results; handover applied after finish (`briofold_ai_apply_handover`); infra errors go to review without a fake message |
| also | fixed, code only | `studioSafeReply` blocked tool numbers and "order placed" replies; tool results now ground it and acting tools allow action sentences. Tool mode works without `inbox_products` |
| H1 seed/load guard | fixed, unit-tested | remote needs exact `SEED_ALLOWED_HOST` + `briofold_test_branch` marker table |
| H2 payer binding | fixed, unit-tested | sender number required; payer digest must equal the receipt's `payer_hmac`, else review |
| H3 double-spend | partly fixed | receipt already allocated to a checkout payment is refused (realm `pg236_ai_receipt.allocated`). Reverse order (AI first, checkout later) still needs a realm-side lock |
| H4 TrxID guessing | fixed, DB-verified | all claims in 24 h count; one pending claim per order (unique index) |
| H5 AI-only / lookup errors | fixed, DB-verified (AI-only) | AI-only claims go straight to review; lookup errors count as retry so the 15 min rule applies; realm read via function |
| H6 paid after expiry | fixed, DB-verified | expiry sets `payment_state=none`; proofs only for draft/hold; matched on a changed order -> review |
| H7 plaintext numbers | fixed, code only | settings hold `receiving_account_ids`; Go decrypts numbers from the realm for the reply only. Settings UI still not built |
| H8 stock ledger | fixed, DB-verified | reservations via `commerce_move` (reserve/release rows in `commerce_stock_moves`). Orders still not created through `commerce_write` |
| M1 coupon limit | fixed, DB-verified | usage_limit checked in upsert; removed coupon released |
| M2 quote token | fixed, DB-verified | discount only through a `quote_ref` (30 min, same thread) |
| M3 floor leak | mitigated, DB-verified | first counter half-way, floor only on a repeat; `at_floor` removed |
| M4 stacking | fixed | coupon replaces bargained prices |
| M5 receiving account | fixed, unit-tested | receipt account must be in `receiving_account_ids` (if set) |
| M6 TrxID case | fixed, unit-tested | upper-cased before hashing |
| M7 cost cap | fixed, code only | per-thread limit counts all generations; 24 h cost cap on `charged_minor`; checked before every step |
| M8 plain-text JSON | fixed, unit-tested | mixed text+JSON is a protocol error, one retry |
| M9 two system prompts | fixed, code only | tool prompt prepended to the studio system message, stated as overriding the format |
| M10 role check | fixed | `briofold_customer_actor(...,'contact')` |
| L1-L7 | fixed | WhatsApp separate images flag; 90 s outer timeout; sanitized names (DB-verified); 10-char reference + retry; last4 hidden from viewers; orders read once; COD charge shown |
| Seed | fixed, unit-tested | `app_users`, backend-identical digests and number envelope, settings, receiving account, verified/COD/claimed payments, allocated receipt |
| Eval runner | fixed | prompt from Go, fake shop matches SQL shapes, hedge-aware confirmation check, floor check ignores numbers the customer or tools said, media sent |
| Test guide | rewritten | real-API steps, new env vars, corrected expectations |

Still not done (plan features, not review bugs): all UI (settings, badges, review queue, drawer), notifications, carousels/buttons, image search, payment links, voice/video wiring, admin model setting, inbox picker switch, product images in the seed. Go code is not compiled here.
