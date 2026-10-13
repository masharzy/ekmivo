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
 if(legacy){
  const target=request.nextUrl.clone();
  target.pathname=path.slice(legacy[0].length)||"/";
  const redirect=NextResponse.redirect(target,307);
  if(preference!=="en"&&preference!=="bn")redirect.cookies.set("ekmivo-locale",locale,{path:"/",maxAge:31536000,sameSite:"lax"});
  return redirect;
 }
 const target=request.nextUrl.clone();
 target.pathname="/"+locale+path;
 if(path==="/")target.pathname="/"+locale;
 const headers=new Headers(request.headers);
 headers.set("x-ekmivo-locale",locale);
 return NextResponse.rewrite(target,{request:{headers}});
}

export const config={matcher:["/((?!_next/static|_next/image).*)"]};
