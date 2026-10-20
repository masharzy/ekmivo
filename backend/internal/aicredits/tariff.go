// Package aicredits owns prepaid AI cost calculations. No price or provider is
// selected by this package: an explicitly approved, versioned tariff is required.
package aicredits

import (
	"errors"
	"math/big"
	"strings"
)

var ErrInvalidTariff = errors.New("AI tariff unavailable or invalid")
var ErrInvalidUsage = errors.New("AI usage invalid or outside reserved limits")
var ErrCostOverflow = errors.New("AI cost exceeds supported wallet amount")

// Rates are integer BDT minor units (paisa) per million tokens. Cached input
// counts are part of InputTokens, not an additional input-token charge.
type Tariff struct {
	Version, Model, Currency                                                string
	InputMinorPerMillion, CachedInputMinorPerMillion, OutputMinorPerMillion int64
	MaxInputTokens, MaxOutputTokens                                         int64
	MaxRequestMinor                                                         int64
}

type Usage struct {
	InputTokens       int64 `json:"input_tokens"`
	CachedInputTokens int64 `json:"cached_input_tokens"`
	OutputTokens      int64 `json:"output_tokens"`
}

func (t Tariff) Validate() error {
	if strings.TrimSpace(t.Version) == "" || len(t.Version) > 100 || strings.TrimSpace(t.Model) == "" || len(t.Model) > 200 || t.Currency != "BDT" ||
		t.InputMinorPerMillion < 0 || t.CachedInputMinorPerMillion < 0 || t.CachedInputMinorPerMillion > t.InputMinorPerMillion || t.OutputMinorPerMillion < 0 ||
		t.InputMinorPerMillion == 0 && t.OutputMinorPerMillion == 0 || t.MaxInputTokens <= 0 || t.MaxOutputTokens <= 0 || t.MaxRequestMinor <= 0 || t.MaxRequestMinor > 100000000 {
		return ErrInvalidTariff
	}
	return nil
}

// Cost rounds the combined input/output cost up once to a wallet minor unit.
// The tariff's rounding policy must be shown before it is commercially enabled.
// Arbitrary-precision intermediates prevent token/rate multiplication overflow.
func (t Tariff) Cost(u Usage) (int64, error) {
	if err := t.Validate(); err != nil {
		return 0, err
	}
	if u.InputTokens < 0 || u.CachedInputTokens < 0 || u.OutputTokens < 0 || u.CachedInputTokens > u.InputTokens ||
		u.InputTokens > t.MaxInputTokens || u.OutputTokens > t.MaxOutputTokens {
		return 0, ErrInvalidUsage
	}
	total := new(big.Int)
	for _, part := range [][2]int64{
		{u.InputTokens - u.CachedInputTokens, t.InputMinorPerMillion},
		{u.CachedInputTokens, t.CachedInputMinorPerMillion},
		{u.OutputTokens, t.OutputMinorPerMillion},
	} {
		total.Add(total, new(big.Int).Mul(big.NewInt(part[0]), big.NewInt(part[1])))
	}
	total.Add(total, big.NewInt(999999))
	total.Quo(total, big.NewInt(1000000))
	if !total.IsInt64() || total.Int64() > t.MaxRequestMinor {
		return 0, ErrCostOverflow
	}
	return total.Int64(), nil
}

// Reservation is an upper bound, using no cache discount. A provider adapter
// must enforce these input/output limits before making its expensive call.
func (t Tariff) Reservation() (int64, error) {
	cost, err := t.Cost(Usage{InputTokens: t.MaxInputTokens, OutputTokens: t.MaxOutputTokens})
	if err != nil {
		return 0, err
	}
	if cost == 0 {
		return 0, ErrInvalidTariff
	}
	return cost, nil
}
