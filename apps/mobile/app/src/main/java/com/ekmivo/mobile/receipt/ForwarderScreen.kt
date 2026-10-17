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
 var refreshNonce by remember{mutableIntStateOf(0)}
 var pendingReceipts by remember{mutableStateOf<List<JSONObject>>(emptyList())}
 var pendingCount by remember{mutableIntStateOf(0)}
 var displayLimit by remember{mutableIntStateOf(30)}
 var syncError by remember{mutableStateOf("")}
 var queueLoaded by remember{mutableStateOf(false)}
 LaunchedEffect(phone?.optString("id")){
  while(true){
   val snapshot=withContext(Dispatchers.IO){
    ReceiptStore(context).use{Triple(it.pendingReceipts(displayLimit),it.count(),it.queueError())}
   }
   pendingReceipts=snapshot.first
   pendingCount=snapshot.second
   syncError=snapshot.third
   queueLoaded=true
   delay(2000)
  }
 }
 val allow=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted->
  permissionGranted=granted
  if(granted){ReceiptSyncWorker.scheduleNow(context);message=""}
 }
 fun updateLocal(){
  phone=ReceiptStore(context).use{it.phone()?:it.enrollment()}
  permissionGranted=ContextCompat.checkSelfPermission(context,Manifest.permission.RECEIVE_SMS)==PackageManager.PERMISSION_GRANTED
 }
 DisposableEffect(lifecycleOwner){
  val observer=LifecycleEventObserver{_,event->if(event==Lifecycle.Event.ON_RESUME){updateLocal();if(phone!=null){refreshNonce++;ReceiptSyncWorker.scheduleNow(context)}}}
  lifecycleOwner.lifecycle.addObserver(observer)
  onDispose{lifecycleOwner.lifecycle.removeObserver(observer)}
 }
 LaunchedEffect(phone?.optString("id"),refreshNonce){
  val active=phone?:return@LaunchedEffect
  serverCheck="checking"
  val response=withContext(Dispatchers.IO){runCatching{
   val payload=JSONObject().put("enrollment_id",active.getString("id"))
    .put("environment",active.getString("environment")).toString().toByteArray()
   ReceiptTransport.post(context,"configuration",active.getString("id"),UUID.randomUUID().toString(),payload)
  }.getOrNull()}
  if(response?.first==200){
   ReceiptStore(context).use{
    it.savePhoneConfiguration(JSONObject(response.second))
    it.resumeAuthorizedPhone(active.getString("id"))
   }
   serverCheck="connected"
   ReceiptSyncWorker.scheduleNow(context)
  }else {
   val code=runCatching{JSONObject(response?.second?:"").optJSONObject("error")?.optString("code")?:""}.getOrDefault("")
   serverCheck=when{
    response?.first==403 && code=="PHONE_REVOKED"->"revoked"
    response?.first==403->"authorization"
    response?.first==503 && code=="PHONE_PROJECTION_STALE"->"authorization"
    else->"offline"
   }
  }
 }
 Column(
  Modifier.fillMaxSize().verticalScroll(rememberScrollState())
   .padding(start=24.dp,end=24.dp,top=27.dp,bottom=25.dp),
  verticalArrangement=Arrangement.spacedBy(15.dp)){
  Text("SMS Forwarder",style=MaterialTheme.typography.headlineSmall)
  if(phone!=null){
   Surface(
    shape=RoundedCornerShape(22.dp),color=MaterialTheme.colorScheme.surface,
    border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
    Row(Modifier.fillMaxWidth().padding(20.dp),verticalAlignment=Alignment.CenterVertically,
     horizontalArrangement=Arrangement.spacedBy(12.dp)){
     val connected=serverCheck=="connected"&&permissionGranted
     Surface(shape=CircleShape,color=if(connected)Color(0xFF289667).copy(alpha=.12f)
      else MaterialTheme.colorScheme.error.copy(alpha=.12f)){
      Icon(if(connected)Icons.Outlined.CheckCircleOutline else Icons.Outlined.WarningAmber,
       contentDescription=null,modifier=Modifier.padding(12.dp).size(27.dp),
       tint=if(connected)Color(0xFF289667) else MaterialTheme.colorScheme.error)
     }
     Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)){
      Text(when{
       serverCheck=="revoked"->if(bn)"ফোনের সংযোগ বাতিল" else "Phone revoked"
       serverCheck=="authorization"->if(bn)"সার্ভারের অনুমতি মিলছে না" else "Server authorization mismatch"
       !permissionGranted->if(bn)"SMS অনুমতি প্রয়োজন" else "SMS access required"
       serverCheck=="checking"->if(bn)"সংযোগ যাচাই হচ্ছে" else "Checking connection"
       serverCheck=="offline"->if(bn)"সার্ভার সংযোগ নেই" else "Server unavailable"
       else->if(bn)"ফোন সংযুক্ত আছে" else "Phone connected"
      },style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
      Text(phone!!.optString("environment").uppercase(),
       style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
     }
    }
   }
   if(!permissionGranted&&serverCheck!="revoked"){
    Button(onClick={allow.launch(Manifest.permission.RECEIVE_SMS)},modifier=Modifier.fillMaxWidth()){
     Text(if(bn)"SMS অনুমতি দিন" else "Allow SMS access")
    }
   }
   Text(if(bn)"অপেক্ষমাণ SMS" else "Pending SMS",style=MaterialTheme.typography.titleLarge,
    fontWeight=FontWeight.Bold)
   if(!queueLoaded){
    CircularProgressIndicator(modifier=Modifier.size(24.dp))
   }else if(pendingCount==0){
    Surface(color=MaterialTheme.colorScheme.surface,
     shape=RoundedCornerShape(18.dp),
     border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
     Row(Modifier.fillMaxWidth().padding(19.dp),verticalAlignment=Alignment.CenterVertically,
      horizontalArrangement=Arrangement.spacedBy(12.dp)){
      Icon(Icons.Outlined.CheckCircleOutline,null,Modifier.size(24.dp),tint=Color(0xFF289667))
      Text(if(bn)"সব SMS সার্ভারে পাঠানো হয়েছে" else "All SMS sent to the server",
       style=MaterialTheme.typography.bodyLarge)
     }
    }
   }else{
    Column(verticalArrangement=Arrangement.spacedBy(9.dp)){
     Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
      horizontalArrangement=Arrangement.SpaceBetween){
      Text(if(bn)"$pendingCount টি SMS পাঠানো বাকি" else "$pendingCount SMS waiting to send",
       style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
      if(syncError.isNotEmpty()){
       TextButton(onClick={ReceiptSyncWorker.scheduleNow(context)}){
        Text(if(bn)"আবার চেষ্টা" else "Retry")
       }
      }
     }
     if(syncError.isNotEmpty())
      Text(if(bn)"পাঠাতে সমস্যা হচ্ছে, আবার চেষ্টা চলছে।"
        else "Could not send yet. Retrying automatically.",
       color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall)
    }
    pendingReceipts.forEach{receipt->
     val preview=receiptDisplay(receipt.optString("evidence"))
     Surface(shape=RoundedCornerShape(16.dp),color=MaterialTheme.colorScheme.surface,
      border=BorderStroke(1.dp,MaterialTheme.colorScheme.outlineVariant)){
      Column(Modifier.fillMaxWidth().padding(16.dp),
       verticalArrangement=Arrangement.spacedBy(7.dp)){
       Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.SpaceBetween){
        Text(receipt.optString("source"),fontWeight=FontWeight.SemiBold)
        Text(preview.first,fontWeight=FontWeight.Bold,style=MaterialTheme.typography.titleMedium)
       }
       Text((if(bn)"প্রেরক: " else "Sender: ")+preview.second,
        style=MaterialTheme.typography.bodyMedium)
       Text((if(bn)"সময়: " else "Time: ")+preview.third,
        style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
      }
     }
    }
    if(pendingCount>displayLimit && displayLimit<500){
     TextButton(onClick={displayLimit=(displayLimit+30).coerceAtMost(500)},
      modifier=Modifier.fillMaxWidth()){
      Text(if(bn)"আরও দেখুন" else "Show more")
     }
    }
   }
   if(serverCheck=="authorization"){
    Text(if(bn)"এই ফোনের pairing সংরক্ষিত আছে, কিন্তু server authorization মেলেনি। নতুন code দিয়ে pair না করে server sync ঠিক করুন।"
      else "This phone is still paired locally, but its server authorization is out of sync. Do not pair again; repair the server projection.",
      color=MaterialTheme.colorScheme.error)
    OutlinedButton(onClick={refreshNonce++},modifier=Modifier.fillMaxWidth()){
     Text(if(bn)"আবার সংযোগ যাচাই" else "Check connection again")
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
          ReceiptTransport.post(context,"claim","",UUID.randomUUID().toString(),body)
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
