"""Merchant-side signature/scope verification. Persist dedup in PostgreSQL,
query authoritative payment state, and enqueue fulfilment atomically as in the
Go receiver. A successful return from this function alone never ships goods.
"""
import hashlib
import hmac
import json
import re
import time

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

def verify(raw: bytes, headers: dict[str, str], secret: str, workspace: str, environment: str, now: int | None = None) -> dict:
    if len(raw) > 16384 or len(secret) < 32:
        raise ValueError("Invalid webhook bounds")
    fields = {key.lower(): value for key, value in headers.items()}
    timestamp = (fields.get("x-briofold-timestamp") or fields.get("x-ekmivo-timestamp") or "")
    signature = (fields.get("x-briofold-signature") or fields.get("x-ekmivo-signature") or "")
    if not timestamp.isdigit() or abs((int(time.time()) if now is None else now) - int(timestamp)) > 300:
        raise ValueError("Timestamp rejected")
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
    key_id = hashlib.sha256(secret.encode()).hexdigest()[:16]
    if not hmac.compare_digest(signature, "v1=" + expected) or not hmac.compare_digest((fields.get("x-briofold-key-id") or fields.get("x-ekmivo-key-id") or ""), key_id):
        raise ValueError("Signature rejected")
    event = json.loads(raw)
    data = event.get("data", {})
    if event.get("id") != (fields.get("x-briofold-event-id") or fields.get("x-ekmivo-event-id")) or event.get("delivery_id") != (fields.get("x-briofold-delivery-id") or fields.get("x-ekmivo-delivery-id")):
        raise ValueError("Header identity mismatch")
    if event.get("schema_version") != 1 or event.get("workspace_id") != workspace or event.get("environment") != environment or event.get("type") != "payment.verified":
        raise ValueError("Scope rejected")
    for value in [event.get("id"), event.get("delivery_id"), data.get("payment_id")]:
        if not isinstance(value, str) or not UUID.fullmatch(value):
            raise ValueError("Identifier rejected")
    amount = data.get("amount_minor")
    if type(amount) is not int or amount <= 0 or data.get("currency") != "BDT" or data.get("verification_status") != "verified":
        raise ValueError("Payment fields rejected")
    return event
