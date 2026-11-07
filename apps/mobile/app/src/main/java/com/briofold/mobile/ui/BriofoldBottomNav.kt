package com.briofold.mobile.ui

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
enum class BriofoldPage { LIVE, SETTINGS }

@Composable
fun BriofoldBottomNav(bn:Boolean,page:BriofoldPage,onSelect:(BriofoldPage)->Unit) {
 val p=LocalBriofoldPalette.current
 Row(
  Modifier.fillMaxWidth().topHairline(p.border).background(p.canvas)
   .navigationBarsPadding().padding(start=24.dp,end=24.dp,top=8.dp,bottom=14.dp),
  horizontalArrangement=Arrangement.SpaceAround,
  verticalAlignment=Alignment.CenterVertically
 ) {
  BriofoldNavItem(if(bn)"লাইভ" else "Live",page==BriofoldPage.LIVE,
   onClick={onSelect(BriofoldPage.LIVE)},icon={
    BriofoldNavLineIcon(BriofoldPage.LIVE,if(page==BriofoldPage.LIVE)p.text else p.secondary)
   })
  BriofoldNavItem(if(bn)"সেটিংস" else "Settings",page==BriofoldPage.SETTINGS,
   onClick={onSelect(BriofoldPage.SETTINGS)},icon={
    BriofoldNavLineIcon(BriofoldPage.SETTINGS,if(page==BriofoldPage.SETTINGS)p.text else p.secondary)
   })
 }
}

@Composable
private fun BriofoldNavLineIcon(page:BriofoldPage,ink:Color) {
 BriofoldReferenceIcon(if(page==BriofoldPage.LIVE) BriofoldGlyph.ACT else BriofoldGlyph.SET, tint=ink)
}

/** Visual contract only: the host must not expose an unimplemented inbox. */
enum class BriofoldReferencePage { INBOX, SMS, SETTINGS }

@Composable
fun BriofoldReferenceBottomNav(
 bn: Boolean,
 pages: List<BriofoldReferencePage>,
 selected: BriofoldReferencePage,
 onSelect: (BriofoldReferencePage) -> Unit
) {
 val p = LocalBriofoldPalette.current
 Row(Modifier.fillMaxWidth().topHairline(p.border).background(p.canvas)
  .navigationBarsPadding().padding(start=12.dp,end=12.dp,top=8.dp,bottom=14.dp),
  horizontalArrangement=Arrangement.SpaceAround, verticalAlignment=Alignment.CenterVertically) {
  pages.forEach { page ->
   BriofoldNavItem(
    label=when(page) {
     BriofoldReferencePage.INBOX -> if(bn) "ইনবক্স" else "Inbox"
     BriofoldReferencePage.SMS -> "SMS"
     BriofoldReferencePage.SETTINGS -> if(bn) "সেটিংস" else "Settings"
    }, selected=page==selected, onClick={onSelect(page)}, compact=true,
    icon={ BriofoldReferenceIcon(when(page) {
     BriofoldReferencePage.INBOX -> BriofoldGlyph.MSG
     BriofoldReferencePage.SMS -> BriofoldGlyph.ACT
     BriofoldReferencePage.SETTINGS -> BriofoldGlyph.SET
    }, tint=if(page==selected)p.text else p.secondary) }
   )
  }
 }
}
