#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.nvm/current/bin:$PATH"

LOG_DIR="$ROOT_DIR/logs"
RUNTIME_DIR="$ROOT_DIR/.customer-runtime"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
START_LOG="$LOG_DIR/startup.log"
API_PID_FILE="$RUNTIME_DIR/api.pid"
WEB_PID_FILE="$RUNTIME_DIR/web.pid"
API_OWNER_RECORD_FILE="$RUNTIME_DIR/api.command"
WEB_OWNER_RECORD_FILE="$RUNTIME_DIR/web.command"
WEB_BUILD_FINGERPRINT_FILE="$RUNTIME_DIR/web-build.fingerprint"
WEB_PORT=3000
PROCESS_OWNERSHIP_FD=9
LSOF_OWNER_FOUND=0
LSOF_NO_MATCH=1
LSOF_UNDETERMINED=2
API_STARTED_BY_THIS_LAUNCH=0
WEB_STARTED_BY_THIS_LAUNCH=0

mkdir -p "$LOG_DIR" "$RUNTIME_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

log() {
  printf "[%s] %s\n" "$(timestamp)" "$*" | tee -a "$START_LOG"
}

fail() {
  log "ERROR: $*"
  log "Open logs for details: $LOG_DIR"
  exit 1
}

cleanup_started_process() {
  local label="$1"
  local pid_file="$2"
  local owner_record_file="$3"
  local expected_cwd="$4"
  local pid

  pid="$(cat "$pid_file" 2>/dev/null)" || {
    log "ERROR: $label cleanup could not read $pid_file; ownership records were preserved."
    return 1
  }
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    log "ERROR: $label cleanup found an invalid PID record; ownership records were preserved."
    return 1
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    if ! remove_ownership_records "$pid_file" "$owner_record_file"; then
      log "ERROR: $label cleanup found invalid ownership records; they were preserved."
      return 1
    fi
    return 0
  fi
  if ! process_matches_expected "$pid" "$owner_record_file" "$expected_cwd"; then
    log "ERROR: $label PID $pid no longer matches this launch; it was not signaled and ownership records were preserved."
    return 1
  fi

  log "Startup failed; stopping $label PID $pid started by this launch..."
  if ! kill -TERM "$pid" >/dev/null 2>&1; then
    log "ERROR: TERM could not be sent to $label PID $pid; ownership records were preserved."
    return 1
  fi

  local deadline=$((SECONDS + 5))
  while kill -0 "$pid" >/dev/null 2>&1 && (( SECONDS < deadline )); do
    /bin/sleep 1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    log "ERROR: $label PID $pid is still running after TERM; ownership records were preserved for manual handling."
    return 1
  fi

  if ! remove_ownership_records "$pid_file" "$owner_record_file"; then
    log "ERROR: $label exited, but its ownership records could not be validated and were preserved."
    return 1
  fi
  log "$label PID $pid exited after TERM."
}

cleanup_on_failure() {
  local status="$?"
  local cleanup_status=0
  trap - EXIT

  if (( status == 0 )); then
    return 0
  fi
  if (( WEB_STARTED_BY_THIS_LAUNCH == 1 )); then
    cleanup_started_process "Web" "$WEB_PID_FILE" "$WEB_OWNER_RECORD_FILE" "$ROOT_DIR/apps/web" || cleanup_status=1
  fi
  if (( API_STARTED_BY_THIS_LAUNCH == 1 )); then
    cleanup_started_process "API" "$API_PID_FILE" "$API_OWNER_RECORD_FILE" "$ROOT_DIR" || cleanup_status=1
  fi
  if (( cleanup_status != 0 )); then
    log "ERROR: Startup cleanup is incomplete; use the preserved ownership records for manual handling."
  fi
  exit "$status"
}

trap cleanup_on_failure EXIT

command_exists() {
  command -v "$1" >/dev/null 2>&1
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

read_env_value() {
  local key="$1"
  local value first last
  value="$(awk -v key="$key" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2); found = 1 }
    END { if (found) printf "%s", value }
  ' "$ROOT_DIR/.env")"
  first="${value:0:1}"
  last="${value: -1}"
  if [[ "$first" == "\"" || "$first" == "'" || "$last" == "\"" || "$last" == "'" ]]; then
    if (( ${#value} < 2 )) || [[ "$first" != "$last" ]]; then
      fail "$key 配置的引号必须成对且类型一致；请修正项目 .env 后重新启动。" >&2
    fi
    value="${value:1:${#value}-2}"
  fi
  printf "%s" "$value"
}

is_positive_safe_integer() {
  local value="$1"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || return 1
  (( ${#value} < 16 )) && return 0
  (( ${#value} == 16 )) || return 1
  (( 10#$value <= 9007199254740991 ))
}

is_tcp_port() {
  local value="$1"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || return 1
  (( ${#value} <= 5 && 10#$value <= 65535 ))
}

is_canonical_base64_32_bytes() {
  local value="$1"
  [[ "$value" =~ ^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$ ]]
}

validate_customer_configuration() {
  [[ -f "$ROOT_DIR/.env" ]] || fail "项目根目录缺少 .env；请创建该文件并填写客户启动配置后重新启动。"

  DATABASE_URL="$(read_env_value DATABASE_URL)"
  JWT_SECRET="$(read_env_value JWT_SECRET)"
  WEB_ORIGIN="$(read_env_value WEB_ORIGIN)"
  API_PORT="$(read_env_value PORT)"
  NEXT_PUBLIC_API_BASE_URL="$(read_env_value NEXT_PUBLIC_API_BASE_URL)"
  COOKIE_SECURE="$(read_env_value COOKIE_SECURE)"
  PUBLIC_CREDENTIAL_THROTTLE_LIMIT="$(read_env_value PUBLIC_CREDENTIAL_THROTTLE_LIMIT)"
  PUBLIC_CREDENTIAL_THROTTLE_TTL_MS="$(read_env_value PUBLIC_CREDENTIAL_THROTTLE_TTL_MS)"
  DEFAULT_PATIENT_PASSWORD="$(read_env_value DEFAULT_PATIENT_PASSWORD)"
  SENSITIVE_DATA_KEY_REF="$(read_env_value SENSITIVE_DATA_KEY_REF)"
  SENSITIVE_DATA_KEY="$(read_env_value SENSITIVE_DATA_KEY)"
  POSTGRES_PASSWORD="$(read_env_value POSTGRES_PASSWORD)"

  ensure_not_placeholder "DATABASE_URL" "$DATABASE_URL"
  ensure_not_placeholder "JWT_SECRET" "$JWT_SECRET"
  ensure_not_placeholder "WEB_ORIGIN" "$WEB_ORIGIN"
  ensure_not_placeholder "PORT" "$API_PORT"
  ensure_not_placeholder "NEXT_PUBLIC_API_BASE_URL" "$NEXT_PUBLIC_API_BASE_URL"
  ensure_not_placeholder "DEFAULT_PATIENT_PASSWORD" "$DEFAULT_PATIENT_PASSWORD"

  is_tcp_port "$API_PORT" || \
    fail "PORT 配置无效；请填写 1 到 65535 之间的正整数，客户 Mac 通常使用 PORT=4000。"
  [[ "$API_PORT" != "$WEB_PORT" ]] || \
    fail "PORT 配置冲突；Web 固定使用 3000，API 请改用其他端口（通常为 4000）。"

  [[ "$COOKIE_SECURE" == "true" || "$COOKIE_SECURE" == "false" ]] || \
    fail "COOKIE_SECURE 配置无效；请在项目 .env 中精确填写 COOKIE_SECURE=true 或 COOKIE_SECURE=false（本地 HTTP 可填 false）。"

  is_positive_safe_integer "$PUBLIC_CREDENTIAL_THROTTLE_LIMIT" || \
    fail "PUBLIC_CREDENTIAL_THROTTLE_LIMIT 配置无效；请在项目 .env 中填写 base-10 正安全整数（1 到 9007199254740991）。"
  is_positive_safe_integer "$PUBLIC_CREDENTIAL_THROTTLE_TTL_MS" || \
    fail "PUBLIC_CREDENTIAL_THROTTLE_TTL_MS 配置无效；请在项目 .env 中填写 base-10 正安全整数（1 到 9007199254740991）。"

  [[ -n "$SENSITIVE_DATA_KEY_REF" && "$SENSITIVE_DATA_KEY_REF" != [[:space:]]* && "$SENSITIVE_DATA_KEY_REF" != *[[:space:]] ]] || \
    fail "SENSITIVE_DATA_KEY_REF 配置无效；请在项目 .env 中填写非空且没有首尾空格的精确密钥引用。"
  is_canonical_base64_32_bytes "$SENSITIVE_DATA_KEY" || \
    fail "SENSITIVE_DATA_KEY 配置无效；请在项目 .env 中填写 canonical base64 编码且解码后恰好为 32 bytes 的值。"
  [[ "$POSTGRES_PASSWORD" =~ [^[:space:]] ]] || \
    fail "POSTGRES_PASSWORD 配置无效，不得为空或纯空白；请在项目 .env 中显式填写数据库密码。"
  if (( ${#DEFAULT_PATIENT_PASSWORD} < 8 || ${#DEFAULT_PATIENT_PASSWORD} > 128 )); then
    fail "DEFAULT_PATIENT_PASSWORD 配置无效；初始患者密码长度必须在 8 到 128 位之间。"
  fi

  export DATABASE_URL
  export JWT_SECRET
  export WEB_ORIGIN
  export PORT="$API_PORT"
  export NEXT_PUBLIC_API_BASE_URL
  export COOKIE_SECURE
  export PUBLIC_CREDENTIAL_THROTTLE_LIMIT
  export PUBLIC_CREDENTIAL_THROTTLE_TTL_MS
  export DEFAULT_PATIENT_PASSWORD
  export SENSITIVE_DATA_KEY_REF
  export SENSITIVE_DATA_KEY
  export POSTGRES_PASSWORD
  export NEXT_TELEMETRY_DISABLED=1
}

port_listening() {
  local port="$1"
  query_port_owner "$port"
}

parse_unique_lsof_pid() {
  local output_file="$1"
  local byte_codes
  [[ -s "$output_file" ]] || return 1
  byte_codes="$(LC_ALL=C od -v -An -t u1 "$output_file")" || return 1
  if [[ "$byte_codes" =~ (^|[[:space:]])0([[:space:]]|$) ]]; then
    return 1
  fi
  [[ "$byte_codes" =~ (^|[[:space:]])10[[:space:]]*$ ]] || return 1
  awk '
    /^p[1-9][0-9]*$/ {
      if (pid_count != 0) {
        invalid = 1
        next
      }
      pid = substr($0, 2)
      pid_count = 1
      next
    }
    /^f(0|[1-9][0-9]*)$/ {
      if (pid_count != 1) invalid = 1
      fd_count += 1
      next
    }
    { invalid = 1 }
    END {
      if (invalid || pid_count != 1 || fd_count < 1) exit 1
      printf "%s", pid
    }
  ' "$output_file"
}

query_port_owner() {
  local port="$1"
  local output_file error_file lsof_status state owner_pid

  output_file="$(mktemp "$RUNTIME_DIR/lsof.stdout.XXXXXX")" || return "$LSOF_UNDETERMINED"
  if ! error_file="$(mktemp "$RUNTIME_DIR/lsof.stderr.XXXXXX")"; then
    rm -f "$output_file"
    return "$LSOF_UNDETERMINED"
  fi

  if (( $# == 1 )); then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN -Fp >"$output_file" 2>"$error_file"; then
      lsof_status=0
    else
      lsof_status=$?
    fi
  elif (( $# == 2 )); then
    local requested_pid="$2"
    if lsof -nP -a -p "$requested_pid" -iTCP:"$port" -sTCP:LISTEN -Fp >"$output_file" 2>"$error_file"; then
      lsof_status=0
    else
      lsof_status=$?
    fi
  else
    lsof_status="$LSOF_UNDETERMINED"
  fi

  state="$LSOF_UNDETERMINED"
  owner_pid=""
  if (( lsof_status == 1 )) && [[ ! -s "$output_file" && ! -s "$error_file" ]]; then
    state="$LSOF_NO_MATCH"
  elif (( lsof_status == 0 )) && [[ ! -s "$error_file" ]]; then
    if owner_pid="$(parse_unique_lsof_pid "$output_file")"; then
      state="$LSOF_OWNER_FOUND"
    fi
  fi

  if ! rm -f "$output_file" "$error_file"; then
    return "$LSOF_UNDETERMINED"
  fi
  if (( state == LSOF_OWNER_FOUND )); then
    printf '%s' "$owner_pid"
  fi
  return "$state"
}

process_owns_port() {
  local pid="$1"
  local port="$2"
  local owner_pid state
  if owner_pid="$(query_port_owner "$port" "$pid")"; then
    [[ "$owner_pid" == "$pid" ]] || return "$LSOF_UNDETERMINED"
    return "$LSOF_OWNER_FOUND"
  else
    state=$?
  fi
  return "$state"
}

ensure_port_available() {
  local port="$1"
  local label="$2"
  local owner_pid state
  if owner_pid="$(port_listening "$port")"; then
    fail "$label port $port is already in use; stop the listening process before launching."
  else
    state=$?
  fi
  if (( state == LSOF_NO_MATCH )); then
    return 0
  fi
  fail "$label port $port ownership could not be determined because lsof failed or returned malformed output."
}

wait_for_owned_port() {
  local port="$1"
  local label="$2"
  local pid_file="$3"
  local owner_record_file="$4"
  local expected_cwd="$5"
  local pid
  if ! pid="$(cat "$pid_file" 2>/dev/null)"; then
    fail "$label PID record could not be read."
  fi
  [[ "$pid" =~ ^[0-9]+$ ]] || fail "$label PID record was not created."

  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      fail "$label process PID $pid exited before startup completed. See its log for details."
    fi
    if ! process_matches_expected "$pid" "$owner_record_file" "$expected_cwd"; then
      fail "$label process PID $pid does not match the ownership record created by this launch."
    fi
    local owner_pid state
    if owner_pid="$(port_listening "$port")"; then
      if [[ "$owner_pid" != "$pid" ]]; then
        fail "$label port $port became occupied by a process not owned by this launch."
      fi
      if process_owns_port "$pid" "$port"; then
        return 0
      else
        state=$?
      fi
      if (( state == LSOF_UNDETERMINED )); then
        fail "$label port $port ownership could not be determined because lsof failed or returned malformed output."
      fi
      fail "$label port $port became occupied by a process not owned by this launch."
    else
      state=$?
    fi
    if (( state == LSOF_UNDETERMINED )); then
      fail "$label port $port ownership could not be determined because lsof failed or returned malformed output."
    fi
    sleep 1
  done
  fail "$label process PID $pid did not listen on port $port within 60 seconds."
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local port="$3"
  local pid_file="$4"
  local owner_record_file="$5"
  local expected_cwd="$6"
  local pid
  if ! pid="$(cat "$pid_file" 2>/dev/null)"; then
    fail "$label PID record could not be read."
  fi
  [[ "$pid" =~ ^[0-9]+$ ]] || fail "$label PID record is missing."

  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      fail "$label process PID $pid exited before startup completed. See its log for details."
    fi
    if ! process_matches_expected "$pid" "$owner_record_file" "$expected_cwd"; then
      fail "$label process PID $pid no longer owns port $port."
    fi
    local state
    if process_owns_port "$pid" "$port"; then
      :
    else
      state=$?
      if (( state == LSOF_UNDETERMINED )); then
        fail "$label port $port ownership could not be determined because lsof failed or returned malformed output."
      fi
      fail "$label process PID $pid no longer owns port $port."
    fi
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  fail "$label did not respond at $url within 60 seconds."
}

ensure_not_placeholder() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" || "$value" == *"<"* || "$value" == *">"* ]]; then
    fail "$key 配置缺失、为空或仍是占位值；请在项目 .env 中填写真实值后重新启动。"
  fi
}

start_process() {
  local name="$1"
  local pid_file="$2"
  local owner_record_file="$3"
  local log_file="$4"
  local expected_cwd="$5"
  shift 5

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    if ! existing_pid="$(cat "$pid_file" 2>/dev/null)"; then
      fail "$name PID record could not be read; ownership records were preserved for manual handling."
    fi
    if [[ ! "$existing_pid" =~ ^[0-9]+$ ]]; then
      fail "$name PID record is invalid; ownership records were preserved for manual handling."
    fi
    if kill -0 "$existing_pid" >/dev/null 2>&1; then
      if process_matches_expected "$existing_pid" "$owner_record_file" "$expected_cwd"; then
        fail "$name recorded PID $existing_pid is still running; stop it before launching."
      fi
      fail "$name recorded PID $existing_pid is active but ownership does not match this project; records were preserved for manual handling."
    fi
    remove_ownership_records "$pid_file" "$owner_record_file" || \
      fail "$name stale ownership records are invalid; they were preserved for manual handling."
  elif [[ -e "$owner_record_file" ]]; then
    fail "$name ownership record exists without a PID record; it was preserved for manual handling."
  fi

  log "Starting $name. Log: $log_file"
  : > "$log_file"
  local owner_file
  if ! owner_file="$(mktemp "$owner_record_file.owner.XXXXXX")"; then
    fail "$name ownership file could not be created."
  fi
  if ! printf '%s\n' "$expected_cwd" > "$owner_file" || ! printf '%s\n' "$owner_file" > "$owner_record_file"; then
    rm -f "$owner_file" "$owner_record_file"
    fail "$name ownership records could not be written."
  fi
  nohup /bin/bash -c '
    expected_cwd="$1"
    owner_file="$2"
    shift 2
    cd "$expected_cwd" || exit 125
    exec 9<"$owner_file" || exit 126
    exec "$@"
  ' customer-launcher-process "$expected_cwd" "$owner_file" "$@" >>"$log_file" 2>&1 < /dev/null &
  local pid="$!"
  printf "%s" "$pid" > "$pid_file"
  if [[ "$name" == "API" ]]; then
    API_STARTED_BY_THIS_LAUNCH=1
  elif [[ "$name" == "Web" ]]; then
    WEB_STARTED_BY_THIS_LAUNCH=1
  fi
  log "$name PID: $pid"
}

hash_if_exists() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  shasum -a 256 "$file" | awk '{print $1}'
}

web_build_fingerprint() {
  local web_package_hash lockfile_hash web_config_hashes web_source_hashes
  web_package_hash="$(hash_if_exists "$ROOT_DIR/apps/web/package.json")" || return 1
  lockfile_hash="$(hash_if_exists "$ROOT_DIR/pnpm-lock.yaml")" || return 1
  web_config_hashes="$(
    find "$ROOT_DIR/apps/web" -maxdepth 1 -type f \( -name '*config.*' -o -name 'tsconfig.json' \) -print0 |
      sort -z |
      xargs -0 shasum -a 256
  )" || return 1
  web_source_hashes="$(
    find "$ROOT_DIR/apps/web/src" "$ROOT_DIR/apps/web/public" -type f \
      ! -path "$ROOT_DIR/apps/web/public/unity/rhythm_reach_3d/Build/*" \
      ! -path "$ROOT_DIR/apps/web/public/unity/rhythm_reach_3d/StreamingAssets/*" \
      -print0 |
      sort -z |
      xargs -0 shasum -a 256
  )" || return 1

  {
    printf "NEXT_PUBLIC_API_BASE_URL=%s\n" "$NEXT_PUBLIC_API_BASE_URL"
    printf "WEB_PACKAGE=%s\n" "$web_package_hash"
    printf "LOCKFILE=%s\n" "$lockfile_hash"
    printf "WEB_CONFIGS=%s\n" "$web_config_hashes"
    printf "WEB_SOURCE=%s\n" "$web_source_hashes"
  } | shasum -a 256 | awk '{print $1}'
}

validate_customer_configuration

log "Starting Rehabilitation Platform from $ROOT_DIR"

command_exists docker || fail "Docker is not installed or not in PATH."
command_exists pnpm || fail "pnpm is not installed or not in PATH."
command_exists node || fail "Node.js is not installed or not in PATH."
command_exists curl || fail "curl is not installed or not in PATH."
command_exists lsof || fail "lsof is not installed or not in PATH."

docker info >/dev/null 2>&1 || \
  fail "Docker Desktop 未运行；请先手动启动 Docker Desktop 后重新运行。"

if ! docker image inspect postgres:18 >/dev/null 2>&1; then
  fail "Docker image postgres:18 is missing. Import the offline Docker image bundle first."
fi
log "Starting Postgres..."
pnpm infra:up >>"$START_LOG" 2>&1

log "Waiting for Docker health checks..."
deadline=$((SECONDS + 90))
postgres_status=""
while (( SECONDS < deadline )); do
  if ! postgres_status="$(docker inspect -f '{{.State.Health.Status}}' rehab-platform-postgres 2>/dev/null)"; then
    fail "Postgres health status could not be read from Docker."
  fi
  if [[ "$postgres_status" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$postgres_status" == "healthy" ]] || fail "Postgres is not healthy."

log "Generating Prisma client..."
pnpm db:generate >>"$START_LOG" 2>&1

log "Applying database migrations..."
if ! pnpm db:migrate:deploy >>"$START_LOG" 2>&1; then
  fail "数据库迁移失败；请检查 $START_LOG，修复迁移问题后重新启动。"
fi

log "Building API from current source..."
if ! pnpm --filter @rehab-platform/api build >>"$START_LOG" 2>&1; then
  fail "API build failed. See $START_LOG for details."
fi
[[ -f "$ROOT_DIR/apps/api/dist/main.js" ]] || fail "API build completed without apps/api/dist/main.js."

if ! WEB_BUILD_FINGERPRINT="$(web_build_fingerprint)"; then
  fail "Web fingerprint 生成失败；请检查 Web 源文件和哈希命令后重新启动。"
fi
EXISTING_WEB_BUILD_FINGERPRINT=""
if [[ -e "$WEB_BUILD_FINGERPRINT_FILE" ]]; then
  if ! EXISTING_WEB_BUILD_FINGERPRINT="$(cat "$WEB_BUILD_FINGERPRINT_FILE")"; then
    fail "Web fingerprint 读取失败；请修复 $WEB_BUILD_FINGERPRINT_FILE 的读取权限后重新启动。"
  fi
fi
if [[ ! -f "$ROOT_DIR/apps/web/.next/BUILD_ID" || "$EXISTING_WEB_BUILD_FINGERPRINT" != "$WEB_BUILD_FINGERPRINT" ]]; then
  log "Web build output missing or stale. Building Web..."
  if ! pnpm --filter @rehab-platform/web build >>"$START_LOG" 2>&1; then
    fail "Web build failed. See $START_LOG for details."
  fi
  [[ -f "$ROOT_DIR/apps/web/.next/BUILD_ID" ]] || fail "Web build completed without apps/web/.next/BUILD_ID."
  printf "%s" "$WEB_BUILD_FINGERPRINT" > "$WEB_BUILD_FINGERPRINT_FILE"
fi

ensure_port_available "$API_PORT" "API"
ensure_port_available "$WEB_PORT" "Web"

start_process "API" "$API_PID_FILE" "$API_OWNER_RECORD_FILE" "$API_LOG" "$ROOT_DIR" node "$ROOT_DIR/apps/api/dist/main.js"
wait_for_owned_port "$API_PORT" "API" "$API_PID_FILE" "$API_OWNER_RECORD_FILE" "$ROOT_DIR"
wait_for_http "http://localhost:${API_PORT}/health/live" "API health" "$API_PORT" "$API_PID_FILE" "$API_OWNER_RECORD_FILE" "$ROOT_DIR"

WEB_NEXT_BIN="$ROOT_DIR/apps/web/node_modules/.bin/next"
[[ -x "$WEB_NEXT_BIN" ]] || fail "Web start executable is missing: $WEB_NEXT_BIN"
start_process "Web" "$WEB_PID_FILE" "$WEB_OWNER_RECORD_FILE" "$WEB_LOG" "$ROOT_DIR/apps/web" "$WEB_NEXT_BIN" start --hostname 0.0.0.0 --port "$WEB_PORT"
wait_for_owned_port "$WEB_PORT" "Web" "$WEB_PID_FILE" "$WEB_OWNER_RECORD_FILE" "$ROOT_DIR/apps/web"
wait_for_http "http://localhost:${WEB_PORT}" "Web" "$WEB_PORT" "$WEB_PID_FILE" "$WEB_OWNER_RECORD_FILE" "$ROOT_DIR/apps/web"

if ! open "http://localhost:${WEB_PORT}" >/dev/null 2>&1; then
  fail "浏览器打开失败；本次启动的应用进程已进入清理流程，请处理后重新启动。"
fi

log "Startup complete."
log "Web URL: http://localhost:${WEB_PORT}"
log "API health: http://localhost:${API_PORT}/health/live"
log "Logs: $LOG_DIR"
