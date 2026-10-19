export const checkoutThemes=['official','receipt','studio','sheet','hero','rail','journal','dial','night'] as const;
export type CheckoutTheme=typeof checkoutThemes[number];
export const logoPositions=['top-left','top-center','top-right','beside-left','beside-right'] as const;
export type LogoPosition=typeof logoPositions[number];
export type CheckoutThemeConfig={theme:CheckoutTheme;store:{name:string;logo:string;size:number;radius:number;position:LogoPosition;invert:boolean};info:boolean;f:{name:boolean;email:boolean;addr:boolean;note:boolean}};
export const defaultCheckoutTheme=(name:string):CheckoutThemeConfig=>({theme:'official',store:{name,logo:'',size:40,radius:0,position:'beside-left',invert:false},info:true,f:{name:true,email:true,addr:false,note:false}});
export function validCheckoutTheme(value:unknown):value is CheckoutThemeConfig{
 if(!value||typeof value!=='object')return false;const v=value as CheckoutThemeConfig;
 return checkoutThemes.includes(v.theme)&&typeof v.info==='boolean'&&!!v.store&&typeof v.store.name==='string'&&v.store.name.trim().length>0&&v.store.name.length<=100&&!/[\u0000-\u001f]/.test(v.store.name)&&typeof v.store.logo==='string'&&v.store.logo.length<=1500000&&Number.isInteger(v.store.size)&&v.store.size>=24&&v.store.size<=96&&Number.isInteger(v.store.radius)&&v.store.radius>=0&&v.store.radius<=48&&logoPositions.includes(v.store.position)&&typeof v.store.invert==='boolean'&&!!v.f&&['name','email','addr','note'].every(k=>typeof v.f[k as keyof typeof v.f]==='boolean');
}
export function parseCheckoutTheme(raw?:string):CheckoutThemeConfig|null{try{const v=JSON.parse(raw||'null');return validCheckoutTheme(v)?v:null}catch{return null}}

// Missing, legacy or invalid saved settings use the same Official renderer as the editor.
export function resolveCheckoutTheme(raw:string|undefined,name:string,logo=""):CheckoutThemeConfig{
 const saved=parseCheckoutTheme(raw);
 if(saved)return saved;
 const fallback=defaultCheckoutTheme(name);
 return {...fallback,store:{...fallback.store,logo}};
}
