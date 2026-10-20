package checkout

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/masharzy/ekmivo/backend/internal/deviceevidence"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
)

var inboxGoogleToken struct {
	sync.Mutex
	Token   string
	Expires time.Time
}

func fcmCredentials() (string, string, string) {
	filename := os.Getenv("INBOX_FCM_CREDENTIALS_FILE")
	if filename == "" {
		return "", "", ""
	}
	raw, err := os.ReadFile(filename)
	if err != nil {
		return "", "", ""
	}
	var c struct {
		Project string `json:"project_id"`
		Email   string `json:"client_email"`
		Key     string `json:"private_key"`
	}
	if json.Unmarshal(raw, &c) != nil {
		return "", "", ""
	}
	return c.Project, c.Email, c.Key
}
func fcmAccessToken(ctx context.Context, email, key string) (string, error) {
	inboxGoogleToken.Lock()
	defer inboxGoogleToken.Unlock()
	if time.Until(inboxGoogleToken.Expires) > time.Minute {
		return inboxGoogleToken.Token, nil
	}
	enc := base64.RawURLEncoding.EncodeToString
	header := enc([]byte(`{"alg":"RS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"iss": email, "scope": "https://www.googleapis.com/auth/firebase.messaging", "aud": "https://oauth2.googleapis.com/token", "iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix()})
	message := header + "." + enc(claims)
	block, _ := pem.Decode([]byte(key))
	if block == nil {
		return "", io.ErrUnexpectedEOF
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return "", err
	}
	private, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return "", io.ErrUnexpectedEOF
	}
	hash := sha256.Sum256([]byte(message))
	sig, err := rsa.SignPKCS1v15(rand.Reader, private, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}
	form := url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {message + "." + enc(sig)}}
	req, _ := http.NewRequestWithContext(ctx, "POST", "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := inboxHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	var result struct {
		Token   string `json:"access_token"`
		Expires int    `json:"expires_in"`
	}
	if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 65536)).Decode(&result) != nil || result.Token == "" {
		return "", io.ErrUnexpectedEOF
	}
	inboxGoogleToken.Token = result.Token
	inboxGoogleToken.Expires = time.Now().Add(time.Duration(result.Expires) * time.Second)
	return result.Token, nil
}
func (s *Service) handleInboxPushRegistration(w http.ResponseWriter, r *http.Request, raw []byte) {
	d, err := s.mobileIdentity(r, raw)
	if err != nil {
		authError(w, err)
		return
	}
	var b struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(raw, &b) != nil || len(b.Token) < 16 || len(b.Token) > 4096 {
		fail(w, 422, "INVALID_PUSH_TOKEN")
		return
	}
	cipher, err := deviceevidence.Encrypt(s.Pipeline.Key, []byte(b.Token), d.Workspace+"|push|"+d.ID)
	if err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	if _, err = s.Pipeline.Control.Exec(r.Context(), "SELECT inbox_register_push($1::uuid,$2)", d.ID, cipher); err != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	write(w, 200, map[string]bool{"registered": true})
}
func (s *Service) sendInboxPush(ctx context.Context) {
	project, email, key := fcmCredentials()
	if project == "" || email == "" || key == "" {
		return
	}
	access, err := fcmAccessToken(ctx, email, key)
	if err != nil {
		return
	}
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(ctx, "SELECT inbox_next_push()").Scan(&raw); err != nil || len(raw) == 0 {
		return
	}
	var job struct {
		Device    string `json:"device_id"`
		Workspace string `json:"workspace_id"`
		Thread    string `json:"thread_id"`
		Message   string `json:"message_id"`
		Token     string `json:"token"`
	}
	if json.Unmarshal(raw, &job) != nil {
		return
	}
	state := "failed"
	cipher, err := base64.StdEncoding.DecodeString(job.Token)
	token, de := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, job.Workspace+"|push|"+job.Device)
	if err == nil && de == nil {
		body, _ := json.Marshal(map[string]any{"message": map[string]any{"token": string(token), "data": map[string]string{"device_id": job.Device, "workspace_id": job.Workspace, "thread_id": job.Thread, "message_id": job.Message}, "android": map[string]string{"priority": "high"}}})
		req, _ := http.NewRequestWithContext(ctx, "POST", "https://fcm.googleapis.com/v1/projects/"+url.PathEscape(project)+"/messages:send", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+access)
		req.Header.Set("Content-Type", "application/json")
		response, e := inboxHTTP.Do(req)
		if e != nil {
			state = "queued"
		} else {
			io.Copy(io.Discard, io.LimitReader(response.Body, 65536))
			response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 300 {
				state = "sent"
			} else if response.StatusCode == 429 || response.StatusCode >= 500 {
				state = "queued"
			} else if response.StatusCode == 401 {
				inboxGoogleToken.Lock()
				inboxGoogleToken.Token = ""
				inboxGoogleToken.Expires = time.Time{}
				inboxGoogleToken.Unlock()
				state = "queued"
			}
		}
	}
	_, _ = s.Pipeline.Control.Exec(ctx, "SELECT inbox_finish_push($1::uuid,$2::uuid,$3)", job.Device, job.Message, state)
}
