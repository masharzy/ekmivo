package com.ekmivo.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * One shared top bar for Live and Settings. Never render the app logo twice.
 * Brand and current language control are identical across both tabs.
 */
@Composable
fun EkmivoBrandHeader(bn:Boolean,onLanguageChange:(Boolean)->Unit) {
 val p=LocalEkmivoPalette.current
 Row(
  Modifier.fillMaxWidth().statusBarsPadding().padding(start=16.dp,end=16.dp,top=16.dp,bottom=8.dp),
  verticalAlignment=Alignment.CenterVertically,
  horizontalArrangement=Arrangement.spacedBy(10.dp)
 ) {
  Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
   contentAlignment=Alignment.Center) {
   Text("e.",style=EkmivoType.shop.copy(fontSize=16.sp),color=p.onPrimary)
  }
  Text("ekmivo",style=EkmivoType.shop,color=p.text,modifier=Modifier.weight(1f))
  EkmivoLanguageSwitch(bn=bn,onChange=onLanguageChange)
 }
}
