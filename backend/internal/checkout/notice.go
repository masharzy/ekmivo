package checkout

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/receiptnotice"
)

// Notice actions do not lock a payer, alter a payment or provide proof of funds.
func (s *Service) HandleNotice(w http.ResponseWriter, r *http.Request) {
	if !s.pipelineReady() {
		fail(w, 503, "NOTICE_SERVICE_UNAVAILABLE")
		return
	}
	token := r.PathValue("token")
	if !tokenPattern.MatchString(token) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if !s.budget(w, "notice:global", 300) || !s.budget(w, "notice:"+digest(token), 5) {
		return
	}
	_, raw, lookupErr := s.lookupCheckout(r, token)
	if lookupErr != nil {
		mapped(w, lookupErr)
		return
	}
	var checkout struct {
		Workspace   string `json:"workspace_id"`
		ID          string `json:"id"`
		Environment string `json:"environment"`
	}
	if json.Unmarshal(raw, &checkout) != nil || !uuidPattern.MatchString(checkout.Workspace) || !uuidPattern.MatchString(checkout.ID) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if _, err := s.publicBusiness(r, raw); err != nil {
		fail(w, 503, "MERCHANT_UNAVAILABLE")
		return
	}
	action := r.PathValue("noticeAction")
	if action == "subscribe" {
		if s.NoticeSMTP == nil {
			fail(w, 503, "NOTICE_SERVICE_UNAVAILABLE")
			return
		}
		var body struct {
			Email   string `json:"email"`
			Consent bool   `json:"consent"`
			Locale  string `json:"locale"`
		}
		if decodeBounded(w, r, &body, 1024) != nil {
			fail(w, 422, "INVALID_NOTICE_REQUEST")
			return
		}
		email, err := receiptnotice.NormalizeEmail(body.Email)
		if body.Locale == "" {
			body.Locale = "en"
		}
		if err != nil || !body.Consent || (body.Locale != "en" && body.Locale != "bn") {
			fail(w, 422, "NOTICE_CONSENT_REQUIRED")
			return
		}
		if !s.budget(w, "notice:recipient:"+hex.EncodeToString(mac(s.Pipeline.Key, checkout.Workspace+"|"+email)), 3) {
			return
		}
		verify, err := randomCapability()
		if err != nil {
			fail(w, 503, "NOTICE_SERVICE_UNAVAILABLE")
			return
		}
		withdraw, err := randomCapability()
		if err != nil {
			fail(w, 503, "NOTICE_SERVICE_UNAVAILABLE")
			return
		}
		vh, _ := receiptnotice.TokenDigest(s.Pipeline.Key, "verify", checkout.Workspace, checkout.Environment, verify)
		wh, _ := receiptnotice.TokenDigest(s.Pipeline.Key, "withdraw", checkout.Workspace, checkout.Environment, withdraw)
		cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, []byte(email), checkout.Workspace+"|"+checkout.Environment+"|notice-email")
		if err != nil {
			fail(w, 503, "NOTICE_SERVICE_UNAVAILABLE")
			return
		}
		var contact string
		err = s.pipelineScoped(r.Context(), checkout.Workspace, checkout.Environment, func(tx pgx.Tx) error {
			return tx.QueryRow(r.Context(), "SELECT pg08_notice_register($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)", checkout.Workspace, checkout.Environment, checkout.ID, cipher, hex.EncodeToString(mac(s.Pipeline.Key, "notice-email|"+checkout.Workspace+"|"+checkout.Environment+"|"+email)), vh, wh, body.Locale).Scan(&contact)
		})
		if err != nil {
			mapped(w, err)
			return
		}
		now := time.Now()
		text := "You requested payment receipt notices. Enter this verification code in the same checkout:\n" + verify + "\nWithdrawal code:\n" + withdraw + "\nVerification expires in 15 minutes. No payment is confirmed by this email. SANDBOX — NO REAL MONEY."
		subject := "Confirm Briofold receipt notices"
		if body.Locale == "bn" {
			subject = "Briofold রসিদের ইমেইল নিশ্চিত করুন"
			text = "আপনি পেমেন্টের রসিদের ইমেইল চেয়েছেন। একই checkout-এ এই verification code দিন:\n" + verify + "\nইমেইল বন্ধ করার code:\n" + withdraw + "\nVerification code-এর মেয়াদ ১৫ মিনিট। এই ইমেইল পেমেন্ট নিশ্চিত করে না। পরীক্ষামূলক — আসল টাকা নয়।"
		}
		if checkout.Environment == "live" {
			text = strings.ReplaceAll(strings.ReplaceAll(text, " SANDBOX — NO REAL MONEY.", ""), " পরীক্ষামূলক — আসল টাকা নয়।", "")
		}
		err = receiptnotice.SendSMTP(r.Context(), *s.NoticeSMTP, receiptnotice.Message{
			ContactVerification: true,
			Recipient:           receiptnotice.Recipient{Workspace: checkout.Workspace, Environment: checkout.Environment, Email: email, ConsentedAt: now},
			Workspace:           checkout.Workspace, Environment: checkout.Environment, MessageID: "verify-" + digest(verify), Subject: subject, Text: text,
		})
		if err != nil {
			fail(w, 503, "NOTICE_VERIFICATION_DELIVERY_UNCONFIRMED")
			return
		}
		write(w, 202, map[string]string{"status": "verification_sent"})
		return
	}
	if action != "verify" && action != "withdraw" {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if decodeBounded(w, r, &body, 1024) != nil || !tokenPattern.MatchString(body.Code) {
		fail(w, 422, "INVALID_NOTICE_CODE")
		return
	}
	hash, err := receiptnotice.TokenDigest(s.Pipeline.Key, action, checkout.Workspace, checkout.Environment, body.Code)
	if err != nil {
		fail(w, 422, "INVALID_NOTICE_CODE")
		return
	}
	var accepted bool
	fn := "pg08_notice_verify"
	if action == "withdraw" {
		fn = "pg08_notice_withdraw"
	}
	err = s.pipelineScoped(r.Context(), checkout.Workspace, checkout.Environment, func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT "+fn+"($1::uuid,$2,$3::uuid,$4)", checkout.Workspace, checkout.Environment, checkout.ID, hash).Scan(&accepted)
	})
	if err != nil {
		mapped(w, err)
		return
	}
	if !accepted {
		fail(w, 422, "INVALID_OR_EXPIRED_NOTICE_CODE")
		return
	}
	status := "verified"
	if action == "withdraw" {
		status = "withdrawn"
	}
	write(w, 200, map[string]string{"status": status})
}
