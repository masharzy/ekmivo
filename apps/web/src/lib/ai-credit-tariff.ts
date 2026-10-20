export type AiTariffTerms={provider:"openrouter";currency:"BDT";rounding:"ceil_minor";
 input_minor_per_million:number;cached_input_minor_per_million:number;output_minor_per_million:number;
 max_input_tokens:number;max_output_tokens:number;max_request_minor:number};
export type AiTariffRow={id:string;model:string;revision:number;terms:AiTariffTerms;active:boolean;created_at:string};

// Exact decimal-to-paisa conversion. Never parse currency through floating point.
export function aiMoneyMinor(value:string):number|null{
 if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction=""]=value.split(".");
 const minor=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));
 return minor<=BigInt(100000000)?Number(minor):null;
}
export function aiTariffTerms(form:FormData):AiTariffTerms|null{
 const input=aiMoneyMinor(String(form.get("input_rate")??""));
 const cached=aiMoneyMinor(String(form.get("cached_rate")??""));
 const output=aiMoneyMinor(String(form.get("output_rate")??""));
 const cap=aiMoneyMinor(String(form.get("request_cap")??""));
 const integer=(key:string)=>{const value=String(form.get(key)??"");return /^\d{1,9}$/.test(value)?Number(value):NaN;};
 const maxInput=integer("max_input"),maxOutput=integer("max_output");
 if(input===null||cached===null||output===null||cap===null||cached>input||input+output===0||cap===0||
  !Number.isInteger(maxInput)||!Number.isInteger(maxOutput)||maxInput<1||maxOutput<1||maxInput>100000000||maxOutput>100000000)return null;
 const reserve=(BigInt(input)*BigInt(maxInput)+BigInt(output)*BigInt(maxOutput)+BigInt(999999))/BigInt(1000000);
 if(reserve>BigInt(cap))return null;
 return {provider:"openrouter",currency:"BDT",rounding:"ceil_minor",input_minor_per_million:input,
  cached_input_minor_per_million:cached,output_minor_per_million:output,max_input_tokens:maxInput,max_output_tokens:maxOutput,max_request_minor:cap};
}
