package com.ekmivo.mobile.inbox

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.ekmivo.mobile.receipt.*
import org.json.JSONObject
import java.util.UUID

class InboxPushRegistrationWorker(context:Context,params:WorkerParameters):Worker(context,params){
 override fun doWork():Result {
  val app=applicationContext
  val token=InboxPushTokenRegistry.currentToken(app)?:return Result.success()
  val repo=WorkspaceAccessRepository.get(app)
  if(!repo.refreshBlocking())return Result.retry()
  if(repo.state.value?.ai!=true)return Result.success()
  val identity=ReceiptStore(app).use{it.phone()?:it.enrollment()}?:return Result.success()
  return try {
   val response=ReceiptTransport.post(app,"inbox-push-register",identity.getString("id"),UUID.randomUUID().toString(),JSONObject().put("token",token).toString().toByteArray())
   if(response.first==200)Result.success()else if(response.first>=500||response.first==429)Result.retry() else Result.failure()
  }catch(_:Exception){Result.retry()}
 }
}
