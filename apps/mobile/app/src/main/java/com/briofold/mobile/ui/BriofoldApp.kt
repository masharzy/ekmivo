package com.briofold.mobile.ui

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
import com.briofold.mobile.data.*
import com.briofold.mobile.receipt.*
import com.briofold.mobile.inbox.InboxRoute
import kotlinx.coroutines.*

@Composable
fun BriofoldApp(preferences:AppPreferences,incomingPairingLink:String?=null,incomingInboxThread:String?=null,incomingInboxWorkspace:String?=null) {
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
 var selected by rememberSaveable{mutableStateOf(BriofoldReferencePage.INBOX)}
 LaunchedEffect(incomingInboxThread,access?.id){if(incomingInboxThread!=null&&incomingInboxWorkspace==access?.id&&access?.ai==true)selected=BriofoldReferencePage.INBOX}
 var health by remember{mutableStateOf(SetupHealth(app).refresh())}
 var showSuccess by remember{mutableStateOf(false)}
 var inboxDetail by remember{mutableStateOf(false)}
 var repair by remember{mutableStateOf(false)}
 val payments=access?.payments==true
 val ai=access?.ai==true
 LaunchedEffect(ai,paired){if(ai&&paired)com.briofold.mobile.inbox.InboxPushTokenRegistry.prepare(app)}
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
 val pages=workspacePages(ai,payments)
 val page=workspacePage(selected,ai,payments)
 BriofoldTheme(dark) {
  when {
   connection==ConnectionState.Revoked&&!reconnecting -> BriofoldDisconnected(bn,0,onReconnect={
    ReceiptForwardingService.stop(app);accessRepo.clear();paired=false;reconnecting=true;repo.beginPairing()
   },onQueue={})
   !paired||reconnecting -> PairingFlow(bn,incomingPairingLink,onLanguageChange={v->scope.launch{preferences.updateLanguage(if(v)Language.BN else Language.EN)}},onPaired={
    paired=true;reconnecting=false;showSuccess=true
   })
   access==null -> Column(Modifier.fillMaxSize().background(LocalBriofoldPalette.current.canvas).statusBarsPadding().navigationBarsPadding(),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
    Text(if(bn)"আপনার ওয়ার্কস্পেস লোড হচ্ছে…" else "Loading your workspace…",style=BriofoldType.centerTitle)
    Spacer(Modifier.height(12.dp))
    BriofoldPrimaryButton(if(bn)"আবার চেষ্টা" else "Try again",onClick={scope.launch{withContext(Dispatchers.IO){accessRepo.refreshBlocking()}}},modifier=Modifier.padding(horizontal=24.dp))
   }
   (payments||ai)&&(missing||showSuccess||repair) -> SetupWizard(bn,onLanguageChange={v->scope.launch{preferences.updateLanguage(if(v)Language.BN else Language.EN)}},onDone={
    health=SetupHealth(app).refresh();showSuccess=false;repair=false
   },payments=payments,ai=ai,workspaceName=access!!.name)
   else -> Column(Modifier.fillMaxSize().background(LocalBriofoldPalette.current.canvas).statusBarsPadding()) {
    if(page!=BriofoldReferencePage.INBOX)BriofoldReferenceHeader(if(page==BriofoldReferencePage.SETTINGS)(if(bn)"সেটিংস" else "Settings") else access!!.name,subtitle=if(page==BriofoldReferencePage.SMS)(if(bn)"ওয়ার্কস্পেস" else "Workspace") else null,titleIsPage=page==BriofoldReferencePage.SETTINGS)
    Box(Modifier.weight(1f)) {
     when(page) {
      BriofoldReferencePage.INBOX -> key(access!!.id,access!!.environment) {InboxRoute(bn=bn,workspace=access!!,onDetailChange={inboxDetail=it},initialThread=if(incomingInboxWorkspace==access!!.id)incomingInboxThread else null)}
      BriofoldReferencePage.SMS -> BriofoldSmsHome(bn,connection,onRetry={ReceiptSyncWorker.scheduleNow(app)})
      BriofoldReferencePage.SETTINGS -> BriofoldSettingsScreen(bn,language,appearance,
       changeLanguage={scope.launch{preferences.updateLanguage(it)}},changeAppearance={scope.launch{preferences.updateAppearance(it)}},
       onSetup={repair=true},onDisconnected={paired=false;reconnecting=false;accessRepo.clear();repo.dispatch(ConnectionEvent.Disconnected)},access=access)
     }
    }
    if(!inboxDetail||page!=BriofoldReferencePage.INBOX)BriofoldReferenceBottomNav(bn,pages,page){selected=it}
   }
  }
 }
}
