import { redirect } from "next/navigation";
import { currentUser } from "../../../lib/server/auth";
import { verificationEnabled } from "../../../lib/server/email";
import { VerificationForm } from "../../../components/verification-form";
export const dynamic="force-dynamic";
export default async function VerifyEmailPage({params}:{params:Promise<{locale:string}>}){
 const {locale:raw}=await params;
 const locale=raw==="en"?"en":"bn";
 const user=await currentUser();
 if(!user)redirect(`/${locale}/login`);
 if(user.verified||!await verificationEnabled())redirect(`/${locale}/workspaces/open`);
 return <VerificationForm locale={locale} email={user.email}/>;
}
