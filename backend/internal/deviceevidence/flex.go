package deviceevidence

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Field-based ("flex") receipt parsing.
//
// The strict rules match one exact sentence, so any wording change in a provider
// SMS makes the message miss. A flex rule keeps the same safety properties but
// finds the fields wherever they sit in the message:
//
//   - the sender (Source) is already fixed by the caller;
//   - Incoming must match and Reject must not (outgoing, OTP, failed, ...);
//   - fee and balance figures are removed, then exactly ONE distinct Tk amount
//     must remain;
//   - exactly ONE payer mobile number (the one after "from"/"Sender" wins);
//   - exactly ONE transaction id (TrxID / TxnID / Transaction ID);
//   - exactly ONE date-time.
//
// Anything missing or ambiguous is an error, so the message is kept for review and
// never becomes verified money. The parser only extracts; matching the payer,
// amount, time, account and method against a payment attempt stays in the database.

var (
	flexFeeBalance = regexp.MustCompile(`(?i)\b(?:fee|charge|vat|balance)\b(?:\s*[:\-]?\s*|\s+(?:is|was|now)\s+)(?:tk\.?|bdt|৳)?\s*[0-9][0-9,]*(?:\.[0-9]+)?`)
	flexAmount     = regexp.MustCompile(`(?i)(?:\btk\.?|\bbdt|৳)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)`)
	flexRef        = regexp.MustCompile(`(?i)\b(?:trx\s?id|txn\s?id|transaction\s?id|tid)\b\s*[:#\-]?\s*([A-Za-z0-9]{6,32})\b`)
	flexPayerFrom  = regexp.MustCompile(`(?i)\b(?:from|sender)\b\s*:?\s*((?:\+?88)?01[3-9][0-9]{8})(?:[^0-9]|$)`)
	flexPayerAny   = regexp.MustCompile(`(?:^|[^0-9])((?:\+?88)?01[3-9][0-9]{8})(?:[^0-9]|$)`)
	flexSpace      = regexp.MustCompile(`\s+`)
	flexMeridiem   = regexp.MustCompile(`\s*([AaPp][Mm])$`)
)

// flexTimes are tried in order; the first form that appears decides, and it must
// appear exactly once. 12-hour forms come first so "03:40 PM" is never read as
// 03:40, and seconds forms come before minute forms so "15:40:12" is never read as 15:40.
var flexTimes = []struct {
	re        *regexp.Regexp
	layout    string
	precision string
}{
	{regexp.MustCompile(`(?i)(?:^|[^0-9])([0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{1,2}:[0-9]{2}:[0-9]{2} ?[AP]M)(?:[^a-z0-9]|$)`), "02/01/2006 3:04:05PM", "second"},
	{regexp.MustCompile(`(?i)(?:^|[^0-9])([0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{1,2}:[0-9]{2} ?[AP]M)(?:[^a-z0-9]|$)`), "02/01/2006 3:04PM", "minute"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2})(?:[^0-9]|$)`), "02/01/2006 15:04:05", "second"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{2}/[0-9]{2}/[0-9]{4} [0-9]{2}:[0-9]{2})(?:[^0-9:]|$)`), "02/01/2006 15:04", "minute"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{2}-[0-9]{2}-[0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2})(?:[^0-9]|$)`), "02-01-2006 15:04:05", "second"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{2}-[0-9]{2}-[0-9]{4} [0-9]{2}:[0-9]{2})(?:[^0-9:]|$)`), "02-01-2006 15:04", "minute"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})(?:[^0-9]|$)`), "2006-01-02 15:04:05", "second"},
	{regexp.MustCompile(`(?:^|[^0-9])([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2})(?:[^0-9:]|$)`), "2006-01-02 15:04", "minute"},
}

func (r ParserRule) validateFlex() error {
	if r.Pattern != "" || r.CapturePattern != "" || r.AmountGrouping {
		return errors.New("flex rule must not carry a whole-message pattern")
	}
	if len(r.Incoming) == 0 || len(r.Incoming) > 1024 || len(r.Reject) > 1024 {
		return errors.New("flex rule bounds")
	}
	if r.ID == "" || r.Version < 1 || r.Source == "" || (r.Method != "bkash" && r.Method != "nagad" && r.Method != "rocket" && r.Method != "bank" && r.Method != "other") {
		return errors.New("invalid parser rule")
	}
	if _, e := regexp.Compile("(?i)" + r.Incoming); e != nil {
		return e
	}
	if r.Reject != "" {
		if _, e := regexp.Compile("(?i)" + r.Reject); e != nil {
			return e
		}
	}
	_, e := time.LoadLocation(r.TimeZone)
	return e
}

// RoutePattern is the capture filter handed to the phone for a rule. Whole-message
// rules use their own pattern; a flex rule gets an equivalent Java/Kotlin-compatible
// prefilter (the server still re-checks every message with the real parser).
func (r ParserRule) RoutePattern() string {
	if r.CapturePattern != "" {
		return r.CapturePattern
	}
	if !r.Flex {
		return r.Pattern
	}
	pattern := "(?is)^(?=.*(?:" + r.Incoming + "))"
	if r.Reject != "" {
		pattern += "(?!.*(?:" + r.Reject + "))"
	}
	return pattern + ".*$"
}

func (r ParserRule) flexAccepts(text string) bool {
	if r.validateFlex() != nil || !utf8.ValidString(text) {
		return false
	}
	incoming := regexp.MustCompile("(?i)" + r.Incoming)
	if !incoming.MatchString(text) {
		return false
	}
	return r.Reject == "" || !regexp.MustCompile("(?i)"+r.Reject).MatchString(text)
}

func distinct(matches [][]string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, m := range matches {
		if !seen[m[1]] {
			seen[m[1]] = true
			out = append(out, m[1])
		}
	}
	return out
}

func (r ParserRule) parseFlex(body string) (ParsedReceipt, error) {
	var p ParsedReceipt
	if !r.flexAccepts(body) {
		return p, errors.New("unrecognized or nonincoming evidence")
	}
	text := strings.TrimSpace(flexSpace.ReplaceAllString(body, " "))

	refs := distinct(flexRef.FindAllStringSubmatch(text, -1))
	if len(refs) != 1 {
		return p, errors.New("missing or ambiguous deduplication identity")
	}
	p.Reference = refs[0]
	// The id may look like a phone number or a date; take it out before looking
	// for the other fields.
	withoutRef := flexRef.ReplaceAllString(text, " ")

	amounts := map[int64]bool{}
	for _, m := range flexAmount.FindAllStringSubmatch(flexFeeBalance.ReplaceAllString(withoutRef, " "), -1) {
		grouped, ok := stripAmountGrouping(strings.TrimRight(m[1], ","))
		if !ok {
			return p, errors.New("invalid amount")
		}
		minor, e := MinorUnits(grouped)
		if e != nil {
			return p, e
		}
		amounts[minor] = true
		p.Amount = minor
	}
	if len(amounts) != 1 {
		return p, errors.New("missing or ambiguous amount")
	}

	// The number right after "from"/"Sender" is the payer, even if another number
	// (a receiver, "to 01...") also appears. With no such label the message must
	// hold exactly one mobile number. Two labelled payers, or several unlabelled
	// numbers, stay for review.
	payerText := ""
	if from := distinct(flexPayerFrom.FindAllStringSubmatch(withoutRef, -1)); len(from) == 1 {
		payerText = from[0]
	} else if len(from) == 0 {
		if all := distinct(flexPayerAny.FindAllStringSubmatch(withoutRef, -1)); len(all) == 1 {
			payerText = all[0]
		}
	}
	var ok bool
	if p.Payer, ok = NormalizeNumber(payerText); !ok {
		return p, errors.New("missing or ambiguous actual full payer")
	}

	location, _ := time.LoadLocation(r.TimeZone)
	found := false
	for _, form := range flexTimes {
		times := distinct(form.re.FindAllStringSubmatch(withoutRef, -1))
		if len(times) == 0 {
			continue
		}
		if len(times) != 1 {
			return p, errors.New("ambiguous original transaction time")
		}
		value := times[0]
		if strings.Contains(form.layout, "PM") {
			value = strings.ToUpper(flexMeridiem.ReplaceAllString(value, "$1"))
		}
		var e error
		if p.TransactionAt, e = time.ParseInLocation(form.layout, value, location); e != nil {
			return p, errors.New("missing original transaction time")
		}
		p.Precision = form.precision
		found = true
		break
	}
	if !found {
		return p, errors.New("missing original transaction time")
	}
	p.Method = r.Method
	p.Version = r.Version
	return p, nil
}
