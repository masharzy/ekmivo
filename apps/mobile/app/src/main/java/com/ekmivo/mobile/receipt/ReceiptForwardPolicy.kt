package com.ekmivo.mobile.receipt

/** Source allowlist + payment-message guard. This is NOT financial validation. */
object ReceiptForwardPolicy{
 fun likelyPayment(sender:String,body:String):Boolean {
  val origin=sender.trim().lowercase()
  if(origin !in setOf("bkash","nagad","rocket"))return false
  val text=body.trim().lowercase()
  if(text.length<22||body.toByteArray(Charsets.UTF_8).size>6000)return false
  return (text.contains("received")||text.contains("cash in")) &&
   (text.contains("tk ")||text.contains("amount:")) &&
   (text.contains(" from ")||text.contains("sender")||
    text.contains("trx")||text.contains("txn")||text.contains("uddokta"))
 }
}
