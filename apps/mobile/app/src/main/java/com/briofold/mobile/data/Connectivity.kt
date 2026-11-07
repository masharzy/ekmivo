package com.briofold.mobile.data

import com.briofold.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

sealed interface ServiceStatus {
 data object NotConfigured : ServiceStatus
 data object Checking : ServiceStatus
 data object Unreachable : ServiceStatus
 data object OperationalServicesUnavailable : ServiceStatus
 data object Ready : ServiceStatus
}

class ServiceProbe(
 private val baseUrl: String = BuildConfig.API_BASE_URL,
 private val client: OkHttpClient = OkHttpClient.Builder()
  .connectTimeout(5,TimeUnit.SECONDS)
  .readTimeout(5,TimeUnit.SECONDS)
  .callTimeout(8,TimeUnit.SECONDS).build()
) {
 suspend fun check():ServiceStatus = withContext(Dispatchers.IO) {
  if(!baseUrl.startsWith("https://")) return@withContext ServiceStatus.NotConfigured
  val host = baseUrl.trimEnd('/')
  try {
   val healthy=client.newCall(Request.Builder().url(host+"/healthz").get().build())
    .execute().use { it.code==200 }
   if(!healthy) return@withContext ServiceStatus.Unreachable
   val ready=client.newCall(Request.Builder().url(host+"/readyz").get().build())
    .execute().use { it.code==200 }
   if(ready) ServiceStatus.Ready else ServiceStatus.OperationalServicesUnavailable
  }catch (_: Exception){ ServiceStatus.Unreachable }
 }
}
