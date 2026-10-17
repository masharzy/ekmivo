package com.ekmivo.mobile.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.BuildConfig
import com.ekmivo.mobile.data.AppPreferences
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.receipt.ForwarderScreen
import com.ekmivo.mobile.receipt.EkmivoLiveHome
import com.ekmivo.mobile.receipt.EkmivoDisconnected
import com.ekmivo.mobile.receipt.ConnectionState
import com.ekmivo.mobile.receipt.ReceiptRepository
import com.ekmivo.mobile.receipt.ReceiptSyncWorker
import com.ekmivo.mobile.receipt.DeviceHeartbeat
import com.ekmivo.mobile.receipt.EkmivoSettingsScreen
import com.ekmivo.mobile.inbox.InboxFeatureFlag
import com.ekmivo.mobile.inbox.InboxPushTokenRegistry
import com.ekmivo.mobile.inbox.InboxRoute
import com.ekmivo.mobile.receipt.ConnectionEvent
import com.ekmivo.mobile.receipt.PairingFlow
import com.ekmivo.mobile.receipt.SetupWizard
import com.ekmivo.mobile.receipt.SetupHealth
import com.ekmivo.mobile.receipt.SetupHealthSnapshot
import com.ekmivo.mobile.receipt.SetupPlan
import com.ekmivo.mobile.receipt.HealthLevel
import com.ekmivo.mobile.receipt.SetupStep
import com.ekmivo.mobile.receipt.ReceiptForwardingService
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import com.ekmivo.mobile.receipt.ReceiptStore
import com.ekmivo.mobile.receipt.ReceiptRecoveryControl
import kotlinx.coroutines.launch

private enum class Tab(val icon:ImageVector) {
 FORWARDER(Icons.Outlined.Smartphone), INBOX(Icons.Outlined.ChatBubbleOutline), SETTINGS(Icons.Outlined.Settings)
}
@Composable
fun EkmivoApp(preferences:AppPreferences, incomingPairingLink:String?=null){
 val appContext=LocalContext.current.applicationContext
 var paired by remember { mutableStateOf(ReceiptStore(appContext).use { it.phone()!=null || it.enrollment()!=null }) }
 val repository=remember { ReceiptRepository.get(appContext) }
 val connection by repository.state.collectAsState()
 var reconnecting by remember { mutableStateOf(false) }
 var pendingRetained by remember { mutableIntStateOf(runCatching{ ReceiptStore(appContext).use{it.count()} }.getOrDefault(0)) }
 val health=remember { SetupHealth(appContext) }
 var healthNow by remember { mutableStateOf(health.refresh()) }
 var wizardActive by remember { mutableStateOf(paired && health.needsWizard()) }
 val owner=LocalLifecycleOwner.current
 val scope=rememberCoroutineScope()
 DisposableEffect(owner) {
  val observer=LifecycleEventObserver { _,event ->
   if(event==Lifecycle.Event.ON_RESUME){
    healthNow=health.refresh()
    pendingRetained=runCatching{ReceiptStore(appContext).use{it.count()}}.getOrDefault(0)
    if(SetupPlan.firstMissing(healthNow)!=null){
     ReceiptForwardingService.stop(appContext)
    }
    if(healthNow.backlogError && healthNow.samsung && healthNow.oemGuideAcknowledged){
     health.noteDeliveryGap()
     healthNow=health.refresh()
    }
   }
  }
  owner.lifecycle.addObserver(observer)
  onDispose { owner.lifecycle.removeObserver(observer) }
 }
 LaunchedEffect(paired) {
  if(paired && InboxFeatureFlag.inboxEnabled) {
   InboxPushTokenRegistry.prepare(appContext)
  }
 }
 LaunchedEffect(paired,wizardActive) {
  if(paired&&!wizardActive && SetupPlan.firstMissing(health.refresh())==null) {
   ReceiptForwardingService.startFromVisibleApp(appContext)
  }
 }
 // Check signed authorization while the app is visible. Server revoke/403
 // updates the repository StateFlow immediately, without app restart.
 LaunchedEffect(owner,paired) {
  owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
   while(isActive){
    val now=System.currentTimeMillis()
    // Direct signed check while visible; never wait for a process restart
    // or stale persisted heartbeat attempt. Background service stays 2 min.
    if(paired) DeviceHeartbeat.check(appContext)
    delay(12_000L)
   }
  }
 }
 val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
 val language by preferences.language.collectAsState(initial=Language.EN)
 val bn=language==Language.BN
 val dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}
 var tab by rememberSaveable{mutableStateOf(Tab.FORWARDER)}
 EkmivoTheme(dark=dark){
  if(connection==ConnectionState.Revoked && !reconnecting){
   EkmivoDisconnected(bn,pendingRetained,
    onReconnect={
     ReceiptForwardingService.stop(appContext)
     reconnecting=true;paired=false;wizardActive=false
     repository.beginPairing()
    },
    onQueue={}
   )
  } else if (!paired || reconnecting || connection==ConnectionState.Unpaired) {
   PairingFlow(
    bn=bn, incomingLink=incomingPairingLink,
    onLanguageChange={ toBn ->
     scope.launch { preferences.updateLanguage(if(toBn) Language.BN else Language.EN) }
    },
    onPaired={paired=true;reconnecting=false;wizardActive=true;healthNow=health.refresh()}
   )
  } else if(wizardActive) {
   SetupWizard(bn=bn,onLanguageChange={toBn ->
    scope.launch { preferences.updateLanguage(if(toBn) Language.BN else Language.EN) }
   },onDone={
    wizardActive=false
    healthNow=health.refresh()
    ReceiptForwardingService.startFromVisibleApp(appContext)
   })
  } else Scaffold(
   containerColor=MaterialTheme.colorScheme.background,
   topBar={
    EkmivoBrandHeader(bn=bn,onLanguageChange={ toBn ->
     scope.launch { preferences.updateLanguage(if(toBn) Language.BN else Language.EN) }
    })
   },
   bottomBar={
    EkmivoBottomNav(bn,if(tab==Tab.SETTINGS)EkmivoPage.SETTINGS else EkmivoPage.LIVE) {
     tab=if(it==EkmivoPage.LIVE)Tab.FORWARDER else Tab.SETTINGS
    }
   }
  ){padding->
   Column(Modifier.fillMaxSize().padding(padding)){
    AnimatedContent(targetState=tab,transitionSpec={
     fadeIn(tween(170)) togetherWith fadeOut(tween(100))
    },label="App section",modifier=Modifier.fillMaxSize()){page->
     when(page){
      Tab.FORWARDER->EkmivoLiveHome(
       bn,connection,healthNow.needsAttention,
       onFix={
        if(healthNow.needsAttention)wizardActive=true
        else ReceiptSyncWorker.scheduleNow(appContext)
       }
      )
      // Off by default; no visible Inbox tab, no demo conversations.
      Tab.INBOX->if(InboxFeatureFlag.inboxEnabled) InboxRoute()
      Tab.SETTINGS->EkmivoSettingsScreen(
       bn=bn,language=language,appearance=appearance,
       changeLanguage={scope.launch{preferences.updateLanguage(it)}},
       changeAppearance={scope.launch{preferences.updateAppearance(it)}},
       onSetup={wizardActive=true},
       onDisconnected={
        paired=false;reconnecting=false;wizardActive=false
        repository.dispatch(ConnectionEvent.Disconnected)
        tab=Tab.FORWARDER
       }
      )
     }
    }
   }
  }
 }
}


@Composable
private fun SetupHealthFixNotice(bn:Boolean,state:SetupHealthSnapshot,onFix:()->Unit){
 val p=LocalEkmivoPalette.current
 Row(
  Modifier.fillMaxWidth().padding(horizontal=18.dp,vertical=6.dp)
   .background(p.warningBackground,RoundedCornerShape(10.dp))
   .clickable(onClick=onFix).padding(12.dp),
  verticalAlignment=Alignment.CenterVertically
 ){
  Text(if(bn)"সেটআপ ঠিক করুন" else "Setup needs attention",
   style=EkmivoType.body,color=p.warning,modifier=Modifier.weight(1f))
  Text(if(bn)"ঠিক করুন ›" else "Fix ›",style=EkmivoType.link,color=p.warning)
 }
}

@Composable
private fun SetupHealthCard(bn:Boolean,state:SetupHealthSnapshot,onFix:()->Unit){
 val p=LocalEkmivoPalette.current
 Column(
  Modifier.fillMaxWidth().background(p.surface,RoundedCornerShape(14.dp))
   .padding(horizontal=14.dp,vertical=10.dp)
 ){
  Text(if(bn)"সেটআপের অবস্থা" else "Setup health",
   style=EkmivoType.settingsTitle,color=p.text)
  listOf(
   SetupStep.SMS to (if(bn)"SMS অনুমতি" else "SMS access"),
   SetupStep.NOTIFICATION to (if(bn)"নোটিফিকেশন" else "Notifications"),
   SetupStep.BATTERY to (if(bn)"ব্যাটারি ছাড়" else "Battery exemption")
  ).forEach{(step,label)->
   val level=state.level(step)
   Row(Modifier.fillMaxWidth().clickable(onClick=onFix).padding(vertical=9.dp),
    verticalAlignment=Alignment.CenterVertically){
    Text(label,style=EkmivoType.settingsRow,color=p.text,modifier=Modifier.weight(1f))
    Text(
     if(level==HealthLevel.OK)(if(bn)"চালু" else "On")
     else if(level==HealthLevel.UNKNOWN)(if(bn)"অজানা ›" else "Unknown ›")
     else (if(bn)"ঠিক করুন ›" else "Fix ›"),
     style=EkmivoType.settingsRow,
     color=if(level==HealthLevel.OK)p.success else p.warning
    )
   }
  }
  if(state.samsung){
   Row(Modifier.fillMaxWidth().clickable(onClick=onFix).padding(vertical=9.dp)){
    Text(if(bn)"Samsung ব্যাটারি গাইড" else "Samsung sleeping-app guide",
     modifier=Modifier.weight(1f),style=EkmivoType.settingsRow,color=p.text)
    Text(if(state.oemGuideAcknowledged)(if(bn)"দেখা হয়েছে" else "Reviewed")
     else (if(bn)"ঠিক করুন ›" else "Fix ›"),
     style=EkmivoType.meta,color=p.secondary)
   }
  }
  if(state.backlogError)Text(
   if(bn)"SMS পাঠাতে সমস্যা হচ্ছে।" else "Receipt delivery needs attention.",
   style=EkmivoType.heroNote,color=p.warning
  )
 }
}
