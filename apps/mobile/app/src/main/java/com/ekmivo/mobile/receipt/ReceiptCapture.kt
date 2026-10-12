package com.ekmivo.mobile.receipt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.app.Notification
import org.json.JSONObject
import java.time.Instant

object ReceiptCapture {
 // Provider SMS originatingAddress identifies only the message source, not payer.
 fun accept(context:Context,source:String,binding:String,kind:String,text:String){
  ReceiptStore(context).use {store->
   if(!store.enabled()||text.toByteArray(Charsets.UTF_8).size>6000)return
   // PipraPay-style receipt forwarding: source/body/SIM go to the signed
   // physical phone endpoint. Financial payer and account stay unknown here.
   // Never collect arbitrary SMS, notifications, logins or OTPs.
   if(kind=="device_sms"&&store.phone()!=null){
    if(!store.canForward(source)||!ReceiptForwardPolicy.likelyPayment(source,text))return
    val version=store.forwardVersion()
    if(version<0)return
    val phone=store.phone()?:return
    val body=JSONObject().put("enrollment_id",phone.getString("id"))
     .put("environment",phone.getString("environment"))
     .put("physical_forward",true)
     .put("source",source).put("binding",binding)
     .put("kind","device_sms").put("evidence",text)
     .put("configuration_version",version)
     .put("observed_at",Instant.now().toString())
    if(store.enqueue(body))ReceiptSyncWorker.schedule(context)
    return
   }
   val collection=store.collectionEnrollments()
   val rules=collection.map{
    ReceiptRoute(it.optString("id"),it.optString("source"),it.optString("binding"),it.optString("capture_pattern"))
   }
   val decision=ReceiptRouting.choose(rules,source,binding,text)
   if(decision is RouteDecision.Ambiguous){
    store.setQueueError("AMBIGUOUS_RECEIPT_SOURCE")
    ReceiptSyncWorker.schedule(context)
    return
   }
   if(decision !is RouteDecision.Selected)return
   val enrollment=collection.firstOrNull{it.optString("id")==decision.enrollmentId}?:return
   val environment=store.phone()?.getString("environment")?:enrollment.getString("environment")
   val payload=JSONObject().put("enrollment_id",enrollment.getString("id"))
    .put("environment",environment).put("source",source).put("binding",binding)
    .put("kind",kind).put("evidence",text).put("observed_at",Instant.now().toString())
   if(store.enqueue(payload))ReceiptSyncWorker.schedule(context)
  }
 }
}
class ReceiptSmsReceiver:BroadcastReceiver(){
 override fun onReceive(context:Context,intent:Intent){
  if(intent.action!=Telephony.Sms.Intents.SMS_RECEIVED_ACTION)return
  val messages=Telephony.Sms.Intents.getMessagesFromIntent(intent)
  if(messages.isEmpty())return
  val sender=messages.first().originatingAddress?:return
  if(messages.any{it.originatingAddress!=sender})return
  val subscription=intent.getIntExtra("subscription",-1)
  // A missing subscription is an opaque source hint, never a guessed account.
  // Server does not use SIM slot or originatingAddress as payer identity.
  ReceiptCapture.accept(context,sender,"sms:"+(if(subscription>=0)subscription.toString() else "unknown"),"device_sms",
   messages.joinToString(""){it.messageBody?:""})
 }
}
class ReceiptNotificationListener:NotificationListenerService(){
 override fun onListenerConnected(){ReceiptSyncWorker.schedule(this)}
 override fun onNotificationPosted(sbn:StatusBarNotification){
  val extras=sbn.notification.extras
  val text=(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
    ?:extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?:return
  ReceiptCapture.accept(this,sbn.packageName,"package:"+sbn.packageName,"device_notification",text)
 }
}
