"use client";
import {useActionState} from "react";
import Link from "next/link";
import {loginAction} from "../actions/account";
import {emptyState} from "../lib/server/validation";
export function AdminSignInForm({locale}:{locale:"en"|"bn"}){
 const bn=locale==="bn";
 const [state,action,pending]=useActionState(loginAction.bind(null,locale),emptyState);
 return <main className="pa-mfa-screen pa-admin-design"><div className="pa-mfa-card">
 <div className="pa-mfa-logo">ekmivo <small>Admin</small></div>
 <h1>{bn?"অ্যাডমিন সাইন ইন":"Admin sign in"}</h1>
 <p style={{textAlign:"center"}}>{bn?"আপনার Ekmivo অ্যাকাউন্ট ব্যবহার করুন।":"Use your Ekmivo account."}</p>
 <form action={action}><input type="hidden" name="admin" value="1"/>
 <label>{bn?"ইমেইল":"Email"}<input type="email" name="email" required autoComplete="email" maxLength={254} autoFocus/></label>
 <label>{bn?"পাসওয়ার্ড":"Password"}<input type="password" name="password" required autoComplete="current-password" maxLength={256}/></label>
 <button type="submit" disabled={pending}>{pending?"…":bn?"সাইন ইন":"Sign in"}</button>
 {state.status==="error"&&<p role="alert" className="pa-mfa-errors">{state.message}</p>}
 </form>
 <Link className="pa-mfa-link" href={"/"+locale+"/forgot-password"}>{bn?"পাসওয়ার্ড ভুলে গেছেন?":"Forgot password?"}</Link>
 <Link className="pa-mfa-link" href={"/"+locale+"/workspaces"}>{bn?"মার্চেন্ট ড্যাশবোর্ড":"Back to merchant dashboard"}</Link>
 </div></main>;
}
