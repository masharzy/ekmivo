<?php
declare(strict_types=1);
// Signature validation only. Query Go state and transactionally persist event
// dedup + fulfilment using schema.sql and the complete Go receiver example.
function verifyEkmivo(string $raw, array $headers, string $secret, string $workspace, string $environment, ?int $now = null): array {
    if (strlen($raw) > 16384 || strlen($secret) < 32) throw new RuntimeException('Invalid webhook bounds');
    $h = array_change_key_case($headers, CASE_LOWER);
    $timestamp = ($h['x-briofold-timestamp'] ?? $h['x-ekmivo-timestamp'] ?? '');
    if (!ctype_digit($timestamp) || abs(($now ?? time()) - (int)$timestamp) > 300) throw new RuntimeException('Timestamp rejected');
    $signature = 'v1=' . hash_hmac('sha256', $timestamp . '.' . $raw, $secret);
    if (!hash_equals($signature, ($h['x-briofold-signature'] ?? $h['x-ekmivo-signature'] ?? '')) || !hash_equals(substr(hash('sha256', $secret), 0, 16), ($h['x-briofold-key-id'] ?? $h['x-ekmivo-key-id'] ?? ''))) throw new RuntimeException('Signature rejected');
    $event = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    $data = $event['data'] ?? [];
    if (($event['id'] ?? '') !== (($h['x-briofold-event-id'] ?? $h['x-ekmivo-event-id'] ?? '')) || ($event['delivery_id'] ?? '') !== (($h['x-briofold-delivery-id'] ?? $h['x-ekmivo-delivery-id'] ?? '')) || ($event['workspace_id'] ?? '') !== $workspace || ($event['environment'] ?? '') !== $environment || ($event['schema_version'] ?? 0) !== 1 || ($event['type'] ?? '') !== 'payment.verified') throw new RuntimeException('Scope rejected');
    foreach ([$event['id'] ?? '', $event['delivery_id'] ?? '', $data['payment_id'] ?? ''] as $id) if (!is_string($id) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $id)) throw new RuntimeException('Identifier rejected');
    if (!is_int($data['amount_minor'] ?? null) || $data['amount_minor'] <= 0 || ($data['currency'] ?? '') !== 'BDT' || ($data['verification_status'] ?? '') !== 'verified') throw new RuntimeException('Payment fields rejected');
    return $event;
}
