// Explicit operator tool. No runtime/API path invokes this command.
package main

import (
	_ "github.com/masharzy/briofold/backend/internal/envcompat"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/briofold/backend/internal/checkout"
	"io"
	"os"
	"strings"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Private object operation unconfirmed; no privacy-completion claim. Inspect restricted operator diagnostics.")
		os.Exit(1)
	}
}
func run() error {
	action := flag.String("action", "export", "export or expire")
	request := flag.String("request", "", "reviewed privacy request UUID")
	workspace := flag.String("workspace", "", "workspace UUID")
	realm := flag.String("realm", "", "live or sandbox")
	output := flag.String("output", "", "private encrypted export path")
	flag.Parse()
	if (*action != "export" && *action != "expire") || (*realm != "live" && *realm != "sandbox") || os.Getenv("BRIOFOLD_PRIVACY_OBJECTS_ENABLED") != "true" {
		return errors.New("explicit operator configuration required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	controlURL := os.Getenv("BRIOFOLD_PRIVACY_CONTROL_DATABASE_URL")
	financialURL := os.Getenv("BRIOFOLD_PRIVACY_" + strings.ToUpper(*realm) + "_DATABASE_URL")
	if strings.TrimSpace(controlURL) == "" || strings.TrimSpace(financialURL) == "" {
		return errors.New("explicit control and financial database URLs required")
	}
	control, err := pgxpool.New(ctx, controlURL)
	if err != nil {
		return err
	}
	defer control.Close()
	var kind string
	var owner bool
	err = control.QueryRow(ctx, `SELECT r.kind,current_user=pg_get_userbyid(c.relowner) FROM pg13_privacy_requests r JOIN pg_class c ON c.oid='workspaces'::regclass WHERE r.id=$1::uuid AND r.workspace_id=$2::uuid AND r.status IN('requested','processing','blocked','complete_with_retention') AND to_regclass('financial_realm') IS NULL AND EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=r.workspace_id AND m.user_id=r.actor_id AND m.role='owner' AND u.disabled_at IS NULL)`, *request, *workspace).Scan(&kind, &owner)
	if err != nil || !owner || (*action == "export" && kind != "export") || (*action == "expire" && kind != "delete") {
		return errors.New("open reviewed request required")
	}
	pool, err := pgxpool.New(ctx, financialURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if *action == "expire" {
		if os.Getenv("BRIOFOLD_PRIVACY_EXPIRE_ENABLED") != "true" || len(os.Getenv("PRIVATE_S3_UNVERSIONED_REVIEW_REFERENCE")) < 10 {
			return errors.New("reviewed unversioned storage disposition required")
		}
		count, err := checkout.DeleteExpiredPrivateObjects(ctx, pool, *workspace, *realm)
		if err != nil {
			return err
		}
		var remaining int
		if pool.QueryRow(ctx, "SELECT (SELECT count(*) FROM pg10_files WHERE workspace_id=$1::uuid AND environment=$2)+(SELECT count(*) FROM pg10_upload_intents WHERE workspace_id=$1::uuid AND environment=$2 AND committed_at IS NULL AND deleted_at IS NULL)", *workspace, *realm).Scan(&remaining) != nil {
			return errors.New("remaining inventory unconfirmed")
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "expired_current_objects_deleted", "deleted_count": count, "remaining_objects": remaining, "complete_store_erasure_verified": false, "privacy_request_complete": false})
	}
	key, err := hex.DecodeString(os.Getenv("BRIOFOLD_PRIVACY_EXPORT_KEY_HEX"))
	if err != nil || len(key) != 32 || *output == "" {
		return errors.New("export key/output required")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(*output)
		}
	}()
	sum := sha256.New()
	writer := io.MultiWriter(file, sum)
	if _, err = io.WriteString(writer, "EKMOBJ1\n"); err != nil {
		return err
	}
	encoder := json.NewEncoder(writer)
	var archiveBytes int64
	emit := func(value any) error {
		raw, err := json.Marshal(value)
		if err != nil {
			return err
		}
		archiveBytes += int64((len(raw)+gcm.Overhead())*4/3 + 256)
		if archiveBytes > 512*1024*1024 {
			return errors.New("archive size limit exceeded; export incomplete")
		}
		nonce := make([]byte, gcm.NonceSize())
		if _, err = rand.Read(nonce); err != nil {
			return err
		}
		return encoder.Encode(map[string][]byte{"nonce": nonce, "ciphertext": gcm.Seal(nil, nonce, raw, []byte("EKMOBJ1|"+*request+"|"+*workspace+"|"+*realm))})
	}
	if err = emit(map[string]string{"request_id": *request, "workspace_id": *workspace, "environment": *realm, "observed_at": time.Now().UTC().Format(time.RFC3339)}); err != nil {
		return err
	}
	count, err := checkout.ExportPrivateObjects(ctx, pool, *workspace, *realm, func(item checkout.PrivacyObject) error { return emit(item) })
	if err != nil {
		return err
	}
	if err = emit(map[string]any{"complete_inventory": true, "object_count": count}); err != nil {
		return err
	}
	if err = file.Sync(); err != nil {
		return err
	}
	complete = true
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "encrypted_private_objects_exported", "object_count": count, "sha256": hex.EncodeToString(sum.Sum(nil)), "privacy_request_complete": false})
}
