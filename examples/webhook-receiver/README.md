# Briofold PG08 merchant receiver — isolated PostgreSQL example

This is **merchant-owned infrastructure**, **not** a second Briofold financial database. Source: `backend/cmd/webhook-receiver-example/main.go`; schema: `schema.sql`. It must never invent verified funds, accept a browser-return redirect as proof of payment, or fulfil twice.

## Safe sandbox setup

Use a separately owned disposable PostgreSQL database (never the Briofold control, sandbox finance or live finance DB). Apply `schema.sql`, insert a merchant order with an exact `reference` and `amount_minor`, then set:

- `MERCHANT_DATABASE_URL`: merchant-only Postgres DSN.
- `BRIOFOLD_API_ORIGIN`: **HTTPS** authoritative Briofold API origin (no embedded credentials).
- `BRIOFOLD_ENVIRONMENT`: `sandbox` or `live`, matching the event and the API key.
- `BRIOFOLD_WORKSPACE_ID`: authorized workspace UUID.
- `BRIOFOLD_MERCHANT_API_KEY`: merchant backend-only bearer with the least payment-read scope required by the payment-status endpoint.
- `BRIOFOLD_WEBHOOK_SECRET`: exact secret displayed **once** when creating/configuring the endpoint. Never commit it or log it.
- Optional `BRIOFOLD_PREVIOUS_WEBHOOK_SECRET` and `BRIOFOLD_PREVIOUS_SECRET_UNTIL` (RFC3339) for a time-limited key overlap.

Run the compiled `go run ./cmd/webhook-receiver-example` from `backend/` after the standalone merchant database and env are configured. It listens on `:8081` for `POST /webhooks/briofold`; use a trusted public HTTPS reverse proxy for incoming delivery, with the proxy forwarding the raw HTTP request body unchanged. An Briofold webhook endpoint must be publicly DNS-resolvable with an allowed public IP on HTTPS port 443. The Briofold sender intentionally refuses localhost/private/metadata addresses and HTTP redirects. Do **not** weaken SSRF protection or directly register a development `localhost` URL.

## Exact consumer protocol

1. Read **raw bytes** (16 KiB maximum), inspect `X-Briofold-Timestamp`, `X-Briofold-Event-ID`, `X-Briofold-Delivery-ID`, `X-Briofold-Key-ID`, and `X-Briofold-Signature`. The same values are also sent as `X-Briofold-*` for receivers written before the rename; new code should read `X-Briofold-*`.
2. Require `v1=` followed by HMAC-SHA256 hex of `timestamp + "." + raw_body`. Key ID is the first 8 bytes of SHA256(secret), hex; constant-time signature comparison, timestamp within 5 minutes. Do not parse/serialize JSON before signing. The event ID and per-attempt delivery ID must agree with the verified body.
3. Validate schema version, workspace, environment, event type and verified payment data. Query Briofold **server-to-server** for current payment by ID; compare verified amount, currency and immutable merchant reference. Reject mismatches even with a valid webhook signature.
4. Inside one merchant Postgres transaction, lock the known order, require its exact amount, insert into `merchant_webhook_events` using `event_id` as a unique key, and insert a single `merchant_fulfilment_jobs` row. Duplicate/reordered delivery responds 2xx without duplicating fulfilment. Return 204 only after commit.
5. HTTP 2xx acknowledges consumer persistence, **not** a new payment. Network delivery is at-least-once; receive/replay may run more than once. The consumer must not reverse later state based on out-of-order events.

## Sender / retry / rotation behaviour

PG08 queues one durable `payment.verified` domain event in the same transaction as PG07 payment and allocation, and a delivery row for each enabled endpoint. The River worker obtains a 60-second lease, rechecks workspace projection and sends to a validated, DNS-pinned public HTTPS endpoint. Each attempt uses a new delivery UUID and timestamp; the original event UUID remains stable. It does not use HTTP proxy env variables, follow redirects, or accept private IPs even when DNS answers include both private and public addresses.

Retries: 1 minute, 5 minutes, 15 minutes, 1 hour, 3 hours, 6 hours and 12 hours with a bounded 0–30-second jitter. Timeouts/network failures/408/429/5xx retry; ordinary 4xx such as 401/403 fail terminally and need operator attention. The maximum is eight attempts, including attempts with a lost completion record after a process crash. A reclaimed lease cannot be completed by an outdated worker. Failed webhook delivery **never rolls back verified payment**. Explicit manual replay is a new delivery row for the **same** immutable event ID.

Rotation is **two-phase**. Prepare the next signing secret; it is displayed once, but the current key continues signing. Provision the next key in your receiver, then **Activate new secret** on Webhooks. The prior key remains available for receiver validation for up to 24 hours. **Revoke previous secret** immediately retires it in Briofold; also remove it from your receiver. If receiver configuration is incomplete, do not activate. Emergency key compromise requires deliberate receiver and Briofold revocation.

## Automated verification and explicit limits

The disposable CI job invokes the genuine Go receiver with a separate merchant PostgreSQL database and local TLS authoritative API fixture. It verifies raw HMAC and key overlap/expiry, wrong scope/key/stale time, authoritative readback and persistent idempotent fulfillment. The delivery worker's isolated SQL state machine tests 2xx, 403, 429, 500, unknown network result, retry delays, lease loss/reclaim, max attempts, endpoint disable, staged rotation and manual replay. TLS sender tests simulate public DNS, pin its address and reject redirects/private DNS. These are **synthetic scenarios**; they are not proof of genuine bKash/Nagad/Rocket funds or external/public Internet connectivity.

At present, only the `payment.verified` event has a producer. Future exception/expiry/reversal/refund/invoice events require their owning product services to exist. Customer email/SMS receipt notices **are not implemented or delivered**: checkout has no independently verified, consented recipient/channel. Do not substitute public checkout polling or merchant webhook delivery for a customer notification; this requires opt-in/contact verification, provider configuration, privacy/retention and an end-to-end notice delivery test before PG08 product acceptance.

Safe production release requires a separate operator decision, verified DNS, backups/key recovery, bounded monitoring/on-call alerts, legal consent and PG06/PG07 real-device/provider evidence. Never send real money using the current sandbox simulated checkout.
