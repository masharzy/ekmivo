import { RecoveryForm } from "../../../components/recovery-form";
export const metadata={title:"Password recovery | Briofold"};
export default async function ForgotPasswordPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 return <RecoveryForm locale={locale==="en"?"en":"bn"}/>;
}
