package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Optional user-approved recovery is kept in Settings, not the main SMS queue. */
@Composable
fun ReceiptRecoveryControl(bn:Boolean){
 val context=LocalContext.current.applicationContext
 val scope=rememberCoroutineScope()
 var busy by remember{mutableStateOf(false)}
 var message by remember{mutableStateOf("")}
 fun recover(){
  if(busy)return
  busy=true
  scope.launch{
   try{
    val total=withContext(Dispatchers.IO){ReceiptInboxRecovery.recover(context)}
    ReceiptSyncWorker.scheduleNow(context)
    message=if(bn)"$total টি SMS উদ্ধার হয়েছে" else "$total SMS recovered"
   }catch(_:Exception){
    message=if(bn)"SMS উদ্ধার করা যায়নি" else "Could not recover SMS"
   }finally{busy=false}
  }
 }
 val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  if(granted)recover()
  else message=if(bn)"SMS অনুমতি প্রয়োজন" else "SMS permission required"
 }
 OutlinedButton(onClick={
  if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED)
   recover()
  else permission.launch(Manifest.permission.READ_SMS)
 },enabled=!busy,modifier=Modifier.fillMaxWidth()){
  Text(if(bn)"মিস হওয়া SMS উদ্ধার করুন" else "Recover missed SMS")
 }
 if(message.isNotEmpty())Text(message,style=MaterialTheme.typography.bodySmall,
  color=MaterialTheme.colorScheme.onSurfaceVariant)
}
