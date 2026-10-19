package com.ekmivo.mobile.receipt

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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
fun EkmivoSmsHome(bn:Boolean,state:ConnectionState,onRetry:()->Unit) {
 val app=LocalContext.current.applicationContext
 val p=LocalEkmivoPalette.current
 var data by remember{mutableStateOf<HomeData?>(null)}
 LaunchedEffect(Unit){while(true){data=withContext(Dispatchers.IO){homeData(app)};delay(1000)}}
 val d=data
 val offline=state is ConnectionState.Degraded&&(state.reason==DegradedReason.OFFLINE||state.reason==DegradedReason.NETWORK_TIMEOUT)
 LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(bottom=16.dp)) {
  item {
   if(offline)Row(Modifier.padding(horizontal=16.dp).clip(RoundedCornerShape(12.dp)).background(p.warningBackground).padding(12.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
    EkmivoReferenceIcon(EkmivoGlyph.ALT,tint=p.warning)
    Column {Text(if(bn)"ইন্টারনেট নেই" else "No internet",style=EkmivoType.shop,color=p.warning);Text(if(bn)"SMS ফোনে জমা আছে। নেট এলে নিজে থেকে পাঠানো হবে।" else "SMS are saved on this phone and will send when connected.",style=EkmivoType.heroNote,color=p.secondary)}
   }
   Column(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=10.dp),horizontalAlignment=Alignment.CenterHorizontally) {
    EkmivoPulseRing(reducedMotion=offline,ringColor=if(offline)p.warning else p.success) {
     Column(Modifier.size(112.dp).clip(CircleShape).background(p.surface).border(1.dp,p.border,CircleShape),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
      Text(d?.takeUnless{it.unavailable}?.let{(if(offline)it.pending else it.todayAcknowledged)?.let{n->displayDigits(n.toString(),bn)}?:"—"}?:"—",style=EkmivoType.heroAmount,color=p.text)
      Text(if(offline)(if(bn)"পাঠানোর অপেক্ষায়" else "Waiting to send")else(if(bn)"আজ পাঠানো SMS" else "SMS sent today"),style=EkmivoType.meta,color=p.secondary)
     }
    }
    Spacer(Modifier.height(12.dp))
    Text(HomeContent.chip(state,bn),style=EkmivoType.heroNote,color=if(offline)p.warning else p.secondary)
   }
   Row(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=12.dp,bottom=4.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
    listOf((if(bn)"এই সপ্তাহ" else "This week") to d?.weekAcknowledged,(if(bn)"অপেক্ষায়" else "Pending") to d?.pending,(if(bn)"ব্যর্থ" else "Failed") to d?.failed).forEach{(label,n)->
     Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(p.surface).padding(horizontal=10.dp,vertical=9.dp)) {
      Text(if(d?.unavailable!=false||n==null)"—" else displayDigits(n.toString(),bn),style=EkmivoType.statNumber,color=p.text)
      Text(label,style=EkmivoType.meta,color=p.secondary)
     }
    }
   }
   Text(if(bn)"সাম্প্রতিক SMS" else "Recent SMS",style=EkmivoType.section,color=p.secondary,modifier=Modifier.padding(start=16.dp,top=12.dp,bottom=6.dp))
   if(d?.unavailable==true)Text(if(bn)"SMS তথ্য লোড করা যায়নি" else "SMS data unavailable",color=p.danger,modifier=Modifier.padding(16.dp))
   else if(d?.items?.isEmpty()==true)Text(if(bn)"এখনো কোনো SMS নেই" else "No SMS yet",style=EkmivoType.body,color=p.secondary,modifier=Modifier.padding(16.dp))
  }
  items(d?.items.orEmpty().take(30),key={it.id}) {item->
   Row(Modifier.fillMaxWidth().topHairline(p.border).clickable(enabled=item.state==FeedState.FAILED,onClick=onRetry).padding(horizontal=16.dp,vertical=9.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.raised),contentAlignment=Alignment.Center){EkmivoReferenceIcon(EkmivoGlyph.MSG,tint=p.secondary,size=16.dp)}
    Column(Modifier.weight(1f)) {
     Text(if(item.maskedNumber.isNotBlank())"••••"+displayDigits(item.maskedNumber,bn) else item.sender,style=EkmivoType.shop,color=p.text)
     Text(displayDigits(((System.currentTimeMillis()-item.timestamp).coerceAtLeast(0)/60000).toString(),bn)+(if(bn)" মি আগে" else " min ago"),style=EkmivoType.meta,color=p.secondary)
    }
    EkmivoStatusTag(HomeContent.status(item.state,bn),when(item.state){FeedState.SENT->p.successBackground;FeedState.FAILED->p.dangerBackground;else->p.warningBackground},when(item.state){FeedState.SENT->p.success;FeedState.FAILED->p.danger;else->p.warning})
   }
  }
 }
}
