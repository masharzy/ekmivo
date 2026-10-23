package com.ekmivo.mobile.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ekmivo.mobile.ui.EkmivoType
import com.ekmivo.mobile.ui.LocalEkmivoPalette

/**
 * First-party emoji panel; GIF and sticker search deliberately remain unavailable
 * until a real, licensed backend provider and channel send capabilities exist.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InboxEmojiPicker(bn:Boolean,onDismiss:()->Unit,onEmoji:(String)->Unit) {
 val p=LocalEkmivoPalette.current
 var tab by remember { mutableIntStateOf(0) }
 val tabs=if(bn)listOf("ইমোজি","GIF","স্টিকার") else listOf("Emoji","GIF","Stickers")
 val faces=listOf("😀","😁","😂","🤣","😊","😍","🥰","😘","😎","🥹","😭","😢","😡","🤔","😮","😴",
  "👍","👎","👏","🙏","👌","✌️","💪","👋","🤝","❤️","🧡","💛","💚","💙","💜","💯",
  "🎉","🎂","🎁","🔥","✨","⭐","☀️","🌸","🌹","🐱","🐶","☕","🍕","🍔","🚀","✅","👕","🛍️")
 ModalBottomSheet(onDismissRequest=onDismiss,containerColor=p.raised,tonalElevation=0.dp,
  dragHandle=null,scrimColor=Color.Black.copy(alpha=.55f),shape=RoundedCornerShape(topStart=24.dp,topEnd=24.dp)) {
  Column(Modifier.fillMaxWidth().heightIn(min=290.dp,max=410.dp).padding(horizontal=16.dp,vertical=14.dp)) {
   Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
    tabs.forEachIndexed{idx,title->
     val on=tab==idx
     Box(Modifier.clip(CircleShape).background(if(on)p.text else p.surface)
      .clickable{tab=idx}.padding(horizontal=18.dp,vertical=8.dp),contentAlignment=Alignment.Center) {
      Text(title,style=EkmivoType.segment,color=if(on)p.onPrimary else p.secondary)
     }
    }
   }
   Spacer(Modifier.height(12.dp))
   if(tab==0)LazyVerticalGrid(GridCells.Fixed(7),modifier=Modifier.fillMaxWidth().weight(1f),
    horizontalArrangement=Arrangement.spacedBy(4.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
    items(faces){face->Box(Modifier.size(43.dp).clip(RoundedCornerShape(12.dp))
     .clickable{onEmoji(face)},contentAlignment=Alignment.Center) {
     Text(face,fontSize=26.sp)
    }}
   } else Box(Modifier.fillMaxWidth().weight(1f),contentAlignment=Alignment.Center) {
    Text(if(bn)"এই ফিচারটি GIF/স্টিকার API সংযোগের পরে চালু হবে।" else
     "GIF and stickers will be available after a supported API is connected.",
     style=EkmivoType.body,color=p.secondary)
   }
  }
 }
}
