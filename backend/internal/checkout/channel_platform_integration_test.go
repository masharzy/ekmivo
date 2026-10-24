package checkout

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestTelegramControlWebhookIsolation(t *testing.T) {
	dsn := os.Getenv("PG_CHANNEL_SETUP_TEST_CONTROL_URL")
	if dsn == "" {
		t.Skip("isolated CONTROL only")
	}
	u, e := url.Parse(dsn)
	if e != nil || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || strings.Contains(strings.ToLower(u.Path), "prod") {
		t.Fatal("refusing shared database")
	}
	ctx := context.Background()
	db, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	var actor, ws, other string
	if e = db.QueryRow(ctx, "SELECT id FROM app_users LIMIT 1").Scan(&actor); e != nil {
		t.Fatal(e)
	}
	if e = db.QueryRow(ctx, "INSERT INTO workspaces(name,service_mode,created_by) VALUES('Telegram isolated fixture','ai',$1::uuid) RETURNING id", actor).Scan(&ws); e != nil {
		t.Fatal(e)
	}
	if e = db.QueryRow(ctx, "INSERT INTO workspaces(name,service_mode,created_by) VALUES('Telegram foreign fixture','ai',$1::uuid) RETURNING id", actor).Scan(&other); e != nil {
		t.Fatal(e)
	}
	var conn string
	bot := "987654321011"
	if e = db.QueryRow(ctx, "SELECT inbox_connection($1::uuid,'live','tg',$2,decode('abcd','hex'))", ws, bot).Scan(&conn); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, "SELECT inbox_connection($1::uuid,'live','tg',$2,decode('abcd','hex'))", other, bot); e == nil {
		t.Fatal("bot crossed business")
	}
	s := Service{Pipeline: &Pipeline{Control: db, Key: []byte("01234567890123456789012345678901")}}
	body := `{"update_id":42,"message":{"message_id":9,"date":1700000000,"text":"IELTS fee?","from":{"id":42,"first_name":"Test"},"chat":{"id":42,"type":"private"}}}`
	call := func(secret, raw string) int {
		r := httptest.NewRequest("POST", "/v1/channels/telegram/"+bot+"/webhook", strings.NewReader(raw))
		r.SetPathValue("botID", bot)
		r.Header.Set("X-Telegram-Bot-Api-Secret-Token", secret)
		w := httptest.NewRecorder()
		s.HandleTelegramWebhook(w, r)
		return w.Code
	}
	secret := telegramSecret(s.Pipeline.Key, bot)
	if got := call("wrong", body); got != 403 {
		t.Fatal(got)
	}
	for i := 0; i < 2; i++ {
		if got := call(secret, body); got != 200 {
			t.Fatal(got)
		}
	}
	var n int
	if e = db.QueryRow(ctx, "SELECT count(*) FROM inbox_messages WHERE workspace_id=$1::uuid", ws).Scan(&n); e != nil || n != 1 {
		t.Fatal("replay not deduplicated", n, e)
	}
	_, _ = db.Exec(ctx, "UPDATE inbox_connections SET enabled=false WHERE id=$1::uuid", conn)
	if call(secret, strings.Replace(body, `"update_id":42`, `"update_id":43`, 1)) != 200 {
		t.Fatal("disabled ack")
	}
	_ = db.QueryRow(ctx, "SELECT count(*) FROM inbox_messages WHERE workspace_id=$1::uuid", ws).Scan(&n)
	if n != 1 {
		t.Fatal("disabled connection ingested")
	}
	var caps []byte
	if e = db.QueryRow(ctx, "SELECT inbox_capabilities('tg')").Scan(&caps); e != nil || !strings.Contains(string(caps), `"image": false`) {
		t.Fatal("false media capability", string(caps), e)
	}
	// No app-role direct access to encrypted platform storage.
	var exposed bool
	if e = db.QueryRow(ctx, "SELECT has_table_privilege('ekmivo_financial_runtime','channel_platform_config','SELECT')").Scan(&exposed); e != nil || exposed {
		t.Fatal("platform secret table exposed", e)
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "INSERT INTO platform_administrators(user_id,role) VALUES($1::uuid,'super_admin') ON CONFLICT(user_id) DO UPDATE SET role='super_admin'", actor); e != nil {
		t.Fatal(e)
	}
	var revision string
	if e = tx.QueryRow(ctx, "SELECT coalesce(encode(digest(channel_platform_config_read(),'sha256'),'hex'),'initial')").Scan(&revision); e != nil {
		t.Fatal(e)
	}
	cipher := make([]byte, 32)
	if _, e = tx.Exec(ctx, "SELECT channel_platform_config_write($1::uuid,$2,'Isolated configuration test',$3)", actor, cipher, revision); e != nil {
		t.Fatal(e)
	}
	var saved []byte
	if e = tx.QueryRow(ctx, "SELECT channel_platform_config_read()").Scan(&saved); e != nil || len(saved) != 32 {
		t.Fatal("config not stored", e)
	}
	if _, e = tx.Exec(ctx, "SELECT channel_platform_config_write($1::uuid,$2,'Reject concurrent changes',$3)", actor, cipher, revision); e == nil {
		t.Fatal("stale configuration overwrote current")
	}
	_ = tx.Rollback(ctx)
	fmt.Println("CHANNEL SETUP SQL/Go PASS: signed Telegram intake, replay deduplication, tenant ownership, disconnect and text-only capabilities")
}
