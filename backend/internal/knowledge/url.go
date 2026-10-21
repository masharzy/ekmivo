package knowledge

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/net/html"
)

var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("168.63.129.16/32"), netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("10.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"), netip.MustParsePrefix("127.0.0.0/8"), netip.MustParsePrefix("169.254.0.0/16"), netip.MustParsePrefix("172.16.0.0/12"), netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"), netip.MustParsePrefix("192.168.0.0/16"), netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("224.0.0.0/4"), netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("64:ff9b::/96"), netip.MustParsePrefix("64:ff9b:1::/48"), netip.MustParsePrefix("100::/64"), netip.MustParsePrefix("2001::/32"), netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("2002::/16"),
}

func publicAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || address.Zone() != "" || !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	for _, network := range blockedNetworks {
		if network.Contains(address) {
			return false
		}
	}
	return true
}
func publicURL(raw string) (*url.URL, error) {
	if len(raw) > 2048 || strings.ContainsAny(raw, "\r\n\x00") {
		return nil, ErrDocument
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Hostname() == "" || (parsed.Port() != "" && parsed.Port() != "443") {
		return nil, ErrDocument
	}
	host := strings.TrimSuffix(strings.ToLower(parsed.Hostname()), ".")
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.Contains(host, "%") || !strings.Contains(host, ".") && !strings.Contains(host, ":") {
		return nil, ErrDocument
	}
	if address, err := netip.ParseAddr(host); err == nil && !publicAddress(address) {
		return nil, ErrDocument
	}
	parsed.Fragment = ""
	return parsed, nil
}
func publicDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || port != "443" {
		return nil, ErrDocument
	}
	addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(addresses) == 0 || len(addresses) > 32 {
		return nil, ErrDocument
	}
	// Reject mixed public/private answers; connect to the checked IP, never re-resolve.
	for _, ip := range addresses {
		if !publicAddress(ip) {
			return nil, ErrDocument
		}
	}
	var last error
	for i, ip := range addresses {
		if i >= 4 {
			break
		}
		conn, err := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		last = err
	}
	return nil, last
}
func FetchPublic(ctx context.Context, raw string) (string, string, error) {
	transport := &http.Transport{Proxy: nil, DialContext: publicDial, DisableCompression: true, DisableKeepAlives: true, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 5 * time.Second, MaxResponseHeaderBytes: 32768}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	bounded, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	return fetchPublic(bounded, raw, client)
}
func fetchPublic(ctx context.Context, raw string, client *http.Client) (string, string, error) {
	target, err := publicURL(raw)
	if err != nil {
		return "", "", err
	}
	for redirects := 0; redirects <= 3; redirects++ {
		request, err := http.NewRequestWithContext(ctx, "GET", target.String(), nil)
		if err != nil {
			return "", "", ErrDocument
		}
		request.Header.Set("Accept", "text/html,text/plain")
		request.Header.Set("User-Agent", "Briofold-Knowledge-Import/1.0")
		response, err := client.Do(request)
		if err != nil {
			return "", "", ErrDocument
		}
		if response.StatusCode == 301 || response.StatusCode == 302 || response.StatusCode == 303 || response.StatusCode == 307 || response.StatusCode == 308 {
			location := response.Header.Get("Location")
			response.Body.Close()
			relative, err := url.Parse(location)
			if err != nil || location == "" {
				return "", "", ErrDocument
			}
			target, err = publicURL(target.ResolveReference(relative).String())
			if err != nil {
				return "", "", err
			}
			continue
		}
		if response.StatusCode != 200 || response.ContentLength > 2*1024*1024 || (response.Header.Get("Content-Encoding") != "" && response.Header.Get("Content-Encoding") != "identity") {
			response.Body.Close()
			return "", "", ErrDocument
		}
		typ, parameters, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
		if err != nil || (typ != "text/html" && typ != "text/plain") || (parameters["charset"] != "" && !strings.EqualFold(parameters["charset"], "utf-8") && !strings.EqualFold(parameters["charset"], "us-ascii")) {
			response.Body.Close()
			return "", "", ErrDocument
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
		response.Body.Close()
		if err != nil || len(body) > 2*1024*1024 || !utf8.Valid(body) || bytes.IndexByte(body, 0) >= 0 {
			return "", "", ErrLimit
		}
		text := strings.TrimSpace(string(body))
		if typ == "text/html" {
			text, err = htmlText(body)
		}
		if err != nil || len(text) == 0 || len(text) > MaxTextBytes {
			return "", "", ErrDocument
		}
		return text, target.Hostname() + target.EscapedPath(), nil
	}
	return "", "", ErrDocument
}
func htmlText(body []byte) (string, error) {
	tokenizer := html.NewTokenizer(bytes.NewReader(body))
	tokenizer.SetMaxBuf(65536)
	blocked := map[string]bool{"head": true, "script": true, "style": true, "template": true, "noscript": true, "svg": true, "canvas": true, "form": true}
	void := map[string]bool{"area": true, "base": true, "br": true, "col": true, "embed": true, "hr": true, "img": true, "input": true, "link": true, "meta": true, "param": true, "source": true, "track": true, "wbr": true}
	var text strings.Builder
	skip := ""
	depth := 0
	for count := 0; count < 100000; count++ {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			if errors.Is(tokenizer.Err(), io.EOF) {
				return strings.TrimSpace(text.String()), nil
			}
			return "", ErrDocument
		}
		token := tokenizer.Token()
		if kind == html.StartTagToken {
			if skip != "" {
				if token.Data == skip {
					depth++
				}
				continue
			}
			hidden := false
			for _, attr := range token.Attr {
				if attr.Key == "hidden" || (attr.Key == "aria-hidden" && attr.Val == "true") {
					hidden = true
				}
			}
			if (blocked[token.Data] || hidden) && !void[token.Data] {
				skip = token.Data
				depth = 1
			}
		} else if kind == html.EndTagToken {
			if token.Data == skip {
				depth--
				if depth == 0 {
					skip = ""
				}
			}
		} else if kind == html.TextToken && skip == "" {
			fragment := strings.Join(strings.Fields(token.Data), " ")
			if fragment == "" {
				continue
			}
			if text.Len()+len(fragment)+1 > MaxTextBytes {
				return "", ErrLimit
			}
			text.WriteString(fragment)
			text.WriteByte('\n')
		}
	}
	return "", ErrLimit
}
