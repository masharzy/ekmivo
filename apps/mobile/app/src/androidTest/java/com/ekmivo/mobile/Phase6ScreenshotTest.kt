package com.ekmivo.mobile

import android.graphics.Bitmap
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.receipt.ConnectionState
import com.ekmivo.mobile.receipt.EkmivoSmsHome
import com.ekmivo.mobile.receipt.EkmivoSettingsScreen
import com.ekmivo.mobile.receipt.PairingFlow
import com.ekmivo.mobile.receipt.SetupWizard
import com.ekmivo.mobile.receipt.EkmivoDisconnected
import com.ekmivo.mobile.ui.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/**
 * Screenshots for all five reference screens on 360dp and 412dp emulators.
 * Capturing images is NOT itself a pixel-match assertion.
 */
@RunWith(AndroidJUnit4::class)
class Phase6ScreenshotTest {
 @get:Rule val rule=createComposeRule()

 private fun shot(screen:String,bn:Boolean,dark:Boolean) {
  val ctx=InstrumentationRegistry.getInstrumentation().targetContext
  val width=ctx.resources.configuration.screenWidthDp
  rule.setContent {
   EkmivoTheme(dark=dark) {
    when(screen) {
     "pairing" -> PairingFlow(bn,null,onLanguageChange={},onPaired={})
     "wizard" -> SetupWizard(bn,onLanguageChange={},onDone={})
     "disconnected" -> EkmivoDisconnected(bn,0,onReconnect={},onQueue={})
     else -> Column(Modifier.fillMaxSize()) {
      EkmivoReferenceHeader(if(screen=="live")"UI test workspace" else if(bn)"সেটিংস" else "Settings",titleIsPage=screen!="live")
      Box(Modifier.weight(1f)) {
       if(screen=="live") EkmivoSmsHome(bn,ConnectionState.Active,onRetry={})
       else EkmivoSettingsScreen(
        bn,if(bn)Language.BN else Language.EN,
        if(dark)Appearance.DARK else Appearance.LIGHT,
        changeLanguage={},changeAppearance={},
        onSetup={},onDisconnected={}
       )
      }
      EkmivoReferenceBottomNav(
       bn,listOf(EkmivoReferencePage.SMS,EkmivoReferencePage.SETTINGS),
       if(screen=="live")EkmivoReferencePage.SMS else EkmivoReferencePage.SETTINGS,
       onSelect={}
      )
     }
    }
   }
  }
  rule.waitForIdle()
  val bitmap=rule.onRoot().captureToImage().asAndroidBitmap()
  val locale=if(bn)"bn" else "en"
  val theme=if(dark)"dark" else "light"
  val filename=screen+"_"+width.toString()+"dp_"+locale+"_"+theme+".png"
  saveTestScreenshot(filename,bitmap,"Ekmivo-Phase6")
 }

 @Test fun pairingEnglishDark()=shot("pairing",false,true)
 @Test fun pairingEnglishLight()=shot("pairing",false,false)
 @Test fun pairingBanglaDark()=shot("pairing",true,true)
 @Test fun pairingBanglaLight()=shot("pairing",true,false)
 @Test fun wizardEnglishDark()=shot("wizard",false,true)
 @Test fun wizardEnglishLight()=shot("wizard",false,false)
 @Test fun wizardBanglaDark()=shot("wizard",true,true)
 @Test fun wizardBanglaLight()=shot("wizard",true,false)
 @Test fun disconnectedEnglishDark()=shot("disconnected",false,true)
 @Test fun disconnectedEnglishLight()=shot("disconnected",false,false)
 @Test fun disconnectedBanglaDark()=shot("disconnected",true,true)
 @Test fun disconnectedBanglaLight()=shot("disconnected",true,false)
 @Test fun liveEnglishDark()=shot("live",false,true)
 @Test fun liveEnglishLight()=shot("live",false,false)
 @Test fun liveBanglaDark()=shot("live",true,true)
 @Test fun liveBanglaLight()=shot("live",true,false)
 @Test fun settingsEnglishDark()=shot("settings",false,true)
 @Test fun settingsEnglishLight()=shot("settings",false,false)
 @Test fun settingsBanglaDark()=shot("settings",true,true)
 @Test fun settingsBanglaLight()=shot("settings",true,false)
}
