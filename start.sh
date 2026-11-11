#!/usr/bin/env bash
# 启动英文点读服务（默认 http://127.0.0.1:7610）
set -e
cd "$(dirname "$0")"
PORT="${PORT:-7610}" exec node server.js
