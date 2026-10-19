package com.ekmivo.mobile.receipt

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.ekmivo.mobile.ui.*

/** One permission per screen. OEM steps never fabricate an OS-verified OK. */
@Composable
fun SetupWizard(bn:Boolean,onLanguageChange:(Boolean)->Unit,onDone:()->Unit,payments:Boolean=true,ai:Boolean=false,workspaceName:String="Ekmivo") {
 val context=LocalContext.current
 val health=remember(context){SetupHealth(context.applicationContext)}
 val owner=LocalLifecycleOwner.current
 val p=LocalEkmivoPalette.current
 var snapshot by remember{mutableStateOf(health.refresh())}
 var why by rememberSaveable{mutableStateOf(false)}
 var smsTried by rememberSaveable{mutableStateOf(false)}
 var notificationsTried by rememberSaveable{mutableStateOf(false)}
 var settingsFailed by remember{mutableStateOf(false)}
 fun refresh(){snapshot=health.refresh()}
 DisposableEffect(owner,health){
  val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME)refresh()}
  owner.lifecycle.addObserver(observer)
  onDispose{owner.lifecycle.removeObserver(observer)}
 }
 val smsLauncher=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){
  smsTried=true;refresh()
 }
 val notifLauncher=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){
  notificationsTried=true;refresh()
 }
 val settingsLauncher=rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()){
  refresh()
 }
 fun appSettings(){
  settingsFailed=runCatching{
   settingsLauncher.launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
    Uri.parse("package:"+context.packageName)))
  }.isFailure
 }
 fun batterySettings(){
  val direct=Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
   Uri.parse("package:"+context.packageName))
  if(runCatching{settingsLauncher.launch(direct)}.isFailure &&
     runCatching{settingsLauncher.launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}.isFailure)
   appSettings()
 }
 fun samsungSettings(){
  val vendor=Intent("com.samsung.android.sm.ACTION_BATTERY")
  if(runCatching{settingsLauncher.launch(vendor)}.isFailure &&
     runCatching{settingsLauncher.launch(Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS))}.isFailure)
   appSettings()
 }
 val step=SetupPlan.firstMissing(snapshot,payments)
 val totalSteps=SetupPlan.steps(snapshot.samsung,payments)
 val stepIndex=step?.let{totalSteps.indexOf(it)}?:totalSteps.size
 val permission=when(step){
  SetupStep.SMS->Manifest.permission.RECEIVE_SMS
  SetupStep.NOTIFICATION->if(Build.VERSION.SDK_INT>=33)Manifest.permission.POST_NOTIFICATIONS else ""
  else->""
 }
 val activity=context as? Activity
 val restricted=when(step){
  SetupStep.SMS->smsTried && activity!=null &&
   !ActivityCompat.shouldShowRequestPermissionRationale(activity,permission)
  SetupStep.NOTIFICATION->notificationsTried && activity!=null &&
   !ActivityCompat.shouldShowRequestPermissionRationale(activity,permission)
  else->false
 }
 val title=when(step){
  SetupStep.SMS->if(bn)"পেমেন্ট SMS পড়তে দিন" else "Allow payment SMS access"
  SetupStep.NOTIFICATION->if(bn)"নোটিফিকেশন চালু করুন" else "Enable notifications"
  SetupStep.BATTERY->if(bn)"ব্যাকগ্রাউন্ডে চালু রাখুন" else "Keep Ekmivo running"
  SetupStep.OEM->if(bn)"স্লিপিং অ্যাপ তালিকা থেকে সরান" else "Remove from sleeping apps"
  null->if(bn)"সব ঠিক আছে" else "All set"
 }
 val body=when(step){
  SetupStep.SMS->if(bn)"পেমেন্টের SMS চিনে Ekmivo-তে পাঠাতে এই অনুমতি দরকার। বাকি SMS পাঠানো হবে না।"
   else "Allow Ekmivo to recognize and forward payment SMS. Other SMS are not forwarded."
  SetupStep.NOTIFICATION->if(!payments) {if(bn)"কাস্টমার রিপ্লাই দিলে সাথে সাথে জানাতে নোটিফিকেশন দরকার।" else "Get notified when a customer replies."} else if(bn)"ফরওয়ার্ডিং চালু আছে কি না, আর কোনো SMS ব্যর্থ হলে সেটা জানাতে নোটিফিকেশন দরকার।" else "Notifications help you see forwarding and delivery problems."
  SetupStep.BATTERY->if(bn)"স্ক্রিন বন্ধ থাকলেও পেমেন্ট SMS মিস না করতে Ekmivo-কে ব্যাটারি সীমাবদ্ধতা থেকে ছাড় দিন।"
   else "Exclude Ekmivo from battery restrictions to help forward SMS with the screen off."
  SetupStep.OEM->if(bn)"Samsung Settings-এ Sleeping এবং Deep sleeping apps থেকে Ekmivo সরান।"
   else "In Samsung Settings, remove Ekmivo from Sleeping and Deep sleeping apps."
  null->if(!payments) {if(bn)"কাস্টমার মেসেজের নোটিফিকেশন এখন এই ফোনে আসবে।" else "Customer message notifications are now enabled."} else if(bn)"ফোনটি ওয়ার্কস্পেসের সাথে যুক্ত। পেমেন্টের SMS নিজে থেকে পাঠানো হবে।" else "This phone is connected. Payment SMS will be sent automatically."
 }
 val action=when{
  step==null->if(bn)"শুরু করুন" else "Start"
  restricted->if(bn)"অ্যাপ সেটিংস খুলুন" else "Open app settings"
  step==SetupStep.OEM->if(bn)"সেটিংস খুলুন" else "Open settings"
  else->if(bn)"অনুমতি দিন" else "Allow access"
 }
 Column(
  Modifier.fillMaxSize().background(p.canvas).statusBarsPadding().navigationBarsPadding(),
  horizontalAlignment=Alignment.CenterHorizontally
 ){
  Row(
   Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=16.dp),
   verticalAlignment=Alignment.CenterVertically,
   horizontalArrangement=Arrangement.spacedBy(10.dp)
  ){
   Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
    contentAlignment=Alignment.Center){Text("e.",style=EkmivoType.shop,color=p.onPrimary)}
   Text(workspaceName,style=EkmivoType.shop,color=p.text)
   Spacer(Modifier.weight(1f))
   EkmivoLanguageSwitch(bn,onLanguageChange)
  }
  Row(Modifier.padding(top=18.dp),horizontalArrangement=Arrangement.spacedBy(6.dp)){
   repeat(totalSteps.size){i->
    Box(Modifier.size(width=22.dp,height=4.dp).clip(RoundedCornerShape(2.dp))
     .background(if(i<=stepIndex)p.text else p.border))
   }
  }
  Column(
   Modifier.weight(1f).fillMaxWidth().padding(horizontal=24.dp),
   horizontalAlignment=Alignment.CenterHorizontally,
   verticalArrangement=Arrangement.Center
  ){
   Box(Modifier.size(76.dp).clip(RoundedCornerShape(24.dp))
    .background(p.surface).border(1.dp,p.border,RoundedCornerShape(24.dp)),
    contentAlignment=Alignment.Center){SetupLineIcon(step,p.text,p.success)}
   Spacer(Modifier.height(18.dp))
   Text(title,style=EkmivoType.centerTitle,color=p.text,textAlign=TextAlign.Center)
   Spacer(Modifier.height(8.dp))
   Text(body,style=EkmivoType.body,color=p.secondary,textAlign=TextAlign.Center)
   Spacer(Modifier.height(18.dp))
   Row(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalAlignment=Alignment.CenterVertically){
    (if(!payments) emptyList() else listOf(
     SetupStep.SMS to "SMS",
     SetupStep.NOTIFICATION to (if(bn)"নোটিফিকেশন" else "Notifications"),
     SetupStep.BATTERY to (if(bn)"ব্যাটারি" else "Battery")
    )).forEach{(item,label)->
     val ok=snapshot.level(item)==HealthLevel.OK
     EkmivoStatusTag(label+(if(ok)" ✓" else ""),
      if(ok)p.successBackground else p.subtle,
      if(ok)p.success else p.secondary)
    }
   }
   if(why&&step!=null){
    Spacer(Modifier.height(16.dp))
    Text(when(step){
     SetupStep.SMS->if(bn)"সার্ভার অনুমোদিত পেমেন্ট SMS-ই সংগ্রহ করা হয়।" else "Only server-allowed payment candidates are collected."
     SetupStep.NOTIFICATION->if(bn)"SMS পাঠাতে সমস্যা হলে জানাতে সাহায্য করে।" else "Helps report delivery problems."
     SetupStep.BATTERY->if(bn)"Android ব্যাকগ্রাউন্ড আপলোড দেরি করাতে পারে।" else "Android may delay background uploads."
     SetupStep.OEM->if(bn)"Samsung সেটিং অ্যাপ থেকে নিশ্চিত করা যায় না।" else "Samsung does not expose this status to apps."
    },style=EkmivoType.heroNote,color=p.secondary,textAlign=TextAlign.Center)
   }
   if(settingsFailed){
    Spacer(Modifier.height(10.dp))
    Text(if(bn)"সেটিংস খোলা যায়নি। Android Settings খুলুন।"
     else "Unable to open settings. Use Android app settings.",
     color=p.danger,style=EkmivoType.heroNote,textAlign=TextAlign.Center)
   }
  }
  Column(
   Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=24.dp),
   horizontalAlignment=Alignment.CenterHorizontally
  ){
   EkmivoPrimaryButton(action,onClick={
    settingsFailed=false
    when(step){
     SetupStep.SMS->if(restricted)appSettings() else smsLauncher.launch(Manifest.permission.RECEIVE_SMS)
     SetupStep.NOTIFICATION->if(restricted)appSettings() else if(Build.VERSION.SDK_INT>=33)
      notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
     SetupStep.BATTERY->batterySettings()
     SetupStep.OEM->samsungSettings()
     null->onDone()
    }
   })
   if(step==SetupStep.OEM)WizardLink(if(bn)"করেছি, এগিয়ে যান" else "Done, continue"){
    if(health.acknowledgeSamsung())refresh()
   }
   if(step!=null)WizardLink(if(bn)"কেন দরকার?" else "Why is this needed?"){why=!why}
  }
 }
}

@Composable
private fun WizardLink(label:String,onClick:()->Unit){
 val p=LocalEkmivoPalette.current
 Text(label,style=EkmivoType.link,color=p.secondary,
  modifier=Modifier.clickable(onClick=onClick).padding(vertical=12.dp,horizontal=14.dp))
}

@Composable
private fun SetupLineIcon(step:SetupStep?,ink:Color,success:Color){
 Canvas(Modifier.size(32.dp)){
  val u=size.width/32f
  val pen=Stroke(1.8.dp.toPx(),cap=StrokeCap.Round)
  when(step){
   SetupStep.SMS->{
    drawRoundRect(ink,Offset(3*u,5*u),Size(26*u,19*u),
     cornerRadius=androidx.compose.ui.geometry.CornerRadius(4*u),style=pen)
    drawLine(ink,Offset(9*u,24*u),Offset(8*u,28*u),pen.width)
    drawLine(ink,Offset(8*u,28*u),Offset(15*u,24*u),pen.width)
   }
   SetupStep.NOTIFICATION->{
    drawArc(ink,195f,150f,false,topLeft=Offset(6*u,4*u),size=Size(20*u,22*u),style=pen)
    drawLine(ink,Offset(5*u,25*u),Offset(27*u,25*u),pen.width)
    drawCircle(ink,u*2,Offset(16*u,28*u),style=pen)
   }
   SetupStep.BATTERY->{
    drawRoundRect(ink,Offset(4*u,8*u),Size(23*u,16*u),
     cornerRadius=androidx.compose.ui.geometry.CornerRadius(3*u),style=pen)
    drawLine(ink,Offset(29*u,13*u),Offset(29*u,19*u),pen.width)
    drawLine(ink,Offset(12*u,17*u),Offset(20*u,17*u),pen.width)
   }
   SetupStep.OEM->{
    drawRoundRect(ink,Offset(9*u,3*u),Size(14*u,26*u),
     cornerRadius=androidx.compose.ui.geometry.CornerRadius(3*u),style=pen)
    drawLine(ink,Offset(12*u,24*u),Offset(20*u,24*u),pen.width)
   }
   null->{
    drawCircle(success,14*u,Offset(16*u,16*u),style=pen)
    drawLine(success,Offset(9*u,16*u),Offset(14*u,21*u),pen.width)
    drawLine(success,Offset(14*u,21*u),Offset(23*u,11*u),pen.width)
   }
  }
 }
}
