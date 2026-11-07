package com.briofold.mobile.receipt

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.briofold.mobile.BuildConfig
import com.briofold.mobile.R
import com.briofold.mobile.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

private class DiagnosticWords(ctx:Context,bn:Boolean){
 private val localized=ctx.createConfigurationContext(
  Configuration(ctx.resources.configuration).apply{
   setLocale(Locale.forLanguageTag(if(bn)"bn" else "en"))
  })
 fun get(id:Int)=localized.getString(id)
}

/** Diagnostics deliberately exports only safe operational metadata, never SMS contents. */
@Composable
fun BriofoldDiagnosticsScreen(bn:Boolean,onBack:()->Unit){
 val context=LocalContext.current.applicationContext
 val word=remember(bn){DiagnosticWords(context,bn)}
 fun w(id:Int)=word.get(id)
 val palette=LocalBriofoldPalette.current
 val scope=rememberCoroutineScope()
 var busy by remember{mutableStateOf(false)}
 var result by remember{mutableStateOf("")}
 val recover:()->Unit={
  if(!busy){
   busy=true
   scope.launch{
    val restored=withContext(Dispatchers.IO){
     runCatching{ReceiptInboxRecovery.recover(context)}.getOrNull()
    }
    busy=false
    result=if(restored==null)w(R.string.settings_scan_fail)
     else restored.toString()+" "+w(R.string.settings_scan_result)
    if(restored!=null)ReceiptSyncWorker.scheduleNow(context)
   }
  }
 }
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  if(granted)recover()
  else result=w(R.string.settings_scan_permission)
 }
 Column(Modifier.fillMaxSize().background(palette.canvas)){
  Row(Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=14.dp),
   verticalAlignment=Alignment.CenterVertically){
   Text("‹",style=BriofoldType.centerTitle,color=palette.text,
    modifier=Modifier.clickable(onClick=onBack).padding(end=16.dp))
   Text(w(R.string.settings_diag),style=BriofoldType.settingsTitle,color=palette.text)
  }
  Column(Modifier.fillMaxWidth().padding(horizontal=16.dp)
   .clip(RoundedCornerShape(14.dp)).background(palette.surface)){
   DiagnosticEntry(w(R.string.settings_test),first=true,busy=busy){
    if(!busy){
     busy=true
     result=w(R.string.settings_testing)
     scope.launch {
      val okay=DeviceHeartbeat.check(context)
      busy=false
      result=w(if(okay)R.string.settings_test_ok else R.string.settings_test_fail)
     }
    }
   }
   DiagnosticEntry(w(R.string.settings_rescan),busy=busy){
    if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED)
     recover()
    else permission.launch(Manifest.permission.READ_SMS)
   }
   DiagnosticEntry(w(R.string.settings_export),busy=busy){
    scope.launch{
     val summary=withContext(Dispatchers.IO){
      runCatching {
       ReceiptStore(context).use{store->
        val health=SetupHealth(context).inspect()
        listOf(
         "Briofold diagnostics", "App version: "+BuildConfig.VERSION_NAME,
         "Android SDK: "+Build.VERSION.SDK_INT,
         "Enrolled: "+(store.phone()!=null||store.enrollment()!=null),
         "Queue size: "+store.count(),
         "Safe queue status: "+store.queueError(),
         "SMS permission: "+health.sms,
         "Notification permission: "+health.notification,
         "Battery: "+health.battery,
         "Last signed heartbeat: "+(DeviceHeartbeat.lastSuccess(context)?:0L),
         "No SMS text, payer number, device ID or signing secret is included."
        ).joinToString("\n")
       }
      }.getOrDefault("Diagnostics unavailable")
     }
     val intent=Intent(Intent.ACTION_SEND).apply{
      type="text/plain"
      putExtra(Intent.EXTRA_TEXT,summary)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
     }
     context.startActivity(Intent.createChooser(intent,w(R.string.settings_export))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
   }
   Row(Modifier.fillMaxWidth().topHairline(palette.border)
    .padding(horizontal=14.dp,vertical=12.dp)){
    Text(w(R.string.settings_version),style=BriofoldType.settingsRow,color=palette.text,
     modifier=Modifier.weight(1f))
    Text(BuildConfig.VERSION_NAME,style=BriofoldType.segment,color=palette.secondary)
   }
  }
  Spacer(Modifier.height(14.dp))
  Text(w(R.string.settings_about_test),style=BriofoldType.body,color=palette.secondary,
   modifier=Modifier.padding(horizontal=20.dp))
  Spacer(Modifier.height(8.dp))
  Text(w(R.string.settings_no_logs),style=BriofoldType.heroNote,color=palette.secondary,
   modifier=Modifier.padding(horizontal=20.dp))
  if(result.isNotBlank()){
   Spacer(Modifier.height(18.dp))
   Text(result,style=BriofoldType.body,color=palette.text,
    modifier=Modifier.padding(horizontal=20.dp))
  }
 }
}
@Composable
private fun DiagnosticEntry(text:String,first:Boolean=false,busy:Boolean,onClick:()->Unit){
 val palette=LocalBriofoldPalette.current
 Row(Modifier.fillMaxWidth()
  .then(if(first)Modifier else Modifier.topHairline(palette.border))
  .clickable(enabled=!busy,onClick=onClick)
  .padding(horizontal=14.dp,vertical=12.dp),
  verticalAlignment=Alignment.CenterVertically){
  Text(text,style=BriofoldType.settingsRow,color=palette.text,
   modifier=Modifier.weight(1f))
  Text("›",style=BriofoldType.link,color=palette.secondary)
 }
}
