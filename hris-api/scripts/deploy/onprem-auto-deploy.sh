#!/usr/bin/env bash
set -euo pipefail

DEPLOY_BRANCH="${1:-${DEPLOY_BRANCH:-develop}}"
DEPLOY_SHA="${2:-${DEPLOY_SHA:-}}"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REPO_ROOT="$(git rev-parse --show-toplevel)"
  USE_GIT_REPO="true"
else
  REPO_ROOT="$(pwd)"
  USE_GIT_REPO="false"
fi

cd "$REPO_ROOT"

echo "Starting on-prem deploy"
echo "Repository: $REPO_ROOT"
echo "Branch: $DEPLOY_BRANCH"
if [ "$USE_GIT_REPO" != "true" ]; then
  echo "Git metadata not found. Running in source snapshot mode."
fi

if [ ! -f ".env" ]; then
  echo "Missing .env in repo root ($REPO_ROOT/.env). Aborting."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ "$USE_GIT_REPO" = "true" ]; then
  git fetch --prune origin

  if git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH"; then
    git checkout "$DEPLOY_BRANCH"
  else
    git checkout -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
  fi

  git pull --ff-only origin "$DEPLOY_BRANCH"

  if [ -n "$DEPLOY_SHA" ] && ! git merge-base --is-ancestor "$DEPLOY_SHA" HEAD; then
    echo "Warning: deployed HEAD does not include triggering SHA $DEPLOY_SHA."
  fi
else
  echo "Skipping git fetch/checkout/pull in snapshot mode."
fi

docker build -t hris-local-app:latest -f Dockerfile .

cd infrastructure/onprem

run_terraform() {
  if command -v terraform >/dev/null 2>&1; then
    terraform "$@"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Neither terraform nor docker is available on server."
    exit 1
  fi

  echo "terraform not found on host, using hashicorp/terraform container..."
  docker run --rm \
    -v "$PWD:/work" \
    -w /work \
    -v /var/run/docker.sock:/var/run/docker.sock \
    hashicorp/terraform:1.9.8 "$@"
}

pull_image_with_retry() {
  local image="$1"
  local attempts="${2:-5}"
  local delay_seconds="${3:-15}"
  local i

  for ((i=1; i<=attempts; i++)); do
    echo "Pulling image ${image} (attempt ${i}/${attempts})..."
    if docker pull "$image"; then
      echo "Pulled ${image} successfully."
      return 0
    fi
    if [ "$i" -lt "$attempts" ]; then
      echo "Pull failed for ${image}. Retrying in ${delay_seconds}s..."
      sleep "$delay_seconds"
    fi
  done

  echo "Failed to pull ${image} after ${attempts} attempts."
  return 1
}

run_terraform_apply_with_retry() {
  local attempts="${1:-3}"
  local delay_seconds="${2:-20}"
  local i

  for ((i=1; i<=attempts; i++)); do
    echo "Running terraform apply (attempt ${i}/${attempts})..."
    if run_terraform apply -auto-approve -input=false; then
      return 0
    fi
    if [ "$i" -lt "$attempts" ]; then
      echo "terraform apply failed. Retrying in ${delay_seconds}s..."
      sleep "$delay_seconds"
    fi
  done

  echo "terraform apply failed after ${attempts} attempts."
  return 1
}

# Pre-pull critical base images to reduce transient registry failures during terraform apply.
pull_image_with_retry "mongo:7.0.31"
pull_image_with_retry "redis:7.2-alpine"
pull_image_with_retry "minio/minio:latest"
pull_image_with_retry "minio/mc:latest"

run_terraform init -input=false
run_terraform_apply_with_retry

cd "$REPO_ROOT"

SYNC_ENABLED="${MONGO_SYNC_FROM_CLOUD:-false}"
if [ "$SYNC_ENABLED" = "true" ]; then
  if [ -z "${MONGO_CLOUD_DATABASE_URL:-}" ]; then
    echo "MONGO_SYNC_FROM_CLOUD=true but MONGO_CLOUD_DATABASE_URL is missing."
    exit 1
  fi

  SYNC_DB_NAME="${MONGO_SYNC_DB_NAME:-hris}"
  LOCAL_MONGO_URI="${MONGO_LOCAL_DATABASE_URL:-mongodb://root:rootpass@127.0.0.1:27018/${SYNC_DB_NAME}?authSource=admin&replicaSet=rs0}"

  echo "Syncing MongoDB from cloud to local DB '${SYNC_DB_NAME}'..."

  docker run --rm --network host \
    -e SRC_URI="$MONGO_CLOUD_DATABASE_URL" \
    -e DST_URI="$LOCAL_MONGO_URI" \
    -e DB_NAME="$SYNC_DB_NAME" \
    mongo:7 bash -lc '
      set -euo pipefail
      mongodump --uri "$SRC_URI" --db "$DB_NAME" --archive --gzip | \
        mongorestore --uri "$DST_URI" --archive --gzip --nsInclude "${DB_NAME}.*" --drop
    '

  echo "MongoDB cloud -> local sync completed."
else
  echo "MongoDB cloud sync skipped (set MONGO_SYNC_FROM_CLOUD=true in server .env to enable)."
fi

echo "On-prem deploy completed successfully."
