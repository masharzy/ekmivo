package com.ekmivo.mobile.receipt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.ekmivo.mobile.data.AppPreferences
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.ui.EkmivoTheme

/** Legacy navigation entry: shows the same stateful Forwarder screen as the main tab. */
class ReceiptSetupActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  val preferences=AppPreferences(applicationContext)
  setContent{
   val language by preferences.language.collectAsState(initial=Language.BN)
   val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
   val dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}
   EkmivoTheme(dark){ForwarderScreen(language==Language.BN)}
  }
 }
}
