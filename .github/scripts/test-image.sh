#!/usr/bin/env bash
set -euo pipefail

image="${1:?Pass the locally loaded image tag}"
container=wedding-image-smoke
volume="wedding-image-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A named volume is initialized with /data's non-root ownership from the image.
docker volume create "$volume" >/dev/null

start_container() {
  docker run --detach --name "$container" \
    --publish 127.0.0.1:3001:3001 \
    --mount "type=volume,src=$volume,dst=/data" \
    --env ALLOWED_ORIGINS=http://localhost:3001 \
    --env PUBLIC_BASE_URL=http://localhost:3001/ \
    "$image" >/dev/null
  curl --fail --silent --show-error --retry 20 --retry-all-errors \
    --retry-delay 1 --max-time 3 http://127.0.0.1:3001/health/ready
}

test "$(docker image inspect "$image" --format '{{.Architecture}}')" = arm64
start_container
docker cp server/guests.example.csv "$container":/data/guests.csv
docker exec "$container" node dist-server/cli.js import /data/guests.csv --links /data/links.csv
docker exec --interactive --env SMOKE_MODE=save "$container" node --input-type=module < .github/scripts/smoke-image.mjs

# Replacing, rather than merely restarting, proves the database lives on the volume.
docker stop "$container" >/dev/null
docker rm "$container" >/dev/null
start_container
docker exec --interactive --env SMOKE_MODE=verify "$container" node --input-type=module < .github/scripts/smoke-image.mjs
