#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$ROOT_DIR/scripts/start-customer-mac.sh"

printf "\n康复平台启动流程结束。可以关闭这个窗口，服务窗口已在后台运行。\n"
printf "访问地址：http://localhost:3000\n"
printf "日志目录：%s/logs\n" "$ROOT_DIR"
read -r -p "按回车关闭窗口..."
