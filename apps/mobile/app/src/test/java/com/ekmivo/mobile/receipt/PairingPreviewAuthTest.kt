package com.ekmivo.mobile.receipt

import org.junit.Assert.*
import org.junit.Test

class PairingPreviewAuthTest {
 @Test fun rejectedPreviewCannotRevokeExistingPairing() {
  for(status in listOf(401,403)) {
   assertFalse(DeviceAuthPolicy.revoked(status,"pairing-preview"))
   assertFalse(DeviceAuthPolicy.revoked(status,"claim"))
   assertTrue(DeviceAuthPolicy.revoked(status,"configuration"))
  }
 }
}
