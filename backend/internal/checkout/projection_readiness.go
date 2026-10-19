package checkout

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

// Run once normally. Only the explicit missing-registry signal may initialize
// the authorized workspace and retry the fully rolled-back transaction once.
// Permission, subscription, and general database errors must never trigger it.
func withProjectionRepair(ctx context.Context, ws, realm string, run func() error, repair func(context.Context, string, string) error) error {
	err := run()
	var pg *pgconn.PgError
	if !errors.As(err, &pg) || pg.Code != "P0401" || repair == nil {
		return err
	}
	bounded, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if repair(bounded, ws, realm) != nil {
		return &pgconn.PgError{Code: "P0401", Message: "workspace initialization pending"}
	}
	return run()
}
