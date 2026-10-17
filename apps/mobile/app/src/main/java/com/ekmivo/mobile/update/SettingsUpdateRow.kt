package com.ekmivo.mobile.update

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.ui.EkmivoType
import com.ekmivo.mobile.ui.LocalEkmivoPalette
import kotlinx.coroutines.launch

/** Compact row matching Settings cards. No persistent intrusive banner. */
@Composable
fun SettingsUpdateRow(bn:Boolean) {
 val ctx=LocalContext.current.applicationContext
 val p=LocalEkmivoPalette.current
 val scope=rememberCoroutineScope()
 var result by remember { mutableStateOf<UpdateCheck?>(null) }
 var downloading by remember { mutableStateOf(false) }
 var error by remember { mutableStateOf<String?>(null) }
 var pending by remember { mutableStateOf<java.io.File?>(null) }

 LaunchedEffect(Unit) { result=AppUpdateService.check() }
 val release=(result as? UpdateCheck.Available)?.release
 val label=if(bn)"অ্যাপ আপডেট" else "App updates"
 val secondary=when {
  downloading->if(bn)"ডাউনলোড হচ্ছে…" else "Downloading…"
  error!=null->error!!
  release!=null&&pending?.exists()==true->if(bn)"ইনস্টলার খুলুন ›" else "Open installer ›"
  release!=null->if(bn)"Update now ›" else "Update now ›"
  result==null->if(bn)"খোঁজা হচ্ছে…" else "Checking…"
  result==UpdateCheck.NoNewVersion->if(bn)"আপডেট নেই" else "No newer version"
  result==UpdateCheck.NotPublished->if(bn)"আপডেট প্রকাশিত নেই" else "No release published"
  else->if(bn)"আবার চেষ্টা করুন ›" else "Retry ›"
 }
 Row(
  Modifier.fillMaxWidth().clickable(enabled=!downloading) {
   error=null
   if(release==null)scope.launch { result=AppUpdateService.check() }
   else scope.launch {
    downloading=true
    try {
     val file=pending?.takeIf{it.exists()}?:AppUpdateService.download(ctx,release)
     pending=file
     AppUpdateService.openInstaller(ctx,file)
    }catch(_:Exception){
     error=if(bn)"আপডেট ইনস্টল করা যায়নি। আবার চেষ্টা করুন।"
      else "Update failed. Tap to retry."
    }finally { downloading=false }
   }
  }.padding(horizontal=14.dp,vertical=12.dp),
  verticalAlignment=Alignment.CenterVertically
 ){
  Text(label,style=EkmivoType.settingsRow,color=p.text,modifier=Modifier.weight(1f))
  Text(secondary,style=EkmivoType.segment,
   color=if(error!=null)p.warning else p.secondary)
 }
}
