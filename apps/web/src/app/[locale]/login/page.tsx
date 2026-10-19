import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthForm } from "../../../components/auth-form";
import {currentUser} from "../../../lib/server/auth";
import {redirect} from "next/navigation";
import {googleConfiguration} from "../../../lib/google-oidc";
import {googleMessage} from "../../../lib/google-message";
export const dynamic="force-dynamic";

export const metadata: Metadata = { title: "Log in | Ekmivo" };

export default async function LoginPage({ params,searchParams }: { params: Promise<{ locale: string }>;searchParams:Promise<{google?:string}> }) {
  const { locale } = await params;
  if (locale !== "bn" && locale !== "en") notFound();
  if(await currentUser())redirect("/workspaces/open");
  return <AuthForm locale={locale} mode="login" googleReady={!!googleConfiguration()} googleNotice={googleMessage((await searchParams).google,locale==="bn")} />;
}
