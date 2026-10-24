package checkout

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var telegramTokenPattern = regexp.MustCompile(`^[0-9]{5,20}:[A-Za-z0-9_-]{20,150}$`)

func telegramSecret(key []byte, bot string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte("telegram-webhook:v1:" + bot))
	return hex.EncodeToString(m.Sum(nil))
}

// No returned/logged provider errors: Telegram request URLs contain the token.
func telegramCall(ctx context.Context, token, method string, body any, out any) error {
	if !telegramTokenPattern.MatchString(token) {
		return errors.New("invalid bot token")
	}
	b, e := json.Marshal(body)
	if e != nil {
		return errors.New("invalid request")
	}
	req, e := http.NewRequestWithContext(ctx, "POST", "https://api.telegram.org/bot"+token+"/"+method, bytes.NewReader(b))
	if e != nil {
		return errors.New("provider unavailable")
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := inboxHTTP.Do(req)
	if e != nil {
		return errors.New("provider outcome unknown")
	}
	defer res.Body.Close()
	var envelope struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
	}
	if res.StatusCode != 200 || json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&envelope) != nil || !envelope.OK {
		return errors.New("provider rejected request")
	}
	if out != nil && json.Unmarshal(envelope.Result, out) != nil {
		return errors.New("invalid provider response")
	}
	return nil
}
func (s *Service) HandleTelegramConnect(w http.ResponseWriter, r *http.Request) {
	if s == nil || s.Pipeline == nil || s.Pipeline.Control == nil || len(s.Pipeline.Key) != 32 {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	ws, e := r.PathValue("workspaceID"), explicitRealm(r)
	if !originAllowed(r) {
		fail(w, 403, "ORIGIN_DENIED")
		return
	}
	if e != "live" {
		fail(w, 422, "TELEGRAM_LIVE_CONNECTION_ONLY")
		return
	}
	if err := s.inboxManageSession(r, ws, e); err != nil {
		authError(w, err)
		return
	}
	if !s.budget(w, "telegram-connect:"+ws, 5) {
		return
	}
	var b struct {
		Token string `json:"token"`
	}
	if decodeBounded(w, r, &b, 1024) != nil || !telegramTokenPattern.MatchString(b.Token) {
		fail(w, 422, "INVALID_BOT_TOKEN")
		return
	}
	cfg, _ := s.channelConfig(r.Context())
	origin := strings.TrimRight(cfg["CHANNEL_PUBLIC_ORIGIN"], "/")
	if !validChannelSetting("CHANNEL_PUBLIC_ORIGIN", origin) || origin == "" {
		fail(w, 503, "CHANNEL_NOT_CONFIGURED")
		return
	}
	var bot struct {
		ID       int64  `json:"id"`
		IsBot    bool   `json:"is_bot"`
		Username string `json:"username"`
	}
	if telegramCall(r.Context(), b.Token, "getMe", map[string]any{}, &bot) != nil || !bot.IsBot || bot.ID <= 0 {
		fail(w, 422, "BOT_AUTHORIZATION_REJECTED")
		return
	}
	account := strconv.FormatInt(bot.ID, 10)
	cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, []byte(b.Token), ws+"|inbox|tg|"+account)
	if err != nil {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	tx, err := s.Pipeline.Control.Begin(r.Context())
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	defer tx.Rollback(r.Context())
	// Ownership is reserved before changing the remote webhook; another business
	// cannot steal an existing bot by invoking setWebhook with a copied token.
	var id string
	if err = tx.QueryRow(r.Context(), "SELECT inbox_connection($1::uuid,$2,'tg',$3,$4)", ws, e, account, cipher).Scan(&id); err != nil {
		mapped(w, err)
		return
	}
	var enabled bool
	if telegramCall(r.Context(), b.Token, "setWebhook", map[string]any{"url": origin + "/v1/channels/telegram/" + account + "/webhook", "secret_token": telegramSecret(s.Pipeline.Key, account), "allowed_updates": []string{"message"}, "drop_pending_updates": false}, &enabled) != nil || !enabled {
		fail(w, 503, "BOT_WEBHOOK_UNCONFIRMED")
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503, "CONNECTION_SAVE_UNCONFIRMED")
		return
	}
	write(w, 200, map[string]string{"id": id, "username": bot.Username})
}

type telegramUpdate struct {
	ID      int64 `json:"update_id"`
	Message *struct {
		ID   int64  `json:"message_id"`
		Date int64  `json:"date"`
		Text string `json:"text"`
		From struct {
			ID        int64  `json:"id"`
			IsBot     bool   `json:"is_bot"`
			FirstName string `json:"first_name"`
		} `json:"from"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
	} `json:"message"`
}

func parseTelegramText(raw []byte) (telegramUpdate, bool) {
	var u telegramUpdate
	if json.Unmarshal(raw, &u) != nil || u.ID < 0 {
		return u, false
	}
	m := u.Message
	return u, m != nil && m.ID > 0 && m.Date > 0 && m.Chat.Type == "private" && m.Chat.ID > 0 && m.From.ID == m.Chat.ID && !m.From.IsBot && strings.TrimSpace(m.Text) != "" && len(m.Text) <= 16000
}
func (s *Service) HandleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	bot := r.PathValue("botID")
	if !channelNumber.MatchString(bot) || s == nil || s.Pipeline == nil || s.Pipeline.Control == nil || len(s.Pipeline.Key) != 32 {
		fail(w, 503, "CHANNEL_UNAVAILABLE")
		return
	}
	if !hmac.Equal([]byte(telegramSecret(s.Pipeline.Key, bot)), []byte(r.Header.Get("X-Telegram-Bot-Api-Secret-Token"))) {
		fail(w, 403, "WEBHOOK_VERIFICATION_REJECTED")
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
	if err != nil {
		fail(w, 413, "BODY_TOO_LARGE")
		return
	}
	u, text := parseTelegramText(raw)
	if !text {
		write(w, 200, map[string]bool{"accepted": true})
		return
	}
	hash := sha256.Sum256([]byte("tg:" + bot + ":" + strconv.FormatInt(u.ID, 10)))
	event := hex.EncodeToString(hash[:])
	cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, raw, "inbox-webhook|"+event)
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	tx, err := s.Pipeline.Control.Begin(r.Context())
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	defer tx.Rollback(r.Context())
	var conn, ws string
	var credential []byte
	err = tx.QueryRow(r.Context(), "SELECT * FROM inbox_provider_connections('tg',$1)", bot).Scan(&conn, &ws, &credential)
	if errors.Is(err, pgx.ErrNoRows) {
		write(w, 200, map[string]bool{"accepted": true})
		return
	}
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	var fresh bool
	if err = tx.QueryRow(r.Context(), "SELECT inbox_webhook_record($1,'tg',$2)", event, cipher).Scan(&fresh); err == nil && fresh {
		var accepted bool
		err = tx.QueryRow(r.Context(), "SELECT inbox_ingest($1::uuid,$2,$3,$4,$5,'text',$6)", conn, strconv.FormatInt(u.Message.ID, 10), strconv.FormatInt(u.Message.Chat.ID, 10), u.Message.From.FirstName, u.Message.Text, time.Unix(u.Message.Date, 0)).Scan(&accepted)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]bool{"accepted": true})
}
func (s *Service) sendTelegram(ctx context.Context, j inboxSendJob) (string, string, string) {
	if j.Type != "text" || j.Broadcast || len([]rune(j.Text)) > 4096 {
		return "failed", "", "TELEGRAM_TEXT_ONLY"
	}
	if j.ChannelGuard {
		var allowed bool
		if s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_channel_send_valid($1::uuid)", j.ID).Scan(&allowed) != nil || !allowed {
			return "failed", "", "CHANNEL_ACCESS_REVOKED"
		}
	}
	credential, err := base64.StdEncoding.DecodeString(j.Credential)
	if err != nil {
		return "failed", "", "CREDENTIAL_UNAVAILABLE"
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, credential, j.Workspace+"|inbox|tg|"+j.Account)
	if err != nil {
		return "failed", "", "CREDENTIAL_UNAVAILABLE"
	}
	var result struct {
		ID int64 `json:"message_id"`
	}
	if telegramCall(ctx, string(token), "sendMessage", map[string]any{"chat_id": j.Recipient, "text": j.Text}, &result) != nil {
		return "uncertain", "", "PROVIDER_OUTCOME_UNKNOWN"
	}
	if result.ID <= 0 {
		return "uncertain", "", "PROVIDER_OUTCOME_UNKNOWN"
	}
	return "sent", strconv.FormatInt(result.ID, 10), ""
}
