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

/** Insets belong to the screen host, so nested headers never double-pad. */
@Composable
fun EkmivoReferenceHeader(
 title: String,
 subtitle: String? = null,
 modifier: Modifier = Modifier,
 titleIsPage: Boolean = false,
 trailing: @Composable RowScope.() -> Unit = {}
) {
 val p = LocalEkmivoPalette.current
 Row(modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=16.dp,bottom=8.dp),
  horizontalArrangement=Arrangement.spacedBy(10.dp), verticalAlignment=Alignment.CenterVertically) {
  Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(p.text),
   contentAlignment=Alignment.Center) {
   Text("e.", style=EkmivoType.shop.copy(fontSize=16.sp), color=p.onPrimary)
  }
  Column(Modifier.weight(1f)) {
   Text(title,style=if(titleIsPage)EkmivoType.inboxTitle else EkmivoType.shop,color=p.text)
   if(!subtitle.isNullOrBlank()) Text(subtitle,style=EkmivoType.meta,color=p.secondary)
  }
  trailing()
 }
}
