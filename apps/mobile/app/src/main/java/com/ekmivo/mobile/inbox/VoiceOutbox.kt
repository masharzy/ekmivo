package com.ekmivo.mobile.inbox

import android.content.Context
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Voice uploads are never gallery attachments. The same ids are reused for every retry. */
internal class LocalVoiceMessage(
 val id:String,
 val threadId:String,
 val workspaceKey:String,
 val file:File,
 val mediaId:String,
 val idempotencyKey:String,
 val batchId:String,
 val durationMs:Long,
 val replyTo:String?,
 initialStatus:String="pending"
) {
 var status by mutableStateOf(initialStatus)
}

internal object VoiceOutbox {
 private const val PREFS="ekmivo_voice_outbox_v1"
 private const val KEY="entries"
 private fun toJson(v:LocalVoiceMessage)=JSONObject()
  .put("id",v.id).put("thread",v.threadId).put("workspace",v.workspaceKey)
  .put("file",v.file.absolutePath).put("media",v.mediaId)
  .put("key",v.idempotencyKey).put("batch",v.batchId)
  .put("duration",v.durationMs).put("reply",v.replyTo)
  .put("status",v.status)
 private fun entries(context:Context):JSONArray=runCatching {
  JSONArray(context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(KEY,"[]")?:"[]")
 }.getOrElse{JSONArray()}
 fun load(context:Context,workspace:String,thread:String):List<LocalVoiceMessage> {
  val all=entries(context)
  val safeRoot=File(context.filesDir,"inbox-voice-outbox").canonicalPath+File.separator
  return (0 until all.length()).mapNotNull{idx->
   runCatching {
    val row=all.getJSONObject(idx)
    if(row.optString("workspace")!=workspace||row.optString("thread")!=thread)return@runCatching null
    val file=File(row.getString("file"))
    if(!file.canonicalPath.startsWith(safeRoot)||!file.isFile)return@runCatching null
    LocalVoiceMessage(
     row.getString("id"),thread,workspace,file,row.getString("media"),
     row.getString("key"),row.getString("batch"),
     row.getLong("duration"),row.optString("reply").takeUnless{it.isBlank()||it=="null"},
     when(row.optString("status")){"sent"->"sent";else->"failed"}
    )
   }.getOrNull()
  }
 }
 fun save(context:Context,workspace:String,thread:String,voices:List<LocalVoiceMessage>) {
  val existing=entries(context)
  val all=JSONArray()
  for(i in 0 until existing.length()) {
   val row=existing.optJSONObject(i)?:continue
   if(row.optString("workspace")!=workspace||row.optString("thread")!=thread)all.put(row)
  }
  voices.forEach{all.put(toJson(it))}
  context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(KEY,all.toString()).apply()
 }
 fun preserve(context:Context,recorded:File):File {
  val dir=File(context.filesDir,"inbox-voice-outbox").apply{mkdirs()}
  val dest=File(dir,UUID.randomUUID().toString()+".m4a")
  if(!recorded.renameTo(dest)){recorded.copyTo(dest);recorded.delete()}
  return dest
 }
}

internal suspend fun submitRecordedVoice(api:InboxApi,v:LocalVoiceMessage) {
 val bytes=withContext(Dispatchers.IO){v.file.readBytes()}
 check(bytes.isNotEmpty()&&bytes.size<=5_242_880){"VOICE_SIZE_UNSUPPORTED"}
 api.call("media-upload",v.threadId,body=JSONObject()
  .put("media_id",v.mediaId)
  .put("data",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP))
  .put("mime","audio/mp4")
  .put("name","voice.m4a")
  .put("duration_ms",v.durationMs))
 api.call("send-media",v.threadId,body=JSONObject()
  .put("media_id",v.mediaId).put("idempotency_key",v.idempotencyKey)
  .put("batch_id",v.batchId)
  .apply{v.replyTo?.let{put("reply_to",it)}})
}

@Composable
internal fun LocalVoiceBubble(voice:LocalVoiceMessage,bn:Boolean,onRetry:()->Unit) {
 val p=LocalEkmivoPalette.current
 val ink=p.text
 var player by remember(voice.id){mutableStateOf<MediaPlayer?>(null)}
 var playing by remember(voice.id){mutableStateOf(false)}
 var elapsed by remember(voice.id){mutableIntStateOf(0)}
 DisposableEffect(voice.id){
  onDispose{runCatching{player?.stop()};player?.release()}
 }
 LaunchedEffect(player){
  while(isActive){
   val v=player
   playing=runCatching{v?.isPlaying==true}.getOrDefault(false)
   if(v!=null)elapsed=runCatching{v.currentPosition/1000}.getOrDefault(0)
   delay(90)
  }
 }
 Column(Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=2.dp),horizontalAlignment=Alignment.End) {
  Column(Modifier.width(244.dp).clip(RoundedCornerShape(16.dp))
   .background(p.raised).padding(horizontal=12.dp,vertical=9.dp),
   verticalArrangement=Arrangement.spacedBy(4.dp)){
   Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)) {
    Box(Modifier.size(32.dp).clip(CircleShape).clickable{
     runCatching{
      if(player?.isPlaying==true)player?.pause()
      else {
       if(player==null)player=MediaPlayer().apply{setDataSource(voice.file.absolutePath);prepare()}
       player?.start()
      }
     }
    },contentAlignment=Alignment.Center){
     EkmivoReferenceIcon(if(playing)EkmivoGlyph.PAUSE else EkmivoGlyph.PLAY,tint=ink,size=18.dp)
    }
    Row(Modifier.weight(1f).height(26.dp),verticalAlignment=Alignment.CenterVertically,
     horizontalArrangement=Arrangement.spacedBy(2.dp)){
     repeat(26){index->
      val bar=(4+((index*17+index*index*7)%19)).dp
      Box(Modifier.weight(1f).height(bar).clip(RoundedCornerShape(2.dp))
       .background(ink.copy(alpha=if(playing&&index<=elapsed)0.9f else .35f)))
     }
    }
    Text(displayDigits("${voice.durationMs/1000}s",bn),style=EkmivoType.meta,color=ink.copy(alpha=.7f))
   }
   Row(Modifier.align(Alignment.End),verticalAlignment=Alignment.CenterVertically,
    horizontalArrangement=Arrangement.spacedBy(4.dp)){
    Text(displayDigits(java.text.SimpleDateFormat("HH:mm",java.util.Locale.US).format(java.util.Date()),bn),
     style=EkmivoType.messageTime,color=ink.copy(alpha=.65f))
    when(voice.status){
     "failed"->Box(Modifier.size(22.dp).clip(CircleShape).clickable{onRetry()},
      contentAlignment=Alignment.Center) {
      EkmivoReferenceIcon(EkmivoGlyph.X,tint=p.danger,size=14.dp,
       description=if(bn)"আবার পাঠান" else "Retry failed voice")
     }
     "sent"->EkmivoReferenceIcon(EkmivoGlyph.CHK,tint=ink.copy(alpha=.65f),size=13.dp)
     else->EkmivoReferenceIcon(EkmivoGlyph.CLK,tint=ink.copy(alpha=.65f),size=13.dp)
    }
   }
  }
 }
}
