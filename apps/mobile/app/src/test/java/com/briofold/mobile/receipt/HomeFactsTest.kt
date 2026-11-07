package com.briofold.mobile.receipt

import org.junit.Assert.*
import org.junit.Test

class HomeFactsTest {
 @Test fun forwardedReceiptIsNotServerVerification() {
  val sample="You have received Tk 500.00 from 01881114519. TrxID TEST at 01/10/2026 15:40"
  assertEquals("500.00",HomeContent.amount(sample))
  assertEquals("4519",HomeContent.mask(sample))
  assertEquals(null,HomeContent.amount("Delivery queued without payment evidence"))
  assertEquals("",HomeContent.mask("No sender in this receipt"))
 }
 @Test fun stateLabelsRepresentBackendAuthOutcome() {
  assertEquals("Disconnected",HomeContent.chip(ConnectionState.Revoked,false))
  assertEquals("Syncing",HomeContent.chip(ConnectionState.Degraded(DegradedReason.CHECKING),false))
  assertEquals("Live",HomeContent.chip(ConnectionState.Active,false))
  assertEquals("Forwarded",HomeContent.status(FeedState.SENT,false))
  assertEquals("Retry",HomeContent.status(FeedState.FAILED,false))
 }
}
