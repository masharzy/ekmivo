package checkout

import (
	"fmt"
	"net/url"
	"strings"
)

// Public links are independent of the dashboard origin allowed by CORS.
// Old deployment aliases must never become customer-facing payment URLs.
const defaultCheckoutOrigin = "https://ekmivo-web.vercel.app"

var publicCheckoutOrigin = defaultCheckoutOrigin

func SetPublicCheckoutOrigin(origin string) error {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	if origin == "" {
		origin = defaultCheckoutOrigin
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return fmt.Errorf("GO_PUBLIC_WEB_ORIGIN must be an HTTPS origin")
	}
	publicCheckoutOrigin = origin
	return nil
}
func publicCheckoutURL(token string) string {
	return publicCheckoutOrigin + "/checkout/" + url.PathEscape(token)
}
