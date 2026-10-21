package checkout

import (
	"embed"
	"net/http"
)

//go:embed website_widget.js
var websiteWidget embed.FS

func (s *Service) HandleWebsiteWidget(w http.ResponseWriter, r *http.Request) {
	b, e := websiteWidget.ReadFile("website_widget.js")
	if e != nil {
		fail(w, 503, "SOURCE_UNAVAILABLE")
		return
	}
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "public, max-age=300")
	_, _ = w.Write(b)
}
