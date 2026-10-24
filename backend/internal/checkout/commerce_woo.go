package checkout

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
)

type wooProduct struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Status     string `json:"status"`
	SKU        string `json:"sku"`
	Price      string `json:"price"`
	Attributes []struct {
		Name   string `json:"name"`
		Option string `json:"option"`
	} `json:"attributes"`
}

func commerceMoney(raw string) (int64, error) {
	p := strings.Split(raw, ".")
	if len(p) > 2 || p[0] == "" || len(p[0]) > 10 {
		return 0, errors.New("invalid amount")
	}
	for _, c := range p[0] {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid amount")
		}
	}
	n, err := strconv.ParseInt(p[0], 10, 64)
	if err != nil {
		return 0, err
	}
	fraction := "00"
	if len(p) == 2 {
		if len(p[1]) < 1 || len(p[1]) > 2 {
			return 0, errors.New("invalid precision")
		}
		fraction = p[1] + strings.Repeat("0", 2-len(p[1]))
		for _, c := range fraction {
			if c < '0' || c > '9' {
				return 0, errors.New("invalid amount")
			}
		}
	}
	f, _ := strconv.ParseInt(fraction, 10, 64)
	if n*100+f > 100000000000 {
		return 0, errors.New("amount too large")
	}
	return n*100 + f, nil
}
func wooCurrencyIsBDT(reader io.Reader) bool {
	var setting struct {
		ID    string `json:"id"`
		Value string `json:"value"`
	}
	return json.NewDecoder(io.LimitReader(reader, 65536)).Decode(&setting) == nil && setting.ID == "woocommerce_currency" && setting.Value == "BDT"
}
func (s *Service) commerceWooPreview(w http.ResponseWriter, r *http.Request, ws, realm, actor, key string, b map[string]any, cred commerceCredentials) {
	request := commerceHTTPRequest
	if s.wooRequest != nil {
		request = s.wooRequest
	}
	productID := int64(0)
	if eventID := str(b, "event_id"); eventID != "" {
		if os.Getenv("BRIOFOLD_WOO_WEBHOOKS_ENABLED") != "true" || !uuidPattern.MatchString(eventID) {
			fail(w, 422, "INVALID_WOO_EVENT")
			return
		}
		var raw []byte
		if err := s.Pipeline.Control.QueryRow(r.Context(), "SELECT commerce_woo_event_source($1::uuid,$2,$3::uuid,$4::uuid)", ws, realm, actor, eventID).Scan(&raw); err != nil {
			inboxWorkFailure(w, err)
			return
		}
		var source struct {
			ID     int64  `json:"product_id"`
			Origin string `json:"origin"`
		}
		if json.Unmarshal(raw, &source) != nil || source.ID < 1 || source.Origin != cred.Origin {
			fail(w, 409, "WOO_SOURCE_CHANGED")
			return
		}
		productID = source.ID
	}
	page := 1
	if n, ok := b["page"].(float64); ok {
		if n < 1 || n > 10000 || n != float64(int(n)) {
			fail(w, 422, "INVALID_PAGE")
			return
		}
		page = int(n)
	}
	currencyRequest, currencyErr := http.NewRequestWithContext(r.Context(), "GET", cred.Origin+"/wp-json/wc/v3/settings/general/woocommerce_currency", nil)
	if currencyErr != nil {
		fail(w, 422, "WOOCOMMERCE_BDT_CURRENCY_REQUIRED")
		return
	}
	currencyRequest.SetBasicAuth(cred.APIKey, cred.Secret)
	currencyResponse, currencyErr := request(r.Context(), currencyRequest)
	if currencyErr != nil {
		fail(w, 503, "WOOCOMMERCE_CURRENCY_UNAVAILABLE")
		return
	}
	validCurrency := currencyResponse.StatusCode == 200 && wooCurrencyIsBDT(currencyResponse.Body)
	currencyResponse.Body.Close()
	if !validCurrency {
		fail(w, 422, "WOOCOMMERCE_BDT_CURRENCY_REQUIRED")
		return
	}
	load := func(path string, single bool) ([]wooProduct, int, error) {
		req, err := http.NewRequestWithContext(r.Context(), "GET", cred.Origin+"/wp-json/wc/v3/"+path, nil)
		if err != nil {
			return nil, 0, err
		}
		req.SetBasicAuth(cred.APIKey, cred.Secret)
		response, err := request(r.Context(), req)
		if err != nil {
			return nil, 0, err
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return nil, 0, errors.New("store rejected request")
		}
		if single {
			var product wooProduct
			if json.NewDecoder(io.LimitReader(response.Body, 2097152)).Decode(&product) != nil || product.ID != productID || product.Status != "publish" {
				return nil, 0, errors.New("product no longer published")
			}
			return []wooProduct{product}, 1, nil
		}
		var rows []wooProduct
		if err = json.NewDecoder(io.LimitReader(response.Body, 2097152)).Decode(&rows); err != nil {
			return nil, 0, err
		}
		pages, parseErr := strconv.Atoi(response.Header.Get("X-WP-TotalPages"))
		if len(rows) > 0 && (parseErr != nil || pages < 1) {
			return nil, 0, errors.New("store pagination unavailable")
		}
		return rows, pages, nil
	}
	var products []wooProduct
	var pages int
	var err error
	if productID > 0 {
		products, pages, err = load("products/"+strconv.FormatInt(productID, 10), true)
	} else {
		products, pages, err = load("products?per_page=10&page="+strconv.Itoa(page)+"&status=publish", false)
	}
	if err != nil {
		fail(w, 503, "WOOCOMMERCE_SOURCE_UNAVAILABLE")
		return
	}
	rows := []map[string]any{}
	appendRow := func(p wooProduct, name, group string) bool {
		price, err := commerceMoney(p.Price)
		if err != nil || p.SKU == "" || len(p.SKU) > 80 || len(name) > 200 {
			return false
		}
		options := map[string]string{}
		for _, v := range p.Attributes {
			options[v.Name] = v.Option
		}
		rows = append(rows, map[string]any{"name": name, "sku": p.SKU, "price_minor": price, "group": group, "options": options})
		return true
	}
	for _, p := range products {
		if p.Type == "variable" {
			variants, total, err := load("products/"+strconv.FormatInt(p.ID, 10)+"/variations?per_page=100", false)
			if err != nil || total > 1 || len(variants) == 0 || len(rows)+len(variants) > 500 {
				fail(w, 422, "VARIABLE_CATALOG_REQUIRES_SMALLER_REVIEW_BATCH")
				return
			}
			for _, v := range variants {
				if !appendRow(v, p.Name, "woo:"+cred.Origin+":"+strconv.FormatInt(p.ID, 10)) {
					fail(w, 422, "WOOCOMMERCE_SKU_PRICE_REQUIRED")
					return
				}
			}
		} else if p.Type == "simple" {
			if !appendRow(p, p.Name, "woo:"+cred.Origin+":"+strconv.FormatInt(p.ID, 10)) {
				fail(w, 422, "WOOCOMMERCE_SKU_PRICE_REQUIRED")
				return
			}
		} else {
			fail(w, 422, "UNSUPPORTED_WOOCOMMERCE_PRODUCT_TYPE")
			return
		}
	}
	if len(rows) == 0 {
		write(w, 200, map[string]any{"rows": rows, "next_page": nil})
		return
	}
	raw, err := s.commerceCommand(r, ws, realm, actor, key, "import-preview", map[string]any{"rows": rows})
	if err != nil {
		inboxWorkFailure(w, err)
		return
	}
	var out map[string]any
	if json.Unmarshal(raw, &out) != nil {
		fail(w, 503, "IMPORT_PREVIEW_UNAVAILABLE")
		return
	}
	out["page"] = page
	out["next_page"] = nil
	if page < pages {
		out["next_page"] = page + 1
	}
	write(w, 200, out)
}
