export type Locale = "bn" | "en";

export const siteCopy = {
 en: {
  nav: {services:"Services",workflow:"How it works",principles:"Payment checks",ai:"AI workspace",commerce:"Payments",pricing:"Pricing",solutions:"Who it's for",faq:"FAQ"},
  login:"Sign in", register:"Create account", theme:"Theme", language:"Language", menu:"Open menu", closeMenu:"Close menu",
  footerLine:"Payment links, checkout and evidence-based verification. AI Bot is coming later.",
  footerStatus:"Service availability", rights:"All rights reserved.",
 },
 bn: {
  nav: {services:"সেবাগুলো",workflow:"কীভাবে কাজ করে",principles:"পেমেন্ট যাচাই",ai:"AI সেবা",commerce:"পেমেন্ট",pricing:"প্যাকেজ",solutions:"যাদের জন্য",faq:"প্রশ্ন ও উত্তর"},
  login:"Sign in",register:"অ্যাকাউন্ট তৈরি করুন",theme:"থিম",language:"ভাষা",menu:"মেনু খুলুন",closeMenu:"মেনু বন্ধ করুন",
  footerLine:"পেমেন্ট লিংক, ইনভয়েস ও চেকআউটের সুবিধা। AI Bot-এর কাজ শুরু হবে শিগগিরই।",
  footerStatus:"সেবার অবস্থা", rights:"সর্বস্বত্ব সংরক্ষিত।",
 }
} as const;
