import {NextRequest,NextResponse} from "next/server";

// Public URLs remain language-neutral. Next continues to use the existing
// [locale] route modules internally, selected only by a low-trust UI cookie.
// Authorization and financial access remain server-side and cookie independent.
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path.startsWith("/api/")||path==="/api"||path.startsWith("/_next/")||
    path==="/favicon.ico"||path==="/robots.txt"||path==="/sitemap.xml"||
    /\.[a-z0-9]{2,8}$/i.test(path))return NextResponse.next();
 const legacy=path.match(/^\/(bn|en)(?=\/|$)/);
 const preference=request.cookies.get("ekmivo-locale")?.value;
 const locale=preference==="en"||preference==="bn"?preference:(legacy?.[1]==="en"?"en":"bn");
 // Internal App Router rewrites can visit /<locale>/... again. A request
 // header added only to our own rewrite distinguishes that internal traversal
 // from a browser's legacy /bn or /en URL, preventing redirect loops.
 const internalRewrite=request.headers.get("x-ekmivo-internal-rewrite")==="1";
 if(legacy){
  if(!internalRewrite){
   const destination=request.nextUrl.clone();
   destination.pathname=path.slice(legacy[0].length)||"/";
   const response=NextResponse.redirect(destination,307);
   response.cookies.set("ekmivo-locale",legacy[1],{path:"/",maxAge:31536000,sameSite:"lax"});
   return response;
  }
  const response=NextResponse.next();
  if(preference!=="en"&&preference!=="bn")
   response.cookies.set("ekmivo-locale",locale,{path:"/",maxAge:31536000,sameSite:"lax"});
  return response;
 }
 const target=request.nextUrl.clone();
 target.pathname="/"+locale+path;
 if(path==="/")target.pathname="/"+locale;
 const headers=new Headers(request.headers);
 // Public headers are never trusted to select the UI shell.
 headers.delete("x-ekmivo-internal-rewrite");
 headers.set("x-ekmivo-internal-rewrite","1");
 headers.delete("x-ekmivo-application");
 headers.delete("x-ekmivo-auth-page");
 headers.set("x-ekmivo-locale",locale);
 if(/^\/(?:dashboard|inbox|orders|payments|sms-data|invoices|customers|reports|settings|workspaces|w|account|admin)(?:\/|$)/.test(path))headers.set("x-ekmivo-application","1");
 if(/^\/(?:login|register|forgot-password|verify-email)(?:\/|$)/.test(path))headers.set("x-ekmivo-auth-page","1");
 return NextResponse.rewrite(target,{request:{headers}});
}

export const config={matcher:["/((?!_next/static|_next/image).*)"]};
