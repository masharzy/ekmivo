package checkout

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5"
)

// HandleSubscriptionPayment is the authenticated Store-first invoice-to-wallet
// bridge. Phase 5 must have already confirmed the exact quote, three policies,
// coupon reservation and issued the authoritative invoice. This endpoint can
// neither choose a price nor mark a payment paid from a browser request.
func (s *Service) HandleSubscriptionPayment(w http.ResponseWriter,r *http.Request) {
	if os.Getenv("EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED")!="true" {
		fail(w,503,"SUBSCRIPTION_PAYMENT_NOT_ENABLED");return
	}
	if s==nil||s.Auth==nil||s.Auth.DB==nil||!s.pipelineReady()||s.Pipeline.Live==nil {
		fail(w,503,"SUBSCRIPTION_PAYMENT_UNAVAILABLE");return
	}
	cookie,err:=r.Cookie("ekmivo-session")
	if err!=nil {fail(w,401,"UNAUTHENTICATED");return}
	actor,err:=s.Auth.Authenticate(r.Context(),cookie.Value)
	if err!=nil {authError(w,err);return}
	ws,intent:=r.PathValue("workspaceID"),r.PathValue("intentID")
	if !uuidPattern.MatchString(ws)||!uuidPattern.MatchString(intent) {
		fail(w,404,"NOT_FOUND");return
	}
	if r.Method=="GET" {
		var raw []byte
		err=s.Auth.DB.QueryRowContext(r.Context(),
			"SELECT platform_subscription_payment_read($1::uuid,$2::uuid,$3::uuid)",ws,actor.UserID,intent).Scan(&raw)
		if err!=nil {billingMapped(w,err);return}
		if len(raw)==0||string(raw)=="null" {fail(w,404,"NOT_FOUND");return}
		var record struct {
			Invoice string `json:"invoice_id"`
			Receiver string `json:"receiving_workspace_id"`
			Workspace string `json:"workspace_id"`
			ProofDigest string `json:"checkout_token_digest"`
			Amount int64 `json:"amount_minor"`
			Currency string `json:"currency"`
			State string `json:"state"`
			Expires string `json:"expires_at"`
		}
		if json.Unmarshal(raw,&record)!=nil||record.Workspace!=ws||
			!uuidPattern.MatchString(record.Invoice)||!uuidPattern.MatchString(record.Receiver)||
			record.Receiver==ws||!validAICreditProofDigest(record.ProofDigest)||
			record.Amount<=0||record.Currency!="BDT"{
			fail(w,503,"SUBSCRIPTION_STATUS_UNAVAILABLE");return
		}
		var financialProof []byte
		var financialState sql.NullString
		err=s.Pipeline.Live.QueryRow(r.Context(),
			"SELECT pg13_platform_payment($1),pg05_checkout_view($1)->>'state'",record.ProofDigest).
			Scan(&financialProof,&financialState)
		if err!=nil {fail(w,503,"BILLING_VERIFICATION_UNAVAILABLE");return}
		_,verified,proofErr:=decodeBillingPaymentProof(financialProof,record.Receiver,record.Amount)
		if proofErr!=nil {fail(w,503,"BILLING_VERIFICATION_UNAVAILABLE");return}
		state:="pending"
		switch record.State {
		case "paid":
			if !verified {fail(w,503,"BILLING_VERIFICATION_UNAVAILABLE");return}
			state="completed"
		case "recovery_required":state="recovery_required"
		case "expired","cancelled":state=record.State
		case "awaiting_payment":
			if financialState.Valid {
				switch financialState.String {
				case "completed","processing":state="verifying"
				case "expired","cancelled":state=financialState.String
				case "exception":state="recovery_required"
				case "awaiting_payment","requires_payer":state="pending"
				default:fail(w,503,"BILLING_VERIFICATION_UNAVAILABLE");return
				}
			}
		default:fail(w,503,"SUBSCRIPTION_STATUS_UNAVAILABLE");return
		}
		write(w,200,map[string]any{
			"intent_id":intent,"invoice_id":record.Invoice,"amount_minor":record.Amount,
			"currency":"BDT","status":state,"expires_at":record.Expires,
			"verified":record.State=="paid"&&verified,
		})
		return
	}
	if r.Method!="POST" {fail(w,405,"METHOD_NOT_ALLOWED");return}
	if !originAllowed(r) {fail(w,403,"ORIGIN_DENIED");return}
	var request struct {
		Quote string `json:"quote_id"`
		Invoice string `json:"invoice_id"`
	}
	if decodeBounded(w,r,&request,1024)!=nil ||
		!uuidPattern.MatchString(request.Quote)||!uuidPattern.MatchString(request.Invoice)||
		!keyPattern.MatchString(r.Header.Get("Idempotency-Key")) {
		fail(w,422,"INVALID_SUBSCRIPTION_HANDOFF");return
	}
	var receiver sql.NullString
	if s.Auth.DB.QueryRowContext(r.Context(),"SELECT platform_billing_workspace()").Scan(&receiver)!=nil ||
		!uuidPattern.MatchString(receiver.String)||receiver.String==ws {
		fail(w,503,"PLATFORM_RECEIVING_UNAVAILABLE");return
	}
	// A configured account is NOT enough. Require an online signed source
	// backed by a production-approved provider parser before issuing a wallet
	// capability. No merchant-owned receiving workspace is consulted.
	var sourcesRaw []byte
	err=s.pipelineScoped(r.Context(),receiver.String,"live",func(tx pgx.Tx)error{
		return tx.QueryRow(r.Context(),
			"SELECT pg10_public_payment_sources($1::uuid,'live')",receiver.String).Scan(&sourcesRaw)
	})
	if err!=nil||!s.approvedSubscriptionSources(sourcesRaw) {
		fail(w,503,"PLATFORM_RECEIVING_UNAVAILABLE");return
	}
	cap:=s.token(receiver.String,"live","billing:"+request.Invoice)
	lookupDigest:=digest(cap)
	var raw []byte
	err=s.Auth.DB.QueryRowContext(r.Context(),
		"SELECT platform_subscription_payment_bind($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7)",
		ws,actor.UserID,intent,request.Quote,request.Invoice,receiver.String,lookupDigest).Scan(&raw)
	if err!=nil {billingMapped(w,err);return}
	var bound struct {
		Invoice string `json:"invoice_id"`
		Receiver string `json:"receiving_workspace_id"`
		Amount int64 `json:"amount_minor"`
		Digest string `json:"checkout_token_digest"`
		State string `json:"state"`
	}
	if json.Unmarshal(raw,&bound)!=nil||bound.Invoice!=request.Invoice||
		bound.Receiver!=receiver.String||bound.Digest!=lookupDigest||bound.Amount<=0 {
		fail(w,503,"SUBSCRIPTION_HANDOFF_MISMATCH");return
	}
	// No blind external payment creation after an unknown network outcome.
	// pg10_intent is itself idempotent under the persisted token digest and
	// immutable invoice reference, so a lost response resumes one intent.
	err=s.creationScoped(r.Context(),receiver.String,"live",func(tx pgx.Tx)error{
		var result []byte
		return tx.QueryRow(r.Context(),
			"SELECT pg10_intent($1::uuid,'live',$2,$3,60,$4,$5,$6)",
			receiver.String,"SAAS-"+request.Invoice,bound.Amount,
			"billing:"+request.Invoice,lookupDigest,digest(request.Invoice)).Scan(&result)
	})
	if err!=nil {billingMapped(w,err);return}
	write(w,200,map[string]any{
		"intent_id":intent,"invoice_id":request.Invoice,"amount_minor":bound.Amount,
		"currency":"BDT","checkout_token":cap,"payment_path":"/pay/subscription/"+cap,
		"status":bound.State,
	})
}

// The Live finance query only reports metadata from verified configurations
// and currently active devices. Still require that the server actually holds
// a production-approved parser for the matching provider/source.
func(s *Service)approvedSubscriptionSources(raw []byte)bool{
	var source struct{
		Configured []string `json:"configured_methods"`
		Sources []struct{
			Method string `json:"method"`
			Source string `json:"source"`
			ParserID string `json:"parser_id"`
			Forwarder bool `json:"forwarder"`
		} `json:"sources"`
	}
	if s==nil||s.Pipeline==nil||json.Unmarshal(raw,&source)!=nil {return false}
	configured:=map[string]bool{}
	for _,m:=range source.Configured{if m=="bkash"||m=="nagad"||m=="rocket"{configured[m]=true}}
	for _,src:=range source.Sources{
		if !configured[src.Method] {continue}
		for _,rule:=range s.Pipeline.Rules{
			if !rule.Approved||rule.SandboxOnly||rule.Source!=src.Source||
				rule.Method!=src.Method||rule.Validate()!=nil {continue}
			if src.Forwarder || src.ParserID!=""&&rule.ID==src.ParserID{return true}
		}
	}
	return false
}
