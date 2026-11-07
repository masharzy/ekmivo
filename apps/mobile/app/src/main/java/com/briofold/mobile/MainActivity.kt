package com.briofold.mobile

import android.os.Bundle
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.briofold.mobile.data.AppPreferences
import com.briofold.mobile.ui.BriofoldApp

class MainActivity : ComponentActivity() {
 private var inboxThread by mutableStateOf<String?>(null)
 private var inboxWorkspace by mutableStateOf<String?>(null)
 private var incomingLink by mutableStateOf<String?>(null)
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  WindowCompat.setDecorFitsSystemWindows(window, false)
  incomingLink=intent?.dataString
  inboxThread=intent?.getStringExtra("inbox_thread")
  inboxWorkspace=intent?.getStringExtra("inbox_workspace")
  val preferences = AppPreferences(applicationContext)
  setContent { BriofoldApp(preferences = preferences, incomingPairingLink = incomingLink,incomingInboxThread=inboxThread,incomingInboxWorkspace=inboxWorkspace) }
 }
 override fun onNewIntent(intent:Intent) {
  super.onNewIntent(intent)
  setIntent(intent)
  incomingLink=intent.dataString
  inboxThread=intent.getStringExtra("inbox_thread")
  inboxWorkspace=intent.getStringExtra("inbox_workspace")
 }
}
