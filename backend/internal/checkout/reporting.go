package checkout

import (
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"net/http"
	"time"
	"strconv"
	"strings"
)

func (s *Service) HandleReports(w http.ResponseWriter, r *http.Request) {
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !s.pipelineReady() || !uuidPattern.MatchString(ws) || s.pipelinePool(realm) == nil {
		fail(w, 503, "REPORT_SOURCE_UNAVAILABLE")
		return
	}
	_, _, e := s.documentActor(r, ws, realm, "payments", false)
	if e != nil {
		authError(w, e)
		return
	}
	start, err := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	if !s.planFeature(w, r, ws, realm, "reports") {
		return
	}
	end, err2 := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	account := r.URL.Query().Get("account")
	if err != nil || err2 != nil || !end.After(start) || end.Sub(start) > 366*24*time.Hour || account != "" && !uuidPattern.MatchString(account) {
		fail(w, 422, "INVALID_REPORT_FILTERS")
		return
	}
	var raw []byte
	var refundRaw []byte
	e = s.creationScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
		if err := tx.QueryRow(r.Context(), "SELECT pg13_reports($1::uuid,$2,$3,$4,$5::uuid)",
			ws, realm, start, end, nullableID(account)).Scan(&raw); err != nil {
			return err
		}
		// Include late receipts whose seller refund case has no verified payment.
		return tx.QueryRow(r.Context(), "SELECT pg56_refund_summary($1::uuid,$2,$3,$4,$5::uuid)",
			ws, realm, start, end, nullableID(account)).Scan(&refundRaw)
	})
	if e != nil {
		mapped(w, e)
		return
	}
	var data map[string]any
	var refunds struct {
		Items                       []any `json:"items"`
		RequestCount                int64 `json:"request_count"`
		OpenRequestedMinor          int64 `json:"open_requested_minor"`
		SellerReportedReturnedMinor int64 `json:"seller_reported_returned_minor"`
	}
	if json.Unmarshal(raw, &data) != nil || json.Unmarshal(refundRaw, &refunds) != nil || data == nil {
		fail(w, 503, "REPORT_SOURCE_UNAVAILABLE")
		return
	}
	data["refunds"] = refunds.Items
	data["refund_request_count"] = refunds.RequestCount
	data["open_requested_refund_minor"] = refunds.OpenRequestedMinor
	// Returned is seller-reported, never independently verified.
	data["seller_reported_returned_minor"] = refunds.SellerReportedReturnedMinor
	write(w, 200, data)
}
func (s *Service) HandleNotifications(w http.ResponseWriter, r *http.Request) {
	ws, realm := r.PathValue("workspaceID"), explicitRealm(r)
	if !s.pipelineReady() || !uuidPattern.MatchString(ws) || s.pipelinePool(realm) == nil {
		fail(w, 503, "NOTIFICATION_SOURCE_UNAVAILABLE")
		return
	}
	actor, _, e := s.documentActor(r, ws, realm, "payments", false)
	if e != nil {
		authError(w, e)
		return
	}
	if actor == "" {
		fail(w, 403, "SESSION_REQUIRED")
		return
	}
	var raw []byte
	if r.Method == "GET" {
		query := r.URL.Query()
		pageMode := query.Has("page") || query.Has("page_size") || query.Has("filter") || query.Has("status") || query.Has("q")
		if pageMode {
			page, size := 1, 20
			var parseErr error
			if query.Has("page") {
				page, parseErr = strconv.Atoi(query.Get("page"))
			}
			if parseErr == nil && query.Has("page_size") {
				size, parseErr = strconv.Atoi(query.Get("page_size"))
			}
			filter, status, term := query.Get("filter"), query.Get("status"), strings.TrimSpace(query.Get("q"))
			if filter == "" { filter = "all" }
			if status == "" { status = "all" }
			if parseErr != nil || page < 1 || page > 2000 ||
				(size != 10 && size != 20 && size != 50) ||
				(filter != "all" && filter != "payments" && filter != "refunds" && filter != "alerts") ||
				(status != "all" && status != "read" && status != "unread") ||
				len([]rune(term)) > 80 || strings.ContainsAny(term, "\r\n\t") {
				fail(w, 422, "INVALID_NOTIFICATION_FILTERS")
				return
			}
			e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(),
					"SELECT pg103_notification_page($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)",
					ws, realm, actor, page, size, filter, status, term).Scan(&raw)
			})
		} else {
			e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
				return tx.QueryRow(r.Context(), "SELECT pg13_notification_list($1::uuid,$2,$3::uuid)", ws, realm, actor).Scan(&raw)
			})
		}
	} else {
		if !originAllowed(r) || (r.PathValue("notificationID") != "all" && !uuidPattern.MatchString(r.PathValue("notificationID"))) {
			fail(w, 403, "ACTION_DENIED")
			return
		}
		var accepted bool
		e = s.pipelineScoped(r.Context(), ws, realm, func(tx pgx.Tx) error {
			if r.PathValue("notificationID") == "all" {
				return tx.QueryRow(r.Context(), "SELECT pg13_notification_read_all($1::uuid,$2,$3::uuid)", ws, realm, actor).Scan(&accepted)
			}
			return tx.QueryRow(r.Context(), "SELECT pg13_notification_read($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, r.PathValue("notificationID"), actor).Scan(&accepted)
		})
		raw = []byte(`{"read":true}`)
	}
	if e != nil {
		mapped(w, e)
		return
	}
	var data any
	_ = json.Unmarshal(raw, &data)
	write(w, 200, data)
}
