package com.ekmivo.mobile.receipt

import android.os.Bundle
import android.content.Intent
import android.provider.Settings
import android.Manifest
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ekmivo.mobile.data.AppPreferences
import com.ekmivo.mobile.data.Appearance
import com.ekmivo.mobile.data.Language
import com.ekmivo.mobile.ui.EkmivoTheme
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.json.JSONObject
import java.util.UUID

/** Minimal collection consent/pairing, not an expansion of merchant inbox UI. */
class ReceiptSetupActivity:ComponentActivity(){
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  val preferences=AppPreferences(applicationContext)
  setContent {
   val appearance by preferences.appearance.collectAsState(initial=Appearance.SYSTEM)
   val language by preferences.language.collectAsState(initial=Language.BN)
   val bn=language==Language.BN
   EkmivoTheme(dark=when(appearance){Appearance.SYSTEM->isSystemInDarkTheme();Appearance.DARK->true;Appearance.LIGHT->false}){
    val scope=rememberCoroutineScope();var token by remember{mutableStateOf("")};var consent by remember{mutableStateOf(false)};var busy by remember{mutableStateOf(false)}
    var proposed by remember{mutableStateOf(ReceiptStore(applicationContext).use{it.pendingEnrollment()})};var active by remember{mutableStateOf(ReceiptStore(applicationContext).use{it.phone()?:it.enrollment()})}
    var message by remember{mutableStateOf("")}
    var history by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var configured by remember{mutableStateOf(ReceiptStore(applicationContext).use{it.bindings()})}
    var selectedSources by remember{mutableStateOf(ReceiptStore(applicationContext).use{it.selectedBindingIds()})}
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()){granted ->message=if(granted){if(bn)"SMS অনুমতি দেওয়া হয়েছে।" else "SMS permission granted."}else{if(bn)"SMS অনুমতি নেই; সেটিংস থেকে অনুমতি দিন।" else "SMS permission denied; review device settings."}}
    Surface(Modifier.fillMaxSize()){
     Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
      Text(if(bn)"পেমেন্ট receipt সংগ্রহ" else "Payment receipt collection",style=MaterialTheme.typography.headlineSmall)
      Text(if(bn)"শুধু নির্ধারিত account-এর অনুমোদিত payment receipt সংগ্রহ হবে। ব্যক্তিগত SMS বা OTP সংরক্ষণ হবে না। Device signature অর্থ প্রাপ্তির প্রমাণ নয়; server যাচাই করবে।" else "Collect approved payment receipts for the bound account. Personal messages and OTPs are excluded. Device signatures identify this device; the server verifies payments.")
      if(active==null){
       Row{Checkbox(consent,onCheckedChange={consent=it},enabled=!busy);Text(if(bn)"আমি এই account-এর receipt সংগ্রহে সম্মতি দিচ্ছি।" else "I consent to receipt collection for this account.")}
       OutlinedTextField(token,onValueChange={token=it.trim()},label={Text(if(bn)"Devices page-এর pairing token" else "Pairing token from Devices")},enabled=!busy,modifier=Modifier.fillMaxWidth())
       Button(enabled=consent&&!busy&&token.isNotBlank(),onClick={
        busy=true;message="";scope.launch{
         try{
          val result=withContext(Dispatchers.IO){
           val key=AndroidKeystoreSigner("ekmivo-receipt-device").ensurePublicKey()
           val body=JSONObject().put("pairing_token",token).put("public_key",Base64.encodeToString(key,Base64.NO_WRAP)).toString().toByteArray()
           ReceiptTransport.post("claim","",UUID.randomUUID().toString(),body)
          }
          token="";if(result.first==200){
           // Consume no second token on recreation; show account confirmation
           // from disk, with collection OFF until the user consents to enable.
           val bound=JSONObject(result.second)
           withContext(Dispatchers.IO){ReceiptStore(applicationContext).use{it.savePendingEnrollment(bound)}}
           proposed=bound
          }else{message=if(bn)"Pair হয়নি। মেয়াদ, token ও server connection দেখুন।" else "Pairing failed. Check expiry, token and server connection."}
         }catch(_:Exception){message=if(bn)"Server unavailable। আবার চেষ্টা করুন।" else "Server unavailable. Retry."}finally{busy=false}
        }
       }){Text(if(bn)"Pair করুন" else "Pair device")}
       proposed?.let{bound ->
        Text((if(bn)"নিশ্চিত করুন: " else "Confirm: ")+bound.optString("environment")+" · "+(if(bound.optBoolean("physical_device"))(if(bn)"একটি ফোন — একাধিক account" else "One phone, multiple accounts") else bound.optString("account_id")+" · "+bound.optString("source")+" · "+bound.optString("binding")))
        Button(onClick={ReceiptStore(applicationContext).use{it.saveEnrollment(bound)};active=bound;proposed=null;ReceiptSyncWorker.schedule(applicationContext)}){Text(if(bn)"Account নিশ্চিত করে চালু করুন" else "Confirm account and enable")}
       }
      }else{
       Text(active!!.optString("environment")+" · "+(if(active!!.optBoolean("physical_device"))(if(bn)"Physical device" else "Physical device") else active!!.optString("source")+" · "+active!!.optString("binding")))
       if(active!!.optBoolean("physical_device")){
        Text(if(bn)"একটি ফোনে একাধিক receiving account যুক্ত করুন। Website থেকে source/SIM mapping সংরক্ষণ করার পর এখানে অনুমোদন দিন।" else "Use one paired phone for multiple receiving accounts. Approve each website-configured source/SIM binding here.")
        Button(enabled=!busy,onClick={busy=true;scope.launch{
         try{
          val phone=active!!
          val payload=JSONObject().put("enrollment_id",phone.getString("id")).put("environment",phone.getString("environment"))
          val response=withContext(Dispatchers.IO){ReceiptTransport.post("configuration",phone.getString("id"),UUID.randomUUID().toString(),payload.toString().toByteArray())}
          if(response.first!=200)throw IllegalStateException()
          withContext(Dispatchers.IO){ReceiptStore(applicationContext).use{it.savePhoneConfiguration(JSONObject(response.second))}}
          ReceiptStore(applicationContext).use{configured=it.bindings();selectedSources=it.selectedBindingIds()}
          message=if(bn)"Account/source তালিকা আপডেট হয়েছে।" else "Account/source list refreshed."
         }catch(_:Exception){message=if(bn)"Binding list পাওয়া যায়নি; server বা অনুমতি পরীক্ষা করুন।" else "Binding refresh unavailable. Check server and authorization."}finally{busy=false}
        }}){Text(if(bn)"Accounts refresh করুন" else "Refresh available accounts")}
        if(configured.isEmpty())Text(if(bn)"কোনো account যুক্ত হয়নি। Website → SMS Devices → Manage থেকে যুক্ত করুন।" else "No receiving account linked. Add it under Website → SMS Devices → Manage.")
        configured.forEach{binding->
         val id=binding.optString("id")
         Row(verticalAlignment=androidx.compose.ui.Alignment.CenterVertically){
          Checkbox(checked=selectedSources.contains(id),enabled=!busy,onCheckedChange={checked->
           ReceiptStore(applicationContext).use{it.selectBinding(id,checked);selectedSources=it.selectedBindingIds()}
           ReceiptSyncWorker.schedule(applicationContext)
          })
          Column{
           Text((binding.optString("label").ifBlank{binding.optString("method")})+" · "+binding.optString("source"))
           Text("•••• "+binding.optString("display_suffix")+" · "+binding.optString("binding"),style=MaterialTheme.typography.bodySmall)
          }
         }
        }
       }
       Text((if(bn)"অপেক্ষমাণ receipt: " else "Queued receipts: ")+ReceiptStore(applicationContext).use{it.count()})
       val overflow=ReceiptStore(applicationContext).use{it.overflowCount()}
       val queueError=ReceiptStore(applicationContext).use{it.queueError()}
       if(queueError.isNotEmpty())Text(
        (if(bn)"Receipt queue সমস্যা: " else "Receipt queue requires attention: ")+queueError,
        color=MaterialTheme.colorScheme.error
       )
       if(overflow>0)Text(
        (if(bn)"সতর্কতা: queue পূর্ণ থাকায় অন্তত $overflow টি receipt সংগ্রহ হয়নি। Server-এ এগুলো জমা হয়নি; account ও device health পরীক্ষা করুন।"
         else "Warning: $overflow receipts were missed while the offline queue was full. They were not uploaded; review the account and device health."),
        color=MaterialTheme.colorScheme.error
       )
       Button(onClick={permission.launch(Manifest.permission.RECEIVE_SMS)}){Text(if(bn)"SMS permission দিন" else "Grant SMS permission")}
       Button(onClick={startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))}){Text(if(bn)"Notification listener settings" else "Notification listener settings")}
       Button(onClick={ReceiptSyncWorker.schedule(applicationContext);message=if(bn)"Sync schedule করা হয়েছে; ACK পেলে queue থেকে সরবে।" else "Sync scheduled; receipts leave the queue only after durable ACK."}){Text(if(bn)"এখন Sync করুন" else "Sync now")}
       Button(enabled=!busy,onClick={busy=true;scope.launch{try{
        val bound=active!!
        val enrollmentId=if(bound.optBoolean("physical_device"))configured.firstOrNull()?.optString("id")?:throw IllegalStateException("No binding") else bound.getString("id")
        val body=JSONObject().put("enrollment_id",enrollmentId).put("environment",bound.getString("environment"))
        val result=withContext(Dispatchers.IO){ReceiptTransport.post("history",enrollmentId,UUID.randomUUID().toString(),body.toString().toByteArray())}
        if(result.first!=200)throw IllegalStateException()
        val items=JSONObject(result.second).getJSONArray("items");history=(0 until items.length()).map{items.getJSONObject(it)}
       }catch(_:Exception){message=if(bn)"Receipt history unavailable।" else "Receipt history unavailable."}finally{busy=false}}}){Text(if(bn)"Server receipt log দেখুন" else "View server receipt log")}
       history.forEach{row ->Text(row.optString("event_id").take(8)+" · "+row.optString("status")+" · "+row.optString("received_at")+" · "+row.optString("reason"))}
       Text(if(bn)"Durable ACK মানে সংরক্ষিত হয়েছে; payment নিশ্চিত হওয়ার অর্থ নয়।" else "Durable ACK means stored; it does not mean payment confirmed.")
       var disconnect by remember{mutableStateOf(false)}
       OutlinedButton(onClick={disconnect=true}){Text(if(bn)"সংযোগ বিচ্ছিন্ন করুন" else "Disconnect")}
       if(disconnect)AlertDialog(onDismissRequest={disconnect=false},title={Text(if(bn)"এই device বন্ধ করবেন?" else "Disconnect this device?")},text={Text(if(bn)"স্থানীয় queue ও key মুছবে। Web Devices-এ enrollment revoke করুন।" else "Deletes this device's local queue and key. Revoke its enrollment in Web Devices.")},confirmButton={TextButton(onClick={val cleared=ReceiptStore(applicationContext).use{it.disconnect()}
         if(cleared){active=null;configured=emptyList();selectedSources=emptySet()}
         else message=if(bn)"অপেক্ষমাণ receipt আছে; sync/সমাধান না করে disconnect করা যাবে না।" else "Pending receipt evidence must be synced or resolved before disconnecting."
         disconnect=false}){Text(if(bn)"বিচ্ছিন্ন করুন" else "Disconnect")}},dismissButton={TextButton(onClick={disconnect=false}){Text(if(bn)"ফিরে যান" else "Cancel")}})
      }
      if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
      if(message.isNotEmpty())Text(message)
      TextButton(onClick={finish()}){Text(if(bn)"ফিরে যান" else "Back")}
     }
    }
   }
  }
 }
}
