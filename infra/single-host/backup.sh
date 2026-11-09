#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_dir=/opt/rehab/shared/backups
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/rehab-$stamp.dump"
docker compose -f /opt/rehab/current/infra/single-host/compose.yaml exec -T postgres \
  pg_dump -U rehab -d rehab_platform -Fc > "$archive.partial"
test -s "$archive.partial"
mv "$archive.partial" "$archive"
sha256sum "$archive" > "$archive.sha256"
find "$backup_dir" -maxdepth 1 -name 'rehab-*.dump*' -type f -mtime +7 -delete
echo "Database backup completed: $archive"
