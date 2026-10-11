package checkout

import (
	"net/http"
	"sync"
	"time"
)

// Bounded per-process protection. Keys are hashed capabilities or authenticated
// workspace IDs, never forwarded IP headers. The global budget also bounds
// random-token attacks. Production edge limits remain a separate release gate.
type bucket struct {
	count int
	until time.Time
}
type limiter struct {
	mu      sync.Mutex
	buckets map[string]bucket
}

func (l *limiter) allow(key string, limit int, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.buckets == nil {
		l.buckets = make(map[string]bucket)
	}
	b := l.buckets[key]
	if !now.Before(b.until) {
		if len(l.buckets) >= 4096 {
			for k, v := range l.buckets {
				if !now.Before(v.until) {
					delete(l.buckets, k)
				}
			}
			if len(l.buckets) >= 4096 {
				return false
			}
		}
		b = bucket{until: now.Add(time.Minute)}
	}
	if b.count >= limit {
		return false
	}
	b.count++
	l.buckets[key] = b
	return true
}

func (s *Service) budget(w http.ResponseWriter, key string, limit int) bool {
	if s.limits.allow(key, limit, time.Now()) {
		return true
	}
	w.Header().Set("Retry-After", "60")
	fail(w, http.StatusTooManyRequests, "RATE_LIMITED")
	return false
}
