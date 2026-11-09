package checkout

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode"

	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
)

func customerIdentityEnabled() bool { return os.Getenv("BRIOFOLD_CUSTOMER_IDENTITY_ENABLED") == "true" }

type metaCustomerNameJob struct {
	Thread, Workspace, Provider, Account, Customer, Credential string
	Attempt                                                    time.Time
}

func (s *Service) RunMetaCustomerNames(ctx context.Context) {
	if !customerIdentityEnabled() || s.Pipeline == nil || s.Pipeline.Control == nil {
		return
	}
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		s.refreshMetaCustomerNames(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) refreshMetaCustomerNames(ctx context.Context) {
	cfg, _ := s.channelConfig(ctx)
	version := cfg["META_GRAPH_VERSION"]
	if !graphVersionPattern.MatchString(version) {
		return
	}
	var raw []byte
	if s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_meta_customer_names_claim()").Scan(&raw) != nil {
		return
	}
	var jobs []metaCustomerNameJob
	if json.Unmarshal(raw, &jobs) != nil {
		return
	}
	for _, job := range jobs {
		request, cancel := context.WithTimeout(ctx, 5*time.Second)
		name := s.fetchMetaCustomerName(request, version, job)
		cancel()
		_, _ = s.Pipeline.Control.Exec(ctx, "SELECT briofold_meta_customer_name_finish($1::uuid,$2,$3)", job.Thread, job.Attempt, name)
	}
}

func (s *Service) fetchMetaCustomerName(ctx context.Context, version string, job metaCustomerNameJob) string {
	fields := "first_name,last_name"
	if job.Provider == "ig" {
		fields = "name,username"
	} else if job.Provider != "ms" {
		return ""
	}
	if !graphVersionPattern.MatchString(version) || !digitsOnly(job.Customer) {
		return ""
	}
	encrypted, err := base64.StdEncoding.DecodeString(job.Credential)
	if err != nil {
		return ""
	}
	token, err := merchantwebhook.Decrypt(s.Pipeline.Key, encrypted, job.Workspace+"|inbox|"+job.Provider+"|"+job.Account)
	if err != nil {
		return ""
	}
	target := "https://graph.facebook.com/" + version + "/" + url.PathEscape(job.Customer) + "?fields=" + url.QueryEscape(fields)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+string(token))
	response, err := inboxHTTP.Do(req)
	if err != nil {
		return ""
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ""
	}
	var profile struct {
		First    string `json:"first_name"`
		Last     string `json:"last_name"`
		Name     string `json:"name"`
		Username string `json:"username"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 8192)).Decode(&profile) != nil {
		return ""
	}
	name := strings.TrimSpace(profile.First + " " + profile.Last)
	if job.Provider == "ig" {
		name = strings.TrimSpace(profile.Name)
		if name == "" {
			name = strings.TrimSpace(profile.Username)
		}
	}
	if strings.ContainsFunc(name, unicode.IsControl) || studioPhone.MatchString(name) || !strings.ContainsFunc(name, unicode.IsLetter) {
		return ""
	}
	return cardLabel(name, 160)
}

func digitsOnly(value string) bool {
	return value != "" && len(value) <= 32 && !strings.ContainsFunc(value, func(r rune) bool { return r < '0' || r > '9' })
}
