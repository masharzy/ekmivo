package com.ekmivo.mobile.receipt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

/** Reschedule durable offline forwarding after Android starts again.
 * SMS_RECEIVED is delivered independently while the process is not open;
 * force-stop and power-off are OS restrictions and cannot be bypassed.
 */
class ReceiptBootReceiver:BroadcastReceiver(){
 companion object { private val startupExecutor=Executors.newSingleThreadExecutor() }
 override fun onReceive(context:Context,intent:Intent){
  if(intent.action!=Intent.ACTION_BOOT_COMPLETED &&
    intent.action!=Intent.ACTION_MY_PACKAGE_REPLACED)return
  val pending=goAsync()
  val appContext=context.applicationContext
  startupExecutor.execute{
   try{
    ReceiptStore(appContext).use{if(it.enabled())ReceiptSyncWorker.scheduleNow(appContext)}
   }catch(_:Exception){
    runCatching{ReceiptStore(appContext).use{it.setQueueError("BOOT_RETRY_SCHEDULING_FAILED")}}
   }finally{pending.finish()}
  }
 }
}
