package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

enum class HealthLevel { OK, MISSING, UNKNOWN }
enum class SetupStep { SMS, NOTIFICATION, BATTERY, OEM }

/** OEM power policies cannot be queried from public Android APIs. */
data class SetupHealthSnapshot(
 val sms: HealthLevel,
 val notification: HealthLevel,
 val battery: HealthLevel,
 val oem: HealthLevel,
 val samsung: Boolean,
 val oemGuideAcknowledged: Boolean,
 val backlogError: Boolean
) {
 fun level(step: SetupStep): HealthLevel = when(step) {
  SetupStep.SMS -> sms
  SetupStep.NOTIFICATION -> notification
  SetupStep.BATTERY -> battery
  SetupStep.OEM -> oem
 }
 val needsAttention: Boolean get() = sms != HealthLevel.OK ||
  notification != HealthLevel.OK || battery != HealthLevel.OK ||
  (samsung && !oemGuideAcknowledged) || backlogError
}

/** Pure Phase-3 transition policy; OEM "acknowledged" is not "verified OK". */
object SetupPlan {
 fun steps(samsung: Boolean, payments:Boolean=true) =
  if(!payments) listOf(SetupStep.NOTIFICATION) else
  if(samsung) listOf(SetupStep.SMS, SetupStep.NOTIFICATION, SetupStep.BATTERY, SetupStep.OEM)
  else listOf(SetupStep.SMS, SetupStep.NOTIFICATION, SetupStep.BATTERY)

 fun firstMissing(snapshot: SetupHealthSnapshot,payments:Boolean=true): SetupStep? =
  steps(snapshot.samsung,payments).firstOrNull { step ->
   if(step == SetupStep.OEM) !snapshot.oemGuideAcknowledged
   else snapshot.level(step) != HealthLevel.OK
  }
}

class SetupHealth(private val context: Context) {
 private val preferences = context.applicationContext.getSharedPreferences("ekmivo_setup_health",Context.MODE_PRIVATE)
 private val current = MutableStateFlow(inspect())
 val state: StateFlow<SetupHealthSnapshot> = current

 fun inspect(): SetupHealthSnapshot {
  val app = context.applicationContext
  val sms = if (ContextCompat.checkSelfPermission(app,Manifest.permission.RECEIVE_SMS) ==
   PackageManager.PERMISSION_GRANTED) HealthLevel.OK else HealthLevel.MISSING
  val notifications = if (Build.VERSION.SDK_INT < 33 ||
   ContextCompat.checkSelfPermission(app,Manifest.permission.POST_NOTIFICATIONS) ==
   PackageManager.PERMISSION_GRANTED) HealthLevel.OK else HealthLevel.MISSING
  val power = app.getSystemService(Context.POWER_SERVICE) as? PowerManager
  val battery = if (power?.isIgnoringBatteryOptimizations(app.packageName) == true)
   HealthLevel.OK else if(power == null) HealthLevel.UNKNOWN else HealthLevel.MISSING
  val samsung = Build.MANUFACTURER.lowercase(Locale.ROOT).contains("samsung")
  val acknowledged = preferences.getBoolean("samsung_guidance_acknowledged",false)
  // A checkmark cannot prove a vendor-specific battery setting has changed.
  val oem = if(samsung) HealthLevel.UNKNOWN else HealthLevel.OK
  val backlogWarning = runCatching {
   ReceiptStore(app).use {
    it.count() > 0 && (it.queueError().isNotBlank() ||
     (it.oldestPendingAgeMs() ?: 0L) >= 10L*60L*1000L)
   }
  }.getOrDefault(false)
  return SetupHealthSnapshot(sms, notifications, battery, oem, samsung, acknowledged, backlogWarning)
 }
 fun refresh(): SetupHealthSnapshot = inspect().also { current.value = it }
 fun acknowledgeSamsung(): Boolean {
  if(!current.value.samsung) return false
  val saved = preferences.edit().putBoolean("samsung_guidance_acknowledged",true).commit()
  if(saved) refresh()
  return saved
 }
 fun noteDeliveryGap() {
  preferences.edit().putBoolean("samsung_guidance_acknowledged",false).apply()
  refresh()
 }
 fun needsWizard(): Boolean {
  val snapshot = refresh()
  return SetupPlan.firstMissing(snapshot) != null
 }
}
