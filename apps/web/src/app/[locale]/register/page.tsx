import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthForm } from "../../../components/auth-form";
import {currentUser} from "../../../lib/server/auth";
import {redirect} from "next/navigation";
export const dynamic="force-dynamic";

export const metadata: Metadata = { title: "Create account | Ekmivo" };

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "bn" && locale !== "en") notFound();
  if(await currentUser())redirect("/workspaces/open");
  return <AuthForm locale={locale} mode="register" />;
}
