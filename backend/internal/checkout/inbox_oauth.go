package checkout

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

func metaConfig() (string, string, string, string, error) {
	app, secret, version, redirect := os.Getenv("META_APP_ID"), os.Getenv("META_APP_SECRET"), os.Getenv("META_GRAPH_VERSION"), os.Getenv("META_OAUTH_REDIRECT_URI")
	u, err := url.Parse(redirect)
	if app == "" || secret == "" || !strings.HasPrefix(version, "v") || strings.ContainsAny(version, "/?#") || err != nil || u.Scheme != "https" || u.Host == "" {
		return "", "", "", "", errors.New("channel not configured")
	}
	return app, secret, version, redirect, nil
}
func metaGet(r *http.Request, version, path, token string, out any) error {
	req, err := http.NewRequestWithContext(r.Context(), "GET", "https://graph.facebook.com/"+version+"/"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	response, err := inboxHTTP.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return errors.New("provider request rejected")
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1048576)).Decode(out)
}
func metaSubscribe(r *http.Request, version, account, token, fields string) error {
	form := url.Values{}
	if fields != "" {
		form.Set("subscribed_fields", fields)
	}
	req, err := http.NewRequestWithContext(r.Context(), "POST", "https://graph.facebook.com/"+version+"/"+url.PathEscape(account)+"/subscribed_apps", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := inboxHTTP.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("webhook subscription rejected")
	}
	var result struct {
		Success bool `json:"success"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result) != nil || !result.Success {
		return errors.New("webhook subscription not confirmed")
	}
	return nil
}
func (s *Service) HandleInboxOAuthBegin(w http.ResponseWriter, r *http.Request) {
	ws, e := r.PathValue("workspaceID"), explicitRealm(r)
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if err := s.mobileSession(r, ws, e); err != nil {
		authError(w, err)
		return
	}
	var b struct {
		Provider string `json:"provider"`
	}
	if decodeBounded(w, r, &b, 512) != nil || !(b.Provider == "wa" || b.Provider == "ig" || b.Provider == "ms") {
		fail(w, 422, "INVALID_CHANNEL")
		return
	}
	app, _, version, redirect, err := metaConfig()
	if err != nil {
		fail(w, 503, "CHANNEL_NOT_CONFIGURED")
		return
	}
	cookie, _ := r.Cookie("ekmivo-session")
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	state, err := randomCapability()
	if err != nil {
		fail(w, 503, "ENTROPY_UNAVAILABLE")
		return
	}
	if _, err = s.Pipeline.Control.Exec(r.Context(), "SELECT inbox_oauth_begin($1,$2::uuid,$3,$4::uuid,$5)", digest(state), ws, e, actor.UserID, b.Provider); err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	query := url.Values{"client_id": {app}, "redirect_uri": {redirect}, "state": {state}, "response_type": {"code"}}
	if b.Provider == "wa" {
		config := os.Getenv("META_WHATSAPP_CONFIG_ID")
		if config == "" {
			fail(w, 503, "CHANNEL_NOT_CONFIGURED")
			return
		}
		query.Set("config_id", config)
	} else {
		scope := "pages_show_list,pages_manage_metadata,pages_messaging"
		if b.Provider == "ig" {
			scope += ",instagram_basic,instagram_manage_messages"
		}
		query.Set("scope", scope)
	}
	write(w, 200, map[string]string{"url": "https://www.facebook.com/" + version + "/dialog/oauth?" + query.Encode()})
}
func (s *Service) HandleInboxOAuthCallback(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Auth == nil || s.Pipeline == nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		fail(w, 401, "UNAUTHENTICATED")
		return
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		authError(w, err)
		return
	}
	app, secret, version, redirect, err := metaConfig()
	if err != nil {
		fail(w, 503, "CHANNEL_NOT_CONFIGURED")
		return
	}
	state, code := r.URL.Query().Get("state"), r.URL.Query().Get("code")
	if !tokenPattern.MatchString(state) || len(code) < 8 || len(code) > 4096 {
		fail(w, 422, "INVALID_OAUTH_CALLBACK")
		return
	}
	var scope []byte
	if err = s.Pipeline.Control.QueryRow(r.Context(), "SELECT inbox_oauth_consume($1,$2::uuid)", digest(state), actor.UserID).Scan(&scope); err != nil {
		fail(w, 403, "OAUTH_STATE_REJECTED")
		return
	}
	var target struct {
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		Provider    string `json:"provider"`
	}
	if json.Unmarshal(scope, &target) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if err = s.mobileSession(r, target.Workspace, target.Environment); err != nil {
		authError(w, err)
		return
	}
	query := url.Values{"client_id": {app}, "client_secret": {secret}, "redirect_uri": {redirect}, "code": {code}}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", "https://graph.facebook.com/"+version+"/oauth/access_token?"+query.Encode(), nil)
	response, err := inboxHTTP.Do(req)
	if err != nil {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	var token struct {
		Token string `json:"access_token"`
	}
	parseErr := json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&token)
	response.Body.Close()
	if response.StatusCode != 200 || parseErr != nil || token.Token == "" {
		fail(w, 403, "CHANNEL_AUTHORIZATION_REJECTED")
		return
	}
	accounts := map[string]string{}
	subscriptions := map[string]string{}
	if target.Provider == "ms" || target.Provider == "ig" {
		var pages struct {
			Data []struct {
				ID        string `json:"id"`
				Token     string `json:"access_token"`
				Instagram *struct {
					ID string `json:"id"`
				} `json:"instagram_business_account"`
			} `json:"data"`
		}
		if err = metaGet(r, version, "me/accounts?fields=id,access_token,instagram_business_account&limit=100", token.Token, &pages); err != nil {
			fail(w, 503, "CHANNEL_UNAVAILABLE")
			return
		}
		for _, page := range pages.Data {
			subscriptions[page.ID] = page.Token
			if target.Provider == "ms" {
				accounts[page.ID] = page.Token
			} else if page.Instagram != nil {
				accounts[page.Instagram.ID] = page.Token
			}
		}
	} else {
		// Embedded Signup grants target WABA IDs; never enumerate unrelated accounts by guess.
		var debug struct {
			Data struct {
				Scopes []struct {
					Scope string   `json:"scope"`
					IDs   []string `json:"target_ids"`
				} `json:"granular_scopes"`
			} `json:"data"`
		}
		if err = metaGet(r, version, "debug_token?input_token="+url.QueryEscape(token.Token), app+"|"+secret, &debug); err != nil {
			fail(w, 503, "CHANNEL_UNAVAILABLE")
			return
		}
		for _, grant := range debug.Data.Scopes {
			if grant.Scope != "whatsapp_business_management" {
				continue
			}
			for _, waba := range grant.IDs {
				subscriptions[waba] = token.Token
				var phones struct {
					Data []struct {
						ID string `json:"id"`
					} `json:"data"`
				}
				if err = metaGet(r, version, url.PathEscape(waba)+"/phone_numbers?fields=id&limit=100", token.Token, &phones); err != nil {
					fail(w, 503, "CHANNEL_UNAVAILABLE")
					return
				}
				for _, phone := range phones.Data {
					accounts[phone.ID] = token.Token
				}
			}
		}
	}
	if len(accounts) == 0 {
		fail(w, 422, "NO_AUTHORIZED_CHANNEL_ACCOUNTS")
		return
	}
	for account, key := range subscriptions {
		fields := ""
		if target.Provider != "wa" {
			fields = "messages,messaging_postbacks,message_deliveries,message_reads"
		}
		if err = metaSubscribe(r, version, account, key, fields); err != nil {
			fail(w, 503, "CHANNEL_SUBSCRIPTION_UNAVAILABLE")
			return
		}
	}
	tx, err := s.Pipeline.Control.Begin(r.Context())
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	defer tx.Rollback(r.Context())
	for account, key := range accounts {
		if key == "" {
			fail(w, 422, "CHANNEL_TOKEN_UNAVAILABLE")
			return
		}
		cipher, e := deviceevidence.Encrypt(s.Pipeline.Key, []byte(key), target.Workspace+"|inbox|"+target.Provider+"|"+account)
		if e != nil {
			fail(w, 503, "SOURCE_UNAVAILABLE")
			return
		}
		var id string
		if err = tx.QueryRow(r.Context(), "SELECT inbox_connection($1::uuid,$2,$3,$4,$5)", target.Workspace, target.Environment, target.Provider, account, cipher).Scan(&id); err != nil {
			mapped(w, err)
			return
		}
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]any{"workspace_id": target.Workspace, "connected": len(accounts)})
}
