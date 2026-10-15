import {cookies} from "next/headers";
import {notFound} from "next/navigation";
import {PortalShell} from "../../../../components/developer-portal/portal-shell";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./portal.css";
export default async function DeveloperLayout({params,children}:{params:Promise<{locale:string}>;children:React.ReactNode}){
 const {locale}=await params;if(locale!=="en"&&locale!=="bn")notFound();
 const theme=(await cookies()).get("ekmivo-theme")?.value;
 return <PortalShell locale={locale} initialTheme={theme==="light"||theme==="dark"?theme:"system"}>{children}</PortalShell>;
}
