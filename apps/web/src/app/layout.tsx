import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import {InterfaceLocaleProvider} from "../components/interface-locale-provider";

const hindSiliguri = localFont({
  src: [
    { path: "../fonts/HindSiliguri-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/HindSiliguri-Medium.ttf", weight: "500", style: "normal" },
    { path: "../fonts/HindSiliguri-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../fonts/HindSiliguri-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-hind-siliguri",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ekmivo — Conversations and commerce, together",
  description: "A clearer workspace for customer conversations, AI assistance, orders and automatic payment verification.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-ekmivo-locale") === "en" ? "en" : "bn";
  const theme = requestHeaders.get("cookie")?.match(/(?:^|;\s*)ekmivo-theme=(light|dark)(?:;|$)/)?.[1];
  return <html lang={locale} data-theme={theme} className={hindSiliguri.variable} suppressHydrationWarning><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet"/></head><body><InterfaceLocaleProvider locale={locale}>{children}</InterfaceLocaleProvider></body></html>;
}
