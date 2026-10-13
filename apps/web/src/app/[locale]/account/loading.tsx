"use client";
import {useInterfaceLocale} from "../../../components/interface-locale-provider";
export default function AccountLoading(){
 const bn=useInterfaceLocale()==="bn";
 return <main role="status" aria-busy="true" className="ds-route-loading">
  <p className="ek-page-kicker">EKMIVO / ACCOUNT</p><h1>{bn?"অ্যাকাউন্ট লোড হচ্ছে…":"Loading account…"}</h1>
  <div className="ds-loading-skeleton" aria-hidden="true"><span/><span/></div>
 </main>;
}
