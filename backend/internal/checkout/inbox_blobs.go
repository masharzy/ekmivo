package checkout

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

// Seller-sent attachments are NOT stored in object storage or the database. They are kept only in this
// process's memory for a few minutes so the sender loop can upload them to the channel (and retry a
// failed send). After the TTL, or a restart, the bytes are gone; the seller still has the original in
// the browser and can send again.
const inboxBlobPrefix = "blob/"
const inboxMemTTL = 15 * time.Minute
const inboxMemCap = 256 << 20

type inboxMemBlob struct {
	data []byte
	at   time.Time
}

var inboxMem = struct {
	sync.Mutex
	items map[string]inboxMemBlob
	bytes int
}{items: map[string]inboxMemBlob{}}

func inboxMemSweepLocked() {
	cutoff := time.Now().Add(-inboxMemTTL)
	for k, v := range inboxMem.items {
		if v.at.Before(cutoff) {
			inboxMem.bytes -= len(v.data)
			delete(inboxMem.items, k)
		}
	}
}

func (s *Service) inboxBlobPut(_ context.Context, _ string, key string, data []byte) error {
	inboxMem.Lock()
	defer inboxMem.Unlock()
	inboxMemSweepLocked()
	if old, ok := inboxMem.items[key]; ok {
		inboxMem.bytes -= len(old.data)
	}
	if inboxMem.bytes+len(data) > inboxMemCap {
		return errors.New("MEDIA_STORE_FULL")
	}
	inboxMem.items[key] = inboxMemBlob{data: data, at: time.Now()}
	inboxMem.bytes += len(data)
	return nil
}

func (s *Service) inboxBlobHas(_ context.Context, key string) bool {
	inboxMem.Lock()
	defer inboxMem.Unlock()
	v, ok := inboxMem.items[key]
	return ok && time.Since(v.at) <= inboxMemTTL
}

// inboxObjectGet reads a held attachment (memory) or a legacy object-storage key.
func (s *Service) inboxObjectGet(ctx context.Context, key string) ([]byte, error) {
	if !strings.HasPrefix(key, inboxBlobPrefix) {
		return objectRequest(ctx, "GET", key, nil)
	}
	inboxMem.Lock()
	defer inboxMem.Unlock()
	v, ok := inboxMem.items[key]
	if !ok || time.Since(v.at) > inboxMemTTL {
		return nil, errors.New("MEDIA_EXPIRED")
	}
	return v.data, nil
}

func (s *Service) inboxBlobPurge(_ context.Context) {
	inboxMem.Lock()
	defer inboxMem.Unlock()
	inboxMemSweepLocked()
}
