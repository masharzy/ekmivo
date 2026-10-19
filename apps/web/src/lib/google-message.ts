export function googleMessage(reason:string|undefined,bn:boolean){
 const messages:Record<string,[string,string]>={
  "link-required":["This email already has an account. Sign in with your password, then connect Google in Account settings.","এই ইমেইলে অ্যাকাউন্ট আছে। পাসওয়ার্ড দিয়ে লগইন করে অ্যাকাউন্ট সেটিংস থেকে Google যুক্ত করুন।"],
  reauth:["Sign in again, verify your email, then connect Google within 10 minutes.","আবার লগইন করে ইমেইল যাচাই করুন। তারপর ১০ মিনিটের মধ্যে Google যুক্ত করুন।"],
  "email-mismatch":["Choose the Google account with the same email as your Ekmivo account.","আপনার Ekmivo অ্যাকাউন্টের একই ইমেইলের Google অ্যাকাউন্ট বেছে নিন।"],
  "email-signup":["Create an account with your email and password, verify the email, then connect Google in Account settings.","ইমেইল ও পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খুলে ইমেইল যাচাই করুন। তারপর অ্যাকাউন্ট সেটিংসে Google যুক্ত করুন।"],
  cancelled:["Google sign-in was cancelled. You can try again.","Google লগইন বাতিল হয়েছে। আবার চেষ্টা করতে পারেন।"],
  unavailable:["Google sign-in is not configured yet. Use your email and password.","Google লগইন এখনো সেটআপ হয়নি। ইমেইল ও পাসওয়ার্ড ব্যবহার করুন।"],
  failed:["Google sign-in could not be completed. Try again or use your email and password.","Google লগইন সম্পন্ন হয়নি। আবার চেষ্টা করুন অথবা ইমেইল ও পাসওয়ার্ড ব্যবহার করুন।"],
  connected:["Google is connected. You can now use it to sign in.","Google যুক্ত হয়েছে। এখন Google দিয়ে লগইন করতে পারবেন।"]
 };
 return reason&&messages[reason]?messages[reason][bn?1:0]:"";
}
