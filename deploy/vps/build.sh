#!/usr/bin/env bash
# Builds the API binary with the pinned Go image and stages a release folder.
# Does NOT touch the running service. Run from /opt/briofold/rename-release.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"          # repo root (the cloned src/)
stage="$(dirname "$root")"                            # /opt/briofold/rename-release
cd "$stage"
printf 'src\n' > .dockerignore
sudo docker run --rm -e CGO_ENABLED=0 -v "$root/backend":/src -v "$stage":/out -w /src golang:1.27.0-alpine \
  sh -c 'go build ./... && go test ./internal/envcompat && go build -o /out/briofold-rename-api ./cmd/api'
printf 'FROM briofold-api:meta-preview\nCOPY briofold-rename-api /api\n' > Dockerfile
echo BUILD-OK
