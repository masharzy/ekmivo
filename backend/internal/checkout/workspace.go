package checkout

import (
	"encoding/json"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"net/http"
	"net/mail"
	"os"
	"strings"
	"time"
)

func (s *Service) HandleWorkspaceTools(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil {
		fail(w, 503, "WORKSPACE_UNAVAILABLE")
		return
	}
	cookie, e := r.Cookie("ekmivo-session")
	if e != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, e := s.Auth.Authenticate(r.Context(), cookie.Value)
	if e != nil {
		authError(w, e)
		return
	}
	if r.Method != "GET" && !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if r.PathValue("tool") == "accept-invite" {
		var b struct {
			Token string `json:"token"`
		}
		if decodeBounded(w, r, &b, 1024) != nil || !tokenPattern.MatchString(b.Token) {
			fail(w, 422, "INVALID_INVITE")
			return
		}
		var ws string
		e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_invite_accept($1::uuid,$2)", actor.UserID, digest(b.Token)).Scan(&ws)
		if e != nil {
			mapped(w, e)
			return
		}
		write(w, 200, map[string]string{"workspace_id": ws})
		return
	}
	ws, resource := r.PathValue("workspaceID"), r.PathValue("tool")
	if !uuidPattern.MatchString(ws) {
		fail(w, 404, "NOT_FOUND")
		return
	}
	if resource == "channel-scopes" && (os.Getenv("BRIOFOLD_MEMBER_CHANNEL_SCOPES_ENABLED") != "true" || !s.Auth.GranularGrants) {
		fail(w, 503, "CHANNEL_SCOPES_UNAVAILABLE")
		return
	}
	if resource == "groups" && !s.Auth.GranularGrants {
		fail(w, 503, "GROUP_PERMISSIONS_UNAVAILABLE")
		return
	}
	if !s.budget(w, "workspace-tools:"+actor.UserID, 60) {
		return
	}
	var raw []byte
	if r.Method == "GET" {
		target := r.PathValue("targetID")
		if resource == "channel-settings" {
			if target != "" && !uuidPattern.MatchString(target) {
				fail(w, 404, "NOT_FOUND")
				return
			}
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_channel_settings_read($1::uuid,$2::uuid,$3::uuid)", ws, actor.UserID, nullableID(target)).Scan(&raw)
		} else if resource == "help-videos" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_help_videos_read($1::uuid,$2::uuid,$3)", ws, actor.UserID, r.URL.Query().Get("kind")).Scan(&raw)
		} else if resource == "channel-scopes" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_channel_scopes_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
		} else if resource == "groups" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_team_groups_read($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&raw)
		} else if resource == "help" && target != "" {
			if !uuidPattern.MatchString(target) {
				fail(w, 404, "NOT_FOUND")
				return
			}
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_feedback_screenshot_read($1::uuid,$2::uuid,$3::uuid)", ws, actor.UserID, target).Scan(&raw)
		} else {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_workspace_read($1::uuid,$2::uuid,$3)", ws, actor.UserID, resource).Scan(&raw)
		}
	} else {
		var b map[string]any
		limit := int64(8192)
		if resource == "channel-settings" {
			limit = 16384
		}
		if resource == "help" {
			limit = 750000
		}
		if decodeBounded(w, r, &b, limit) != nil {
			fail(w, 422, "INVALID_WORKSPACE_ACTION")
			return
		}
		target := r.PathValue("targetID")
		if s.Auth.GranularGrants && resource != "help" && resource != "help-videos" {
			cap := "members:manage"
			if resource == "channel-settings" {
				cap = "inbox:manage"
			}
			if resource == "settings" {
				cap = "workspace:settings"
			}
			var allowed *bool
			if err := s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_capability_override($1::uuid,$2::uuid,$3)", ws, actor.UserID, cap).Scan(&allowed); err != nil {
				fail(w, 503, "WORKSPACE_UNAVAILABLE")
				return
			}
			if allowed != nil && !*allowed {
				fail(w, 403, "ACCESS_DENIED")
				return
			}
		}
		if resource == "change-role" || resource == "remove-member" || resource == "grants" || resource == "transfer-owner" || resource == "groups" || resource == "channel-scopes" {
			password, _ := b["current_password"].(string)
			if e = s.Auth.ConfirmPassword(r.Context(), actor, password); e != nil {
				authError(w, e)
				return
			}
		}
		delete(b, "current_password")
		if target != "" && !uuidPattern.MatchString(target) {
			fail(w, 404, "NOT_FOUND")
			return
		}
		switch resource {
		case "channel-settings":
			if key, ok := b["operation_key"].(string); !ok || !uuidPattern.MatchString(key) {
				fail(w, 422, "INVALID_CHANNEL_OPERATION")
				return
			}
		case "help-videos":
			id, _ := b["id"].(string)
			if !uuidPattern.MatchString(id) {
				fail(w, 422, "INVALID_TUTORIAL")
				return
			}
		case "groups":
			act, _ := b["action"].(string)
			payload, ok := b["body"].(map[string]any)
			if !ok || (act != "create" && act != "update" && act != "archive") {
				fail(w, 422, "INVALID_TEAM_GROUP")
				return
			}
			id, _ := payload["id"].(string)
			if !uuidPattern.MatchString(id) {
				fail(w, 422, "INVALID_TEAM_GROUP")
				return
			}
		case "invite":
			email, _ := b["email"].(string)
			email = strings.ToLower(strings.TrimSpace(email))
			parsed, err := mail.ParseAddress(email)
			if err != nil || parsed.Address != email || len(email) > 254 {
				fail(w, 422, "INVALID_EMAIL")
				return
			}
			cap, err := randomCapability()
			if err != nil {
				fail(w, 503, "INVITE_UNAVAILABLE")
				return
			}
			b["email"] = email
			b["token_digest"] = digest(cap)
			// Only the authorized inviter sees this once. Acceptance also requires the
			// recipient's independently verified account email; possession alone fails.
			b["_return_token"] = cap
		case "resend-invite":
			cap, err := randomCapability()
			if err != nil {
				fail(w, 503, "INVITE_UNAVAILABLE")
				return
			}
			b["token_digest"] = digest(cap)
			b["_return_token"] = cap
		case "help":
			if normalizeFeedbackScreenshot(b) != nil {
				fail(w, 422, "INVALID_SCREENSHOT")
				return
			}
			if key := r.Header.Get("Idempotency-Key"); key != "" && !uuidPattern.MatchString(key) {
				fail(w, 422, "INVALID_OPERATION_KEY")
				return
			}
			if topic, ok := b["topic"].(string); ok && !map[string]bool{"payments": true, "sms": true, "refunds": true, "account": true, "bug": true, "feature": true, "usability": true, "other": true}[topic] {
				fail(w, 422, "INVALID_SUPPORT_TOPIC")
				return
			}
			subject, _ := b["subject"].(string)
			message, _ := b["message"].(string)
			if len(strings.TrimSpace(subject)) < 3 || len(subject) > 160 || len(strings.TrimSpace(message)) < 10 || len(message) > 4000 {
				fail(w, 422, "INVALID_SUPPORT_REQUEST")
				return
			}
		case "settings":
			body, ok := b["body"].(map[string]any)
			if !ok {
				fail(w, 422, "INVALID_SETTINGS")
				return
			}
			allowed := map[string]bool{"name": true, "support_email": true, "support_url": true, "legal_url": true, "timezone": true, "locale": true, "notification_email": true, "logo_url": true, "checkout_title": true, "checkout_description": true}
			for key, value := range body {
				if !allowed[key] {
					fail(w, 422, "INVALID_SETTINGS_FIELD")
					return
				}
				text, ok := value.(string)
				if !ok || len(text) > 500 || strings.ContainsAny(text, "\x00\r\n") {
					fail(w, 422, "INVALID_SETTINGS_FIELD")
					return
				}
				if strings.HasSuffix(key, "_url") && text != "" {
					if _, err := merchantwebhook.ValidateURL(text); err != nil {
						fail(w, 422, "INVALID_PUBLIC_URL")
						return
					}
				}
				if key == "timezone" {
					if _, err := time.LoadLocation(text); err != nil {
						fail(w, 422, "INVALID_TIMEZONE")
						return
					}
				}
				if key == "locale" && text != "en" && text != "bn" {
					fail(w, 422, "INVALID_LOCALE")
					return
				}
				if strings.HasSuffix(key, "_email") && text != "" {
					a, err := mail.ParseAddress(text)
					if err != nil || a.Address != text {
						fail(w, 422, "INVALID_EMAIL")
						return
					}
				}
			}
		case "revoke-invite", "remove-member", "change-role", "grants", "transfer-owner", "channel-scopes":
		default:
			fail(w, 404, "NOT_FOUND")
			return
		}
		returnCap, _ := b["_return_token"].(string)
		delete(b, "_return_token")
		data, _ := json.Marshal(b)
		if resource == "channel-settings" {
			payload, _ := json.Marshal(b)
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_channel_settings_write($1::uuid,$2::uuid,$3::uuid,$4::jsonb)", ws, actor.UserID, b["operation_key"], string(payload)).Scan(&raw)
		} else if resource == "help-videos" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_help_video_progress($1::uuid,$2::uuid,$3::jsonb)", ws, actor.UserID, string(data)).Scan(&raw)
		} else if resource == "help" {
			var ready bool
			if e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT to_regprocedure('public.briofold_feedback_write(uuid,uuid,uuid,jsonb)') IS NOT NULL").Scan(&ready); e != nil {
				fail(w, 503, "SUPPORT_UNAVAILABLE")
				return
			}
			if !ready {
				if b["screenshot"] != nil {
					fail(w, 503, "SUPPORT_SCREENSHOT_UNAVAILABLE")
					return
				}
				e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_workspace_write($1::uuid,$2::uuid,'help',$3::jsonb,NULL)", ws, actor.UserID, string(data)).Scan(&raw)
			} else {
				e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_feedback_write($1::uuid,$2::uuid,$3::uuid,$4::jsonb)", ws, actor.UserID, nullableID(r.Header.Get("Idempotency-Key")), string(data)).Scan(&raw)
			}
		} else if resource == "channel-scopes" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_channel_scopes_write($1::uuid,$2::uuid,$3::jsonb)", ws, actor.UserID, string(data)).Scan(&raw)
		} else if resource == "groups" {
			groupBody, _ := json.Marshal(b["body"])
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT briofold_team_groups_write($1::uuid,$2::uuid,$3,$4::jsonb)", ws, actor.UserID, b["action"], string(groupBody)).Scan(&raw)
		} else if resource == "resend-invite" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_invite_resend($1::uuid,$2::uuid,$3::uuid,$4)", ws, actor.UserID, nullableID(target), b["token_digest"]).Scan(&raw)
		} else if resource == "grants" {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_grants($1::uuid,$2::uuid,$3::uuid,$4::jsonb)", ws, actor.UserID, nullableID(target), string(data)).Scan(&raw)
		} else if resource == "transfer-owner" {
			var transferred bool
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_transfer_owner($1::uuid,$2::uuid,$3::uuid)", ws, actor.UserID, nullableID(target)).Scan(&transferred)
			raw, _ = json.Marshal(map[string]bool{"transferred": transferred})
		} else {
			e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_workspace_write($1::uuid,$2::uuid,$3,$4::jsonb,$5::uuid)", ws, actor.UserID, resource, string(data), nullableID(target)).Scan(&raw)
		}
		if e == nil && returnCap != "" {
			var result map[string]any
			_ = json.Unmarshal(raw, &result)
			result["invitation_token"] = returnCap
			result["delivery_status"] = "manual_share_required"
			raw, _ = json.Marshal(result)
		}
	}
	if e != nil {
		inboxWorkFailure(w, e)
		return
	}
	if r.Method == "GET" && resource == "team" && s.Auth.GranularGrants {
		var grants []byte
		if e = s.Auth.DB.QueryRowContext(r.Context(), "SELECT pg13_team_grants($1::uuid,$2::uuid)", ws, actor.UserID).Scan(&grants); e != nil {
			mapped(w, e)
			return
		}
		var data map[string]any
		var values any
		if json.Unmarshal(raw, &data) != nil || json.Unmarshal(grants, &values) != nil {
			fail(w, 503, "WORKSPACE_UNAVAILABLE")
			return
		}
		data["grants"] = values
		raw, _ = json.Marshal(data)
	}
	var result any
	if json.Unmarshal(raw, &result) != nil {
		fail(w, 503, "WORKSPACE_UNAVAILABLE")
		return
	}
	write(w, 200, result)
}
