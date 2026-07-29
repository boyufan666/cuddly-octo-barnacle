#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.nvm/current/bin:$PATH"

LOG_DIR="$ROOT_DIR/logs"
RUNTIME_DIR="$ROOT_DIR/.customer-runtime"
PROCESS_OWNERSHIP_FD=9
mkdir -p "$LOG_DIR" "$RUNTIME_DIR"

log() {
  printf "[%s] %s\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$LOG_DIR/stop.log"
}

read_ownership_file() {
  local owner_record_file="$1"
  local owner_file suffix
  [[ -f "$owner_record_file" ]] || return 1
  owner_file="$(awk 'NR == 1 { value = $0 } END { if (NR != 1 || value == "") exit 1; printf "%s", value }' "$owner_record_file" 2>/dev/null)" || return 1
  [[ "$owner_file" == "$owner_record_file.owner."* ]] || return 1
  suffix="${owner_file#"$owner_record_file.owner."}"
  [[ "$suffix" =~ ^[A-Za-z0-9]{6}$ && -f "$owner_file" ]] || return 1
  printf '%s' "$owner_file"
}

process_cwd() {
  local pid="$1"
  local output cwd
  output="$(lsof -nP -a -p "$pid" -d cwd -Fn 2>/dev/null)" || return 1
  cwd="$(printf '%s\n' "$output" | awk -v pid="$pid" '
    $0 == "p" pid { pid_count += 1; next }
    $0 == "fcwd" { fd_count += 1; next }
    index($0, "n") == 1 { cwd = substr($0, 2); cwd_count += 1; next }
    { invalid = 1 }
    END {
      if (invalid || pid_count != 1 || fd_count != 1 || cwd_count != 1 || NR != 3) exit 1
      printf "%s", cwd
    }
  ')" || return 1
  [[ -n "$cwd" ]] || return 1
  printf '%s' "$cwd"
}

process_holds_ownership_fd() {
  local pid="$1"
  local owner_file="$2"
  local output
  output="$(lsof -nP -a -p "$pid" -d "$PROCESS_OWNERSHIP_FD" -F pfn 2>/dev/null)" || return 1
  printf '%s\n' "$output" | awk -v pid="$pid" -v fd="$PROCESS_OWNERSHIP_FD" -v owner_file="$owner_file" '
    $0 == "p" pid { pid_count += 1; next }
    $0 == "f" fd { fd_count += 1; next }
    $0 == "n" owner_file { owner_count += 1; next }
    { invalid = 1 }
    END { exit !(invalid == 0 && pid_count == 1 && fd_count == 1 && owner_count == 1 && NR == 3) }
  '
}

process_matches_expected() {
  local pid="$1"
  local owner_record_file="$2"
  local expected_cwd="$3"
  local owner_file actual_cwd
  owner_file="$(read_ownership_file "$owner_record_file")" || return 1
  actual_cwd="$(process_cwd "$pid")" || return 1
  [[ "$actual_cwd" == "$expected_cwd" ]] || return 1
  process_holds_ownership_fd "$pid" "$owner_file"
}

remove_ownership_records() {
  local pid_file="$1"
  local owner_record_file="$2"
  local owner_file
  owner_file="$(read_ownership_file "$owner_record_file")" || return 1
  rm -f "$pid_file" "$owner_record_file" "$owner_file"
}

stop_pid_file() {
  local label="$1"
  local pid_file="$2"
  local owner_record_file="$3"
  local expected_cwd="$4"
  if [[ ! -f "$pid_file" ]]; then
    log "$label PID file not found; skipping."
    return 0
  fi

  local pid
  if ! pid="$(cat "$pid_file" 2>/dev/null)"; then
    log "$label PID record could not be read; ownership records were preserved for manual handling."
    return 1
  fi
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    log "$label PID record is invalid; ownership records were preserved for manual handling."
    return 1
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    if ! process_matches_expected "$pid" "$owner_record_file" "$expected_cwd"; then
      log "$label PID $pid exists but does not match this project; not stopping it."
      log "$label ownership records were preserved for manual handling."
      return 1
    fi
    log "Stopping $label PID $pid..."
    if ! kill -TERM "$pid" >/dev/null 2>&1; then
      log "TERM could not be sent to $label PID $pid; ownership records were preserved for manual handling."
      return 1
    fi
    local deadline=$((SECONDS + 3))
    while kill -0 "$pid" >/dev/null 2>&1 && (( SECONDS < deadline )); do
      /bin/sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      log "$label PID $pid is still running after TERM; ownership records were preserved for manual handling."
      return 1
    fi
  else
    log "$label PID $pid is not running."
  fi
  if ! remove_ownership_records "$pid_file" "$owner_record_file"; then
    log "$label ownership records could not be validated; they were preserved for manual handling."
    return 1
  fi
  return 0
}

stop_status=0
stop_pid_file "Web" "$RUNTIME_DIR/web.pid" "$RUNTIME_DIR/web.command" "$ROOT_DIR/apps/web" || stop_status=1
stop_pid_file "API" "$RUNTIME_DIR/api.pid" "$RUNTIME_DIR/api.command" "$ROOT_DIR" || stop_status=1

if (( stop_status != 0 )); then
  log "ERROR: Some application processes could not be confirmed stopped; ownership records were preserved for manual handling."
  exit 1
fi

log "Application processes stopped. Docker Postgres is left running to protect data."
log "To stop Docker services manually without deleting data: pnpm infra:down"
