package com.ekmivo.mobile.receipt

import org.junit.Assert.assertEquals
import org.junit.Test

class ConnectionStateTest {
 @Test fun stateSequenceTransitionsWithoutTouchingPresentation() {
  val pairing = ConnectionMachine.reduce(ConnectionState.Unpaired, ConnectionEvent.BeginPairing)
  assertEquals(ConnectionState.Pairing, pairing)
  val awaiting = ConnectionMachine.reduce(pairing, ConnectionEvent.PairedAwaitingCheck)
  assertEquals(ConnectionState.Degraded(DegradedReason.CHECKING), awaiting)
  val online = ConnectionMachine.reduce(awaiting, ConnectionEvent.ServerAccepted)
  assertEquals(ConnectionState.Active, online)
  val partial = ConnectionMachine.reduce(online,
   ConnectionEvent.MissingPermissions(setOf(RequiredPermission.SMS)))
  assertEquals(ConnectionState.PermissionsIncomplete(setOf(RequiredPermission.SMS)), partial)
  val offline = ConnectionMachine.reduce(partial,
   ConnectionEvent.TransportFailure(DegradedReason.NETWORK_TIMEOUT))
  assertEquals(ConnectionState.Degraded(DegradedReason.NETWORK_TIMEOUT), offline)
  assertEquals(ConnectionState.Active, ConnectionMachine.reduce(offline, ConnectionEvent.ServerAccepted))
 }
 @Test fun transientFailuresNeverRequireRePair() {
  val result = ConnectionMachine.reduce(ConnectionState.Active,
   ConnectionEvent.TransportFailure(DegradedReason.SERVER_UNAVAILABLE))
  assertEquals(ConnectionState.Degraded(DegradedReason.SERVER_UNAVAILABLE), result)
 }
 @Test fun revokeIsStickyUntilNewPairingOrExplicitDisconnect() {
  val revoked = ConnectionMachine.reduce(ConnectionState.Active, ConnectionEvent.Unauthorized)
  assertEquals(ConnectionState.Revoked, revoked)
  assertEquals(revoked, ConnectionMachine.reduce(revoked, ConnectionEvent.ServerAccepted))
  assertEquals(ConnectionState.Pairing, ConnectionMachine.reduce(revoked, ConnectionEvent.BeginPairing))
  assertEquals(ConnectionState.Unpaired, ConnectionMachine.reduce(revoked, ConnectionEvent.Disconnected))
 }
}
