import { cookies } from "next/headers";
import { requireUser,hashToken } from "../../../lib/server/auth";
import { database } from "../../../lib/server/db";
import {AccountSecurityView} from "../../../components/account-security-view";
import {googleConfiguration} from "../../../lib/google-oidc";
import {googleMessage} from "../../../lib/google-message";

export const dynamic="force-dynamic";
export default async function AccountPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{google?:string}>}){
 const {locale:raw}=await params,locale=raw==="en"?"en":"bn";
 const user=await requireUser(locale);
 const cookieJar=await cookies();
 const token=cookieJar.get("ekmivo-session")?.value;
 const currentHash=token?hashToken(token):"";
 const [sessions,mfa]=await Promise.all([
  database()`SELECT id,created_at,expires_at,(token_hash=${currentHash}) AS is_current
  FROM auth_sessions WHERE user_id=${user.id}::uuid AND revoked_at IS NULL
   AND expires_at>now() ORDER BY created_at DESC LIMIT 25`,
  database()`SELECT confirmed_at IS NOT NULL AS enabled
   FROM platform_admin_mfa WHERE user_id=${user.id}::uuid LIMIT 1`
 ]);
 const themeValue=cookieJar.get("ekmivo-theme")?.value;
 const theme=themeValue==="light"||themeValue==="dark"?themeValue:"system";
 const googleReady=!!googleConfiguration();
 const linked=googleReady?await database()`SELECT 1 FROM auth_google_identities WHERE user_id=${user.id}::uuid LIMIT 1`:[];
 return <AccountSecurityView locale={locale} user={user} googleReady={googleReady} googleLinked={linked.length>0} googleNotice={googleMessage((await searchParams).google,locale==="bn")} mfa={Boolean(mfa[0]?.enabled)} theme={theme} sessions={sessions.map(s=>({id:String(s.id),created_at:new Date(s.created_at).toISOString(),expires_at:new Date(s.expires_at).toISOString(),is_current:Boolean(s.is_current)}))}/>;
}
