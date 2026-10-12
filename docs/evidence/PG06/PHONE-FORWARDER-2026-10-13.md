# PG06 SMS forwarder implementation — source handoff, 2026-10-13

Owner direction: follow the forwarding concept from PipraPay V2, NOT its optional TLS bypass, broad wildcard forwarding or customer TrxID. Pair a physical phone ONCE; receiving numbers remain in Payment Methods. No merchant-facing parser IDs, subscription IDs, manual account selection, or claimed QR scanner.

Source behavior:
- Web SMS Devices: name phone > copy one-time code > pair in Android > health, rename, revoke. Saved receiving numbers are read-only information.
- Android: prominent Home collection action; consent and SMS permission; only server-advertised sender labels for enabled receiving methods and likely payment text are captured. Missing SIM ID is an opaque hint. Encrypted offline queue and P256-signed phone-events. Queued evidence retains immutable phone ID and original capture config version. Legacy account-bound events still use their original enrollment IDs.
- Go: verify signed physical key, realm/tenant entitlement and allowed receiving method, enforce sender scope, encrypt evidence. Approved parsers alone may extract actual payer, original transaction time, amount, reference and optional receiving account identity. No customer TrxID entry.
- SQL: additive 0047_pg06_phone_forwarder.sql via existing guarded financial migration coordinator only. Unique phone/event durable ACK and encrypted pending archive. A configuration change while offline leaves old evidence pending. Only proven unique receiver matching can create a financial observation for existing PG07 River matching/webhook. Source receipt pending is NOT payment proof.

IMPORTANT SOURCE LIMITATION: Common provider SMS may not include the receiving number. SMS originatingAddress is provider identity, never payer or receiver. Android may not know its own SIM phone number. Without a confirmed phone/SIM-to-receiver mapping or actual receiving number in a trusted receipt, account attribution is not proven; this implementation retains evidence pending instead of guessing. Production's last known PG06_PARSER_RULES_JSON was empty; verify actual production registry before claiming live format support. Do not fabricate approved rules.

Automated checks and real-device acceptance MUST be recorded after execution. No source commit is production migration, no tests constitute a real transfer and checkout ready-source safeguards must remain. Manual scenarios: one phone, dual SIM, duplicate/retry, queued configuration change, wrong tenant/realm, revoked key, permission lost, restart, full destination, real provider parser and webhook once. See USER-DEVICE-TESTS.txt.

Reference: https://github.com/PipraPay/PipraPay-V2-App/blob/main/app/src/main/java/com/qube/piprapay_tool/Forwarding_Class/SmsBroadcastReceiver.java
