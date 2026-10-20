"use client";

import {createContext,useContext} from "react";

// The public URL intentionally does not carry /bn or /en. Read the locale
// resolved by proxy.ts in the server root layout and share it with every
// client-side loading/error boundary. Do not infer language from usePathname().
export type InterfaceLocale="bn"|"en";
const InterfaceLocaleContext=createContext<InterfaceLocale>("en");

export function InterfaceLocaleProvider({locale,children}:{locale:InterfaceLocale;children:React.ReactNode}){
 return <InterfaceLocaleContext.Provider value={locale}>{children}</InterfaceLocaleContext.Provider>;
}

export function useInterfaceLocale():InterfaceLocale{
 return useContext(InterfaceLocaleContext);
}
