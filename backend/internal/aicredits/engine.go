package aicredits

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"time"
	"unicode/utf8"
)

var ErrUnavailable = errors.New("AI execution unavailable")
var ErrPending = errors.New("AI execution requires recovery; do not repeat provider call")
var ErrRejected = errors.New("AI request rejected before provider execution")
var ErrRequestConflict = errors.New("AI request key conflicts with previous input")
var ErrInvalidRequest = errors.New("invalid AI execution request")

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}
type Request struct {
	Workspace, Actor, Key, Model, Thread string
	Messages                             []Message
}
type Output struct {
	ID    string `json:"id"`
	Text  string `json:"text"`
	Usage Usage  `json:"usage"`
}
type Result struct {
	Output
	Model         string `json:"model"`
	TariffVersion string `json:"tariff_version"`
	CostMinor     int64  `json:"cost_minor"`
}
type Claim struct {
	Fresh        bool
	State        string
	Tariff       Tariff
	Cipher       []byte
	ChargedMinor *int64
}
type Store interface {
	Begin(context.Context, Request, string, int64) (Claim, error)
	Complete(context.Context, Request, Result, []byte) error
	Fail(context.Context, Request, string, bool) error
}
type Provider interface {
	Generate(context.Context, string, int64, []Message) (Output, error)
}
type Codec interface {
	Encrypt([]byte, string) ([]byte, error)
	Decrypt([]byte, string) ([]byte, error)
}
type Engine struct {
	Store    Store
	Provider Provider
	Codec    Codec
}

var requestKey = regexp.MustCompile(`^[A-Za-z0-9_.:-]{16,128}$`)
var scopeID = regexp.MustCompile(`^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$`)
var modelID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$`)

// Input byte bounds include room for chat role/control framing. Provider usage
// is still authoritative; unexpected usage is held for recovery, never guessed.
func (r Request) fingerprint() (string, int64, error) {
	if !scopeID.MatchString(r.Workspace) || !scopeID.MatchString(r.Actor) || !requestKey.MatchString(r.Key) || !modelID.MatchString(r.Model) || (r.Thread != "" && !scopeID.MatchString(r.Thread)) || len(r.Messages) < 1 || len(r.Messages) > 32 {
		return "", 0, ErrInvalidRequest
	}
	budget := int64(512)
	for _, message := range r.Messages {
		if (message.Role != "system" && message.Role != "user" && message.Role != "assistant") || !utf8.ValidString(message.Content) || len(message.Content) == 0 {
			return "", 0, ErrInvalidRequest
		}
		budget += int64(len(message.Content) + len(message.Role) + 64)
	}
	if budget > 65536 {
		return "", 0, ErrInvalidRequest
	}
	encoded, _ := json.Marshal(struct {
		Model    string
		Thread   string
		Messages []Message
	}{r.Model, r.Thread, r.Messages})
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), budget, nil
}

func (e Engine) Run(ctx context.Context, request Request) (Result, error) {
	var empty Result
	if e.Store == nil || e.Provider == nil || e.Codec == nil {
		return empty, ErrUnavailable
	}
	fingerprint, budget, err := request.fingerprint()
	if err != nil {
		return empty, err
	}
	claim, err := e.Store.Begin(ctx, request, fingerprint, budget)
	if err != nil {
		return empty, err
	}
	associated := "briofold-ai:" + request.Workspace + ":" + request.Key
	if !claim.Fresh {
		if claim.State == "released" {
			return empty, ErrRejected
		}
		if claim.State != "completed" {
			return empty, ErrPending
		}
		plain, err := e.Codec.Decrypt(claim.Cipher, associated)
		if err != nil {
			return empty, ErrUnavailable
		}
		var result Result
		if json.Unmarshal(plain, &result) != nil || result.Model != request.Model || result.TariffVersion != claim.Tariff.Version {
			return empty, ErrUnavailable
		}
		cost, err := claim.Tariff.Cost(result.Usage)
		if err != nil || cost != result.CostMinor || claim.ChargedMinor == nil || *claim.ChargedMinor != cost {
			return empty, ErrUnavailable
		}
		return result, nil
	}
	// Cleanup persists even when the browser disconnects; it never makes another
	// provider call and cannot turn an uncertain outcome into a free generation.
	finish := func(output Output, release bool) error {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		return e.Store.Fail(cleanup, request, output.ID, release)
	}
	if claim.State != "running" || claim.Tariff.Model != request.Model || claim.Tariff.Validate() != nil || budget > claim.Tariff.MaxInputTokens {
		if finish(Output{}, true) != nil {
			return empty, ErrPending
		}
		return empty, ErrInvalidTariff
	}
	output, err := e.Provider.Generate(ctx, claim.Tariff.Model, claim.Tariff.MaxOutputTokens, request.Messages)
	if err != nil {
		rejected := errors.Is(err, ErrRejected)
		if finish(output, rejected) != nil {
			return empty, ErrPending
		}
		if rejected {
			return empty, ErrRejected
		}
		return empty, ErrPending
	}
	cost, err := claim.Tariff.Cost(output.Usage)
	if err != nil {
		_ = finish(output, false)
		return empty, ErrPending
	}
	result := Result{Output: output, Model: claim.Tariff.Model, TariffVersion: claim.Tariff.Version, CostMinor: cost}
	plain, err := json.Marshal(result)
	if err != nil {
		_ = finish(output, false)
		return empty, ErrPending
	}
	cipher, err := e.Codec.Encrypt(plain, associated)
	if err != nil {
		_ = finish(output, false)
		return empty, ErrPending
	}
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if e.Store.Complete(cleanup, request, result, cipher) != nil {
		_ = finish(output, false)
		return empty, ErrPending
	}
	return result, nil
}
