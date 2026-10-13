import type {SVGProps} from "react";

export type PayMethod="bkash"|"nagad"|"rocket";
export const payNames:Record<PayMethod,string>={bkash:"bKash",nagad:"Nagad",rocket:"Rocket"};
export const payMethods:PayMethod[]=["bkash","nagad","rocket"];
export function isPayMethod(value:string):value is PayMethod{return payMethods.some(method=>method===value)}
export function ProviderMark({method,...props}:{method:PayMethod}&Omit<SVGProps<SVGSVGElement>,"children">){
 if(method==="bkash")return <svg viewBox="0 0 150 64" role="img" aria-label="bKash" {...props}>
   <text x="7" y="45" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="34" fill="#292329"><tspan fill="#e31567">b</tspan>Kash</text>
   <path d="M104 9 143 29 115 39 106 59 102 34 87 19Z" fill="#e51365"/>
   <path d="m113 20 19 10-16 7-6 13 2-18Z" fill="#ad0b51"/>
   <path d="m91 18 24 10-9 5Z" fill="#f15f97"/>
  </svg>;
 if(method==="nagad")return <svg viewBox="0 0 150 64" role="img" aria-label="Nagad" {...props}>
   <circle cx="30" cy="32" r="22" fill="#ffad27"/><circle cx="30" cy="32" r="16" fill="#ff5b19"/>
   <path d="M18 37c9-17 18-18 31-20M16 25c15 4 23 3 29-5" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
   <text x="57" y="43" fontFamily="sans-serif" fontWeight="900" fontSize="31" fill="#e72a1a">নগদ</text>
  </svg>;
 return <svg viewBox="0 0 150 64" role="img" aria-label="Rocket" {...props}>
   <path d="M113 8 88 33l7 4 29-19Z" fill="#92268f"/><path d="m98 13 22 11-19 20-9-21Z" fill="#74217c"/>
   <text x="10" y="40" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="24" fill="#7d2787">ROCKET</text>
   <text x="12" y="55" fontFamily="sans-serif" fontSize="10" fontWeight="700" fill="#7d2787">রকেট</text>
  </svg>;
}
