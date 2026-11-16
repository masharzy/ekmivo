package servicehealth

import (
	"testing"
	"time"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func TestNotEnabledIsUnknown(t *testing.T) {
	r := New(nil)
	r.Result(AI, false)
	if got := r.State(AI); got != Unknown {
		t.Fatalf("got %s, want unknown", got)
	}
}

func TestEnabledWithoutTrafficIsOperational(t *testing.T) {
	r := New(nil)
	r.Enable(SMS, 0)
	if got := r.State(SMS); got != Operational {
		t.Fatalf("got %s, want operational", got)
	}
}

func TestStaleLoopIsDown(t *testing.T) {
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	r := New(c.now)
	r.Enable(AI, 30*time.Second)
	c.t = c.t.Add(20 * time.Second)
	if got := r.State(AI); got != Operational {
		t.Fatalf("fresh loop: got %s", got)
	}
	c.t = c.t.Add(20 * time.Second)
	if got := r.State(AI); got != Down {
		t.Fatalf("stale loop: got %s, want down", got)
	}
	r.Beat(AI)
	if got := r.State(AI); got != Operational {
		t.Fatalf("after beat: got %s", got)
	}
}

func TestFailureRatios(t *testing.T) {
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	r := New(c.now)
	r.Enable(Chat, 0)
	r.Result(Chat, false)
	r.Result(Chat, false)
	if got := r.State(Chat); got != Operational {
		t.Fatalf("below minimum samples: got %s", got)
	}
	r.Result(Chat, true)
	if got := r.State(Chat); got != Degraded {
		t.Fatalf("2 of 3 failed: got %s, want degraded", got)
	}
	r.Result(Chat, true)
	if got := r.State(Chat); got != Operational {
		t.Fatalf("2 of 4 failed: got %s, want operational", got)
	}
	r2 := New(c.now)
	r2.Enable(Webhooks, 0)
	for i := 0; i < 3; i++ {
		r2.Result(Webhooks, false)
	}
	if got := r2.State(Webhooks); got != Down {
		t.Fatalf("all failed: got %s, want down", got)
	}
}

func TestOldOutcomesExpire(t *testing.T) {
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	r := New(c.now)
	r.Enable(SMS, 0)
	for i := 0; i < 5; i++ {
		r.Result(SMS, false)
	}
	c.t = c.t.Add(11 * time.Minute)
	if got := r.State(SMS); got != Operational {
		t.Fatalf("expired failures: got %s, want operational", got)
	}
}

func TestSamplesAreBounded(t *testing.T) {
	r := New(nil)
	r.Enable(AI, 0)
	for i := 0; i < maxSamples*3; i++ {
		r.Result(AI, true)
	}
	if n := len(r.items[AI].outcomes); n != maxSamples {
		t.Fatalf("kept %d samples, want %d", n, maxSamples)
	}
}
