import {NextRequest,NextResponse} from "next/server";

// Public URLs remain language-neutral. Next continues to use the existing
// [locale] route modules internally, selected only by a low-trust UI cookie.
// Authorization and financial access remain server-side and cookie independent.
function withApiSession(request:NextRequest,response:NextResponse){
 const host=request.nextUrl.hostname;
 const token=request.cookies.get("briofold-session")?.value;
 if(request.nextUrl.protocol!=="https:"||!(host==="briofold.tech"||host==="www.briofold.tech")||!token||! /^[A-Za-z0-9_-]{32,256}$/.test(token))return response;
 // Copy only the existing opaque session into an HttpOnly API-path cookie.
 // The VPS still authenticates expiry/revocation and authorizes every request.
 response.cookies.set("__Secure-briofold-api-session",token,{httpOnly:true,secure:true,sameSite:"strict",domain:"briofold.tech",path:"/v1/",maxAge:30*24*3600,priority:"high"});
 response.headers.set("Cache-Control","private, no-store");
 return response;
}
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path.startsWith("/api/")||path==="/api"||path.startsWith("/_next/")||
    path==="/favicon.ico"||path==="/robots.txt"||path==="/sitemap.xml"||path==="/manifest.webmanifest"||
    /\.[a-z0-9]{2,8}$/i.test(path))return NextResponse.next();
 const legacy=path.match(/^\/(bn|en)(?=\/|$)/);
 const preference=request.cookies.get("briofold-locale")?.value;
 const locale=preference==="en"||preference==="bn"?preference:(legacy?.[1]==="bn"?"bn":"en");
 // Internal App Router rewrites can visit /<locale>/... again. A request
 // header added only to our own rewrite distinguishes that internal traversal
 // from a browser's legacy /bn or /en URL, preventing redirect loops.
 const internalRewrite=request.headers.get("x-briofold-internal-rewrite")==="1";
 if(legacy){
  if(!internalRewrite){
   const destination=request.nextUrl.clone();
   destination.pathname=path.slice(legacy[0].length)||"/";
   const response=NextResponse.redirect(destination,307);
   response.cookies.set("briofold-locale",legacy[1],{path:"/",maxAge:31536000,sameSite:"lax"});
   return withApiSession(request,response);
  }
  const response=NextResponse.next();
  if(preference!=="en"&&preference!=="bn")
   response.cookies.set("briofold-locale",locale,{path:"/",maxAge:31536000,sameSite:"lax"});
  return withApiSession(request,response);
 }
 // Old bookmarks and emails: /workspaces is now /businesses.
 if(/^\/workspaces(?=\/|$)/.test(path)){
  const moved=request.nextUrl.clone();moved.pathname=path.replace(/^\/workspaces/,"/businesses");
  return withApiSession(request,NextResponse.redirect(moved,308));
 }
 const target=request.nextUrl.clone();
 target.pathname="/"+locale+path;
 if(path==="/")target.pathname="/"+locale;
 const headers=new Headers(request.headers);
 // Public headers are never trusted to select the UI shell.
 headers.delete("x-briofold-internal-rewrite");
 headers.set("x-briofold-internal-rewrite","1");
 headers.delete("x-briofold-application");
 headers.delete("x-briofold-auth-page");
 headers.set("x-briofold-locale",locale);
 if(/^\/(?:setup|dashboard|inbox|orders|catalog|payments|sms-data|invoices|customers|reports|settings|businesses|account|admin)(?:\/|$)/.test(path))headers.set("x-briofold-application","1");
 if(/^\/(?:login|register|forgot-password|verify-email)(?:\/|$)/.test(path))headers.set("x-briofold-auth-page","1");
 return withApiSession(request,NextResponse.rewrite(target,{request:{headers}}));
}

export const config={matcher:["/((?!_next/static|_next/image).*)"]};
