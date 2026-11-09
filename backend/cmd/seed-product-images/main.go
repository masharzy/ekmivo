// Command seed-product-images gives seeded test products a generated image, stored like an owner upload.
// Test databases only: it refuses production-looking database names and remote hosts that are not named in
// SEED_ALLOWED_HOST, the same guard as tools/testing/seed-ai-commerce-sandbox.mjs.
//
//	SEED_CONTROL_URL=postgres://... PRIVATE_S3_ENDPOINT=... PRIVATE_S3_REGION=... PRIVATE_S3_BUCKET=... \
//	PRIVATE_S3_ACCESS_KEY=... PRIVATE_S3_SECRET_KEY=... \
//	go run ./cmd/seed-product-images -workspace <uuid> -actor <owner uuid> [-env sandbox] [-prefix TEST]
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/masharzy/briofold/backend/internal/checkout"
)

func main() {
	ws := flag.String("workspace", "", "workspace id")
	actor := flag.String("actor", "", "owner/admin user id")
	env := flag.String("env", "sandbox", "live or sandbox")
	prefix := flag.String("prefix", "TEST", "only products whose name starts with this")
	flag.Parse()
	dsn := os.Getenv("SEED_CONTROL_URL")
	u, err := url.Parse(dsn)
	if err != nil || dsn == "" || *ws == "" || *actor == "" || *prefix == "" {
		fail("need SEED_CONTROL_URL, -workspace, -actor and a non-empty -prefix")
	}
	if regexp.MustCompile(`(?i)prod|live`).MatchString(u.Path) {
		fail("refusing a database whose name looks like production")
	}
	if h := u.Hostname(); h != "localhost" && h != "127.0.0.1" && h != "::1" && h != os.Getenv("SEED_ALLOWED_HOST") {
		fail("remote host must be named exactly in SEED_ALLOWED_HOST")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fail(err.Error())
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	if u.Hostname() == os.Getenv("SEED_ALLOWED_HOST") {
		var marker bool
		if err := db.QueryRowContext(ctx, "SELECT to_regclass('public.briofold_test_branch') IS NOT NULL").Scan(&marker); err != nil || !marker {
			fail("remote database lacks the briofold_test_branch marker table")
		}
	}
	n, err := checkout.SeedCatalogImages(ctx, db, *ws, *env, *actor, *prefix)
	if err != nil {
		fail(fmt.Sprintf("seeded %d before error: %v", n, err))
	}
	fmt.Printf("seeded images for %d products\n", n)
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "seed-product-images:", msg)
	os.Exit(2)
}
