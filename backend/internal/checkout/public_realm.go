package checkout

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/merchantwebhook"
	"net/http"
 "strings"
)

// The opaque capability resolves the realm; a public caller cannot supply it.
func (s *Service) lookupCheckout(r *http.Request, cap string) (*pgxpool.Pool, []byte, error) {
	var found *pgxpool.Pool
	var result []byte
	pools := []*pgxpool.Pool{s.Sandbox}
	if s.Pipeline != nil && s.Pipeline.Live != nil {
		pools = append(pools, s.Pipeline.Live)
	}
	for _, p := range pools {
		if p == nil {
			continue
		}
		var installed bool
		if err := p.QueryRow(r.Context(), "SELECT to_regprocedure('pg10_checkout_view(text)') IS NOT NULL").Scan(&installed); err != nil {
			return nil, nil, err
		}
		function := "pg05_checkout_view"
		if installed {
			function = "pg10_checkout_view"
		}
		var raw []byte
		if err := p.QueryRow(r.Context(), "SELECT "+function+"($1)", digest(cap)).Scan(&raw); err != nil {
			return nil, nil, err
		}
		if len(raw) > 0 && string(raw) != "null" {
			if found != nil {
				return nil, nil, errors.New("ambiguous capability")
			}
			found = p
			result = raw
		}
	}
	return found, result, nil
}
func (s *Service) publicDestination(data map[string]any) error {
	encoded, _ := data["destination_cipher"].(string)
	delete(data, "destination_cipher")
	if encoded == "" {
		if realm, _ := data["environment"].(string); realm == "live" {
			if method, _ := data["method"].(string); method != "" {
				return errors.New("receiving configuration unavailable")
			}
		}
		return nil
	}
	ws, _ := data["workspace_id"].(string)
	realm, _ := data["environment"].(string)
	cipher, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil || s.Pipeline == nil {
		return errors.New("source unavailable")
	}
	plain, e := merchantwebhook.Decrypt(s.Pipeline.Key, cipher, ws+"|"+realm)
	if e != nil {
		return e
	}
	number, valid := NormalizePayer(string(plain))
	if !valid {
		return errors.New("invalid destination")
	}
	data["destination"] = number
	return nil
}
func checkoutRealm(raw []byte) string {
	var d struct {
		Environment string `json:"environment"`
	}
	_ = json.Unmarshal(raw, &d)
	return d.Environment
}

func (s *Service) liveMethods(raw []byte) map[string]bool {
	methods := map[string]bool{}
	if s.Pipeline == nil {
		return methods
	}
	var data struct {
		Sources []struct {
			Method string `json:"method"`
			Source string `json:"source"`
			Parser string `json:"parser_id"`
            Forwarder bool `json:"forwarder"`
		} `json:"sources"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return methods
	}
	for _, source := range data.Sources {
  if source.Forwarder {
   // Provider parser readiness, not a captured receiver/SIM number.
   for _, rule := range s.Pipeline.Rules {
    if rule.Approved && !rule.SandboxOnly && rule.Method==source.Method &&
      strings.EqualFold(rule.Source,source.Source) {
     methods[source.Method]=true
     break
    }
   }
   continue
  }
  rule,ok:=s.Pipeline.Rules[source.Parser]
  if ok && rule.Approved && !rule.SandboxOnly &&
   rule.Method==source.Method && rule.Source==source.Source {methods[source.Method]=true}
 }
	return methods
}
