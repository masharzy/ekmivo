export type SecurityCodePurpose="verify_email"|"reset_password";
export function securityEmail(code:string,purpose:SecurityCodePurpose,locale:"en"|"bn"="en"){
 if(!/^\d{6}$/.test(code))throw Error("INVALID_SECURITY_CODE");
 const bn=locale==="bn",verify=purpose==="verify_email";
 const title=bn?(verify?"Ekmivo ইমেইল যাচাই করুন":"Ekmivo পাসওয়ার্ড পুনরুদ্ধার"):(verify?"Verify your Ekmivo email":"Reset your Ekmivo password");
 const instruction=bn?"আপনার নিরাপত্তা কোড":"Your security code";
 const note=bn?"এই কোড ১০ মিনিট কার্যকর থাকবে। কাউকে কোডটি দেবেন না। অনুরোধটি আপনি না করলে এই ইমেইল উপেক্ষা করুন।":"This code expires in 10 minutes. Never share it. If you did not request this, ignore this email.";
 return {subject:title,text:`${title}\n\n${instruction}: ${code}\n\n${note}`,html:`<!doctype html><html lang="${locale}"><body style="margin:0;background:#fcfbf6;color:#17233b;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:520px;margin:auto;padding:32px 20px"><tr><td><strong style="font-size:22px">ekmivo.</strong><h1 style="font-size:22px;line-height:1.5;margin-top:32px">${title}</h1><p>${instruction}</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#fff0ad;padding:20px;border-radius:8px">${code}</p><p style="font-size:14px;line-height:1.8;color:#526079">${note}</p></td></tr></table></body></html>`};
}
