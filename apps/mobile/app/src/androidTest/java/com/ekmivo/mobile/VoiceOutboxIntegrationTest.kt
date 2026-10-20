package com.ekmivo.mobile

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.ekmivo.mobile.inbox.*
import com.ekmivo.mobile.ui.EkmivoTheme
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Regression: failed voice stays in the chat and retries the same logical media send. */
@RunWith(AndroidJUnit4::class)
class VoiceOutboxIntegrationTest {
 @get:Rule val rule=createComposeRule()
 @Test fun failedVoiceShowsRetryInChatNotGallery() {
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  val source=File(context.cacheDir,"voice-test-${UUID.randomUUID()}.m4a")
  source.writeBytes(byteArrayOf(0,1,2,3))
  val file=VoiceOutbox.preserve(context,source)
  val voice=LocalVoiceMessage("local-test","thread-test","workspace-test",file,
   UUID.randomUUID().toString(),"stable-key","stable-batch",1500L,null,"failed")
  var retried=0
  rule.setContent { EkmivoTheme(false) { LocalVoiceBubble(voice,false,onRetry={retried++}) } }
  rule.onNodeWithContentDescription("Retry failed voice").assertExists().performClick()
  rule.runOnIdle { assertEquals(1,retried) }
  rule.onAllNodesWithText("1/1").assertCountEquals(0)
  file.delete()
 }
 @Test fun retryPreservesMediaAndIdempotencyKey()=runBlocking {
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  val file=File(context.filesDir,"voice-retry-${UUID.randomUUID()}.m4a")
  file.writeBytes(byteArrayOf(1,2,3,4,5))
  val voice=LocalVoiceMessage("local-1","thread-1","workspace-1",file,
   UUID.randomUUID().toString(),"stable-retry-key","stable-batch",1800L,null,"failed")
  val sent=mutableListOf<Pair<String,JSONObject>>()
  val fake=object:InboxApi {
   var failOnce=true
   override suspend fun call(action:String,thread:String?,filters:JSONObject?,body:JSONObject?,before:Long?):JSONObject{
    sent.add(action to JSONObject(body.toString()))
    if(action=="media-upload"&&failOnce){failOnce=false;error("temporary upload error")}
    return JSONObject().put("ok",true)
   }
  }
  try {
   runCatching { submitRecordedVoice(fake,voice) }.onSuccess { fail("Expected first upload to fail") }
   assertTrue(file.exists())
   submitRecordedVoice(fake,voice)
   assertEquals(listOf("media-upload","media-upload","send-media"),sent.map{it.first})
   assertEquals(sent[0].second.getString("media_id"),sent[1].second.getString("media_id"))
   assertEquals(voice.mediaId,sent[2].second.getString("media_id"))
   assertEquals("stable-retry-key",sent[2].second.getString("idempotency_key"))
  }finally{file.delete()}
 }
}
