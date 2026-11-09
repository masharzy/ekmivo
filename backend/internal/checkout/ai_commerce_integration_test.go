package checkout

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/briofold/backend/internal/aicredits"
	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
	"github.com/masharzy/briofold/backend/internal/receiptnotice"
)

// End-to-end AI commerce test on the isolated CI databases: real migrations, real runtime role, real metering,
// real worker (runStudioJob), real finish, real payment verification against the live financial realm.
// Only the model is replaced by a scripted fake. Run by apps/web/scripts/briofold-ai-commerce-acceptance.mjs.

type scriptedProvider struct {
	mu    sync.Mutex
	queue []string
	seen  [][]aicredits.Message
	n     atomic.Int64
}

func (p *scriptedProvider) set(outputs ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.queue = outputs
	p.seen = nil
}

func (p *scriptedProvider) Generate(_ context.Context, _ string, _ int64, messages []aicredits.Message) (aicredits.Output, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.seen = append(p.seen, messages)
	text := `{"reply":"Unscripted reply."}`
	if len(p.queue) > 0 {
		text, p.queue = p.queue[0], p.queue[1:]
	}
	return aicredits.Output{ID: fmt.Sprintf("fake-%d-%d", time.Now().UnixNano(), p.n.Add(1)), Text: text,
		Usage: aicredits.Usage{InputTokens: 200, OutputTokens: 30}}, nil
}

func (p *scriptedProvider) lastToolResult() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	for i := len(p.seen) - 1; i >= 0; i-- {
		m := p.seen[i]
		if c := m[len(m)-1].Content; strings.HasPrefix(c, "TOOL_RESULT") {
			return c
		}
	}
	return ""
}

func itEnv(t *testing.T, name string) string {
	v := os.Getenv(name)
	if v == "" {
		t.Skip("requires the isolated AI commerce fixture (" + name + ")")
	}
	if u, err := url.Parse(v); err != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		t.Fatal("refusing non-local fixture database " + name)
	}
	return v
}

type aiIT struct {
	t        *testing.T
	ctx      context.Context
	admin    *sql.DB // control owner, fixtures only
	live     *sql.DB // live realm owner, fixtures only
	svc      *Service
	fake     *scriptedProvider
	ws, user string
	conn     string
}

func (it *aiIT) exec(db *sql.DB, q string, args ...any) {
	it.t.Helper()
	if _, err := db.ExecContext(it.ctx, q, args...); err != nil {
		it.t.Fatalf("%s: %v", q, err)
	}
}

func (it *aiIT) one(db *sql.DB, q string, args ...any) string {
	it.t.Helper()
	var v sql.NullString
	if err := db.QueryRowContext(it.ctx, q, args...).Scan(&v); err != nil {
		it.t.Fatalf("%s: %v", q, err)
	}
	return v.String
}

// say ingests a customer message, runs the real worker once with the scripted model outputs and returns the job.
func (it *aiIT) say(psid, text string, outputs ...string) (thread, state, reason, reply string) {
	it.t.Helper()
	it.exec(it.admin, "SELECT inbox_ingest($1::uuid,$2,$3,'IT Customer',$4,'text',now())", it.conn, fmt.Sprintf("it-%d", time.Now().UnixNano()), psid, text)
	thread = it.one(it.admin, "SELECT id::text FROM inbox_threads WHERE connection_id=$1::uuid AND external_id=$2", it.conn, psid)
	it.fake.set(outputs...)
	it.svc.runStudioJob(it.ctx)
	var r sql.NullString
	if err := it.admin.QueryRowContext(it.ctx, `SELECT j.state,j.reason,(SELECT m.body FROM inbox_messages m WHERE m.idempotency_key=j.id) FROM briofold_ai_channel_jobs j
		WHERE j.thread_id=$1::uuid ORDER BY j.created_at DESC LIMIT 1`, thread).Scan(&state, &reason, &r); err != nil {
		it.t.Fatal(err)
	}
	return thread, state, reason, r.String
}

func TestAICommerceIntegration(t *testing.T) {
	adminURL, runtimeURL := itEnv(t, "AI_IT_CONTROL_ADMIN_URL"), itEnv(t, "AI_IT_RUNTIME_URL")
	pipelineURL, liveReaderURL, liveAdminURL := itEnv(t, "AI_IT_PIPELINE_CONTROL_URL"), itEnv(t, "AI_IT_LIVE_READER_URL"), itEnv(t, "AI_IT_LIVE_ADMIN_URL")
	payerKey, pipelineKeyHex := []byte(os.Getenv("PG05_PAYER_SECRET")), os.Getenv("PG06_ENCRYPTION_KEY_HEX")
	pipelineKey, err := hex.DecodeString(pipelineKeyHex)
	if err != nil || len(pipelineKey) != 32 || len(payerKey) < 32 {
		t.Fatal("fixture keys missing")
	}
	t.Setenv("BRIOFOLD_AI_TOOLS_ENABLED", "true")
	t.Setenv("BRIOFOLD_AI_KILL_SWITCH", "")
	t.Setenv("BRIOFOLD_AI_TOOLS_WORKSPACES", "")
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	open := func(u string) *sql.DB {
		db, err := sql.Open("pgx", u)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		return db
	}
	pool := func(u string) *pgxpool.Pool {
		p, err := pgxpool.New(ctx, u)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(p.Close)
		return p
	}
	fake := &scriptedProvider{}
	it := &aiIT{t: t, ctx: ctx, admin: open(adminURL), live: open(liveAdminURL), fake: fake}
	it.svc = &Service{Auth: &authz.Repository{DB: open(runtimeURL)}, PayerKey: payerKey, aiProvider: fake,
		Pipeline: &Pipeline{Key: pipelineKey, Control: pool(pipelineURL), Live: pool(liveReaderURL)}}

	// Fixture: owner, Both-mode workspace, published AI Studio version, prepaid credits, live Messenger connection.
	tag := fmt.Sprintf("%d", time.Now().UnixNano())
	it.user = it.one(it.admin, "INSERT INTO app_users(email,display_name,password_hash) VALUES($1,'AI IT owner','invalid-fixture') RETURNING id::text", "ai-it-"+tag+"@example.invalid")
	it.ws = it.one(it.admin, "INSERT INTO workspaces(name,service_mode,created_by) VALUES('AI IT shop','both',$1::uuid) RETURNING id::text", it.user)
	it.exec(it.admin, "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1::uuid,$2::uuid,'owner')", it.ws, it.user)
	it.exec(it.admin, "UPDATE app_users SET email_verified_at=now()-interval '1 minute' WHERE id=$1::uuid", it.user)
	model := it.one(it.admin, "SELECT model FROM briofold_ai_tariff_catalog ORDER BY model LIMIT 1")
	write := func(kind string, body map[string]any) {
		raw, _ := json.Marshal(body)
		it.exec(it.admin, "SELECT briofold_ai_studio_write($1::uuid,$2::uuid,gen_random_uuid(),$3,$4::jsonb)", it.ws, it.user, kind, string(raw))
	}
	write("draft", map[string]any{"revision": 0, "config": map[string]any{"instructions": "Sell the shop products politely.", "mode": "live", "language": "auto", "tone": "neutral", "model": model}})
	write("source", map[string]any{"id": newUUID(), "expected_version": nil, "title": "Shop policy", "kind": "text", "content": "We deliver everywhere in Bangladesh."})
	rev := it.one(it.admin, "SELECT (briofold_ai_studio_read($1::uuid,$2::uuid,0,0)->>'revision')", it.ws, it.user)
	write("publish", map[string]any{"revision": json.Number(rev), "confirmed": true, "reason": "AI commerce integration test"})
	adminUser := it.one(it.admin, "SELECT user_id::text FROM platform_administrators WHERE role='super_admin' LIMIT 1")
	t.Run("shop assistant model version and rollback", func(t *testing.T) {
		tx, err := it.svc.Auth.DB.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback()
		change := "SELECT briofold_shop_assistant_model_change($1::uuid,$2,$3,$4)"
		_, err = tx.ExecContext(ctx, "SAVEPOINT before_denial")
		if err != nil {
			t.Fatal(err)
		}
		_, err = tx.ExecContext(ctx, change, it.user, 0, model, false)
		var denied *pgconn.PgError
		if !errors.As(err, &denied) || denied.Code != "42501" {
			t.Fatalf("expected insufficient privilege, got %v", err)
		}
		if _, err = tx.ExecContext(ctx, "ROLLBACK TO before_denial"); err != nil {
			t.Fatal(err)
		}
		var revision int64
		if err = tx.QueryRowContext(ctx, change, adminUser, 0, model, false).Scan(&revision); err != nil {
			t.Fatal(err)
		}
		var active *string
		if err = tx.QueryRowContext(ctx, "SELECT briofold_shop_assistant_model()").Scan(&active); err != nil || active == nil || *active != model {
			t.Fatalf("saved model was not selected: %v", err)
		}
		var rolledBack int64
		if err = tx.QueryRowContext(ctx, change, adminUser, revision, nil, true).Scan(&rolledBack); err != nil || rolledBack <= revision {
			t.Fatalf("rollback did not append a revision: %v", err)
		}
		if err = tx.QueryRowContext(ctx, "SELECT briofold_shop_assistant_model()").Scan(&active); err != nil || active != nil {
			t.Fatalf("rollback did not restore default: %v", err)
		}
		if _, err = tx.ExecContext(ctx, change, adminUser, revision, model, false); err == nil {
			t.Fatal("stale revision accepted")
		}
	})
	it.exec(it.admin, "SELECT briofold_ai_admin_adjust($1::uuid,$2::uuid,gen_random_uuid(),500000,'AI commerce integration test grant')", adminUser, it.ws)
	it.conn = it.one(it.admin, "SELECT inbox_connection($1::uuid,'live','ms',$2,decode('abcd','hex'))::text", it.ws, "ai-it-"+tag)
	// Only this test's jobs may be claimed by the worker below.
	it.exec(it.admin, "UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='AI_IT_ISOLATION' WHERE state='queued'")

	// Catalog: M has 1 in stock, L has 5. Floor = max(min price 900, list less 5%) = 950 BDT.
	wh := newUUID()
	it.exec(it.admin, "INSERT INTO commerce_warehouses(id,workspace_id,environment,name) VALUES($1::uuid,$2::uuid,'live','IT main')", wh, it.ws)
	product, _ := json.Marshal(map[string]any{"external_id": "IT-P1", "name": "IT Cotton Punjabi", "category": "punjabi", "search_aliases": []string{"punjabi"},
		"min_price_minor": 90000, "ai_notes": "SECRET-NOTE", "variants": []map[string]any{
			{"sku": "IT-P1-M", "price_minor": 100000, "stock": 1, "options": map[string]string{"size": "M"}},
			{"sku": "IT-P1-L", "price_minor": 100000, "stock": 5, "options": map[string]string{"size": "L"}}}})
	it.exec(it.admin, "SELECT commerce_catalog_write($1::uuid,'live',$2::uuid,gen_random_uuid(),$3::jsonb)", it.ws, it.user, string(product))
	vm := it.one(it.admin, "SELECT id::text FROM commerce_variants WHERE workspace_id=$1::uuid AND sku='IT-P1-M'", it.ws)
	vl := it.one(it.admin, "SELECT id::text FROM commerce_variants WHERE workspace_id=$1::uuid AND sku='IT-P1-L'", it.ws)

	// Live financial realm: projection, receiving account with an encrypted number.
	sourceVersion := it.one(it.admin, "SELECT source_version::text FROM resolve_financial_projection($1::uuid,'live')", it.ws)
	it.exec(it.live, "SELECT financial_sync_workspace($1::uuid,'live',$2::bigint,true)", it.ws, sourceVersion)
	account := it.one(it.live, "INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES($1::uuid,'live','bkash',$2,'0000') RETURNING id::text",
		it.ws, deviceevidence.Identity(payerKey, "it-account-"+tag))
	cipher, err := deviceevidence.Encrypt(pipelineKey, []byte("01700000000"), it.ws+"|live")
	if err != nil {
		t.Fatal(err)
	}
	if plain, err := merchantwebhook.Decrypt(pipelineKey, cipher, it.ws+"|live"); err != nil || string(plain) != "01700000000" {
		t.Fatal("receiving number envelope mismatch")
	}
	// The live realm's plan-limit trigger needs a fresh plan snapshot in the same transaction, as the API sets it.
	snapshot, _ := json.Marshal(map[string]any{"workspace_id": it.ws, "fetched_at": time.Now().UTC().Format(time.RFC3339Nano), "platform_billing": true})
	tx, err := it.live.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec("SELECT set_config('ekmivo.payment_plan',$1,true)", string(snapshot)); err == nil {
		_, err = tx.Exec("INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES($1::uuid,'live',$2::uuid,$3)", it.ws, account, cipher)
	}
	if err != nil {
		_ = tx.Rollback()
		t.Fatal(err)
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	settings, _ := json.Marshal(map[string]any{"ai_selling_enabled": true, "cod_enabled": true, "negotiation_enabled": true, "max_discount_pct": 5, "receiving_account_ids": []string{account}})
	it.exec(it.admin, "SELECT briofold_ai_selling_write($1::uuid,'live',$2::uuid,$3::jsonb)", it.ws, it.user, string(settings))

	t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "true")
	// Turn 1: search. Step 1 uses the job key, so finish accepts it (review B2).
	thread, state, reason, reply := it.say("psid-a", "punjabi ache?", `{"tool":"search_products","args":{"query":"punjabi"}}`, `{"reply":"IT Cotton Punjabi 1000 taka, M and L."}`)
	if state != "completed" || !strings.Contains(reply, "IT Cotton Punjabi") {
		t.Fatalf("turn 1: state=%s reason=%s reply=%q", state, reason, reply)
	}
	if r := fake.lastToolResult(); strings.Contains(r, "90000") || strings.Contains(r, "SECRET-NOTE") || !strings.Contains(r, "variant_ref") {
		t.Fatalf("search result leaked floor/notes or lacks refs: %s", r)
	}

	if cards := it.one(it.admin, "SELECT content->'ai_cards'->'cards'->0->>'name' FROM inbox_messages WHERE thread_id=$1::uuid AND sender='ai'", thread); cards != "IT Cotton Punjabi" {
		t.Fatal("search did not queue authoritative product cards")
	}
	t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "false")

	// Turn 2: 2 of the last unit -> out_of_stock result, customer is told, AI stays on (review B4).
	_, state, reason, reply = it.say("psid-a", "M size 2ta nibo",
		fmt.Sprintf(`{"tool":"upsert_order_draft","args":{"area":"dhaka","items":[{"variant_ref":"%s","quantity":2}]}}`, vm),
		`{"reply":"Sorry, only 1 M is available."}`)
	if state != "completed" || !strings.Contains(fake.lastToolResult(), "out_of_stock") || it.one(it.admin, "SELECT ai_enabled::text FROM inbox_threads WHERE id=$1::uuid", thread) != "true" {
		t.Fatalf("turn 2: state=%s reason=%s reply=%q", state, reason, reply)
	}

	// Turn 3: the model invents a price -> refused, retried once, then valid bargaining through quote_ref.
	_, state, _, _ = it.say("psid-a", "500 taka te dile nibo",
		fmt.Sprintf(`{"tool":"upsert_order_draft","args":{"items":[{"variant_ref":"%s","quantity":1,"unit_minor":50000}]}}`, vm),
		fmt.Sprintf(`{"tool":"quote_price","args":{"variant_ref":"%s","offer_minor":50000}}`, vm),
		`{"reply":"Best I can do is 975 taka."}`)
	if state != "completed" || !strings.Contains(fake.lastToolResult(), `"unit_minor": 97500`) && !strings.Contains(fake.lastToolResult(), `"unit_minor":97500`) {
		t.Fatalf("turn 3: state=%s quote=%s", state, fake.lastToolResult())
	}
	quoteRef := it.one(it.admin, "SELECT id::text FROM commerce_ai_quotes WHERE thread_id=$1::uuid ORDER BY created_at DESC LIMIT 1", thread)

	// Turn 4: order 1 M at the quoted price, address, then mobile payment -> decrypted receiving number reaches the customer.
	_, state, reason, reply = it.say("psid-a", "ok 975 e nibo, Mirpur 10, 01711111111, bkash",
		fmt.Sprintf(`{"tool":"upsert_order_draft","args":{"area":"dhaka","recipient":{"name":"IT","phone":"01711111111","address":"Mirpur 10"},"items":[{"variant_ref":"%s","quantity":1,"quote_ref":"%s"}]}}`, vm, quoteRef),
		`{"tool":"ask_payment_choice","args":{"choice":"mobile","method":"bkash"}}`,
		`{"reply":"Total 1045 taka. Please send to bKash 01700000000 and share the TrxID and your number."}`)
	if state != "completed" || !strings.Contains(reply, "01700000000") {
		t.Fatalf("turn 4: state=%s reason=%s reply=%q tool=%s", state, reason, reply, fake.lastToolResult())
	}
	total := it.one(it.admin, "SELECT total_minor::text FROM commerce_orders WHERE source_id=$1::uuid AND source='ai'", thread)
	if total != "104500" || it.one(it.admin, "SELECT reserved::text FROM commerce_stock WHERE variant_id=$1::uuid", vm) != "1" {
		t.Fatalf("order total/reservation: total=%s", total)
	}

	// Turn 5: proof without the sender number is refused before the database; then a full proof is stored as digests.
	_, state, _, reply = it.say("psid-a", "TrxID ittrx00001 dilam, 01711111111 theke",
		`{"tool":"submit_payment_proof","args":{"method":"bkash","transaction_id":"ittrx00001"}}`,
		`{"tool":"submit_payment_proof","args":{"method":"bkash","transaction_id":"ittrx00001","sender_number":"01711111111"}}`,
		`{"reply":"Thanks, we received it for checking."}`)
	if state != "completed" || strings.Contains(strings.ToLower(reply), "confirmed") {
		t.Fatalf("turn 5: state=%s reply=%q", state, reply)
	}
	if n := it.one(it.admin, "SELECT count(*)::text FROM ai_tool_calls WHERE workspace_id=$1::uuid AND (args_redacted::text ILIKE '%ittrx%' OR result::text ILIKE '%ittrx%' OR args_redacted::text LIKE '%01711111111%')", it.ws); n != "0" {
		t.Fatalf("raw TrxID or phone stored in ai_tool_calls: %s rows", n)
	}
	digest := deviceevidence.Identity(payerKey, "receipt|bkash|ITTRX00001")
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws) != "pending" {
		t.Fatal("claim not pending with the upper-cased digest")
	}

	// SMS arrives late: first verifier pass retries, the second (after the SMS) verifies.
	it.svc.verifyAIClaimsOnce(ctx)
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws) != "pending" {
		t.Fatal("claim resolved without an SMS")
	}
	event := it.one(it.live, "INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence) VALUES($1::uuid,'live','device_sms',$2,$3,now(),$4) RETURNING id::text",
		it.ws, "it-"+tag, deviceevidence.Identity(payerKey, "evt-"+tag), make([]byte, 48))
	it.exec(it.live, `INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
		VALUES($1::uuid,'live',$2::uuid,$3::uuid,$4,$5,$6::bigint,'bkash','incoming',now(),'second',1)`, it.ws, event, account, digest, deviceevidence.Identity(payerKey, "+8801711111111"), total)
	// The realm matcher has not decided yet: still no verification (closes the AI/checkout double-spend race).
	it.exec(it.admin, "UPDATE commerce_payment_claims SET next_try_at=now() WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws)
	it.svc.verifyAIClaimsOnce(ctx)
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws) != "pending" {
		t.Fatal("claim verified before the checkout matcher decided")
	}
	it.exec(it.live, "INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason,processed_at) SELECT workspace_id,environment,id,'unmatched','no_attempt',now() FROM financial_receipt_observations WHERE provider_reference_hmac=$1 AND workspace_id=$2::uuid", digest, it.ws)
	it.exec(it.admin, "UPDATE commerce_payment_claims SET next_try_at=now() WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws)
	it.svc.verifyAIClaimsOnce(ctx)
	if s := it.one(it.admin, "SELECT payment_state||'/'||status FROM commerce_orders WHERE source_id=$1::uuid AND source='ai'", thread); s != "verified/confirmed" {
		t.Fatalf("payment not verified: %s claim=%s", s, it.one(it.admin, "SELECT state||'/'||reason FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", digest, it.ws))
	}

	// Owner notice: exactly one 'paid' notice + badge event, one email to the verified owner, nothing on a second pass.
	var mails []receiptnotice.Message
	aiSendEmail = func(_ context.Context, _ *Service, m receiptnotice.Message) error {
		if m.Recipient.Email == "ai-it-"+tag+"@example.invalid" { // the shared fixture DB may hold earlier runs' notices
			mails = append(mails, m)
		}
		return nil
	}
	defer func() {
		aiSendEmail = func(context.Context, *Service, receiptnotice.Message) error { return errAINoticeUnconfigured }
	}()
	order := it.one(it.admin, "SELECT id::text FROM commerce_orders WHERE source_id=$1::uuid AND source='ai'", thread)
	if n := it.one(it.admin, "SELECT count(*)::text FROM commerce_ai_notices WHERE order_id=$1::uuid", order); n != "1" {
		t.Fatalf("want 1 notice, got %s", n)
	}
	if n := it.one(it.admin, "SELECT count(*)::text FROM commerce_events WHERE action='order-state' AND detail->>'order_id'=$1 AND detail->>'payment'='paid'", order); n != "1" {
		t.Fatalf("want 1 badge event, got %s", n)
	}
	it.svc.processAINotices(ctx, 10)
	it.svc.processAINotices(ctx, 10)
	if len(mails) != 1 || !strings.HasSuffix(mails[0].Recipient.Email, "@example.invalid") || !strings.Contains(mails[0].Subject, "Payment verified") ||
		strings.Contains(mails[0].Text, "01711111111") || it.one(it.admin, "SELECT state||'/'||email_state||'/'||push_state FROM commerce_ai_notices WHERE order_id=$1::uuid", order) != "sent/sent/skipped" {
		t.Fatalf("notice delivery: mails=%d state=%s", len(mails), it.one(it.admin, "SELECT state||'/'||email_state||'/'||push_state FROM commerce_ai_notices WHERE order_id=$1::uuid", order))
	}

	// COD and review notices fire once per kind, repeated state writes do not duplicate them.
	it.exec(it.admin, "UPDATE commerce_orders SET payment_state='cod' WHERE id=$1::uuid", order)
	it.exec(it.admin, "UPDATE commerce_orders SET payment_state='verified' WHERE id=$1::uuid", order)
	it.exec(it.admin, "UPDATE commerce_orders SET payment_state='cod' WHERE id=$1::uuid", order)
	it.exec(it.admin, "UPDATE commerce_payment_claims SET state='review' WHERE order_id=$1::uuid", order)
	it.exec(it.admin, "UPDATE commerce_payment_claims SET state='review' WHERE order_id=$1::uuid", order)
	if k := it.one(it.admin, "SELECT string_agg(kind,',' ORDER BY kind) FROM commerce_ai_notices WHERE order_id=$1::uuid", order); k != "cod,paid,review" {
		t.Fatalf("notice kinds: %s", k)
	}
	if n := it.one(it.admin, "SELECT count(*)::text FROM commerce_events WHERE action='order-state' AND detail->>'order_id'=$1 AND detail->>'source'='ai'", order); n != "3" {
		t.Fatalf("want 3 badge events, got %s", n)
	}
	it.exec(it.admin, "UPDATE commerce_payment_claims SET state='verified' WHERE order_id=$1::uuid", order)
	it.exec(it.admin, "UPDATE commerce_orders SET payment_state='verified' WHERE id=$1::uuid", order)

	// Turn 6: handover. The customer receives the reply first, then the thread is handed to a person.
	_, state, reason, reply = it.say("psid-a", "manager er sathe kotha bolbo", `{"tool":"handover_to_human","args":{"reason":"asked for a person"}}`)
	if state != "completed" || reply == "" || it.one(it.admin, "SELECT ai_enabled::text FROM inbox_threads WHERE id=$1::uuid", thread) != "false" {
		t.Fatalf("turn 6: state=%s reason=%s reply=%q", state, reason, reply)
	}

	// Runtime role: the worker's SQL works without owner rights (review B1); direct table reads stay denied.
	var denied error
	_, denied = it.svc.Auth.DB.ExecContext(ctx, "SELECT count(*) FROM ai_tool_calls")
	if denied == nil {
		t.Fatal("runtime role can read ai_tool_calls directly")
	}

	// Concurrency: two threads race for the last L units and for the same TrxID.
	it.exec(it.admin, "UPDATE commerce_stock SET on_hand=reserved+1 WHERE variant_id=$1::uuid", vl)
	type claimed struct{ ID, Lease string }
	lease := func(psid string) claimed {
		it.exec(it.admin, "SELECT inbox_ingest($1::uuid,$2,$3,'Racer',$4,'text',now())", it.conn, "race-"+psid+tag, psid, "race")
		var raw []byte
		if err := it.svc.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_channel_claim()").Scan(&raw); err != nil || len(raw) == 0 {
			t.Fatalf("claim for %s: %v", psid, err)
		}
		var c struct {
			ID    string `json:"id"`
			Lease string `json:"lease_id"`
		}
		_ = json.Unmarshal(raw, &c)
		return claimed{c.ID, c.Lease}
	}
	a, b := lease("race-a"), lease("race-b")
	tool := func(c claimed, step int, name, args string) map[string]any {
		var raw []byte
		if err := it.svc.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_tool($1::uuid,$2::uuid,$3,$4,$5::jsonb,'{}'::jsonb)", c.ID, c.Lease, step, name, args).Scan(&raw); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		var out map[string]any
		_ = json.Unmarshal(raw, &out)
		return out
	}
	results := make([]map[string]any, 2)
	var wg sync.WaitGroup
	for i, c := range []claimed{a, b} {
		wg.Add(1)
		go func(i int, c claimed) {
			defer wg.Done()
			results[i] = tool(c, 1, "upsert_order_draft", fmt.Sprintf(`{"area":"dhaka","recipient":{"address":"Race"},"items":[{"variant_ref":"%s","quantity":1}]}`, vl))
		}(i, c)
	}
	wg.Wait()
	oos := 0
	for _, r := range results {
		if r["error"] == "out_of_stock" {
			oos++
		}
	}
	if oos != 1 {
		t.Fatalf("last-unit race: want exactly one out_of_stock, got %v", results)
	}
	// Give both an order, then race the same TrxID.
	it.exec(it.admin, "UPDATE commerce_stock SET on_hand=on_hand+1 WHERE variant_id=$1::uuid", vl)
	// Owner settings: a stale revision is refused; the handover limit hands a large order to a person.
	settingsRev := it.one(it.admin, "SELECT revision::text FROM commerce_ai_settings WHERE workspace_id=$1::uuid AND environment='live'", it.ws)
	if _, err := it.svc.Pipeline.Control.Exec(ctx, "SELECT briofold_ai_selling_save($1::uuid,'live',$2::uuid,999999,'{\"handover_above_minor\":1}'::jsonb)", it.ws, it.user); err == nil || !strings.Contains(err.Error(), "40001") {
		t.Fatalf("stale settings revision accepted: %v", err)
	}
	it.exec(it.admin, "SELECT briofold_ai_selling_save($1::uuid,'live',$2::uuid,$3::bigint,'{\"handover_above_minor\":1}'::jsonb)", it.ws, it.user, settingsRev)
	for i, c := range []claimed{a, b} {
		r := tool(c, 2, "upsert_order_draft", fmt.Sprintf(`{"area":"dhaka","recipient":{"address":"Race"},"items":[{"variant_ref":"%s","quantity":1}]}`, vl))
		if i == 0 && r["handover"] != true {
			t.Fatalf("order above the owner's limit was not handed over: %v", r)
		}
		if i == 0 {
			it.exec(it.admin, "SELECT briofold_ai_selling_save($1::uuid,'live',$2::uuid,$3::bigint,'{\"handover_above_minor\":0}'::jsonb)", it.ws, it.user,
				it.one(it.admin, "SELECT revision::text FROM commerce_ai_settings WHERE workspace_id=$1::uuid AND environment='live'", it.ws))
		}
		tool(c, 3, "ask_payment_choice", `{"choice":"mobile"}`)
	}
	same := deviceevidence.Identity(payerKey, "receipt|bkash|RACE00001")
	proof := fmt.Sprintf(`{"method":"bkash","transaction_digest":"%s","transaction_last4":"0001","payer_digest":"%s","payer_last3":"111"}`, same, deviceevidence.Identity(payerKey, "+8801711111111"))
	for i, c := range []claimed{a, b} {
		wg.Add(1)
		go func(i int, c claimed) { defer wg.Done(); results[i] = tool(c, 4, "submit_payment_proof", proof) }(i, c)
	}
	wg.Wait()
	accepted := 0
	for _, r := range results {
		if r["accepted"] == true {
			accepted++
		}
	}
	if accepted != 1 || it.one(it.admin, "SELECT count(*)::text FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", same, it.ws) != "1" {
		t.Fatalf("same-TrxID race: accepted=%d results=%v", accepted, results)
	}
	// A retried step replays its stored result and never acts twice.
	if again := tool(a, 4, "submit_payment_proof", proof); fmt.Sprint(again) != fmt.Sprint(results[0]) {
		t.Fatalf("retry did not replay: %v vs %v", again, results[0])
	}

	// Owner review: the accepted race claim goes to review; approving confirms the order once and tells the buyer once.
	claim := it.one(it.admin, "SELECT id::text FROM commerce_payment_claims WHERE transaction_digest=$1 AND workspace_id=$2::uuid", same, it.ws)
	it.exec(it.admin, "SELECT briofold_ai_claim_resolve($1::uuid,'review','no_matching_sms')", claim)
	var queue []byte
	if err := it.svc.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_review_queue($1::uuid,'live',$2::uuid)", it.ws, it.user).Scan(&queue); err != nil || !strings.Contains(string(queue), claim) {
		t.Fatalf("review queue: %v %s", err, queue)
	}
	if _, err := it.svc.Pipeline.Control.Exec(ctx, "SELECT briofold_ai_review_decide($1::uuid,'live',$2::uuid,$3::uuid,'approve')", it.ws, it.user, claim); err != nil {
		t.Fatalf("approve: %v", err)
	}
	if _, err := it.svc.Pipeline.Control.Exec(ctx, "SELECT briofold_ai_review_decide($1::uuid,'live',$2::uuid,$3::uuid,'approve')", it.ws, it.user, claim); err == nil {
		t.Fatal("a decided claim was decided twice")
	}
	raceOrder := it.one(it.admin, "SELECT order_id::text FROM commerce_payment_claims WHERE id=$1::uuid", claim)
	if s := it.one(it.admin, "SELECT payment_state||'/'||status FROM commerce_orders WHERE id=$1::uuid", raceOrder); s != "verified/confirmed" {
		t.Fatalf("approved order: %s", s)
	}
	for _, o := range []string{order, raceOrder} {
		if n := it.one(it.admin, "SELECT count(*)::text FROM inbox_messages WHERE idempotency_key=$1::uuid AND sender='seller'", o); n != "1" {
			t.Fatalf("buyer paid message for %s: %s", o, n)
		}
	}

	t.Run("channel photo catalog and picker", func(t *testing.T) {
		fixture := *it
		fixture.t = t
		it := &fixture
		product := it.one(it.admin, "SELECT product_id::text FROM commerce_variants WHERE id=$1::uuid", vm)
		media := newUUID()
		sha := strings.Repeat("f", 64)
		hash := strings.Repeat("1", 64)
		it.exec(it.admin, `INSERT INTO commerce_media(id,workspace_id,environment,object_key,mime,name,sha256)
			VALUES($1::uuid,$2::uuid,'live',$1::text,'image/png','fixture.png',$3)`, media, it.ws, sha)
		it.exec(it.admin, "UPDATE commerce_products SET images=ARRAY[$1::uuid] WHERE id=$2::uuid", media, product)
		it.exec(it.admin, "SELECT commerce_photo_index($1::uuid,'live',$2::uuid,$3::uuid,$4,$5,'[120,40,20]')",
			it.ws, it.user, media, sha, hash)
		var raw []byte
		photo := "SELECT briofold_ai_channel_photo_products($1::uuid,$2::uuid,$3,'[120,40,20]')"
		if err := it.svc.Pipeline.Control.QueryRow(ctx, photo, a.ID, a.Lease, hash).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(raw), product) || strings.Contains(string(raw), "SECRET-NOTE") {
			t.Fatal("photo search failed to return public product facts")
		}
		if err := it.svc.Pipeline.Control.QueryRow(ctx, photo, a.ID, newUUID(), hash).Scan(&raw); err == nil {
			t.Fatal("photo search accepted an invalid lease")
		}

		picker := "SELECT briofold_inbox_catalog($1::uuid,'live',$2::uuid,$3::uuid,$4,$5::jsonb)"
		runtime := it.svc.Auth.DB
		if err := runtime.QueryRowContext(ctx, picker, it.ws, it.user, thread, "products", "{}").Scan(&raw); err != nil || !strings.Contains(string(raw), product) {
			t.Fatalf("catalog picker did not return the commerce product: %v", err)
		}
		viewer := it.one(it.admin, "INSERT INTO app_users(email,display_name,password_hash) VALUES($1,'AI IT viewer','fixture') RETURNING id::text", tag+"-picker-viewer@example.invalid")
		it.exec(it.admin, "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1::uuid,$2::uuid,'viewer')", it.ws, viewer)
		key := newUUID()
		input := fmt.Sprintf(`{"product_id":"%s","idempotency_key":"%s"}`, product, key)
		for _, action := range []string{"products", "send-product"} {
			err := runtime.QueryRowContext(ctx, picker, it.ws, viewer, thread, action, input).Scan(&raw)
			var pg *pgconn.PgError
			if !errors.As(err, &pg) || pg.Code != "42501" {
				t.Fatalf("viewer %s: expected denial, got %v", action, err)
			}
		}
		for i := 0; i < 2; i++ {
			if err := runtime.QueryRowContext(ctx, picker, it.ws, it.user, thread, "send-product", input).Scan(&raw); err != nil {
				t.Fatal(err)
			}
		}
		if got := it.one(it.admin, "SELECT count(*)::text FROM inbox_messages WHERE thread_id=$1::uuid AND type='product' AND idempotency_key=$2::uuid AND requested_by=$3::uuid", thread, key, it.user); got != "1" {
			t.Fatalf("expected one authorized, idempotent send, got %s", got)
		}
	})

	t.Run("signed product postback is a scoped customer turn", func(t *testing.T) {
		fixture := *it
		fixture.t = t
		it := &fixture
		t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "true")
		const secret = "isolated-fixture-meta-signature"
		t.Setenv("META_APP_SECRET", secret)
		token := signAIOrderButton(pipelineKey, it.ws, thread, vm, time.Now().Add(time.Minute).Unix())
		send := func(sender, id, button string) {
			body, _ := json.Marshal(map[string]any{"object": "page", "entry": []any{
				map[string]any{"id": "ai-it-" + tag, "messaging": []any{map[string]any{
					"sender":    map[string]string{"id": sender},
					"timestamp": time.Now().UnixMilli(),
					"postback":  map[string]string{"mid": id, "payload": button},
				}}},
			}})
			r := httptest.NewRequest(http.MethodPost, "/v1/inbox/meta/webhook", strings.NewReader(string(body)))
			r.Header.Set("X-Hub-Signature-256", "sha256="+hex.EncodeToString(channelHMAC([]byte(secret), body)))
			w := httptest.NewRecorder()
			it.svc.HandleInboxWebhook(w, r)
			if w.Code != http.StatusOK {
				t.Fatalf("webhook status %d: %s", w.Code, w.Body)
			}
		}
		accepted := "it-button-valid-" + tag
		send("psid-a", accepted, token)
		send("psid-a", accepted, token)
		got := it.one(it.admin, "SELECT body FROM inbox_messages WHERE thread_id=$1::uuid AND provider_id=$2 AND sender='customer'", thread, accepted)
		if !strings.Contains(got, vm) || strings.Contains(got, token) {
			t.Fatal("button was not ingested as an ordinary customer turn")
		}
		rejected := "it-button-rejected-" + tag
		send("psid-a", rejected, signAIOrderButton(pipelineKey, it.ws, thread, vm, time.Now().Add(-time.Minute).Unix()))
		send("psid-a", rejected, signAIOrderButton(pipelineKey, newUUID(), thread, vm, time.Now().Add(time.Minute).Unix()))
		if count := it.one(it.admin, "SELECT count(*)::text FROM inbox_messages WHERE workspace_id=$1::uuid AND provider_id=$2", it.ws, rejected); count != "0" {
			t.Fatal("rejected buttons became customer messages")
		}
	})

	t.Run("Both mode checkout expires with draft and verifies paid order", func(t *testing.T) {
		fixture := *it
		fixture.t = t
		it := &fixture
		t.Setenv("BRIOFOLD_AI_CHANNEL_COMMERCE_ENABLED", "true")
		it.svc.TokenKey = pipelineKey
		it.exec(it.admin, "UPDATE commerce_stock SET on_hand=on_hand+2 WHERE variant_id=$1::uuid", vl)
		it.exec(it.admin, "UPDATE briofold_ai_channel_jobs SET state='cancelled' WHERE workspace_id=$1::uuid AND state IN ('queued','running')", it.ws)
		it.exec(it.admin, "INSERT INTO pg13_plans(id,name,amount_minor) VALUES('ai_link_fixture','AI link fixture',10000) ON CONFLICT DO NOTHING")
		it.exec(it.admin, "INSERT INTO pg13_subscriptions(workspace_id,plan_id,paid_until,grace_until) VALUES($1::uuid,'ai_link_fixture',now()+interval '1 day',now()+interval '2 days') ON CONFLICT DO NOTHING", it.ws)
		it.exec(it.live, `INSERT INTO pg06_devices(workspace_id,environment,account_id,name,source,parser_id,binding,heartbeat_at,permission_ok)
			VALUES($1::uuid,'live',$2::uuid,'Fixture device','fixture','fixture','fixture',now(),true)`, it.ws, account)
		payThread, state, _, _ := it.say("psid-checkout", "Please prepare an order and send the checkout link.",
			fmt.Sprintf(`{"tool":"upsert_order_draft","args":{"area":"dhaka","recipient":{"name":"Fixture","phone":"01700000001","address":"Fixture delivery"},"items":[{"variant_ref":"%s","quantity":1}]}}`, vl),
			`{"tool":"ask_payment_choice","args":{"choice":"link"}}`,
			`{"reply":"Please use the checkout link for this order."}`)
		if state != "completed" || !strings.Contains(fake.lastToolResult(), "payment_link_prepared") {
			t.Fatalf("link was not prepared: %s %s", state, fake.lastToolResult())
		}
		var link aiPaymentLink
		err := it.admin.QueryRowContext(ctx, `SELECT order_id::text,intent_id::text,amount_minor,expires_at
			FROM commerce_ai_payment_links WHERE workspace_id=$1::uuid AND thread_id=$2::uuid`,
			it.ws, payThread).Scan(&link.Order, &link.Intent, &link.Amount, &link.ExpiresAt)
		if err != nil {
			t.Fatal(err)
		}
		var intentExpiry time.Time
		if err := it.live.QueryRowContext(ctx, "SELECT expires_at FROM payment_intents WHERE id=$1::uuid AND amount_minor=$2", link.Intent, link.Amount).Scan(&intentExpiry); err != nil || !intentExpiry.Equal(link.ExpiresAt) {
			t.Fatalf("intent did not inherit exact draft expiry: %v", err)
		}
		checkoutURL := it.svc.aiOrderCheckoutURL(ctx, it.ws, payThread, link.Order)
		if !strings.Contains(checkoutURL, "/checkout/") || it.svc.aiOrderCheckoutURL(ctx, it.ws, thread, link.Order) != "" {
			t.Fatal("checkout URL unavailable or escaped its thread")
		}
		if count := it.one(it.admin, `SELECT count(*)::text FROM inbox_messages WHERE thread_id=$1::uuid AND (body LIKE '%'||$2||'%' OR content::text LIKE '%'||$2||'%')`, payThread, checkoutURL); count != "0" {
			t.Fatal("raw checkout link persisted")
		}
		it.svc.resolveAIOrderPaymentLinks(ctx)
		if status := it.one(it.admin, "SELECT payment_state FROM commerce_orders WHERE id=$1::uuid", link.Order); status != "none" {
			t.Fatal("unpaid link verified an order")
		}
		payer := deviceevidence.Identity(payerKey, "ai-link-payer-"+tag)
		it.exec(it.live, `INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version)
			VALUES($1::uuid,'live',$2::uuid,$3::uuid,$4,'1000',$5,'bkash',now(),now()+interval '2 minutes',1)`,
			it.ws, link.Intent, account, payer, link.Amount)
		inbound := it.one(it.live, `INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
			VALUES($1::uuid,'live','device_sms',$2,$3,now(),$4) RETURNING id::text`, it.ws, "link-"+tag,
			deviceevidence.Identity(payerKey, "link-receipt-"+tag), make([]byte, 48))
		observation := it.one(it.live, `INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
			VALUES($1::uuid,'live',$2::uuid,$3::uuid,$4,$5,$6,'bkash','incoming',now(),'second',1) RETURNING id::text`,
			it.ws, inbound, account, deviceevidence.Identity(payerKey, "link-reference-"+tag), payer, link.Amount)
		it.exec(it.live, "INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason) VALUES($1::uuid,'live',$2::uuid,'pending','fixture') ON CONFLICT DO NOTHING", it.ws, observation)
		if match := it.one(it.live, "SELECT pg07_match($1::uuid,$2::bigint)", observation, sourceVersion); match != "matched" {
			t.Fatalf("receipt match: %s", match)
		}
		it.exec(it.admin, "UPDATE commerce_ai_payment_links SET checked_at='-infinity' WHERE order_id=$1::uuid", link.Order)
		it.svc.resolveAIOrderPaymentLinks(ctx)
		if status := it.one(it.admin, "SELECT payment_state||'/'||status FROM commerce_orders WHERE id=$1::uuid", link.Order); status != "verified/confirmed" {
			t.Fatalf("paid link did not verify the order: %s", status)
		}
	})

	t.Run("Meta customer name cache retries and owner merge preserves records", func(t *testing.T) {
		fixture := *it
		fixture.t = t
		it := &fixture
		external := tag
		cipher, err := deviceevidence.Encrypt(pipelineKey, []byte("fixture-page-credential"), it.ws+"|inbox|ms|ai-it-"+tag)
		if err != nil {
			t.Fatal(err)
		}
		it.exec(it.admin, "UPDATE inbox_connections SET credential_cipher=$1 WHERE id=$2::uuid", cipher, it.conn)
		it.exec(it.admin, "SELECT inbox_ingest($1::uuid,$2,$3,'Existing name','Hello','text',now())", it.conn, "meta-name-"+tag, external)
		named := it.one(it.admin, "SELECT id::text FROM inbox_threads WHERE connection_id=$1::uuid AND external_id=$2", it.conn, external)
		t.Setenv("META_GRAPH_VERSION", "v25.0")
		old := inboxHTTP
		defer func() { inboxHTTP = old }()
		requests := 0
		inboxHTTP = &http.Client{Transport: telegramTransport(func(r *http.Request) (*http.Response, error) {
			if r.URL.Host != "graph.facebook.com" || !strings.HasSuffix(r.URL.Path, "/"+external) {
				return &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader("{}"))}, nil
			}
			if r.Header.Get("Authorization") != "Bearer fixture-page-credential" || r.URL.Query().Get("fields") != "first_name,last_name" || strings.Contains(r.URL.RawQuery, "credential") {
				t.Error("unexpected Graph authorization or requested profile fields")
			}
			requests++
			if requests == 1 {
				return &http.Response{StatusCode: 429, Body: io.NopCloser(strings.NewReader("{}"))}, nil
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"first_name":"ফিকশনাল","last_name":"ক্রেতা"}`))}, nil
		})}
		it.svc.refreshMetaCustomerNames(ctx)
		it.svc.refreshMetaCustomerNames(ctx)
		if got := it.one(it.admin, "SELECT customer_name FROM inbox_threads WHERE id=$1::uuid", named); got != "Existing name" || requests != 1 {
			t.Fatalf("failed refresh replaced the name or retried too early: %s (%d calls)", got, requests)
		}
		it.exec(it.admin, "UPDATE inbox_threads SET meta_name_next_at=now()-interval '1 second' WHERE id=$1::uuid", named)
		it.svc.refreshMetaCustomerNames(ctx)
		it.svc.refreshMetaCustomerNames(ctx)
		customer := it.one(it.admin, "SELECT customer_id::text FROM briofold_customer_sources WHERE workspace_id=$1::uuid AND kind='thread' AND source_id=$2::uuid", it.ws, named)
		if got := it.one(it.admin, "SELECT name FROM briofold_customers WHERE id=$1::uuid", customer); got != "ফিকশনাল ক্রেতা" || requests != 2 {
			t.Fatalf("cached Graph name missing or fetched before TTL: %s (%d calls)", got, requests)
		}
		duplicate := it.one(it.admin, "INSERT INTO briofold_customers(workspace_id,environment,name) VALUES($1::uuid,'live','Duplicate profile') RETURNING id::text", it.ws)
		it.exec(it.admin, "UPDATE briofold_customers SET phone='fixture-identity-match' WHERE id IN ($1::uuid,$2::uuid)", customer, duplicate)
		it.exec(it.admin, `INSERT INTO briofold_customer_proofs(workspace_id,environment,customer_id,kind,value)
			VALUES($1::uuid,'live',$2::uuid,'email',$4),($1::uuid,'live',$3::uuid,'email',$4)`, it.ws, customer, duplicate, tag+"@example.invalid")
		it.exec(it.admin, "INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES($1::uuid,'live',$2::uuid,'api',gen_random_uuid())", it.ws, duplicate)
		it.exec(it.admin, "UPDATE commerce_orders SET customer_id=$1::uuid WHERE id=$2::uuid", duplicate, raceOrder)
		it.exec(it.admin, "INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,action) VALUES($1::uuid,'live',$2::uuid,'fixture-history')", it.ws, duplicate)
		admin := it.one(it.admin, "INSERT INTO app_users(email,display_name,password_hash) VALUES($1,'Other admin','fixture') RETURNING id::text", tag+"-merge-admin@example.invalid")
		it.exec(it.admin, "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1::uuid,$2::uuid,'admin')", it.ws, admin)
		input := fmt.Sprintf(`{"id":"%s","target":"%s","revision":%s,"confirmed":true}`, customer, duplicate,
			it.one(it.admin, "SELECT revision::text FROM briofold_customers WHERE id=$1::uuid", customer))
		command := "SELECT briofold_customer_owner_merge($1::uuid,'live',$2::uuid,$3::uuid,$4::jsonb)->>'id'"
		key := newUUID()
		if _, err = it.svc.Auth.DB.ExecContext(ctx, command, it.ws, admin, key, input); err == nil {
			t.Fatal("non-owner merged customer profiles")
		}
		if got := it.one(it.admin, "SELECT coalesce(merged_into::text,'') FROM briofold_customers WHERE id=$1::uuid", duplicate); got != "" {
			t.Fatal("matching identities auto-merged")
		}
		for i := 0; i < 2; i++ {
			if survivor := it.one(it.svc.Auth.DB, command, it.ws, it.user, key, input); survivor != customer {
				t.Fatalf("unexpected canonical merge target: %s", survivor)
			}
		}
		if linked := it.one(it.admin, "SELECT customer_id::text FROM commerce_orders WHERE id=$1::uuid", raceOrder); linked != customer {
			t.Fatal("merge lost a commerce order")
		}
		if count := it.one(it.admin, "SELECT count(*)::text FROM briofold_customer_sources WHERE customer_id=$1::uuid", customer); count != "2" {
			t.Fatal("merge lost source records")
		}
		history := it.one(it.svc.Auth.DB, "SELECT briofold_customer_identity_detail($1::uuid,'live',$2::uuid,$3::uuid,0,'','')->>'events'", it.ws, it.user, customer)
		if !strings.Contains(history, "fixture-history") || strings.Count(history, "merge-survived") != 1 {
			t.Fatal("merge lost historical activity or duplicated its audit")
		}
	})

}
