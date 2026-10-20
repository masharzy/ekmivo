package com.ekmivo.mobile.receipt

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.ekmivo.mobile.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * User-visible forwarding service, only started from a foreground app action.
 * WorkManager and the encrypted outbox remain authoritative for reliable
 * retries; Android (especially 15+) may time-limit dataSync FGS usage.
 */
class ReceiptForwardingService:Service() {
 private val channel="ekmivo_receipt_forwarding"
 private val heartbeatScope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private var heartbeatJob:Job?=null
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onCreate(){
  super.onCreate()
  val notifications=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  notifications.createNotificationChannel(
   NotificationChannel(channel,"SMS forwarding",NotificationManager.IMPORTANCE_LOW).apply{
    description="Shows Ekmivo SMS forwarding status"
    setShowBadge(false)
   }
  )
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(!WorkspaceAccessRepository.paymentAllowed(this)){stopSelf();return START_NOT_STICKY}

  val allowed=ReceiptStore(applicationContext).use{it.enabled() && !it.isRevoked()}
  if(!allowed) { stopSelf();return START_NOT_STICKY }
  val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java)
   .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
   PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val n:Notification=NotificationCompat.Builder(this,channel)
   .setSmallIcon(android.R.drawable.stat_notify_sync)
   .setContentTitle("Ekmivo")
   .setContentText("SMS forwarding is running")
   .setContentIntent(open)
   .setOngoing(true)
   .setOnlyAlertOnce(true)
   .setPriority(NotificationCompat.PRIORITY_LOW)
   .build()
  if(Build.VERSION.SDK_INT>=29)startForeground(1204,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
  else startForeground(1204,n)
  ReceiptSyncWorker.scheduleNow(applicationContext)
  if(heartbeatJob?.isActive!=true){
   heartbeatJob=heartbeatScope.launch {
    // Foreground service is real work: report signed health, not only notification.
    while(isActive){
     val allowed=runCatching{
      ReceiptStore(applicationContext).use { it.enabled() && !it.isRevoked() }
     }.getOrDefault(false)
     if(!allowed){stopSelf();break}
     DeviceHeartbeat.check(applicationContext)
     delay(DeviceHeartbeat.INTERVAL_MS)
    }
   }
  }
  return START_STICKY
 }
 override fun onDestroy(){
  heartbeatScope.cancel()
  super.onDestroy()
 }
 override fun onTimeout(startId:Int,fgsType:Int) {
  // Android 15 may limit dataSync foreground service time. WorkManager and
  // encrypted outbox continue to handle retries without the foreground service.
  runCatching {
   ReceiptStore(applicationContext).use {
    it.setQueueError("FOREGROUND_SERVICE_TIME_LIMIT")
   }
   ReceiptSyncWorker.scheduleNow(applicationContext)
  }
  stopSelf(startId)
 }
 companion object {
  /** Never launch from the boot broadcast (Android background FGS limits). */
  fun startFromVisibleApp(context:Context):Boolean = runCatching {
   ContextCompat.startForegroundService(context.applicationContext,
    Intent(context.applicationContext,ReceiptForwardingService::class.java))
  }.isSuccess
  fun stop(context:Context){
   context.applicationContext.stopService(Intent(context,ReceiptForwardingService::class.java))
  }
 }
}
