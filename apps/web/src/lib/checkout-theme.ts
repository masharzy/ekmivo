export const checkoutThemes=['official','receipt','studio','sheet','hero','rail','journal','dial','night'] as const;
export type CheckoutTheme=typeof checkoutThemes[number];
export type CheckoutThemeConfig={theme:CheckoutTheme;store:{name:string;logo:string;size:number};info:boolean;f:{name:boolean;email:boolean;addr:boolean;note:boolean}};
export const defaultCheckoutTheme=(name:string):CheckoutThemeConfig=>({theme:'official',store:{name,logo:'',size:40},info:true,f:{name:true,email:true,addr:false,note:false}});
export function validCheckoutTheme(value:unknown):value is CheckoutThemeConfig{
 if(!value||typeof value!=='object')return false;const v=value as CheckoutThemeConfig;
 return checkoutThemes.includes(v.theme)&&typeof v.info==='boolean'&&!!v.store&&typeof v.store.name==='string'&&v.store.name.trim().length>0&&v.store.name.length<=100&&!/[\u0000-\u001f]/.test(v.store.name)&&typeof v.store.logo==='string'&&v.store.logo.length<=1500000&&Number.isInteger(v.store.size)&&v.store.size>=24&&v.store.size<=96&&!!v.f&&['name','email','addr','note'].every(k=>typeof v.f[k as keyof typeof v.f]==='boolean');
}
export function parseCheckoutTheme(raw?:string):CheckoutThemeConfig|null{try{const v=JSON.parse(raw||'null');return validCheckoutTheme(v)?v:null}catch{return null}}
