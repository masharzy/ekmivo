package merchantwebhook

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Signature input uses exact delivered bytes. Retries preserve the event ID;
// every attempt carries a fresh timestamp and a distinct delivery ID.
func Sign(secret, body []byte, timestamp, eventID string) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(timestamp + "."))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}
func Verify(secret, body []byte, timestamp, eventID, signature string, now time.Time) bool {
	epoch, e := strconv.ParseInt(timestamp, 10, 64)
	if e != nil || eventID == "" {
		return false
	}
	delta := now.Sub(time.Unix(epoch, 0))
	if delta < -5*time.Minute || delta > 5*time.Minute {
		return false
	}
	var payload struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(body, &payload) != nil || payload.ID != eventID {
		return false
	}
	given, e := hex.DecodeString(signature)
	if e != nil {
		return false
	}
	expected, _ := hex.DecodeString(Sign(secret, body, timestamp, eventID))
	return hmac.Equal(given, expected)
}
func Decrypt(key, data []byte, associated string) ([]byte, error) {
	b, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	g, e := cipher.NewGCM(b)
	if e != nil {
		return nil, e
	}
	if len(data) < g.NonceSize() {
		return nil, errors.New("invalid encrypted secret")
	}
	return g.Open(nil, data[:g.NonceSize()], data[g.NonceSize():], []byte(associated))
}

var prohibited = []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "2001:db8::/32", "2001::/32", "2002::/16", "64:ff9b::/96"}

func publicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, block := range prohibited {
		if netip.MustParsePrefix(block).Contains(ip) {
			return false
		}
	}
	return true
}
func ValidateURL(raw string) (*url.URL, error) {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" || u.Opaque != "" || len(raw) > 2048 || u.Port() != "" && u.Port() != "443" || strings.ContainsAny(u.Hostname(), " \t\r\n") {
		return nil, errors.New("HTTPS public endpoint required")
	}
	hostname := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") ||
		strings.HasSuffix(hostname, ".local") || strings.HasSuffix(hostname, ".internal") ||
		strings.HasSuffix(hostname, ".onion") {
		return nil, errors.New("private endpoint denied")
	}
	if strings.Contains(hostname, "%") {
		return nil, errors.New("private endpoint denied")
	}
	if ip, e := netip.ParseAddr(u.Hostname()); e == nil && !publicIP(ip) {
		return nil, errors.New("private endpoint denied")
	}
	return u, nil
}

// Resolve every attempt and pin one allowed address. Never follow redirects,
// proxy environment variables, alternate hosts or a subsequent DNS resolution.
type resolvePublicHost func(context.Context, string, string) ([]netip.Addr, error)
type dialPinnedIP func(context.Context, string, string) (net.Conn, error)

// Network hooks are package-private: production always uses the system DNS
// and a real TCP dialer. Tests simulate public DNS without external requests.
func Send(ctx context.Context, raw string, secret, body []byte, eventID, deliveryID string) (int, string) {
	return sendWithNetwork(ctx, raw, secret, body, eventID, deliveryID,
		net.DefaultResolver.LookupNetIP, (&net.Dialer{Timeout: 3 * time.Second}).DialContext, nil)
}
func sendWithNetwork(ctx context.Context, raw string, secret, body []byte, eventID, deliveryID string,
	resolve resolvePublicHost, dial dialPinnedIP, roots *x509.CertPool) (int, string) {
	u, e := ValidateURL(raw)
	if e != nil {
		return 0, "endpoint_rejected"
	}
	addresses, e := resolve(ctx, "ip", u.Hostname())
	if e != nil || len(addresses) == 0 {
		return 0, "dns_unavailable"
	}
	for _, ip := range addresses {
		if !publicIP(ip) {
			return 0, "private_address_rejected"
		}
	}
	pinned := addresses[0]
	transport := &http.Transport{Proxy: nil, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, ServerName: u.Hostname(), RootCAs: roots}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return dial(ctx, "tcp", net.JoinHostPort(pinned.String(), "443"))
	}, DisableKeepAlives: true, ResponseHeaderTimeout: 5 * time.Second}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	request, e := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(string(body)))
	if e != nil {
		return 0, "request_invalid"
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Briofold-Webhooks/1")
	keyID := sha256.Sum256(secret)
	signature := "v1=" + Sign(secret, body, timestamp, eventID)
	// Briofold-* is the product name. X-Ekmivo-* is still sent with identical values so existing receivers keep working.
	for _, prefix := range []string{"X-Briofold-", "X-Ekmivo-"} {
		request.Header.Set(prefix+"Timestamp", timestamp)
		request.Header.Set(prefix+"Event-ID", eventID)
		request.Header.Set(prefix+"Delivery-ID", deliveryID)
		request.Header.Set(prefix+"Signature", signature)
		request.Header.Set(prefix+"Key-ID", hex.EncodeToString(keyID[:8]))
	}
	response, e := client.Do(request)
	if e != nil {
		return 0, "transport_unknown"
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return response.StatusCode, ""
	}
	return response.StatusCode, "non_success_response"
}
