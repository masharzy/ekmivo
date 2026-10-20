package aicredits

import (
	"context"
	"errors"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"sync"
	"sync/atomic"
	"testing"
)

type engineTestCodec struct{}

func (engineTestCodec) Encrypt(p []byte, s string) ([]byte, error) {
	return deviceevidence.Encrypt(make([]byte, 32), p, s)
}
func (engineTestCodec) Decrypt(p []byte, s string) ([]byte, error) {
	return merchantwebhook.Decrypt(make([]byte, 32), p, s)
}

type providerFunc func(context.Context, string, int64, []Message) (Output, error)

func (f providerFunc) Generate(ctx context.Context, m string, n int64, messages []Message) (Output, error) {
	return f(ctx, m, n, messages)
}

type testExecution struct {
	fingerprint string
	claim       Claim
}
type engineTestStore struct {
	mu                             sync.Mutex
	rows                           map[string]testExecution
	tariff                         Tariff
	denied                         bool
	settlements, releases, unknown int
	lostSettlementReply            bool
}

func newEngineStore() *engineTestStore {
	return &engineTestStore{rows: map[string]testExecution{}, tariff: fixtureTariff()}
}
func (s *engineTestStore) Begin(_ context.Context, r Request, fp string, _ int64) (Claim, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if row, ok := s.rows[r.Workspace+r.Key]; ok {
		if row.fingerprint != fp {
			return Claim{}, ErrRequestConflict
		}
		c := row.claim
		c.Fresh = false
		return c, nil
	}
	if s.denied {
		return Claim{}, ErrUnavailable
	}
	claim := Claim{Fresh: true, State: "running", Tariff: s.tariff}
	s.rows[r.Workspace+r.Key] = testExecution{fp, claim}
	return claim, nil
}
func (s *engineTestStore) Complete(_ context.Context, r Request, result Result, cipher []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	row := s.rows[r.Workspace+r.Key]
	if row.claim.State != "completed" {
		s.settlements++
		row.claim.State = "completed"
		row.claim.Cipher = append([]byte{}, cipher...)
		charged := result.CostMinor
		row.claim.ChargedMinor = &charged
		s.rows[r.Workspace+r.Key] = row
	}
	if s.lostSettlementReply {
		s.lostSettlementReply = false
		return errors.New("connection lost after commit")
	}
	return nil
}
func (s *engineTestStore) Fail(_ context.Context, r Request, _ string, release bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	row := s.rows[r.Workspace+r.Key]
	if row.claim.State == "completed" || row.claim.State == "released" {
		return nil
	}
	if release {
		s.releases++
		row.claim.State = "released"
	} else {
		s.unknown++
		row.claim.State = "unknown"
	}
	s.rows[r.Workspace+r.Key] = row
	return nil
}
func engineRequest() Request {
	return Request{Workspace: "10000000-0000-4000-8000-000000000001", Actor: "10000000-0000-4000-8000-000000000002", Key: "fixture-request-key-0001", Model: "fixture-model", Messages: []Message{{Role: "user", Content: "What is available?"}}}
}
func successfulOutput() Output {
	return Output{ID: "fixture-generation-1", Text: "Available items", Usage: Usage{InputTokens: 1000, OutputTokens: 100}}
}

func TestConcurrentAIExecutionCallsProviderAndSettlesOnlyOnce(t *testing.T) {
	store := newEngineStore()
	var calls atomic.Int64
	entered, release := make(chan struct{}), make(chan struct{})
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(_ context.Context, m string, max int64, _ []Message) (Output, error) {
		if m != "fixture-model" || max != 2000 {
			t.Error("provider did not receive the reserved model/output limit")
		}
		calls.Add(1)
		close(entered)
		<-release
		return successfulOutput(), nil
	})}
	done := make(chan error, 1)
	go func() { _, err := engine.Run(context.Background(), engineRequest()); done <- err }()
	<-entered
	var pending sync.WaitGroup
	for i := 0; i < 12; i++ {
		pending.Add(1)
		go func() {
			defer pending.Done()
			if _, err := engine.Run(context.Background(), engineRequest()); !errors.Is(err, ErrPending) {
				t.Error("concurrent retry was allowed to execute", err)
			}
		}()
	}
	pending.Wait()
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	replay, err := engine.Run(context.Background(), engineRequest())
	if err != nil || replay.CostMinor != 2 || replay.Text != "Available items" {
		t.Fatal("lost-response replay failed", replay, err)
	}
	if calls.Load() != 1 || store.settlements != 1 {
		t.Fatal("duplicate provider execution or settlement")
	}
}

func TestAIExecutionFailureAndUncertainOutcomeRules(t *testing.T) {
	for _, tc := range []struct {
		name          string
		providerError error
		output        Output
		want          error
		release       bool
	}{
		{"definitive rejection", ErrRejected, Output{}, ErrRejected, true},
		{"timeout", context.DeadlineExceeded, Output{}, ErrPending, false},
		{"unbounded provider usage", nil, Output{ID: "over-limit", Usage: Usage{InputTokens: 10001}}, ErrPending, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newEngineStore()
			calls := 0
			engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) {
				calls++
				return tc.output, tc.providerError
			})}
			for i := 0; i < 2; i++ {
				if _, err := engine.Run(context.Background(), engineRequest()); !errors.Is(err, tc.want) {
					t.Fatal("wrong failure outcome", err)
				}
			}
			if calls != 1 || store.settlements != 0 || ((store.releases == 1) != tc.release) {
				t.Fatal("unsafe failure release or automatic paid retry")
			}
		})
	}
}

func TestSettlementCommitWithLostReplyDoesNotChargeOrGenerateAgain(t *testing.T) {
	store := newEngineStore()
	store.lostSettlementReply = true
	calls := 0
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) {
		calls++
		return successfulOutput(), nil
	})}
	if _, err := engine.Run(context.Background(), engineRequest()); !errors.Is(err, ErrPending) {
		t.Fatal(err)
	}
	result, err := engine.Run(context.Background(), engineRequest())
	if err != nil || result.CostMinor != 2 || calls != 1 || store.settlements != 1 {
		t.Fatal("committed settlement replay unsafe", err)
	}
}

func TestAIExecutionDenialAndKeyConflictNeverCallProvider(t *testing.T) {
	store := newEngineStore()
	store.denied = true
	calls := 0
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) {
		calls++
		return successfulOutput(), nil
	})}
	if _, err := engine.Run(context.Background(), engineRequest()); err == nil || calls != 0 {
		t.Fatal("unfunded request reached provider")
	}
	store.denied = false
	if _, err := engine.Run(context.Background(), engineRequest()); err != nil {
		t.Fatal(err)
	}
	changed := engineRequest()
	changed.Messages = []Message{{Role: "user", Content: "Different prompt"}}
	if _, err := engine.Run(context.Background(), changed); !errors.Is(err, ErrRequestConflict) || calls != 1 {
		t.Fatal("changed input reused a charge key", err)
	}
}

func TestCompletedAIRequestKeepsOriginalTariffAndCipherScope(t *testing.T) {
	store := newEngineStore()
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) { return successfulOutput(), nil })}
	first, err := engine.Run(context.Background(), engineRequest())
	if err != nil {
		t.Fatal(err)
	}
	store.tariff.Version = "test-v2"
	store.tariff.InputMinorPerMillion = 9000
	replay, err := engine.Run(context.Background(), engineRequest())
	if err != nil || replay.TariffVersion != first.TariffVersion || replay.CostMinor != first.CostMinor {
		t.Fatal("price change rewrote old usage", err)
	}
	other := engineRequest()
	other.Workspace = "10000000-0000-4000-8000-000000000003"
	store.rows[other.Workspace+other.Key] = store.rows[engineRequest().Workspace+other.Key]
	if _, err := engine.Run(context.Background(), other); !errors.Is(err, ErrUnavailable) {
		t.Fatal("cipher response crossed workspace scope")
	}
}

func TestMalformedAIRequestDoesNotCreateReservation(t *testing.T) {
	store := newEngineStore()
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) {
		t.Fatal("invalid request reached provider")
		return Output{}, nil
	})}
	request := engineRequest()
	request.Messages = []Message{{Role: "tool", Content: "Untrusted tool result"}}
	if _, err := engine.Run(context.Background(), request); !errors.Is(err, ErrInvalidRequest) || len(store.rows) != 0 {
		t.Fatal("invalid role accepted")
	}
}

func TestWaivedAIRequestNeverExecutesAgain(t *testing.T) {
	store := newEngineStore()
	engine := Engine{Store: store, Codec: engineTestCodec{}, Provider: providerFunc(func(context.Context, string, int64, []Message) (Output, error) { return Output{}, ErrPending })}
	request := engineRequest()
	_, _ = engine.Run(context.Background(), request)
	row := store.rows[request.Workspace+request.Key]
	row.claim.State = "waived"
	store.rows[request.Workspace+request.Key] = row
	engine.Provider = providerFunc(func(context.Context, string, int64, []Message) (Output, error) {
		t.Fatal("waived request called provider")
		return Output{}, nil
	})
	if _, err := engine.Run(context.Background(), request); !errors.Is(err, ErrWaived) {
		t.Fatalf("expected waived terminal state, got %v", err)
	}
	if store.settlements != 0 {
		t.Fatal("waived retry settled")
	}
}
