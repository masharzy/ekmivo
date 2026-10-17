package com.ekmivo.mobile.receipt

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptAuthInterceptorTest {
 @Test fun http401ClearsCredentialsExactlyOnceAndSignalsRevoke() {
  val cleared = mutableListOf<String>()
  var signalled = 0
  val interceptor = ReceiptAuthInterceptor(
   DeviceCredentialRevoker { cleared.add(it) },
   onRevoked = { signalled++ }
  )
  assertTrue(interceptor.onHttpStatus(401, "configuration", "phone-1"))
  assertEquals(listOf("phone-1"), cleared)
  assertEquals(1, signalled)
 }
 @Test fun http403RevokesOnlyAuthenticatedDeviceRequests() {
  val cleared=mutableListOf<String>()
  val interceptor=ReceiptAuthInterceptor(DeviceCredentialRevoker { cleared.add(it) }, {})
  assertFalse(interceptor.onHttpStatus(403,"claim","")) // invalid pairing code
  assertFalse(interceptor.onHttpStatus(403,"claim","phone-1"))
  assertTrue(interceptor.onHttpStatus(403,"phone-events","phone-1"))
  assertEquals(listOf("phone-1"),cleared)
 }
 @Test fun serverOutageAndClockSkewErrorsNeverDeleteCredentials() {
  val cleared=mutableListOf<String>()
  val interceptor=ReceiptAuthInterceptor(DeviceCredentialRevoker { cleared.add(it) }, {})
  for(status in listOf(408,409,422,429,500,502,503,504))
   assertFalse(interceptor.onHttpStatus(status,"configuration","phone-1"))
  assertTrue(cleared.isEmpty())
 }
}
