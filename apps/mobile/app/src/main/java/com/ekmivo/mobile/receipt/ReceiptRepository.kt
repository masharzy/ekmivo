package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.lang.ref.WeakReference

/** Persisted credential control can be faked in ordinary JVM unit tests. */
fun interface DeviceCredentialRevoker {
 fun revoke(deviceId: String)
}

class ReceiptAuthInterceptor(
 private val revoker: DeviceCredentialRevoker,
 private val onRevoked: () -> Unit
) {
 fun onHttpStatus(status: Int, action: String, deviceId: String): Boolean {
  if (!DeviceAuthPolicy.revoked(status, action) || deviceId.isBlank()) return false
  revoker.revoke(deviceId) // idempotent; holds encrypted undelivered evidence
  onRevoked()
  return true
 }
}

/**
 * App-scoped state source. This is not a payment-success detector: signed
 * configuration/heartbeat 2xx means connected, not that money was confirmed.
 * Collection is only resumed after the server approves the same enrollment.
 */
class ReceiptRepository private constructor(private val context: Context) {
 private val mutable = MutableStateFlow<ConnectionState>(bootstrap())
 val state: StateFlow<ConnectionState> = mutable

 private val auth = ReceiptAuthInterceptor(
  DeviceCredentialRevoker { deviceId ->
   ReceiptStore(context).use { it.revokeCredentials(deviceId) }
   ReceiptForwardingService.stop(context)
  },
  onRevoked = { mutable.value = ConnectionState.Revoked }
 )

 private fun bootstrap(): ConnectionState = ReceiptStore(context).use { store ->
  when {
   store.isRevoked() -> ConnectionState.Revoked
   store.phone() == null && store.enrollment() == null -> ConnectionState.Unpaired
   !store.wasServerAccepted() -> ConnectionState.Degraded(DegradedReason.CHECKING)
   else -> {
    val missing = permissions()
    if (missing.isEmpty()) ConnectionState.Active
    else ConnectionState.PermissionsIncomplete(missing)
   }
  }
 }

 fun beginPairing() = dispatch(ConnectionEvent.BeginPairing)
 fun pairedAwaitingCheck() = dispatch(ConnectionEvent.PairedAwaitingCheck)

 fun dispatch(event: ConnectionEvent) {
  mutable.value = ConnectionMachine.reduce(mutable.value, event)
 }

 fun permissions(): Set<RequiredPermission> {
  val missing = mutableSetOf<RequiredPermission>()
  val payment=WorkspaceAccessRepository.paymentAllowed(context)
  if (payment && ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED)
   missing += RequiredPermission.SMS
  val health=SetupHealth(context).refresh()
  if(health.notification!=HealthLevel.OK) missing+=RequiredPermission.NOTIFICATIONS
  if(payment&&health.battery!=HealthLevel.OK) missing+=RequiredPermission.BATTERY
  if(payment&&health.samsung&&!health.oemGuideAcknowledged) missing+=RequiredPermission.OEM
  return missing
 }

 fun onTransport(status: Int, action: String, deviceId: String) {
  if (auth.onHttpStatus(status, action, deviceId)) return
  if (action == "claim" || action == "pairing-preview" || action == "workspace-state") return // Bad pairing code is NOT device revocation.
  when {
   status in 200..299 && (action == "configuration" || action == "phone-heartbeat" || action == "heartbeat") -> {
    ReceiptStore(context).use { it.markServerAccepted(deviceId) }
    dispatch(ConnectionEvent.MissingPermissions(permissions()))
   }
   status >= 500 -> dispatch(ConnectionEvent.TransportFailure(DegradedReason.SERVER_UNAVAILABLE))
  }
 }

 fun onTransportException(error: Throwable) {
  val reason = when (error) {
   is java.net.UnknownHostException, is java.net.ConnectException -> DegradedReason.OFFLINE
   is java.net.SocketTimeoutException, is java.io.InterruptedIOException -> DegradedReason.NETWORK_TIMEOUT
   else -> DegradedReason.SERVER_UNAVAILABLE
  }
  dispatch(ConnectionEvent.TransportFailure(reason))
 }

 companion object {
  @Volatile private var instance: ReceiptRepository? = null
  fun get(context: Context): ReceiptRepository =
   instance ?: synchronized(this) {
    instance ?: ReceiptRepository(context.applicationContext).also { instance = it }
   }
 }
}
