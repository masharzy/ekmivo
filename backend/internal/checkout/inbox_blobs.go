package checkout

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"time"
)

// Seller-sent attachments are held only briefly in the control database (not in object storage) so the
// channel can fetch them, retries can re-send them, and the chat can still show them for a short while.
const inboxBlobPrefix = "blob/"
const inboxBlobTTL = "48 hours"

var inboxBlobLastPurge atomic.Int64

func (s *Service) inboxBlobPut(ctx context.Context, workspace, key string, data []byte) error {
	_, err := s.Pipeline.Control.Exec(ctx, "SELECT inbox_blob_put($1,$2::uuid,$3)", key, workspace, data)
	return err
}

func (s *Service) inboxBlobHas(ctx context.Context, key string) bool {
	var ok bool
	return s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_blob_has($1)", key).Scan(&ok) == nil && ok
}

// inboxObjectGet reads a stored attachment: transient database blob, or legacy object-storage key.
func (s *Service) inboxObjectGet(ctx context.Context, key string) ([]byte, error) {
	if !strings.HasPrefix(key, inboxBlobPrefix) {
		return objectRequest(ctx, "GET", key, nil)
	}
	var data []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_blob_get($1)", key).Scan(&data); err != nil || len(data) == 0 {
		return nil, errors.New("MEDIA_EXPIRED")
	}
	return data, nil
}

// inboxBlobPurge deletes expired blobs at most once every ten minutes per process.
func (s *Service) inboxBlobPurge(ctx context.Context) {
	now := time.Now().Unix()
	last := inboxBlobLastPurge.Load()
	if now-last < 600 || !inboxBlobLastPurge.CompareAndSwap(last, now) {
		return
	}
	_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_blob_purge($1::interval)", inboxBlobTTL)
}
