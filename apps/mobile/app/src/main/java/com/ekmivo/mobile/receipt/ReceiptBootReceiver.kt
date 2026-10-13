package com.ekmivo.mobile.receipt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Reschedule durable offline forwarding after Android starts again.
 * SMS_RECEIVED is delivered independently while the process is not open;
 * force-stop and power-off are OS restrictions and cannot be bypassed.
 */
class ReceiptBootReceiver:BroadcastReceiver(){
 override fun onReceive(context:Context,intent:Intent){
  if(intent.action==Intent.ACTION_BOOT_COMPLETED ||
     intent.action==Intent.ACTION_MY_PACKAGE_REPLACED){
   runCatching{ReceiptStore(context).use{
    if(it.enabled())ReceiptSyncWorker.schedule(context)
   }}
  }
 }
}
