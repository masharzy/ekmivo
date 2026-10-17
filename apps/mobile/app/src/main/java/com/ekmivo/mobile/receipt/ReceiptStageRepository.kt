package com.ekmivo.mobile.receipt

import android.content.Context
import org.json.JSONObject
import java.util.UUID

/**
 * Two durable layers:
 *  1. encrypt + commit incoming receipt in Room, with a stable event ID;
 *  2. mirror that same event ID into the existing encrypted, signed outbox.
 * Recovery mirrors any Room row left by a crash, before network upload.
 *
 * The old receipt-outbox.db is never automatically deleted or rewritten.
 */
class ReceiptStageRepository(private val context: Context) {
 private val dao get() = ReceivedSmsRoom.get(context).messages()

 fun capture(store: ReceiptStore, payload: JSONObject): Boolean {
  val id = UUID.randomUUID().toString()
  val encrypted = store.encryptStaging(id, payload.toString().toByteArray(Charsets.UTF_8))
  if (dao.insert(ReceivedSms(id, encrypted, System.currentTimeMillis())) == -1L) return false
  // Receipt is durable in Room even when mirroring needs a later worker retry.
  runCatching { mirrorOne(store, id, encrypted) }
  return true
 }

 private fun mirrorOne(store: ReceiptStore, id: String, cipher: ByteArray): Boolean {
  val body = JSONObject(String(store.decryptStaging(id, cipher), Charsets.UTF_8))
  // Never redirect held events to another shop: the signed enrollment is
  // part of the IMMUTABLE encrypted body.
  if (!store.ownsEnrollment(body.optString("enrollment_id"))) {
   dao.failed(id, "ORIGINAL_ENROLLMENT_REQUIRED")
   return false
  }
  when (store.deliveryDisposition(id)) {
   2 -> { dao.acknowledged(id); return true } // ACK survived a process crash
   1 -> { dao.mirrored(id); return true }      // already mirrored to outbox
  }
  val ok = store.enqueue(body, id)
  if (ok) dao.mirrored(id)
  else dao.failed(id, "ENCRYPTED_OUTBOX_FULL")
  return ok
 }

 fun recover(store: ReceiptStore) {
  for (entry in dao.unacknowledged()) {
   if (entry.status == "sent") continue
   try { mirrorOne(store, entry.id, entry.encryptedBody) }
   catch (_: Exception) { dao.failed(entry.id, "ENCRYPTED_STAGE_RECOVERY_FAILED") }
  }
 }

 fun sending(id: String) = dao.sending(id)
 fun acknowledge(id: String) {
  dao.acknowledged(id)
  dao.pruneSent()
 }
 fun failed(id: String, safeCode: String) {
  require(safeCode.matches(Regex("[A-Z0-9_]{1,64}")))
  dao.failed(id, safeCode)
 }
 fun unsentCount(): Int = dao.countUnacknowledged()
}
