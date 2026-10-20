package com.ekmivo.mobile.receipt

import org.junit.Assert.*
import org.junit.Test

class WorkspaceProductTransitionTest {
 private val missing=SetupHealthSnapshot(HealthLevel.MISSING,HealthLevel.OK,HealthLevel.MISSING,HealthLevel.UNKNOWN,true,false,false)
 @Test fun aiOnlySkipsSmsBatteryAndOemEvenOnSamsung(){
  assertEquals(listOf(SetupStep.NOTIFICATION),SetupPlan.steps(true,false))
  assertNull(SetupPlan.firstMissing(missing,false))
 }
 @Test fun enablingPaymentOnSamePhoneRequiresSmsImmediately(){
  assertEquals(SetupStep.SMS,SetupPlan.firstMissing(missing,true))
  val smsGranted=missing.copy(sms=HealthLevel.OK)
  assertEquals(SetupStep.BATTERY,SetupPlan.firstMissing(smsGranted,true))
  assertEquals(SetupStep.OEM,SetupPlan.firstMissing(smsGranted.copy(battery=HealthLevel.OK),true))
 }
 @Test fun switchingBackToAiDoesNotKeepOldPaymentWizard(){
  assertNotNull(SetupPlan.firstMissing(missing,true))
  assertNull(SetupPlan.firstMissing(missing,false))
 }
}
