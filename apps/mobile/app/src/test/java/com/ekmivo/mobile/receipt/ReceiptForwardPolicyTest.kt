package com.ekmivo.mobile.receipt

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptForwardPolicyTest {
 private val server = setOf("bKash", "NAGAD", "CustomPay")
 @Test fun paymentCandidatesAreAllowedOnlyByServerConfiguration() {
  assertTrue(ReceiptForwardPolicy.likelyPayment("bKash",
   "You have received Tk 500 from 01712345678. TrxID ABC123 at 13:20", server))
  assertTrue(ReceiptForwardPolicy.likelyPayment("NAGAD",
   "Money Received. Amount: Tk 500 Sender: 01912345678", server))
  assertTrue(ReceiptForwardPolicy.likelyPayment("CustomPay",
   "You have received Tk 250 from 01712345678. TrxID D25", server))
  assertFalse(ReceiptForwardPolicy.likelyPayment("Rocket",
   "You have received Tk 250 from 01712345678. TrxID D25", server))
 }
 @Test fun otpLoginPersonalSmsNeverForwardedEvenFromAllowedSource() {
  assertFalse(ReceiptForwardPolicy.likelyPayment("bKash",
   "Your OTP is 123456. Do not share this code.", server))
  assertFalse(ReceiptForwardPolicy.likelyPayment("CustomPay",
   "You received Tk 500 from 01712345678, your login code is 99345", server))
  assertFalse(ReceiptForwardPolicy.likelyPayment("NAGAD", "Your balance is Tk 5000.", server))
  assertFalse(ReceiptForwardPolicy.likelyPayment("UNKNOWN",
   "You have received Tk 500 from 01712345678", server))
  assertFalse(ReceiptForwardPolicy.likelyPayment("bKash",
   "You have received Tk 500 from 01712345678", emptySet()))
 }
}
