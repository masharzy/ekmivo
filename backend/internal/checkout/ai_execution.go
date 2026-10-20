package checkout

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/masharzy/ekmivo/backend/internal/aicredits"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"net/http"
	"os"
)

type aiExecutionStore struct{ db *sql.DB }
type aiExecutionCodec struct{ key []byte }

func (c aiExecutionCodec) Encrypt(plain []byte, scope string) ([]byte, error) {
	return deviceevidence.Encrypt(c.key, plain, scope)
}
func (c aiExecutionCodec) Decrypt(cipher []byte, scope string) ([]byte, error) {
	return merchantwebhook.Decrypt(c.key, cipher, scope)
}

func (s aiExecutionStore) Begin(ctx context.Context, request aicredits.Request, fingerprint string, bound int64) (aicredits.Claim, error) {
	var claim aicredits.Claim
	var raw []byte
	var thread any
	if request.Thread != "" {
		thread = request.Thread
	}
	err := s.db.QueryRowContext(ctx, "SELECT briofold_ai_request_begin($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid)", request.Workspace, request.Actor, request.Key, request.Model, fingerprint, bound, thread).Scan(&raw)
	if err != nil {
		var pg *pgconn.PgError
		if errors.As(err, &pg) && pg.Code == "23505" {
			return claim, aicredits.ErrRequestConflict
		}
		return claim, err
	}
	var decoded struct {
		Fresh        bool   `json:"fresh"`
		State        string `json:"state"`
		Cipher       string `json:"response_cipher"`
		ChargedMinor *int64 `json:"charged_minor"`
		Tariff       struct {
			ID    string `json:"id"`
			Model string `json:"model"`
			Terms struct {
				Currency  string `json:"currency"`
				Input     int64  `json:"input_minor_per_million"`
				Cached    int64  `json:"cached_input_minor_per_million"`
				Output    int64  `json:"output_minor_per_million"`
				MaxInput  int64  `json:"max_input_tokens"`
				MaxOutput int64  `json:"max_output_tokens"`
				MaxCost   int64  `json:"max_request_minor"`
			} `json:"terms"`
		} `json:"tariff"`
	}
	if json.Unmarshal(raw, &decoded) != nil || !uuidPattern.MatchString(decoded.Tariff.ID) {
		return claim, aicredits.ErrUnavailable
	}
	cipher, err := hex.DecodeString(decoded.Cipher)
	if err != nil {
		return claim, aicredits.ErrUnavailable
	}
	t := decoded.Tariff.Terms
	return aicredits.Claim{Fresh: decoded.Fresh, State: decoded.State, Cipher: cipher, ChargedMinor: decoded.ChargedMinor, Tariff: aicredits.Tariff{
		Version: decoded.Tariff.ID, Model: decoded.Tariff.Model, Currency: t.Currency, InputMinorPerMillion: t.Input, CachedInputMinorPerMillion: t.Cached, OutputMinorPerMillion: t.Output,
		MaxInputTokens: t.MaxInput, MaxOutputTokens: t.MaxOutput, MaxRequestMinor: t.MaxCost}}, nil
}
func (s aiExecutionStore) Complete(ctx context.Context, r aicredits.Request, result aicredits.Result, cipher []byte) error {
	o := result.Output
	var raw []byte
	err := s.db.QueryRowContext(ctx, "SELECT briofold_ai_request_complete($1::uuid,$2,$3,$4,$5,$6,$7::bytea)", r.Workspace, r.Key, o.ID, o.Usage.InputTokens, o.Usage.CachedInputTokens, o.Usage.OutputTokens, cipher).Scan(&raw)
	if err != nil {
		return err
	}
	var state struct {
		State        string `json:"state"`
		ChargedMinor *int64 `json:"charged_minor"`
	}
	if json.Unmarshal(raw, &state) != nil || state.State != "completed" || state.ChargedMinor == nil || *state.ChargedMinor != result.CostMinor {
		return aicredits.ErrUnavailable
	}
	return nil
}
func (s aiExecutionStore) Fail(ctx context.Context, r aicredits.Request, ref string, rejected bool) error {
	var raw any
	return s.db.QueryRowContext(ctx, "SELECT briofold_ai_request_fail($1::uuid,$2,$3,$4)", r.Workspace, r.Key, ref, rejected).Scan(&raw)
}

// Owner/Admin testing uses the same paid execution engine that channel workers
// must use. There is no alternate unmetered model endpoint or financial tool.
func (s *Service) HandleAITest(w http.ResponseWriter, r *http.Request) {
	if os.Getenv("BRIOFOLD_AI_RUNTIME_ENABLED") != "true" {
		fail(w, 503, "AI_RUNTIME_NOT_ENABLED")
		return
	}
	if s == nil || s.Auth == nil || s.Auth.DB == nil || s.Pipeline == nil || len(s.Pipeline.Key) != 32 || os.Getenv("OPENROUTER_API_KEY") == "" {
		fail(w, 503, "AI_RUNTIME_UNAVAILABLE")
		return
	}
	if r.Method != "POST" || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	workspace := r.PathValue("workspaceID")
	if !uuidPattern.MatchString(workspace) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	var input struct {
		Model        string `json:"model"`
		Prompt       string `json:"prompt"`
		Instructions string `json:"instructions"`
	}
	if decodeBounded(w, r, &input, 16384) != nil || input.Prompt == "" || len(input.Prompt) > 8000 || len(input.Instructions) > 4000 || !keyPattern.MatchString(r.Header.Get("Idempotency-Key")) {
		fail(w, 422, "INVALID_AI_REQUEST")
		return
	}
	messages := []aicredits.Message{}
	if input.Instructions != "" {
		messages = append(messages, aicredits.Message{Role: "system", Content: input.Instructions})
	}
	messages = append(messages, aicredits.Message{Role: "user", Content: input.Prompt})
	engine := aicredits.Engine{Store: aiExecutionStore{db: s.Auth.DB}, Provider: aicredits.NewOpenRouter(os.Getenv("OPENROUTER_API_KEY")), Codec: aiExecutionCodec{key: s.Pipeline.Key}}
	result, err := engine.Run(r.Context(), aicredits.Request{Workspace: workspace, Actor: actor.UserID, Key: r.Header.Get("Idempotency-Key"), Model: input.Model, Messages: messages})
	if err != nil {
		switch {
		case errors.Is(err, aicredits.ErrInvalidRequest), errors.Is(err, aicredits.ErrInvalidTariff):
			fail(w, 422, "INVALID_AI_REQUEST")
		case errors.Is(err, aicredits.ErrRequestConflict):
			fail(w, 409, "AI_REQUEST_KEY_CONFLICT")
		case errors.Is(err, aicredits.ErrPending):
			fail(w, 409, "AI_REQUEST_RECOVERY_PENDING")
		case errors.Is(err, aicredits.ErrRejected):
			fail(w, 422, "AI_PROVIDER_REJECTED")
		default:
			var pg *pgconn.PgError
			if errors.As(err, &pg) {
				switch pg.Code {
				case "42501":
					fail(w, 403, "ACCESS_DENIED")
					return
				case "P0001":
					fail(w, 402, "AI_CREDITS_INSUFFICIENT")
					return
				case "P0002":
					fail(w, 422, "AI_MODEL_NOT_CONFIGURED")
					return
				case "54000":
					fail(w, 429, "AI_CONCURRENCY_LIMIT")
					return
				case "22023":
					fail(w, 422, "AI_REQUEST_LIMIT_EXCEEDED")
					return
				}
			}
			fail(w, 503, "AI_RUNTIME_UNAVAILABLE")
		}
		return
	}
	write(w, 200, result)
}
