import "server-only";
function publicOrigin(value:string|undefined){try{if(!value)return null;const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.pathname==="/"&&!u.search&&!u.hash?u.origin:null;}catch{return null}}
// One place for public origins. Transport credentials and the private Go origin
// never enter this object. Do not claim a custom API domain before provisioning.
export const developerConfig={
 siteOrigin:publicOrigin(process.env.NEXT_PUBLIC_SITE_URL)||"https://ekmivo-web.vercel.app",
 portalOrigin:publicOrigin(process.env.NEXT_PUBLIC_DEVELOPER_ORIGIN),
 apiOrigin:publicOrigin(process.env.NEXT_PUBLIC_DEVELOPER_API_ORIGIN),
 dashboard:"/workspaces/open",keys:"/workspaces/open",status:"/status",contract:"/api/payment-contract",
 fullWebhookExample:"https://github.com/masharzy/ekmivo/blob/main/examples/simple-payment/webhook.mjs"
};
