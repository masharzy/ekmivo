"use client";
import Link from "next/link";
import {useInterfaceLocale} from "../../../../../../components/interface-locale-provider";
export default function WorkspaceUnavailable(){
 const locale=useInterfaceLocale(),bn=locale==="bn";
 return <main className="ds-route-error">
  <span className="ds-error-eyebrow">EKMIVO / ACCESS</span>
  <h1>{bn?"এই পেজটি ব্যবহার করার অনুমতি নেই":"This page or environment is unavailable"}</h1>
  <p>{bn?"এই ওয়ার্কস্পেস বা সেবাটি আপনার জন্য চালু নেই। অন্য ব্যবসার তথ্য এখানে দেখানো হবে না।":"Your access to this workspace or product could not be confirmed. No other business data is exposed."}</p>
  <Link className="ds-route-retry" href="/workspaces">{bn?"নিজের ব্যবসাগুলো দেখুন":"Open your businesses"} ↗</Link>
 </main>;
}
