package aicredits

import (
	"errors"
	"math"
	"testing"
)

// Synthetic rates are arithmetic fixtures, not an approved commercial catalog.
func fixtureTariff() Tariff {
	return Tariff{Version: "test-v1", Model: "fixture-model", Currency: "BDT", InputMinorPerMillion: 1000, CachedInputMinorPerMillion: 100, OutputMinorPerMillion: 2000, MaxInputTokens: 10000, MaxOutputTokens: 2000, MaxRequestMinor: 100}
}

func TestCostUsesCombinedCeilingAndDoesNotDoubleCountCache(t *testing.T) {
	tariff := fixtureTariff()
	for _, tc := range []struct {
		name  string
		usage Usage
		want  int64
	}{
		{"no usage", Usage{}, 0},
		{"fraction of a paisa", Usage{InputTokens: 1}, 1},
		{"round combined once", Usage{InputTokens: 1, OutputTokens: 1}, 1},
		{"exact paisa", Usage{InputTokens: 1000}, 1},
		{"above boundary", Usage{InputTokens: 1001}, 2},
		{"cache replaces input charge", Usage{InputTokens: 10000, CachedInputTokens: 10000}, 1},
		{"mixed", Usage{InputTokens: 10000, CachedInputTokens: 5000, OutputTokens: 2000}, 10},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tariff.Cost(tc.usage)
			if err != nil || got != tc.want {
				t.Fatalf("got %d/%v, want %d", got, err, tc.want)
			}
		})
	}
	reserve, err := tariff.Reservation()
	if err != nil || reserve != 14 {
		t.Fatalf("reservation %d/%v", reserve, err)
	}
}

func TestUsageAndMissingConfigurationFailClosed(t *testing.T) {
	for _, usage := range []Usage{{InputTokens: -1}, {OutputTokens: -1}, {CachedInputTokens: -1}, {InputTokens: 1, CachedInputTokens: 2}, {InputTokens: 10001}, {OutputTokens: 2001}} {
		if _, err := fixtureTariff().Cost(usage); !errors.Is(err, ErrInvalidUsage) {
			t.Fatalf("invalid usage accepted: %#v", usage)
		}
	}
	for _, change := range []func(*Tariff){
		func(t *Tariff) { t.Version = "" }, func(t *Tariff) { t.Model = "" }, func(t *Tariff) { t.Currency = "USD" },
		func(t *Tariff) { t.InputMinorPerMillion = -1 }, func(t *Tariff) { t.CachedInputMinorPerMillion = 1001 },
		func(t *Tariff) {
			t.InputMinorPerMillion = 0
			t.CachedInputMinorPerMillion = 0
			t.OutputMinorPerMillion = 0
		},
		func(t *Tariff) { t.MaxInputTokens = 0 }, func(t *Tariff) { t.MaxOutputTokens = 0 }, func(t *Tariff) { t.MaxRequestMinor = 0 },
	} {
		tariff := fixtureTariff()
		change(&tariff)
		if _, err := tariff.Reservation(); !errors.Is(err, ErrInvalidTariff) {
			t.Fatal("invalid tariff accepted", err)
		}
	}
}

func TestOverflowAndRequestCapNeverWrapOrUnderReserve(t *testing.T) {
	tariff := fixtureTariff()
	tariff.InputMinorPerMillion = math.MaxInt64
	tariff.MaxInputTokens = math.MaxInt64
	if _, err := tariff.Reservation(); !errors.Is(err, ErrCostOverflow) {
		t.Fatal("overflow accepted", err)
	}
	tariff = fixtureTariff()
	tariff.MaxRequestMinor = 13
	if _, err := tariff.Reservation(); !errors.Is(err, ErrCostOverflow) {
		t.Fatal("underfunded bound accepted", err)
	}
}

func FuzzCostNeverExceedsReservation(f *testing.F) {
	f.Add(uint64(1000), uint64(20), uint64(300))
	f.Fuzz(func(t *testing.T, input, output, cached uint64) {
		tariff := fixtureTariff()
		u := Usage{InputTokens: int64(input % 10001), OutputTokens: int64(output % 2001)}
		u.CachedInputTokens = int64(cached % uint64(u.InputTokens+1))
		cost, err := tariff.Cost(u)
		if err != nil {
			t.Fatal(err)
		}
		bound, err := tariff.Reservation()
		if err != nil || cost < 0 || cost > bound {
			t.Fatalf("cost %d exceeds reservation %d (%v)", cost, bound, err)
		}
	})
}
