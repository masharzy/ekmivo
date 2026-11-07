package com.briofold.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.briofold.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

/**
 * Signed status check independent of the receipt upload WorkManager schedule.
 * A foreground notification alone is not a server heartbeat. No SMS, payer
 * number, account details or signing material is included in this payload.
 */
object DeviceHeartbeat {
 private const val PREF = "briofold_health_heartbeat"
 const val INTERVAL_MS = 120_000L

 suspend fun check(context: Context): Boolean = withContext(Dispatchers.IO) {
  val app=context.applicationContext
  val prefs=app.getSharedPreferences(PREF,Context.MODE_PRIVATE)
  val envelope=ReceiptStore(app).use { store ->
   if (!store.enabled() || store.isRevoked()) return@withContext false
   val identity=store.phone()?:store.enrollment()?:return@withContext false
   val physical=store.phone()!=null
   val id=identity.optString("id")
   val environment=identity.optString("environment")
   if (id.isBlank() || environment !in setOf("live","sandbox")) return@withContext false
   val sms=ContextCompat.checkSelfPermission(app,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED
   val ready=sms && SetupPlan.firstMissing(SetupHealth(app).inspect())==null &&
    (!physical || store.forwardVersion()>=0)
   val body=JSONObject()
    .put("enrollment_id",id)
    .put("environment",environment)
    .put("permission_ok",ready)
    .put("backlog",store.count())
    .put("overflow_count",store.overflowCount())
    .put("queue_error",store.queueError())
    .put("model",Build.MODEL)
    .put("app_version",BuildConfig.VERSION_NAME)
   Triple(if (physical) "phone-heartbeat" else "heartbeat",id,body.toString())
  }
  prefs.edit().putLong("last_attempt",System.currentTimeMillis()).apply()
  val success=runCatching {
   val response=ReceiptTransport.post(app,envelope.first,envelope.second,
    UUID.randomUUID().toString(),envelope.third.toByteArray(Charsets.UTF_8))
   response.first in 200..299
  }.getOrDefault(false)
  prefs.edit().putInt("last_result",if(success)200 else 0)
   .apply()
  if(success)prefs.edit().putLong("last_success",System.currentTimeMillis()).apply()
  success
 }

 fun lastSuccess(context:Context): Long? =
  context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getLong("last_success",0L)
   .takeIf{it>0L}
 fun lastAttempt(context:Context): Long? =
  context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getLong("last_attempt",0L)
   .takeIf{it>0L}
}
