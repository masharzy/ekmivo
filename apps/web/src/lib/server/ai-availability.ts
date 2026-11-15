// AI Bot is in development (owner decision 2026-11-15): new businesses cannot choose AI or Both, and AI cannot
// be switched on for a business that does not have it now. Businesses that already have AI keep it.
// BRIOFOLD_AI_SIGNUP_OPEN=true (web) restores the previous behaviour.
export function aiSignupOpen():boolean{return process.env.BRIOFOLD_AI_SIGNUP_OPEN==="true";}
export const aiInDevelopmentMessage={
 en:"AI Bot is in development. For now you can use the Payment Gateway.",
 bn:"AI বট এখন ডেভেলপমেন্টে আছে। আপাতত পেমেন্ট গেটওয়ে ব্যবহার করতে পারবেন।",
} as const;
