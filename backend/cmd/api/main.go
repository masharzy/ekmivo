package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/checkout"
)

type responseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
func merchantError(w http.ResponseWriter, status int, code, message string, retryable bool) {
	id := make([]byte, 12)
	if _, err := rand.Read(id); err != nil {
		// Missing entropy is a dependency failure: do not send a fake request ID.
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": map[string]any{
			"code": "AUTH_SERVICE_UNAVAILABLE", "message": "Request identifier unavailable", "retryable": true}})
		return
	}
	correlationID := hex.EncodeToString(id)
	w.Header().Set("X-Correlation-ID", correlationID)
	writeJSON(w, status, map[string]any{"error": map[string]any{
		"code": code, "message": message, "retryable": retryable, "correlation_id": correlationID}})
}
func authFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, authz.ErrUnauthorized):
		writeJSON(w, http.StatusUnauthorized, responseError{Code: "UNAUTHENTICATED", Message: "Sign in required"})
	case errors.Is(err, authz.ErrMFANeeded):
		writeJSON(w, http.StatusForbidden, responseError{Code: "MFA_REQUIRED", Message: "Administrator verification required"})
	case errors.Is(err, authz.ErrForbidden):
		writeJSON(w, http.StatusForbidden, responseError{Code: "ACCESS_DENIED", Message: "Not authorized"})
	default:
		writeJSON(w, http.StatusServiceUnavailable, responseError{Code: "AUTH_SERVICE_UNAVAILABLE", Message: "Authorization unavailable"})
	}
}
func newHandler() http.Handler { return newHandlerWithRepository(nil) }
func newHandlerWithRepository(repo *authz.Repository) http.Handler {
	return newHandlerWithCheckout(repo, nil)
}
func newHandlerWithCheckout(repo *authz.Repository, pay *checkout.Service) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/linked-sources", pay.HandleSources)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/linked-sources", pay.HandleSources)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/payment-intents", pay.HandleMerchant)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/payment-intents/{intentID}", pay.HandleMerchant)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/payment-intents", pay.HandleMerchant)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/payment-intents/{intentID}/{action}", pay.HandleMerchant)
	mux.HandleFunc("GET /v1/public/checkout/{token}", pay.HandlePublic)
	mux.HandleFunc("POST /v1/public/checkout/{token}/{action}", pay.HandlePublic)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "ekmivo-api"})
	})
	// The financial API, workers and jobs are intentionally not ready before PG03/PG04.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "reason": "financial_services_not_implemented"})
	})
	identify := func(r *http.Request) (authz.Principal, error) {
		if repo == nil {
			return authz.Principal{}, authz.ErrUnavailable
		}
		cookie, err := r.Cookie("ekmivo-session")
		if err != nil {
			return authz.Principal{}, authz.ErrUnauthorized
		}
		return repo.Authenticate(r.Context(), cookie.Value)
	}
	// PG03: real credential verification, no simulated financial rows or writes.
	// A valid key grants only its own environment and explicitly issued scope.
	mux.HandleFunc("GET /v1/merchant/context", func(w http.ResponseWriter, r *http.Request) {
		envs := r.URL.Query()["environment"]
		if len(envs) != 1 || (envs[0] != "sandbox" && envs[0] != "live") {
			merchantError(w, http.StatusBadRequest, "INVALID_ENVIRONMENT", "One explicit sandbox or live environment is required", false)
			return
		}
		if repo == nil {
			merchantError(w, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Authorization unavailable", true)
			return
		}
		credential, err := repo.AuthenticateMerchant(r.Context(), r.Header.Get("Authorization"), authz.Environment(envs[0]), "payments:read")
		if err != nil {
			switch {
			case errors.Is(err, authz.ErrUnauthorized):
				merchantError(w, http.StatusUnauthorized, "INVALID_API_KEY", "Invalid or expired API key", false)
			case errors.Is(err, authz.ErrForbidden):
				merchantError(w, http.StatusForbidden, "SCOPE_OR_ENVIRONMENT_DENIED", "Credential is not authorized for this scope or environment", false)
			default:
				merchantError(w, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Authorization unavailable", true)
			}
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"workspace_id":        credential.WorkspaceID,
			"environment":         credential.Environment,
			"key_id":              credential.KeyID,
			"scopes":              credential.Scopes,
			"financial_api_ready": false,
		})
	})
	mux.HandleFunc("GET /v1/session", func(w http.ResponseWriter, r *http.Request) {
		user, err := identify(r)
		if err != nil {
			authFailure(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user_id": user.UserID, "email_verified": user.EmailVerified})
	})
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/access", func(w http.ResponseWriter, r *http.Request) {
		user, err := identify(r)
		if err != nil {
			authFailure(w, err)
			return
		}
		env := authz.Environment(r.URL.Query().Get("environment"))
		capability := authz.Capability(r.URL.Query().Get("capability"))
		allowed, err := repo.AuthorizeWorkspace(r.Context(), user, r.PathValue("workspaceID"), env, capability)
		if err != nil {
			authFailure(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"workspace_id": allowed.WorkspaceID,
			"environment":  allowed.Environment,
			"role":         allowed.Role,
			"capability":   allowed.Capability,
		})
	})
	mux.HandleFunc("GET /v1/platform/access", func(w http.ResponseWriter, r *http.Request) {
		user, err := identify(r)
		if err != nil {
			authFailure(w, err)
			return
		}
		role, err := repo.AuthorizePlatform(r.Context(), user, true)
		if err != nil {
			authFailure(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"role": role})
	})
	mux.HandleFunc("PATCH /v1/workspaces/{workspaceID}/settings", func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && origin != "https://ekmivo-web-masharzys-projects.vercel.app" && origin != os.Getenv("WEB_ORIGIN") {
			writeJSON(w, http.StatusForbidden, responseError{Code: "ORIGIN_DENIED", Message: "Request origin denied"})
			return
		}
		user, err := identify(r)
		if err != nil {
			authFailure(w, err)
			return
		}
		var payload struct {
			CheckoutExpiryMinutes int `json:"checkout_expiry_minutes"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&payload); err != nil || payload.CheckoutExpiryMinutes < 5 || payload.CheckoutExpiryMinutes > 60 {
			writeJSON(w, 422, responseError{Code: "INVALID_SETTINGS", Message: "Expiry must be an integer from 5 to 60 minutes"})
			return
		}
		if err = repo.UpdateCheckoutExpiry(r.Context(), user, r.PathValue("workspaceID"), authz.Environment(r.URL.Query().Get("environment")), payload.CheckoutExpiryMinutes); err != nil {
			authFailure(w, err)
			return
		}
		writeJSON(w, 200, map[string]int{"checkout_expiry_minutes": payload.CheckoutExpiryMinutes})
	})
	return mux
}
func main() {
	var repo *authz.Repository
	connection := os.Getenv("AUTHZ_DATABASE_URL")
	if os.Getenv("EKMIVO_REQUIRE_AUTHZ") == "true" && connection == "" {
		log.Fatal("authorization database is mandatory for deployed Go API")
	}
	if connection != "" {
		db, err := sql.Open("pgx", connection)
		if err != nil {
			log.Fatal("authz database driver initialization failed")
		}
		db.SetMaxOpenConns(8)
		db.SetMaxIdleConns(4)
		db.SetConnMaxLifetime(10 * time.Minute)
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err = db.PingContext(ctx)
		if err == nil {
			repo = &authz.Repository{DB: db}
			err = repo.ProbeReadOnlyBoundary(ctx)
		}
		cancel()
		if err != nil {
			log.Fatal("PG01 authorization database or restricted RLS scope unavailable")
		}
		log.Print("PG01 authz runtime PASS: nonprivileged role and no-context tenant isolation verified")
		defer db.Close()
	}
	checkout.SetAllowedOrigin(os.Getenv("GO_WEB_ORIGIN"))
	if os.Getenv("GO_WEB_ORIGIN") == "" {
		checkout.SetAllowedOrigin("https://ekmivo-web-masharzys-projects.vercel.app")
	}
	var pg05 *checkout.Service
	if dsn := os.Getenv("PG05_SANDBOX_DATABASE_URL"); dsn != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		var err error
		pg05, err = checkout.Start(ctx, repo, dsn, os.Getenv("AUTHZ_DATABASE_URL"),
			[]byte(os.Getenv("PG05_TOKEN_SECRET")), []byte(os.Getenv("PG05_PAYER_SECRET")))
		cancel()
		if err != nil {
			log.Fatal("PG05 checkout startup preflight failed: ", err)
		}
		defer pg05.Close()
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("ekmivo-api listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, newHandlerWithCheckout(repo, pg05)))
}
