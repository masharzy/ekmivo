package com.ekmivo.mobile.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.BuildConfig
import com.ekmivo.mobile.data.AppPreferences
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.receipt.ForwarderScreen
import com.ekmivo.mobile.receipt.ReceiptRecoveryControl
import kotlinx.coroutines.launch

private enum class Tab(val icon:ImageVector) {
 FORWARDER(Icons.Outlined.Smartphone), INBOX(Icons.Outlined.ChatBubbleOutline), SETTINGS(Icons.Outlined.Settings)
}
@Composable
fun EkmivoApp(preferences:AppPreferences){
 val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
 val language by preferences.language.collectAsState(initial=Language.BN)
 val bn=language==Language.BN
 val dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}
 val scope=rememberCoroutineScope()
 var tab by rememberSaveable{mutableStateOf(Tab.FORWARDER)}
 EkmivoTheme(dark=dark){
  Scaffold(
   containerColor=MaterialTheme.colorScheme.background,
   bottomBar={
    Surface(
     modifier=Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal=18.dp,vertical=11.dp),
     shape=RoundedCornerShape(28.dp),
     color=MaterialTheme.colorScheme.surface,
     shadowElevation=12.dp,
     border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)
    ){
     Row(Modifier.fillMaxWidth().padding(6.dp),horizontalArrangement=Arrangement.spacedBy(3.dp)){
      Tab.entries.forEach{item->
       val chosen=item==tab
       val label=when(item){
        Tab.FORWARDER->"SMS Forwarder"
        Tab.INBOX->"Inbox"
        Tab.SETTINGS->if(bn)"সেটিংস" else "Settings"
       }
       Column(
        modifier=Modifier.weight(if(item==Tab.FORWARDER)1.35f else 1f)
         .background(if(chosen)MaterialTheme.colorScheme.primary else Color.Transparent,RoundedCornerShape(22.dp))
         .clickable{tab=item}.padding(vertical=10.dp,horizontal=1.dp),
        verticalArrangement=Arrangement.spacedBy(3.dp),
        horizontalAlignment=Alignment.CenterHorizontally
       ){
        Icon(item.icon,contentDescription=null,modifier=Modifier.size(21.dp),
         tint=if(chosen)MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
        Text(label,style=MaterialTheme.typography.labelMedium,maxLines=1,
         color=if(chosen)MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant)
       }
      }
     }
    }
   }
  ){padding->
   Column(Modifier.fillMaxSize().padding(padding)){
    Row(Modifier.fillMaxWidth().padding(start=25.dp,end=25.dp,top=15.dp,bottom=13.dp),
     verticalAlignment=Alignment.CenterVertically){
     Surface(color=MaterialTheme.colorScheme.primary,shape=RoundedCornerShape(11.dp)){
      Text("e.",Modifier.padding(horizontal=13.dp,vertical=4.dp),
       color=MaterialTheme.colorScheme.onPrimary,style=MaterialTheme.typography.titleLarge)
     }
     Spacer(Modifier.width(10.dp))
     Text("ekmivo",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
    }
    AnimatedContent(targetState=tab,transitionSpec={
     fadeIn(tween(170)) togetherWith fadeOut(tween(100))
    },label="App section",modifier=Modifier.fillMaxSize()){page->
     when(page){
      Tab.FORWARDER->ForwarderScreen(bn)
      Tab.INBOX->Column(
       Modifier.fillMaxSize().padding(25.dp),
       verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.CenterHorizontally){
       Surface(color=MaterialTheme.colorScheme.surfaceVariant,shape=CircleShape){
        Icon(Icons.Outlined.ChatBubbleOutline,null,Modifier.padding(23.dp).size(36.dp))
       }
       Spacer(Modifier.height(22.dp))
       Text(if(bn)"ইনবক্স" else "Inbox",style=MaterialTheme.typography.headlineMedium)
       Spacer(Modifier.height(7.dp))
       Text(if(bn)"এখানে আপনার বার্তাগুলো দেখা যাবে।" else "Your conversations will appear here.",
        color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodyMedium)
      }
      Tab.SETTINGS->Column(
       Modifier.fillMaxSize().padding(24.dp),
       verticalArrangement=Arrangement.spacedBy(19.dp)){
       Text(if(bn)"সেটিংস" else "Settings",style=MaterialTheme.typography.headlineMedium)
       Text(if(bn)"ভাষা" else "Language",style=MaterialTheme.typography.titleMedium)
       Row(horizontalArrangement=Arrangement.spacedBy(9.dp)){
        FilterChip(selected=language==Language.BN,onClick={scope.launch{preferences.updateLanguage(Language.BN)}},
         label={Text("বাংলা")})
        FilterChip(selected=language==Language.EN,onClick={scope.launch{preferences.updateLanguage(Language.EN)}},
         label={Text("English")})
       }
       HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
       Text(if(bn)"অ্যাপের রং" else "Appearance",style=MaterialTheme.typography.titleMedium)
       Row(horizontalArrangement=Arrangement.spacedBy(9.dp)){
        listOf(Appearance.SYSTEM,Appearance.LIGHT,Appearance.DARK).forEach{option->
         val text=when(option){
          Appearance.SYSTEM->if(bn)"সিস্টেম" else "System"
          Appearance.LIGHT->if(bn)"লাইট" else "Light"
          Appearance.DARK->if(bn)"ডার্ক" else "Dark"
         }
         FilterChip(selected=appearance==option,
          onClick={scope.launch{preferences.updateAppearance(option)}},label={Text(text)})
        }
       }
       HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
       ReceiptRecoveryControl(bn)
       Spacer(Modifier.weight(1f))
       Text("Ekmivo · v"+BuildConfig.VERSION_NAME,style=MaterialTheme.typography.labelMedium,
        color=MaterialTheme.colorScheme.onSurfaceVariant)
      }
     }
    }
   }
  }
 }
}
