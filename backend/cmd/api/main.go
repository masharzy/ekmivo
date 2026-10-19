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
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"github.com/masharzy/ekmivo/backend/internal/checkout"
	"github.com/masharzy/ekmivo/backend/internal/receiptnotice"
	"github.com/masharzy/ekmivo/backend/internal/workerruntime"
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
	mux.HandleFunc("GET /v1/platform/workspaces/{workspaceID}/payment-usage", pay.HandleAdminPlanUsage)
	mux.HandleFunc("GET /v1/platform/workspaces/{workspaceID}/operations/{resource}", pay.HandleAdminWorkspaceOperations)
	mux.HandleFunc("POST /v1/public-sandbox/receiver/{receiverID}", pay.HandlePublicSandboxReceiver)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/activity/{activityKind}", pay.HandleActivity)
	mux.HandleFunc("POST /v1/public/checkout/{token}/notices/{noticeAction}", pay.HandleNotice)
	mux.HandleFunc("POST /v1/public/checkout/{token}/refunds", pay.HandlePublicRefund)
	mux.HandleFunc("GET /v1/public/documents/{token}", pay.HandlePublicDocument)
	mux.HandleFunc("POST /v1/public/documents/{token}", pay.HandlePublicDocument)
	mux.HandleFunc("POST /v1/public/documents/{token}/files", pay.HandlePublicFile)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/files/{fileID}", pay.HandleFile)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/integrations", pay.HandleIntegrations)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/integrations", pay.HandleIntegrations)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/integrations/{integrationID}/{integrationAction}", pay.HandleIntegrations)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/sandbox/{sandboxAction}", pay.HandleSandboxTools)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/sandbox/{sandboxAction}", pay.HandleSandboxTools)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/reports", pay.HandleReports)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/reports/ledger", pay.HandleReportLedger)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/notifications", pay.HandleNotifications)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/notifications/{notificationID}/read", pay.HandleNotifications)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/workspace-tools/{tool}", pay.HandleWorkspaceTools)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/workspace-tools/{tool}", pay.HandleWorkspaceTools)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/workspace-tools/{tool}/{targetID}", pay.HandleWorkspaceTools)
	mux.HandleFunc("POST /v1/workspace-invites/{tool}", pay.HandleWorkspaceTools)
	mux.HandleFunc("POST /v1/platform/payment-support/{ticketID}/reply", pay.HandleSupportReply)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/billing/limits", func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("billingAction", "limits")
		pay.HandleBilling(w, r)
	})
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/billing", pay.HandleBilling)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/billing/usage", func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("billingAction", "usage")
		pay.HandleBilling(w, r)
	})
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/billing/{billingAction}", pay.HandleBilling)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/privacy", pay.HandlePrivacy)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/privacy", pay.HandlePrivacy)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/privacy/{requestID}/cancel", pay.HandlePrivacy)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/exports", pay.HandleExports)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/exports/{exportID}", pay.HandleExports)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/exports/{exportID}/{exportAction}", pay.HandleExports)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/billing", pay.HandleBilling)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/billing/free", func(w http.ResponseWriter, r *http.Request) {
		r.SetPathValue("billingAction", "free")
		pay.HandleBilling(w, r)
	})
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/billing/{invoiceID}/{billingAction}", pay.HandleBilling)
	for _, method := range []string{"GET", "POST", "PATCH"} {
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/documents/{document}", pay.HandleDocuments)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/documents/{document}/{documentID}", pay.HandleDocuments)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/documents/{document}/{documentID}/{documentAction}", pay.HandleDocuments)
	}
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/documents/{document}/commands/{documentAction}", pay.HandleDocuments)
	for _, method := range []string{"GET", "POST"} {
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/refunds", pay.HandleRefunds)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/refunds/{refundID}", pay.HandleRefunds)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/refunds/{refundID}/{refundAction}", pay.HandleRefunds)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/reconciliation", pay.HandleReconciliation)
		mux.HandleFunc(method+" /v1/workspaces/{workspaceID}/reconciliation/{reconcileAction}", pay.HandleReconciliation)
	}
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/phones", pay.HandlePhones)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/phones", pay.HandlePhones)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/phones/{phoneID}/{phoneAction}", pay.HandlePhones)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/automatic-webhook-secret", pay.HandleSigningSecret)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/operations/{resource}", pay.HandleOperations)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/operations/{resource}/{resourceID}", pay.HandleOperations)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/operations/{resource}", pay.HandleOperations)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/operations/{resource}/{resourceID}/{action}", pay.HandleOperations)
	mux.HandleFunc("POST /v1/device/{action}", pay.HandleDevice)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/linked-sources", pay.HandleSources)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/linked-sources", pay.HandleSources)
	// Public merchant integration: resolve tenant/realm from the authenticated API key.
	// Keep workspace-prefixed routes for existing signed-in dashboard clients.
	merchantByKey := func(w http.ResponseWriter, r *http.Request) {
		if action := r.PathValue("action"); action != "" && action != "cancel" && action != "verify-transaction" && action != "verify" {
			merchantError(w, http.StatusNotFound, "NOT_FOUND", "Unknown payment action", false)
			return
		}
		if r.URL.Query().Has("environment") {
			merchantError(w, http.StatusBadRequest, "ENVIRONMENT_FROM_KEY", "Environment is selected by your API key, not the URL", false)
			return
		}
		authorization := r.Header.Get("Authorization")
		if len(authorization) < len("Bearer ") || authorization[:len("Bearer ")] != "Bearer " {
			merchantError(w, http.StatusUnauthorized, "INVALID_API_KEY", "A server API key is required", false)
			return
		}
		_, realm, _, valid := authz.ParseMerchantToken(authorization[len("Bearer "):])
		if !valid {
			merchantError(w, http.StatusUnauthorized, "INVALID_API_KEY", "Invalid API key", false)
			return
		}
		if repo == nil || pay == nil {
			merchantError(w, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Merchant API is unavailable", true)
			return
		}
		scope := "payments:read"
		if r.Method != http.MethodGet && r.PathValue("action") != "verify-transaction" && r.PathValue("action") != "verify" {
			scope = "payments:write"
		}
		credential, err := repo.AuthenticateMerchant(r.Context(), authorization, realm, scope)
		if err != nil {
			switch {
			case errors.Is(err, authz.ErrUnauthorized):
				merchantError(w, http.StatusUnauthorized, "INVALID_API_KEY", "Invalid or expired API key", false)
			case errors.Is(err, authz.ErrForbidden):
				merchantError(w, http.StatusForbidden, "SCOPE_DENIED", "API key cannot perform this action", false)
			default:
				merchantError(w, http.StatusServiceUnavailable, "AUTH_SERVICE_UNAVAILABLE", "Merchant authorization is unavailable", true)
			}
			return
		}
		// The caller cannot select any other workspace or the other financial database.
		next := r.Clone(r.Context())
		u := *next.URL
		query := u.Query()
		query.Set("environment", string(credential.Environment))
		u.RawQuery = query.Encode()
		next.URL = &u
		next.SetPathValue("workspaceID", credential.WorkspaceID)
		next = checkout.WithAuthenticatedMerchant(next, credential)
		if next.PathValue("action") == "verify-transaction" {
			pay.HandleTransactionLookup(w, next)
			return
		}
		if next.PathValue("action") == "verify" {
			pay.HandleSimpleVerify(w, next)
			return
		}
		if r.URL.Path == "/v1/payment/create" {
			pay.HandleSimpleCreate(w, next)
			return
		}
		pay.HandleMerchant(w, next)
	}
	mux.HandleFunc("POST /v1/payment/create", merchantByKey)
	mux.HandleFunc("POST /v1/payment/verify", func(w http.ResponseWriter, r *http.Request) { r.SetPathValue("action", "verify"); merchantByKey(w, r) })
	mux.HandleFunc("GET /v1/payment-intents", merchantByKey)
	mux.HandleFunc("POST /v1/payment-intents", merchantByKey)
	mux.HandleFunc("GET /v1/payment-intents/{intentID}", merchantByKey)
	mux.HandleFunc("POST /v1/payment-intents/{intentID}/{action}", merchantByKey)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/payment-intents", pay.HandleMerchant)
	mux.HandleFunc("GET /v1/workspaces/{workspaceID}/payment-intents/{intentID}", pay.HandleMerchant)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/payment-intents", pay.HandleMerchant)
	mux.HandleFunc("POST /v1/workspaces/{workspaceID}/payment-intents/{intentID}/{action}", pay.HandleMerchant)
	mux.HandleFunc("GET /v1/public/checkout/{token}", pay.HandlePublic)
	mux.HandleFunc("POST /v1/public/checkout/{token}/{action}", pay.HandlePublic)
	mux.HandleFunc("GET /v1/mobile/releases/latest", handleAndroidRelease)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "ekmivo-api"})
	})
	// The financial API, workers and jobs are intentionally not ready before PG03/PG04.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("PG10_EXTENSIONS_ENABLED") == "true" && pay.OperationalReadiness(r.Context()) {
			writeJSON(w, http.StatusOK, map[string]any{"status": "operationally_ready", "release_verified": false})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "reason": "financial_release_verification_pending"})
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
			repo = &authz.Repository{DB: db, GranularGrants: os.Getenv("PG10_EXTENSIONS_ENABLED") == "true"}
			err = repo.ProbeReadOnlyBoundary(ctx)
		}
		cancel()
		if err != nil {
			log.Fatal("PG01 authorization database or restricted RLS scope unavailable")
		}
		log.Print("PG01 authz runtime PASS: nonprivileged role and no-context tenant isolation verified")
		defer db.Close()
	}
	if err := checkout.SetPublicCheckoutOrigin(os.Getenv("GO_PUBLIC_WEB_ORIGIN")); err != nil {
		log.Fatal(err)
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
		pg05.NoticeSMTP, err = receiptnotice.LoadSMTP()
		if err != nil {
			log.Fatal("notice configuration blocked: ", err)
		}
		if os.Getenv("PG06_PIPELINE_ENABLED") == "true" {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err = pg05.ConfigurePipeline(ctx, os.Getenv("PG06_ENCRYPTION_KEY_HEX"), os.Getenv("PG06_PARSER_RULES_JSON"), os.Getenv("PG06_CONTROL_PROJECTION_URL"), os.Getenv("PG06_LIVE_DATABASE_URL"))
			cancel()
			if err != nil {
				log.Fatal("receipt pipeline startup blocked: ", err)
			}
		}
		if pg05.NoticeSMTP != nil {
			if pg05.Pipeline == nil {
				log.Fatal("notices require receipt pipeline")
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err = receiptnotice.CheckSchema(ctx, pg05.Sandbox)
			cancel()
			if err != nil {
				log.Fatal("notice migration is unavailable")
			}
			pg05.NoticeSchema = true
		} else if pg05.Pipeline != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			pg05.NoticeSchema = receiptnotice.CheckSchema(ctx, pg05.Sandbox) == nil
			cancel()
		}
	}
	port := os.Getenv("PORT")
	if dsn := os.Getenv("PG14_PUBLIC_SANDBOX_WORKER_DATABASE_URL"); dsn != "" && pg05 != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		err := pg05.ConfigurePublicSandboxWorker(ctx, dsn, os.Getenv("PG14_PUBLIC_SANDBOX_WORKSPACE"))
		cancel()
		if err != nil {
			log.Print("public sandbox disabled: restricted worker preflight did not pass")
		}
	}
	if port == "" {
		port = "8080"
	}
	log.Printf("ekmivo-api listening on :%s", port)
	runtimeContext, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	workerConfigs, workerErr := workerruntime.HostedConfigs(os.Getenv)
	if workerErr != nil {
		log.Printf("API hosted workers not started: %v", workerErr)
	}
	group := workerruntime.StartHosted(runtimeContext, workerConfigs)
	projectionConfig, projectionErr := workerruntime.HostedProjectionConfig(os.Getenv)
	if projectionErr != nil {
		log.Printf("API workspace projection not started: %v", projectionErr)
	}
	projectionGroup := workerruntime.StartHostedProjection(runtimeContext, projectionConfig)
	repair, closeProjection, repairErr := workerruntime.NewProjectionRepair(runtimeContext, projectionConfig)
	if repairErr != nil {
		log.Print("API on-demand workspace projection unavailable")
	} else {
		pg05.SyncProjection = repair
		if repair != nil {
			log.Print("API on-demand workspace projection active")
		}
	}
	defer closeProjection()
	server := &http.Server{Addr: ":" + port, Handler: newHandlerWithCheckout(repo, pg05), ReadHeaderTimeout: 10 * time.Second}
	httpStopped := make(chan struct{})
	go func() {
		defer close(httpStopped)
		<-runtimeContext.Done()
		drain, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		_ = server.Shutdown(drain)
	}()
	err := server.ListenAndServe()
	stop()
	group.Wait()
	projectionGroup.Wait()
	<-httpStopped
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
