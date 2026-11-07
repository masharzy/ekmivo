// Reject common credential formats in both JSON and plain operator notes.
// Never return the matching value in an error or log.
const credentialValue = /postgres(?:ql)?:\/\/|(?:bf|ek)_(?:live|test)_[A-Za-z0-9_-]{24,}|(?:password|cookie|authorization|recovery_code|mfa_secret|access_token|refresh_token|api_key)\s*["']?\s*[:=]\s*["']?[^\s"'},]+/i;
const credentialKey = /^(?:password|current_password|cookie|cookies|authorization|recovery_codes?|mfa_secret|totp_secret|access_token|refresh_token|api_key|database_url|signing_secret|private_key)$/i;

export function containsCredentials(value) {
 if(typeof value==='string')return credentialValue.test(value);
 if(Array.isArray(value))return value.some(containsCredentials);
 if(value&&typeof value==='object')return Object.entries(value).some(([key,item])=>credentialKey.test(key)&&item!==null&&item!==''||containsCredentials(item));
 return false;
}

export function validObservationTime(value,now=Date.now()) {
 return typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+60000;
}

export function validCalendarDate(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
