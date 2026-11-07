package checkout

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/masharzy/briofold/backend/internal/financial"
	"github.com/riverqueue/river"
	"log"
	"time"
)

func (s *Service) ConfigurePublicSandboxWorker(ctx context.Context, dsn, workspace string) error {
	if !s.pipelineReady() || !uuidPattern.MatchString(workspace) {
		return errors.New("public sandbox pipeline configuration required")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return errors.New("public sandbox worker connection invalid")
	}
	config.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return err
	}
	var ready bool
	err = pool.QueryRow(ctx, `SELECT environment='sandbox' AND pg_has_role(current_user,'ekmivo_financial_worker','member') AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AND to_regprocedure('pg60_receiver_read(uuid,uuid)') IS NOT NULL FROM financial_realm WHERE singleton`).Scan(&ready)
	if err != nil || !ready {
		pool.Close()
		return errors.New("restricted sandbox-only worker role required")
	}
	s.PublicSandboxWorker = pool
	loop, cancel := context.WithCancel(context.Background())
	s.PublicSandboxCancel = cancel
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-loop.Done():
				return
			case <-ticker.C:
				run, done := context.WithTimeout(loop, 12*time.Second)
				err := s.drainPublicSandbox(run, workspace)
				done()
				if err != nil && loop.Err() == nil {
					log.Print("public sandbox delivery sweep unresolved; retry scheduled")
				}
			}
		}
	}()
	return nil
}

func (s *Service) drainPublicSandbox(ctx context.Context, workspace string) error {
	if s.PublicSandboxWorker == nil {
		return errors.New("public sandbox delivery worker unavailable")
	}
	worker := financial.PipelineWorker{Pool: s.PublicSandboxWorker, Control: s.Pipeline.Control, Realm: "sandbox", EncryptionKey: s.Pipeline.Key, OnlyWorkspace: workspace}
	return worker.Work(ctx, &river.Job[financial.PipelineArgs]{Args: financial.PipelineArgs{Environment: "sandbox"}})
}
