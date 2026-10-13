import type {SVGProps} from "react";

export type PayMethod="bkash"|"nagad"|"rocket";
export const payNames:Record<PayMethod,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
export const payMethods:PayMethod[]=["bkash","nagad","rocket"];
export function isPayMethod(value:string):value is PayMethod{return payMethods.some(method=>method===value)}

/** Source artwork from merchant-supplied logo assets, not manually illustrated shapes. */
export function ProviderMark({method,bn=false,...props}:{method:PayMethod;bn?:boolean}&Omit<SVGProps<SVGSVGElement>,"children">){
 if(method==="bkash")return <svg viewBox="0 0 196 64" role="img" aria-label={bn?"বিকাশ":"bKash"} {...props}>
   <image href="/payment-assets/bkash-icon.svg" x="2" y="2" width="58" height="60" preserveAspectRatio="xMidYMid meet"/>
   {bn
    ? <text x="69" y="43" fontFamily="'Hind Siliguri',sans-serif" fontWeight="700" fontSize="35" fill="#E2136E">বিকাশ</text>
    : <text x="69" y="43" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="35" fill="#292329"><tspan fill="#E2136E">b</tspan>Kash</text>}
  </svg>;
 if(method==="nagad")return <svg viewBox="0 0 205 75" role="img" aria-label="Nagad" {...props}>
   <image href="/payment-assets/nagad-logo.png" x="0" y="0" width="205" height="75" preserveAspectRatio="xMidYMid meet"/>
  </svg>;
 return <svg viewBox="0 0 150 64" role="img" aria-label="Rocket" {...props}>
   <image href="/payment-assets/rocket-logo.png" x="0" y="0" width="150" height="64" preserveAspectRatio="xMidYMid meet"/>
  </svg>;
}
