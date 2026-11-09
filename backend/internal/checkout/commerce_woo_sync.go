package checkout

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// wooSyncEnabled gates both the full catalog import and webhook auto-apply.
func wooSyncEnabled() bool { return os.Getenv("BRIOFOLD_WOO_SYNC_ENABLED") == "true" }

type wooFull struct {
	ID            int64    `json:"id"`
	Name          string   `json:"name"`
	Type          string   `json:"type"`
	Status        string   `json:"status"`
	SKU           string   `json:"sku"`
	Price         string   `json:"price"`
	Description   string   `json:"description"`
	ManageStock   bool     `json:"manage_stock"`
	StockQuantity *float64 `json:"stock_quantity"`
	Images        []struct {
		Src string `json:"src"`
	} `json:"images"`
	Categories []struct {
		Name string `json:"name"`
	} `json:"categories"`
	Tags []struct {
		Name string `json:"name"`
	} `json:"tags"`
	Attributes []struct {
		Name   string `json:"name"`
		Option string `json:"option"`
	} `json:"attributes"`
}

var wooTagPattern = regexp.MustCompile(`<[^>]*>`)

// wooPlainText drops markup from a Woo description. The result is stored as
// text and escaped on output; this only keeps the catalog readable.
func wooPlainText(s string) string {
	s = wooTagPattern.ReplaceAllString(s, " ")
	s = strings.NewReplacer("&nbsp;", " ", "&amp;", "&", "&lt;", "<", "&gt;", ">", "&quot;", `"`, "&#039;", "'").Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > 4000 {
		s = string(r[:4000])
	}
	return s
}

func wooExternalID(origin string, id int64) string {
	host := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	return host + ":" + strconv.FormatInt(id, 10)
}

func wooVariant(v wooFull, fallbackSKU string) (map[string]any, error) {
	price, err := commerceMoney(v.Price)
	if err != nil || price < 1 {
		return nil, errors.New("PRICE_REQUIRED")
	}
	sku := strings.TrimSpace(v.SKU)
	if sku == "" {
		sku = fallbackSKU
	}
	if len(sku) > 80 {
		return nil, errors.New("SKU_TOO_LONG")
	}
	options := map[string]string{}
	for _, a := range v.Attributes {
		if a.Name != "" && a.Option != "" {
			options[a.Name] = a.Option
		}
	}
	out := map[string]any{"sku": sku, "price_minor": price, "options": options}
	if v.ManageStock && v.StockQuantity != nil {
		q := *v.StockQuantity
		if q < 0 {
			q = 0
		}
		if q > 10000000 {
			q = 10000000
		}
		out["stock"] = int64(q)
	}
	return out, nil
}

// wooCatalogBody maps a published Woo product (and its variations) onto the
// catalog write contract. Images are returned separately as URLs to fetch.
func wooCatalogBody(origin string, p wooFull, vars []wooFull) (map[string]any, []string, error) {
	name := strings.TrimSpace(p.Name)
	if name == "" || len([]rune(name)) > 200 {
		return nil, nil, errors.New("NAME_INVALID")
	}
	body := map[string]any{"source": "woo", "external_id": wooExternalID(origin, p.ID), "name": name, "description": wooPlainText(p.Description)}
	if len(p.Categories) > 0 {
		if c := strings.TrimSpace(p.Categories[0].Name); c != "" && len([]rune(c)) <= 80 {
			body["category"] = c
		}
	}
	tags := []string{}
	for _, t := range p.Tags {
		if n := strings.TrimSpace(t.Name); n != "" && len([]rune(n)) <= 40 && len(tags) < 30 {
			tags = append(tags, n)
		}
	}
	body["tags"] = tags
	variants := []map[string]any{}
	switch p.Type {
	case "simple":
		v, err := wooVariant(p, "WOO-"+strconv.FormatInt(p.ID, 10))
		if err != nil {
			return nil, nil, err
		}
		variants = append(variants, v)
	case "variable":
		if len(vars) == 0 || len(vars) > 100 {
			return nil, nil, errors.New("VARIATIONS_UNSUPPORTED")
		}
		for _, raw := range vars {
			v, err := wooVariant(raw, "WOO-"+strconv.FormatInt(p.ID, 10)+"-"+strconv.FormatInt(raw.ID, 10))
			if err != nil {
				return nil, nil, err
			}
			variants = append(variants, v)
		}
	default:
		return nil, nil, errors.New("UNSUPPORTED_TYPE")
	}
	body["variants"] = variants
	urls := []string{}
	for _, img := range p.Images {
		if img.Src != "" && len(urls) < 8 {
			urls = append(urls, img.Src)
		}
	}
	return body, urls, nil
}

type wooFetcher func(context.Context, *http.Request) (*http.Response, error)

func (s *Service) wooFetcher() wooFetcher {
	if s.wooRequest != nil {
		return s.wooRequest
	}
	return commerceHTTPRequest
}

func wooGet(ctx context.Context, request wooFetcher, cred commerceCredentials, path string, out any) (int, int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", cred.Origin+"/wp-json/wc/v3/"+path, nil)
	if err != nil {
		return 0, 0, err
	}
	req.SetBasicAuth(cred.APIKey, cred.Secret)
	response, err := request(ctx, req)
	if err != nil {
		return 0, 0, err
	}
	defer response.Body.Close()
	pages, _ := strconv.Atoi(response.Header.Get("X-WP-TotalPages"))
	if response.StatusCode != 200 {
		io.Copy(io.Discard, io.LimitReader(response.Body, 65536))
		return response.StatusCode, pages, nil
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 4194304)).Decode(out); err != nil {
		return 0, 0, err
	}
	return 200, pages, nil
}

func wooEnsureBDT(ctx context.Context, request wooFetcher, cred commerceCredentials) error {
	req, err := http.NewRequestWithContext(ctx, "GET", cred.Origin+"/wp-json/wc/v3/settings/general/woocommerce_currency", nil)
	if err != nil {
		return errors.New("WOOCOMMERCE_BDT_CURRENCY_REQUIRED")
	}
	req.SetBasicAuth(cred.APIKey, cred.Secret)
	response, err := request(ctx, req)
	if err != nil {
		return errors.New("WOOCOMMERCE_CURRENCY_UNAVAILABLE")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || !wooCurrencyIsBDT(response.Body) {
		return errors.New("WOOCOMMERCE_BDT_CURRENCY_REQUIRED")
	}
	return nil
}

// wooApplyProduct refetches one product from the store and applies it. The
// webhook body is never trusted for data: only the product id is. A missing or
// unpublished product deactivates the local copy instead of deleting it.
func (s *Service) wooApplyProduct(ctx context.Context, cred commerceCredentials, ws, realm, actor string, productID int64, key string) (string, error) {
	request := s.wooFetcher()
	var p wooFull
	status, _, err := wooGet(ctx, request, cred, "products/"+strconv.FormatInt(productID, 10), &p)
	if err != nil {
		return "", errors.New("STORE_UNAVAILABLE")
	}
	if status == 404 || (status == 200 && (p.Status != "publish" || p.ID != productID)) {
		var raw []byte
		if err = s.Pipeline.Control.QueryRow(ctx, "SELECT commerce_catalog_deactivate($1::uuid,$2,$3::uuid,NULL::uuid,'woo',$4)", ws, realm, actor, wooExternalID(cred.Origin, productID)).Scan(&raw); err != nil {
			return "", errors.New("DEACTIVATE_FAILED")
		}
		return "deactivated", nil
	}
	if status != 200 {
		return "", errors.New("STORE_REJECTED")
	}
	if err = wooEnsureBDT(ctx, request, cred); err != nil {
		return "", err
	}
	var vars []wooFull
	if p.Type == "variable" {
		code, pages, vErr := wooGet(ctx, request, cred, "products/"+strconv.FormatInt(productID, 10)+"/variations?per_page=100", &vars)
		if vErr != nil || code != 200 || pages > 1 {
			return "", errors.New("VARIATIONS_UNSUPPORTED")
		}
	}
	body, urls, err := wooCatalogBody(cred.Origin, p, vars)
	if err != nil {
		return "", err
	}
	encoded, _ := json.Marshal(body)
	digest := sha256.Sum256(encoded)
	operation := catalogDerivedID(key, "data:"+hex.EncodeToString(digest[:8]))
	if len(urls) > 0 {
		ids, _ := s.commerceFetchImages(ctx, ws, realm, actor, operation, urls)
		if len(ids) > 0 {
			body["images"] = ids
		}
	}
	// The key covers the final body (images included) so a retry with changed
	// store data writes again, while an identical retry replays the first answer.
	final, _ := json.Marshal(body)
	finalDigest := sha256.Sum256(final)
	var raw []byte
	if err = s.Pipeline.Control.QueryRow(ctx, "SELECT commerce_catalog_write($1::uuid,$2,$3::uuid,$4::uuid,$5::jsonb)", ws, realm, actor, catalogDerivedID(key, "write:"+hex.EncodeToString(finalDigest[:8])), final).Scan(&raw); err != nil {
		return "", errors.New(catalogRowCode(err))
	}
	return "applied", nil
}

// wooAutoApply claims one accepted notice, applies it exactly once and records
// the outcome. A held lease, a finished notice or 20 failed tries all return
// without touching the catalog.
func (s *Service) wooAutoApply(eventID string, cred commerceCredentials) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	var raw []byte
	if s.Pipeline.Control.QueryRow(ctx, "SELECT commerce_woo_event_claim($1::uuid)", eventID).Scan(&raw) != nil {
		return
	}
	var claim struct {
		Claimed     bool   `json:"claimed"`
		ProductID   int64  `json:"product_id"`
		Workspace   string `json:"workspace_id"`
		Environment string `json:"environment"`
		Actor       string `json:"actor_id"`
	}
	if json.Unmarshal(raw, &claim) != nil || !claim.Claimed {
		return
	}
	_, err := s.wooApplyProduct(ctx, cred, claim.Workspace, claim.Environment, claim.Actor, claim.ProductID, eventID)
	failure := ""
	if err != nil {
		failure = err.Error()
	}
	s.Pipeline.Control.Exec(ctx, "SELECT commerce_woo_event_finish($1::uuid,$2)", eventID, nullableID(failure))
}

// commerceWooImport applies one page (10 products) of the store's published
// catalog. The browser calls it page by page until next_page is empty.
func (s *Service) commerceWooImport(w http.ResponseWriter, r *http.Request, ws, realm, actor, key string, b map[string]any, cred commerceCredentials) {
	if !wooSyncEnabled() {
		fail(w, 503, "WOO_SYNC_UNAVAILABLE")
		return
	}
	page := 1
	if n, ok := b["page"].(float64); ok {
		if n < 1 || n > 10000 || n != float64(int(n)) {
			fail(w, 422, "INVALID_PAGE")
			return
		}
		page = int(n)
	}
	request := s.wooFetcher()
	if err := wooEnsureBDT(r.Context(), request, cred); err != nil {
		fail(w, 422, err.Error())
		return
	}
	var products []wooFull
	status, pages, err := wooGet(r.Context(), request, cred, "products?per_page=10&status=publish&page="+strconv.Itoa(page), &products)
	if err != nil || status != 200 {
		fail(w, 503, "WOOCOMMERCE_SOURCE_UNAVAILABLE")
		return
	}
	results := []map[string]any{}
	saved := 0
	for _, p := range products {
		result, applyErr := s.wooApplyProduct(r.Context(), cred, ws, realm, actor, p.ID, catalogDerivedID(key, "p:"+strconv.FormatInt(p.ID, 10)))
		item := map[string]any{"woo_id": p.ID, "name": p.Name}
		if applyErr != nil {
			item["ok"] = false
			item["error"] = applyErr.Error()
		} else {
			item["ok"] = true
			item["result"] = result
			saved++
		}
		results = append(results, item)
	}
	var next any
	if page < pages {
		next = page + 1
	}
	write(w, 200, map[string]any{"page": page, "saved": saved, "failed": len(products) - saved, "results": results, "next_page": next})
}
