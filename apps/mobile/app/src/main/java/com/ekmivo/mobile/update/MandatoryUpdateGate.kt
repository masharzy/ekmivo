package com.ekmivo.mobile.update

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.ekmivo.mobile.ui.EkmivoType
import com.ekmivo.mobile.ui.LocalEkmivoPalette
import kotlinx.coroutines.*
import java.io.File

/**
 * The release manifest is authoritative. New published builds block interaction
 * until the Android system installer updates the app. A missing/unreachable
 * manifest never fabricates an update or bricks an offline paired phone.
 * Installation always requires the user's Android system consent.
 */
@Composable
fun MandatoryUpdateGate(bn:Boolean) {
 val app=LocalContext.current.applicationContext
 val p=LocalEkmivoPalette.current
 val lifecycle=LocalLifecycleOwner.current
 val scope=rememberCoroutineScope()
 var result by remember{mutableStateOf<UpdateCheck?>(null)}
 var busy by remember{mutableStateOf(false)}
 var error by remember{mutableStateOf(false)}
 var downloaded by remember{mutableStateOf<File?>(null)}
 LaunchedEffect(lifecycle) {
  lifecycle.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
   while(isActive) {
    result=AppUpdateService.check()
    delay(6L*60L*60L*1000L)
   }
  }
 }
 val release=(result as? UpdateCheck.Available)?.release ?: return
 Dialog(onDismissRequest={},properties=DialogProperties(
  dismissOnBackPress=false,dismissOnClickOutside=false,usePlatformDefaultWidth=false)) {
  Column(Modifier.fillMaxWidth().padding(horizontal=20.dp)
   .clip(RoundedCornerShape(24.dp)).background(p.raised).padding(22.dp),
   horizontalAlignment=Alignment.CenterHorizontally) {
   Text(if(bn)"নতুন আপডেট এসেছে" else "Update required",
    style=EkmivoType.centerTitle,color=p.text,textAlign=TextAlign.Center)
   Spacer(Modifier.height(8.dp))
   Text(if(bn)"Ekmivo ${release.name} ব্যবহার করতে অ্যাপটি আপডেট করুন।"
    else "Install Ekmivo ${release.name} to continue using the app.",
    style=EkmivoType.body,color=p.secondary,textAlign=TextAlign.Center)
   if(error) {
    Spacer(Modifier.height(12.dp))
    Text(if(bn)"ডাউনলোড বা ইনস্টলার খোলা যায়নি। আবার চেষ্টা করুন।"
     else "Download or installation could not start. Please retry.",
     style=EkmivoType.heroNote,color=p.danger,textAlign=TextAlign.Center)
   }
   Spacer(Modifier.height(18.dp))
   Box(Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp))
    .background(p.text).clickable(enabled=!busy) {
     scope.launch {
      busy=true;error=false
      try {
       val f=downloaded?.takeIf{it.exists()&&it.name=="ekmivo-update-${release.code}.apk"}
        ?:AppUpdateService.download(app,release)
       downloaded=f
       AppUpdateService.openInstaller(app,f)
      }catch(_:Exception){error=true}
      finally{busy=false}
     }
    },contentAlignment=Alignment.Center) {
    Text(when {
     busy->if(bn)"ডাউনলোড হচ্ছে…" else "Downloading…"
     downloaded?.exists()==true->if(bn)"ইনস্টল করুন" else "Install update"
     else->if(bn)"আপডেট করুন" else "Update now"
    },style=EkmivoType.button,color=p.onPrimary)
   }
   Spacer(Modifier.height(10.dp))
   Text(if(bn)"ইনস্টল করার সময় Android-এর অনুমতি প্রয়োজন হবে।"
    else "Android will request your approval to install the update.",
    style=EkmivoType.meta,color=p.secondary,textAlign=TextAlign.Center)
  }
 }
}
