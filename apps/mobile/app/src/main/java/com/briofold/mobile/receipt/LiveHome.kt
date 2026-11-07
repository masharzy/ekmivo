package com.briofold.mobile.receipt

import android.os.Build
import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.briofold.mobile.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

private fun digits(v:String,bn:Boolean):String=if(!bn)v else v.map{
 if(it in '0'..'9')('০'.code+(it-'0')).toChar() else it
}.joinToString("")
private fun currency(v:String?,bn:Boolean):String{
 val n=v?.toDoubleOrNull()?:return "—"
 val amount=DecimalFormat("#,##0.##",DecimalFormatSymbols(Locale.US)).format(n)
 return "৳"+digits(amount,bn)
}
private fun relative(t:Long,bn:Boolean):String{
 val min=((System.currentTimeMillis()-t).coerceAtLeast(0L)/60000).toInt()
 val text=when{
  min<1->if(bn)"এইমাত্র" else "Just now"
  min<60->if(bn)min.toString()+" মিনিট আগে" else min.toString()+" min ago"
  min<1440->if(bn)(min/60).toString()+" ঘণ্টা আগে" else (min/60).toString()+" hr ago"
  else->if(bn)(min/1440).toString()+" দিন আগে" else (min/1440).toString()+" d ago"
 }
 return digits(text,bn)
}
private fun reduceMotion(context:android.content.Context):Boolean=runCatching{
 Settings.Global.getFloat(context.contentResolver,Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f
}.getOrDefault(false)

/** Exact 34dp logo, 10dp radius, 11sp status chip from spec 3.1. */
@Composable
fun HomeHeader(bn:Boolean,state:ConnectionState){
 val p=LocalBriofoldPalette.current
 Row(
  Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=16.dp,bottom=8.dp),
  verticalAlignment=Alignment.CenterVertically,
  horizontalArrangement=Arrangement.spacedBy(10.dp)
 ){
  Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
   contentAlignment=Alignment.Center){
   Text("e.",style=BriofoldType.shop.copy(fontSize=16.sp),color=p.onPrimary)
  }
  Column(Modifier.weight(1f)){
   // Server pairing response does not provide a verified workspace name.
   Text("Briofold",style=BriofoldType.shop,color=p.text)
   Text((Build.MANUFACTURER+" "+Build.MODEL).trim(),
    style=BriofoldType.meta,color=p.secondary,maxLines=1,overflow=TextOverflow.Ellipsis)
  }
  val live=state==ConnectionState.Active
  val revoked=state==ConnectionState.Revoked
  val color=if(revoked)p.danger else if(live)p.text else p.warning
  val pulse=rememberInfiniteTransition(label="live chip")
  val alpha by pulse.animateFloat(.35f,1f,infiniteRepeatable(tween(800),RepeatMode.Reverse),label="live dot")
  val ctx=LocalContext.current
  Row(Modifier.clip(CircleShape).background(p.surface)
   .border(1.dp,p.border,CircleShape).padding(horizontal=10.dp,vertical=4.dp),
   verticalAlignment=Alignment.CenterVertically,
   horizontalArrangement=Arrangement.spacedBy(6.dp)){
   if(!revoked){
    Box(Modifier.size(7.dp).graphicsLayer {
     this.alpha=if(live&&!reduceMotion(ctx))alpha else 1f
    }.clip(CircleShape).background(if(live)p.success else p.warning))
   }
   Text(HomeContent.chip(state,bn),style=BriofoldType.meta,color=color)
  }
 }
}

/** A steady, intentional badge placement overlapping the hero pulse at upper-right. */
@Composable
private fun HeroStatusBadge(bn:Boolean,state:ConnectionState,modifier:Modifier=Modifier) {
 val p=LocalBriofoldPalette.current
 val good=state==ConnectionState.Active
 Row(
  modifier.clip(CircleShape).background(p.surface).border(1.dp,p.border,CircleShape)
   .padding(horizontal=10.dp,vertical=5.dp),
  horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=Alignment.CenterVertically
 ){
  Box(Modifier.size(7.dp).clip(CircleShape).background(if(good)p.success else p.warning))
  Text(HomeContent.chip(state,bn),style=BriofoldType.meta,
   color=if(good)p.text else p.warning,maxLines=1)
 }
}

@Composable
fun BriofoldLiveHome(bn:Boolean,state:ConnectionState,needsAttention:Boolean,onFix:()->Unit){
 val p=LocalBriofoldPalette.current
 val ctx=LocalContext.current.applicationContext
 val owner=LocalLifecycleOwner.current
 var refresh by remember { mutableIntStateOf(0) }
 var data by remember { mutableStateOf<HomeData?>(null) }
 var filter by remember { mutableStateOf<FeedState?>(null) }
 var detail by remember { mutableStateOf<FeedItem?>(null) }
 DisposableEffect(owner){
  val obs=LifecycleEventObserver{_,ev->if(ev==Lifecycle.Event.ON_RESUME)refresh++}
  owner.lifecycle.addObserver(obs); onDispose{owner.lifecycle.removeObserver(obs)}
 }
 LaunchedEffect(refresh,state){
  while(isActive){
   data=withContext(Dispatchers.IO){homeData(ctx)}
   delay(15000)
  }
 }
 val current=data?:HomeData()
 val pendingRows=when(filter){
  null->current.items
  FeedState.PENDING->current.items.filter{it.state!=FeedState.SENT}
  else->current.items.filter{it.state==filter}
 }
 LazyColumn(
  Modifier.fillMaxSize().background(p.canvas),
  contentPadding=PaddingValues(bottom=12.dp)
 ){
  // Shared BriofoldBrandHeader is provided once by the Scaffold topBar.
  if(needsAttention||state is ConnectionState.Degraded) item{
   Row(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=5.dp)
    .clip(RoundedCornerShape(10.dp)).background(p.warningBackground)
    .clickable(onClick=onFix).padding(12.dp),verticalAlignment=Alignment.CenterVertically){
    Text(if(bn)"SMS পাঠাতে সমস্যা হচ্ছে" else "SMS delivery needs attention",
     style=BriofoldType.body,color=p.warning,modifier=Modifier.weight(1f))
    Text(if(bn)"ঠিক করুন ›" else "Fix ›",style=BriofoldType.link,color=p.warning)
   }
  }
  item{
   Column(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=10.dp,bottom=6.dp),
    horizontalAlignment=Alignment.CenterHorizontally){
    Box(Modifier.size(166.dp),contentAlignment=Alignment.Center) {
     BriofoldPulseRing(
      reducedMotion=reduceMotion(ctx)||state!=ConnectionState.Active,
      ringColor=if(state==ConnectionState.Active)p.success else p.warning
     ){
      Column(Modifier.size(112.dp).clip(CircleShape).background(p.surface)
       .border(1.dp,p.border,CircleShape),
       verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){
       Text(currency(
        if(current.acknowledged==0 && !current.unavailable)"0"
        else current.retainedAmount?.toString(),bn),
        style=BriofoldType.heroAmount,color=p.text,maxLines=1,overflow=TextOverflow.Ellipsis)
       Spacer(Modifier.height(2.dp))
       Text(if(bn)"সংরক্ষিত SMS\nপাঠানো" else "Forwarded\nin history",
        style=BriofoldType.meta,color=p.secondary,textAlign=TextAlign.Center,maxLines=2)
      }
     }
     HeroStatusBadge(bn,state,
      Modifier.align(Alignment.TopEnd).offset(x=13.dp,y=(-3).dp))
    }
    Spacer(Modifier.height(12.dp))
    Text(when{
     data==null->if(bn)"SMS লোড হচ্ছে" else "Loading SMS"
     current.unavailable->if(bn)"রিসিপ্টের তথ্য পাওয়া যায়নি" else "Receipt history unavailable"
     current.lastForwarded==null->if(bn)"পাঠানোর সর্বশেষ সময় জানা নেই" else "Last forwarding time unavailable"
     else->(if(bn)"শেষ SMS পাঠানো হয়েছে " else "Last SMS forwarded ")+relative(current.lastForwarded,bn)
    },style=BriofoldType.heroNote,color=p.secondary,textAlign=TextAlign.Center)
   }
  }
  item{
   Row(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=12.dp,bottom=4.dp),
    horizontalArrangement=Arrangement.spacedBy(8.dp)){
    HomeStat(digits(current.acknowledged.toString(),bn),
     if(bn)"সম্প্রতি" else "Recent sent",false,Modifier.weight(1f)){filter=null}
    HomeStat(digits(current.pending.toString(),bn),
     if(bn)"অপেক্ষায়" else "Pending",false,Modifier.weight(1f)){
     filter=if(filter==FeedState.PENDING)null else FeedState.PENDING
    }
    HomeStat(digits(current.failed.toString(),bn),
     if(bn)"ব্যর্থ" else "Failed",true,Modifier.weight(1f)){
     filter=if(filter==FeedState.FAILED)null else FeedState.FAILED
    }
   }
  }
  item{
   Row(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=12.dp,bottom=6.dp),
    verticalAlignment=Alignment.CenterVertically){
    Text(if(bn)"সাম্প্রতিক পেমেন্ট SMS" else "Recent payment SMS",
     style=BriofoldType.section,color=p.secondary,modifier=Modifier.weight(1f))
    if(filter!=null)Text(if(bn)"সব দেখুন" else "Show all",style=BriofoldType.link,
     color=p.secondary,modifier=Modifier.clickable{filter=null})
   }
  }
  if(pendingRows.isEmpty())item{
   Column(Modifier.fillMaxWidth().padding(horizontal=24.dp,vertical=24.dp),
    horizontalAlignment=Alignment.CenterHorizontally){
    Text(if(current.unavailable)(if(bn)"SMS তালিকা পাওয়া যায়নি" else "Receipt history unavailable")
      else (if(bn)"এখনো কোনো SMS নেই" else "No payment SMS yet"),
     style=BriofoldType.shop,color=p.text)
    Spacer(Modifier.height(6.dp))
    Text(if(current.unavailable)(if(bn)"আবার অ্যাপ খুলে দেখুন।" else "Reopen the app to retry.")
     else (if(bn)"পেমেন্টের SMS এলে এখানে পাঠানোর অবস্থা দেখা যাবে।"
     else "Incoming payment SMS and forwarding status appear here."),
     style=BriofoldType.body,color=p.secondary,textAlign=TextAlign.Center)
   }
  }else items(pendingRows,key={it.id}){receipt->
   HomeRow(receipt,bn){detail=receipt}
  }
 }
 if(detail!=null) HomeReceiptSheet(detail!!,bn,{detail=null}) {
  ReceiptSyncWorker.scheduleNow(ctx);detail=null
 }
}

@Composable
private fun RowScope.HomeStat(count:String,label:String,failed:Boolean,modifier:Modifier,onClick:()->Unit){
 val p=LocalBriofoldPalette.current
 Column(modifier.clip(RoundedCornerShape(12.dp)).background(p.surface)
  .clickable(onClick=onClick).padding(horizontal=10.dp,vertical=9.dp)){
  Text(count,style=BriofoldType.statNumber,color=if(failed)p.danger else p.text)
  Text(label,style=BriofoldType.meta,color=p.secondary,maxLines=1)
 }
}

@Composable
private fun HomeRow(item:FeedItem,bn:Boolean,onClick:()->Unit){
 val p=LocalBriofoldPalette.current
 Row(Modifier.fillMaxWidth().topHairline(p.border).clickable(onClick=onClick)
  .padding(horizontal=16.dp,vertical=9.dp),
  verticalAlignment=Alignment.CenterVertically,
  horizontalArrangement=Arrangement.spacedBy(10.dp)){
  // No sender brand palette is supplied by the signed configuration API.
  val initials=item.sender.trim().take(2).uppercase(Locale.ROOT).ifBlank{"·"}
  Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.subtle),
   contentAlignment=Alignment.Center){
   Text(initials,style=BriofoldType.meta,color=p.secondary)
  }
  Column(Modifier.weight(1f)){
   Text(currency(item.amount,bn),style=BriofoldType.rowAmount,color=p.text)
   Text((if(item.maskedNumber.isBlank())"" else "••••"+digits(item.maskedNumber,bn)+" · ")+
    relative(item.timestamp,bn),
    style=BriofoldType.meta,color=p.secondary,maxLines=1,overflow=TextOverflow.Ellipsis)
  }
  val tone=when(item.state){
   FeedState.SENT->p.successBackground to p.success
   FeedState.FAILED->p.dangerBackground to p.danger
   else->p.warningBackground to p.warning
  }
  BriofoldStatusTag(HomeContent.status(item.state,bn),tone.first,tone.second)
 }
}

@Composable
private fun HomeReceiptSheet(item:FeedItem,bn:Boolean,onClose:()->Unit,onRetry:()->Unit){
 val p=LocalBriofoldPalette.current
 Dialog(onDismissRequest=onClose,properties=DialogProperties(usePlatformDefaultWidth=false)){
  Box(Modifier.fillMaxSize().clickable(onClick=onClose),contentAlignment=Alignment.BottomCenter){
   Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart=24.dp,topEnd=24.dp))
    .background(p.raised).clickable(enabled=false){}.padding(20.dp),
    verticalArrangement=Arrangement.spacedBy(10.dp)){
    Text(if(bn)"SMS বিস্তারিত" else "SMS details",style=BriofoldType.centerTitle,color=p.text)
    Text(item.sender,style=BriofoldType.shop,color=p.text)
    Text(HomeContent.status(item.state,bn),style=BriofoldType.meta,
     color=if(item.state==FeedState.FAILED)p.danger else if(item.state==FeedState.SENT)p.success else p.warning)
    Text((if(bn)"পাওয়া: " else "Received: ")+relative(item.timestamp,bn),
     style=BriofoldType.body,color=p.secondary)
    Text((if(bn)"চেষ্টা: " else "Attempts: ")+digits(item.attempts.toString(),bn),
     style=BriofoldType.body,color=p.secondary)
    if(item.error.isNotBlank())Text(item.error,style=BriofoldType.meta,color=p.warning)
    Text(item.raw,style=BriofoldType.body,color=p.text)
    if(item.state!=FeedState.SENT)
     BriofoldPrimaryButton(if(bn)"আবার পাঠান" else "Retry forwarding",onClick=onRetry)
   }
  }
 }
}

/** No automatically generated re-pair request; original evidence stays encrypted. */
@Composable
fun BriofoldDisconnected(bn:Boolean,pending:Int,onReconnect:()->Unit,onQueue:()->Unit){
 val p=LocalBriofoldPalette.current
 val ctx=LocalContext.current.applicationContext
 var queued by remember { mutableStateOf(false) }
 var rows by remember { mutableStateOf<List<org.json.JSONObject>>(emptyList()) }
 LaunchedEffect(queued) {
  if(queued) rows=withContext(Dispatchers.IO){
   ReceiptStore(ctx).use { it.pendingReceipts(40) }
  }
 }
 Column(Modifier.fillMaxSize().background(p.canvas).statusBarsPadding().navigationBarsPadding()){
  HomeHeader(bn,ConnectionState.Revoked)
  Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal=24.dp),
   horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
   Box(Modifier.size(76.dp).clip(RoundedCornerShape(24.dp)).background(p.surface)
    .border(1.dp,p.border,RoundedCornerShape(24.dp)),contentAlignment=Alignment.Center){
    Canvas(Modifier.size(32.dp)){
     drawCircle(p.danger,10.dp.toPx(),style=Stroke(1.8.dp.toPx()))
     drawLine(p.danger,Offset(size.width*.33f,size.height*.67f),
      Offset(size.width*.67f,size.height*.33f),
      strokeWidth=1.8.dp.toPx(),cap=StrokeCap.Round)
    }
   }
   Spacer(Modifier.height(18.dp))
   Text(if(bn)"এই ফোন ড্যাশবোর্ড থেকে বিচ্ছিন্ন" else "This phone was disconnected from your dashboard",
    style=BriofoldType.centerTitle,color=p.text,textAlign=TextAlign.Center)
   Spacer(Modifier.height(8.dp))
   Text(if(bn)"ওয়েব থেকে ডিভাইসটি সরানো হয়েছে। আবার যুক্ত করলেই SMS পাঠানো শুরু হবে।"
    else "The device was removed from the web. Reconnect to resume SMS forwarding.",
    style=BriofoldType.body,color=p.secondary,textAlign=TextAlign.Center)
  }
  Column(Modifier.fillMaxWidth().padding(start=20.dp,end=20.dp,bottom=24.dp),
   horizontalAlignment=Alignment.CenterHorizontally){
   BriofoldPrimaryButton(if(bn)"আবার যুক্ত করুন" else "Reconnect",onClick=onReconnect)
   if(pending>0){
    Spacer(Modifier.height(10.dp))
    Text((if(bn)"অপ্রেরিত SMS দেখুন (" else "View unsent SMS (")+
     digits(pending.toString(),bn)+")",style=BriofoldType.link,color=p.secondary,
     modifier=Modifier.clickable { queued=true;onQueue() }.padding(8.dp))
   }
  }
 }
 if(queued)Dialog(onDismissRequest={queued=false},properties=DialogProperties(usePlatformDefaultWidth=false)){
  Column(Modifier.fillMaxWidth().padding(horizontal=16.dp)
   .clip(RoundedCornerShape(18.dp)).background(p.raised).padding(16.dp)){
   Text(if(bn)"অপ্রেরিত SMS" else "Unsent SMS",style=BriofoldType.centerTitle,color=p.text)
   Spacer(Modifier.height(10.dp))
   if(rows.isEmpty())Text(if(bn)"অপ্রেরিত কোনো SMS নেই" else "No queued SMS",
    style=BriofoldType.body,color=p.secondary)
   LazyColumn(Modifier.heightIn(max=480.dp)){
    items(rows){entry->
     Text(entry.optString("source"),style=BriofoldType.shop,color=p.text)
     Text(entry.optString("evidence"),style=BriofoldType.body,color=p.secondary,
      modifier=Modifier.fillMaxWidth().topHairline(p.border).padding(vertical=10.dp))
    }
   }
   Spacer(Modifier.height(10.dp))
   BriofoldPrimaryButton(if(bn)"বন্ধ করুন" else "Close",onClick={queued=false})
  }
 }
}
