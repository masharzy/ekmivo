package com.ekmivo.mobile.receipt

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import org.json.JSONObject
import android.util.Base64
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

private fun scannedPairingCode(raw:String):String {
 val value=raw.trim()
 val code=if(value.startsWith("ekmivo://pair?"))Uri.parse(value).getQueryParameter("token")?:"" else value
 return if(code.matches(Regex("[A-Za-z0-9_-]{24,160}")))code else ""
}

@Composable
fun ForwarderScreen(bn:Boolean){
 val uiContext=LocalContext.current
 val context=uiContext.applicationContext
 val lifecycleOwner=LocalLifecycleOwner.current
 val scope=rememberCoroutineScope()
 var phone by remember{mutableStateOf(ReceiptStore(context).use{it.phone()?:it.enrollment()})}
 var consent by remember{mutableStateOf(false)}
 var code by remember{mutableStateOf("")}
 var busy by remember{mutableStateOf(false)}
 var message by remember{mutableStateOf("")}
 var permissionGranted by remember{mutableStateOf(ContextCompat.checkSelfPermission(context,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED)}
 var serverCheck by remember{mutableStateOf("checking")}
 var recentReceipts by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var pendingCount by remember{mutableIntStateOf(0)}
 var syncError by remember{mutableStateOf("")}
 LaunchedEffect(phone?.optString("id")){
  while(true){
   val snapshot=withContext(Dispatchers.IO){
    ReceiptStore(context).use{Triple(it.recent(24),it.count(),it.queueError())}
   }
   recentReceipts=snapshot.first
   pendingCount=snapshot.second
   syncError=snapshot.third
   delay(4000)
  }
 }
 fun recoverMissed(){
  busy=true
  scope.launch{
   try {
    val recovered=withContext(Dispatchers.IO){ReceiptInboxRecovery.recover(context)}
    message=if(bn)"$recovered টি আগের SMS queue-তে যোগ হয়েছে।"
      else "$recovered earlier SMS added to the forwarding queue."
    ReceiptSyncWorker.schedule(context)
   }catch(_:SecurityException){
    message=if(bn)"SMS history পড়ার অনুমতি নেই।" else "SMS history permission unavailable."
   }catch(_:Exception){
    message=if(bn)"আগের SMS উদ্ধার করা যায়নি।" else "Could not recover earlier SMS."
   }finally{busy=false}
  }
 }
 val readOldSms=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  if(granted)recoverMissed()
  else message=if(bn)"পুরোনো SMS উদ্ধার করতে ঐচ্ছিক READ_SMS অনুমতি প্রয়োজন।"
    else "Optional READ_SMS permission is needed to recover missed messages."
 }
 val allow=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  permissionGranted=granted
  if(granted){ReceiptSyncWorker.schedule(context);message=""}
 }
 fun updateLocal(){
  phone=ReceiptStore(context).use{it.phone()?:it.enrollment()}
  permissionGranted=ContextCompat.checkSelfPermission(context,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED
 }
 DisposableEffect(lifecycleOwner){
  val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME){updateLocal();if(phone!=null)ReceiptSyncWorker.schedule(context)}}
  lifecycleOwner.lifecycle.addObserver(observer)
  onDispose{lifecycleOwner.lifecycle.removeObserver(observer)}
 }
 LaunchedEffect(phone?.optString("id")){
  val active=phone?:return@LaunchedEffect
  serverCheck="checking"
  val response=withContext(Dispatchers.IO){runCatching{
   val payload=JSONObject().put("enrollment_id",active.getString("id"))
    .put("environment",active.getString("environment")).toString().toByteArray()
   ReceiptTransport.post("configuration",active.getString("id"),UUID.randomUUID().toString(),payload)
  }.getOrNull()}
  if(response?.first==200){
   ReceiptStore(context).use{it.savePhoneConfiguration(JSONObject(response.second))}
   serverCheck="connected"
   ReceiptSyncWorker.schedule(context)
  }else serverCheck=if(response?.first==403)"revoked" else "offline"
 }
 Column(
  Modifier.fillMaxSize().verticalScroll(rememberScrollState())
   .padding(start=24.dp,end=24.dp,top=27.dp,bottom=25.dp),
  verticalArrangement=Arrangement.spacedBy(15.dp)){
  Text("SMS Forwarder",style=MaterialTheme.typography.headlineMedium)
  if(phone!=null){
   Surface(
    shape=RoundedCornerShape(26.dp),color=MaterialTheme.colorScheme.surface,
    border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
    Column(
     Modifier.fillMaxWidth().padding(vertical=36.dp,horizontal=24.dp),
     verticalArrangement=Arrangement.spacedBy(13.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Surface(shape=CircleShape,color=if(serverCheck=="revoked") MaterialTheme.colorScheme.error.copy(alpha=.12f)
      else Color(0xFF289667).copy(alpha=.12f)){
      Icon(if(serverCheck=="revoked")Icons.Outlined.WarningAmber else Icons.Outlined.CheckCircleOutline,
       contentDescription=null,modifier=Modifier.padding(19.dp).size(43.dp),
       tint=if(serverCheck=="revoked")MaterialTheme.colorScheme.error else Color(0xFF289667))
     }
     Text(
      when(serverCheck){
       "revoked"->if(bn)"সংযোগ বাতিল হয়েছে" else "Disconnected"
       "offline"->if(bn)"সার্ভার পাওয়া যাচ্ছে না" else "Connection unavailable"
       "checking"->if(bn)"সংযোগ যাচাই হচ্ছে" else "Checking connection"
       else->if(bn)"সংযুক্ত" else "Connected"
      },style=MaterialTheme.typography.headlineMedium,textAlign=TextAlign.Center)
     if(serverCheck=="connected"){
      Text(if(bn)"ফোনটি সফলভাবে যুক্ত আছে" else "Your phone is paired",
       color=MaterialTheme.colorScheme.onSurfaceVariant,textAlign=TextAlign.Center)
     }
     Text(phone!!.optString("environment").uppercase(),style=MaterialTheme.typography.labelMedium,
      color=MaterialTheme.colorScheme.onSurfaceVariant)
    }
   }
   if(!permissionGranted&&serverCheck!="revoked"){
    Button(onClick={allow.launch(Manifest.permission.RECEIVE_SMS)},modifier=Modifier.fillMaxWidth()){
     Text(if(bn)"SMS অনুমতি দিন" else "Allow SMS access")
    }
   }
   Surface(shape=RoundedCornerShape(16.dp),color=MaterialTheme.colorScheme.surface,
    border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
    Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
      horizontalArrangement=Arrangement.SpaceBetween){
      Column {
       Text(if(bn)"SMS সংগ্রহ ও সিঙ্ক" else "SMS collection & sync",
        style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
       Text(if(bn)"পাঠানোর অপেক্ষায়: $pendingCount" else "$pendingCount waiting to forward",
        color=MaterialTheme.colorScheme.onSurfaceVariant,style=MaterialTheme.typography.bodySmall)
      }
      OutlinedButton(enabled=serverCheck!="revoked",onClick={
       ReceiptSyncWorker.schedule(context)
       message=if(bn)"নেটওয়ার্ক থাকলে পুনরায় পাঠানো হবে" else "Retry scheduled for when connected"
      }){Text(if(bn)"আবার পাঠান" else "Retry sync")}
     }
     OutlinedButton(enabled=!busy&&serverCheck!="revoked",modifier=Modifier.fillMaxWidth(),onClick={
      if(ContextCompat.checkSelfPermission(context,Manifest.permission.READ_SMS)==PackageManager.PERMISSION_GRANTED)recoverMissed()
      else readOldSms.launch(Manifest.permission.READ_SMS)
     }) {
      Text(if(bn)"বন্ধ থাকার সময়ের SMS উদ্ধার করুন" else "Recover missed SMS from inbox")
     }
     Text(if(bn)"এটি ঐচ্ছিক; permission দিলে শুধু গত ৭২ ঘণ্টার প্রাসঙ্গিক payment SMS উদ্ধার করার চেষ্টা হবে। ফোন সম্পূর্ণ বন্ধ থাকলে তখনই SMS পড়া সম্ভব নয়।"
       else "Optional: with your permission, check up to 72 hours of recent provider receipts. Android cannot capture messages while the phone is powered off.",
       style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
     if(syncError.isNotEmpty())
      Text(if(bn)"শেষ সিঙ্কে সমস্যা: $syncError" else "Sync attention: $syncError",
       color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
     if(!permissionGranted)
      Text(if(bn)"SMS permission বন্ধ আছে; নতুন SMS সংগ্রহ হবে না।"
       else "SMS permission is off; new receipts cannot be collected.",
       color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
     Text(if(bn)"ইন্টারনেট বন্ধ থাকলেও ইতিমধ্যে সংগ্রহ করা SMS encrypted queue-তে থাকে। নেট ফিরে এলে নিজে থেকে পাঠাবে।"
      else "Captured payment SMS are saved in an encrypted queue when offline and retried when connectivity returns.",
      style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
    }
   }
   Text(if(bn)"সাম্প্রতিক পেমেন্ট SMS" else "Recent payment SMS",style=MaterialTheme.typography.titleLarge)
   if(recentReceipts.isEmpty()) {
    Text(if(bn)"এখনো কোনো পেমেন্ট SMS সংগ্রহ করা হয়নি।" else "No payment SMS captured yet.",
     color=MaterialTheme.colorScheme.onSurfaceVariant)
   }else{
    recentReceipts.filter{
     it.optString("source").lowercase() in setOf("bkash","nagad","rocket")
    }.forEach { receipt->
     val preview=receiptDisplay(receipt.optString("evidence"))
     val sent=receipt.optBoolean("sent")
     Surface(shape=RoundedCornerShape(14.dp),color=MaterialTheme.colorScheme.surface,
      border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
      Column(Modifier.fillMaxWidth().padding(15.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
       Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.SpaceBetween){
        Text(receipt.optString("source"),fontWeight=FontWeight.SemiBold)
        Text(if(sent)(if(bn)"ফরওয়ার্ড হয়েছে" else "Forwarded")
          else (if(bn)"পাঠানোর অপেক্ষায়" else "Waiting to send"),
          color=if(sent)Color(0xFF289667) else MaterialTheme.colorScheme.error,
          style=MaterialTheme.typography.labelMedium)
       }
       Text(preview.first,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)
       Text((if(bn)"প্রেরক: " else "Sender: ")+preview.second,
        style=MaterialTheme.typography.bodyMedium)
       Text((if(bn)"সময়: " else "Time: ")+preview.third,
        style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
       Text(if(sent)(if(bn)"সার্ভারে গ্রহণ করা হয়েছে; payment verification আলাদা।"
          else "Server accepted this SMS; payment verification is separate.")
        else (if(bn)"নেটওয়ার্ক ফিরলে স্বয়ংক্রিয়ভাবে retry হবে।"
          else "Automatically retries when the network returns."),
        style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
      }
     }
    }
   }
   if(serverCheck=="revoked"){
    Text(if(bn)"সার্ভার থেকে সংযোগ সরানো হয়েছে। অন্য কোড দিয়ে যুক্ত করতে হলে পুরোনো queue খালি থাকতে হবে।"
       else "This phone was revoked on the server. Resolve queued receipts before pairing again.",
       color=MaterialTheme.colorScheme.error)
    OutlinedButton(onClick={
     val removed=ReceiptStore(context).use{it.disconnect()}
     if(removed){updateLocal();serverCheck="checking"}else message=if(bn)"অপেক্ষমাণ রসিদ আছে" else "Queued receipts must be resolved"
    },modifier=Modifier.fillMaxWidth()){Text(if(bn)"ফোন থেকে সংযোগ সরান" else "Remove local connection")}
   }
  }else{
   Surface(
    color=MaterialTheme.colorScheme.surface,shape=RoundedCornerShape(26.dp),
    border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
    Column(Modifier.fillMaxWidth().padding(23.dp),
     verticalArrangement=Arrangement.spacedBy(17.dp),horizontalAlignment=Alignment.CenterHorizontally){
     Surface(shape=CircleShape,color=MaterialTheme.colorScheme.surfaceVariant){
      Icon(Icons.Outlined.Smartphone,contentDescription=null,modifier=Modifier.padding(16.dp).size(37.dp))
     }
     Text(if(bn)"ফোন যুক্ত করুন" else "Connect your phone",style=MaterialTheme.typography.titleLarge)
     Text(if(bn)"ওয়েবসাইটের একবারের কোড দিন অথবা QR স্ক্যান করুন।"
        else "Enter the one-time code from the website or scan its QR code.",
      color=MaterialTheme.colorScheme.onSurfaceVariant,textAlign=TextAlign.Center)
     OutlinedTextField(value=code,onValueChange={code=it.trim().take(180)},
      label={Text(if(bn)"পেয়ারিং কোড" else "Pairing code")},singleLine=true,modifier=Modifier.fillMaxWidth(),
      enabled=!busy)
     OutlinedButton(
      onClick={
       val options=GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build()
       GmsBarcodeScanning.getClient(uiContext,options).startScan()
        .addOnSuccessListener{barcode->
         val parsed=scannedPairingCode(barcode.rawValue?:"")
         if(parsed.isNotEmpty()){code=parsed;message=""}
         else message=if(bn)"QR কোডটি সঠিক নয়" else "Invalid pairing QR"
        }
        .addOnFailureListener{message=if(bn)"QR স্ক্যান করা যায়নি; কোড লিখুন" else "Scanner unavailable; enter the code"}
      },enabled=!busy,modifier=Modifier.fillMaxWidth()){
      Icon(Icons.Outlined.QrCodeScanner,null,Modifier.size(20.dp))
      Spacer(Modifier.width(8.dp))
      Text(if(bn)"QR কোড স্ক্যান" else "Scan QR code")
     }
     Row(verticalAlignment=Alignment.CenterVertically){
      Checkbox(checked=consent,onCheckedChange={consent=it},enabled=!busy)
      Text(if(bn)"এই ফোনে payment SMS forward করতে সম্মত"
          else "I consent to forwarding payment SMS",style=MaterialTheme.typography.bodyMedium)
     }
     Button(
      onClick={
       busy=true;message=""
       scope.launch{
        try{
         val requestCode=scannedPairingCode(code)
         if(requestCode.isEmpty())throw IllegalArgumentException("INVALID_CODE")
         val answer=withContext(Dispatchers.IO){
          val key=AndroidKeystoreSigner("ekmivo-receipt-device").ensurePublicKey()
          val body=JSONObject().put("pairing_token",requestCode)
           .put("public_key",Base64.encodeToString(key,Base64.NO_WRAP)).toString().toByteArray()
          ReceiptTransport.post("claim","",UUID.randomUUID().toString(),body)
         }
         if(answer.first!=200)throw IllegalArgumentException("PAIR_FAILED")
         val paired=JSONObject(answer.second)
         ReceiptStore(context).use{it.savePendingEnrollment(paired);it.saveEnrollment(paired)}
         code="";phone=paired;serverCheck="checking"
         ReceiptSyncWorker.schedule(context)
         if(!permissionGranted)allow.launch(Manifest.permission.RECEIVE_SMS)
        }catch(_:Exception){message=if(bn)"পেয়ারিং হয়নি। কোডের মেয়াদ ও ইন্টারনেট দেখুন।"
         else "Pairing failed. Check the code expiry and connection."}
        finally{busy=false}
       }
      },enabled=consent&&!busy&&code.isNotBlank(),modifier=Modifier.fillMaxWidth()){
      Text(if(bn)"ফোন যুক্ত করুন" else "Connect phone")
     }
    }
   }
  }
  if(message.isNotEmpty())Text(message,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodyMedium)
 }
}

private fun receiptDisplay(body:String):Triple<String,String,String>{
 // Display-only hints; never used for server-side financial verification.
 val money=Regex("""(?i)you have received\s+tk\s+([0-9]+(?:\.[0-9]{1,2})?)""").find(body)?.groupValues?.get(1)
 val payer=Regex("""(?i)\bfrom\s+(\+?[0-9]{11,14})""").find(body)?.groupValues?.get(1)
 val time=Regex("""(?i)(?:\bat\s+|\bdate:\s*)([0-9]{2}/[0-9]{2}/[0-9]{4}\s+[0-9]{2}:[0-9]{2})""").find(body)?.groupValues?.get(1)
 return Triple(if(money!=null)"৳$money" else "—",payer?:"—",time?:"—")
}
