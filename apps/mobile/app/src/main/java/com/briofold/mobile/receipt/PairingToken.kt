package com.briofold.mobile.receipt

import java.util.Locale

/** Current phone pairing code: eight unambiguous random characters. */
object PairingToken {
 const val LENGTH = 8
 private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
 private val capability = Regex("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$")

 fun normalize(input: String): String =
  input.trim().filter { it.isLetterOrDigit() }
   .uppercase(Locale.ROOT)
   .filter { it in ALPHABET }
   .take(LENGTH)

 fun parse(input: String): String? {
  val text = input.trim()
  val raw = if (text.startsWith("briofold://pair?")) {
   if (!text.startsWith("briofold://pair?token=")) return null
   text.removePrefix("briofold://pair?token=")
  } else text
  return raw.takeIf { capability.matches(it) }
 }
}
