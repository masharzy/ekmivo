package com.briofold.mobile.ui

import com.briofold.mobile.data.Language

enum class Page { OVERVIEW, PAYMENTS, INBOX, SETTINGS }
enum class PaymentView { REQUESTS, INCOMING, DEVICES }

data class AppCopy(
 val tagline:String,
 val subtitle:String,
 val overview:String,
 val payments:String,
 val inbox:String,
 val settings:String,
 val workspace:String,
 val chooseBusiness:String,
 val dashboardMessage:String,
 val overviewCaption:String,
 val recentPayments:String,
 val upcoming:String,
 val paymentRequests:String,
 val incoming:String,
 val devices:String,
 val noPayments:String,
 val noMessages:String,
 val noDevices:String,
 val notConnected:String,
 val pendingBackend:String,
 val startWithConnection:String,
 val support:String,
 val refresh:String,
 val appearance:String,
 val language:String,
 val system:String,
 val light:String,
 val dark:String,
 val modeHint:String,
 val apiStatus:String,
 val checking:String,
 val unreachable:String,
 val unconfigured:String,
 val notReady:String,
 val ready:String,
 val apiNote:String,
 val search:String,
 val noMatches:String,
 val profile:String,
 val english:String,
 val bangla:String,
 val permissionWarning:String,
 val getStarted:String,
 val moneyDash:String,
 val unavailable:String,
 val payout:String
) {
 fun pageName(page:Page)=when(page){
  Page.OVERVIEW->overview;Page.PAYMENTS->payments;Page.INBOX->inbox;Page.SETTINGS->settings
 }
 fun paymentName(view:PaymentView)=when(view){
  PaymentView.REQUESTS->paymentRequests;PaymentView.INCOMING->incoming;PaymentView.DEVICES->devices
 }
}
private val en=AppCopy(
 tagline="One place. Every business conversation.",subtitle="Your work, in motion.",
 overview="Overview",payments="Payments",inbox="Inbox",settings="Settings",
 workspace="WORKSPACE",chooseBusiness="No business selected",dashboardMessage="Make every payment count.",
 overviewCaption="Your payments and conversations will appear here after your business is connected.",
 recentPayments="Payment activity",upcoming="NEXT STEPS",paymentRequests="Requests",incoming="Incoming",devices="Devices",
 noPayments="No payment activity yet",noMessages="Your inbox starts here",noDevices="No receiving device connected",
 notConnected="Not connected",pendingBackend="Live payment services are not ready",
 startWithConnection="Connect your Briofold business to view real activity. Nothing shown here is simulated.",
 support="Account & support",refresh="Check connection",appearance="Appearance",language="Language",
 system="System",light="Light",dark="Dark",
 modeHint="Your preferences are saved on this device.",
 apiStatus="Service connection",checking="Checking availability",unreachable="The API cannot be reached",
 unconfigured="No API endpoint is configured",notReady="API reachable, financial services unavailable",
 ready="API reports ready",apiNote="A reachable API alone never verifies a payment.",
 search="Search conversations",noMatches="No connected conversations to search",profile="YOUR EXPERIENCE",
 english="English",bangla="বাংলা",permissionWarning="Receipt access will require explicit consent and enrollment. No SMS or notifications are read by this build.",
 getStarted="Connection status",moneyDash="—",unavailable="Not available",payout="Payment requests and verified receipts will appear from the Go service."
)
private val bn=AppCopy(
 tagline="সব ব্যবসার কথোপকথন, এক জায়গায়।",subtitle="কাজ চলুক নিজের গতিতে।",
 overview="ওভারভিউ",payments="পেমেন্ট",inbox="ইনবক্স",settings="সেটিংস",
 workspace="ওয়ার্কস্পেস",chooseBusiness="কোনো ব্যবসা নির্বাচন করা হয়নি",dashboardMessage="প্রতিটি পেমেন্টের সঠিক হিসাব।",
 overviewCaption="ব্যবসা সংযুক্ত হলে এখানে প্রকৃত পেমেন্ট ও কথোপকথন দেখা যাবে।",
 recentPayments="পেমেন্ট কার্যক্রম",upcoming="পরবর্তী ধাপ",paymentRequests="রিকোয়েস্ট",incoming="প্রাপ্তি",devices="ডিভাইস",
 noPayments="এখনো পেমেন্ট কার্যক্রম নেই",noMessages="তোমার ইনবক্স এখানে শুরু হবে",noDevices="কোনো রিসিভিং ডিভাইস যুক্ত নেই",
 notConnected="সংযুক্ত নয়",pendingBackend="লাইভ পেমেন্ট সেবা এখনো প্রস্তুত নয়",
 startWithConnection="বাস্তব তথ্য দেখতে Briofold ব্যবসা সংযুক্ত করতে হবে। এখানে কোনো নমুনা লেনদেন দেখানো হচ্ছে না।",
 support="অ্যাকাউন্ট ও সহায়তা",refresh="কানেকশন পরীক্ষা",appearance="অ্যাপের রঙ",language="ভাষা",
 system="সিস্টেম",light="লাইট",dark="ডার্ক",
 modeHint="পছন্দের সেটিংস এই ডিভাইসে সংরক্ষিত থাকবে।",
 apiStatus="সার্ভিস কানেকশন",checking="সংযোগ যাচাই চলছে",unreachable="API-তে সংযোগ করা যাচ্ছে না",
 unconfigured="কোনো API endpoint সেট করা হয়নি",notReady="API চলছে, কিন্তু পেমেন্ট সেবা প্রস্তুত নয়",
 ready="API প্রস্তুত জানিয়েছে",apiNote="শুধু API চালু থাকলেই কোনো পেমেন্ট verified হয় না।",
 search="কথোপকথন খুঁজুন",noMatches="খোঁজার মতো কোনো সংযুক্ত কথোপকথন নেই",profile="তোমার অ্যাপ",
 english="English",bangla="বাংলা",permissionWarning="Receipt access-এর জন্য আলাদা consent ও device enrollment লাগবে। এই build কোনো SMS/notification পড়ছে না।",
 getStarted="সংযোগের অবস্থা",moneyDash="—",unavailable="এখনো চালু হয়নি",payout="Go সার্ভিসের verified receipt ও payment request এখানে দেখা যাবে।"
)
fun copyFor(language:Language):AppCopy=if(language==Language.BN)bn else en
