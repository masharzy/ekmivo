package com.briofold.mobile.receipt

import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class DeviceSignatureTest {
 @Test fun canonicalByteSequenceIsStableAndBoundToRawBody(){
  val bytes=DeviceSignatureCanonicalizer.canonical(
   "POST","/v1/device-events","1791600000","evt_001",
   "{}".toByteArray(StandardCharsets.UTF_8))
  val text=bytes.toString(StandardCharsets.UTF_8)
  val lines=text.split("\n")
  assertEquals(5,lines.size)
  assertEquals("POST",lines[0])
  assertEquals("/v1/device-events",lines[1])
  assertEquals("1791600000",lines[2])
  assertEquals("evt_001",lines[3])
  assertEquals(64,lines[4].length)
  val other=DeviceSignatureCanonicalizer.canonical(
   "POST","/v1/device-events","1791600000","evt_001",
   "{ }".toByteArray(StandardCharsets.UTF_8))
  assertFalse(bytes.contentEquals(other))
 }
 @Test fun invalidHeaderNewlinesAndUnboundIdsAreRejected(){
  assertThrows(IllegalArgumentException::class.java){
   DeviceSignatureCanonicalizer.canonical("POST","/v1/device-events\nX:1","1791600000","evt_001",byteArrayOf())
  }
  assertThrows(IllegalArgumentException::class.java){
   DeviceSignatureCanonicalizer.canonical("POST","/v1/device-events","1791600000","evt\n001",byteArrayOf())
  }
 }
}
