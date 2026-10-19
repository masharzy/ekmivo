package workerruntime

import (
	"context"
	"errors"
	"golang.org/x/sync/singleflight"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/ekmivo/backend/internal/financial"
)

type ProjectionConfig struct{ Control, Sandbox, Live string }

// Projection writes use dedicated provisioners, never queue workers or API readers.
func HostedProjectionConfig(env func(string) string) (*ProjectionConfig, error) {
	if env("API_BACKGROUND_PROJECTION_ENABLED") != "true" {
		return nil, nil
	}
	c := &ProjectionConfig{env("PG04_WORKER_CONTROL_PROJECTION_URL"), env("PG04_PROVISIONER_SANDBOX_URL"), env("PG04_PROVISIONER_LIVE_URL")}
	for _, item := range []struct{ dsn, role string }{{c.Control, "ekmivo_financial_projection_operator"}, {c.Sandbox, "ekmivo_financial_provisioner_sandbox"}, {c.Live, "ekmivo_financial_provisioner_live"}} {
		u, e := url.Parse(item.dsn)
		if e != nil || u == nil || u.User == nil || u.User.Username() != item.role || u.Host == "" || u.Path == "" {
			return nil, errors.New("restricted hosted projection credentials required")
		}
	}
	if financial.ValidateFinanceSeparation(c.Control, c.Sandbox, c.Live) != nil {
		return nil, errors.New("independent hosted projection databases required")
	}
	return c, nil
}

func StartHostedProjection(ctx context.Context, c *ProjectionConfig) *sync.WaitGroup {
	group := &sync.WaitGroup{}
	if c == nil {
		return group
	}
	group.Add(1)
	go func() {
		defer group.Done()
		for ctx.Err() == nil {
			if err := RunProjection(ctx, *c); err != nil && ctx.Err() == nil {
				log.Print("API workspace projection unavailable; retrying")
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}()
	return group
}

// Reuses the existing authoritative coordinator and monotonic SQL upsert.
// No identity data is copied and phone authorization remains fail-closed.
func openProjection(ctx context.Context, c ProjectionConfig) (*financial.ProjectionCoordinator, func(), error) {
	pools := make([]*pgxpool.Pool, 0, 3)
	closePools := func() {
		for _, p := range pools {
			p.Close()
		}
	}
	for _, dsn := range []string{c.Control, c.Sandbox, c.Live} {
		cfg, e := pgxpool.ParseConfig(dsn)
		if e != nil {
			closePools()
			return nil, nil, errors.New("projection connection unavailable")
		}
		cfg.MaxConns = 2
		cfg.MinConns = 0
		cfg.MaxConnIdleTime = time.Minute
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second
		p, e := pgxpool.NewWithConfig(ctx, cfg)
		if e != nil {
			closePools()
			return nil, nil, errors.New("projection connection unavailable")
		}
		pools = append(pools, p)
	}
	probe, done := context.WithTimeout(ctx, 15*time.Second)
	err := verifyControlProjection(probe, pools[0])
	if err == nil {
		for i, realm := range []string{"sandbox", "live"} {
			var actual, actor string
			var privileged, member, permitted bool
			// Provisioners intentionally cannot SELECT the registry/realm tables.
			// SQL financial_sync_workspace itself enforces the physical realm.
			e := pools[i+1].QueryRow(probe, `SELECT current_database(),current_user,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),pg_has_role(current_user,'ekmivo_financial_provisioner','member'),has_function_privilege(current_user,'financial_sync_workspace(uuid,text,bigint,boolean)','EXECUTE')`).Scan(&actual, &actor, &privileged, &member, &permitted)
			if e != nil || actual != "ekmivo_"+realm+"_financial" || actor != "ekmivo_financial_provisioner_"+realm || privileged || !member || !permitted {
				err = errors.New("restricted realm projection provisioner required")
				break
			}
		}
	}
	done()
	if err != nil {
		closePools()
		return nil, nil, errors.New("projection preflight rejected")
	}
	co := &financial.ProjectionCoordinator{Control: pools[0], Sandbox: pools[1], Live: pools[2]}
	return co, closePools, nil
}

// NewProjectionRepair uses the same restricted provisioners as the reconciler.
// It repairs only a missing projection; it never grants workspace membership or a plan.
func NewProjectionRepair(ctx context.Context, c *ProjectionConfig) (func(context.Context, string, string) error, func(), error) {
	if c == nil {
		return nil, func() {}, nil
	}
	co, closePools, err := openProjection(ctx, *c)
	if err != nil {
		return nil, func() {}, err
	}
	var group singleflight.Group
	repair := func(ctx context.Context, ws, realm string) error {
		result := group.DoChan(ws+"|"+realm, func() (any, error) {
			_, active, e := co.Sync(ctx, ws, realm)
			if e != nil {
				return nil, e
			}
			if !active {
				return nil, financial.ErrStaleProjection
			}
			return nil, nil
		})
		select {
		case <-ctx.Done():
			return ctx.Err()
		case r := <-result:
			return r.Err
		}
	}
	return repair, closePools, nil
}

func RunProjection(ctx context.Context, c ProjectionConfig) error {
	co, closePools, err := openProjection(ctx, c)
	if err != nil {
		return err
	}
	defer closePools()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	log.Print("API authoritative workspace projection reconciler active")
	for ctx.Err() == nil {
		iteration, cancel := context.WithTimeout(ctx, 15*time.Second)
		n, e := co.SyncAll(iteration)
		cancel()
		if e != nil && ctx.Err() == nil {
			log.Print("API workspace projection reconciliation incomplete; retrying")
		} else if e == nil {
			log.Printf("API workspace projection reconciled %d tenant/realm records", n)
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
	return nil
}
