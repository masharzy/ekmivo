package com.briofold.mobile.receipt

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.briofold.mobile.data.AppPreferences
import com.briofold.mobile.data.Appearance
import com.briofold.mobile.data.Language
import com.briofold.mobile.ui.BriofoldApp

/** Legacy navigation entry: shows the same stateful Forwarder screen as the main tab. */
class ReceiptSetupActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  val preferences=AppPreferences(applicationContext)
  setContent{
   val language by preferences.language.collectAsState(initial=Language.EN)
   val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
   val dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}
   BriofoldApp(preferences)
  }
 }
}
