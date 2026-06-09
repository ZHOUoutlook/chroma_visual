#!/usr/bin/env bash
set -euo pipefail

SOURCE="${CHROMA_DB_PATH:-/data/v_db}"
BACKUP_ROOT="${CHROMA_BACKUP_ROOT:-/data}"
PORT="${CHROMA_PORT:-1212}"
GRACE_SECONDS="${CHROMA_BACKUP_GRACE_SECONDS:-5}"
RETENTION_DAYS="${CHROMA_BACKUP_RETENTION_DAYS:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --backup-root)
      BACKUP_ROOT="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$SOURCE" ]]; then
  echo "Chroma source path does not exist: $SOURCE" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d_%H%M)"
source_name="$(basename "$SOURCE")"
dest="${BACKUP_ROOT}/${source_name}_backup_${timestamp}"
shutdown_url="http://localhost:${PORT}/api/v2/pre-flight-checks"

echo "Stopping Chroma on port ${PORT}..."
curl -fsS -X POST "$shutdown_url" >/dev/null 2>&1 || true
sleep "$GRACE_SECONDS"

echo "Backing up ${SOURCE} to ${dest}..."
cp -a "$SOURCE" "$dest"
echo "Backup saved to ${dest}"

if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name "${source_name}_backup_*" -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
fi

echo "Restarting Chroma..."
nohup chroma run --path "$SOURCE" --port "$PORT" >/tmp/chroma.log 2>&1 &
