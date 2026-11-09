package checkout

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
)

// Test seeding only (tools/testing): gives catalog products that have no image one generated PNG, stored exactly like
// an owner upload: private object storage, a commerce_media row, the product's image list and the photo-search index.
// Nothing is written when private storage is not configured, so a seeded shop never shows broken images.

var seedPutObject = objectRequest

// seedProductPNG draws a 320x320 swatch: a base colour, a diagonal band and a block whose position depends on the
// product, so every product gets a different photo signature and photo search can tell them apart.
func seedProductPNG(seed string) ([]byte, error) {
	h := sha256.Sum256([]byte(seed))
	base := color.RGBA{h[0], h[1], h[2], 255}
	band := color.RGBA{255 - h[0], h[3], 255 - h[2], 255}
	block := color.RGBA{h[4], 255 - h[5], h[6], 255}
	img := image.NewRGBA(image.Rect(0, 0, 320, 320))
	bx, by := int(h[7])%200, int(h[8])%200
	for y := 0; y < 320; y++ {
		for x := 0; x < 320; x++ {
			c := base
			if d := x - y + int(h[9])%120 - 60; d > -40 && d < 40 {
				c = band
			}
			if x >= bx && x < bx+120 && y >= by && y < by+120 {
				c = block
			}
			img.Set(x, y, c)
		}
	}
	var out bytes.Buffer
	err := png.Encode(&out, img)
	return out.Bytes(), err
}

// SeedCatalogImages returns how many products received an image. db must be an administrative control connection to
// a test database; actor must be an owner/admin of the workspace (the photo index re-checks it).
func SeedCatalogImages(ctx context.Context, db *sql.DB, ws, realm, actor, namePrefix string) (int, error) {
	if realm != "live" && realm != "sandbox" {
		return 0, errors.New("invalid environment")
	}
	rows, err := db.QueryContext(ctx, `SELECT id::text,name FROM commerce_products
		WHERE workspace_id=$1::uuid AND environment=$2 AND cardinality(images)=0 AND name LIKE $3 ORDER BY name LIMIT 200`, ws, realm, namePrefix+"%")
	if err != nil {
		return 0, err
	}
	type product struct{ id, name string }
	var todo []product
	for rows.Next() {
		var p product
		if err := rows.Scan(&p.id, &p.name); err != nil {
			rows.Close()
			return 0, err
		}
		todo = append(todo, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	done := 0
	for _, p := range todo {
		data, err := seedProductPNG(ws + "|" + p.id)
		if err != nil {
			return done, err
		}
		sum := sha256.Sum256(data)
		hash := hex.EncodeToString(sum[:])
		mediaID := newUUID()
		key := "commerce/" + realm + "/" + ws + "/" + mediaID + "/" + hash
		if _, err := seedPutObject(ctx, "PUT", key, data); err != nil {
			return done, fmt.Errorf("store image: %w", err)
		}
		sig, err := productPhotoFeatures(data)
		if err != nil {
			return done, err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return done, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO commerce_media(id,workspace_id,environment,object_key,mime,name,sha256) VALUES($1::uuid,$2::uuid,$3,$4,'image/png',$5,$6)`,
			mediaID, ws, realm, key, "seed-"+p.id[:8]+".png", hash)
		if err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE commerce_products SET images=array_append(images,$1::uuid) WHERE id=$2::uuid AND cardinality(images)=0`, mediaID, p.id)
		}
		if err == nil {
			var indexed bool
			err = tx.QueryRowContext(ctx, `SELECT commerce_photo_index($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb)`, ws, realm, actor, mediaID, hash, sig.Hash, photoColorsJSON(sig)).Scan(&indexed)
		}
		if err != nil {
			_ = tx.Rollback()
			return done, err
		}
		if err := tx.Commit(); err != nil {
			return done, err
		}
		done++
	}
	return done, nil
}
