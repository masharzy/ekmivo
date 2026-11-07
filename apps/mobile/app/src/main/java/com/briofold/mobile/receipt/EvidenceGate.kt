package com.briofold.mobile.receipt

/**
 * Android's early, non-authoritative safety gate for structurally complete incoming evidence.
 *
 * This does NOT verify a payment, match an intent, prove device enrollment or provide
 * payment-provider authenticity. Go must validate every field and securely resolve the
 * enrolled receiving account, tenant, environment, amount, time window and uniqueness.
 */
enum class PaymentMethod { BKASH, NAGAD, ROCKET }
enum class EvidenceGap {
 EVENT_ID, PAYER_NUMBER, AMOUNT, ORIGINAL_TRANSACTION_TIME, RECEIVING_SOURCE_BINDING,
 METHOD, INCOMING_DIRECTION
}
sealed interface SubmissionReadiness {
 data class Incomplete(val missingOrInvalid:Set<EvidenceGap>):SubmissionReadiness
 data class StructurallyComplete(
  val eventId:String,
  val normalizedPayer:String,
  val amountMinor:Long,
  val originalTransactionEpochMillis:Long,
  val receivingSourceBindingId:String,
  val method:PaymentMethod
 ):SubmissionReadiness
}

/**
 * Event fields must come from the explicitly consented relevant provider receipt.
 * Sender label or device notification sender is NOT payer number.
 * Original transaction time is NOT phone receipt time or server ingest time.
 * Source binding is only a locally enrolled source hint; never final account authority.
 */
data class UntrustedReceiptObservation(
 val eventId:String?,
 val actualPayerNumber:String?,
 val amountMinor:Long?,
 val originalTransactionEpochMillis:Long?,
 val receivingSourceBindingId:String?,
 val method:PaymentMethod?,
 val isIncoming:Boolean?
) {
 fun submissionReadiness():SubmissionReadiness {
  val missing=linkedSetOf<EvidenceGap>()
  val id=eventId?.takeIf { it.isNotBlank() && it.length<=128 }
  if(id==null)missing+=EvidenceGap.EVENT_ID
  val payer=actualPayerNumber?.let(::normalizeBangladeshMobile)
  if(payer==null)missing+=EvidenceGap.PAYER_NUMBER
  val amount=amountMinor?.takeIf { it>0L }
  if(amount==null)missing+=EvidenceGap.AMOUNT
  val time=originalTransactionEpochMillis?.takeIf { it>0L }
  if(time==null)missing+=EvidenceGap.ORIGINAL_TRANSACTION_TIME
  val binding=receivingSourceBindingId?.takeIf { it.isNotBlank() && it.length<=128 }
  if(binding==null)missing+=EvidenceGap.RECEIVING_SOURCE_BINDING
  if(method==null)missing+=EvidenceGap.METHOD
  if(isIncoming!=true)missing+=EvidenceGap.INCOMING_DIRECTION
  if(missing.isNotEmpty())return SubmissionReadiness.Incomplete(missing)
  return SubmissionReadiness.StructurallyComplete(
   eventId=requireNotNull(id),
   normalizedPayer=requireNotNull(payer),
   amountMinor=requireNotNull(amount),
   originalTransactionEpochMillis=requireNotNull(time),
   receivingSourceBindingId=requireNotNull(binding),
   method=requireNotNull(method)
  )
 }
}

/**
 * Allow numeric Bangladeshi mobiles only. Masked numbers, suffix guesses, arbitrary
 * digits and sender labels are never made eligible. Bengali/Arabic-Indic digits
 * can be normalized as exact numeric values; no inferred missing prefix/digits.
 */
fun normalizeBangladeshMobile(value:String):String? {
 if(value.any { it in "*xX•#" })return null
 val normalized=buildString {
  value.trim().forEach { ch ->
   append(when(ch){
    in '০'..'৯' -> '0'+(ch-'০')
    in '٠'..'٩' -> '0'+(ch-'٠')
    else->ch
   })
  }
 }.replace(" ","").replace("-","")
 val local=when {
  Regex("^01[3-9][0-9]{8}$").matches(normalized)->normalized
  Regex("^8801[3-9][0-9]{8}$").matches(normalized)->normalized.removePrefix("88")
  Regex("^\\+8801[3-9][0-9]{8}$").matches(normalized)->normalized.removePrefix("+88")
  else->return null
 }
 return "+88"+local
}
