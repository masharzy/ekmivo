package com.ekmivo.mobile.inbox

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.*
import org.json.JSONObject

@Composable
internal fun CustomerProfile(thread:String,bn:Boolean,onClose:()->Unit,onChanged:()->Unit) {
 val app=LocalContext.current.applicationContext;val p=LocalEkmivoPalette.current;val scope=rememberCoroutineScope()
 var data by remember(thread){mutableStateOf<JSONObject?>(null)};var error by remember{mutableStateOf(false)}
 var note by rememberSaveable(thread){mutableStateOf("")};var original by remember{mutableStateOf("")};var version by remember{mutableLongStateOf(0)}
 var initialized by remember{mutableStateOf(false)};var changedNote by remember{mutableStateOf<String?>(null)}
 var busy by remember{mutableStateOf(false)};var expanded by rememberSaveable{mutableStateOf(false)};var retry by remember{mutableIntStateOf(0)}
 var confirmClose by remember{mutableStateOf(false)}
 fun close(){if(note!=original)confirmClose=true else onClose()}
 LaunchedEffect(thread,retry){try{val latest=inboxRequest(app,"profile",thread);val serverNote=latest.optString("note");if(!initialized||note==original){note=serverNote}else if(serverNote!=original){changedNote=serverNote};original=serverNote;data=latest;version=latest.optLong("note_version");initialized=true;error=false}catch(e:CancellationException){throw e}catch(_:Exception){error=true}}
 Dialog(onDismissRequest={close()},properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)) {
 BackHandler{close()}
 Column(Modifier.fillMaxSize().background(p.canvas).systemBarsPadding()) {
  Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){Box(Modifier.size(34.dp).clickable{close()},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.ARR)};Text(if(bn)"কাস্টমারের তথ্য" else "Customer details",style=EkmivoType.button,color=p.text)}
  if(error)Column(Modifier.padding(20.dp)){Text(if(bn)"তথ্য লোড বা সেভ করা যায়নি।" else "Unable to load or save details.",color=p.danger);EkmivoPill(if(bn)"আবার চেষ্টা" else "Try again",false){retry++}}
  val d=data
  if(d==null){if(!error)CircularProgressIndicator(Modifier.padding(24.dp),color=p.text)}else Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(bottom=24.dp)) {
   val summary=d.getJSONObject("summary");val ok=summary.optInt("ok");val cx=summary.optInt("cx");val rt=summary.optInt("rt");val run=summary.optInt("run");val talks=d.optInt("talks");val v=CustomerVerdict.from(ok,cx,rt,run,talks)
   val tone=when(v.key){"trusted","start"->p.success;"risk","caution"->p.danger;"average","frequent"->p.warning;else->p.secondary}
   val phone=d.optString("phone").takeUnless{it.isBlank()||it=="null"};val contact=d.optJSONObject("contact")?:JSONObject()
   Column(Modifier.fillMaxWidth().padding(18.dp),horizontalAlignment=Alignment.CenterHorizontally){Box(Modifier.size(76.dp).clip(CircleShape).background(p.raised),contentAlignment=Alignment.Center){Text(d.optString("name").take(1),style=EkmivoType.heroAmount,color=p.text)};Spacer(Modifier.height(10.dp));Text(d.optString("name"),style=EkmivoType.profileName,color=p.text);Text(listOfNotNull(when(d.optString("channel")){"wa"->"WhatsApp";"ig"->"Instagram";else->"Messenger"},if(d.optString("channel")=="wa")phone else contact.optString("username").takeIf{it.isNotBlank()}).joinToString(" · "),style=EkmivoType.heroNote,color=p.secondary);Text(v.label(bn),style=EkmivoType.heroNote,color=tone)}
   Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
    ProfileAction(if(bn)"মেসেজ" else "Message",Modifier.weight(1f)){close()}
    if(phone!=null)ProfileAction(if(bn)"নম্বর কপি" else "Copy number",Modifier.weight(1f)){(app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("",phone))}
    ProfileAction(if(d.optBoolean("ai_enabled"))(if(bn)"AI বন্ধ করুন" else "Turn AI off")else(if(bn)"AI চালু করুন" else "Turn AI on"),Modifier.weight(1f)){if(!busy)scope.launch{busy=true;try{inboxRequest(app,"ai",thread,body=JSONObject().put("enabled",!d.optBoolean("ai_enabled")));data=JSONObject(d.toString()).put("ai_enabled",!d.optBoolean("ai_enabled"));onChanged();error=false}catch(_:Exception){error=true}finally{busy=false}}}
   }
   ProfileCard {
    if(v.completed>0) {
     Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(14.dp)) {
      Box(Modifier.size(68.dp),contentAlignment=Alignment.Center){CircularProgressIndicator(progress={v.rate!!/100f},modifier=Modifier.fillMaxSize(),color=tone,trackColor=p.border,strokeWidth=7.dp);Text(displayDigits("${v.rate}%",bn),style=EkmivoType.button,color=p.text)}
      Column{Text(displayDigits(if(bn)"${v.completed}টির মধ্যে ${ok}টি অর্ডার সফল" else "$ok of ${v.completed} completed orders successful",bn),style=EkmivoType.shop,color=p.text);Text(if(bn)"সফল অর্ডারের হার" else "Successful order rate",style=EkmivoType.heroNote,color=p.secondary)}
     }
     if(ok>0)ProfileLine("",displayDigits(if(bn)"${ok}টি অর্ডার ঠিকমতো নিয়েছেন" else "$ok successful orders",bn))
     if(cx==0&&rt==0)ProfileLine("",if(bn)"কখনো বাতিল বা ফেরত দেননি" else "No cancellations or returns")
     if(cx>0){val orders=d.getJSONArray("orders");val reason=(0 until orders.length()).map{orders.getJSONObject(it)}.firstOrNull{it.optString("status")=="cx"&&it.optString("reason").isNotBlank()}?.optString("reason");ProfileLine("",displayDigits(if(bn)"${cx}বার অর্ডার বাতিল করেছেন" else "$cx cancelled orders",bn)+(if(reason!=null)(if(bn)"। সর্বশেষ কারণ: " else ". Latest reason: ")+reason else ""))}
     if(rt>0)ProfileLine("",displayDigits(if(bn)"${rt}টি পণ্য ফেরত দিয়েছেন" else "$rt returned orders",bn))
     if(run>0)ProfileLine("",displayDigits(if(bn)"${run}টি অর্ডার এখন চলছে" else "$run orders in progress",bn))
     if(v.key in listOf("risk","caution"))Text(if(bn)"অর্ডার নেওয়ার আগে ফোনে কনফার্ম করুন, সম্ভব হলে অগ্রিম নিন" else "Confirm by phone before accepting an order; consider an advance.",style=EkmivoType.heroNote,color=p.warning)
    }else{Text(v.label(bn),style=EkmivoType.shop,color=p.text);Text(if(run>0)(if(bn)"ডেলিভারি হওয়ার পর সফল অর্ডারের হার দেখা যাবে।" else "The success rate appears after delivery.")else(if(bn)"অর্ডার হলে এখানে অর্ডারের ইতিহাস দেখা যাবে।" else "Order history will appear when an order is recorded."),style=EkmivoType.heroNote,color=p.secondary)}
   }
   if(v.completed>0)ProfileCard(if(bn)"অর্ডারের সারাংশ" else "Order summary") {
    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf((if(bn)"মোট অর্ডার" else "Total") to summary.optInt("total"),(if(bn)"সফল" else "Successful") to ok,(if(bn)"বাতিল" else "Cancelled") to cx,(if(bn)"ফেরত" else "Returned") to rt,(if(bn)"চলমান" else "In progress") to run).filterIndexed{i,x->i==0||x.second>0}.forEach{(label,n)->Column(Modifier.widthIn(min=78.dp).clip(RoundedCornerShape(12.dp)).background(p.surface).padding(10.dp)){Text(displayDigits(n.toString(),bn),style=EkmivoType.profileName,color=p.text);Text(label,style=EkmivoType.meta,color=p.secondary)}}}
    if(ok>0)ProfileLine(if(bn)"মোট কেনাকাটা" else "Total purchases",money(summary.optLong("spend_minor"),bn))
    if(ok>=2)ProfileLine(if(bn)"গড় অর্ডার" else "Average order",money(summary.optLong("spend_minor")/ok,bn))
    ProfileLine(if(bn)"শেষ অর্ডার" else "Last order",displayDigits(summary.optString("last_order").take(10),bn))
   }
   val fresh=summary.optInt("total")==0&&talks<=1;val first=d.optJSONObject("first")
   ProfileCard(if(fresh)(if(bn)"পরিচিতি" else "Introduction")else(if(bn)"কথা বলা আর কেনার আচরণ" else "Conversation and purchases")){
    if(first!=null){ProfileLine(if(bn)"প্রথম মেসেজ" else "First message",displayDigits(first.optString("at").take(16).replace('T',' '),bn));if(fresh&&first.optString("text").isNotBlank())Text(first.optString("text"),style=EkmivoType.chatMessage,color=p.text)}
    if(fresh)ProfileLine(if(bn)"চ্যানেল" else "Channel",when(d.optString("channel")){"wa"->"WhatsApp";"ig"->"Instagram";else->"Messenger"})
    if(!fresh){ProfileLine(if(bn)"মোট মেসেজ দিয়েছেন" else "Messages",displayDigits(d.optInt("messages").toString(),bn));ProfileLine(if(bn)"কথা হয়েছে" else "Conversations",displayDigits(talks.toString(),bn))}
   }
   val orders=d.getJSONArray("orders");if(orders.length()>0)ProfileCard(if(bn)"অর্ডারের ইতিহাস" else "Order history"){
    Text(d.optString("store"),style=EkmivoType.shop,color=p.text)
    repeat(if(expanded)orders.length() else minOf(3,orders.length())){i->val o=orders.getJSONObject(i);Row(Modifier.fillMaxWidth().padding(vertical=8.dp)){Column(Modifier.weight(1f)){Text(o.optString("items"),style=EkmivoType.shop,color=p.text);Text(displayDigits(o.optString("created_at").take(10),bn)+" · "+o.optString("reference"),style=EkmivoType.meta,color=p.secondary);if(o.optString("reason").isNotBlank())Text(o.optString("reason"),style=EkmivoType.meta,color=p.secondary)};Column(horizontalAlignment=Alignment.End){Text(money(o.optLong("amount_minor"),bn),style=EkmivoType.shop,color=p.text);Text(when(o.optString("status")){"ok"->if(bn)"সফল" else "Successful";"cx"->if(bn)"বাতিল" else "Cancelled";"rt"->if(bn)"ফেরত" else "Returned";else->if(bn)"চলমান" else "In progress"},style=EkmivoType.meta,color=p.secondary)}}}
    if(orders.length()>3)EkmivoPill(if(expanded)(if(bn)"কম দেখুন" else "Show less")else(if(bn)"আরও দেখুন" else "Show more"),false){expanded=!expanded}
   }
   val details=listOf((if(bn)"ফোন" else "Phone") to if(d.optString("channel")!="wa")phone.orEmpty() else "",(if(bn)"ঠিকানা" else "Address") to contact.optString("address"),(if(bn)"পছন্দের পেমেন্ট" else "Preferred payment") to contact.optString("payment")).filter{it.second.isNotBlank()&&it.second!="null"}
   if(details.isNotEmpty())ProfileCard(if(bn)"যোগাযোগ ও ডেলিভারি" else "Contact and delivery"){details.forEach{ProfileLine(it.first,it.second)}}
   val interests=contact.optJSONArray("interests");if(interests!=null&&interests.length()>0)ProfileCard(if(bn)"যা নিয়ে জানতে চেয়েছেন" else "Interests"){repeat(interests.length()){Text(interests.optString(it),style=EkmivoType.heroNote,color=p.text)}}
   ProfileCard(if(bn)"আপনার নোট" else "Your notes") {
    changedNote?.let{remote->Text(if(bn)"অন্য জায়গা থেকে নোট বদলেছে। আপনার লেখা রাখা আছে; মিলিয়ে সেভ করুন।" else "The note changed elsewhere. Your draft is preserved; review before saving.",color=p.warning,style=EkmivoType.heroNote);Text(remote,color=p.secondary,style=EkmivoType.heroNote)}
    androidx.compose.foundation.text.BasicTextField(note,{note=it.take(8000)},textStyle=EkmivoType.chatMessage.copy(color=p.text),modifier=Modifier.fillMaxWidth().heightIn(min=70.dp).clip(RoundedCornerShape(12.dp)).background(p.surface).padding(10.dp))
    EkmivoPrimaryButton(if(busy)(if(bn)"সেভ হচ্ছে…" else "Saving…")else(if(bn)"সেভ করুন" else "Save"),enabled=!busy&&note!=original,onClick={scope.launch{busy=true;try{val result=inboxRequest(app,"note",thread,body=JSONObject().put("text",note).put("version",version));version=result.getLong("version");original=note;changedNote=null;error=false}catch(_:Exception){error=true}finally{busy=false}}})
   }
  }
 }
 if(confirmClose)AlertDialog(onDismissRequest={confirmClose=false},title={Text(if(bn)"নোট সেভ হয়নি" else "Unsaved note")},text={Text(if(bn)"ফিরে গিয়ে সেভ করুন, অথবা পরিবর্তন বাদ দিন।" else "Return to save, or discard changes.")},confirmButton={TextButton(onClick={onClose()}){Text(if(bn)"বাদ দিন" else "Discard")}},dismissButton={TextButton(onClick={confirmClose=false}){Text(if(bn)"ফিরে যান" else "Return")}})
 }
}
@Composable private fun ProfileCard(title:String?=null,content:@Composable ColumnScope.()->Unit){val p=LocalEkmivoPalette.current;Column(Modifier.fillMaxWidth().padding(start=12.dp,end=12.dp,top=10.dp).clip(RoundedCornerShape(18.dp)).border(1.dp,p.border,RoundedCornerShape(18.dp)).background(p.raised).padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){if(title!=null)Text(title,style=EkmivoType.heroNote,color=p.secondary);content()}}
@Composable private fun ProfileLine(label:String,value:String){val p=LocalEkmivoPalette.current;Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){if(label.isNotBlank())Text(label,style=EkmivoType.heroNote,color=p.secondary,modifier=Modifier.weight(1f));Text(value,style=EkmivoType.heroNote,color=p.text,modifier=if(label.isBlank())Modifier else Modifier.weight(1f))}}
@Composable private fun ProfileAction(label:String,modifier:Modifier,onClick:()->Unit){val p=LocalEkmivoPalette.current;Box(modifier.clip(RoundedCornerShape(14.dp)).background(p.raised).clickable(onClick=onClick).padding(horizontal=4.dp,vertical=10.dp),contentAlignment=Alignment.Center){Text(label,style=EkmivoType.heroNote,color=p.text)}}
internal fun money(minor:Long,bn:Boolean)=displayDigits("৳"+java.math.BigDecimal.valueOf(minor,2).toPlainString(),bn)
