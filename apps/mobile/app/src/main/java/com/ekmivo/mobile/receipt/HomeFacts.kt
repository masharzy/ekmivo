package com.ekmivo.mobile.receipt

import android.content.Context
import org.json.JSONObject
import java.util.Locale

/** Local durable-ACK view. A server receipt ACK is not verified payment. */
enum class FeedState { SENT, SENDING, PENDING, FAILED }

data class FeedItem(
 val id:String, val sender:String, val raw:String, val timestamp:Long, val state:FeedState,
 val attempts:Int, val error:String, val amount:String?, val maskedNumber:String
)
data class HomeData(
 val items:List<FeedItem> = emptyList(), val acknowledged:Int=0, val pending:Int=0,
 val failed:Int=0, val lastForwarded:Long?=null, val retainedAmount:Double?=null,
 val todayAcknowledged:Int?=null,val weekAcknowledged:Int?=null,
 val unavailable:Boolean=false
)
object HomeContent {
 private val amountPattern=Regex("""(?i)(?:you have received\s+tk\.?\s*|received\s+tk\.?\s*)([0-9]+(?:\.[0-9]{1,2})?)""")
 private val numberPattern=Regex("""(?i)\bfrom\s+(?:\+?88)?(01[0-9]{9})\b""")
 fun amount(s:String):String?=amountPattern.find(s)?.groupValues?.getOrNull(1)
 fun mask(s:String):String=numberPattern.find(s)?.groupValues?.getOrNull(1)?.takeLast(4)?:""
 fun chip(state:ConnectionState,bn:Boolean):String=when(state){
  ConnectionState.Active -> if(bn)"লাইভ" else "Live"
  ConnectionState.Revoked -> if(bn)"বিচ্ছিন্ন" else "Disconnected"
  ConnectionState.Unpaired -> if(bn)"যুক্ত নয়" else "Not paired"
  ConnectionState.Pairing -> if(bn)"যুক্ত হচ্ছে" else "Connecting"
  is ConnectionState.PermissionsIncomplete -> if(bn)"মনোযোগ দরকার" else "Needs attention"
  is ConnectionState.Degraded -> when(state.reason){
   DegradedReason.CHECKING -> if(bn)"সিঙ্ক হচ্ছে" else "Syncing"
   DegradedReason.OFFLINE,DegradedReason.NETWORK_TIMEOUT -> if(bn)"অফলাইন" else "Offline"
   DegradedReason.BACKLOG -> if(bn)"অপেক্ষায়" else "Delayed"
   DegradedReason.SERVER_UNAVAILABLE -> if(bn)"সার্ভার নেই" else "Unavailable"
  }
 }
 fun status(s:FeedState,bn:Boolean):String=when(s){
  FeedState.SENT -> if(bn)"পাঠানো হয়েছে" else "Forwarded"
  FeedState.SENDING -> if(bn)"পাঠানো হচ্ছে" else "Sending"
  FeedState.PENDING -> if(bn)"অপেক্ষায়" else "Pending"
  FeedState.FAILED -> if(bn)"আবার চেষ্টা" else "Retry"
 }
}
/** Call on Dispatchers.IO. Never display sample values when storage is empty. */
fun homeData(context:Context):HomeData=runCatching{
 ReceiptStore(context.applicationContext).use{store->
  val dao=ReceivedSmsRoom.get(context.applicationContext).messages()
  val lastAckAt=dao.latestAckAt()
  val room=dao.unacknowledged(500).associateBy{it.id}
  val history=store.recent(120)
  val entries=history.map{r->
   val id=r.optString("id");val sms=r.optString("evidence");val stage=room[id]
   val state=when {
    r.optBoolean("sent")->FeedState.SENT
    stage?.status=="failed"->FeedState.FAILED
    stage?.status=="sending"->FeedState.SENDING
    else->FeedState.PENDING
   }
   FeedItem(id,r.optString("source"),sms,r.optLong("received_at"),state,
    stage?.attempts?:0,stage?.lastError?:"",HomeContent.amount(sms),HomeContent.mask(sms))
  }.sortedByDescending{it.timestamp}
  val forwarded=entries.filter{it.state==FeedState.SENT}
  val numeric=forwarded.mapNotNull{it.amount?.toDoubleOrNull()}
  val origin=(store.phone()?:store.enrollment())?.optString("id").orEmpty()
  val today=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Dhaka"))
  val tracking=context.getSharedPreferences("sms-metrics",Context.MODE_PRIVATE)
  val first=tracking.getString("since",null)?:today.toString().also{tracking.edit().putString("since",it).commit()}
  HomeData(
   entries,forwarded.size,store.count(),room.values.count{it.status=="failed"},
   lastAckAt,
   if(forwarded.isNotEmpty()&&numeric.size==forwarded.size)numeric.sum() else null,
   todayAcknowledged=if(first<today.toString())dao.countSince(origin,today.toString()) else null,
   weekAcknowledged=if(first<today.minusDays(6).toString())dao.countSince(origin,today.minusDays(6).toString()) else null
  )
 }
}.getOrElse{HomeData(unavailable=true)}
