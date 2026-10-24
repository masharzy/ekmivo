"use client";
import {useEffect,useRef,useState} from "react";

type BarcodeHit={rawValue:string};
type Detector={detect(source:HTMLVideoElement):Promise<BarcodeHit[]>};
type BarcodeProvider=typeof globalThis&{BarcodeDetector?:new(options:{formats:string[]})=>Detector};

export function OrderBarcodeScanner({bn,disabled,onDetected}:{bn:boolean;disabled:boolean;onDetected:(value:string)=>void}){
 const [active,setActive]=useState(false),[error,setError]=useState("");
 const streamRef=useRef<MediaStream|null>(null),videoRef=useRef<HTMLVideoElement|null>(null),detectorRef=useRef<Detector|null>(null);
 const cameraRef=useRef(false),mountedRef=useRef(false),rafRef=useRef<number|null>(null),callback=useRef(onDetected);
 useEffect(()=>{callback.current=onDetected;},[onDetected]);
 const t=(en:string,be:string)=>bn?be:en;
 const stop=()=>{
  cameraRef.current=false;
  if(rafRef.current!==null)cancelAnimationFrame(rafRef.current);
  rafRef.current=null;
  for(const track of streamRef.current?.getTracks()??[])track.stop();
  streamRef.current=null;detectorRef.current=null;
  if(videoRef.current)videoRef.current.srcObject=null;
  setActive(false);
 };
 useEffect(()=>{mountedRef.current=true;return ()=>{mountedRef.current=false;cameraRef.current=false;
  if(rafRef.current!==null)cancelAnimationFrame(rafRef.current);
  for(const track of streamRef.current?.getTracks()??[])track.stop();};},[]);
 useEffect(()=>{
  if(!active)return;
  const video=videoRef.current,stream=streamRef.current,detector=detectorRef.current;
  if(!video||!stream||!detector)return;
  video.srcObject=stream;
  let inFlight=false,disposed=false;
  const tick=()=>{
   if(disposed||!cameraRef.current)return;
   if(inFlight){rafRef.current=requestAnimationFrame(tick);return;}
   inFlight=true;
   void detector.detect(video).then(hits=>{
    const value=hits[0]?.rawValue?.trim();
    if(value&&value.length<=100&&cameraRef.current){stop();callback.current(value);}
   }).catch(()=>{/* A blurred frame or unsupported format is not a scan. */})
    .finally(()=>{inFlight=false;if(!disposed&&cameraRef.current)rafRef.current=requestAnimationFrame(tick);});
  };
  void video.play().then(()=>{if(cameraRef.current&&!disposed)rafRef.current=requestAnimationFrame(tick);})
   .catch(()=>{setError("CAMERA_PLAY_DENIED");stop();});
  return ()=>{disposed=true;if(rafRef.current!==null)cancelAnimationFrame(rafRef.current);};
 },[active]);
 const start=async()=>{
  setError("");
  const Engine=(globalThis as BarcodeProvider).BarcodeDetector;
  if(!Engine||!navigator.mediaDevices?.getUserMedia){setError("SCANNER_UNSUPPORTED");return;}
  let detector:Detector;
  try{detector=new Engine({formats:["code_128","code_39","ean_13","ean_8","upc_a","upc_e","itf","qr_code"]});}
  catch{setError("SCANNER_UNSUPPORTED");return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"}}});
   if(disabled||!mountedRef.current){stream.getTracks().forEach(track=>track.stop());return;}
   streamRef.current=stream;detectorRef.current=detector;cameraRef.current=true;setActive(true);
  }catch{setError("CAMERA_PERMISSION_DENIED");}
 };
 return <div aria-label={t("Camera barcode scanner","ক্যামেরা বারকোড স্ক্যানার")}>
  <p>{t("Use a USB/Bluetooth barcode scanner in the search field, or scan with a supported camera. No order is marked packed or paid automatically.","সার্চ ঘরে USB/Bluetooth স্ক্যানার ব্যবহার করুন অথবা সমর্থিত ক্যামেরায় স্ক্যান করুন। অর্ডার স্বয়ংক্রিয়ভাবে প্যাক বা পেইড হবে না।")}</p>
  {active?<><video ref={videoRef} muted playsInline autoPlay aria-label={t("Barcode camera preview","বারকোড ক্যামেরা")} style={{maxWidth:"100%",width:320,borderRadius:12}}/><button type="button" onClick={stop}>{t("Stop camera","ক্যামেরা বন্ধ করুন")}</button></>
   :<button type="button" disabled={disabled} onClick={()=>void start()}>{t("Scan with camera","ক্যামেরা দিয়ে স্ক্যান")}</button>}
  {error&&<p role="alert">{error==="SCANNER_UNSUPPORTED"?t("Camera barcode recognition is not supported here. Enter or scan the code in the search field.","এই ব্রাউজারে ক্যামেরা স্ক্যান সমর্থিত নয়। সার্চ ঘরে কোড লিখুন বা স্ক্যান করুন।")
   :t("Camera permission or preview unavailable. Manual barcode search remains available.","ক্যামেরা চালু হয়নি। ম্যানুয়াল বারকোড সার্চ চালু আছে।")}</p>}
 </div>;
}
