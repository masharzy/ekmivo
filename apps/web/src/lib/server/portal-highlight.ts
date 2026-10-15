import "server-only";
import {createHighlighter} from "shiki";
const highlighter=createHighlighter({themes:["dark-plus","light-plus"],langs:["bash","javascript","python","php","json","http"]});
export async function portalHighlight(code:string,lang:string){return (await highlighter).codeToHtml(code,{lang,themes:{light:"light-plus",dark:"dark-plus"},defaultColor:false});}
