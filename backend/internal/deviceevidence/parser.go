package deviceevidence

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata" // Keep receipt timezone parsing independent of host tzdata.
	"unicode/utf8"
)

// Parser rules are versioned server configuration backed by consented samples.
// No provider format is inferred from a notification title or caller fields.
type ParserRule struct {
	ID             string `json:"id"`
	Version        int    `json:"version"`
	Source         string `json:"source"`
	Method         string `json:"method"`
	Pattern        string `json:"pattern"`
	CapturePattern string `json:"capture_pattern,omitempty"`
	TimeLayout     string `json:"time_layout"`
	TimeZone       string `json:"time_zone"`
	Precision      string `json:"precision"`
	Approved       bool   `json:"approved"`
	SandboxOnly    bool   `json:"sandbox_only"`
}
type ParsedReceipt struct {
	Receiving     string // optional approved full receiving identity, never SMS originatingAddress
	Payer         string
	Amount        int64
	TransactionAt time.Time
	Precision     string
	Reference     string
	Method        string
	Version       int
}

// AcceptCapture rejects unrelated personal/OTP text before even its transport
// digest is persisted. Relevant but semantically invalid receipts may proceed
// to Parse and a safe exception; they never become verified funds.
func (r ParserRule) AcceptCapture(source, realm, text string) bool {
	if r.Validate() != nil || source != r.Source || (realm != "sandbox" && realm != "live") ||
		(r.SandboxOnly && realm != "sandbox") || !utf8.ValidString(text) || len(text) > 8192 {
		return false
	}
	pattern, err := regexp.Compile(r.Pattern)
	return err == nil && pattern.MatchString(text)
}

var phonePattern = regexp.MustCompile(`^\+8801[3-9][0-9]{8}$`)

func NormalizeNumber(s string) (string, bool) {
	s = strings.Map(func(r rune) rune {
		switch {
		case r >= '০' && r <= '৯':
			return '0' + r - '০'
		case r >= '٠' && r <= '٩':
			return '0' + r - '٠'
		case r >= '۰' && r <= '۹':
			return '0' + r - '۰'
		case r == ' ' || r == '-' || r == '(' || r == ')':
			return -1
		}
		return r
	}, s)
	if strings.HasPrefix(s, "01") {
		s = "+88" + s
	}
	if strings.HasPrefix(s, "880") {
		s = "+" + s
	}
	return s, phonePattern.MatchString(s)
}
func MinorUnits(s string) (int64, error) {
	// Normalize numeral scripts without relaxing the strict decimal syntax.
	// Parser rules must still explicitly permit these characters; this does
	// not infer amount, currency or the sender from an unapproved message.
	s = strings.Map(func(r rune) rune {
		switch {
		case r >= '০' && r <= '৯':
			return '0' + r - '০'
		case r >= '٠' && r <= '٩':
			return '0' + r - '٠'
		case r >= '۰' && r <= '۹':
			return '0' + r - '۰'
		default:
			return r
		}
	}, s)
	if !regexp.MustCompile(`^[0-9]{1,10}(\.[0-9]{1,2})?$`).MatchString(s) {
		return 0, errors.New("invalid amount")
	}
	pieces := strings.Split(s, ".")
	whole, e := strconv.ParseInt(pieces[0], 10, 64)
	if e != nil {
		return 0, e
	}
	fraction := int64(0)
	if len(pieces) == 2 {
		p := pieces[1]
		if len(p) == 1 {
			p += "0"
		}
		fraction, _ = strconv.ParseInt(p, 10, 64)
	}
	amount := whole*100 + fraction
	if amount <= 0 || amount > 100000000000 {
		return 0, errors.New("amount outside bounds")
	}
	return amount, nil
}
func (r ParserRule) Validate() error {
	if len(r.Pattern) > 2048 || len(r.CapturePattern) > 2048 {
		return errors.New("parser rule exceeds safe bounds")
	}
	if r.CapturePattern != "" {
		// Android persists only receipts that the authoritative server parser
		// can parse in full; a broader prefilter could store OTP/personal SMS.
		if r.CapturePattern != r.Pattern {
			return errors.New("capture filter must equal approved complete receipt rule")
		}
		if !strings.HasPrefix(r.CapturePattern, "^") || !strings.HasSuffix(r.CapturePattern, "$") {
			return errors.New("capture filter must match whole evidence")
		}
		if _, e := regexp.Compile(r.CapturePattern); e != nil {
			return e
		}
	}
	if r.ID == "" || r.Version < 1 || r.Source == "" || (r.Method != "bkash" && r.Method != "nagad" && r.Method != "rocket" && r.Method != "bank" && r.Method != "other") || r.TimeLayout == "" || (r.Precision != "second" && r.Precision != "minute") {
		return errors.New("invalid parser rule")
	}
	expression, e := regexp.Compile(r.Pattern)
	if e != nil {
		return e
	}
	// Anchored exact messages, not a search through a personal inbox.
	if !strings.HasPrefix(r.Pattern, "^") || !strings.HasSuffix(r.Pattern, "$") {
		return errors.New("parser must match whole evidence")
	}
	for _, name := range []string{"payer", "amount", "time", "reference"} {
		if expression.SubexpIndex(name) < 0 {
			return errors.New("required named capture missing")
		}
	}
	_, e = time.LoadLocation(r.TimeZone)
	return e
}
func (r ParserRule) Parse(source, realm, body string) (ParsedReceipt, error) {
	var p ParsedReceipt
	if !r.Approved || r.SandboxOnly && realm != "sandbox" || source != r.Source || len(body) > 8192 || !utf8.ValidString(body) {
		return p, errors.New("unsupported receipt source")
	}
	if e := r.Validate(); e != nil {
		return p, e
	}
	expression := regexp.MustCompile(r.Pattern)
	match := expression.FindStringSubmatch(body)
	if match == nil {
		return p, errors.New("unrecognized or nonincoming evidence")
	}
	capture := func(name string) string { return match[expression.SubexpIndex(name)] }
	var ok bool
	if expression.SubexpIndex("receiving") >= 0 {
		p.Receiving, ok = NormalizeNumber(capture("receiving"))
		if !ok { return p, errors.New("invalid full receiving identity") }
	}
	p.Payer, ok = NormalizeNumber(capture("payer"))
	if !ok {
		return p, errors.New("missing actual full payer")
	}
	var e error
	p.Amount, e = MinorUnits(capture("amount"))
	if e != nil {
		return p, e
	}
	location, _ := time.LoadLocation(r.TimeZone)
	p.TransactionAt, e = time.ParseInLocation(r.TimeLayout, capture("time"), location)
	if e != nil {
		return p, errors.New("missing original transaction time")
	}
	p.Reference = capture("reference")
	if len(p.Reference) < 1 || len(p.Reference) > 128 {
		return p, errors.New("missing deduplication identity")
	}
	if r.Precision == "minute" && p.TransactionAt.Second() != 0 {
		return p, errors.New("inconsistent time precision")
	}
	p.Precision = r.Precision
	p.Method = r.Method
	p.Version = r.Version
	return p, nil
}
func Identity(key []byte, value string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(value))
	return hex.EncodeToString(m.Sum(nil))
}

// Associated data binds the ciphertext to its enrollment and immutable event.
func Encrypt(key, plain []byte, associated string) ([]byte, error) {
	b, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	g, e := cipher.NewGCM(b)
	if e != nil {
		return nil, e
	}
	nonce := make([]byte, g.NonceSize())
	if _, e = io.ReadFull(rand.Reader, nonce); e != nil {
		return nil, e
	}
	return g.Seal(nonce, nonce, plain, []byte(associated)), nil
}
