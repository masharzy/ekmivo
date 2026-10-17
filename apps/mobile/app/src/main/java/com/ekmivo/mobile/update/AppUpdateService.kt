package com.ekmivo.mobile.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.ekmivo.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit

data class AndroidRelease(val code:Int,val name:String,val url:String,val sha256:String)
sealed interface UpdateCheck {
 data class Available(val release:AndroidRelease):UpdateCheck
 data object NoNewVersion:UpdateCheck
 data object NotPublished:UpdateCheck
 data object Unavailable:UpdateCheck
}

/** No silent installation. Installer requires explicit user authorization. */
object AppUpdateService {
 private val client=OkHttpClient.Builder().connectTimeout(12,TimeUnit.SECONDS)
  .readTimeout(45,TimeUnit.SECONDS).followRedirects(false).build()
 private val shaRegex=Regex("^[a-f0-9]{64}$")

 suspend fun check():UpdateCheck=withContext(Dispatchers.IO) {
  try {
   val url=BuildConfig.API_BASE_URL.trimEnd('/')+"/v1/mobile/releases/latest"
   client.newCall(Request.Builder().url(url).get().build()).execute().use{response->
    if(response.code==204)return@withContext UpdateCheck.NotPublished
    if(response.code!=200)return@withContext UpdateCheck.Unavailable
    val root=JSONObject(response.body?.string()?:return@withContext UpdateCheck.Unavailable)
    val code=root.optInt("version_code")
    val name=root.optString("version_name")
    val apk=root.optString("apk_url")
    val hash=root.optString("sha256").lowercase(Locale.ROOT)
    val uri=Uri.parse(apk)
    if(code<=0||name.isBlank()||uri.scheme!="https"||uri.host.isNullOrBlank()||
      !shaRegex.matches(hash)||uri.userInfo!=null)
     return@withContext UpdateCheck.Unavailable
    if(code<=BuildConfig.VERSION_CODE)return@withContext UpdateCheck.NoNewVersion
    UpdateCheck.Available(AndroidRelease(code,name,apk,hash))
   }
  }catch(_:Exception){UpdateCheck.Unavailable}
 }

 /** APK bytes are checked before exposing them to the Android package installer. */
 suspend fun download(context:Context,release:AndroidRelease):File=withContext(Dispatchers.IO) {
  require(release.code>BuildConfig.VERSION_CODE)
  require(Uri.parse(release.url).scheme=="https"&&shaRegex.matches(release.sha256))
  val folder=context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
   ?:throw IllegalStateException("UPDATE_STORAGE_UNAVAILABLE")
  val staging=File(folder,"ekmivo-update-"+release.code+".tmp.apk")
  val apk=File(folder,"ekmivo-update-"+release.code+".apk")
  try {
   val digest=MessageDigest.getInstance("SHA-256")
   var bytes=0L
   client.newCall(Request.Builder().url(release.url).get().build()).execute().use{resp->
    if(!resp.isSuccessful)throw IllegalStateException("UPDATE_DOWNLOAD_FAILED")
    val stream=resp.body?.byteStream()?:throw IllegalStateException("UPDATE_EMPTY")
    stream.use{input->
     staging.outputStream().use{output->
      val buffer=ByteArray(32768)
      while(true){
       val n=input.read(buffer)
       if(n<0)break
       bytes+=n
       if(bytes>150L*1024L*1024L)throw IllegalStateException("UPDATE_TOO_LARGE")
       digest.update(buffer,0,n);output.write(buffer,0,n)
      }
     }
    }
   }
   val hex=digest.digest().joinToString(""){"%02x".format(it)}
   if(bytes<1024||hex!=release.sha256)throw IllegalStateException("UPDATE_CHECKSUM_FAILED")
   @Suppress("DEPRECATION")
   val info=context.packageManager.getPackageArchiveInfo(staging.absolutePath,0)
    ?:throw IllegalStateException("UPDATE_PACKAGE_MISMATCH")
   if(info.packageName!=BuildConfig.APPLICATION_ID)
    throw IllegalStateException("UPDATE_PACKAGE_MISMATCH")
   @Suppress("DEPRECATION")
   val apkCode=if(Build.VERSION.SDK_INT>=28)info.longVersionCode else info.versionCode.toLong()
   if(apkCode<release.code || apkCode<=BuildConfig.VERSION_CODE)
    throw IllegalStateException("UPDATE_VERSION_MISMATCH")
   if(apk.exists())apk.delete()
   if(!staging.renameTo(apk))throw IllegalStateException("UPDATE_STORAGE_UNAVAILABLE")
   apk
  }catch(e:Exception){staging.delete();throw e}
 }

 fun openInstaller(context:Context,apk:File) {
  // Android 8+ may require an explicit "Install unknown apps" approval.
  // Never silently grant it or bypass the system confirmation.
  if(Build.VERSION.SDK_INT>=26&&!context.packageManager.canRequestPackageInstalls()){
   val intent=Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
    Uri.parse("package:"+context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
   context.startActivity(intent);return
  }
  val uri=FileProvider.getUriForFile(context,
   context.packageName+".updates",apk)
  val install=Intent(Intent.ACTION_VIEW).apply{
   setDataAndType(uri,"application/vnd.android.package-archive")
   addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
  }
  context.startActivity(install)
 }
}
