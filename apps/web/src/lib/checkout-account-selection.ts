// Keep a wallet selected on /pay when entering /checkout. An account ID is
// authoritative only if the current checkout actually advertises it for this method.
export function chooseReceivingAccountId(
 method:string,preferredId:string,
 accounts:readonly {id:string;method:string}[],methodChosen:boolean,
):string{
 if(!methodChosen)return "";
 const matching=accounts.filter(account=>account.method===method);
 return matching.find(account=>account.id===preferredId)?.id||matching[0]?.id||"";
}
