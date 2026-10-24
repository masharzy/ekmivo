import type {MetadataRoute} from "next";

export default function manifest():MetadataRoute.Manifest{
 return {
  name:"Ekmivo Merchant",
  short_name:"Ekmivo",
  description:"Merchant conversations and commerce",
  start_url:"/dashboard",
  display:"standalone",
  background_color:"#0b1020",
  theme_color:"#0b1020",
  icons:[{src:"/ekmivo-app-icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}],
 };
}
