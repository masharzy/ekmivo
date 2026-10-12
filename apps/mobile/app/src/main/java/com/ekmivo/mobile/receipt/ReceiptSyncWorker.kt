package com.ekmivo.mobile.receipt

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.BackoffPolicy
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import com.ekmivo.mobile.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

object ReceiptTransport {
 private val client=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(12,TimeUnit.SECONDS).build()
 fun post(action:String,deviceID:String,eventID:String,bytes:ByteArray):Pair<Int,String>{
  val base=BuildConfig.API_BASE_URL.trimEnd('/');require(base.startsWith("https://")){"HTTPS API not configured"}
  val path="/v1/device/$action";val timestamp=(System.currentTimeMillis()/1000).toString()
  val signature=AndroidKeystoreSigner("ekmivo-receipt-device").signCanonical(DeviceSignatureCanonicalizer.canonical("POST",path,timestamp,eventID,bytes))
  val request=Request.Builder().url(base+path).header("X-Ekmivo-Device-ID",deviceID).header("X-Ekmivo-Event-ID",eventID).header("X-Ekmivo-Timestamp",timestamp).header("X-Ekmivo-Signature",signature).post(bytes.toRequestBody("application/json".toMediaType())).build()
  return client.newCall(request).execute().use{it.code to (it.body?.string()?:"")}
 }
}
class ReceiptSyncWorker(context:Context,params:WorkerParameters):Worker(context,params){
 override fun doWork():Result {
  return try { ReceiptStore(applicationContext).use {store->
   var phone=store.phone()
   val legacy=store.enrollment()
   if(phone==null && legacy!=null){
    // One-time seamless upgrade of an already claimed legacy enrollment.
    // Server migration seeds a physical parent with the SAME ID and key.
    val info=JSONObject().put("enrollment_id",legacy.getString("id"))
      .put("environment",legacy.getString("environment"))
    val probe=ReceiptTransport.post("configuration",legacy.getString("id"),
      UUID.randomUUID().toString(),info.toString().toByteArray())
    if(probe.first==200){
     store.adoptLegacyPhone(JSONObject(probe.second))
     phone=store.phone()
    }
    // An old backend may not have the additive migration yet. In that case
    // continue legacy signed intake and preserve its encrypted queue.
   }
   val identity=phone?:legacy?:return Result.success()
   if(!store.enabled())return Result.success()
   val parentId=identity.getString("id")
   val environment=identity.getString("environment")
   if(phone!=null){
    val payload=JSONObject().put("enrollment_id",parentId).put("environment",environment)
    val config=ReceiptTransport.post("configuration",parentId,UUID.randomUUID().toString(),payload.toString().toByteArray())
    if(config.first==403){store.setQueueError("DEVICE_AUTHORIZATION_DENIED");store.pause(parentId);return Result.failure()}
    if(config.first !in 200..299)return Result.retry()
    store.savePhoneConfiguration(JSONObject(config.second))
   }
   val sources=store.collectionEnrollments()
   val permission=if(phone!=null) {
    store.forwardVersion()>=0 &&
     ContextCompat.checkSelfPermission(applicationContext,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED
   } else sources.isNotEmpty()&&sources.all { entry->
    if(entry.optString("binding").startsWith("sms:"))
     ContextCompat.checkSelfPermission(applicationContext,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED
    else NotificationManagerCompat.getEnabledListenerPackages(applicationContext)
     .contains(applicationContext.packageName)
   }
   val health=JSONObject().put("enrollment_id",parentId).put("environment",environment)
    .put("permission_ok",permission).put("backlog",store.count())
    .put("overflow_count",store.overflowCount()).put("queue_error",store.queueError())
    .put("model",Build.MODEL).put("app_version",BuildConfig.VERSION_NAME)
   val heartbeat=ReceiptTransport.post(if(phone!=null)"phone-heartbeat" else "heartbeat",
    parentId,UUID.randomUUID().toString(),health.toString().toByteArray())
   if(heartbeat.first==403){store.setQueueError("DEVICE_AUTHORIZATION_DENIED");store.pause(parentId);return Result.failure()}
   if(heartbeat.first !in 200..299)return Result.retry()
   repeat(5){
    val next=store.next()?:return Result.success()
    val queued=JSONObject(next.second.toString(Charsets.UTF_8))
    val boundID=queued.optString("enrollment_id")
    if(boundID.isEmpty()) {store.setQueueError("QUEUED_ASSOCIATION_UNKNOWN");return Result.failure()}
    // Send with the ORIGINAL immutable enrollment ID from encrypted outbox.
    // Never replace it with a newly selected account.
    val action=if(queued.optBoolean("physical_forward"))"phone-events" else "events"
    val response=ReceiptTransport.post(action,boundID,next.first,next.second)
    if(response.first==403){
     store.setQueueError("QUEUED_ASSOCIATION_REVOKED")
     return Result.failure() // Keep the encrypted evidence until operator recovery.
    }
    if(response.first in listOf(400,409,413,422)){
     store.setQueueError("INGEST_REJECTED_"+response.first)
     return Result.failure()
    }
    if(response.first !in 200..299)return Result.retry()
    if(JSONObject(response.second).optString("ack")!="durable"){
     store.setQueueError("DURABLE_ACK_MISSING");return Result.retry()
    }
    store.acknowledge(next.first)
    store.setQueueError("")
   }
   if(store.count()>0)Result.retry() else Result.success()
  }}catch(_:Exception){
   ReceiptStore(applicationContext).use{it.setQueueError("QUEUE_OR_TRANSPORT_ERROR")}
   Result.retry()
  }
 }
 companion object {
  fun schedule(context:Context){
   val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
   val manager=WorkManager.getInstance(context)
   manager.enqueueUniqueWork("receipt-sync",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<ReceiptSyncWorker>().setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build())
   manager.enqueueUniquePeriodicWork("receipt-health",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<ReceiptSyncWorker>(15,TimeUnit.MINUTES).setConstraints(constraints).build())
  }
 }
}
