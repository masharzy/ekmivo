package com.ekmivo.mobile.inbox

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun InboxMessageActions(message:JSONObject,thread:String,bn:Boolean,capabilities:JSONObject,onClose:()->Unit,onChanged:()->Unit){
 val app=LocalContext.current;val p=LocalEkmivoPalette.current;val scope=rememberCoroutineScope()
 var targets by remember{mutableStateOf<List<JSONObject>?>(null)};var details by remember{mutableStateOf<JSONObject?>(null)};var error by remember{mutableStateOf(false)};var busy by remember{mutableStateOf(false)}
 var targetQuery by remember{mutableStateOf("")};var targetPage by remember{mutableIntStateOf(0)};var targetMore by remember{mutableStateOf(false)}
 LaunchedEffect(targetQuery,targetPage,targets!=null){if(targets!=null){delay(250);try{val a=inboxRequest(app,"list",filters=JSONObject().put("q",targetQuery).put("offset",targetPage*50)).getJSONArray("items");val fetched=(0 until a.length()).map{a.getJSONObject(it)};targetMore=fetched.size==50;targets=(if(targetPage==0)fetched else targets.orEmpty()+fetched).distinctBy{it.optString("id")}.filter{it.optString("id")!=thread}}catch(e:CancellationException){throw e}catch(_:Exception){error=true}}}
 val keys=remember{mutableMapOf<String,String>()}
 fun mutate(action:String,target:String,body:JSONObject){scope.launch{busy=true;try{inboxRequest(app,action,target,body=body);onChanged();onClose()}catch(e:CancellationException){throw e}catch(_:Exception){error=true}finally{busy=false}}}
 ModalBottomSheet(onDismissRequest=onClose,containerColor=p.raised,tonalElevation=0.dp,shape=RoundedCornerShape(topStart=24.dp,topEnd=24.dp)){
 Column(Modifier.fillMaxWidth().heightIn(max=520.dp).verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
  if(error)Text(if(bn)"কাজটি করা যায়নি। আবার চেষ্টা করুন।" else "Unable to complete the action. Try again.",color=p.danger,style=EkmivoType.heroNote)
  val info=details;val forward=targets
  if(info!=null){
   Text(if(bn)"মেসেজের তথ্য" else "Message information",style=EkmivoType.button,color=p.text)
   listOf("created_at" to (if(bn)"তৈরি" else "Created"),"sent_at" to (if(bn)"পাঠানো" else "Sent"),"delivered_at" to (if(bn)"পৌঁছেছে" else "Delivered"),"seen_at" to (if(bn)"দেখেছেন" else "Seen")).forEach{(key,label)->val at=info.optString(key);if(at.isNotBlank()&&at!="null"&&(capabilities.optBoolean("delivered",true)||key!="delivered_at"))Row(Modifier.fillMaxWidth()){Text(label,Modifier.weight(1f),color=p.secondary,style=EkmivoType.heroNote);Text(displayDigits(at.take(19).replace('T',' '),bn),style=EkmivoType.heroNote,color=p.text)}}
   Text(when(message.optString("sender")){"ai"->"AI";"seller"->if(bn)"আপনি" else "You";else->if(bn)"কাস্টমার" else "Customer"},style=EkmivoType.heroNote,color=p.secondary)
   Text(when(info.optString("channel")){"wa"->"WhatsApp";"ig"->"Instagram";else->"Messenger"},style=EkmivoType.heroNote,color=p.secondary)
   Text(when(info.optString("state")){"queued","sending"->if(bn)"পাঠানো হচ্ছে" else "Sending";"failed"->if(bn)"পাঠানো যায়নি" else "Failed";"uncertain"->if(bn)"ফলাফল নিশ্চিত নয়" else "Outcome unknown";else->""},style=EkmivoType.heroNote,color=p.secondary)
  }else if(forward!=null){
   Text(if(bn)"অন্য চ্যাটে পাঠান" else "Send to another chat",style=EkmivoType.button,color=p.text)
   if(forward.isEmpty())Text(if(bn)"অন্য কোনো চ্যাট নেই" else "No other chats",color=p.secondary)
   androidx.compose.foundation.text.BasicTextField(targetQuery,{targetQuery=it;targetPage=0},textStyle=EkmivoType.chatMessage.copy(color=p.text),modifier=Modifier.fillMaxWidth().background(p.surface,RoundedCornerShape(12.dp)).padding(12.dp),decorationBox={inner->if(targetQuery.isEmpty())Text(if(bn)"চ্যাট খুঁজুন…" else "Search chats…",color=p.secondary,style=EkmivoType.chatMessage);inner()})
   forward.forEach{target->val allowed=target.optBoolean("window_open")&&!(message.optString("type")=="document"&&target.optString("channel")=="ig");Column(Modifier.fillMaxWidth().clickable(enabled=allowed&&!busy){val id=target.getString("id");val key=keys.getOrPut(id){UUID.randomUUID().toString()};mutate("forward",id,JSONObject().put("message_id",message.getString("id")).put("idempotency_key",key).put("album",message.optString("batch_id").let{it.isNotBlank()&&it!="null"}))}.padding(vertical=10.dp)){
    Text(target.optString("name"),style=EkmivoType.shop,color=p.text.copy(alpha=if(allowed)1f else .45f))
    if(!allowed)Text(if(!target.optBoolean("window_open"))(if(bn)"২৪ ঘণ্টা পার হয়েছে" else "Messaging window closed")else(if(bn)"এই চ্যানেলে ফাইল পাঠানো যায় না" else "Files are unavailable on this channel"),style=EkmivoType.meta,color=p.secondary)
   }}
   if(targetMore)EkmivoPill(if(bn)"আরও চ্যাট" else "More chats",false){targetPage++}
  }else{
   if(message.optString("sender")=="customer"){
    val reactions=capabilities.optJSONArray("reactions")
    if(reactions!=null)Row(horizontalArrangement=Arrangement.spacedBy(14.dp)){repeat(reactions.length()){i->val emoji=reactions.getString(i);Text(emoji,style=EkmivoType.heroAmount,modifier=Modifier.clickable(enabled=!busy){val key=keys.getOrPut("react"){UUID.randomUUID().toString()};mutate("react",thread,JSONObject().put("message_id",message.getString("id")).put("emoji",if(message.optString("reaction")==emoji)"" else emoji).put("idempotency_key",key))})}}
   }
   if(message.optString("sender")!="customer"&&message.optString("type") in listOf("text","image","audio","document","product"))EkmivoPill(if(bn)"অন্য চ্যাটে পাঠান" else "Send to another chat",false){scope.launch{try{val a=inboxRequest(app,"list").getJSONArray("items");targets=(0 until a.length()).map{a.getJSONObject(it)}.filter{it.optString("id")!=thread}}catch(_:Exception){error=true}}}
   EkmivoPill(if(bn)"মেসেজের তথ্য" else "Message information",false){scope.launch{try{details=inboxRequest(app,"info",thread,body=JSONObject().put("message_id",message.getString("id")))}catch(_:Exception){error=true}}}
  }
 }
 }
}
