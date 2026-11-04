import type {SVGProps} from "react";

const names:Record<string,string>={ms:"Messenger",ig:"Instagram",wa:"WhatsApp",web:"Website",tg:"Telegram"};

export function inboxChannelName(channel?:string){return names[channel??""]??channel??"";}

export function InboxChannelIcon({channel,...props}:SVGProps<SVGSVGElement>&{channel?:string}){
 const common={width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true as const,...props};
 switch(channel){
  case "ms":return <svg {...common}><path d="M12 2.5C6.5 2.5 2.5 6.5 2.5 11.6c0 2.8 1.2 5.1 3.2 6.8V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 9.5-3.9 9.5-8.9S17.5 2.5 12 2.5Z"/><path d="m6.5 14.2 4.3-4.6 3.2 2.7 3.5-2.7-4.3 4.7-3.2-2.7-3.5 2.6Z"/></svg>;
  case "ig":return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;
  case "wa":return <svg {...common}><path d="M4.6 17.6 3 22l4.6-1.5A9.5 9.5 0 1 0 3 12c0 2.1.6 4 1.6 5.6Z"/><path d="M8.3 7.8c-.7 1.7 0 3.6 1.7 5.4 1.6 1.7 3.6 2.7 5.5 2.7.7 0 1.4-.7 1.6-1.5l-2.8-1.3-1.2 1.1c-1.3-.5-2.3-1.4-2.9-2.7l1-1.2-1.4-2.7-1.5.2Z"/></svg>;
  case "tg":return <svg {...common}><path d="m21 3-3.4 17.5-5.5-4.2-3.2 2.8.7-4.3L3 12.5 21 3Z"/><path d="m9.6 14.8 7.9-7.1"/></svg>;
  default:return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18 M12 3c3 3.2 4.5 6.2 4.5 9S15 17.8 12 21C9 17.8 7.5 14.8 7.5 12S9 6.2 12 3Z"/></svg>;
 }
}
