#!/usr/bin/env bash
set -euo pipefail

SCHEDULE="${CHROMA_BACKUP_CRON:-0 3 * * *}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-chroma.sh"
LOG_FILE="${CHROMA_BACKUP_LOG:-/tmp/chroma-backup.log}"

cron_line="${SCHEDULE} ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab is not available on this system." >&2
  exit 1
fi

(crontab -l 2>/dev/null | grep -vF "$BACKUP_SCRIPT"; echo "$cron_line") | crontab -
echo "Cron backup installed: ${cron_line}"
