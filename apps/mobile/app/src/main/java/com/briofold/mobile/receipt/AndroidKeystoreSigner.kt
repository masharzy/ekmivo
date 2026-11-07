package com.briofold.mobile.receipt

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Device-bound P-256 signer. Create only after user-approved device enrollment.
 * This provides provenance from the enrolled device, NOT proof of a provider payment.
 * Enroll its public X.509 key through the future authorized Go pairing API.
 */
class AndroidKeystoreSigner(private val keyAlias:String) {
 init { require(keyAlias.matches(Regex("[a-zA-Z0-9._-]{1,128}"))) }
 private fun store()=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
 fun ensurePublicKey():ByteArray {
  val keyStore=store()
  val existing=keyStore.getCertificate(keyAlias)
  if(existing!=null)return existing.publicKey.encoded.copyOf()
  val generator=KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC,"AndroidKeyStore")
  val spec=KeyGenParameterSpec.Builder(keyAlias,KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
   .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
   .setDigests(KeyProperties.DIGEST_SHA256)
   .setUserAuthenticationRequired(false)
   .build()
  generator.initialize(spec)
  generator.generateKeyPair()
  return requireNotNull(store().getCertificate(keyAlias)).publicKey.encoded.copyOf()
 }
 fun signCanonical(canonicalBytes:ByteArray):String {
  val key=requireNotNull(store().getKey(keyAlias,null)) {
   "Device key is not enrolled"
  }
  val signature=Signature.getInstance("SHA256withECDSA")
  signature.initSign(key as java.security.PrivateKey)
  signature.update(canonicalBytes)
  return Base64.encodeToString(signature.sign(),Base64.NO_WRAP)
 }
 fun forgetEnrollmentKey(){
  // Must be called only after explicit device disconnect/revocation flow.
  store().deleteEntry(keyAlias)
 }
}
