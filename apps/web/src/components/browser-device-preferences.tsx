"use client";

import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import styles from "./browser-device-preferences.module.css";

type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
const soundKey="ekmivo:device:notification-sound:v1";

export function BrowserDevicePreferences({bn}:{bn:boolean}){
 const t=(en:string,be:string)=>bn?be:en;
 const [sound,setSound]=useState(false),[saved,setSaved]=useState(false);
 const [permission,setPermission]=useState<NotificationPermission|"unavailable">("unavailable");
 const [secure,setSecure]=useState(false),[installed,setInstalled]=useState(false);
 const [canInstall,setCanInstall]=useState(false),[installStatus,setInstallStatus]=useState("");
 const [error,setError]=useState("");
 const installer=useRef<InstallEvent|null>(null);
 useEffect(()=>{
  queueMicrotask(()=>{
   try{setSound(window.localStorage.getItem(soundKey)==="on");setSaved(true);}catch{setSaved(false);}
   setSecure(window.isSecureContext);
   setPermission("Notification" in window?Notification.permission:"unavailable");
   setInstalled(window.matchMedia("(display-mode: standalone)").matches||("standalone" in navigator&&Boolean((navigator as Navigator&{standalone?:boolean}).standalone)));
  });
  if(window.isSecureContext&&"serviceWorker" in navigator){
   void navigator.serviceWorker.register("/ekmivo-pwa-sw.js",{scope:"/"}).catch(()=>{
    setInstallStatus(bn?"এই ব্রাউজারে ইনস্টল সাপোর্ট প্রস্তুত করা যায়নি।":"Installation support could not be prepared in this browser.");
   });
  }
  const handleInstall=(event:Event)=>{event.preventDefault();installer.current=event as InstallEvent;setCanInstall(true);};
  const handleInstalled=()=>{installer.current=null;setCanInstall(false);setInstalled(true);setInstallStatus("");};
  window.addEventListener("beforeinstallprompt",handleInstall);
  window.addEventListener("appinstalled",handleInstalled);
  return()=>{window.removeEventListener("beforeinstallprompt",handleInstall);window.removeEventListener("appinstalled",handleInstalled);installer.current=null;};
 },[bn]);
 const toggle=(next:boolean)=>{
  setError("");
  try{window.localStorage.setItem(soundKey,next?"on":"off");setSound(next);setSaved(true);}
  catch{setSaved(false);setError(t("This browser prevented saving the preference.","এই ব্রাউজারে পছন্দ সংরক্ষণ করা যায়নি।"));}
 };
 const play=async()=>{
  setError("");
  try{
   const audioWindow=window as Window&{webkitAudioContext?:typeof AudioContext};
   const Constructor=window.AudioContext||audioWindow.webkitAudioContext;
   if(!Constructor)throw Error("AUDIO_UNAVAILABLE");
   const audio=new Constructor();
   try{
    await audio.resume();
    const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime;
    oscillator.type="sine";oscillator.frequency.setValueAtTime(660,start);
    oscillator.frequency.setValueAtTime(880,start+0.09);
    gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.08,start+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001,start+0.23);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+0.24);
    await new Promise<void>(resolve=>{oscillator.onended=()=>resolve();});
   }finally{await audio.close();}
  }catch{setError(t("Sound preview is unavailable on this browser.","এই ব্রাউজারে সাউন্ড শোনা যাচ্ছে না।"));}
 };
 const requestPermission=async()=>{
  setError("");
  try{setPermission(await Notification.requestPermission());}
  catch{setError(t("Browser notification permission could not be requested.","ব্রাউজার নোটিফিকেশনের অনুমতি চাওয়া যায়নি।"));}
 };
 const install=async()=>{
  const event=installer.current;if(!event)return;
  installer.current=null;setCanInstall(false);
  try{await event.prompt();const choice=await event.userChoice;
   setInstallStatus(choice.outcome==="accepted"?t("Installation requested; wait for your browser to confirm.","ইনস্টল অনুরোধ হয়েছে; ব্রাউজারের নিশ্চিতকরণের জন্য অপেক্ষা করুন।"):t("Installation cancelled. Your browser may offer it again later.","ইনস্টল বাতিল হয়েছে। ব্রাউজার পরে আবার সুযোগ দিতে পারে।"));
  }catch{setInstallStatus(t("The install prompt was unavailable.","ইনস্টল অপশন পাওয়া যায়নি।"));}
 };
 return <section className={styles.root}>
  <header><p className={styles.eyebrow}>{t("This browser only","শুধু এই ব্রাউজার")}</p><h1>{t("Device & notification preferences","ডিভাইস ও নোটিফিকেশন পছন্দ")}</h1><p>{t("Local settings are stored in this browser, not in your Business profile. Other devices keep their own settings.","এই পছন্দগুলো শুধু এই ব্রাউজারে থাকে; ব্যবসা প্রোফাইলে নয়। অন্য ডিভাইসের পছন্দ আলাদা থাকবে।")}</p></header>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  <div className={styles.grid}>
   <section className={styles.card} aria-label={t("Sound preferences","সাউন্ড পছন্দ")}>
    <h2>{t("Notification sound","নোটিফিকেশনের সাউন্ড")}</h2>
    <label className={styles.toggle}><input type="checkbox" checked={sound} onChange={event=>toggle(event.target.checked)} disabled={!saved}/>{t("Allow a sound in this browser when a connected notification feature explicitly plays one","কোনো সংযুক্ত নোটিফিকেশন ফিচার সাউন্ড চালালে এই ব্রাউজারে অনুমতি দিন")}</label>
    <button type="button" onClick={()=>void play()}>{t("Test sound","সাউন্ড শুনুন")}</button>
    <p>{t("This does not activate push, background delivery, or automatic sounds. Audio requires browser support and an interaction.","এতে পুশ, ব্যাকগ্রাউন্ড ডেলিভারি বা স্বয়ংক্রিয় সাউন্ড চালু হয় না। সাউন্ডে ব্রাউজার সাপোর্ট ও ব্যবহারকারীর ক্লিক লাগে।")}</p>
   </section>
   <section className={styles.card} aria-label={t("Browser permission","ব্রাউজার অনুমতি")}>
    <h2>{t("Browser notifications","ব্রাউজার নোটিফিকেশন")}</h2>
    <p>{t("Browser permission:","ব্রাউজার অনুমতি:")} <strong>{permission}</strong></p>
    {secure&&permission==="default"&&<button type="button" onClick={()=>void requestPermission()}>{t("Ask this browser for permission","ব্রাউজারের অনুমতি চান")}</button>}
    {!secure&&<p role="status">{t("A secure HTTPS context is required.","নিরাপদ HTTPS সংযোগ প্রয়োজন।")}</p>}
    <p>{t("No push subscription or remote notification sender is configured by this setting. Permission alone never means a notification has been sent.","এই পছন্দে কোনো পুশ সাবস্ক্রিপশন বা দূরবর্তী প্রেরক যুক্ত হয় না। অনুমতি পাওয়া মানে নোটিফিকেশন পাঠানো হয়েছে—এমন নয়।")}</p>
   </section>
   <section className={styles.card} aria-label={t("App installation","অ্যাপ ইনস্টল")}>
    <h2>{t("Install on this device","এই ডিভাইসে ইনস্টল")}</h2>
    <p role="status">{installed?t("App display mode is active.","অ্যাপ মোড চালু আছে।"):canInstall?t("Your browser offers installation.","আপনার ব্রাউজারে ইনস্টল করা যাবে।"):t("No installation prompt is available here. Browser support, HTTPS and eligibility vary.","এখানে ইনস্টল করার অপশন পাওয়া যায়নি। ব্রাউজার, HTTPS ও যোগ্যতার ওপর নির্ভর করে।")}</p>
    {canInstall&&<button type="button" onClick={()=>void install()}>{t("Install app","অ্যাপ ইনস্টল")}</button>}
    {installStatus&&<p role="status">{installStatus}</p>}
    <p>{t("Installing provides a home-screen window; it does not enable offline financial data, push delivery or device pairing.","ইনস্টল করলে হোমস্ক্রিনে অ্যাপ উইন্ডো পাওয়া যেতে পারে; অফলাইন আর্থিক তথ্য, পুশ ডেলিভারি বা ডিভাইস-পেয়ারিং চালু হয় না।")}</p>
   </section>
   <section className={styles.card} aria-label={t("Session security","সেশনের নিরাপত্তা")}>
    <h2>{t("Account sessions","অ্যাকাউন্ট সেশন")}</h2>
    <p>{t("Manage your real signed-in sessions and security settings in the account center. This page never claims to list or revoke other devices.","আসল লগইন সেশন ও নিরাপত্তা সেটিংস অ্যাকাউন্ট সেন্টারে দেখুন। এই পৃষ্ঠা অন্য ডিভাইস দেখানো বা বন্ধ করার দাবি করে না।")}</p>
    <Link href="/account">{t("Open account security","অ্যাকাউন্টের নিরাপত্তা খুলুন")}</Link>
    <Link href="/settings/devices">{t("Manage linked payment or chat devices","পেমেন্ট বা চ্যাটে সংযুক্ত ডিভাইস দেখুন")}</Link>
   </section>
  </div>
 </section>;
}
