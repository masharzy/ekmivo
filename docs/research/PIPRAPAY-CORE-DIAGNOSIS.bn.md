# PipraPay core diagnosis — Briofold reference

Reviewed: 2026-10-11. Repository: https://github.com/PipraPay/PipraPay
Pinned commit: `021ecd302a0dc3316383933ef3aa405be9271404`.

এটি public source-এর static review। কোনো PHP, installer, plugin বা Android APK চালানো হয়নি; production account বা transaction-এ পরীক্ষা করা হয়নি। GitHub tree ও নিচে উল্লিখিত core files পড়া হয়েছে। প্রতিটি gateway plugin, bundled dependency ও Android app-এর পূর্ণ audit নয়। Local reference files `tmp/piprapay-source`-এ আছে; এগুলো Briofold runtime-এর অংশ নয়।

## সিদ্ধান্ত

PipraPay একটি কার্যকর payment-automation reference: receiving methods, Android receipt ingestion, SMS parsing, checkout, invoices, links, API, staff permissions ও webhook retry-এর বাস্তব implementation আছে। এটি AI bot বা complete AI automation platform নয়। অন্য সব AI automation platform এই repo থেকে তৈরি হয়েছে—এমন provenance এই source থেকে প্রমাণ হয় না।

Briofold-এর backend-এর সরাসরি base হিসেবে বর্তমান core নেওয়া উচিত নয়। বর্তমান PHP/MySQL core এবং আমাদের Go/PostgreSQL architecture ভিন্ন। আরও গুরুত্বপূর্ণ: এর reviewed automation checkout customer TrxID-নির্ভর; আমাদের সময় + প্রকৃত sender + amount + receiving account + method অনুযায়ী unique automatic match প্রয়োজন। Concepts ও operational information layout নেওয়া যাবে; verification engine স্বাধীনভাবে implement করতে হবে।

## Architecture ও inventory

| অংশ | source-এ পাওয়া implementation | Briofold-তে শিক্ষা |
|---|---|---|
| Entry/router | `index.php`: login/2FA, IPN, API, checkout, invoice, payment-link, admin, cron | HTTP adapter আলাদা রাখব |
| Data access | `pp-functions.php`: PDO MySQL, CRUD helpers; monetary arithmetic BCMath | PostgreSQL typed repositories ও minor units |
| Main handler | `pp-adapter.php`: admin mutations, checkout verification, device transmission | Financial domain, device ingress ও admin responsibilities আলাদা |
| Gateway plugins | `pp-modules/pp-gateways/*/class.php`: info/fields/instructions/verification/refund depending on provider | Typed provider adapters; কোন plugin-এর capability আছে স্পষ্ট |
| Theme | `pp-modules/pp-themes/twenty-six/*` | Payment checkout customer-facing; merchant operations আলাদা |
| Background | URL-triggered cron, local lock file, pending SMS verification ও webhook delivery | Durable database jobs, transactional outbox, multi-worker safety |
| Merchant admin | Tabler-based icons, grouped navigation, brand selector | Readable grouped sidebar; product switch brand switch থেকে আলাদা |
| Authentication | password hashing, random sessions, 2FA, CSRF, permissions | Useful controls; এগুলো আছে বলে সব financial path safe প্রমাণ নয় |

README-এ Laravel badge আছে; পড়া entry/core PHP files ও MySQL PDO implementation Laravel application বলে ধরে নেওয়ার ভিত্তি নয়। Reviewed tree-তে root Laravel scaffold পাওয়া যায়নি।

Admin shell-এর menu: Dashboard, Reports, Gateways, Customers, Transaction, Invoice, Payment Link; Appearance → Brand Settings; MFS Automation → SMS Data, Devices; Administration → Addons, Domains, All Brands, Staff Management, System Settings, Activities, Donate Us. User menu: My Account, Activities, logout. Brand switcher ও permission-based menu visibility আছে।

Admin source: [pinned admin shell](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/pp-content/pp-admin/index.php#L208).

## Payment automation আসলে যেভাবে কাজ করে

1. Device account connects and gets a token. Bulk SMS submission presents that device token; server resolves device identity.
2. Sender label whitelist identifies provider (যেমন SMS origin `bkash`)। এটি paying customer-এর actual number নয়।
3. `MFSMessageVerified` regex parses amount, actual payer number, internal TrxID, balance and কিছু message format-এ datetime। Method ও account type-ও শনাক্ত হয়।
4. Parsed receipt stored. কিছু provider/config-এ balance continuity এবং SIM slot পরীক্ষা; mismatch হলে `awaiting-review`। এটি request-এর payer/time match-এর বিকল্প নয়।
5. Reviewed bKash personal instructions customer-কে TrxID লিখে Verify চাপতে বলে। Checkout handler সেই `trxid` নেয়; existing completed transaction lookup করে; approved receipt খোঁজে provider key + type + TrxID দিয়ে; amount tolerance পরীক্ষা করে।
6. Receipt status `used`, transaction `completed`; sender receipt থেকে copied হয়। Webhook পাঠানো হয়। SMS পরে এলে pending transaction cron-এ অনুরূপভাবে মেলে।

সূত্র: [bKash instructions](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/pp-content/pp-modules/pp-gateways/bkash-personal/class.php#L86), [parser](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/pp-content/pp-include/pp-functions.php#L888), [checkout matching](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/pp-content/pp-include/pp-adapter.php#L8862), [device ingress](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/pp-content/pp-include/pp-adapter.php#L9293), [cron matching](https://github.com/PipraPay/PipraPay/blob/021ecd302a0dc3316383933ef3aa405be9271404/index.php#L1832).

`verify-payment` API name-কে no-TrxID receipt auto-matcher মনে করা যাবে না: checkout receipt matching ও merchant status lookup আলাদা দায়িত্ব।

## Source findings

Severity এখানে Briofold-তে code গ্রহণের ঝুঁকি বোঝায়। এগুলো upstream-এ exploit প্রমাণ বা CVE নয়।

| ID / priority | Finding ও evidence | প্রভাব / প্রয়োজনীয় পরিবর্তন |
|---|---|---|
| PP-01 / P0 | Checkout query-তে `sender_key`, `type`, `trx_id`, `status`; এরপর amount tolerance। Expected payer number, request time window, receiving account/device নেই। `pp-adapter.php:8862–8895`; cron `index.php:1835–1856` | আমাদের five-field automatic matching পূরণ হয় না; receipt owner mapping, payer equality, time window, unique candidate count enforce করতে হবে |
| PP-02 / P0 | SMS parser datetime দেয়, ingress `$timestamp` ও `$datetime` নেয়, কিন্তু receipt insert-এ `created_date` server current time। `pp-adapter.php:9320–9384`; `db.sql:415–435` | Receipt arrival time ও transaction time আলাদা রাখতে হবে। Offline sync-এর পুরোনো receipt নতুন payment-এ match করা চলবে না |
| PP-03 / P0 | Reviewed completion path-এ receipt ও payment দুই পৃথক update; return value checked নয়; transaction/row lock নেই। `pp-adapter.php:8885–8897`; cron `index.php:1845–1858` | Concurrent verify/crash double consumption বা inconsistent financial state ঘটাতে পারে। Single DB transaction, locking, compare-and-set, unique allocation ও outbox প্রয়োজন |
| PP-04 / P0 | SMS/transaction indexes `ADD KEY`, receipt identity/ref-এর required uniqueness নেই। `db.sql:668–690`। Ingress আগে SELECT পরে INSERT করে | Application-level duplicate check concurrent requests আটকানোর নিশ্চয়তা দেয় না। Tenant + receiving account + provider receipt identity unique constraint প্রয়োজন |
| PP-05 / P1 | Cron payment completed update-এর পর webhook payload `status => $row['status']`, যেখানে `$row` আগে pending অবস্থায় পড়া। `index.php:1854–1856`, `1907` | Verified payment-এর webhook-এ pending যেতে পারে। Final domain event থেকে immutable payload তৈরি ও contract test দরকার |
| PP-06 / P1 | `sendIPN`/`sendIPNMulti` শুধু JSON Content-Type/Connection headers; merchant signature, event ID, timestamp নেই। `pp-functions.php:675–765` | Merchant independently authenticity/replay verify করতে পারে না। Per-connection HMAC secret, timestamp, stable event ID, documented retries প্রয়োজন |
| PP-07 / P1 | Webhook retry success শুধু HTTP 200; default attempts 1; no next-attempt/backoff field in reviewed table/path। `index.php:2009–2037`; `db.sql:476–488` | 201/202/204 response পুনরায় পাঠানো হতে পারে; transient failure দ্রুত exhausted। Explicit 2xx policy, jittered backoff, exhausted queue, replay history প্রয়োজন |
| PP-08 / P1 | `escape_string` value unchanged ফেরত দেয়। কিছু SQL paths bound params ব্যবহার করলেও admin search ও condition string-এ request values concatenate করা হয়েছে। `pp-functions.php:236–252`, `333–366`; `pp-adapter.php:6119`, `6229` | PDO prepare দিয়ে পূর্বে interpolated SQL নিরাপদ হয় না। সব input parameters bind করতে হবে। Authenticated reachability ও exploitable payload runtime-এ পরীক্ষা হয়নি |
| PP-09 / P1 | API webhook URL domain whitelist validation আছে (`index.php:467–500`), কিন্তু delivery helper-এ private/link-local IP, resolved address, allowed protocol/port checks দেখা যায়নি (`pp-functions.php:675–749`) | Domain approval alone complete SSRF protection নয়। Save-time এবং send-time destination/IP checks দরকার; live SSRF test করা হয়নি |
| PP-10 / P1 | App request HMAC একটি source-embedded shared constant দিয়ে app ID + timestamp hash করে; reviewed gate-এ timestamp age/nonce check নেই। `pp-adapter.php:420–432` | এই HMAC-কে device identity বা replay prevention-এর যথেষ্ট প্রমাণ ধরা যাবে না। Device-scoped credential/signing key, bounded timestamp ও replay IDs প্রয়োজন। Device token আলাদা gate—সম্পূর্ণ auth bypass দাবি করছি না |
| PP-11 / P1 | API keys generated random, কিন্তু DB-তে raw `api_key`, list response-এ raw value। `pp-adapter.php:5030–5036`, `5118`; `index.php:339–341` | Read-only DB/key-list exposure credential disclosure ঘটায়। Hash scoped API tokens; একবার reveal; rotation/revocation |
| PP-12 / P1 | Device ও SMS admin paths-এ global records ব্যবহৃত; current brand filters সব জায়গায় নেই। `pp-adapter.php:5505`, `5586`, `6129`, `6229` | Self-hosted shared device administration-এর design হতে পারে; hostile multi-tenant SaaS isolation প্রমাণ নয়। Briofold tenant FK/RLS/runtime-role tests ছাড়া এই model নেওয়া যাবে না |

Completion transaction অন্য helper-এ আছে (`pp-functions.php:1620`); finding PP-03 পুরো codebase-এ কখনো transaction নেই বলে দাবি নয়—reviewed financial completion path-এর কথা।

ভালো দিক: parser priority ordering; amount normalization; BCMath-based calculation; some native bound SQL; password verification; HttpOnly/SameSite session cookies; CSRF gate; method-specific plugin metadata; retries recorded separately। এগুলো রেখে উপরের correctness gaps ঠিক করতে হবে।

## Briofold implementation mapping

- UI: Payments / Receiving sources / Commerce / Integrations / Workspace groups। AI product-এর navigation এবং metrics আলাদা। Brand/workspace switch একই service ধরে; product switch একই business ধরে।
- Checkout: payer number + method নির্বাচন, amount/receiving account server-derived; customer টাকা পাঠাবেন, page স্বয়ংক্রিয় status refresh করবে। TrxID input, screenshot ও routine approval থাকবে না।
- Receipt: trusted enrolled device + receiving-account/SIM mapping; provider SMS identity থেকে actual sender parse; transaction timestamp, device receipt timestamp ও server ingestion timestamp পৃথক। Parser version recorded। Missing/masked sender/time হলে confidently verified বলা যাবে না; exception দৃশ্যমান থাকবে।
- Matcher: exact normalized sender, currency/minor-unit amount, method, receiving account, bounded transaction time; one eligible request and one unused receipt। Multiple candidates → ambiguity, never arbitrary first match।
- Commit: receipt claim, payment confirmation, allocation, domain event ও merchant outbox এক PostgreSQL transaction-এ। Receipt/internal ID dedup server-side।
- Delivery: stable versioned event, signed webhook, retries/backoff, logs ও reconciliation। UI-তে evidence method ও device health দেখাবে।
- Tests: same amount/same sender overlap, wrong account/SIM, missing sender, delayed offline receipt, timestamp drift, duplicate submit, concurrent verification, crash before/after commit, webhook stale status/retry/replay।

এগুলো নতুন competing plan নয়; canonical master plan ও automatic verification user decision implement করার reference findings।

## কী এখনো যাচাই হয়নি

Android app source এই reviewed repository tree-তে পাওয়া যায়নি। Device reboot/offline capture, SMS permission loss, forged-on-device evidence, time provenance বাস্তব device-এ পরীক্ষা বাকি। প্রতিটি gateway-এর external provider authentication/refund semantics, dependencies-এর vulnerability scan, installer/updater/addon execution, deployed instance-এর security ও performance পরীক্ষা বাকি। Tree-তে vendor tests আছে; সেগুলো core payment invariants-এর test evidence নয়।

Repo `LICENSE` AGPL-3.0। Code reuse/distribution decisions-এ এই license review প্রয়োজন; এই report থেকে সরাসরি code vendoring করা হয়নি।
