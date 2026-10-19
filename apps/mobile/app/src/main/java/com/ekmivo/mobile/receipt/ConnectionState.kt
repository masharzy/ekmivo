package com.ekmivo.mobile.receipt

/**
 * Phase 1: immutable connection states. Compose observes the repository in a
 * later phase; no view is coupled to this reducer.
 */
sealed interface ConnectionState {
 data object Unpaired : ConnectionState
 data object Pairing : ConnectionState
 data object Active : ConnectionState
 data class Degraded(val reason: DegradedReason) : ConnectionState
 data class PermissionsIncomplete(val missing: Set<RequiredPermission>) : ConnectionState
 data object Revoked : ConnectionState
}

enum class RequiredPermission { SMS, NOTIFICATIONS, BATTERY, OEM }
enum class DegradedReason { CHECKING, OFFLINE, NETWORK_TIMEOUT, SERVER_UNAVAILABLE, BACKLOG }

sealed interface ConnectionEvent {
 data object BeginPairing : ConnectionEvent
 data object PairedAwaitingCheck : ConnectionEvent
 data object ServerAccepted : ConnectionEvent
 data class MissingPermissions(val missing: Set<RequiredPermission>) : ConnectionEvent
 data class TransportFailure(val reason: DegradedReason) : ConnectionEvent
 data object Unauthorized : ConnectionEvent
 data object Disconnected : ConnectionEvent
}

/** Pure deterministic transitions, easy to test without Android. */
object ConnectionMachine {
 fun reduce(current: ConnectionState, event: ConnectionEvent): ConnectionState {
  if (event is ConnectionEvent.Unauthorized) return ConnectionState.Revoked
  if (event is ConnectionEvent.Disconnected) return ConnectionState.Unpaired
  if (current is ConnectionState.Revoked && event !is ConnectionEvent.BeginPairing)
   return current
  return when (event) {
   ConnectionEvent.BeginPairing -> ConnectionState.Pairing
   ConnectionEvent.PairedAwaitingCheck -> ConnectionState.Degraded(DegradedReason.CHECKING)
   ConnectionEvent.ServerAccepted -> ConnectionState.Active
   is ConnectionEvent.MissingPermissions -> if (event.missing.isEmpty()) ConnectionState.Active
      else ConnectionState.PermissionsIncomplete(event.missing)
   is ConnectionEvent.TransportFailure -> when (current) {
    ConnectionState.Unpaired -> current
    ConnectionState.Pairing -> current
    else -> ConnectionState.Degraded(event.reason)
   }
   ConnectionEvent.Unauthorized, ConnectionEvent.Disconnected -> error("Handled before transition")
  }
 }
}

/** One canonical policy for all signed, authenticated device HTTP responses. */
object DeviceAuthPolicy {
 fun revoked(status: Int, action: String): Boolean =
  action != "claim" && action != "pairing-preview" && action != "inbox" && (status == 401 || status == 403)
}
