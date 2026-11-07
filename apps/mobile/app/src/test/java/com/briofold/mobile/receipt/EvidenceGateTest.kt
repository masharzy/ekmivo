package com.briofold.mobile.receipt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EvidenceGateTest {
 private fun full()=UntrustedReceiptObservation(
  eventId="device-event-001", actualPayerNumber="01712345678", amountMinor=12500L,
  originalTransactionEpochMillis=1780000000000L,
  receivingSourceBindingId="explicitly-enrolled-source",
  method=PaymentMethod.BKASH,isIncoming=true
 )
 @Test fun completeEvidenceIsOnlyStructurallyCompleteNotPaid() {
  val state=full().submissionReadiness()
  assertTrue(state is SubmissionReadiness.StructurallyComplete)
  val complete=state as SubmissionReadiness.StructurallyComplete
  assertEquals("+8801712345678",complete.normalizedPayer)
  assertEquals(12500L,complete.amountMinor)
  assertEquals(1780000000000L,complete.originalTransactionEpochMillis)
 }
 @Test fun maskedSenderIsRejectedInsteadOfGuessed() {
  val state=full().copy(actualPayerNumber="*****5678").submissionReadiness()
  assertTrue(state is SubmissionReadiness.Incomplete)
  assertTrue((state as SubmissionReadiness.Incomplete).missingOrInvalid.contains(EvidenceGap.PAYER_NUMBER))
 }
 @Test fun observationTimeIsNeverInferredFromDeviceReceiveTime() {
  val state=full().copy(originalTransactionEpochMillis=null).submissionReadiness()
  assertTrue((state as SubmissionReadiness.Incomplete).missingOrInvalid.contains(EvidenceGap.ORIGINAL_TRANSACTION_TIME))
 }
 @Test fun receivingBindingIsRequiredAndMethodIsNotGuessed() {
  val state=full().copy(receivingSourceBindingId=null,method=null).submissionReadiness()
  assertEquals(setOf(EvidenceGap.RECEIVING_SOURCE_BINDING,EvidenceGap.METHOD),
   (state as SubmissionReadiness.Incomplete).missingOrInvalid)
 }
 @Test fun outgoingCashOutAndInvalidAmountsCannotBecomeReceiptEvidence() {
  val state=full().copy(isIncoming=false,amountMinor=-1).submissionReadiness()
  assertEquals(setOf(EvidenceGap.AMOUNT,EvidenceGap.INCOMING_DIRECTION),
   (state as SubmissionReadiness.Incomplete).missingOrInvalid)
 }
 @Test fun latinBengaliArabicNumeralNormalizationDoesNotGuessMaskedDigits() {
  assertEquals("+8801712345678",normalizeBangladeshMobile("+৮৮০১৭১২৩৪৫৬৭৮"))
  assertEquals("+8801712345678",normalizeBangladeshMobile("٠١٧١٢٣٤٥٦٧٨"))
  assertEquals(null,normalizeBangladeshMobile("017xxxxx678"))
  assertEquals(null,normalizeBangladeshMobile("12345678"))
 }
}
