package com.ekmivo.mobile.receipt

import org.junit.Assert.*
import org.junit.Test

class SetupPlanTest {
 private fun snap(
  sms: HealthLevel=HealthLevel.OK,
  notifications: HealthLevel=HealthLevel.OK,
  battery: HealthLevel=HealthLevel.OK,
  samsung: Boolean=false,
  acknowledged: Boolean=false,
  backlog: Boolean=false
 )=SetupHealthSnapshot(sms,notifications,battery,
  if(samsung)HealthLevel.UNKNOWN else HealthLevel.OK,
  samsung,acknowledged,backlog)

 @Test fun requestsAreOrderedAndPreviouslyGrantedStepsSkipped() {
  assertEquals(SetupStep.SMS,SetupPlan.firstMissing(snap(sms=HealthLevel.MISSING,
   notifications=HealthLevel.MISSING,battery=HealthLevel.MISSING)))
  assertEquals(SetupStep.NOTIFICATION,SetupPlan.firstMissing(snap(
   notifications=HealthLevel.MISSING,battery=HealthLevel.MISSING)))
  assertEquals(SetupStep.BATTERY,SetupPlan.firstMissing(snap(battery=HealthLevel.MISSING)))
  assertNull(SetupPlan.firstMissing(snap()))
 }
 @Test fun samsungOnlyOemStepIsNeverFakedAsVerified() {
  assertEquals(listOf(SetupStep.SMS,SetupStep.NOTIFICATION,SetupStep.BATTERY),
   SetupPlan.steps(false))
  assertEquals(4,SetupPlan.steps(true).size)
  assertEquals(SetupStep.OEM,SetupPlan.firstMissing(snap(samsung=true)))
  assertNull(SetupPlan.firstMissing(snap(samsung=true,acknowledged=true)))
  assertEquals(HealthLevel.UNKNOWN,snap(samsung=true,acknowledged=true).oem)
 }
 @Test fun deliveryWarningsSurfaceEvenWhenPermissionsAreGranted() {
  assertTrue(snap(backlog=true).needsAttention)
  assertFalse(snap().needsAttention)
  assertTrue(snap(battery=HealthLevel.UNKNOWN).needsAttention)
 }
 @Test fun adoptingPaymentRequestsNewPermissionsButAIOnlyDoesNotReadSMS(){
  val noGrants=snap(sms=HealthLevel.MISSING,notifications=HealthLevel.MISSING,battery=HealthLevel.MISSING,samsung=true)
  assertEquals(listOf(SetupStep.NOTIFICATION),SetupPlan.steps(true,false))
  assertEquals(SetupStep.NOTIFICATION,SetupPlan.firstMissing(noGrants,false))
  val notificationGranted=noGrants.copy(notification=HealthLevel.OK)
  assertNull(SetupPlan.firstMissing(notificationGranted,false))
  assertEquals(SetupStep.SMS,SetupPlan.firstMissing(notificationGranted,true))
 }
}
