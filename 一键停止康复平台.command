#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$ROOT_DIR/scripts/stop-customer-mac.sh"

printf "\n康复平台应用进程已停止。Docker 数据库没有删除，数据仍保留。\n"
read -r -p "按回车关闭窗口..."
