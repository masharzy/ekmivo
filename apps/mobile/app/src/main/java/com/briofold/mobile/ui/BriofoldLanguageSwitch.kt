package com.briofold.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

/** Compact language switch available before pairing and from the app header. */
@Composable
fun BriofoldLanguageSwitch(bn: Boolean, onChange: (Boolean) -> Unit) {
 val p = LocalBriofoldPalette.current
 Row(
  modifier = Modifier
   .clip(CircleShape)
   .background(p.surface)
   .border(1.dp, p.border, CircleShape)
 ) {
  listOf("EN" to false, "BN" to true).forEach { (title, optionBn) ->
   val active = bn == optionBn
   Text(
    title,
    modifier = Modifier
     .clip(CircleShape)
     .background(if (active) p.text else p.surface)
     .clickable { if (!active) onChange(optionBn) }
     .padding(horizontal = 10.dp, vertical = 6.dp),
    style = BriofoldType.meta,
    color = if (active) p.onPrimary else p.secondary
   )
  }
 }
}
