package com.ekmivo.mobile.inbox

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalView
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.ekmivo.mobile.ui.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import java.util.UUID

internal suspend fun fetchMedia(context:Context,thread:String,id:String,api:InboxApi=SignedInboxApi(context)):File=withContext(Dispatchers.IO) {
 require(id.matches(Regex("[a-fA-F0-9-]{36}")))
 val dir=File(context.cacheDir,"inbox/$thread").apply{mkdirs()};val target=File(dir,id)
 if(!target.exists()) {
  val r=api.call("media-get",thread,body=JSONObject().put("media_id",id))
  val bytes=Base64.decode(r.getString("data"),Base64.NO_WRAP)
  check(bytes.size<=5242880)
  val temporary=File(dir,"$id.part");temporary.writeBytes(bytes);check(temporary.renameTo(target))
 }
 target
}

@Composable internal fun MediaImage(uri:String,modifier:Modifier=Modifier,scale:ContentScale=ContentScale.Crop) {
 val app=LocalContext.current
 val bitmap by produceState<android.graphics.Bitmap?>(null,uri){value=withContext(Dispatchers.IO){runCatching{val options=BitmapFactory.Options().apply{inJustDecodeBounds=true};app.contentResolver.openInputStream(Uri.parse(uri))?.use{BitmapFactory.decodeStream(it,null,options)};options.inSampleSize=maxOf(1,maxOf(options.outWidth,options.outHeight)/1600);options.inJustDecodeBounds=false;app.contentResolver.openInputStream(Uri.parse(uri))?.use{BitmapFactory.decodeStream(it,null,options)}}.getOrNull()}}
 bitmap?.let{Image(it.asImageBitmap(),contentDescription=null,modifier=modifier.testTag("media-image"),contentScale=scale)}?:Box(modifier.background(Color.DarkGray),contentAlignment=Alignment.Center){CircularProgressIndicator(Modifier.size(22.dp),color=Color.White)}
}

@Composable internal fun InboxMessageContent(m:JSONObject,group:List<JSONObject>,thread:String,bn:Boolean,ink:Color) {
 val api=rememberInboxApi();val app=LocalContext.current;val scope=rememberCoroutineScope();val p=LocalEkmivoPalette.current;val kind=m.optString("type");val c=m.optJSONObject("content")?:JSONObject()
 var viewer by remember{mutableStateOf<List<String>?>(null)};var viewerIndex by remember{mutableIntStateOf(0)};var error by remember{mutableStateOf(false)}
 when(kind) {
  "image"->{
   val images=if(group.isEmpty())listOf(m)else group
   Column(Modifier.width(220.dp).clip(RoundedCornerShape(13.dp)),verticalArrangement=Arrangement.spacedBy(2.dp)) {
    val shown=images.take(4)
    val rows=if(shown.size==1)listOf(shown)else if(shown.size==3)listOf(shown.take(1),shown.drop(1))else shown.chunked(2)
    rows.forEach{row->Row(horizontalArrangement=Arrangement.spacedBy(2.dp)){row.forEach{image->
     val id=image.optJSONObject("content")?.optString("media_id").orEmpty()
     var file by remember(id){mutableStateOf<File?>(null)}
     LaunchedEffect(id){try{file=fetchMedia(app,thread,id,api)}catch(e:CancellationException){throw e}catch(_:Exception){error=true}}
     Box(Modifier.weight(1f).height(if(images.size==1)240.dp else if(images.size==2||(images.size==3&&row.size==1))150.dp else if(images.size==3)100.dp else 108.dp).clickable{scope.launch{try{val files=images.map{fetchMedia(app,thread,it.getJSONObject("content").getString("media_id"),api).toURI().toString()};viewerIndex=images.indexOf(image);file=File(Uri.parse(files[viewerIndex]).path!!);error=false;viewer=files}catch(_:Exception){error=true}}},contentAlignment=Alignment.Center){
      file?.let{MediaImage(it.toURI().toString(),Modifier.fillMaxSize())}
      if(images.size>4&&image===shown.last())Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha=.5f)),contentAlignment=Alignment.Center){Text("+${images.size-4}",style=EkmivoType.heroAmount,color=Color.White)}
     }
    }}}
   }
  }
  "audio"->VoiceMessage(thread,c,bn,ink)
  "document"->Row(Modifier.widthIn(max=220.dp).clickable{scope.launch{try{val file=fetchMedia(app,thread,c.getString("media_id"),api);val uri=FileProvider.getUriForFile(app,app.packageName+".updates",file);app.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,c.optString("mime")).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))}catch(_:Exception){error=true}}},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){EkmivoReferenceIcon(EkmivoGlyph.DOC,tint=ink,size=34.dp);Column{Text(c.optString("name"),style=EkmivoType.chatMessage,color=ink,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,modifier=Modifier.widthIn(max=130.dp));Text(displayDigits("${c.optLong("size_bytes")/1024} KB",bn),style=EkmivoType.meta,color=ink.copy(alpha=.65f))}}
  "product"->Column(Modifier.width(210.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
   val image=c.optString("image_media_id").takeUnless{it.isBlank()||it=="null"};if(image!=null){var file by remember(image){mutableStateOf<File?>(null)};LaunchedEffect(image){runCatching{fetchMedia(app,thread,image,api)}.onSuccess{file=it}};file?.let{MediaImage(it.toURI().toString(),Modifier.fillMaxWidth().height(110.dp))}}
   Text(c.optString("name"),style=EkmivoType.chatName,color=ink);if(c.optString("sizes").isNotBlank())Text(c.optString("sizes"),style=EkmivoType.meta,color=ink);Text(money(c.optLong("price_minor"),bn),style=EkmivoType.shop,color=ink)
  }
  "unsupported"->Text(if(bn)"এই ধরনের মেসেজ এখানে দেখানো যায় না।" else "This message type cannot be displayed here.",style=EkmivoType.chatMessage.copy(fontStyle=androidx.compose.ui.text.font.FontStyle.Italic),color=ink.copy(alpha=.65f))
  else->Text(m.optString("body"),style=EkmivoType.chatMessage,color=ink)
 }
 val reaction=m.optString("reaction").takeUnless{it.isBlank()||it=="null"};if(reaction!=null)Text(reaction,style=EkmivoType.shop)
 if(error)Text(if(bn)"মিডিয়া খোলা যায়নি। আবার চেষ্টা করুন।" else "Unable to open media. Try again.",style=EkmivoType.meta,color=p.danger)
 viewer?.let{MediaViewer(it,viewerIndex,{viewerIndex=it},{viewer=null})}
}

private object ActiveVoice {var player:MediaPlayer?=null}
@Composable private fun VoiceMessage(thread:String,c:JSONObject,bn:Boolean,ink:Color){
 val api=rememberInboxApi();val app=LocalContext.current;val owner=androidx.lifecycle.compose.LocalLifecycleOwner.current;val view=LocalView.current;val scope=rememberCoroutineScope();var player by remember{mutableStateOf<MediaPlayer?>(null)};var playing by remember{mutableStateOf(false)};var progress by remember{mutableFloatStateOf(0f)};var elapsed by remember{mutableIntStateOf(0)};var measuredDuration by remember{mutableIntStateOf(0)};var error by remember{mutableStateOf(false)}
 DisposableEffect(owner){val observer=androidx.lifecycle.LifecycleEventObserver{_,event->if(event==androidx.lifecycle.Lifecycle.Event.ON_STOP)runCatching{player?.pause()}};owner.lifecycle.addObserver(observer);onDispose{owner.lifecycle.removeObserver(observer);if(ActiveVoice.player===player)ActiveVoice.player=null;player?.release()}}
 LaunchedEffect(player){while(isActive){val v=player;playing=runCatching{v?.isPlaying==true}.getOrDefault(false);if(v!=null){measuredDuration=runCatching{v.duration/1000}.getOrDefault(0);elapsed=runCatching{v.currentPosition/1000}.getOrDefault(0);progress=runCatching{v.currentPosition.toFloat()/v.duration.coerceAtLeast(1)}.getOrDefault(0f)};delay(90)}}
 Row(Modifier.width(210.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)){
  Box(Modifier.size(32.dp).clickable{scope.launch{try{if(player?.isPlaying==true)player?.pause()else{ActiveVoice.player?.takeUnless{it===player}?.pause();if(player==null){val f=fetchMedia(app,thread,c.getString("media_id"),api);player=MediaPlayer().apply{setDataSource(f.absolutePath);prepare()}};ActiveVoice.player=player;player?.start()}}catch(_:Exception){error=true}}},contentAlignment=Alignment.Center){EkmivoReferenceIcon(if(playing)EkmivoGlyph.PAUSE else EkmivoGlyph.PLAY,tint=ink)}
  Row(Modifier.weight(1f).height(28.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(2.dp)){repeat(26){i->val bar=(5+((i*17+i*i*7)%20)).dp;Box(Modifier.weight(1f).height(bar).background(ink.copy(alpha=if(i/26f<=progress)1f else .28f),RoundedCornerShape(2.dp)))}}
  Text(if(playing)displayDigits("${elapsed}s",bn)else if(measuredDuration>0)displayDigits("${measuredDuration}s",bn)else if(c.optInt("duration_ms")>0)displayDigits("${c.optInt("duration_ms")/1000}s",bn)else "—",style=EkmivoType.meta,color=ink)
 }
 if(error)Text(if(bn)"ভয়েস চালানো যায়নি" else "Unable to play audio",style=EkmivoType.meta,color=ink)
}

@Composable internal fun MediaViewer(images:List<String>,index:Int,onIndex:(Int)->Unit,onClose:()->Unit){
 var scale by remember(index){mutableFloatStateOf(1f)};var x by remember(index){mutableFloatStateOf(0f)};var y by remember(index){mutableFloatStateOf(0f)};var drag by remember{mutableFloatStateOf(0f)}
 Dialog(onDismissRequest=onClose,properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)){
  Box(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()){
   Box(Modifier.fillMaxSize().pointerInput(index){detectTransformGestures{_,pan,zoom,_->scale=(scale*zoom).coerceIn(1f,5f);if(scale>1f){x+=pan.x;y+=pan.y}else{x=0f;y=0f;drag+=pan.x;if(drag>50&&index>0){drag=0f;onIndex(index-1)}else if(drag< -50&&index<images.lastIndex){drag=0f;onIndex(index+1)}}}},contentAlignment=Alignment.Center){MediaImage(images[index],Modifier.fillMaxWidth().graphicsLayer{scaleX=scale;scaleY=scale;translationX=x;translationY=y},ContentScale.Fit)}
   Row(Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){IconButton(onClick=onClose){EkmivoReferenceIcon(EkmivoGlyph.X,tint=Color.White)};Text("${index+1}/${images.size}",color=Color.White)}
   if(index>0)IconButton(onClick={onIndex(index-1)},modifier=Modifier.align(Alignment.CenterStart).size(40.dp)){EkmivoReferenceIcon(EkmivoGlyph.ARR,tint=Color.White)}
   if(index<images.lastIndex)IconButton(onClick={onIndex(index+1)},modifier=Modifier.align(Alignment.CenterEnd).size(40.dp)){EkmivoReferenceIcon(EkmivoGlyph.SND,tint=Color.White)}
  }
 }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun InboxAttachments(
 thread:String,bn:Boolean,capabilities:JSONObject,enabled:Boolean,
 hasText:Boolean,replyTo:String?=null,
 onRecordingChange:(Boolean)->Unit={},
 onSendText:()->Unit,
 onVoicePrepared:(File,Long,String?)->Unit,
 inputField:@Composable RowScope.()->Unit,
 onSent:()->Unit
){
 val api=rememberInboxApi();val app=LocalContext.current;val p=LocalEkmivoPalette.current;val scope=rememberCoroutineScope();val owner=androidx.lifecycle.compose.LocalLifecycleOwner.current
 var sheet by remember{mutableStateOf(false)};var selection by rememberSaveable(thread){mutableStateOf(arrayListOf<String>())};var active by rememberSaveable{mutableIntStateOf(0)}
 var batch by rememberSaveable(thread){mutableStateOf(UUID.randomUUID().toString())};var cameraPath by rememberSaveable{mutableStateOf("")}
 var busy by remember{mutableStateOf(false)};var error by remember{mutableStateOf(false)};var products by remember{mutableStateOf<List<JSONObject>?>(null)}
 var recorder by remember{mutableStateOf<MediaRecorder?>(null)};var recordFile by remember{mutableStateOf<File?>(null)};var recordStart by remember{mutableLongStateOf(0L)};var duration by remember{mutableLongStateOf(0L)};var samples by remember{mutableStateOf<List<Float>>(emptyList())}
 var locked by remember{mutableStateOf(false)};var paused by remember{mutableStateOf(false)};var pauseAt by remember{mutableLongStateOf(0L)};var pauseSum by remember{mutableLongStateOf(0L)};var swipeX by remember{mutableFloatStateOf(0f)};var swipeY by remember{mutableFloatStateOf(0f)}
 fun toast(text:String){Toast.makeText(app,text,Toast.LENGTH_SHORT).show()}
 fun discard(){runCatching{recorder?.stop()};recorder?.release();recorder=null;recordFile?.delete();recordFile=null;samples=emptyList();locked=false;paused=false;pauseAt=0L;pauseSum=0L}
 fun begin(){try{val file=File(app.cacheDir,"inbox/record-${UUID.randomUUID()}.m4a").apply{parentFile?.mkdirs()};val r=if(android.os.Build.VERSION.SDK_INT>=31)MediaRecorder(app)else @Suppress("DEPRECATION") MediaRecorder();r.setAudioSource(MediaRecorder.AudioSource.MIC);r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);r.setAudioSamplingRate(44100);r.setOutputFile(file.absolutePath);r.setMaxDuration(60000);r.prepare();r.start();recordStart=System.currentTimeMillis();recordFile=file;recorder=r;duration=0;samples=emptyList();paused=false;pauseSum=0L;locked=false}catch(_:Exception){discard();error=true}}
 val mic=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){
  toast(if(it)(if(bn)"রেকর্ড করতে মাইক চেপে ধরে রাখুন" else "Hold the microphone to record")
   else(if(bn)"মাইক্রোফোনের অনুমতি প্রয়োজন" else "Microphone permission is required"))
 }
 DisposableEffect(owner){val obs=androidx.lifecycle.LifecycleEventObserver{_,event->if(event==androidx.lifecycle.Lifecycle.Event.ON_STOP)discard()};owner.lifecycle.addObserver(obs);onDispose{owner.lifecycle.removeObserver(obs);discard();onRecordingChange(false)}}
 LaunchedEffect(enabled){if(!enabled){sheet=false;products=null;discard()}}
 LaunchedEffect(recorder){onRecordingChange(recorder!=null);while(recorder!=null){
  val now=System.currentTimeMillis()
  duration=(now-recordStart-pauseSum-(if(paused)now-pauseAt else 0L)).coerceAtLeast(0)
  if(!paused)samples=(samples+runCatching{recorder!!.maxAmplitude/32767f}.getOrDefault(0f)).takeLast(40)
  if(duration>=59000){discard();toast(if(bn)"ভয়েস সর্বোচ্চ ১ মিনিট" else "Voice limit is one minute")}
  delay(90)
 }}
 fun add(uris:List<Uri>){val combined=(selection+uris.map{it.toString()}).distinct();if(combined.size>10)toast(if(bn)"একসাথে সর্বোচ্চ ১০টি ছবি পাঠানো যাবে" else "You can send at most 10 images at once");selection=ArrayList(combined.take(10));sheet=false;active=active.coerceAtMost((selection.size-1).coerceAtLeast(0))}
 val gallery=rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()){uris->uris.forEach{runCatching{app.contentResolver.takePersistableUriPermission(it,Intent.FLAG_GRANT_READ_URI_PERMISSION)}};add(uris)}
 val document=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){it?.let{u->runCatching{app.contentResolver.takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION)};add(listOf(u))}}
 val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)add(listOf(Uri.fromFile(File(cameraPath))))else File(cameraPath).delete()}
 suspend fun sendFiles(uris:List<String>){
  val savedBatch=batch
  for((index,raw) in uris.withIndex()) {
   val uri=Uri.parse(raw);val bytes=withContext(Dispatchers.IO){app.contentResolver.openInputStream(uri)?.use{input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var total=0;while(true){val n=input.read(buffer);if(n<0)break;total+=n;check(total<=5242880);out.write(buffer,0,n)};out.toByteArray()}?:error("FILE_UNAVAILABLE")};check(bytes.size in 1..5242880)
   val mediaID=UUID.nameUUIDFromBytes("$thread|$savedBatch|$raw".toByteArray()).toString();val key=UUID.nameUUIDFromBytes("send|$mediaID".toByteArray()).toString()
   var name=uri.lastPathSegment?:"attachment";app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())name=it.getString(0)}
   val mime=app.contentResolver.getType(uri)?:if(name.endsWith(".pdf",true))"application/pdf"else "image/jpeg"
   api.call("media-upload",thread,body=JSONObject().put("media_id",mediaID).put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("mime",mime).put("name",name))
   api.call("send-media",thread,body=JSONObject().put("media_id",mediaID).put("idempotency_key",key).put("batch_id",savedBatch).apply{if(replyTo!=null)put("reply_to",replyTo)})
  }
  selection=arrayListOf();batch=UUID.randomUUID().toString();onSent()
 }
 fun durationNow():Long{
  val now=System.currentTimeMillis()
  return (now-recordStart-pauseSum-(if(paused)now-pauseAt else 0L)).coerceAtLeast(0L)
 }
 fun vibrate(){runCatching{val v=app.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
  v.vibrate(android.os.VibrationEffect.createOneShot(12,android.os.VibrationEffect.DEFAULT_AMPLITUDE))}}
 fun finishVoice(send:Boolean){
  val file=recordFile
  val elapsed=durationNow()
  if(!send){discard();return}
  val stopped=runCatching{if(paused)recorder?.resume();recorder?.stop()}.isSuccess
  recorder?.release();recorder=null;recordFile=null;paused=false;locked=false;samples=emptyList()
  if(!stopped||file==null){file?.delete();toast(if(bn)"রেকর্ডিং সংরক্ষণ করা যায়নি" else "Recording could not be saved");return}
  if(elapsed<1000L){file.delete();toast(if(bn)"রেকর্ড করতে চেপে ধরে রাখুন, ছাড়লে পাঠানো হবে"
   else "Hold to record, release to send");return}
  onVoicePrepared(file,elapsed,replyTo)
 }
 val isHolding=recorder!=null&&!locked
 val micScale by animateFloatAsState(if(isHolding)1.65f else 1f,animationSpec=tween(150),label="voice-mic-scale")
 Column(
  Modifier.fillMaxWidth().navigationBarsPadding().imePadding()
   .topHairline(p.border).background(p.canvas)
   .padding(start=12.dp,end=12.dp,top=8.dp,bottom=14.dp),
  verticalArrangement=Arrangement.spacedBy(12.dp)
 ){
  if(recorder!=null&&locked){
   Row(Modifier.fillMaxWidth().height(26.dp),verticalAlignment=Alignment.CenterVertically,
    horizontalArrangement=Arrangement.spacedBy(12.dp)){
    Text(displayDigits("%d:%02d".format(duration/60000,(duration/1000)%60),bn),
     style=EkmivoType.shop,color=p.text)
    Row(Modifier.weight(1f).height(26.dp),verticalAlignment=Alignment.CenterVertically,
     horizontalArrangement=Arrangement.End){
     samples.takeLast(40).forEach{amp->
      Box(Modifier.padding(start=2.dp).width(2.5.dp).height((3+20*amp).dp)
       .clip(RoundedCornerShape(2.dp)).background(p.text.copy(alpha=.55f)))
     }
    }
   }
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
    horizontalArrangement=Arrangement.spacedBy(8.dp)){
    Box(Modifier.size(40.dp).clip(CircleShape).background(p.dangerBackground).clickable{discard()},
     contentAlignment=Alignment.Center){
     EkmivoReferenceIcon(EkmivoGlyph.TRASH,tint=p.danger,size=20.dp,
      description=if(bn)"বাতিল" else "Discard")
    }
    Row(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp))
     .background(if(paused)p.successBackground else p.raised)
     .clickable{
      if(paused){runCatching{recorder?.resume()}.onSuccess{pauseSum+=System.currentTimeMillis()-pauseAt;paused=false}}
      else{runCatching{recorder?.pause()}.onSuccess{pauseAt=System.currentTimeMillis();paused=true}}
     },verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.Center){
     EkmivoReferenceIcon(if(paused)EkmivoGlyph.MIC else EkmivoGlyph.PAUSE,
      tint=if(paused)p.success else p.text,size=20.dp)
     Spacer(Modifier.width(8.dp))
     Text(if(paused)(if(bn)"চালিয়ে যান" else "Resume")else(if(bn)"পজ" else "Pause"),
      style=EkmivoType.shop,color=if(paused)p.success else p.text)
    }
    Box(Modifier.size(40.dp).clip(CircleShape).background(p.text).clickable{finishVoice(true)},
     contentAlignment=Alignment.Center){
     EkmivoReferenceIcon(EkmivoGlyph.SND,tint=p.onPrimary,size=20.dp,
      description=if(bn)"ভয়েস পাঠান" else "Send voice")
    }
   }
  }else{
   Box(Modifier.fillMaxWidth()){
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Bottom,
     horizontalArrangement=Arrangement.spacedBy(8.dp)){
     if(isHolding){
      Row(Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp))
       .background(p.surface).border(1.dp,p.border,RoundedCornerShape(20.dp))
       .padding(start=12.dp,end=10.dp),verticalAlignment=Alignment.CenterVertically,
       horizontalArrangement=Arrangement.spacedBy(8.dp)){
       EkmivoReferenceIcon(EkmivoGlyph.MIC,tint=p.danger,size=18.dp)
       Text(displayDigits("%d:%02d".format(duration/60000,(duration/1000)%60),bn),
        style=EkmivoType.shop,color=p.text)
       Spacer(Modifier.weight(1f))
       Text(if(bn)"‹ বাতিল করতে স্লাইড করুন" else "‹ Slide to cancel",
        style=EkmivoType.meta,color=p.secondary,maxLines=1)
      }
     }else{
      Row(Modifier.weight(1f).heightIn(min=40.dp,max=104.dp)
       .clip(RoundedCornerShape(20.dp)).background(p.surface)
       .border(1.dp,p.border,RoundedCornerShape(20.dp))
       .padding(start=8.dp,end=4.dp),
       verticalAlignment=Alignment.Bottom){
       inputField()
       Box(Modifier.width(32.dp).height(38.dp).clickable(enabled=enabled&&!busy){sheet=true},
        contentAlignment=Alignment.Center){
        EkmivoReferenceIcon(EkmivoGlyph.CLIP,tint=p.secondary,size=20.dp,
         description=if(bn)"সংযুক্ত করুন" else "Attachments")
       }
       if(!hasText)Box(Modifier.width(32.dp).height(38.dp)
        .clickable(enabled=enabled&&!busy){
         val file=File(app.cacheDir,"inbox/camera-${UUID.randomUUID()}.jpg").apply{parentFile?.mkdirs()}
         cameraPath=file.absolutePath
         camera.launch(FileProvider.getUriForFile(app,app.packageName+".updates",file))
        },contentAlignment=Alignment.Center){
        EkmivoReferenceIcon(EkmivoGlyph.CAM,tint=p.secondary,size=20.dp,
         description=if(bn)"ক্যামেরা" else "Camera")
       }
      }
     }
     if(hasText&&!isHolding){
      Box(Modifier.size(40.dp).clip(CircleShape).background(p.text)
       .clickable(enabled=enabled&&!busy){onSendText()},contentAlignment=Alignment.Center){
       EkmivoReferenceIcon(EkmivoGlyph.SND,tint=p.onPrimary,size=20.dp,
        description=if(bn)"মেসেজ পাঠান" else "Send message")
      }
     }else{
      Box(Modifier.size(40.dp).graphicsLayer{scaleX=micScale;scaleY=micScale}
       .clip(CircleShape).background(p.text)
       .semantics{contentDescription=if(bn)"রেকর্ড করতে মাইক চেপে ধরে রাখুন" else "Hold to record voice"}
       .pointerInput(enabled,busy){
        awaitEachGesture{
         val down=awaitFirstDown(requireUnconsumed=false)
         if(!enabled||busy){
          while(true){val ev=awaitPointerEvent();if(ev.changes.none{it.id==down.id&&it.pressed})break}
          return@awaitEachGesture
         }
         if(ContextCompat.checkSelfPermission(app,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
          mic.launch(Manifest.permission.RECORD_AUDIO)
          while(true){val ev=awaitPointerEvent();if(ev.changes.none{it.id==down.id&&it.pressed})break}
          return@awaitEachGesture
         }
         begin()
         if(recorder==null)return@awaitEachGesture
         vibrate()
         down.consume()
         val origin=down.position
         var canceled=false
         while(true){
          val ev=awaitPointerEvent()
          val change=ev.changes.firstOrNull{it.id==down.id}
          if(change==null){if(!locked)discard();break}
          val dx=change.position.x-origin.x
          val dy=change.position.y-origin.y
          if(!locked&&dx<=-96.dp.toPx()){canceled=true;discard();break}
          if(!locked&&dy<=-72.dp.toPx()){locked=true;vibrate()}
          if(!change.pressed){
           if(recorder!=null&&!locked&&!canceled)finishVoice(true)
           break
          }
          change.consume()
         }
        }
       },contentAlignment=Alignment.Center){
       EkmivoReferenceIcon(EkmivoGlyph.MIC,tint=p.onPrimary,size=20.dp,
        description=if(bn)"ভয়েস রেকর্ড করুন" else "Record voice")
      }
     }
    }
    if(isHolding)Column(
     Modifier.align(Alignment.BottomEnd).offset(x=0.dp,y=(-62).dp)
      .size(width=40.dp,height=68.dp).clip(RoundedCornerShape(20.dp))
      .background(p.raised).border(1.dp,p.border,RoundedCornerShape(20.dp)),
     horizontalAlignment=Alignment.CenterHorizontally,
     verticalArrangement=Arrangement.SpaceEvenly){
     EkmivoReferenceIcon(EkmivoGlyph.LOCK_OPEN,tint=p.text,size=18.dp)
     EkmivoReferenceIcon(EkmivoGlyph.CHEVRON_UP,tint=p.text,size=18.dp)
    }
   }
  }
 }

 if(sheet)ModalBottomSheet(onDismissRequest={sheet=false},containerColor=p.raised,tonalElevation=0.dp){Row(Modifier.fillMaxWidth().padding(18.dp),horizontalArrangement=Arrangement.SpaceEvenly){
  AttachmentChoice(EkmivoGlyph.IMG,if(bn)"গ্যালারি" else "Gallery"){gallery.launch(arrayOf("image/jpeg","image/png"))}
  AttachmentChoice(EkmivoGlyph.CAM,if(bn)"ক্যামেরা" else "Camera"){val file=File(app.cacheDir,"inbox/camera-${UUID.randomUUID()}.jpg").apply{parentFile?.mkdirs()};cameraPath=file.absolutePath;sheet=false;camera.launch(FileProvider.getUriForFile(app,app.packageName+".updates",file))}
  if(capabilities.optBoolean("document"))AttachmentChoice(EkmivoGlyph.DOC,if(bn)"ডকুমেন্ট" else "Document"){sheet=false;document.launch(arrayOf("application/pdf","text/plain"))}
  AttachmentChoice(EkmivoGlyph.BAG,if(bn)"পণ্য" else "Products"){sheet=false;scope.launch{try{val a=api.call("products",thread).getJSONArray("items");products=(0 until a.length()).map{a.getJSONObject(it)}}catch(_:Exception){error=true}}}
 }}
 if(selection.isNotEmpty())Dialog(onDismissRequest={if(!busy)selection=arrayListOf()},properties=DialogProperties(usePlatformDefaultWidth=false,decorFitsSystemWindows=false)){
  Column(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){IconButton(onClick={if(!busy)selection=arrayListOf()}){EkmivoReferenceIcon(EkmivoGlyph.X,tint=Color.White)};Text("${active+1}/${selection.size}",color=Color.White);Spacer(Modifier.weight(1f));IconButton(onClick={if(!busy){selection=ArrayList(selection.filterIndexed{i,_->i!=active});active=active.coerceAtMost((selection.size-1).coerceAtLeast(0))}}){EkmivoReferenceIcon(EkmivoGlyph.TRASH,tint=Color.White)}}
   val current=selection.getOrNull(active);if(current!=null)Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){if(app.contentResolver.getType(Uri.parse(current))?.startsWith("image/")==false||current.contains(".pdf",true))EkmivoReferenceIcon(EkmivoGlyph.DOC,tint=Color.White,size=52.dp)else MediaImage(current,Modifier.fillMaxWidth(),ContentScale.Fit)}
   Row(Modifier.horizontalScroll(rememberScrollState()).padding(12.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)){selection.forEachIndexed{i,uri->Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).border(if(i==active)2.dp else 0.dp,Color.White,RoundedCornerShape(10.dp)).clickable{active=i}){MediaImage(uri,Modifier.fillMaxSize())}};if(selection.size<10)IconButton(onClick={gallery.launch(arrayOf("image/jpeg","image/png"))}){EkmivoReferenceIcon(EkmivoGlyph.CLIP,tint=Color.White)}}
   if(error)Text(if(bn)"পাঠানো যায়নি। আবার চেষ্টা করুন।" else "Unable to send. Try again.",color=Color.White)
   EkmivoPrimaryButton(if(busy)(if(bn)"পাঠানো হচ্ছে…" else "Sending…")else displayDigits(if(bn)"${selection.size}টি পাঠান" else "Send ${selection.size}",bn),enabled=!busy&&enabled,onClick={val chosen=selection.toList();scope.launch{busy=true;try{sendFiles(chosen);error=false}catch(_:Exception){error=true}finally{busy=false}}},modifier=Modifier.padding(12.dp))
  }
 }
 products?.let{items->ModalBottomSheet(onDismissRequest={products=null},containerColor=p.raised){Column(Modifier.fillMaxWidth().heightIn(max=420.dp).verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text(if(bn)"পণ্য বাছাই" else "Choose a product",style=EkmivoType.button,color=p.text);if(items.isEmpty())Text(if(bn)"কোনো পণ্য যোগ করা হয়নি" else "No products added",color=p.secondary);items.forEach{product->Row(Modifier.fillMaxWidth().clickable(enabled=!busy&&enabled){scope.launch{busy=true;try{api.call("send-product",thread,body=JSONObject().put("product_id",product.getString("id")).put("idempotency_key",UUID.nameUUIDFromBytes("$batch|${product.getString("id")}".toByteArray()).toString()).apply{if(replyTo!=null)put("reply_to",replyTo)});batch=UUID.randomUUID().toString();products=null;onSent()}catch(_:Exception){error=true}finally{busy=false}}}.padding(10.dp)){Text(product.optString("name"),modifier=Modifier.weight(1f),color=p.text);Text(money(product.optLong("price_minor"),bn),color=p.text)}}}}}
}
@Composable private fun AttachmentChoice(glyph:EkmivoGlyph,label:String,onClick:()->Unit){val p=LocalEkmivoPalette.current;Column(horizontalAlignment=Alignment.CenterHorizontally,modifier=Modifier.clickable(onClick=onClick)){Box(Modifier.size(52.dp).clip(CircleShape).background(p.surface),contentAlignment=Alignment.Center){EkmivoReferenceIcon(glyph)};Spacer(Modifier.height(6.dp));Text(label,style=EkmivoType.meta,color=p.secondary)}}
