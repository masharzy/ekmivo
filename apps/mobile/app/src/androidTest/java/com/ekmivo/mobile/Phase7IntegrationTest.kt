package com.ekmivo.mobile

import android.graphics.Bitmap
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.ekmivo.mobile.inbox.*
import com.ekmivo.mobile.receipt.WorkspaceAccess
import com.ekmivo.mobile.ui.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

/** Isolated native UI journeys, not live Meta/phone acceptance or pixel-match evidence. */
@RunWith(AndroidJUnit4::class)
class Phase7IntegrationTest {
 @get:Rule val rule=createComposeRule()
 private val thread="c0000000-0000-4000-8000-000000000001"
 private val workspace=WorkspaceAccess("d0000000-0000-4000-8000-000000000001","UI test workspace","sandbox",true,false)
 private class Fixture(val thread:String):InboxApi {
  val sent=CopyOnWriteArrayList<String>();val reads=CopyOnWriteArrayList<Long>()
  @Volatile var fail=false
  var note="Retained note";var version=0L
  val now=Instant.now().toString()
  fun caps()=JSONObject("""{"image":true,"audio":true,"document":true,"forward":true,"product":true,"delivered":true,"reactions":["❤️","👍"]}""")
  override suspend fun call(action:String,thread:String?,filters:JSONObject?,body:JSONObject?,before:Long?):JSONObject {
   if(fail)error("fixture offline")
   return when(action){
    "list"->JSONObject().put("items",JSONArray().put(JSONObject().put("id",this.thread).put("name","Fixture customer").put("channel","wa").put("ai_enabled",true).put("unread",1).put("last_activity_at",now).put("preview","Hello from fixture").put("preview_sender","customer")))
    "messages"->{val rows=JSONArray().put(JSONObject().put("id","e0000000-0000-4000-8000-000000000001").put("sequence",1).put("sender","customer").put("type","text").put("body","Hello from fixture").put("state","received").put("created_at",now));sent.forEachIndexed{i,text->rows.put(JSONObject().put("id","f0000000-0000-4000-8000-${(i+1).toString().padStart(12,'0')}").put("sequence",i+2).put("sender","seller").put("type","text").put("body",text).put("state","sent").put("created_at",now))};JSONObject().put("thread",JSONObject().put("id",this.thread).put("name","Fixture customer").put("channel","wa").put("ai_enabled",true).put("read_sequence",0).put("window_open",true).put("capabilities",caps())).put("items",rows)}
    "read"->{reads.add(body!!.getLong("sequence"));JSONObject().put("saved",true)}
    "send"->{sent.add(body!!.getString("text"));JSONObject().put("saved",true)}
    "profile"->JSONObject().put("id",this.thread).put("name","Fixture customer").put("channel","wa").put("phone","+8801700000000").put("contact",JSONObject()).put("note",note).put("note_version",version).put("ai_enabled",true).put("store","UI test workspace").put("messages",1).put("talks",1).put("first",JSONObject().put("at",now).put("text","Hello from fixture")).put("summary",JSONObject("""{"total":0,"ok":0,"cx":0,"rt":0,"run":0,"spend_minor":0}""")).put("orders",JSONArray())
    "note"->{check(body!!.getLong("version")==version);note=body.getString("text");version++;JSONObject().put("saved",true).put("version",version)}
    "media-get"->{val bitmap=Bitmap.createBitmap(220,150,Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.rgb(60,120,150));val out=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();JSONObject().put("data",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP)).put("mime","image/png").put("name","fixture.png")}
    else->JSONObject().put("saved",true)
   }
  }
 }
 private fun capture(name:String){rule.waitForIdle();val context=InstrumentationRegistry.getInstrumentation().targetContext;saveTestScreenshot("${name}_${context.resources.configuration.screenWidthDp}dp.png",rule.onAllNodes(isRoot()).onLast().captureToImage().asAndroidBitmap(),"Ekmivo-Phase7")}
 @Test fun chatDraftSurvivesStateRestorationAndSendUsesGateway(){
  val api=Fixture(thread);val restore=StateRestorationTester(rule)
  restore.setContent{CompositionLocalProvider(LocalInboxApi provides api){EkmivoTheme(false){InboxRoute(false,workspace,initialThread=thread)}}}
  rule.waitUntil(15000){rule.onAllNodesWithTag("chat-input").fetchSemanticsNodes().isNotEmpty()}
  rule.onNodeWithTag("chat-input").performTextInput("Preserved draft")
  restore.emulateSavedInstanceStateRestore()
  rule.waitUntil(15000){rule.onAllNodesWithTag("chat-input").fetchSemanticsNodes().isNotEmpty()}
  rule.onNodeWithTag("chat-input").assertTextEquals("Preserved draft")
  rule.onNodeWithContentDescription("Send message").performClick()
  rule.waitUntil(15000){api.sent.size==1}
  assertEquals("Preserved draft",api.sent.single())
  rule.waitUntil(15000){api.reads.isNotEmpty()}
  capture("chat_restored_and_sent_en_light")
 }
 @Test fun clearCustomerNoteIsDurableAndProfileHasNoFabricatedOrderRate(){
  val api=Fixture(thread)
  rule.setContent{CompositionLocalProvider(LocalInboxApi provides api){EkmivoTheme(true){CustomerProfile(thread,false,{},{})}}}
  rule.waitUntil(15000){rule.onAllNodesWithTag("profile-note").fetchSemanticsNodes().isNotEmpty()}
  rule.onNodeWithTag("profile-note").performScrollTo().performTextClearance()
  rule.onNodeWithText("Save",useUnmergedTree=true).performScrollTo().performClick()
  rule.waitUntil(15000){api.version==1L}
  assertEquals("",api.note)
  rule.onAllNodesWithText("0%",substring=true).assertCountEquals(0)
  capture("profile_note_cleared_en_dark")
 }
 @Test fun inboxSourceFailureNeverLooksLikeEmptyData(){
  val api=Fixture(thread).apply{fail=true}
  rule.setContent{CompositionLocalProvider(LocalInboxApi provides api){EkmivoTheme(false){InboxRoute(false,workspace)}}}
  rule.waitUntil(15000){rule.onAllNodesWithText("Unable to sync. Retrying.").fetchSemanticsNodes().isNotEmpty()}
  rule.onNodeWithText("No conversations found.").assertDoesNotExist()
  capture("inbox_source_failure_en_light")
 }
 @Test fun imageCatalogAtAllAlbumSizesAndFourThemeLanguageModes(){
  val api=Fixture(thread);var count by mutableIntStateOf(1);var dark by mutableStateOf(false);var bn by mutableStateOf(false)
  rule.setContent{CompositionLocalProvider(LocalInboxApi provides api){EkmivoTheme(dark){Column(Modifier.fillMaxSize().background(LocalEkmivoPalette.current.canvas)){Text(if(bn)"শুধু UI পরীক্ষার ছবি" else "UI test images only",color=LocalEkmivoPalette.current.text);val images=(0 until count).map{i->JSONObject().put("id","img-$i").put("type","image").put("content",JSONObject().put("media_id","a0000000-0000-4000-8000-${(i+1).toString().padStart(12,'0')}"))};InboxMessageContent(images.first(),images,thread,bn,LocalEkmivoPalette.current.text)}}}}
  for(mode in 0..3){rule.runOnIdle{dark=mode%2==1;bn=mode>=2};for(n in listOf(1,2,3,4,5,10)){rule.runOnIdle{count=n};rule.waitUntil(15000){rule.onAllNodesWithTag("media-image",useUnmergedTree=true).fetchSemanticsNodes().size>=minOf(n,4)};capture("album_${n}_${if(bn)"bn" else "en"}_${if(dark)"dark" else "light"}")}}
 }
}
