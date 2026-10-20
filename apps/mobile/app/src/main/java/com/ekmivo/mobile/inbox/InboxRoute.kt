package com.ekmivo.mobile.inbox

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.platform.ViewConfiguration
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.*
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.receipt.*
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest
import androidx.lifecycle.repeatOnLifecycle
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

private fun JSONArray.rows()=(0 until length()).map{getJSONObject(it)}
private fun online(context:Context):Boolean {
 val cm=context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
 return cm.activeNetwork?.let{cm.getNetworkCapabilities(it)?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)}==true
}
private fun channelColor(channel:String)=when(channel){"wa"->Color(0xFF25D366);"ig"->Color(0xFFC13584);else->Color(0xFF0A7CFF)}
@Composable private fun ChannelAvatar(initial:String,channel:String,size:androidx.compose.ui.unit.Dp=40.dp) {
 val p=LocalEkmivoPalette.current
 Box(Modifier.size(size+4.dp)) {
  Box(Modifier.size(size).align(Alignment.TopStart).clip(CircleShape).background(p.raised),contentAlignment=Alignment.Center) {
   Text(initial.take(2),style=EkmivoType.shop,color=p.text)
  }
  val bg=if(channel=="ig")Brush.linearGradient(listOf(Color(0xFFFEDA75),Color(0xFFFA7E1E),Color(0xFFD62976),Color(0xFF962FBF),Color(0xFF4F5BD5)))
     else Brush.linearGradient(listOf(channelColor(channel),channelColor(channel)))
  Box(Modifier.align(Alignment.BottomEnd).size(21.dp).clip(CircleShape).background(p.canvas).padding(2.dp).clip(CircleShape).background(bg),contentAlignment=Alignment.Center) {
   EkmivoReferenceIcon(when(channel){"wa"->EkmivoGlyph.WA;"ig"->EkmivoGlyph.IG;else->EkmivoGlyph.MS},tint=Color.White,size=15.dp)
  }
 }
}
private fun channelName(channel:String)=when(channel){"wa"->"WhatsApp";"ig"->"Instagram";else->"Messenger"}
private fun clock(raw:String,bn:Boolean)=runCatching{displayDigits(DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Dhaka")).format(Instant.parse(raw)),bn)}.getOrDefault("")
internal suspend fun inboxRequest(context:Context,action:String,thread:String?=null,filters:JSONObject?=null,body:JSONObject?=null,before:Long?=null):JSONObject=withContext(Dispatchers.IO){
 val identity=ReceiptStore(context).use{it.phone()?:it.enrollment()}?:error("UNPAIRED")
 val raw=JSONObject().put("enrollment_id",identity.getString("id")).put("environment",identity.getString("environment")).put("action",action)
 if(thread!=null)raw.put("thread_id",thread)
 if(filters!=null)raw.put("filters",filters)
 if(body!=null)raw.put("body",body)
 if(before!=null)raw.put("before",before)
 val result=ReceiptTransport.post(context,"inbox",identity.getString("id"),UUID.randomUUID().toString(),raw.toString().toByteArray())
 check(result.first==200){"INBOX_HTTP_${result.first}"}
 JSONObject(result.second)
}
@OptIn(ExperimentalFoundationApi::class,androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun InboxRoute(bn:Boolean=false,workspace:WorkspaceAccess,onDetailChange:(Boolean)->Unit={},initialThread:String?=null) {
 val api=rememberInboxApi()
 val app=LocalContext.current.applicationContext
 val owner=androidx.lifecycle.compose.LocalLifecycleOwner.current
 val p=LocalEkmivoPalette.current
 val scope=rememberCoroutineScope()
 val maxBubble=(LocalConfiguration.current.screenWidthDp*.78f).dp
 val prefs=remember(workspace.id,workspace.environment){app.getSharedPreferences("inbox-${workspace.id}-${workspace.environment}",Context.MODE_PRIVATE)}
 var channel by rememberSaveable{mutableStateOf(prefs.getString("channel","").orEmpty())}
 var unread by rememberSaveable{mutableStateOf(prefs.getBoolean("unread",false))}
 var mode by rememberSaveable{mutableStateOf(prefs.getString("mode","").orEmpty())}
 var days by rememberSaveable{mutableIntStateOf(prefs.getInt("days",0))}
 var query by rememberSaveable{mutableStateOf("")}
 var filterOpen by remember{mutableStateOf(false)}
 var threads by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var messages by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var thread by rememberSaveable{mutableStateOf(initialThread)}
 LaunchedEffect(initialThread){if(initialThread!=null)thread=initialThread}
 var info by remember{mutableStateOf<JSONObject?>(null)}
 var profileOpen by remember{mutableStateOf(false)}
 var actionsMessage by remember{mutableStateOf<JSONObject?>(null)}
 var selected by remember{mutableStateOf<JSONObject?>(null)}
 var reply by remember{mutableStateOf<JSONObject?>(null)}
 var input by rememberSaveable(thread){mutableStateOf("")}
 var pendingKey by rememberSaveable(thread){mutableStateOf<String?>(null)}
 var failure by remember{mutableStateOf(false)}
 var loaded by remember{mutableStateOf(false)}
 var recording by remember{mutableStateOf(false)}
 var busy by remember{mutableStateOf(false)}
 var net by remember{mutableStateOf(online(app))}
 var listPage by remember{mutableIntStateOf(0)}
 var hasMore by remember{mutableStateOf(false)}
 var olderAvailable by remember{mutableStateOf(false)}
 val scroll=rememberLazyListState()
 val voiceWorkspaceKey=workspace.id+"|"+workspace.environment
 val localVoices=remember(thread,voiceWorkspaceKey) {
  mutableStateListOf<LocalVoiceMessage>().apply {
   if(thread!=null)addAll(VoiceOutbox.load(app,voiceWorkspaceKey,thread!!))
  }
 }
 fun persistVoices(){
  thread?.let{VoiceOutbox.save(app,voiceWorkspaceKey,it,localVoices)}
 }
 var openingReadSequence by remember{mutableLongStateOf(0L)}
 var refreshNonce by remember{mutableIntStateOf(0)}
 var refreshing by remember{mutableStateOf(false)}
 var initializedThread by remember{mutableStateOf<String?>(null)}
 var flashed by remember{mutableStateOf<String?>(null)}
 val longPressConfig=LocalViewConfiguration.current
 val exactPress=remember(longPressConfig){object:ViewConfiguration by longPressConfig {override val longPressTimeoutMillis:Long=430L}}
 val awayFromBottom by remember{derivedStateOf{val layout=scroll.layoutInfo;val last=layout.visibleItemsInfo.lastOrNull();last!=null&&((layout.totalItemsCount-last.index)>2 || last.offset+last.size-layout.viewportEndOffset>120)}}


 fun fail(){failure=true}
 suspend fun loadMessages(id:String,older:Boolean=false) {
  val before=if(older)messages.firstOrNull()?.optLong("sequence") else null
  val response=api.call("messages",id,before=before)
  info=response.getJSONObject("thread")
  val fetched=response.getJSONArray("items").rows()
  if(older||messages.isEmpty())olderAvailable=fetched.size==50
  messages=if(older)(fetched+messages).distinctBy{it.getString("id")}else (messages.filter{m->fetched.firstOrNull()?.optLong("sequence")?.let{m.optLong("sequence")<it}==true}+fetched).distinctBy{it.getString("id")}
  val deliveredIds=messages.mapNotNull{it.optJSONObject("content")?.optString("media_id")?.takeIf(String::isNotBlank)}.toSet()
  val reconciled=localVoices.filter{it.mediaId in deliveredIds}
  if(reconciled.isNotEmpty()){
   localVoices.removeAll(reconciled)
   persistVoices()
   reconciled.forEach{runCatching{it.file.delete()}}
  }
  if(initializedThread!=id&&fetched.isNotEmpty()) {
   val cursor=info?.optLong("read_sequence")?:0L
   openingReadSequence=cursor
   val firstUnread=messages.indexOfFirst{it.optString("sender")=="customer"&&it.optLong("sequence")>cursor}
   scroll.scrollToItem((if(firstUnread>=0)firstUnread else messages.lastIndex)+if(olderAvailable)1 else 0)
   initializedThread=id
  }

 }
 fun quoteOriginal(id:String){scope.launch {
  try {
   while(isActive&&olderAvailable&&messages.none{it.optString("id")==id})loadMessages(thread?:return@launch,true)
   val index=messages.indexOfFirst{it.optString("id")==id}
   if(index>=0){scroll.animateScrollToItem(index+if(olderAvailable)1 else 0);flashed=id;delay(1200);flashed=null}
  }catch(e:CancellationException){throw e}catch(_:Exception){fail()}
 }}
 LaunchedEffect(thread){onDetailChange(thread!=null);profileOpen=false;actionsMessage=null;selected=null;reply=null;initializedThread=null;messages=emptyList();info=null}
 DisposableEffect(Unit){onDispose{onDetailChange(false)}}
 BackHandler(enabled=thread!=null||filterOpen){if(filterOpen)filterOpen=false else if(selected!=null)selected=null else thread=null}
 LaunchedEffect(channel,unread,mode,days,query,listPage,refreshNonce){
  prefs.edit().putString("channel",channel).putBoolean("unread",unread).putString("mode",mode).putInt("days",days).apply()
  while(isActive) {
   if(!owner.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)){delay(1000);continue}
   net=online(app)
   try {
    val f=JSONObject().put("channel",channel).put("unread",unread).put("mode",mode).put("days",days).put("q",query).put("offset",listPage*50)
    val result=(0..listPage).flatMap{page->api.call("list",filters=JSONObject(f.toString()).put("offset",page*50)).getJSONArray("items").rows()}
    hasMore=result.size==(listPage+1)*50
    threads=result.distinctBy{it.getString("id")}
    failure=false;loaded=true
   }catch(e:CancellationException){throw e}catch(_:Exception){fail()}
   refreshing=false
   delay(2000)
  }
 }
 LaunchedEffect(thread){
  val id=thread?:return@LaunchedEffect
  while(isActive){
   if(!owner.lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)){delay(1000);continue}
   try{loadMessages(id);failure=false}catch(e:CancellationException){throw e}catch(_:Exception){fail()}
   delay(2000)
  }
 }
 LaunchedEffect(thread){
  val id=thread?:return@LaunchedEffect
  var acknowledged=0L
  owner.lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED){
   snapshotFlow{scroll.layoutInfo.visibleItemsInfo.map{it.key.toString()}}.collectLatest{visible->
    val sequence=messages.filter{it.optString("id") in visible}.maxOfOrNull{it.optLong("sequence")}?:0L
    if(sequence>acknowledged)try{api.call("read",id,body=JSONObject().put("sequence",sequence));acknowledged=sequence}catch(e:CancellationException){throw e}catch(_:Exception){fail()}
   }
  }
 }
 fun dispatchVoice(voice:LocalVoiceMessage){
  if(voice.status=="pending"||voice.status=="sent")return
  voice.status="pending"
  persistVoices()
  scope.launch{
   try {
    submitRecordedVoice(api,voice)
    voice.status="sent"
    persistVoices()
    runCatching{loadMessages(voice.threadId)}
   }catch(e:CancellationException){voice.status="failed";persistVoices();throw e}
   catch(_:Exception){voice.status="failed";persistVoices()}
  }
 }
 fun action(name:String,body:JSONObject){val id=thread?:return;scope.launch{busy=true;try{api.call(name,id,body=body);loadMessages(id);failure=false}catch(e:CancellationException){throw e}catch(_:Exception){fail()}finally{busy=false}}}
 Column(Modifier.fillMaxSize().background(p.canvas)) {
  if(thread==null) {
   EkmivoReferenceHeader(if(bn)"ইনবক্স" else "Inbox",titleIsPage=true,trailing={
    Text(if(!net)(if(bn)"অফলাইন" else "Offline")else(if(bn)"লাইভ" else "Live"),style=EkmivoType.meta,color=if(!net)p.warning else p.success)
    Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.surface).border(1.dp,p.border,RoundedCornerShape(10.dp)).clickable{filterOpen=true},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.FLT,tint=p.secondary)}
   })
   Row(Modifier.horizontalScroll(rememberScrollState()).padding(start=16.dp,end=16.dp,top=4.dp,bottom=8.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
    EkmivoFilterChip(if(bn)"সব" else "All",!unread&&channel==""){unread=false;channel="";listPage=0}
    EkmivoFilterChip(if(bn)"অপঠিত" else "Unread",unread){unread=!unread;listPage=0}
    listOf("wa","ig","ms").forEach{ch->EkmivoFilterChip(channelName(ch),channel==ch){channel=if(channel==ch)"" else ch;listPage=0}}
   }

  }else {
   Row(Modifier.fillMaxWidth().topHairline(p.border).padding(horizontal=10.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
    Box(Modifier.size(34.dp).clickable{thread=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.ARR,tint=p.secondary)}
    ChannelAvatar(info?.optString("name").orEmpty().take(1),info?.optString("channel").orEmpty(),34.dp)
    Column(Modifier.weight(1f).clickable{profileOpen=true}) {Text(info?.optString("name").orEmpty(),style=EkmivoType.chatName,color=p.text,maxLines=1);Text(channelName(info?.optString("channel").orEmpty()),style=EkmivoType.meta,color=p.secondary)}
    if(selected==null)EkmivoPill(if(info?.optBoolean("ai_enabled")==true)(if(bn)"AI চালু" else "AI on")else(if(bn)"AI বন্ধ" else "AI off"),info?.optBoolean("ai_enabled")==true){action("ai",JSONObject().put("enabled",info?.optBoolean("ai_enabled")!=true))}
    else {
     Box(Modifier.size(34.dp).clickable{reply=selected;selected=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.REP)}
     if(selected?.optString("type")=="text")Box(Modifier.size(34.dp).clickable{(app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("",selected?.optString("body")));selected=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.COPY)}
     Box(Modifier.size(34.dp).clickable{actionsMessage=selected;selected=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.INFO)}
     Box(Modifier.size(34.dp).clickable{selected=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.X)}
    }
   }
  }
  if(!net||failure)Row(Modifier.padding(horizontal=16.dp).clip(RoundedCornerShape(12.dp)).background(p.warningBackground).padding(12.dp)) {
   Text(if(!net)(if(bn)"ইন্টারনেট নেই। নেট এলে নতুন মেসেজ আসবে। এখন উত্তর পাঠানো যাবে না।" else "No internet. Messages will sync when connected.")else(if(bn)"তথ্য লোড করা যায়নি। আবার চেষ্টা হচ্ছে।" else "Unable to sync. Retrying."),style=EkmivoType.heroNote,color=p.warning)
  }
  if(thread==null)androidx.compose.material3.pulltorefresh.PullToRefreshBox(isRefreshing=refreshing,onRefresh={refreshing=true;refreshNonce++},modifier=Modifier.weight(1f)) {
  LazyColumn(Modifier.fillMaxSize()) {
   if(!loaded&&!failure)item{Text(if(bn)"লোড হচ্ছে…" else "Loading…",modifier=Modifier.padding(16.dp),color=p.secondary)}
   if(loaded&&threads.isEmpty())item{Column(Modifier.fillMaxWidth().padding(30.dp),horizontalAlignment=Alignment.CenterHorizontally){Text(if(bn)"কোনো কনভারসেশন পাওয়া যায়নি।" else "No conversations found.",style=EkmivoType.body,color=p.secondary);if(channel!=""||unread||mode!=""||days>0)EkmivoPill(if(bn)"ফিল্টার মুছুন" else "Clear filters",false){channel="";unread=false;mode="";days=0;listPage=0}}}
   items(threads,key={it.getString("id")}){t->Row(Modifier.fillMaxWidth().topHairline(p.border).clickable{thread=t.getString("id")}.padding(horizontal=16.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
    ChannelAvatar(t.optString("name").take(1),t.optString("channel"))
    Column(Modifier.weight(1f)){Text(t.optString("name"),style=EkmivoType.shop,color=p.text,maxLines=1);Text((if(t.optString("preview_sender")=="ai")"AI: " else "")+t.optString("preview"),style=EkmivoType.heroNote,color=p.secondary,maxLines=1)}
    Column(horizontalAlignment=Alignment.End){Text(clock(t.optString("last_activity_at"),bn),style=EkmivoType.meta,color=p.secondary);if(t.optInt("unread")>0)EkmivoStatusTag(displayDigits(t.optInt("unread").toString(),bn),p.text,p.onPrimary)}
   }}
   if(hasMore)item{EkmivoPill(if(bn)"আরও দেখুন" else "Load more",false){listPage++}}
  }
  }else {
   Box(Modifier.weight(1f)) {
   LazyColumn(Modifier.fillMaxSize(),state=scroll,contentPadding=PaddingValues(vertical=10.dp)) {
    if(olderAvailable)item{EkmivoPill(if(bn)"আগের মেসেজ" else "Earlier messages",false){scope.launch{try{loadMessages(thread!!,true)}catch(_:Exception){fail()}}}}
    itemsIndexed(messages,key={_,m->m.getString("id")}) {index,m->
     if(m.optString("type")=="reaction")return@itemsIndexed
     val batchID=m.optString("batch_id").takeUnless{it.isBlank()||it=="null"}
     if(batchID!=null&&m.optString("type")=="image"&&index>0&&messages[index-1].optString("batch_id")==batchID)return@itemsIndexed
     val mediaGroup=if(batchID!=null&&m.optString("type")=="image")messages.drop(index).takeWhile{it.optString("batch_id")==batchID&&it.optString("type")=="image"}else emptyList()

     val own=m.optString("sender")!="customer"
     // Human messages use a subtle tint, never the opposite theme's foreground as a fill.
     val fill=when(m.optString("sender")){"seller"->lerp(p.raised,p.success,.10f);"ai"->p.raised;else->p.surface}
     val ink=p.text
     var dragged by remember(m.getString("id")){mutableFloatStateOf(0f)}
     var crossed by remember(m.getString("id")){mutableStateOf(false)}
     val shift by animateFloatAsState(dragged,animationSpec=tween(if(dragged==0f)380 else 0),label="reply-swipe")
     val day=m.optString("created_at").take(10)
     if(index==0||messages[index-1].optString("created_at").take(10)!=day)Box(Modifier.fillMaxWidth().padding(vertical=10.dp),contentAlignment=Alignment.Center){Text(displayDigits(day,bn),style=EkmivoType.meta,color=p.secondary)}
     val readSequence=openingReadSequence
     if(m.optString("sender")=="customer"&&m.optLong("sequence")>readSequence&&messages.take(index).none{it.optString("sender")=="customer"&&it.optLong("sequence")>readSequence})Box(Modifier.fillMaxWidth().padding(8.dp),contentAlignment=Alignment.Center){Text(if(bn)"অপঠিত মেসেজ" else "Unread messages",style=EkmivoType.meta,color=p.success)}

     Row(Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=2.dp),horizontalArrangement=if(own)Arrangement.End else Arrangement.Start) {
      CompositionLocalProvider(LocalViewConfiguration provides exactPress) {
      Column(Modifier.graphicsLayer{translationX=shift}.semantics {customActions=listOf(CustomAccessibilityAction(if(bn)"উত্তর দিন" else "Reply"){reply=m;true})}.widthIn(max=maxBubble).clip(RoundedCornerShape(topStart=16.dp,topEnd=16.dp,bottomStart=if(!own&&messages.getOrNull(index+1)?.optString("sender")!=m.optString("sender"))5.dp else 16.dp,bottomEnd=if(own&&messages.getOrNull(index+1)?.optString("sender")!=m.optString("sender"))5.dp else 16.dp)).background(if(selected?.optString("id")==m.optString("id")||flashed==m.optString("id"))p.warningBackground else fill)
       .combinedClickable(onClick={if(mediaGroup.any{it.optString("state")=="failed"})mediaGroup.filter{it.optString("state")=="failed"}.forEach{action("retry",JSONObject().put("message_id",it.getString("id")))}else if(m.optString("state")=="failed")action("retry",JSONObject().put("message_id",m.getString("id")))else selected=null},onLongClick={selected=m})
       .pointerInput(m.getString("id")){detectHorizontalDragGestures(onDragStart={dragged=0f;crossed=false;selected=null},onDragEnd={if(crossed)reply=m;dragged=0f},onDragCancel={dragged=0f},onHorizontalDrag={change,amount->change.consume();val next=(dragged+amount).coerceAtLeast(0f);val threshold=56.dp.toPx();dragged=if(next>threshold)threshold+(next-threshold)*.28f else next;if(dragged>=threshold&&!crossed){crossed=true;(app.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator)?.vibrate(android.os.VibrationEffect.createOneShot(12,android.os.VibrationEffect.DEFAULT_AMPLITUDE))}})}.padding(horizontal=12.dp,vertical=9.dp)) {
       if(own&&messages.getOrNull(index-1)?.optString("sender")!=m.optString("sender"))Text(if(m.optString("sender")=="ai")"AI" else if(bn)"আপনি" else "You",style=EkmivoType.messageSender,color=ink.copy(alpha=.7f))
       val replyID=m.optString("reply_to").takeUnless{it.isBlank()||it=="null"}
       val original=messages.firstOrNull{it.optString("id")==replyID}
       val quoteBody=when(original?.optString("type")) {
        "audio"->if(bn)"ভয়েস মেসেজ" else "Voice message"
        "image"->if(bn)"ছবি" else "Photo"
        "document"->if(bn)"ডকুমেন্ট" else "Document"
        "product"->if(bn)"পণ্য" else "Product"
        else->original?.optString("body").orEmpty().ifBlank {
         m.optString("reply_body").takeUnless{it.isBlank()||it=="null"}?:if(bn)"মেসেজ" else "Message"
        }
       }
       if(replyID!=null)Column(Modifier.clip(RoundedCornerShape(9.dp))
        .background(ink.copy(alpha=.075f)).drawBehind{drawLine(p.success,Offset.Zero,Offset(0f,size.height),3.dp.toPx())}
        .clickable{quoteOriginal(replyID)}.padding(horizontal=9.dp,vertical=6.dp)) {
        Text(when(original?.optString("sender")){"customer"->info?.optString("name").orEmpty();"ai"->"AI";"seller"->if(bn)"আপনি" else "You";else->if(bn)"রিপ্লাই" else "Reply"},
         style=EkmivoType.messageSender,color=p.success)
        Text(quoteBody,style=EkmivoType.heroNote,color=ink.copy(alpha=.72f),maxLines=1)
       }
       InboxMessageContent(m,mediaGroup,thread!!,bn,ink)
       Row(Modifier.align(Alignment.End),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(3.dp)) {
        Text(clock(m.optString("created_at"),bn),style=EkmivoType.messageTime,color=ink.copy(alpha=.65f))
        if(own) {
         val status=if(mediaGroup.isEmpty())m.optString("state")else listOf("uncertain","failed","queued","sending","sent","delivered","seen").firstOrNull{state->mediaGroup.any{it.optString("state")==state}}?:m.optString("state")
         if(status in listOf("failed","uncertain"))EkmivoReferenceIcon(EkmivoGlyph.X,tint=p.danger,size=13.dp,description=if(bn)"আবার পাঠান" else "Retry message")
         else {
          val tint=if(status=="seen")p.seen else ink.copy(alpha=.65f)
          EkmivoReferenceIcon(if(status in listOf("queued","sending"))EkmivoGlyph.CLK else EkmivoGlyph.CHK,tint=tint,size=13.dp)
          if(status in listOf("seen","delivered"))EkmivoReferenceIcon(EkmivoGlyph.CHK,tint=tint,size=13.dp)
         }
        }
       }
      }
      }
     }
    }
    items(localVoices,key={it.id}){voice->
     LocalVoiceBubble(voice,bn,onRetry={dispatchVoice(voice)})
    }
   }
   if(awayFromBottom)Box(Modifier.align(Alignment.BottomEnd).padding(end=14.dp,bottom=12.dp).size(40.dp).clip(CircleShape).background(p.raised).border(1.dp,p.border,CircleShape).clickable{scope.launch{scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0))}}.semantics{contentDescription=if(bn)"নিচে যান" else "Jump to latest"},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.DOWN,tint=p.text,size=21.dp)}
   }
   if(reply!=null)Row(Modifier.fillMaxWidth().padding(start=12.dp,end=12.dp,top=6.dp)
     .clip(RoundedCornerShape(topStart=16.dp,topEnd=16.dp,bottomStart=8.dp,bottomEnd=8.dp)).background(p.surface)
     .border(1.dp,p.border,RoundedCornerShape(topStart=16.dp,topEnd=16.dp,bottomStart=8.dp))
     .padding(horizontal=12.dp,vertical=9.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
     Box(Modifier.width(3.dp).height(34.dp).clip(CircleShape).background(p.success))
     Column(Modifier.weight(1f)) {
      Text(if(reply!!.optString("sender")=="customer")info?.optString("name").orEmpty() else if(reply!!.optString("sender")=="ai")"AI" else if(bn)"আপনি" else "You",style=EkmivoType.messageSender,color=p.success)
      Text(reply!!.optString("body").ifBlank { when(reply!!.optString("type")){"audio"->if(bn)"ভয়েস মেসেজ" else "Voice message";"image"->if(bn)"ছবি" else "Photo";else->if(bn)"মেসেজ" else "Message"} },style=EkmivoType.heroNote,color=p.secondary,maxLines=1)
     }
     Box(Modifier.size(30.dp).clip(CircleShape).clickable{reply=null},contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.X,tint=p.secondary,size=17.dp)}
    }
   val window=info?.optBoolean("window_open")==true
   if(!window&&info!=null)Column(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(14.dp)).background(p.surface).padding(12.dp)){Text(if(bn)"২৪ ঘণ্টা পার হয়ে গেছে" else "24 hours have passed",style=EkmivoType.shop,color=p.text);Text(if(bn)"কাস্টমার নতুন মেসেজ দিলে আবার উত্তর দেওয়া যাবে।" else "You can reply when the customer sends a new message.",style=EkmivoType.heroNote,color=p.secondary)}
   else InboxAttachments(
    thread=thread!!,
    bn=bn,
    capabilities=info?.optJSONObject("capabilities")?:JSONObject(),
    enabled=net&&!busy&&window,
    hasText=input.isNotBlank(),
    replyTo=reply?.optString("id"),
    onRecordingChange={recording=it},
    onVoicePrepared={file,durationMs,quoteId->
     val recorded=VoiceOutbox.preserve(app,file)
     val mediaId=UUID.randomUUID().toString()
     val voice=LocalVoiceMessage(
      id="local-"+mediaId,threadId=thread!!,workspaceKey=voiceWorkspaceKey,
      file=recorded,mediaId=mediaId,idempotencyKey=UUID.randomUUID().toString(),
      batchId=UUID.randomUUID().toString(),durationMs=durationMs,replyTo=quoteId,
      initialStatus="failed"
     )
     localVoices.add(voice)
     persistVoices()
     reply=null
     dispatchVoice(voice)
     scope.launch { kotlinx.coroutines.yield();scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0)) }
    },
    onSendText={
     if(input.isNotBlank()&&!busy&&net&&window) {
      val id=thread!!;val value=input;val quote=reply;val key=pendingKey?:UUID.randomUUID().toString().also{pendingKey=it}
      scope.launch {
       busy=true
       try {
        val body=JSONObject().put("text",value).put("idempotency_key",key)
        if(quote!=null)body.put("reply_to",quote.getString("id"))
        api.call("send",id,body=body)
        pendingKey=null;input="";reply=null;loadMessages(id)
        scroll.animateScrollToItem((messages.size-1).coerceAtLeast(0))
        failure=false
       }catch(e:CancellationException){throw e}catch(_:Exception){fail()}finally{busy=false}
      }
     }
    },
    inputField={
     BasicTextField(
      input,
      {input=it.take(8000);pendingKey=null},
      enabled=net&&!busy&&window,
      textStyle=EkmivoType.chatMessage.copy(color=p.text),
      maxLines=4,
      modifier=Modifier.testTag("chat-input").weight(1f)
       .heightIn(min=38.dp,max=96.dp).padding(start=4.dp,end=2.dp,top=9.dp,bottom=9.dp),
      decorationBox={inner->
       Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.CenterStart) {
        if(input.isEmpty())Text(if(bn)"মেসেজ লিখুন…" else "Write a message…",
         style=EkmivoType.chatMessage,color=p.secondary)
        inner()
       }
      }
     )
    },
    onSent={reply=null;scope.launch{loadMessages(thread!!)}}
   )
  }
 }
 if(profileOpen&&thread!=null)CustomerProfile(thread!!,bn,{profileOpen=false},{scope.launch{loadMessages(thread!!)}})
 actionsMessage?.let{message->if(thread!=null)InboxMessageActions(message,thread!!,bn,info?.optJSONObject("capabilities")?:JSONObject(),{actionsMessage=null},{scope.launch{loadMessages(thread!!)}})}
 if(filterOpen)androidx.compose.material3.ModalBottomSheet(onDismissRequest={filterOpen=false},containerColor=p.raised,tonalElevation=0.dp,dragHandle=null,scrimColor=Color.Black.copy(alpha=.5f),shape=RoundedCornerShape(topStart=24.dp,topEnd=24.dp)) {
  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(p.raised).padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
   Text(if(bn)"ফিল্টার" else "Filters",style=EkmivoType.button,color=p.text)
   listOf("" to (if(bn)"সব" else "All"),"ai" to (if(bn)"AI রিপ্লাই দিচ্ছে" else "AI replies"),"seller" to (if(bn)"আপনি রিপ্লাই দিচ্ছেন" else "You reply"),"waiting" to (if(bn)"উত্তর বাকি" else "Awaiting reply")).forEach{(key,label)->EkmivoFilterChip(label,mode==key){mode=key;listPage=0}}
   Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){listOf(0,1,7,30).forEach{n->EkmivoFilterChip(if(n==0)(if(bn)"সব" else "All")else if(n==1)(if(bn)"আজ" else "Today")else displayDigits(n.toString(),bn)+(if(bn)" দিন" else " days"),days==n){days=n;listPage=0}}}
   EkmivoPrimaryButton(if(bn)"কনভারসেশন দেখুন" else "View conversations",onClick={filterOpen=false})
  }
 }
}
