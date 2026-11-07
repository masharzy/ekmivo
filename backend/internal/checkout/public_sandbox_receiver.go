package checkout

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func (s *Service) HandlePublicSandboxReceiver(w http.ResponseWriter, r *http.Request) {
	workspace, id, base := os.Getenv("PG14_PUBLIC_SANDBOX_WORKSPACE"), r.PathValue("receiverID"), strings.TrimRight(os.Getenv("PG14_PUBLIC_SANDBOX_API_ORIGIN"), "/")
	if !s.pipelineReady() || !uuidPattern.MatchString(workspace) || !uuidPattern.MatchString(id) || !strings.HasPrefix(base, "https://") {
		fail(w, 404, "NOT_FOUND")
		return
	}
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "success"
	}
	if mode != "success" && mode != "fail-once" && mode != "always-fail" {
		fail(w, 422, "INVALID_RECEIVER_MODE")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
	if err != nil {
		fail(w, 413, "REQUEST_TOO_LARGE")
		return
	}
	target := base + r.URL.EscapedPath()
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	var raw []byte
	err = s.pipelineScoped(r.Context(), workspace, "sandbox", func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg60_receiver_credentials($1::uuid,$2)", workspace, target).Scan(&raw)
	})
	if err != nil {
		fail(w, 503, "SANDBOX_RECEIVER_UNAVAILABLE")
		return
	}
	var credentials struct {
		Active   string  `json:"active"`
		Previous *string `json:"previous"`
	}
	if json.Unmarshal(raw, &credentials) != nil {
		fail(w, 401, "INVALID_SIGNATURE")
		return
	}
	valid := false
	for _, encoded := range []string{credentials.Active, func() string {
		if credentials.Previous != nil {
			return *credentials.Previous
		}
		return ""
	}()} {
		if encoded == "" {
			continue
		}
		cipher, e := base64.StdEncoding.DecodeString(encoded)
		if e != nil {
			continue
		}
		secret, e := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, workspace+"|sandbox")
		if e != nil {
			continue
		}
		keyID := sha256.Sum256(secret)
		if strings.HasPrefix(r.Header.Get("X-Briofold-Signature"), "v1=") && r.Header.Get("X-Briofold-Key-ID") == hex.EncodeToString(keyID[:8]) && merchantwebhook.Verify(secret, body, r.Header.Get("X-Briofold-Timestamp"), r.Header.Get("X-Briofold-Event-ID"), strings.TrimPrefix(r.Header.Get("X-Briofold-Signature"), "v1="), time.Now()) {
			valid = true
			break
		}
	}
	var event struct {
		ID          string `json:"id"`
		Delivery    string `json:"delivery_id"`
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		Type        string `json:"type"`
	}
	if !valid || json.Unmarshal(body, &event) != nil || event.Workspace != workspace || event.Environment != "sandbox" || !uuidPattern.MatchString(event.ID) || !uuidPattern.MatchString(event.Delivery) || event.Delivery != r.Header.Get("X-Briofold-Delivery-ID") {
		fail(w, 401, "INVALID_SIGNATURE")
		return
	}
	var code int
	err = s.pipelineScoped(r.Context(), workspace, "sandbox", func(tx pgx.Tx) error {
		return tx.QueryRow(r.Context(), "SELECT pg60_receiver_record($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6)", workspace, id, event.ID, event.Delivery, event.Type, mode).Scan(&code)
	})
	if err != nil {
		fail(w, 503, "SANDBOX_RECEIVER_UNAVAILABLE")
		return
	}
	write(w, code, map[string]any{"simulation": true, "signature_verified": true, "event_id": event.ID, "delivery_id": event.Delivery})
}
