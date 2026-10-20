package com.ekmivo.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp

/** Legacy two-tab host; capability-aware reference navigation is below. */
enum class EkmivoPage { LIVE, SETTINGS }

@Composable
fun EkmivoBottomNav(bn:Boolean,page:EkmivoPage,onSelect:(EkmivoPage)->Unit) {
 val p=LocalEkmivoPalette.current
 Row(
  Modifier.fillMaxWidth().topHairline(p.border).background(p.canvas)
   .navigationBarsPadding().padding(start=24.dp,end=24.dp,top=8.dp,bottom=14.dp),
  horizontalArrangement=Arrangement.SpaceAround,
  verticalAlignment=Alignment.CenterVertically
 ) {
  EkmivoNavItem(if(bn)"লাইভ" else "Live",page==EkmivoPage.LIVE,
   onClick={onSelect(EkmivoPage.LIVE)},icon={
    EkmivoNavLineIcon(EkmivoPage.LIVE,if(page==EkmivoPage.LIVE)p.text else p.secondary)
   })
  EkmivoNavItem(if(bn)"সেটিংস" else "Settings",page==EkmivoPage.SETTINGS,
   onClick={onSelect(EkmivoPage.SETTINGS)},icon={
    EkmivoNavLineIcon(EkmivoPage.SETTINGS,if(page==EkmivoPage.SETTINGS)p.text else p.secondary)
   })
 }
}

@Composable
private fun EkmivoNavLineIcon(page:EkmivoPage,ink:Color) {
 EkmivoReferenceIcon(if(page==EkmivoPage.LIVE) EkmivoGlyph.ACT else EkmivoGlyph.SET, tint=ink)
}

/** Visual contract only: the host must not expose an unimplemented inbox. */
enum class EkmivoReferencePage { INBOX, SMS, SETTINGS }

@Composable
fun EkmivoReferenceBottomNav(
 bn: Boolean,
 pages: List<EkmivoReferencePage>,
 selected: EkmivoReferencePage,
 onSelect: (EkmivoReferencePage) -> Unit
) {
 val p = LocalEkmivoPalette.current
 Row(Modifier.fillMaxWidth().topHairline(p.border).background(p.canvas)
  .navigationBarsPadding().padding(start=12.dp,end=12.dp,top=8.dp,bottom=14.dp),
  horizontalArrangement=Arrangement.SpaceAround, verticalAlignment=Alignment.CenterVertically) {
  pages.forEach { page ->
   EkmivoNavItem(
    label=when(page) {
     EkmivoReferencePage.INBOX -> if(bn) "ইনবক্স" else "Inbox"
     EkmivoReferencePage.SMS -> "SMS"
     EkmivoReferencePage.SETTINGS -> if(bn) "সেটিংস" else "Settings"
    }, selected=page==selected, onClick={onSelect(page)}, compact=true,
    icon={ EkmivoReferenceIcon(when(page) {
     EkmivoReferencePage.INBOX -> EkmivoGlyph.MSG
     EkmivoReferencePage.SMS -> EkmivoGlyph.ACT
     EkmivoReferencePage.SETTINGS -> EkmivoGlyph.SET
    }, tint=if(page==selected)p.text else p.secondary) }
   )
  }
 }
}
