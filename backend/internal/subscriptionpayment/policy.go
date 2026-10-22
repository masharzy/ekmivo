// Package subscriptionpayment defines the fail-closed Store-first payment handoff
// decisions. Only server-authenticated control snapshots and independently
// verified Live financial evidence may be passed to Evaluate. No client state
// or browser redirect is a payment proof.
package subscriptionpayment

import (
	"errors"
	"regexp"
	"time"
)

var (
	ErrInvalidSnapshot = errors.New("invalid subscription invoice snapshot")
	ErrInconsistentEvidence = errors.New("inconsistent platform payment evidence")
	ErrReceivingUnavailable = errors.New("platform receiving source unavailable")
	uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	digestRE = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// Snapshot is persisted in control PostgreSQL by the authorized handoff
// transaction. The financial checkout token itself is never stored in plaintext.
type Snapshot struct {
	IntentID, QuoteID, InvoiceID, StoreID, ReceiverID, OfferVersionID string
	CheckoutDigest, Currency, Product, Term string
	AmountMinor int64
	PaymentExpiresAt time.Time
}

func (s Snapshot) Validate() error {
	for _, id := range []string{s.IntentID,s.QuoteID,s.InvoiceID,s.StoreID,s.ReceiverID,s.OfferVersionID} {
		if !uuidRE.MatchString(id) { return ErrInvalidSnapshot }
	}
	if s.StoreID==s.ReceiverID || !digestRE.MatchString(s.CheckoutDigest) ||
		s.Currency!="BDT" || s.Product!="payments" || s.Term!="monthly" ||
		s.AmountMinor<=0 || s.PaymentExpiresAt.IsZero() {
		// Yearly periods, bundle fulfillment, AI credits and zero-due
		// activation need separately approved predecessor contracts.
		return ErrInvalidSnapshot
	}
	return nil
}

type Source struct {
	WorkspaceID, Method, AccountID string
	Enabled, Verified, Online, ParserApproved, Ready bool
}

// AvailableSources only accepts explicitly approved Live platform sources.
// Offline phones, disabled receiver, unreviewed parsers and buyer Store
// accounts are never presented as Ekmivo subscription destinations.
func AvailableSources(s Snapshot, sources []Source) ([]Source,error) {
	if err:=s.Validate();err!=nil{return nil,err}
	var eligible []Source
	seen:=make(map[string]bool)
	for _, source:=range sources {
		if source.WorkspaceID!=s.ReceiverID || !source.Enabled || !source.Verified ||
			!source.Online || !source.ParserApproved || !source.Ready ||
			!uuidRE.MatchString(source.AccountID) {continue}
		switch source.Method {
		case "bkash","nagad","rocket":
		default: continue
		}
		id:=source.Method+"|"+source.AccountID
		if seen[id] {continue}
		seen[id]=true
		eligible=append(eligible,source)
	}
	if len(eligible)==0{return nil,ErrReceivingUnavailable}
	return eligible,nil
}

// Proof must come from the isolated Live financial realm's allocation query.
// The financial matching engine validates the full payer, original transfer
// timestamp, exact amount, provider uniqueness and signed receipt evidence.
type Proof struct {
	PaymentID, ReceivingWorkspaceID string
	AmountMinor int64
	VerifiedAt time.Time
}
func (p Proof) matches(s Snapshot) bool {
	return uuidRE.MatchString(p.PaymentID) &&
		p.ReceivingWorkspaceID==s.ReceiverID && p.AmountMinor==s.AmountMinor &&
		!p.VerifiedAt.IsZero()
}
type Decision string
const (
	Waiting Decision="pending"
	Verifying Decision="verifying"
	Activate Decision="activate"
	Recover Decision="recovery_required"
	Expired Decision="expired"
	Cancelled Decision="cancelled"
)

// Evaluate does not mutate a subscription. Activate instructs the caller to
// perform exactly-once invoice settlement + coupon commit in ONE control DB
// transaction, after the trusted financial proof has been read. A terminal
// checkout with subsequently discovered money requires operator recovery;
// it must never auto-refund or silently grant entitlement.
func Evaluate(s Snapshot, financialState string, proof *Proof) (Decision,error) {
	if err:=s.Validate();err!=nil{return "",err}
	if proof!=nil && !proof.matches(s) {return "",ErrInconsistentEvidence}
	switch financialState {
	case "completed":
		if proof==nil {return "",ErrInconsistentEvidence}
		return Activate,nil
	case "expired":
		if proof!=nil{return Recover,nil}
		return Expired,nil
	case "cancelled":
		if proof!=nil{return Recover,nil}
		return Cancelled,nil
	case "processing":
		return Verifying,nil
	case "requires_payer","awaiting_payment":
		if proof!=nil{return Verifying,nil}
		return Waiting,nil
	case "exception":
		return Recover,nil
	default:
		// Includes fabricated success states and unrecognized provider data.
		return "",ErrInconsistentEvidence
	}
}
