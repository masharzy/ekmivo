package com.ekmivo.mobile.receipt

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import java.util.UUID

/** Product changes update this observable independently of APK versions. */
data class WorkspaceAccess(val id:String,val name:String,val environment:String,val ai:Boolean,val payments:Boolean,val paymentReady:Boolean=true) {
 companion object {
  fun parse(json:JSONObject)=WorkspaceAccess(json.getString("workspace_id"),json.getString("workspace_name"),json.getString("environment"),json.getJSONObject("products").getBoolean("ai"),json.getJSONObject("products").getBoolean("payments"),json.optBoolean("payments_ready",true))
 }
}
class WorkspaceAccessRepository private constructor(private val app:Context) {
 private val prefs=app.getSharedPreferences("workspace-access",Context.MODE_PRIVATE)
 private val current=MutableStateFlow(cached())
 val state:StateFlow<WorkspaceAccess?> = current
 private fun cached():WorkspaceAccess? { return runCatching {
  val data=JSONObject(prefs.getString("state",null)?:return null)
  val phone=ReceiptStore(app).use{it.phone()?:it.enrollment()}?:return null
  WorkspaceAccess.parse(data).takeIf{it.id==phone.optString("workspace_id")&&it.environment==phone.optString("environment")}
 }.getOrNull() }
 @Synchronized fun refreshBlocking():Boolean {
  val identity=ReceiptStore(app).use{it.phone()?:it.enrollment()}?:return false
  val raw=JSONObject().put("enrollment_id",identity.getString("id")).put("environment",identity.getString("environment"))
  return runCatching {
   val response=ReceiptTransport.post(app,"workspace-state",identity.getString("id"),UUID.randomUUID().toString(),raw.toString().toByteArray())
   if(response.first!=200)return false
   val body=JSONObject(response.second);val access=WorkspaceAccess.parse(body)
   require(access.id==identity.getString("workspace_id")&&access.environment==identity.getString("environment"))
   check(prefs.edit().putString("state",body.toString()).commit());current.value=access
   ReceiptRepository.get(app).dispatch(if(access.payments&&!access.paymentReady)ConnectionEvent.TransportFailure(DegradedReason.CHECKING) else ConnectionEvent.MissingPermissions(ReceiptRepository.get(app).permissions()))
   true
  }.getOrDefault(false)
 }
 fun clear(){prefs.edit().clear().apply();current.value=null}
 companion object {
  @Volatile private var instance:WorkspaceAccessRepository?=null
  fun get(context:Context):WorkspaceAccessRepository=instance?:synchronized(this){instance?:WorkspaceAccessRepository(context.applicationContext).also{instance=it}}
  fun paymentAllowed(context:Context):Boolean {
   val state=get(context).state.value
   if(state!=null)return state.payments&&state.paymentReady
   // Existing offline receipt collectors retain their already consented queue behavior.
   return ReceiptStore(context).use{store->(store.phone()?:store.enrollment())?.optBoolean("control_device")!=true}
  }
 }
}
