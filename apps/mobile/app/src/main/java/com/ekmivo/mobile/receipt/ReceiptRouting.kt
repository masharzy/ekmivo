package com.ekmivo.mobile.receipt

/**
 * A source/SIM maps only when exactly one approved enrolled source matches.
 * SMS originatingAddress is the source identity, NOT the actual payer.
 * Financial matching belongs to Go.
 */
data class ReceiptRoute(val enrollmentId:String,val source:String,val binding:String,val approvedPattern:String)
sealed interface RouteDecision {
 data class Selected(val enrollmentId:String):RouteDecision
 data object None:RouteDecision
 data object Ambiguous:RouteDecision
}
object ReceiptRouting{
 fun choose(routes:List<ReceiptRoute>,source:String,binding:String,evidence:String):RouteDecision {
  val matches=routes.filter { rule->
   rule.source==source&&rule.binding==binding&&rule.approvedPattern.length in 1..2048&&try{
    Regex(rule.approvedPattern).matches(evidence)
   }catch(_:IllegalArgumentException){false}
  }
  return when(matches.size){
   0->RouteDecision.None
   1->RouteDecision.Selected(matches.single().enrollmentId)
   else->RouteDecision.Ambiguous
  }
 }
 fun queuedEnrollmentId(eventEnrollmentId:String,availableIds:Set<String>):String? =
  eventEnrollmentId.takeIf{availableIds.contains(it)}
 // Unknown/removed associations stay encrypted and unacknowledged; never
 // redirect pending evidence to another account even if a new mapping exists.
}
