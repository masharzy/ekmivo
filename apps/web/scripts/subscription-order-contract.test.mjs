import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {safePolicyUrl,allPoliciesAccepted,verifiedSubscriptionQuote} from "../src/lib/subscription-order.ts";

const read=path=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const legal={terms:"https://ekmivo.com/terms",privacy:"https://ekmivo.com/privacy",refund:"https://ekmivo.com/refunds"};
const all={terms:true,privacy:true,refund:true};
const quote={id:"de16b0c1-a1c1-4fab-bc93-ff85cc4cc10e",plan_id:"starter",amount_minor:10000,cycle_count:1,operation:"renew",activation_timing:"now",expires_at:"2030-01-01T00:00:00.000Z",entitlement_start:"2026-10-21T00:00:00.000Z",entitlement_end:"2030-01-02T00:00:00.000Z"};

test("all three independent legal policies are required and URLs are HTTPS",()=>{
 assert.equal(allPoliciesAccepted(legal,all),true);
 for(const key of Object.keys(all))assert.equal(allPoliciesAccepted(legal,{...all,[key]:false}),false);
 for(const key of Object.keys(legal))assert.equal(allPoliciesAccepted({...legal,[key]:null},all),false);
 assert.equal(safePolicyUrl("javascript:alert(1)"),null);
 assert.equal(safePolicyUrl("http://example.com/terms"),null);
 assert.equal(safePolicyUrl("/terms"),null);
 assert.equal(safePolicyUrl(legal.terms),legal.terms);
});

test("billing quote is bounded to plan, term, activation, future expiry and positive integer amount",()=>{
 assert.equal(verifiedSubscriptionQuote(quote,"starter",1,"now",0),true);
 assert.equal(verifiedSubscriptionQuote(quote,"another",1,"now",0),false);
 assert.equal(verifiedSubscriptionQuote(quote,"starter",3,"now",0),false);
 assert.equal(verifiedSubscriptionQuote(quote,"starter",1,"period_end",0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,amount_minor:-1},"starter",1,"now",0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,amount_minor:1.5},"starter",1,"now",0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,id:"not-a-uuid"},"starter",1,"now",0),false);
 assert.equal(verifiedSubscriptionQuote({...quote,expires_at:"2020-01-01T00:00:00Z"},"starter",1,"now",Date.now()),false);
});

test("order summary cannot contain a wallet selector and payment stage remains separate",()=>{
 const summary=read("components/subscription-order-summary.tsx");
 const pay=read("app/[locale]/pay/subscription/[token]/page.tsx");
 const merchant=read("app/[locale]/pay/[token]/page.tsx");
 assert.match(summary,/Go to Pay/);
 assert.match(summary,/Pay with Ekmivo/);
 assert.match(summary,/consent\("terms"/);
 assert.match(summary,/consent\("privacy"/);
 assert.match(summary,/consent\("refund"/);
 assert.match(summary,/disabled=\{!purchaseEnabled\|\|busy\|\|quoteLoading\|\|!state\|\|!consentsReady/);
 assert.match(summary,/router\.push\(`\/pay\/subscription\/\$\{result\.checkout_token\}`\)/);
 assert.doesNotMatch(summary,/name="(?:bkash|nagad|rocket)"/);
 assert.match(pay,/CheckoutExperience/);
 assert.match(merchant,/PublicDocument/);
});

test("one Store is enforced transactionally on creation while legacy selection stays readable",()=>{
 const create=read("actions/account.ts");
 const list=read("app/[locale]/workspaces/page.tsx");
 assert.match(create,/pg_advisory_xact_lock\(hashtextextended/);
 assert.match(create,/if\(existing\.length\)throw new Error\("STORE_ALREADY_EXISTS"\)/);
 assert.match(list,/if\(bound\|\|spaces\.length===1\)redirect\("\/workspaces\/open"\)/);
 const auth=read("lib/server/auth.ts");
 assert.match(auth,/if\(bound && workspaceId!==bound\)return false/);
});

// Primary-bound users must not fall back to the legacy Store picker.
