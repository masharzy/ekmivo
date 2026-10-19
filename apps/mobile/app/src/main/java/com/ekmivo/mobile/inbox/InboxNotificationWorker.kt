package com.ekmivo.mobile.inbox

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.ekmivo.mobile.MainActivity
import com.ekmivo.mobile.receipt.*
import org.json.JSONObject
import java.util.UUID

/** Push is a hint, not trusted message data: reauthorize and fetch before showing it. */
class InboxNotificationWorker(context:Context,params:WorkerParameters):Worker(context,params){
 override fun doWork():Result {
  val app=applicationContext
  val device=inputData.getString("device_id")?:return Result.success()
  val ws=inputData.getString("workspace_id")?:return Result.success()
  val thread=inputData.getString("thread_id")?:return Result.success()
  val message=inputData.getString("message_id")?:return Result.success()
  if(!thread.matches(Regex("[0-9a-f-]{36}")))return Result.success()
  val identity=ReceiptStore(app).use{it.phone()?:it.enrollment()}?:return Result.success()
  if(identity.optString("id")!=device||identity.optString("workspace_id")!=ws)return Result.success()
  val repository=WorkspaceAccessRepository.get(app)
  if(!repository.refreshBlocking())return Result.retry()
  if(repository.state.value?.ai!=true)return Result.success()
  return try {
   val body=JSONObject().put("action","messages").put("thread_id",thread)
   val response=ReceiptTransport.post(app,"inbox",device,UUID.randomUUID().toString(),body.toString().toByteArray())
   if(response.first!=200)return if(response.first>=500)Result.retry() else Result.success()
   val messages=JSONObject(response.second).getJSONArray("items")
   val present=(0 until messages.length()).any{val m=messages.getJSONObject(it);m.optString("id")==message&&m.optString("sender")=="customer"}
   if(!present)return Result.success()
   if(android.os.Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(app,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return Result.success()
   InboxPushTokenRegistry.ensureChannel(app)
   val intent=Intent(app,MainActivity::class.java).putExtra("inbox_thread",thread).putExtra("inbox_workspace",ws).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
   val action=PendingIntent.getActivity(app,message.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
   val notification=NotificationCompat.Builder(app,InboxPushTokenRegistry.channelId).setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("Ekmivo").setContentText("নতুন মেসেজ · New message").setContentIntent(action).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
   NotificationManagerCompat.from(app).notify(message.hashCode(),notification)
   Result.success()
  }catch(_:Exception){Result.retry()}
 }
}
