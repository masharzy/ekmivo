package com.ekmivo.mobile.receipt

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptForwardPolicyTest{
 @Test fun typicalCandidateFromApprovedSenderIsForwardable(){
  assertTrue(ReceiptForwardPolicy.likelyPayment("bKash","You have received Tk 500 from 01712345678. TrxID ABC123 at 13:20"))
  assertTrue(ReceiptForwardPolicy.likelyPayment("NAGAD","Money Received. Amount: Tk 500 Sender: 01912345678"))
 }
 @Test fun unrelatedOtpSenderAndPersonalMessagesAreNotForwarded(){
  assertFalse(ReceiptForwardPolicy.likelyPayment("bKash","Your OTP is 123456. Do not share this code."))
  assertFalse(ReceiptForwardPolicy.likelyPayment("NAGAD","Your balance is Tk 5000."))
  assertFalse(ReceiptForwardPolicy.likelyPayment("UNKNOWN","You have received Tk 500 from 01712345678"))
 }
}
