package checkout

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestBudgetConcurrentAndExpiry(t *testing.T) {
	var l limiter
	now := time.Now()
	var allowed atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); if l.allow("token", 20, now) { allowed.Add(1) } }()
	}
	wg.Wait()
	if allowed.Load() != 20 { t.Fatalf("allowed %d; expected 20", allowed.Load()) }
	if !l.allow("different-token", 20, now) { t.Fatal("unrelated token blocked") }
	if !l.allow("token", 20, now.Add(time.Minute)) { t.Fatal("expired bucket not released") }
}

func TestBudgetMemoryBound(t *testing.T) {
	var l limiter
	now := time.Now()
	for i := 0; i < 4096; i++ { if !l.allow(string(rune(i)), 1, now) { t.Fatal("early cap") } }
	if l.allow("extra", 1, now) { t.Fatal("unbounded random token growth") }
	if !l.allow("extra", 1, now.Add(time.Minute)) { t.Fatal("expired buckets not reclaimed") }
}
