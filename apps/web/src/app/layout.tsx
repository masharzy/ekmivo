import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "@fontsource-variable/geist";
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

// Bundle the same Latin families used by the storefront and dashboard.
// next/font/google performs network requests *during the production build*;
// a temporary Google Fonts response error must not prevent a verified release.
const outfit = localFont({
  src: "../../node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2",
  weight: "100 900", variable: "--font-outfit", display: "swap",
});
const figtree = localFont({
  src: "../../node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
  weight: "300 900", variable: "--font-figtree", display: "swap",
});

export const metadata: Metadata = {
  title: "Ekmivo — Conversations and commerce, together",
  description: "A clearer workspace for customer conversations, AI assistance, orders and automatic payment verification.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const cookieLocale = requestHeaders.get("cookie")?.match(/(?:^|;\s*)ekmivo-locale=(en|bn)(?:;|$)/)?.[1];
  const locale = requestHeaders.get("x-ekmivo-locale") === "en" ? "en" : requestHeaders.get("x-ekmivo-locale") === "bn" ? "bn" : cookieLocale === "bn" ? "bn" : "en";
  const theme = requestHeaders.get("cookie")?.match(/(?:^|;\s*)ekmivo-theme=(light|dark)(?:;|$)/)?.[1];
  return <html lang={locale} data-theme={theme} className={`${hindSiliguri.variable} ${outfit.variable} ${figtree.variable}`} suppressHydrationWarning><body><InterfaceLocaleProvider locale={locale}>{children}</InterfaceLocaleProvider></body></html>;
}
