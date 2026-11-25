package checkout

import (
	"os"

	"github.com/masharzy/briofold/backend/internal/deviceevidence"
)

// nagadMoneyReceivedEnabled gates the second Nagad receipt grammar below.
// Off (the default) means builtinSMSRules returns exactly the two rules it
// always did. The flag is read when the API starts (the rule registry is built
// once), so changing it goes through deploy/vps/set-flag.sh, which restarts the API.
func nagadMoneyReceivedEnabled() bool {
	return os.Getenv("BRIOFOLD_NAGAD_MONEY_RECEIVED_ENABLED") == "true"
}

// smsFlexEnabled switches bKash and Nagad from the exact-sentence rules to one
// field-based rule each (see deviceevidence/flex.go). Off (the default) keeps the
// strict rules. Same restart-time semantics as the flag above: use set-flag.sh.
func smsFlexEnabled() bool {
	return os.Getenv("BRIOFOLD_SMS_FLEX_ENABLED") == "true"
}

// flexSMSRules is a REPLACEMENT for the strict bKash/Nagad rules, never an
// addition: the phone path treats two rules that both parse one SMS as a conflict,
// so exactly one rule per source may exist. Each flex rule accepts every sentence
// the strict rules accepted (a test enforces this) plus the other known layouts:
// bKash "Cash In" and "received payment", Nagad "Money Received", amounts with
// thousands separators, and other date-time styles.
func flexSMSRules() []deviceevidence.ParserRule {
	const reject = `\b(?:otp|pin|password|paid|cash[- ]?out|withdraw(?:n|al)?|recharge|bill|failed|unsuccessful|reversed|refund(?:ed)?|cancel(?:l?ed)?|request(?:ed)?)\b`
	flex := func(id, source, method, incoming string) deviceevidence.ParserRule {
		return deviceevidence.ParserRule{ID: id, Version: 1, Source: source, Method: method,
			TimeLayout: "02/01/2006 15:04", TimeZone: "Asia/Dhaka", Precision: "minute",
			Approved: true, Flex: true, Incoming: incoming, Reject: reject, TimeFromObserved: true}
	}
	return []deviceevidence.ParserRule{
		flex("builtin-bkash-flex-v1", "bKash", "bkash",
			`\b(?:you have received|has been received|received payment|cash in)\b`),
		flex("builtin-nagad-flex-v1", "NAGAD", "nagad",
			`\b(?:you have received|has been received|money received|received payment|cash in)\b`),
		flex("builtin-rocket-flex-v1", "Rocket", "rocket",
			`\b(?:received from|has been received|you have received|cash in)\b`),
	}
}

// Built-in, versioned receipt grammar for the owner-provided bKash/Nagad samples.
// These formats are deliberately narrow: a new provider message is stored for
// review, never paid from partial fields or arbitrary keyword matching.
// No merchant-created parser or customer-entered TrxID is required.
func builtinSMSRules() []deviceevidence.ParserRule {
	if smsFlexEnabled() {
		return flexSMSRules()
	}
	const payer = `(?:\+?88)?01[3-9][0-9]{8}`
	const amount = `[0-9]{1,10}(?:\.[0-9]{1,2})?`
	const date = `[0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}`
	const ref = `[A-Za-z0-9]{6,32}`
	base := func(id, source, method, pattern string) deviceevidence.ParserRule {
		return deviceevidence.ParserRule{ID: id, Version: 2, Source: source, Method: method,
			Pattern: pattern, TimeLayout: "02/01/2006 15:04", TimeZone: "Asia/Dhaka",
			Precision: "minute", Approved: true}
	}
	rules := []deviceevidence.ParserRule{
		base("builtin-bkash-received-v1", "bKash", "bkash",
			`^You have received Tk (?P<amount>`+amount+`) from (?P<payer>`+payer+
				`)\.(?: Ref[ :][^.]{1,120}\.)? Fee Tk `+amount+
				`\. Balance Tk [^\r\n]{1,80}\. TrxID (?P<reference>`+ref+
				`) at (?P<time>`+date+`)$`),
		base("builtin-nagad-received-v1", "NAGAD", "nagad",
			`^You have received Tk (?P<amount>`+amount+`) from (?P<payer>`+payer+
				`)\. Ref: [^.]{1,120}\. Current Balance: Tk [^\r\n]{1,80}\. TxnID: (?P<reference>`+ref+`) Date: (?P<time>`+date+`)$`),
	}
	if nagadMoneyReceivedEnabled() {
		// Nagad "Money Received" layout: Amount / Sender / optional Ref / TxnID /
		// Balance / date-time. Taken from the public PipraPay Nagad template and the
		// forwarding prefilter tests, NOT yet from a consented real Nagad SMS: that
		// is why it is behind a flag. Fields are separated by \s+ because the real
		// message may be one line or one field per line. Amounts at or above 1,000
		// carry thousands separators in provider SMS, so this rule alone opts in to
		// strict AmountGrouping. Balance stays opaque, as in the other rules.
		const groupedAmount = `(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,2}(?:,[0-9]{2})*,[0-9]{3}|[0-9]{1,10})(?:\.[0-9]{1,2})?`
		money := base("builtin-nagad-money-received-v1", "NAGAD", "nagad",
			`^Money Received\.\s+Amount:\s*Tk\s*(?P<amount>`+groupedAmount+`)\s+Sender:\s*(?P<payer>`+payer+
				`)(?:\s+Ref:?\s*[^\r\n]{0,120}?)?\s+TxnID:\s*(?P<reference>`+ref+
				`)\s+Balance:\s*Tk\s*[^\r\n]{1,80}?\s+(?P<time>`+date+`)\s*$`)
		money.AmountGrouping = true
		rules = append(rules, money)
	}
	return rules
}
