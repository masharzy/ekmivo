package com.briofold.mobile.receipt

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Wire-contract canonical bytes for the native receipt submission signature.
 *
 * Server must independently reconstruct this from the raw HTTP body and
 * bound authenticated enrollment. The device cannot declare a payment paid.
 */
object DeviceSignatureCanonicalizer {
 fun canonical(
  method:String,
  path:String,
  transportTimestamp:String,
  eventId:String,
  rawBody:ByteArray
 ):ByteArray {
  require(method.matches(Regex("[A-Z]{3,10}"))){"Invalid HTTP method"}
  require(path.startsWith("/") && !path.contains('\n') && !path.contains('\r')){"Invalid path"}
  require(transportTimestamp.matches(Regex("[0-9]{10,16}"))){"Invalid timestamp"}
  require(eventId.matches(Regex("[a-zA-Z0-9_-]{1,128}"))){"Invalid event ID"}
  val bytes=MessageDigest.getInstance("SHA-256").digest(rawBody)
  val hex="0123456789abcdef"
  val digest=buildString(bytes.size*2){
   bytes.forEach { b ->
    val value=b.toInt() and 0xff
    append(hex[value ushr 4])
    append(hex[value and 0x0f])
   }
  }
  return listOf(method,path,transportTimestamp,eventId,digest).joinToString("\n")
   .toByteArray(StandardCharsets.UTF_8)
 }
}
