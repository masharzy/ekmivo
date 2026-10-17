package com.ekmivo.mobile.receipt

/** Server-allowlisted SMS prefilter, NOT proof of a payment. */
object ReceiptForwardPolicy {
 fun likelyPayment(sender: String, body: String, serverSources: Set<String>): Boolean {
  if (sender.trim().lowercase() !in serverSources.map { it.trim().lowercase() }.toSet()) return false
  val text = body.trim().lowercase()
  if (text.length < 22 || body.toByteArray(Charsets.UTF_8).size > 6000) return false
  // Avoid uploading codes, login messages or balances just because a
  // provider address is allowlisted.
  if (Regex("""(?i)\b(otp|verification code|one.time password|sign.in|login code)\b""").containsMatchIn(text)) return false
  return (text.contains("received") || text.contains("cash in")) &&
   (text.contains("tk ") || text.contains("amount:")) &&
   (text.contains(" from ") || text.contains("sender") ||
    text.contains("trx") || text.contains("txn") || text.contains("uddokta"))
 }
}
