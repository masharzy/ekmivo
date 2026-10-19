package com.ekmivo.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.ekmivo.mobile.data.*
import com.ekmivo.mobile.receipt.*
import com.ekmivo.mobile.inbox.InboxRoute
import kotlinx.coroutines.*

@Composable
fun EkmivoApp(preferences:AppPreferences,incomingPairingLink:String?=null,incomingInboxThread:String?=null,incomingInboxWorkspace:String?=null) {
 val app=LocalContext.current.applicationContext
 val accessRepo=remember{WorkspaceAccessRepository.get(app)}
 val access by accessRepo.state.collectAsState()
 val repo=remember{ReceiptRepository.get(app)}
 val connection by repo.state.collectAsState()
 var paired by remember{mutableStateOf(ReceiptStore(app).use{it.phone()!=null||it.enrollment()!=null})}
 var reconnecting by remember{mutableStateOf(false)}
 val owner=LocalLifecycleOwner.current
 val scope=rememberCoroutineScope()
 val language by preferences.language.collectAsState(initial=Language.EN)
 val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
 val bn=language==Language.BN
 val dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}
 var selected by rememberSaveable{mutableStateOf(EkmivoReferencePage.INBOX)}
 LaunchedEffect(incomingInboxThread,access?.id){if(incomingInboxThread!=null&&incomingInboxWorkspace==access?.id&&access?.ai==true)selected=EkmivoReferencePage.INBOX}
 var health by remember{mutableStateOf(SetupHealth(app).refresh())}
 var showSuccess by remember{mutableStateOf(false)}
 var inboxDetail by remember{mutableStateOf(false)}
 var repair by remember{mutableStateOf(false)}
 val payments=access?.payments==true
 val ai=access?.ai==true
 LaunchedEffect(ai,paired){if(ai&&paired)com.ekmivo.mobile.inbox.InboxPushTokenRegistry.prepare(app)}
 val missing=access!=null&&(payments||ai)&&SetupPlan.firstMissing(health,payments)!=null
 LaunchedEffect(owner,paired) {
  owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
   while(isActive&&paired) {
    withContext(Dispatchers.IO){accessRepo.refreshBlocking()}
    health=withContext(Dispatchers.IO){SetupHealth(app).refresh()}
    delay(2000)
   }
  }
 }
 LaunchedEffect(payments,access?.paymentReady,missing,paired) {
  if(paired&&payments&&access?.paymentReady==true&&!missing) {
   ReceiptForwardingService.startFromVisibleApp(app)
   ReceiptSyncWorker.scheduleNow(app)
  }else ReceiptForwardingService.stop(app)
 }
 val pages=buildList {
  if(ai)add(EkmivoReferencePage.INBOX)
  if(payments)add(EkmivoReferencePage.SMS)
  add(EkmivoReferencePage.SETTINGS)
 }
 val page=if(selected in pages)selected else pages.first()
 EkmivoTheme(dark) {
  when {
   connection==ConnectionState.Revoked&&!reconnecting -> EkmivoDisconnected(bn,0,onReconnect={
    ReceiptForwardingService.stop(app);accessRepo.clear();paired=false;reconnecting=true;repo.beginPairing()
   },onQueue={})
   !paired||reconnecting -> PairingFlow(bn,incomingPairingLink,onLanguageChange={v->scope.launch{preferences.updateLanguage(if(v)Language.BN else Language.EN)}},onPaired={
    paired=true;reconnecting=false;showSuccess=true
   })
   access==null -> Column(Modifier.fillMaxSize().background(LocalEkmivoPalette.current.canvas).statusBarsPadding().navigationBarsPadding(),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
    Text(if(bn)"আপনার ওয়ার্কস্পেস লোড হচ্ছে…" else "Loading your workspace…",style=EkmivoType.centerTitle)
    Spacer(Modifier.height(12.dp))
    EkmivoPrimaryButton(if(bn)"আবার চেষ্টা" else "Try again",onClick={scope.launch{withContext(Dispatchers.IO){accessRepo.refreshBlocking()}}},modifier=Modifier.padding(horizontal=24.dp))
   }
   missing||showSuccess||repair -> SetupWizard(bn,onLanguageChange={v->scope.launch{preferences.updateLanguage(if(v)Language.BN else Language.EN)}},onDone={
    health=SetupHealth(app).refresh();showSuccess=false;repair=false
   },payments=payments,ai=ai,workspaceName=access!!.name)
   else -> Column(Modifier.fillMaxSize().background(LocalEkmivoPalette.current.canvas).statusBarsPadding()) {
    if(page!=EkmivoReferencePage.INBOX)EkmivoReferenceHeader(if(page==EkmivoReferencePage.SETTINGS)(if(bn)"সেটিংস" else "Settings") else access!!.name,subtitle=if(page==EkmivoReferencePage.SMS)(if(bn)"ওয়ার্কস্পেস" else "Workspace") else null,titleIsPage=page==EkmivoReferencePage.SETTINGS)
    Box(Modifier.weight(1f)) {
     when(page) {
      EkmivoReferencePage.INBOX -> InboxRoute(bn=bn,workspace=access!!,onDetailChange={inboxDetail=it},initialThread=if(incomingInboxWorkspace==access!!.id)incomingInboxThread else null)
      EkmivoReferencePage.SMS -> EkmivoSmsHome(bn,connection,onRetry={ReceiptSyncWorker.scheduleNow(app)})
      EkmivoReferencePage.SETTINGS -> EkmivoSettingsScreen(bn,language,appearance,
       changeLanguage={scope.launch{preferences.updateLanguage(it)}},changeAppearance={scope.launch{preferences.updateAppearance(it)}},
       onSetup={repair=true},onDisconnected={paired=false;reconnecting=false;accessRepo.clear();repo.dispatch(ConnectionEvent.Disconnected)},access=access)
     }
    }
    if(!inboxDetail||page!=EkmivoReferencePage.INBOX)EkmivoReferenceBottomNav(bn,pages,page){selected=it}
   }
  }
 }
}
