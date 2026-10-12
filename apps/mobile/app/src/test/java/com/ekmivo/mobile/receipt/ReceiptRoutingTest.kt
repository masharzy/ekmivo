package com.ekmivo.mobile.receipt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptRoutingTest{
 private val b=ReceiptRoute("account-b","BKASH","sms:1","^Received 500 from [+]8801712345678$")
 private val n=ReceiptRoute("account-n","NAGAD","sms:2","^Received 250 from [+]8801912345678$")
 @Test fun onePhysicalPhoneSelectsTwoReceivingAccountsWithoutAnotherPair(){
  val routes=listOf(b,n)
  assertEquals(RouteDecision.Selected("account-b"),ReceiptRouting.choose(routes,"BKASH","sms:1","Received 500 from +8801712345678"))
  assertEquals(RouteDecision.Selected("account-n"),ReceiptRouting.choose(routes,"NAGAD","sms:2","Received 250 from +8801912345678"))
 }
 @Test fun wrongSimSourceOrUnrelatedOtpIsNeverRouted(){
  assertEquals(RouteDecision.None,ReceiptRouting.choose(listOf(b,n),"BKASH","sms:2","Received 500 from +8801712345678"))
  assertEquals(RouteDecision.None,ReceiptRouting.choose(listOf(b,n),"OTP","sms:1","Your OTP is 123456"))
 }
 @Test fun duplicateSourceMappingIsAmbiguousRatherThanFirstMatch(){
  assertEquals(RouteDecision.Ambiguous,ReceiptRouting.choose(listOf(b,b.copy(enrollmentId="account-c")),"BKASH","sms:1","Received 500 from +8801712345678"))
 }
 @Test fun queuedReceiptNeverChangesOriginalDestination(){
  assertEquals(null,ReceiptRouting.queuedEnrollmentId("account-b",setOf("account-n")))
  assertEquals("account-b",ReceiptRouting.queuedEnrollmentId("account-b",setOf("account-b","account-n")))
 }
 @Test fun parserSourceIsNotTheActualPayer(){
  assertTrue(b.source!=" +8801712345678".trim())
 }
}
