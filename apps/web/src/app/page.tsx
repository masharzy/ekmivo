import {redirect} from "next/navigation";
// Normally rewritten to /[locale] by proxy.ts; safe fallback on direct execution.
export default function Home(){redirect("/bn");}
