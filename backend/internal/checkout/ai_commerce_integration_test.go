package checkout

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/briofold/backend/internal/aicredits"
	"github.com/masharzy/briofold/backend/internal/authz"
	"github.com/masharzy/briofold/backend/internal/deviceevidence"
	"github.com/masharzy/briofold/backend/internal/merchantwebhook"
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
	it.exec(it.live, "INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES($1::uuid,'live',$2::uuid,$3)", it.ws, account, cipher)
	settings, _ := json.Marshal(map[string]any{"ai_selling_enabled": true, "cod_enabled": true, "negotiation_enabled": true, "max_discount_pct": 5, "receiving_account_ids": []string{account}})
	it.exec(it.admin, "SELECT briofold_ai_selling_write($1::uuid,'live',$2::uuid,$3::jsonb)", it.ws, it.user, string(settings))

	// Turn 1: search. Step 1 uses the job key, so finish accepts it (review B2).
	thread, state, reason, reply := it.say("psid-a", "punjabi ache?", `{"tool":"search_products","args":{"query":"punjabi"}}`, `{"reply":"IT Cotton Punjabi 1000 taka, M and L."}`)
	if state != "completed" || !strings.Contains(reply, "IT Cotton Punjabi") {
		t.Fatalf("turn 1: state=%s reason=%s reply=%q", state, reason, reply)
	}
	if r := fake.lastToolResult(); strings.Contains(r, "90000") || strings.Contains(r, "SECRET-NOTE") || !strings.Contains(r, "variant_ref") {
		t.Fatalf("search result leaked floor/notes or lacks refs: %s", r)
	}

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
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1", digest) != "pending" {
		t.Fatal("claim not pending with the upper-cased digest")
	}

	// SMS arrives late: first verifier pass retries, the second (after the SMS) verifies.
	it.svc.verifyAIClaimsOnce(ctx)
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1", digest) != "pending" {
		t.Fatal("claim resolved without an SMS")
	}
	event := it.one(it.live, "INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence) VALUES($1::uuid,'live','device_sms',$2,$3,now(),$4) RETURNING id::text",
		it.ws, "it-"+tag, deviceevidence.Identity(payerKey, "evt-"+tag), make([]byte, 48))
	it.exec(it.live, `INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
		VALUES($1::uuid,'live',$2::uuid,$3::uuid,$4,$5,$6::bigint,'bkash','incoming',now(),'second',1)`, it.ws, event, account, digest, deviceevidence.Identity(payerKey, "+8801711111111"), total)
	// The realm matcher has not decided yet: still no verification (closes the AI/checkout double-spend race).
	it.exec(it.admin, "UPDATE commerce_payment_claims SET next_try_at=now() WHERE transaction_digest=$1", digest)
	it.svc.verifyAIClaimsOnce(ctx)
	if it.one(it.admin, "SELECT state FROM commerce_payment_claims WHERE transaction_digest=$1", digest) != "pending" {
		t.Fatal("claim verified before the checkout matcher decided")
	}
	it.exec(it.live, "INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason,processed_at) SELECT workspace_id,environment,id,'unmatched','no_attempt',now() FROM financial_receipt_observations WHERE provider_reference_hmac=$1", digest)
	it.exec(it.admin, "UPDATE commerce_payment_claims SET next_try_at=now() WHERE transaction_digest=$1", digest)
	it.svc.verifyAIClaimsOnce(ctx)
	if s := it.one(it.admin, "SELECT payment_state||'/'||status FROM commerce_orders WHERE source_id=$1::uuid AND source='ai'", thread); s != "verified/confirmed" {
		t.Fatalf("payment not verified: %s claim=%s", s, it.one(it.admin, "SELECT state||'/'||reason FROM commerce_payment_claims WHERE transaction_digest=$1", digest))
	}

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
	for _, c := range []claimed{a, b} {
		tool(c, 2, "upsert_order_draft", fmt.Sprintf(`{"area":"dhaka","recipient":{"address":"Race"},"items":[{"variant_ref":"%s","quantity":1}]}`, vl))
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
	if accepted != 1 || it.one(it.admin, "SELECT count(*)::text FROM commerce_payment_claims WHERE transaction_digest=$1", same) != "1" {
		t.Fatalf("same-TrxID race: accepted=%d results=%v", accepted, results)
	}
	// A retried step replays its stored result and never acts twice.
	if again := tool(a, 4, "submit_payment_proof", proof); fmt.Sprint(again) != fmt.Sprint(results[0]) {
		t.Fatalf("retry did not replay: %v vs %v", again, results[0])
	}
}
