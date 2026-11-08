package checkout

import (
	"context"
	"github.com/gorilla/websocket"
	"github.com/masharzy/briofold/backend/internal/authz"
	"net/http"
	"sync"
	"time"
)

type inboxRealtimeHub struct {
	sync.Mutex
	ready       bool
	total       int
	subscribers map[string]map[chan struct{}]struct{}
}

func (s *Service) inboxHub() *inboxRealtimeHub {
	s.realtimeOnce.Do(func() { s.realtimeHub = &inboxRealtimeHub{subscribers: make(map[string]map[chan struct{}]struct{})} })
	return s.realtimeHub
}
func (h *inboxRealtimeHub) publish(workspace string) {
	h.Lock()
	defer h.Unlock()
	for ws, clients := range h.subscribers {
		if workspace != "" && workspace != ws {
			continue
		}
		for ch := range clients {
			select {
			case ch <- struct{}{}:
			default:
			}
		}
	}
}
func (h *inboxRealtimeHub) subscribe(workspace string) (chan struct{}, bool) {
	h.Lock()
	defer h.Unlock()
	if !h.ready || h.total >= 512 || len(h.subscribers[workspace]) >= 64 {
		return nil, false
	}
	ch := make(chan struct{}, 1)
	if h.subscribers[workspace] == nil {
		h.subscribers[workspace] = make(map[chan struct{}]struct{})
	}
	h.subscribers[workspace][ch] = struct{}{}
	h.total++
	return ch, true
}
func (h *inboxRealtimeHub) unsubscribe(workspace string, ch chan struct{}) {
	h.Lock()
	defer h.Unlock()
	delete(h.subscribers[workspace], ch)
	if len(h.subscribers[workspace]) == 0 {
		delete(h.subscribers, workspace)
	}
	h.total--
}
func (s *Service) RunInboxRealtime(ctx context.Context) {
	h := s.inboxHub()
	for ctx.Err() == nil {
		conn, err := s.Pipeline.Control.Acquire(ctx)
		if err == nil {
			_, err = conn.Exec(ctx, "LISTEN briofold_inbox_changed")
			if err == nil {
				h.Lock()
				h.ready = true
				h.Unlock()
				h.publish("")
			}
			for err == nil {
				var notification string
				n, e := conn.Conn().WaitForNotification(ctx)
				err = e
				if e == nil {
					notification = n.Payload
					if uuidPattern.MatchString(notification) {
						h.publish(notification)
					}
				}
			}
			h.Lock()
			h.ready = false
			h.Unlock()
			// Never return a broken LISTEN connection to the application pool.
			raw := conn.Hijack()
			_ = raw.Close(context.Background())
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}
func (s *Service) HandleInboxRealtime(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") == "" || !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if s == nil || s.Auth == nil || s.Pipeline == nil || s.Pipeline.Control == nil {
		fail(w, 503, "INBOX_UNAVAILABLE")
		return
	}
	cookie, err := r.Cookie("__Secure-briofold-api-session")
	if err != nil {
		cookie, err = r.Cookie("briofold-session")
	}
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	workspace, realm := r.PathValue("workspaceID"), explicitRealm(r)
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	if _, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, workspace, authz.Environment(realm), authz.InboxRead); err != nil {
		authError(w, err)
		return
	}
	h := s.inboxHub()
	updates, ok := h.subscribe(workspace)
	if !ok {
		fail(w, 503, "REALTIME_UNAVAILABLE")
		return
	}
	defer h.unsubscribe(workspace, updates)
	upgrader := websocket.Upgrader{ReadBufferSize: 1024, WriteBufferSize: 1024, HandshakeTimeout: 5 * time.Second, CheckOrigin: func(req *http.Request) bool { return req.Header.Get("Origin") != "" && originAllowed(req) }}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()
	ws.SetReadLimit(1024)
	_ = ws.SetReadDeadline(time.Now().Add(70 * time.Second))
	ws.SetPongHandler(func(string) error { return ws.SetReadDeadline(time.Now().Add(70 * time.Second)) })
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, e := ws.ReadMessage(); e != nil {
				return
			}
		}
	}()
	send := func() error {
		_ = ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
		return ws.WriteJSON(map[string]string{"type": "inbox.changed"})
	}
	if send() != nil {
		return
	}
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-done:
			return
		case <-r.Context().Done():
			return
		case <-updates:
			if send() != nil {
				return
			}
		case <-heartbeat.C:
			current, e := s.Auth.Authenticate(r.Context(), cookie.Value)
			if e != nil {
				return
			}
			if _, e = s.Auth.AuthorizeWorkspace(r.Context(), current, workspace, authz.Environment(realm), authz.InboxRead); e != nil {
				return
			}
			if ws.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)) != nil {
				return
			}
		}
	}
}
