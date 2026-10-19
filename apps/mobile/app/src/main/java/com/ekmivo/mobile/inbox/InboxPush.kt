package com.ekmivo.mobile.inbox

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.ekmivo.mobile.receipt.ReceiptStore
import com.ekmivo.mobile.BuildConfig
import com.google.firebase.FirebaseOptions
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Tokens are registered only for the authenticated active phone enrollment. */
object InboxPushTokenRegistry {
 private const val prefsName="ekmivo_inbox_push"
 private const val tokenKey="fcm_token"
 private const val phoneKey="paired_phone_id"
 const val channelId="ekmivo_inbox_messages"

 private fun currentPhone(context:Context):String? =
  ReceiptStore(context.applicationContext).use { store ->
   if(!store.enabled() || store.isRevoked())null
   else (store.phone()?:store.enrollment())?.optString("id")?.takeIf { it.isNotBlank() }
  }

 fun capture(context:Context,token:String):Boolean {
  if(!InboxFeatureFlag.inboxEnabled || token.isBlank())return false
  val id=currentPhone(context)?:return false
  return context.applicationContext.getSharedPreferences(prefsName,Context.MODE_PRIVATE).edit()
   .putString(tokenKey,token).putString(phoneKey,id).commit().also { saved ->
    if(saved) {
     val work=androidx.work.OneTimeWorkRequestBuilder<InboxPushRegistrationWorker>()
      .setConstraints(androidx.work.Constraints.Builder().setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build()).build()
     androidx.work.WorkManager.getInstance(context).enqueueUniqueWork("inbox-push-register-"+id,androidx.work.ExistingWorkPolicy.REPLACE,work)
    }
   }
 }
 fun currentToken(context:Context):String? {
  if(!InboxFeatureFlag.inboxEnabled)return null
  val id=currentPhone(context)?:return null
  val prefs=context.applicationContext.getSharedPreferences(prefsName,Context.MODE_PRIVATE)
  if(prefs.getString(phoneKey,null)!=id)return null
  return prefs.getString(tokenKey,null)
 }
 fun clear(context:Context){
  context.applicationContext.getSharedPreferences(prefsName,Context.MODE_PRIVATE)
   .edit().clear().apply()
 }

 /** Runs only if a real Firebase app has been configured; no mock token. */
 fun prepare(context:Context) {
  if(!InboxFeatureFlag.inboxEnabled)return
  val app=context.applicationContext
  if(FirebaseApp.getApps(app).isEmpty()) {
   if(BuildConfig.FIREBASE_APPLICATION_ID.isBlank()||BuildConfig.FIREBASE_API_KEY.isBlank()||BuildConfig.FIREBASE_PROJECT_ID.isBlank()||BuildConfig.FIREBASE_SENDER_ID.isBlank())return
   val initialized=runCatching { FirebaseApp.initializeApp(app,FirebaseOptions.Builder().setApplicationId(BuildConfig.FIREBASE_APPLICATION_ID).setApiKey(BuildConfig.FIREBASE_API_KEY).setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build()) }.getOrNull()
   if(initialized==null)return
  }
  ensureChannel(app)
  FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> capture(app,token) }
 }
 fun ensureChannel(context:Context){
  if(!InboxFeatureFlag.inboxEnabled)return
  val manager=context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  manager.createNotificationChannel(
   NotificationChannel(channelId,"Inbox messages",NotificationManager.IMPORTANCE_DEFAULT)
    .apply { description="Ekmivo inbox notifications" }
  )
 }
}

/** FCM token refresh and scoped inbox notification delivery. */
class InboxFirebaseService:FirebaseMessagingService() {
 override fun onNewToken(token:String) {
  super.onNewToken(token)
  InboxPushTokenRegistry.capture(applicationContext,token)
 }
 override fun onMessageReceived(message:RemoteMessage) {
  super.onMessageReceived(message)
  val data=message.data
  val request=androidx.work.OneTimeWorkRequestBuilder<InboxNotificationWorker>()
   .setInputData(androidx.work.workDataOf("device_id" to data["device_id"],"workspace_id" to data["workspace_id"],"thread_id" to data["thread_id"],"message_id" to data["message_id"]))
   .setConstraints(androidx.work.Constraints.Builder().setRequiredNetworkType(androidx.work.NetworkType.CONNECTED).build())
   .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST).build()
  androidx.work.WorkManager.getInstance(applicationContext).enqueue(request)
 }
}
