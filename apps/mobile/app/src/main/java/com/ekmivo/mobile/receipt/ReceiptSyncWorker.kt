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
import androidx.work.OutOfQuotaPolicy
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
 fun post(context:Context,action:String,deviceID:String,eventID:String,bytes:ByteArray):Pair<Int,String>{
  val base=BuildConfig.API_BASE_URL.trimEnd('/');require(base.startsWith("https://")){"HTTPS API not configured"}
  val path="/v1/device/$action";val timestamp=(System.currentTimeMillis()/1000).toString()
  val signature=AndroidKeystoreSigner("ekmivo-receipt-device").signCanonical(DeviceSignatureCanonicalizer.canonical("POST",path,timestamp,eventID,bytes))
  val request=Request.Builder().url(base+path).header("X-Ekmivo-Device-ID",deviceID).header("X-Ekmivo-Event-ID",eventID).header("X-Ekmivo-Timestamp",timestamp).header("X-Ekmivo-Signature",signature).post(bytes.toRequestBody("application/json".toMediaType())).build()
  return try{
   val result=client.newCall(request).execute().use{it.code to (it.body?.string()?:"")}
   ReceiptRepository.get(context).onTransport(result.first,action,deviceID)
   result
  }catch(e:Exception){
   ReceiptRepository.get(context).onTransportException(e)
   throw e
  }
 }
}
class ReceiptSyncWorker(context:Context,params:WorkerParameters):Worker(context,params){
 override fun doWork():Result {
  var inFlightId:String?=null
  return try { ReceiptStore(applicationContext).use {store->
   var phone=store.phone()
   val legacy=store.enrollment()
   if(phone==null && legacy!=null){
    // One-time seamless upgrade of an already claimed legacy enrollment.
    // Server migration seeds a physical parent with the SAME ID and key.
    val info=JSONObject().put("enrollment_id",legacy.getString("id"))
      .put("environment",legacy.getString("environment"))
    val probe=ReceiptTransport.post(applicationContext,"configuration",legacy.getString("id"),
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
   val stage=ReceiptStageRepository(applicationContext)
   // Room was committed first. Recover crash/interruption gaps BEFORE upload.
   stage.recover(store)
   val parentId=identity.getString("id")
   val environment=identity.getString("environment")
   // Transport first: avoid preflight configuration/heartbeat network delays.
   // Each signed receipt is independently authenticated by Go; revocation
   // and stale source configuration still fail closed on the server.
   for(batchIndex in 0 until 30){
    val next=store.nextEligible()?:break
    val queued=JSONObject(next.second.toString(Charsets.UTF_8))
    val boundID=queued.optString("enrollment_id")
    if(boundID.isEmpty()) {store.setQueueError("QUEUED_ASSOCIATION_UNKNOWN");return Result.failure()}
    // A re-pair to another workspace must NEVER replay held signed evidence.
    if(!store.ownsEnrollment(boundID)){
     store.setQueueError("ORIGINAL_ENROLLMENT_REQUIRED")
     stage.failed(next.first,"ORIGINAL_ENROLLMENT_REQUIRED")
     return Result.failure()
    }
    // Send with the ORIGINAL immutable enrollment ID from encrypted outbox.
    // Never replace it with a newly selected account.
    val action=if(queued.optBoolean("physical_forward"))"phone-events" else "events"
    inFlightId=next.first
    stage.sending(next.first)
    val response=ReceiptTransport.post(applicationContext,action,boundID,next.first,next.second)
    if(response.first==401 || response.first==403){
     store.setQueueError("QUEUED_ASSOCIATION_REVOKED")
     stage.failed(next.first,"QUEUED_ASSOCIATION_REVOKED")
     return Result.failure() // Keep the encrypted evidence until operator recovery.
    }
    if(response.first in listOf(400,409,413,422)){
     store.setQueueError("INGEST_REJECTED_"+response.first)
     stage.failed(next.first,"INGEST_REJECTED_"+response.first)
     return Result.failure()
    }
    if(response.first !in 200..299){
     // HTTP failures used to be silently retried while UI always blamed
     // the network. Persist a SAFE status code without SMS/customer data.
     store.setQueueError("FORWARD_HTTP_"+response.first)
     stage.failed(next.first,"FORWARD_HTTP_"+response.first)
     return Result.retry()
    }
    if(JSONObject(response.second).optString("ack")!="durable"){
     store.setQueueError("DURABLE_ACK_MISSING")
     stage.failed(next.first,"DURABLE_ACK_MISSING")
     return Result.retry()
    }
    store.acknowledge(next.first)
    stage.acknowledge(next.first)
    inFlightId=null
    store.setQueueError("")
   }
   if(phone!=null){
    val payload=JSONObject().put("enrollment_id",parentId).put("environment",environment)
    val config=ReceiptTransport.post(applicationContext,"configuration",parentId,UUID.randomUUID().toString(),payload.toString().toByteArray())
    if(config.first==401 || config.first==403){
     store.setQueueError("DEVICE_AUTHORIZATION_DENIED");return Result.failure()
    }
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
   val heartbeat=ReceiptTransport.post(applicationContext,if(phone!=null)"phone-heartbeat" else "heartbeat",
    parentId,UUID.randomUUID().toString(),health.toString().toByteArray())
   if(heartbeat.first==401 || heartbeat.first==403){
    store.setQueueError("DEVICE_AUTHORIZATION_DENIED");return Result.failure()
   }
   if(heartbeat.first !in 200..299)return Result.retry()

   if(store.nextEligible()!=null){
    // Only schedule immediate next batches for eligible receipts.
    // Another shop's held evidence remains encrypted, never resent or lost.
    // Queue the next constrained batch instead of exponential retry backoff.
    continueQueued(applicationContext)
    Result.success()
   }else Result.success()
  }}catch(e:Exception){
   val safe=when(e){
    is java.net.UnknownHostException,is java.net.ConnectException->"NETWORK_UNAVAILABLE"
    is java.net.SocketTimeoutException,is java.io.InterruptedIOException->"NETWORK_TIMEOUT"
    is javax.net.ssl.SSLException->"TLS_CONNECTION_ERROR"
    else->"QUEUE_OR_TRANSPORT_ERROR"
   }
   inFlightId?.let{ id ->
    runCatching{ReceiptStageRepository(applicationContext).failed(id,safe)}
   }
   ReceiptStore(applicationContext).use{
    it.setQueueError(safe)
   }
   Result.retry()
  }
 }
 companion object {
  private fun request(context:Context,expedited:Boolean):androidx.work.OneTimeWorkRequest{
   val constraint=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
   val builder=OneTimeWorkRequestBuilder<ReceiptSyncWorker>()
    .setConstraints(constraint)
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS)
   if(expedited && Build.VERSION.SDK_INT>=31)builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
   return builder.build()
  }

  /** A fresh SMS/boot/resume/manual retry MUST wake a stalled backoff chain.
   * REPLACE only on urgent wake; ordinary scheduling preserves a running upload.
   * Server ACKs are idempotent per immutable event ID if cancellation races.
   */
  fun scheduleNow(context:Context){
   val manager=WorkManager.getInstance(context)
   manager.enqueueUniqueWork("receipt-sync",ExistingWorkPolicy.REPLACE,request(context,true))
   schedulePeriodic(context)
  }
  fun schedule(context:Context){
   WorkManager.getInstance(context).enqueueUniqueWork(
    "receipt-sync",ExistingWorkPolicy.KEEP,request(context,false))
   schedulePeriodic(context)
  }
  private fun schedulePeriodic(context:Context){
   val constraint=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
   WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "receipt-health",ExistingPeriodicWorkPolicy.KEEP,
    PeriodicWorkRequestBuilder<ReceiptSyncWorker>(15,TimeUnit.MINUTES)
     .setConstraints(constraint).build())
  }
  private fun continueQueued(context:Context){
   WorkManager.getInstance(context).enqueueUniqueWork(
    "receipt-sync",ExistingWorkPolicy.APPEND_OR_REPLACE,request(context,false))
  }
 }
}
