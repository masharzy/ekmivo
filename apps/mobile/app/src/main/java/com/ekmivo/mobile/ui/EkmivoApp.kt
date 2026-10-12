package com.ekmivo.mobile.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SignalWifiStatusbarConnectedNoInternet4
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ekmivo.mobile.data.AppPreferences
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.data.ServiceProbe
import com.ekmivo.mobile.data.ServiceStatus
import kotlinx.coroutines.launch

private val pageIcons = mapOf(
 Page.OVERVIEW to Icons.Outlined.Home,
 Page.PAYMENTS to Icons.Outlined.AccountBalanceWallet,
 Page.INBOX to Icons.Outlined.ChatBubbleOutline,
 Page.SETTINGS to Icons.Outlined.Settings
)

@Composable
fun EkmivoApp(preferences:AppPreferences) {
 val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
 val language by preferences.language.collectAsState(initial=Language.BN)
 val isDark=when(appearance) {
  Appearance.SYSTEM->isSystemInDarkTheme()
  Appearance.LIGHT->false
  Appearance.DARK->true
 }
 val copy=copyFor(language)
 val scope=rememberCoroutineScope()
 val probe=remember { ServiceProbe() }
 var status by remember { mutableStateOf<ServiceStatus>(ServiceStatus.Checking) }
 var page by rememberSaveable { mutableStateOf(Page.OVERVIEW) }
 LaunchedEffect(probe){ status=probe.check() }
 EkmivoTheme(dark=isDark) {
  Scaffold(
   containerColor=MaterialTheme.colorScheme.background,
   topBar={ AppBar(copy,page) },
   bottomBar={
    NavigationBar(containerColor=MaterialTheme.colorScheme.surface,tonalElevation=0.dp) {
     Page.entries.forEach { destination->
      NavigationBarItem(
       selected=destination==page,
       onClick={page=destination},
       icon={Icon(pageIcons.getValue(destination),contentDescription=null)},
       label={Text(copy.pageName(destination),maxLines=1,overflow=TextOverflow.Ellipsis)},
       alwaysShowLabel=true,
       colors=NavigationBarItemDefaults.colors(
        selectedIconColor=MaterialTheme.colorScheme.onPrimary,
        selectedTextColor=MaterialTheme.colorScheme.onSurface,
        indicatorColor=MaterialTheme.colorScheme.primary,
        unselectedIconColor=MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor=MaterialTheme.colorScheme.onSurfaceVariant
       )
      )
     }
    }
   }
  ){insets ->
   AnimatedContent(
    targetState=page,
    modifier=Modifier.padding(insets).fillMaxSize(),
    transitionSpec={fadeIn(animationSpec=tween(220)) togetherWith fadeOut(animationSpec=tween(110))},
    label="Main navigation"
   ){destination->
    when(destination){
     Page.OVERVIEW->Overview(copy,status,onRefresh={scope.launch{status=ServiceStatus.Checking;status=probe.check()}},onPayments={page=Page.PAYMENTS})
     Page.PAYMENTS->Payments(copy,status)
     Page.INBOX->Inbox(copy)
     Page.SETTINGS->Preferences(copy,appearance,language,status,
       onAppearance={scope.launch{preferences.updateAppearance(it)}},
       onLanguage={scope.launch{preferences.updateLanguage(it)}},
       onRefresh={scope.launch{status=ServiceStatus.Checking;status=probe.check()}})
    }
   }
  }
 }
}
@Composable
private fun AppBar(copy:AppCopy,page:Page) {
 Surface(color=MaterialTheme.colorScheme.surface) {
  Column {
   Row(modifier=Modifier.fillMaxWidth().height(64.dp).padding(horizontal=22.dp),
    verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
     Surface(color=MaterialTheme.colorScheme.primary,shape=RoundedCornerShape(10.dp)){
      Text("e.",modifier=Modifier.padding(horizontal=12.dp,vertical=3.dp),
       color=MaterialTheme.colorScheme.onPrimary,style=MaterialTheme.typography.titleLarge)
     }
     Text("ekmivo",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
    }
    Surface(shape=CircleShape,border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant),
      color=MaterialTheme.colorScheme.surfaceVariant) {
     Text(page.name.first().toString(),modifier=Modifier.padding(horizontal=13.dp,vertical=9.dp),
      style=MaterialTheme.typography.labelMedium)
    }
   }
   HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
  }
 }
}
@Composable
private fun Overview(copy:AppCopy,status:ServiceStatus,onRefresh:()->Unit,onPayments:()->Unit) {
 val context=LocalContext.current
 LazyColumn(
  modifier=Modifier.fillMaxSize(),
  contentPadding=androidx.compose.foundation.layout.PaddingValues(horizontal=20.dp,vertical=23.dp),
  verticalArrangement=Arrangement.spacedBy(19.dp)
 ){
  item {
   Column(verticalArrangement=Arrangement.spacedBy(5.dp)) {
    Eyebrow(copy.workspace)
    Text(copy.chooseBusiness,style=MaterialTheme.typography.titleMedium)
   }
  }
  item {
   Surface(modifier=Modifier.fillMaxWidth(),color=MaterialTheme.colorScheme.primary,shape=RoundedCornerShape(18.dp)) {
    Column(modifier=Modifier.padding(26.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
     Text("EKMIVO / COMMERCE",color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.72f),style=MaterialTheme.typography.labelMedium)
     Text(copy.dashboardMessage,color=MaterialTheme.colorScheme.onPrimary,style=MaterialTheme.typography.displaySmall)
     Text(copy.overviewCaption,color=MaterialTheme.colorScheme.onPrimary.copy(alpha=.8f),style=MaterialTheme.typography.bodyMedium)
     Button(
      onClick=onPayments,
      colors=ButtonDefaults.buttonColors(containerColor=MaterialTheme.colorScheme.surface,contentColor=MaterialTheme.colorScheme.onSurface),
      shape=RoundedCornerShape(9.dp)
     ) {Text(copy.payments+"  ↗")}
    }
   }
  }
  item {
   Card(modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(16.dp),
    colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.surfaceVariant)){
    Column(Modifier.padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
     Text("SMS receipt forwarding / এসএমএস রসিদ",style=MaterialTheme.typography.titleMedium)
     Text("Pair this phone once. It will securely forward relevant incoming payment SMS. No account, parser or SIM ID setup.",
      style=MaterialTheme.typography.bodyMedium)
     Button(onClick={
      context.startActivity(android.content.Intent(context,com.ekmivo.mobile.receipt.ReceiptSetupActivity::class.java))
     }){Text("Connect phone / ফোন যুক্ত করুন")}
    }
   }
  }
  item {
   Row(horizontalArrangement=Arrangement.spacedBy(10.dp)) {
    DataStat(label=copy.paymentRequests,value=copy.moneyDash,modifier=Modifier.weight(1f))
    DataStat(label=copy.incoming,value=copy.moneyDash,modifier=Modifier.weight(1f))
   }
  }
  item {
   SectionHeader(copy.getStarted)
   Spacer(Modifier.height(9.dp))
   ConnectionCard(copy,status,onRefresh)
  }
  item {
   SectionHeader(copy.recentPayments)
   Spacer(Modifier.height(10.dp))
   EmptyMessage(Icons.Outlined.AccountBalanceWallet,copy.noPayments,copy.startWithConnection)
  }
 }
}
@Composable
private fun DataStat(label:String,value:String,modifier:Modifier=Modifier){
 Surface(modifier=modifier,shape=RoundedCornerShape(13.dp),color=MaterialTheme.colorScheme.surface,
  border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
  Column(modifier=Modifier.padding(19.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   Text(label,style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
   Text(value,style=MaterialTheme.typography.headlineMedium)
  }
 }
}
@Composable
private fun Payments(copy:AppCopy,status:ServiceStatus){
 var view by rememberSaveable{mutableStateOf(PaymentView.REQUESTS)}
 LazyColumn(modifier=Modifier.fillMaxSize(),
  contentPadding=androidx.compose.foundation.layout.PaddingValues(horizontal=20.dp,vertical=24.dp),
  verticalArrangement=Arrangement.spacedBy(20.dp)){
  item{
   Text(copy.payments,style=MaterialTheme.typography.headlineMedium)
   Spacer(Modifier.height(5.dp))
   Text(copy.payout,style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
  }
  item {
   Row(horizontalArrangement=Arrangement.spacedBy(8.dp),modifier=Modifier.horizontalScroll(rememberScrollState())){
    PaymentView.entries.forEach{mode ->
     FilterChip(selected=view==mode,onClick={view=mode},label={Text(copy.paymentName(mode))})
    }
   }
  }
  item {
   AnimatedContent(targetState=view,label="Payment sections",
    transitionSpec={fadeIn(tween(200)) togetherWith fadeOut(tween(100))}){mode->
    when(mode){
     PaymentView.REQUESTS->EmptyMessage(Icons.Outlined.AccountBalanceWallet,copy.noPayments,copy.startWithConnection)
     PaymentView.INCOMING->EmptyMessage(Icons.Outlined.Info,copy.noPayments,copy.pendingBackend)
     PaymentView.DEVICES->Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
       EmptyMessage(Icons.Outlined.Smartphone,copy.noDevices,copy.permissionWarning)
       ConnectionCard(copy,status,onRefresh={})
     }
    }
   }
  }
 }
}
@Composable
private fun Inbox(copy:AppCopy){
 var query by rememberSaveable{mutableStateOf("")}
 Column(modifier=Modifier.fillMaxSize().padding(horizontal=20.dp,vertical=24.dp),
  verticalArrangement=Arrangement.spacedBy(19.dp)){
  Text(copy.inbox,style=MaterialTheme.typography.headlineMedium)
  OutlinedTextField(value=query,onValueChange={query=it},singleLine=true,
    modifier=Modifier.fillMaxWidth(),placeholder={Text(copy.search)},
    shape=RoundedCornerShape(13.dp),leadingIcon={Icon(Icons.Outlined.ChatBubbleOutline,contentDescription=null)})
  AnimatedContent(targetState=query.isBlank(),label="Inbox filter",
   transitionSpec={fadeIn(tween(180)) togetherWith fadeOut(tween(80))}){isEmpty ->
   EmptyMessage(Icons.Outlined.ChatBubbleOutline,
    if(isEmpty)copy.noMessages else copy.noMatches,copy.startWithConnection)
  }
 }
}
@Composable
private fun Preferences(copy:AppCopy,appearance:Appearance,language:Language,status:ServiceStatus,
 onAppearance:(Appearance)->Unit,onLanguage:(Language)->Unit,onRefresh:()->Unit){
 val receiptContext=LocalContext.current
 LazyColumn(modifier=Modifier.fillMaxSize(),
  contentPadding=androidx.compose.foundation.layout.PaddingValues(horizontal=20.dp,vertical=24.dp),
  verticalArrangement=Arrangement.spacedBy(21.dp)){
  item{
   Text(copy.settings,style=MaterialTheme.typography.headlineMedium)
   Spacer(Modifier.height(6.dp))
   Text(copy.modeHint,style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
  }
  item{
   SettingsPanel(title=copy.appearance){
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp),modifier=Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())){
     Appearance.entries.forEach{mode->
      FilterChip(selected=appearance==mode,onClick={onAppearance(mode)},
       label={Text(when(mode){Appearance.SYSTEM->copy.system;Appearance.LIGHT->copy.light;Appearance.DARK->copy.dark})})
     }
    }
   }
  }
  item{
   SettingsPanel(title=copy.language){
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
     Language.entries.forEach{lang->
      FilterChip(selected=language==lang,onClick={onLanguage(lang)},
        label={Text(if(lang==Language.BN)copy.bangla else copy.english)})
     }
    }
   }
  }
  item{
   SettingsPanel(title=copy.apiStatus){ConnectionCard(copy,status,onRefresh)}
  }
  item{
   Button(onClick={receiptContext.startActivity(android.content.Intent(receiptContext,com.ekmivo.mobile.receipt.ReceiptSetupActivity::class.java))}){
    Text(if(language==Language.BN)"Receipt সংগ্রহ সেটআপ" else "Receipt collection setup")
   }
  }
  item{
   SettingsPanel(title=copy.support){
    Text(copy.permissionWarning,style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
   }
  }
 }
}
@Composable
private fun SettingsPanel(title:String,content:@Composable ()->Unit) {
 Surface(shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant),
  color=MaterialTheme.colorScheme.surface){
  Column(modifier=Modifier.fillMaxWidth().padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
   Text(title,style=MaterialTheme.typography.titleMedium)
   content()
  }
 }
}
@Composable
private fun Eyebrow(label:String) {
 Text(label.uppercase(),style=MaterialTheme.typography.labelMedium,
  color=MaterialTheme.colorScheme.onSurfaceVariant,letterSpacing=1.sp)
}
@Composable
private fun SectionHeader(label:String){
 Text(label,style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
}
@Composable
private fun ConnectionCard(copy:AppCopy,status:ServiceStatus,onRefresh:()->Unit){
 val statusText=when(status){
  ServiceStatus.NotConfigured->copy.unconfigured
  ServiceStatus.Checking->copy.checking
  ServiceStatus.Unreachable->copy.unreachable
  ServiceStatus.OperationalServicesUnavailable->copy.notReady
  ServiceStatus.Ready->copy.ready
 }
 Surface(shape=RoundedCornerShape(13.dp),border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant),
  color=MaterialTheme.colorScheme.surface){
  Column(modifier=Modifier.fillMaxWidth().padding(18.dp).animateContentSize(),
   verticalArrangement=Arrangement.spacedBy(14.dp)){
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
    Box(modifier=Modifier.size(8.dp).background(
      if(status==ServiceStatus.Ready) Color(0xFF285D42) else MaterialTheme.colorScheme.outline,
      CircleShape))
    Text(statusText,style=MaterialTheme.typography.titleMedium)
   }
   Text(copy.apiNote,style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
   androidx.compose.material3.TextButton(onClick=onRefresh,enabled=status!=ServiceStatus.Checking){
    Icon(Icons.Outlined.Refresh,contentDescription=null,modifier=Modifier.size(18.dp))
    Spacer(Modifier.size(7.dp))
    Text(copy.refresh)
   }
  }
 }
}
@Composable
private fun EmptyMessage(icon:ImageVector,title:String,detail:String) {
 Surface(shape=RoundedCornerShape(15.dp),
  color=MaterialTheme.colorScheme.surface,
  border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)) {
  Column(
   modifier=Modifier.fillMaxWidth().padding(vertical=43.dp,horizontal=24.dp),
   horizontalAlignment=Alignment.CenterHorizontally,
   verticalArrangement=Arrangement.spacedBy(12.dp)){
   Surface(shape=RoundedCornerShape(13.dp),color=MaterialTheme.colorScheme.surfaceVariant){
    Icon(icon,contentDescription=null,modifier=Modifier.padding(14.dp).size(27.dp),
      tint=MaterialTheme.colorScheme.onSurfaceVariant)
   }
   Text(title,style=MaterialTheme.typography.titleLarge)
   Text(detail,style=MaterialTheme.typography.bodyMedium,
    color=MaterialTheme.colorScheme.onSurfaceVariant)
  }
 }
}
