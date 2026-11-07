// Standalone entry point; the API uses the identical shared worker runtime.
package main

import (
	_ "github.com/masharzy/briofold/backend/internal/envcompat"
	"context"
	"github.com/masharzy/briofold/backend/internal/workerruntime"
	"log"
	"os"
	"os/signal"
	"syscall"
)

type AuditWorker = workerruntime.AuditWorker

func validateWorkerRole(name, realm string) error {
	return workerruntime.ValidateWorkerRole(name, realm)
}
func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := workerruntime.Run(ctx, workerruntime.Config{Realm: os.Getenv("BRIOFOLD_WORKER_ENVIRONMENT"), DatabaseURL: os.Getenv("FINANCIAL_WORKER_DATABASE_URL"), ControlURL: os.Getenv("PG04_WORKER_CONTROL_PROJECTION_URL")}); err != nil {
		log.Fatal(err)
	}
}
