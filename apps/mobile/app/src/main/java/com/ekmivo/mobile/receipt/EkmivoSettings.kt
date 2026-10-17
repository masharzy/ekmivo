package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.ekmivo.mobile.BuildConfig
import com.ekmivo.mobile.R
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.ui.*
import com.ekmivo.mobile.receipt.ReceiptTransport
import com.ekmivo.mobile.receipt.ReceivedSmsRoom
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

private class Words(context:Context,bn:Boolean) {
 private val localized=context.createConfigurationContext(Configuration(context.resources.configuration).apply {
  setLocale(Locale.forLanguageTag(if(bn)"bn" else "en"))
 })
 fun get(id:Int)=localized.getString(id)
}
private fun lastSync(ts:Long?,bn:Boolean,never:String):String {
 if(ts==null)return never
 val mins=((System.currentTimeMillis()-ts).coerceAtLeast(0)/60000).toInt()
 return when {
  mins<1->if(bn)"এইমাত্র" else "Just now"
  mins<60->(mins.toString()+if(bn)" মিনিট আগে" else " min ago")
  else->((mins/60).toString()+if(bn)" ঘণ্টা আগে" else " hr ago")
 }
}
@Composable
private fun SettingsHeading(title:String) {
 val p=LocalEkmivoPalette.current
 Text(title,style=EkmivoType.settingsTitle,color=p.text,
  modifier=Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=18.dp,bottom=14.dp))
}
@Composable
private fun SettingsGroup(title:String?=null,top:Int=6,body:@Composable ColumnScope.()->Unit){
 val p=LocalEkmivoPalette.current
 Column(Modifier.fillMaxWidth()){
  if(title!=null)Text(title,style=EkmivoType.section,color=p.secondary,
   modifier=Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=top.dp,bottom=6.dp))
  Column(Modifier.fillMaxWidth().padding(horizontal=16.dp).padding(bottom=10.dp)
   .clip(RoundedCornerShape(14.dp)).background(p.surface),content=body)
 }
}
@Composable
private fun Entry(label:String,icon:ImageVector?=null,value:String?=null,first:Boolean=false,
 warn:Boolean=false,onClick:(()->Unit)?=null,trail:@Composable (()->Unit)?=null) {
 val p=LocalEkmivoPalette.current
 Row(Modifier.fillMaxWidth().then(if(first)Modifier else Modifier.topHairline(p.border))
  .then(if(onClick!=null)Modifier.clickable(onClick=onClick) else Modifier)
  .padding(vertical=10.dp,horizontal=14.dp),
  verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
  if(icon!=null)Icon(icon,null,Modifier.size(17.dp),tint=p.secondary)
  Text(label,style=EkmivoType.settingsRow,color=p.text,modifier=Modifier.weight(1f))
  if(trail!=null)trail()
  else if(value!=null)Text(value,style=EkmivoType.segment,
   color=if(warn)p.warning else p.secondary,textAlign=TextAlign.End)
 }
}
@Composable
private fun Segments(values:List<String>,selected:Int,choose:(Int)->Unit){
 val p=LocalEkmivoPalette.current
 Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){
  values.forEachIndexed{index,label->
   val active=index==selected
   Text(label,style=EkmivoType.segment,
    color=if(active)p.onPrimary else p.secondary,
    modifier=Modifier.clip(CircleShape).background(if(active)p.text else p.surface)
     .border(1.dp,if(active)p.text else p.border,CircleShape)
     .clickable{if(index!=selected)choose(index)}
     .padding(horizontal=10.dp,vertical=4.dp))
  }
 }
}

@Composable
fun EkmivoSettingsScreen(
 bn:Boolean,language:Language,appearance:Appearance,
 changeLanguage:(Language)->Unit,changeAppearance:(Appearance)->Unit,
 onSetup:()->Unit,onDisconnected:()->Unit
){
 val app=LocalContext.current.applicationContext
 val words=remember(bn){Words(app,bn)}
 fun w(id:Int)=words.get(id)
 val p=LocalEkmivoPalette.current
 val scope=rememberCoroutineScope()
 var snapshot by remember{mutableStateOf(SetupHealth(app).refresh())}
 var last by remember{mutableStateOf(DeviceHeartbeat.lastSuccess(app))}
 var diagnostics by remember{mutableStateOf(false)}
 var confirm by remember{mutableStateOf(false)}
 var busy by remember{mutableStateOf(false)}
 var warning by remember{mutableStateOf("")}
 LaunchedEffect(diagnostics){snapshot=SetupHealth(app).refresh();last=DeviceHeartbeat.lastSuccess(app)}
 if(diagnostics){
  EkmivoDiagnosticsScreen(bn){diagnostics=false}
  return
 }
 Column(Modifier.fillMaxSize().background(p.canvas)){
  SettingsHeading(w(R.string.settings_title))
  LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(bottom=24.dp)){
   item{
    SettingsGroup {
     Entry(w(R.string.settings_device),Icons.Outlined.Smartphone,
      (Build.MANUFACTURER+" "+Build.MODEL).trim(),first=true)
     Entry(w(R.string.settings_sync),Icons.Outlined.Sync,lastSync(last,bn,w(R.string.settings_never)))
    }
   }
   item{
    SettingsGroup(w(R.string.settings_reliable)){
     listOf(
      Triple(R.string.settings_sms,Icons.Outlined.Sms,snapshot.sms),
      Triple(R.string.settings_notification,Icons.Outlined.NotificationsNone,snapshot.notification),
      Triple(R.string.settings_battery,Icons.Outlined.BatteryStd,snapshot.battery)
     ).forEachIndexed{idx,(name,icon,level)->
      Entry(w(name),icon,
       when(level){
        HealthLevel.OK->w(R.string.settings_on)
        HealthLevel.MISSING->w(R.string.settings_fix)
        HealthLevel.UNKNOWN->w(R.string.settings_unknown)
       },first=idx==0,warn=level!=HealthLevel.OK,onClick=onSetup)
     }
     if(snapshot.samsung)Entry(w(R.string.settings_oem),Icons.Outlined.BatteryStd,
      if(snapshot.oemGuideAcknowledged)w(R.string.settings_on) else w(R.string.settings_fix),
      warn=!snapshot.oemGuideAcknowledged,onClick=onSetup)
    }
   }
   item{
    SettingsGroup(w(R.string.settings_app),2){
     Entry(w(R.string.settings_language),Icons.Outlined.Language,first=true,trail={
      Segments(listOf("বাংলা","English"),if(language==Language.BN)0 else 1){
       changeLanguage(if(it==0)Language.BN else Language.EN)
      }
     })
     Entry(w(R.string.settings_theme),Icons.Outlined.Palette,trail={
      Segments(listOf(w(R.string.settings_theme_system),w(R.string.settings_theme_light),
       w(R.string.settings_theme_dark)),
       when(appearance){Appearance.SYSTEM->0;Appearance.LIGHT->1;Appearance.DARK->2}){
       changeAppearance(listOf(Appearance.SYSTEM,Appearance.LIGHT,Appearance.DARK)[it])
      }
     })
     Entry(w(R.string.settings_diag),Icons.Outlined.Description,"›",onClick={diagnostics=true})
     Box(Modifier.fillMaxWidth().topHairline(p.border)) {
      com.ekmivo.mobile.update.SettingsUpdateRow(bn)
     }
    }
   }
   item{
    SettingsGroup {
     Text(w(R.string.settings_disconnect),color=p.danger,style=EkmivoType.settingsRow,
      textAlign=TextAlign.Center,
      modifier=Modifier.fillMaxWidth().clickable{confirm=true}.padding(14.dp))
    }
   }
   if(warning.isNotEmpty())item{
    Text(warning,style=EkmivoType.heroNote,color=p.warning,
     modifier=Modifier.padding(horizontal=20.dp,vertical=6.dp))
   }
  }
 }
 if(confirm)Dialog(onDismissRequest={if(!busy)confirm=false},
  properties=DialogProperties(usePlatformDefaultWidth=false)){
  Box(Modifier.fillMaxSize().clickable(enabled=!busy){confirm=false},
   contentAlignment=Alignment.BottomCenter){
   Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart=24.dp,topEnd=24.dp))
    .background(p.raised).clickable(enabled=false){}.padding(20.dp),
    horizontalAlignment=Alignment.CenterHorizontally){
    Text(w(R.string.settings_disconnect_title),style=EkmivoType.centerTitle,color=p.text)
    Spacer(Modifier.height(12.dp))
    Text(w(R.string.settings_disconnect_desc),style=EkmivoType.body,color=p.secondary,
     textAlign=TextAlign.Center)
    Spacer(Modifier.height(20.dp))
    Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp))
     .background(p.danger).clickable(enabled=!busy){
      busy=true
      scope.launch {
       val outcome=withContext(Dispatchers.IO){
        // Never destroy the signing key before server acknowledges revocation.
        // Preserve Room/SQLite queued evidence if any message remains unsent.
        runCatching {
         ReceiptStore(app).use { store ->
          val stage=ReceivedSmsRoom.get(app).messages().countUnacknowledged()
          if(store.count()>0 || stage>0) return@use "pending"
          val identity=store.phone()?:store.enrollment()?:return@use "server"
          val id=identity.optString("id")
          val environment=identity.optString("environment")
          if(id.isBlank()||environment !in setOf("sandbox","live")) return@use "server"
          val payload=org.json.JSONObject().put("enrollment_id",id)
           .put("environment",environment).toString().toByteArray(Charsets.UTF_8)
          val response=ReceiptTransport.post(app,"phone-disconnect",id,
           java.util.UUID.randomUUID().toString(),payload)
          if(response.first!=200) return@use "server"
          if(store.disconnect()) "done" else "pending"
         }
        }.getOrDefault("server")
       }
       busy=false;confirm=false
       if(outcome=="done"){
        ReceiptForwardingService.stop(app)
        com.ekmivo.mobile.inbox.InboxPushTokenRegistry.clear(app)
        onDisconnected()
       }else warning=w(if(outcome=="pending")R.string.settings_blocked else R.string.settings_failed)
      }
     },contentAlignment=Alignment.Center){
     Text(w(R.string.settings_confirm),style=EkmivoType.button,color=p.onPrimary)
    }
    Spacer(Modifier.height(10.dp))
    Text(w(R.string.settings_cancel),style=EkmivoType.link,color=p.secondary,
     modifier=Modifier.clickable(enabled=!busy){confirm=false}.padding(8.dp))
   }
  }
 }
}
