package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat

/** Explicit, on-device and opt-in recovery for messages already in the inbox.
 * Nothing is read without READ_SMS permission and an operator tap. We read
 * only recent incoming messages; irrelevant personal/OTP SMS are discarded
 * before persistence or transport. This is not a background SMS history scan.
 */
object ReceiptInboxRecovery {
 fun recover(context:Context):Int {
  if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED)
   throw SecurityException("READ_SMS permission is required for optional inbox recovery")
  ReceiptStore(context).use{if(!it.enabled()||it.phone()==null)return 0}
  val sources=ReceiptStore(context).use { it.allowedSources().toList() }
  if(sources.isEmpty())return 0
  val cutoff=System.currentTimeMillis()-72L*60*60*1000
  val known=ReceiptStore(context).use{store->
   store.recent(60).map{it.optString("source").lowercase()+"|"+it.optString("evidence")}.toMutableSet()
  }
  var inserted=0
  val projection=arrayOf(Telephony.Sms.ADDRESS,Telephony.Sms.BODY,Telephony.Sms.DATE)
  // Apply the allowlist in the content provider itself: no generic inbox dump.
  val origins=sources
  val selection="${Telephony.Sms.DATE} >= ? AND LOWER(${Telephony.Sms.ADDRESS}) IN (${origins.joinToString(","){"?"}})"
  val selectionArgs=arrayOf(cutoff.toString(),*origins.toTypedArray())
  context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,projection,
   selection,selectionArgs,"${Telephony.Sms.DATE} DESC")?.use{cursor->
   val address=cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
   val text=cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
   var checked=0
   while(cursor.moveToNext()&&checked++<250) {
    val sender=cursor.getString(address)?:continue
    val body=cursor.getString(text)?:continue
    val source=sender.trim().lowercase()
    if(!ReceiptForwardPolicy.likelyPayment(sender,body,sources.toSet()))continue
    val key=source+"|"+body
    if(key in known)continue
    val before=ReceiptStore(context).use{it.count()}
    // Inbox cursor does not reliably preserve the original subscription ID.
    // No attempt is made to guess a receiver number from this missing field.
    ReceiptCapture.accept(context,sender,"sms:recovered","device_sms",body)
    val after=ReceiptStore(context).use{it.count()}
    if(after>before) {
     known.add(key)
     inserted++
    }
   }
  }
  return inserted
 }
}
