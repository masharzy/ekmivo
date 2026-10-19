export function billingPaymentMessage(status:string,bn:boolean){
 const messages:Record<string,[string,string]>={
  paid:['Payment verified. Your subscription is up to date.','পেমেন্ট যাচাই হয়েছে। সাবস্ক্রিপশন হালনাগাদ আছে।'],
  cancelled:['This checkout was cancelled. No payment has been verified. If you sent money, contact support before paying again.','চেকআউটটি বাতিল হয়েছে। পেমেন্ট যাচাই হয়নি। টাকা পাঠিয়ে থাকলে আবার পরিশোধের আগে সহায়তা নিন।'],
  expired:['This checkout expired. No payment has been verified. If you sent money, contact support before paying again.','চেকআউটের সময় শেষ। পেমেন্ট যাচাই হয়নি। টাকা পাঠিয়ে থাকলে আবার পরিশোধের আগে সহায়তা নিন।'],
  exception:['This payment needs review. Contact support before paying again.','পেমেন্টটি পর্যালোচনা প্রয়োজন। আবার পরিশোধের আগে সহায়তা নিন।'],
  not_created:['Checkout did not start. No payment has been verified.','চেকআউট শুরু হয়নি। কোনো পেমেন্ট যাচাই হয়নি।'],
  requires_payer:['Payment has not been completed. Your plan has not changed.','পেমেন্ট সম্পন্ন হয়নি। আপনার প্ল্যান বদলায়নি।'],
  awaiting_payment:['Payment has not been verified yet. Check again shortly.','পেমেন্ট এখনো যাচাই হয়নি। কিছুক্ষণ পর আবার দেখুন।'],
 };
 return (messages[status]??['Payment status is unavailable. Try again shortly.','পেমেন্টের অবস্থা পাওয়া যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।'])[bn?1:0];
}
export function billingPaymentError(code:string,bn:boolean){
 if(code==='VERIFIED_PLATFORM_PAYMENT_REQUIRED')return billingPaymentMessage('awaiting_payment',bn);
 if(code==='BILLING_STATE_CHANGED')return billingPaymentMessage('exception',bn);
 if(code==='PLATFORM_RECEIVING_UNAVAILABLE')return bn?'Ekmivo-র পেমেন্ট সেবা এখন প্রস্তুত নয়। কিছুক্ষণ পর আবার চেষ্টা করুন।':'Ekmivo payment service is unavailable. Try again shortly.';
 return billingPaymentMessage('unavailable',bn);
}
