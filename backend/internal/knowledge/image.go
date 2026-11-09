package knowledge

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/url"
	"time"
)

// MaxImageBytes bounds a product image fetched from a merchant-supplied URL.
const MaxImageBytes = 10 * 1024 * 1024

// sniffImage returns the MIME type only for the formats the catalog accepts.
// The server's Content-Type header is never trusted; the bytes decide.
func sniffImage(body []byte) (string, bool) {
	switch typ := http.DetectContentType(body); typ {
	case "image/jpeg", "image/png", "image/webp":
		return typ, true
	}
	return "", false
}

// FetchPublicImage downloads one jpeg, png or webp image from a public https
// URL. It reuses the knowledge importer's address guard: every hop (including
// redirects) is re-validated, the connection is pinned to the checked IP, and
// private, loopback, link-local, metadata and CGNAT ranges are refused.
func FetchPublicImage(ctx context.Context, raw string) ([]byte, string, error) {
	transport := &http.Transport{Proxy: nil, DialContext: publicDial, DisableCompression: true, DisableKeepAlives: true, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 3 * time.Second, ResponseHeaderTimeout: 5 * time.Second, MaxResponseHeaderBytes: 32768}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	bounded, cancel := context.WithTimeout(ctx, 18*time.Second)
	defer cancel()
	return fetchPublicImage(bounded, raw, client)
}

func fetchPublicImage(ctx context.Context, raw string, client *http.Client) ([]byte, string, error) {
	target, err := publicURL(raw)
	if err != nil {
		return nil, "", err
	}
	for redirects := 0; redirects <= 3; redirects++ {
		request, err := http.NewRequestWithContext(ctx, "GET", target.String(), nil)
		if err != nil {
			return nil, "", ErrDocument
		}
		request.Header.Set("Accept", "image/jpeg,image/png,image/webp")
		request.Header.Set("User-Agent", "Briofold-Catalog-Import/1.0")
		response, err := client.Do(request)
		if err != nil {
			return nil, "", ErrDocument
		}
		switch response.StatusCode {
		case 301, 302, 303, 307, 308:
			location := response.Header.Get("Location")
			response.Body.Close()
			relative, err := url.Parse(location)
			if err != nil || location == "" {
				return nil, "", ErrDocument
			}
			if target, err = publicURL(target.ResolveReference(relative).String()); err != nil {
				return nil, "", err
			}
			continue
		}
		if response.StatusCode != 200 || response.ContentLength > MaxImageBytes || (response.Header.Get("Content-Encoding") != "" && response.Header.Get("Content-Encoding") != "identity") {
			response.Body.Close()
			return nil, "", ErrDocument
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, MaxImageBytes+1))
		response.Body.Close()
		if err != nil || len(body) > MaxImageBytes {
			return nil, "", ErrLimit
		}
		typ, ok := sniffImage(body)
		if !ok {
			return nil, "", ErrDocument
		}
		return body, typ, nil
	}
	return nil, "", ErrDocument
}
