package com.ekmivo.mobile.receipt

import android.content.Context
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteDatabase
import android.content.ContentValues
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import java.util.UUID

/** Private encrypted outbox; no read-SMS permission or inbox enumeration. */
class ReceiptStore(private val appContext: Context): SQLiteOpenHelper(appContext, "receipt-outbox.db", null, 2) {
 private val preferences=appContext.getSharedPreferences("receipt-enrollment",Context.MODE_PRIVATE)
 override fun onCreate(db:SQLiteDatabase) {
  db.execSQL("CREATE TABLE pending(id TEXT PRIMARY KEY, body BLOB NOT NULL, created INTEGER NOT NULL)")
  db.execSQL("CREATE TABLE sequence_counter(singleton INTEGER PRIMARY KEY CHECK(singleton=1), value INTEGER NOT NULL)")
  db.execSQL("INSERT INTO sequence_counter VALUES(1,0)")
  db.execSQL("CREATE TABLE recent(id TEXT PRIMARY KEY,body BLOB NOT NULL,created INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0)")
 }
 override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int) {
  if(oldVersion==1&&newVersion==2) {
   db.execSQL("CREATE TABLE recent(id TEXT PRIMARY KEY,body BLOB NOT NULL,created INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0)")
   db.execSQL("INSERT INTO recent(id,body,created,sent) SELECT id,body,created,0 FROM pending")
  } else error("Explicit receipt migration required")
 }
 /** Independent Keystore alias: revocation must not destroy staged SMS bytes. */
 private fun stageKey():SecretKey {
  val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (store.getKey("ekmivo-receipt-room-stage",null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply{
   init(KeyGenParameterSpec.Builder("ekmivo-receipt-room-stage",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
  }.generateKey()
 }
 fun encryptStaging(id:String,plain:ByteArray):ByteArray{
  val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.ENCRYPT_MODE,stageKey());cipher.updateAAD(("room:"+id).toByteArray())
  return cipher.iv+cipher.doFinal(plain)
 }
 fun decryptStaging(id:String,blob:ByteArray):ByteArray{
  require(blob.size>=29)
  val cipher=Cipher.getInstance("AES/GCM/NoPadding")
  cipher.init(Cipher.DECRYPT_MODE,stageKey(),GCMParameterSpec(128,blob.copyOfRange(0,12)))
  cipher.updateAAD(("room:"+id).toByteArray())
  return cipher.doFinal(blob.copyOfRange(12,blob.size))
 }
 private fun key():SecretKey {
  val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
  (store.getKey("ekmivo-receipt-outbox",null) as? SecretKey)?.let{return it}
  return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
   init(KeyGenParameterSpec.Builder("ekmivo-receipt-outbox",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
  }.generateKey()
 }
 fun enrollment():JSONObject?=preferences.getString("enrollment",null)?.let{JSONObject(it)}
 fun phone():JSONObject?=preferences.getString("physical_phone",null)?.let{JSONObject(it)}
 fun adoptLegacyPhone(response:JSONObject){
  val original=enrollment()?:return
  if(phone()!=null||original.optString("id")!=response.optString("id")||
     original.optString("environment")!=response.optString("environment"))return
  val phone=JSONObject().put("id",response.getString("id"))
   .put("environment",original.getString("environment")).put("physical_device",true)
  val items=response.optJSONArray("bindings")?:org.json.JSONArray()
  val exists=(0 until items.length()).any{items.getJSONObject(it).optString("id")==original.optString("id")}
  if(!exists)return
  check(preferences.edit().putString("physical_phone",phone.toString())
   .putString("physical_bindings",items.toString())
   .putStringSet("selected_binding_ids",setOf(original.getString("id"))).commit())
 }

 fun bindings():List<JSONObject>{
  val payload=preferences.getString("physical_bindings",null)?:return emptyList()
  val items=org.json.JSONArray(payload)
  return (0 until items.length()).map{items.getJSONObject(it)}
 }
 fun selectedBindingIds():Set<String> =
  preferences.getStringSet("selected_binding_ids",emptySet())?.toSet()?:emptySet()
 fun selectBinding(id:String,enabled:Boolean){
  val available=bindings().any{it.optString("id")==id}
  if(!available)return
  val updated=selectedBindingIds().toMutableSet()
  if(enabled)updated.add(id) else updated.remove(id)
  check(preferences.edit().putStringSet("selected_binding_ids",updated).commit())
 }
 fun savePhoneConfiguration(response:JSONObject){
  val current=phone()?:return
  if(response.optString("id")!=current.optString("id") ||
    response.optString("environment")!=current.optString("environment"))return
  val items=response.optJSONArray("bindings")?:org.json.JSONArray()
  // Removed bindings are removed from collection, never from the encrypted outbox.
  // Newly attached sources require an explicit local opt-in before collection.
  val ids=(0 until items.length()).map{items.getJSONObject(it).optString("id")}.toSet()
  val selected=selectedBindingIds().intersect(ids)
  val allowed=response.optJSONArray("forward_sources")?:org.json.JSONArray()
  val sources=(0 until allowed.length()).map{allowed.optString(it).trim()}
   .filter{it.matches(Regex("[A-Za-z0-9_-]{2,40}"))}
  check(preferences.edit().putString("physical_bindings",items.toString())
    .putStringSet("selected_binding_ids",selected)
    .putBoolean("forwarder",response.optBoolean("forwarder",false))
    .putLong("forward_config_version",response.optLong("config_version",-1))
    .putString("forward_sources",sources.joinToString(",")).commit())
 }
 // Physical-phone forwarding is independent of payment account selection.
 // Empty/expired scope never falls back to uploading all SMS.
 fun forwardVersion():Long=preferences.getLong("forward_config_version",-1)
 fun allowedSources():Set<String> = (preferences.getString("forward_sources","")?:"")
  .split(",").map{it.trim().lowercase()}.filter{it.isNotEmpty()}.toSet()
 fun ownsEnrollment(id:String):Boolean =
  id.isNotBlank() && (phone()?.optString("id")==id ||
   enrollment()?.optString("id")==id || (phone()!=null && bindings().any { it.optString("id")==id }))
 fun isRevoked():Boolean = preferences.getBoolean("server_revoked",false)
 fun wasServerAccepted():Boolean = preferences.getBoolean("server_accepted",false)
 fun markServerAccepted(id:String){
  if(!isRevoked() && ownsEnrollment(id))preferences.edit().putBoolean("server_accepted",true).commit()
 }
 /**
  * 401/403: clear device credentials, not encrypted pending Room/SQLite rows.
  * Revoked receipts retain immutable original enrollment and cannot be sent by
  * a different store. Only explicit operator-assisted recovery can resolve them.
  */
 fun revokeCredentials(id:String):Boolean {
  if(!ownsEnrollment(id) && !isRevoked())return false
  if(isRevoked())return true
  val editor=preferences.edit()
   .putBoolean("server_revoked",true).putBoolean("paused",true)
   .putBoolean("server_accepted",false).putString("revoked_device_id",id)
   .remove("physical_phone").remove("enrollment").remove("pending_enrollment")
   .remove("physical_bindings").remove("selected_binding_ids")
   .remove("forward_sources").remove("forwarder").remove("forward_config_version")
  check(editor.commit())
  AndroidKeystoreSigner("ekmivo-receipt-device").forgetEnrollmentKey()
  return true
 }
 fun canForward(sender:String):Boolean {
  if(!enabled()||phone()==null||!preferences.getBoolean("forwarder",false))return false
  return sender.trim().lowercase() in allowedSources()
 }
 fun collectionEnrollments():List<JSONObject>{
  if(phone()!=null)return bindings().filter{selectedBindingIds().contains(it.optString("id"))}
  return listOfNotNull(enrollment())
 }
 // Server consumes pairing only once. Keep the reply for confirmation after
 // rotation/process death; pending enrollment never turns on collection.
 fun pendingEnrollment():JSONObject?=preferences.getString("pending_enrollment",null)?.let{JSONObject(it)}
 fun savePendingEnrollment(value:JSONObject){check(preferences.edit().putString("pending_enrollment",value.toString()).commit())}
 fun saveEnrollment(value:JSONObject){
  val editor=preferences.edit().remove("pending_enrollment")
    .putBoolean("consented",true).putBoolean("paused",false)
    .putBoolean("server_revoked",false).putBoolean("server_accepted",false)
    .remove("revoked_device_id")
  if(value.optBoolean("physical_device")){
   editor.putString("physical_phone",value.toString())
    .putString("physical_bindings","[]")
    .putStringSet("selected_binding_ids",emptySet())
  }else{
   editor.putString("enrollment",value.toString())
  }
  check(editor.commit())
 }
 fun overflowCount():Long=preferences.getLong("overflow_count",0)
 // Operational reason codes only. Do not persist server error bodies or OTPs.
 fun queueError():String=preferences.getString("queue_error","")?:""
 fun setQueueError(code:String){require(code.matches(Regex("[A-Z0-9_]{0,64}")));preferences.edit().putString("queue_error",code).commit()}
 fun enabled()=preferences.getBoolean("consented",false)&&!preferences.getBoolean("paused",false)&&(enrollment()!=null||phone()!=null)
 // A signed, server-accepted configuration check is required to clear the
 // local pause after a projection repair. A 403 or offline result never resumes.
 fun resumeAuthorizedPhone(id:String):Boolean {
  if(phone()?.optString("id")!=id || !preferences.getBoolean("consented",false))return false
  return preferences.edit().putBoolean("paused",false).commit()
 }
 fun pause(id:String?=null){
  // id retained as an optional scope argument for older callsites/partial upgrades.
  if(id==null||phone()?.optString("id")==id||enrollment()?.optString("id")==id)
   preferences.edit().putBoolean("paused",true).commit()
 }
 fun disconnect():Boolean{
  // Never delete a Keystore key when either the legacy queue or the Room
  // staging database still has unacknowledged evidence.
  val stagingCount=runCatching{
   kotlinx.coroutines.runBlocking(kotlinx.coroutines.Dispatchers.IO){
    ReceivedSmsRoom.get(appContext).messages().countUnacknowledged()
   }
  }.getOrElse{setQueueError("STAGING_STATUS_UNAVAILABLE");return false}
  if(count()>0 || stagingCount>0){
   setQueueError("PENDING_RECEIPTS_BLOCK_DISCONNECT")
   return false
  }
  // Stop collection before waiting for a concurrent database writer.
  check(preferences.edit().clear().commit())
  writableDatabase.delete("pending",null,null)
  writableDatabase.delete("recent",null,null)
  // Destroy the outbox key as well as the signer: deleted SQLite/WAL pages
  // must not remain decryptable after this device is disconnected.
  KeyStore.getInstance("AndroidKeyStore").apply{load(null)}.deleteEntry("ekmivo-receipt-outbox")
  AndroidKeystoreSigner("ekmivo-receipt-device").forgetEnrollmentKey()
  return true
 }
 fun count():Int=readableDatabase.rawQuery("SELECT count(*) FROM pending",null).use{it.moveToFirst();it.getInt(0)}
 fun deliveryDisposition(id:String):Int =
  readableDatabase.rawQuery("SELECT sent FROM recent WHERE id=?",arrayOf(id)).use{
   if(it.moveToFirst())if(it.getInt(0)==1)2 else 1 else 0
  }
 fun enqueue(body:JSONObject, eventId:String=UUID.randomUUID().toString()):Boolean {
  require(eventId.matches(Regex("[0-9a-fA-F-]{36}")))
  if(deliveryDisposition(eventId)!=0)return true
  if(!enabled())return false
  val database=writableDatabase;database.beginTransaction()
  try {
   // A receiver may have passed its first check before disconnect/pause.
   if(!enabled()){database.setTransactionSuccessful();return false}
   // Check within the write transaction so concurrent receivers cannot
   // overfill the outbox. Record rejected receipts without retaining their text.
   val full=database.rawQuery("SELECT count(*) FROM pending",null).use{it.moveToFirst();it.getInt(0)>=500}
   if(full){
    database.setTransactionSuccessful()
    // No amount/payer/message content in health; an operator can see loss.
    preferences.edit().putLong("overflow_count",(overflowCount()+1).coerceAtMost(Long.MAX_VALUE)).commit()
    return false
   }
   database.execSQL("UPDATE sequence_counter SET value=value+1 WHERE singleton=1")
   val sequence=database.rawQuery("SELECT value FROM sequence_counter WHERE singleton=1",null).use{it.moveToFirst();it.getLong(0)}
   body.put("sequence",sequence)
   val id=eventId;val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(id.toByteArray())
   val encrypted=cipher.iv+cipher.doFinal(body.toString().toByteArray(Charsets.UTF_8))
   val values=ContentValues().apply{put("id",id);put("body",encrypted);put("created",System.currentTimeMillis())}
   val stored=database.insertOrThrow("pending",null,values)>0
   if(stored){
    val recent=ContentValues().apply{put("id",id);put("body",encrypted);put("created",System.currentTimeMillis());put("sent",0)}
    database.insertOrThrow("recent",null,recent)
    // Keep every unsent row visible. Only prune successfully forwarded
    // operational history; never hide offline pending receipts.
    database.execSQL("DELETE FROM recent WHERE sent=1 AND id NOT IN (SELECT id FROM recent WHERE sent=1 ORDER BY created DESC,id DESC LIMIT 60)")
   }
   database.setTransactionSuccessful();return stored
  }finally{database.endTransaction()}
 }
 fun next():Pair<String,ByteArray>?=readableDatabase.rawQuery("SELECT id,body FROM pending ORDER BY created,id LIMIT 1",null).use {
  if(!it.moveToFirst())return null
  val id=it.getString(0);val encrypted=it.getBlob(1);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)));cipher.updateAAD(id.toByteArray());id to cipher.doFinal(encrypted.copyOfRange(12,encrypted.size))
 }
 /**
  * Keep revoked/other-shop rows encrypted in-place without starving
  * legitimate new receipts after a different shop is paired.
  * Each candidate is decrypted locally to read its immutable enrollment;
  * no metadata/identity is guessed from the SIM or provider.
  */
 fun nextEligible():Pair<String,ByteArray>? {
  val activeIds=buildSet<String>{
   phone()?.optString("id")?.takeIf{it.isNotBlank()}?.let{add(it)}
   enrollment()?.optString("id")?.takeIf{it.isNotBlank()}?.let{add(it)}
   if(phone()!=null)bindings().forEach{binding->
    binding.optString("id").takeIf{it.isNotBlank()}?.let{add(it)}
   }
  }
  if(activeIds.isEmpty())return null
  readableDatabase.rawQuery("SELECT id,body FROM pending ORDER BY created,id LIMIT 500",null).use{cursor->
   while(cursor.moveToNext()){
    val id=cursor.getString(0)
    val blob=cursor.getBlob(1)
    val cipher=Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,blob.copyOfRange(0,12)))
    cipher.updateAAD(id.toByteArray())
    val bytes=cipher.doFinal(blob.copyOfRange(12,blob.size))
    if(JSONObject(String(bytes,Charsets.UTF_8)).optString("enrollment_id") in activeIds)
     return id to bytes
   }
  }
  return null
 }
 fun recent(limit:Int=20):List<JSONObject>{
  val results=mutableListOf<JSONObject>()
  readableDatabase.rawQuery("SELECT id,body,created,sent FROM recent ORDER BY sent ASC,created DESC,id DESC LIMIT ?",arrayOf(limit.coerceIn(1,500).toString())).use{cursor->
   while(cursor.moveToNext()){
    try {
     val id=cursor.getString(0);val encrypted=cursor.getBlob(1)
     val cipher=Cipher.getInstance("AES/GCM/NoPadding")
     cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
     cipher.updateAAD(id.toByteArray())
     val receipt=JSONObject(String(cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)),Charsets.UTF_8))
     results.add(JSONObject().put("source",receipt.optString("source")).put("evidence",receipt.optString("evidence"))
      .put("received_at",cursor.getLong(2)).put("sent",cursor.getInt(3)==1))
    }catch(_:Exception){setQueueError("RECEIPT_HISTORY_UNAVAILABLE")}
   }
  }
  return results
 }
 /** Only receipts with NO server durable ACK are visible on the forwarding screen. */
 fun pendingReceipts(limit:Int=40):List<JSONObject>{
  val output=mutableListOf<JSONObject>()
  readableDatabase.rawQuery(
   "SELECT id,body,created FROM pending ORDER BY created ASC,id ASC LIMIT ?",
   arrayOf(limit.coerceIn(1,500).toString())
  ).use{cursor->
   while(cursor.moveToNext()){
    try{
     val id=cursor.getString(0)
     val encrypted=cursor.getBlob(1)
     val cipher=Cipher.getInstance("AES/GCM/NoPadding")
     cipher.init(Cipher.DECRYPT_MODE,key(),
      GCMParameterSpec(128,encrypted.copyOfRange(0,12)))
     cipher.updateAAD(id.toByteArray())
     val receipt=JSONObject(String(
      cipher.doFinal(encrypted.copyOfRange(12,encrypted.size)),Charsets.UTF_8))
     output.add(JSONObject()
      .put("source",receipt.optString("source"))
      .put("evidence",receipt.optString("evidence"))
      .put("received_at",cursor.getLong(2)))
    }catch(_:Exception){setQueueError("RECEIPT_HISTORY_UNAVAILABLE")}
   }
  }
  return output
 }
 fun acknowledge(id:String){
  val db=writableDatabase
  db.beginTransaction()
  try{
   db.execSQL("UPDATE recent SET sent=1 WHERE id=?",arrayOf(id))
   db.delete("pending","id=?",arrayOf(id))
   db.execSQL("DELETE FROM recent WHERE sent=1 AND id NOT IN (SELECT id FROM recent WHERE sent=1 ORDER BY created DESC,id DESC LIMIT 60)")
   db.setTransactionSuccessful()
  }finally{db.endTransaction()}
 }
}
