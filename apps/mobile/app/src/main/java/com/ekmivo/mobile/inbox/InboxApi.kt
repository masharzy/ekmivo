package com.ekmivo.mobile.inbox

import android.content.Context
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import org.json.JSONObject

/** One contract for native screens. Production always uses the signed device transport. */
internal interface InboxApi {
 suspend fun call(action:String,thread:String?=null,filters:JSONObject?=null,body:JSONObject?=null,before:Long?=null):JSONObject
}
internal class SignedInboxApi(private val context:Context):InboxApi {
 override suspend fun call(action:String,thread:String?,filters:JSONObject?,body:JSONObject?,before:Long?)=
  inboxRequest(context,action,thread,filters,body,before)
}
// Instrumentation fixtures override this provider; no test transport is compiled into release.
internal val LocalInboxApi=staticCompositionLocalOf<InboxApi?>{null}
@Composable internal fun rememberInboxApi():InboxApi {
 val context=LocalContext.current.applicationContext
 val provided=LocalInboxApi.current
 return provided?:remember(context){SignedInboxApi(context)}
}
