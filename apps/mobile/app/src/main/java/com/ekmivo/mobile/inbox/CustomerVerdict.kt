package com.ekmivo.mobile.inbox

data class CustomerVerdict(val key:String,val rate:Int?,val completed:Int) {
 companion object {
  fun from(ok:Int,cancelled:Int,returned:Int,running:Int,talks:Int):CustomerVerdict {
   require(listOf(ok,cancelled,returned,running,talks).all{it>=0})
   val done=ok+cancelled+returned
   val rate=if(done>0)kotlin.math.floor(ok.toDouble()/done*100+0.5).toInt() else null
   val key=when {
    done+running==0&&talks<=1->"new"
    done+running==0&&talks>=4->"frequent"
    done+running==0->"neutral"
    done==0->"first"
    done<3&&rate==100->"start"
    done<3->"caution"
    rate!!>=85->"trusted"
    rate>=60->"average"
    else->"risk"
   }
   return CustomerVerdict(key,rate,done)
  }
 }
 fun label(bn:Boolean)=when(key){
  "new"->if(bn)"নতুন কাস্টমার" else "New customer"
  "frequent"->if(bn)"অনেকবার জিজ্ঞেস করেছেন, কেনেননি" else "Asked often, has not purchased"
  "neutral"->if(bn)"এখনো কেনেননি" else "Has not purchased yet"
  "first"->if(bn)"প্রথম অর্ডার চলছে" else "First order in progress"
  "start"->if(bn)"নতুন, কিন্তু ভালো শুরু" else "New, with a good start"
  "caution"->if(bn)"সতর্ক থাকুন" else "Use caution"
  "trusted"->if(bn)"ভরসাযোগ্য কাস্টমার" else "Reliable customer"
  "average"->if(bn)"মাঝারি কাস্টমার" else "Mixed order history"
  else->if(bn)"ঝুঁকিপূর্ণ কাস্টমার" else "High cancellation or return rate"
 }
}
