// Package servicehealth keeps an in-memory, per-process view of whether each
// public Briofold service is working. It never stores customer data and never
// touches a database: callers report outcomes, the status endpoint reads them.
//
// A component reports nothing until the process enables it. Only platform-side
// failures count: a merchant's own endpoint, balance or token problems must not
// be reported as a failure.
package servicehealth

import (
	"sync"
	"time"
)

type Component string

const (
	AI       Component = "ai"
	Chat     Component = "chat"
	SMS      Component = "sms"
	Webhooks Component = "webhooks"
)

// All lists the components this package tracks, in display order.
var All = []Component{SMS, AI, Chat, Webhooks}

type State string

const (
	Operational State = "operational"
	Degraded    State = "degraded"
	Down        State = "down"
	Unknown     State = "unknown"
)

const (
	window     = 10 * time.Minute
	minSamples = 3
	maxSamples = 200
)

type outcome struct {
	at time.Time
	ok bool
}

type entry struct {
	enabled    bool
	staleAfter time.Duration // 0: the component has no loop heartbeat
	lastBeat   time.Time
	outcomes   []outcome
}

type Registry struct {
	mu    sync.Mutex
	now   func() time.Time
	items map[Component]*entry
}

func New(now func() time.Time) *Registry {
	if now == nil {
		now = time.Now
	}
	return &Registry{now: now, items: map[Component]*entry{}}
}

var global = New(nil)

// Default is the process-wide registry used by the API.
func Default() *Registry { return global }

func (r *Registry) get(c Component) *entry {
	e := r.items[c]
	if e == nil {
		e = &entry{}
		r.items[c] = e
	}
	return e
}

// Enable marks a component as running in this process. staleAfter > 0 means
// the component has a loop that must Beat at least that often.
func (r *Registry) Enable(c Component, staleAfter time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e := r.get(c)
	e.enabled = true
	if staleAfter > e.staleAfter {
		e.staleAfter = staleAfter
	}
	if staleAfter > 0 && e.lastBeat.IsZero() {
		e.lastBeat = r.now()
	}
}

// Beat records that a component's loop is alive.
func (r *Registry) Beat(c Component) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.get(c).lastBeat = r.now()
}

// Result records one platform-side outcome.
func (r *Registry) Result(c Component, ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e := r.get(c)
	e.outcomes = append(e.outcomes, outcome{at: r.now(), ok: ok})
	if len(e.outcomes) > maxSamples {
		e.outcomes = append([]outcome(nil), e.outcomes[len(e.outcomes)-maxSamples:]...)
	}
}

// State reports a component's current state.
func (r *Registry) State(c Component) State {
	r.mu.Lock()
	defer r.mu.Unlock()
	e := r.items[c]
	if e == nil || !e.enabled {
		return Unknown
	}
	now := r.now()
	if e.staleAfter > 0 && now.Sub(e.lastBeat) > e.staleAfter {
		return Down
	}
	total, failed := 0, 0
	for _, o := range e.outcomes {
		if now.Sub(o.at) > window {
			continue
		}
		total++
		if !o.ok {
			failed++
		}
	}
	if total < minSamples || failed == 0 {
		return Operational
	}
	if failed == total {
		return Down
	}
	if failed*2 > total {
		return Degraded
	}
	return Operational
}

// Snapshot reports every tracked component.
func (r *Registry) Snapshot() map[Component]State {
	out := make(map[Component]State, len(All))
	for _, c := range All {
		out[c] = r.State(c)
	}
	return out
}

// Enable, Beat and Result on the process-wide registry.
func Enable(c Component, staleAfter time.Duration) { global.Enable(c, staleAfter) }
func Beat(c Component)                             { global.Beat(c) }
func Result(c Component, ok bool)                  { global.Result(c, ok) }
